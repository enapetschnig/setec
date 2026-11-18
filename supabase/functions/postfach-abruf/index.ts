// Postfächer des Betriebs (Google Workspace, Gmail-API über ein Dienstkonto
// mit domänenweiter Delegierung — Secret GOOGLE_MAIL_DIENSTKONTO, base64 JSON).
//
//   POST { aktion: "testen", adresse }
//     → { ok: true, adresse, betreffe: [3 neueste] } bzw. { ok: false, grund, fehler }
//       Nur der Chef. Steht die Adresse in `postfaecher`, merkt sie geprueft_am / letzter_fehler.
//
//   POST { aktion: "abrufen", postfach_id? }
//     → Rechnungen aus allen Postfächern mit „Rechnungen einlesen“ (oder nur dem einen):
//       Mails mit Anhang der letzten 14 Tage (ohne Gesendetes), je Mail einmal
//       (postfach_mails, Zeile wird VOR der KI angelegt → Knopf und Cron nie doppelt).
//       Jeder PDF-/Bild-Anhang geht an Claude (_shared/beleg.ts). Eine Rechnung AN
//       den Betrieb → Eingangsrechnung „zu prüfen“ samt Datei und Positionen;
//       gleicher Lieferant + Nummer → nicht doppelt. Gmail-Label „App: verarbeitet“,
//       als gelesen nur bei Rechnungen; nichts gelöscht oder verschoben.
//       Höchstens LESEN_MAX Anhänge je Lauf — der Rest beim nächsten.
//     Chef (Benutzer-Token) ODER pg_cron mit Kopf x-postfach-secret (= postfach_verbindung.secret);
//     der Cron bekommt sofort 202, der Abruf läuft im Hintergrund weiter.
//
// Secrets: GOOGLE_MAIL_DIENSTKONTO, ANTHROPIC_API_KEY. verify_jwt = false (eigene Prüfung).
import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { abrufen as abrufKern } from "../_shared/abruf.ts";
import { belegAusDatei } from "../_shared/beleg.ts";
import { dienstkontoLesen, Gmail, PostfachFehler, type Dienstkonto } from "../_shared/gmail.ts";
import { adresseSauber, kopfWert, type GmailTeil } from "../_shared/postfach.ts";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const dienst = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const gleichzeitig = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

/** Abruf mit Claude als Leser */
function abrufen(sb: SupabaseClient, sa: Dienstkonto, nurId: string | null) {
  const schluesselKi = Deno.env.get("ANTHROPIC_API_KEY");
  if (!schluesselKi) throw new Error("Die KI ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt).");
  const ki = new Anthropic({ apiKey: schluesselKi });
  return abrufKern({ sb, sa, nurId, lesen: (bytes, mime, firma) => belegAusDatei(ki, bytes, mime, "email", firma) });
}

// ── Verbindung testen ─────────────────────────────────────────────────────
async function testen(sb: SupabaseClient, sa: Dienstkonto, adresse: string) {
  const { data: zeile } = await sb.from("postfaecher").select("id").eq("adresse", adresse).maybeSingle();
  try {
    const g = await Gmail.oeffnen(sa, adresse);
    const l = await g.api<{ messages?: { id: string }[] }>("messages?maxResults=3&q=in%3Ainbox");
    const betreffe: string[] = [];
    for (const m of l.messages ?? []) {
      const d = await g.api<{ payload?: GmailTeil }>(`messages/${m.id}?format=metadata&metadataHeaders=Subject`);
      betreffe.push((kopfWert(d.payload, "Subject") ?? "(ohne Betreff)").slice(0, 120));
    }
    if (zeile) await sb.from("postfaecher").update({ geprueft_am: new Date().toISOString(), letzter_fehler: null }).eq("id", zeile.id);
    return { ok: true, adresse, betreffe, client_id: sa.client_id ?? null };
  } catch (e) {
    const f = e instanceof PostfachFehler ? e : new PostfachFehler("sonst", (e as Error).message);
    if (zeile) await sb.from("postfaecher").update({ geprueft_am: null, letzter_fehler: f.message }).eq("id", zeile.id);
    return { ok: false, adresse, grund: f.grund, fehler: f.message, client_id: sa.client_id ?? null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);
  const sb = dienst();
  try {
    let ein: Record<string, unknown> = {};
    try { ein = await req.json(); } catch { /* leer */ }

    // pg_cron: eigenes Geheimnis statt Benutzer
    const geheim = req.headers.get("x-postfach-secret");
    let cron = false;
    if (geheim) {
      const { data: v } = await sb.from("postfach_verbindung").select("secret").limit(1).maybeSingle();
      if (!v?.secret || !gleichzeitig(v.secret, geheim)) return antwort({ error: "Nicht berechtigt." }, 401);
      cron = true;
    } else {
      const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await sb.auth.getUser(jwt);
      if (!user) return antwort({ error: "Bitte anmelden." }, 401);
      const { data: ich } = await sb.from("profiles").select("rolle, aktiv").eq("id", user.id).maybeSingle();
      if (ich?.rolle !== "chef" || !ich.aktiv) return antwort({ error: "Das Postfach richtet nur der Chef ein." }, 403);
      // Rollen & Rechte: abrufen gehört zu den Eingangsrechnungen, einrichten zu den Einstellungen
      const [{ data: eing }, { data: einst }] = await Promise.all([
        sb.rpc("hat_recht_von", { p_user: user.id, p_recht: "eingang" }),
        sb.rpc("hat_recht_von", { p_user: user.id, p_recht: "einstellungen" }),
      ]);
      if (!eing && !einst) return antwort({ error: "Das Postfach ist für deine Rolle nicht freigegeben." }, 403);
    }

    let sa: Dienstkonto;
    try { sa = dienstkontoLesen(Deno.env.get("GOOGLE_MAIL_DIENSTKONTO")); } catch (e) {
      return antwort({ ok: false, grund: "dienstkonto", error: (e as Error).message, fehler: (e as Error).message }, 503);
    }

    if (ein.aktion === "testen" && !cron) {
      const adresse = adresseSauber(ein.adresse);
      if (!adresse) return antwort({ error: "Bitte eine gültige E-Mail-Adresse eintragen." }, 400);
      return antwort(await testen(sb, sa, adresse));
    }
    if (ein.aktion === "abrufen") {
      const nurId = !cron && typeof ein.postfach_id === "string" ? ein.postfach_id : null;
      if (cron) {
        const lauf = abrufen(sb, sa, null).catch((e) => console.error("Cron-Abruf", e));
        // deno-lint-ignore no-explicit-any
        const rt = (globalThis as any).EdgeRuntime;
        if (rt?.waitUntil) { rt.waitUntil(lauf); return antwort({ ok: true, gestartet: true }, 202); }
        await lauf;
        return antwort({ ok: true });
      }
      return antwort({ ok: true, ...(await abrufen(sb, sa, nurId)) });
    }
    return antwort({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    console.error(e);
    const text = e instanceof Anthropic.APIError
      ? (e.status === 429 ? "Die KI ist gerade ausgelastet — bitte gleich nochmal." : `KI-Fehler (${e.status}).`)
      : String((e as Error).message ?? e);
    return antwort({ error: text }, 500);
  }
});
