// Angebot oder Rechnung per E-Mail mit PDF-Anhang (Wunsch SETEC 16.11.2026).
//
//   POST { beleg_id, an, betreff, text, pdf?, pdf_name?, datenblaetter?: string[], nur_pruefen? }
//   → { ok: true, id, an }   bzw. mit nur_pruefen: { ok: true, probe: true, … } (nichts gesendet, nichts vermerkt)
//
// Nur der Chef (Benutzer-Token, Rolle aus profiles). Der Anhang:
//   · Rechnung (offen, bezahlt, Stornorechnung): IMMER das abgelegte Original
//     aus „beleg-archiv“ (<id>.pdf bzw. <id>-<archiv_stand>.pdf) — nie ein PDF
//     vom Gerät. Fehlt es, legt die App es vorher an (PDF-Knopf / Senden).
//   · Angebot (offen, angenommen): das PDF, das die App wie beim Herunterladen
//     erzeugt (base64 im Aufruf, ≤ 8 MB, muss mit %PDF beginnen).
//   · Datenblätter (nur Angebot): nur Pfade, die `angebot_datenblaetter` für
//     dieses Angebot freigibt (nie „intern“, „nach Auftrag“ erst bei Annahme).
// Absender RESEND_FROM (Standard noreply@handwerkapp.at, die bei Resend
// bestätigte Domain) mit dem Firmennamen, Antwort an = Firmen-Mail
// (firma.email). Vermerk: angebot_verlauf art 'gesendet' (name = Empfänger,
// text = Betreff). Drossel: 30 Mails je Stunde und Konto.
// Kunden-Lieferschein (16.11.2026): statt beleg_id `kunden_lieferschein_id` —
//   nur abgeschlossen (mit Nummer), das PDF kommt wie beim Angebot von der App;
//   Vermerk in kunden_lieferscheine.gesendet_an/gesendet_am.
// Secrets: RESEND_API_KEY, optional RESEND_FROM.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const MAX_PDF = 8 * 1024 * 1024;
const MAX_GESAMT = 30 * 1024 * 1024;

/** „a@b.at; c@d.at“ → Liste, höchstens 3; ungültig → null */
export function empfaengerLesen(roh: unknown): string[] | null {
  if (typeof roh !== "string") return null;
  const liste = [...new Set(roh.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
  if (!liste.length || liste.length > 3 || !liste.every((a) => MAIL.test(a))) return null;
  return liste;
}

const dateiname = (n: unknown, ersatz: string) => {
  const s = (typeof n === "string" ? n : "").replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 120);
  return s ? (/\.pdf$/i.test(s) ? s : `${s}.pdf`) : ersatz;
};

const escapen = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text → einfaches HTML: Absätze, Links antippbar */
export function textZuHtml(text: string): string {
  const mitLinks = escapen(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${mitLinks.replace(/\r?\n/g, "<br>")}</div>`;
}

const base64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const ausBase64 = (s: string) => Uint8Array.from(atob(s.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
const istPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);
  const dienst = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await dienst.auth.getUser(jwt);
    if (!user) return antwort({ error: "Bitte anmelden." }, 401);
    const { data: ich } = await dienst.from("profiles").select("rolle, aktiv").eq("id", user.id).maybeSingle();
    if (ich?.rolle !== "chef" || !ich.aktiv) return antwort({ error: "Angebote und Rechnungen verschickt nur der Chef." }, 403);

    let ein: Record<string, unknown>;
    try { ein = await req.json(); } catch { return antwort({ error: "Ungültiger Aufruf." }, 400); }
    const an = empfaengerLesen(ein.an);
    if (!an) return antwort({ error: "Bitte eine gültige E-Mail-Adresse eintragen (höchstens 3, mit Komma getrennt)." }, 400);
    const betreff = typeof ein.betreff === "string" ? ein.betreff.replace(/[\r\n]+/g, " ").trim() : "";
    const text = typeof ein.text === "string" ? ein.text.trim() : "";
    if (!betreff || betreff.length > 200) return antwort({ error: "Betreff fehlt oder ist zu lang." }, 400);
    if (!text || text.length > 10_000) return antwort({ error: "Text fehlt oder ist zu lang." }, 400);
    const lsId = typeof ein.kunden_lieferschein_id === "string" ? ein.kunden_lieferschein_id : null;
    if (!lsId && typeof ein.beleg_id !== "string") return antwort({ error: "Beleg fehlt." }, 400);

    let b: { id: string; typ: string; status: string; nummer: string | null; archiv_stand: number | null };
    if (lsId) {
      const { data: l, error: eL } = await dienst.from("kunden_lieferscheine").select("id, status, nummer").eq("id", lsId).maybeSingle();
      if (eL) throw eL;
      if (!l) return antwort({ error: "Lieferschein nicht gefunden." }, 404);
      b = { id: l.id, typ: "lieferschein", status: l.status, nummer: l.nummer, archiv_stand: null };
    } else {
      const { data, error: eB } = await dienst.from("belege")
        .select("id, typ, status, nummer, archiv_stand").eq("id", ein.beleg_id).maybeSingle();
      if (eB) throw eB;
      if (!data) return antwort({ error: "Beleg nicht gefunden." }, 404);
      b = data;
    }
    const art = b.typ === "lieferschein" ? "Lieferschein" : b.typ === "angebot" ? "Angebot" : b.status === "storno" ? "Stornorechnung" : "Rechnung";

    const anhaenge: { filename: string; content: Uint8Array }[] = [];
    if (b.typ === "lieferschein") {
      if (b.status !== "fertig" || !b.nummer) return antwort({ error: "Verschickt wird nur ein abgeschlossener Lieferschein." }, 400);
      if (typeof ein.pdf !== "string" || !ein.pdf) return antwort({ error: "PDF fehlt." }, 400);
      const pdf = ausBase64(ein.pdf);
      if (!istPdf(pdf) || pdf.length > MAX_PDF) return antwort({ error: "Das PDF ist ungültig oder größer als 8 MB." }, 400);
      anhaenge.push({ filename: dateiname(ein.pdf_name, `Lieferschein ${b.nummer}.pdf`), content: pdf });
    } else if (b.typ === "rechnung") {
      if (!["offen", "bezahlt", "storno"].includes(b.status) || !b.nummer) {
        return antwort({ error: "Verschickt wird nur eine fertige Rechnung (offen, bezahlt oder Stornorechnung)." }, 400);
      }
      const pfad = `${b.id}${(b.archiv_stand ?? 0) > 0 ? `-${b.archiv_stand}` : ""}.pdf`;
      const { data: d } = await dienst.storage.from("beleg-archiv").download(pfad);
      if (!d) return antwort({ error: "Das abgelegte Original fehlt noch — einmal „PDF“ öffnen, dann erneut senden." }, 409);
      anhaenge.push({ filename: dateiname(ein.pdf_name, `${art} ${b.nummer}.pdf`), content: new Uint8Array(await d.arrayBuffer()) });
    } else {
      if (!["offen", "angenommen"].includes(b.status)) return antwort({ error: "Verschickt wird nur ein fertiges Angebot (offen oder angenommen)." }, 400);
      if (typeof ein.pdf !== "string" || !ein.pdf) return antwort({ error: "PDF fehlt." }, 400);
      const pdf = ausBase64(ein.pdf);
      if (!istPdf(pdf) || pdf.length > MAX_PDF) return antwort({ error: "Das PDF ist ungültig oder größer als 8 MB." }, 400);
      anhaenge.push({ filename: dateiname(ein.pdf_name, `Angebot ${b.nummer ?? ""}.pdf`), content: pdf });

      const gewuenscht = Array.isArray(ein.datenblaetter) ? [...new Set(ein.datenblaetter.filter((x): x is string => typeof x === "string"))] : [];
      if (gewuenscht.length) {
        const { data: frei, error: eD } = await dienst.rpc("angebot_datenblaetter", { p_beleg: b.id });
        if (eD) throw eD;
        const erlaubt = new Map(((frei ?? []) as { pfad: string; name: string | null }[]).map((d) => [d.pfad, d.name]));
        const fremd = gewuenscht.filter((p) => !erlaubt.has(p));
        if (fremd.length) return antwort({ error: "Ein Datenblatt darf (noch) nicht zum Kunden — „nur intern“ oder „erst nach Auftrag“." }, 403);
        const vergeben = new Set(anhaenge.map((a) => a.filename.toLowerCase()));
        for (const p of gewuenscht) {
          const { data: d } = await dienst.storage.from("projekt-dateien").download(p);
          if (!d) return antwort({ error: `Datenblatt nicht gefunden: ${erlaubt.get(p) ?? p}` }, 404);
          // Name wie am Artikel, Endung notfalls aus dem Pfad (Bilder als Datenblatt gibt es auch)
          const endungPfad = p.match(/\.[a-z0-9]{2,4}$/i)?.[0] ?? ".pdf";
          let name = (erlaubt.get(p) || p.split("/").pop() || "Datenblatt").replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 120) || "Datenblatt";
          if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += endungPfad;
          let n = 2;
          const punkt = name.lastIndexOf(".");
          const [stamm, endung] = punkt > 0 ? [name.slice(0, punkt), name.slice(punkt)] : [name, ""];
          while (vergeben.has(name.toLowerCase())) name = `${stamm} (${n++})${endung}`;
          vergeben.add(name.toLowerCase());
          anhaenge.push({ filename: name, content: new Uint8Array(await d.arrayBuffer()) });
        }
      }
    }
    const gesamt = anhaenge.reduce((s, a) => s + a.content.length, 0);
    if (gesamt > MAX_GESAMT) return antwort({ error: "Die Anhänge sind zusammen größer als 30 MB — weniger Datenblätter wählen." }, 400);

    const { data: f } = await dienst.from("firma").select("name, email").limit(1).maybeSingle();
    const firmenName = (f?.name ?? Deno.env.get("FIRMA_NAME") ?? "").replace(/[<>"\r\n]/g, "").trim();
    const absender = Deno.env.get("RESEND_FROM") ?? "noreply@handwerkapp.at";
    const from = firmenName ? `${firmenName} <${absender}>` : absender;
    const replyTo = f?.email && MAIL.test(f.email.trim()) ? f.email.trim() : undefined;

    // Drossel: 30 je Stunde und Konto
    const { count } = await dienst.from("angebot_verlauf").select("id", { count: "exact", head: true })
      .eq("art", "gesendet").eq("wer", user.id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= 30) return antwort({ error: "In der letzten Stunde gingen schon 30 Mails hinaus. Bitte später wieder." }, 429);

    if (ein.nur_pruefen === true) {
      return antwort({
        ok: true, probe: true, from, an, reply_to: replyTo ?? null, betreff,
        anhaenge: anhaenge.map((a) => ({ name: a.filename, bytes: a.content.length })),
      });
    }

    const schluessel = Deno.env.get("RESEND_API_KEY");
    if (!schluessel) return antwort({ error: "Mailversand ist nicht eingerichtet (RESEND_API_KEY fehlt)." }, 503);
    let r: Response;
    try {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: an, ...(replyTo ? { reply_to: replyTo } : {}), subject: betreff, text, html: textZuHtml(text),
          attachments: anhaenge.map((a) => ({ filename: a.filename, content: base64(a.content) })),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      return antwort({ error: `Keine Antwort vom Mailversand (${(e as Error).message}) — bitte prüfen, ob die Mail ankam, bevor du erneut sendest.` }, 502);
    }
    const rueck = await r.text();
    if (!r.ok) {
      let meldung = rueck;
      try { meldung = String(JSON.parse(rueck)?.message ?? rueck); } catch { /* Rohtext */ }
      return antwort({ error: `Mail ging nicht hinaus: ${meldung.slice(0, 300)}` }, 502);
    }
    let id: string | null = null;
    try { id = JSON.parse(rueck)?.id ?? null; } catch { /* nur fürs Protokoll */ }

    const { error: eV } = lsId
      ? await dienst.from("kunden_lieferscheine").update({ gesendet_an: an.join(", "), gesendet_am: new Date().toISOString() }).eq("id", b.id)
      : await dienst.from("angebot_verlauf").insert({
        beleg_id: b.id, art: "gesendet", name: an.join(", "), text: betreff, wer: user.id, gelesen: true,
      });
    return antwort({ ok: true, id, an, vermerkt: !eV });
  } catch (e) {
    return antwort({ error: String((e as Error).message || e) }, 400);
  }
});
