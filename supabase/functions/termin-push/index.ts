// Mitteilungen aufs Handy bei Terminänderung (Web-Push).
//   GET                                   → { publicKey }  (öffentlicher VAPID-Schlüssel fürs Abo im Browser)
//   POST x-push-secret, { op, aenderer, empfaenger, alt, neu }
//                                         → vom Trigger termin_push (pg_net); Geheimnis aus push_verbindung
//   POST Authorization: Bearer <JWT>, { aktion: "test" }
//                                         → Testmitteilung an die eigenen Geräte („Mein Konto“)
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, APP_URL. Deploy ohne JWT-Prüfung (config.toml), prüft selbst.
// Abgelaufene Abos (404/410) werden gelöscht.
import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

type Termin = {
  id: string; titel: string; ort: string | null; datum: string; bis_datum: string | null;
  von: string | null; bis: string | null; ganztags: boolean; mitarbeiter: string[];
};
type Mitteilung = { title: string; body: string; url: string; tag: string };

// ── Text ────────────────────────────────────────────────────────────────
const TZ = "Europe/Vienna";
const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** Heute in Wien als JJJJ-MM-TT — Deno läuft in UTC */
const heuteWien = (verschub = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + verschub * 86_400_000));
function tagText(d: string): string {
  if (d === heuteWien()) return "Heute";
  if (d === heuteWien(1)) return "Morgen";
  const x = new Date(`${d}T12:00:00Z`);
  return `${WOCHENTAG[x.getUTCDay()]} ${x.getUTCDate()}.${x.getUTCMonth() + 1}.`;
}
const uhr = (t: string | null) => (t ? t.slice(0, 5).replace(/^0(\d)/, "$1") : "");
function wann(t: Termin): string {
  const tag = t.bis_datum && t.bis_datum !== t.datum ? `${tagText(t.datum)}–${tagText(t.bis_datum)}` : tagText(t.datum);
  return t.ganztags || !t.von ? tag : `${tag} ${uhr(t.von)}`;
}
function was(t: Termin): string {
  const ort = (t.ort ?? "").trim();
  return ort && !t.titel.toLowerCase().includes(ort.toLowerCase()) ? `${t.titel}, ${ort}` : t.titel;
}
const ende = (t: Termin) => t.bis_datum ?? t.datum;

function nachricht(op: string, alt: Termin | null, neu: Termin | null, an: string, namen: Map<string, string>): Mitteilung | null {
  const warDabei = !!alt?.mitarbeiter.includes(an);
  const istDabei = !!neu?.mitarbeiter.includes(an);
  const kollegen = (t: Termin) => t.mitarbeiter.filter((m) => m !== an).map((m) => namen.get(m)).filter(Boolean).join(", ");
  const heute = heuteWien();
  const id = (neu ?? alt)!.id;
  const basis = { url: "/", tag: `termin:${id}` };

  if (op === "DELETE" || (warDabei && !istDabei)) {
    if (!alt || ende(alt) < heute) return null;
    return { ...basis, title: op === "DELETE" ? "Einsatz gestrichen" : "Nicht mehr eingeteilt", body: `${wann(alt)} ${was(alt)}` };
  }
  if (!neu || !istDabei || ende(neu) < heute) return null;
  const mit = kollegen(neu);
  if (op === "INSERT" || !warDabei) {
    return { ...basis, title: "Neuer Einsatz", body: `${wann(neu)} ${was(neu)}${mit ? ` – mit ${mit}` : ""}` };
  }
  // geändert: was ist neu?
  const personen = alt!.mitarbeiter.slice().sort().join() !== neu.mitarbeiter.slice().sort().join();
  const zeitAnders = wann(alt!) !== wann(neu);
  let body = `${wann(neu)} ${was(neu)}`;
  if (personen) body += mit ? ` – jetzt mit ${mit}` : " – jetzt allein";
  else if (mit) body += ` – mit ${mit}`;
  if (zeitAnders) body += ` (statt ${wann(alt!)})`;
  return { ...basis, title: "Einsatz geändert", body };
}

// ── Senden ──────────────────────────────────────────────────────────────
let vapid = false;
function vapidBereit(): boolean {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  if (!vapid) { webpush.setVapidDetails("mailto:napetschnig.chris@gmail.com", pub, priv); vapid = true; }
  return true;
}

async function senden(sb: SupabaseClient, userId: string, m: Mitteilung) {
  const { data: abos } = await sb.from("push_abos").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  const basis = (Deno.env.get("APP_URL") ?? "https://setec.handwerkapp.at").replace(/\/$/, "");
  const payload = JSON.stringify({ ...m, url: `${basis}${m.url}` });
  const ergebnis = { geraete: 0, ok: 0, geloescht: 0, fehler: [] as string[] };
  for (const abo of abos ?? []) {
    ergebnis.geraete++;
    try {
      await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, payload,
        { TTL: 60 * 60 * 24, urgency: "high" });
      ergebnis.ok++;
      await sb.from("push_abos").update({ zuletzt_ok_am: new Date().toISOString() }).eq("id", abo.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      ergebnis.fehler.push(`${status} ${String((e as Error).message ?? "").slice(0, 120)}`.trim());
      if (status === 404 || status === 410) {           // beim Browser abgelaufen
        await sb.from("push_abos").delete().eq("id", abo.id);
        ergebnis.geloescht++;
      }
    }
  }
  return ergebnis;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  if (req.method === "GET") {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    return publicKey ? antwort({ publicKey }) : antwort({ error: "Mitteilungen sind nicht eingerichtet." }, 503);
  }
  if (req.method !== "POST") return antwort({ error: "Nicht erlaubt." }, 405);
  if (!vapidBereit()) return antwort({ error: "VAPID-Schlüssel fehlen." }, 503);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const geheim = req.headers.get("x-push-secret");
    // ── Testmitteilung an die eigenen Geräte ──
    if (!geheim) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(token);
      if (!u?.user) return antwort({ error: "Nicht angemeldet." }, 401);
      const body = await req.json().catch(() => ({}));
      if (body?.aktion !== "test") return antwort({ error: "Unbekannte Aktion." }, 400);
      const e = await senden(sb, u.user.id, { title: "Mitteilungen sind an", body: "So sieht es aus, wenn sich ein Einsatz ändert.", url: "/", tag: "test" });
      return antwort(e);
    }

    // ── Vom Trigger ──
    const { data: v } = await sb.from("push_verbindung").select("secret").maybeSingle();
    if (!v?.secret || geheim !== v.secret) return antwort({ error: "Nicht erlaubt." }, 401);
    const { op, aenderer, empfaenger, alt, neu } = await req.json() as {
      op: string; aenderer: string | null; empfaenger: string[]; alt: Termin | null; neu: Termin | null;
    };
    const an = (empfaenger ?? []).filter((id) => id && id !== aenderer);
    const alle = [...new Set([...(alt?.mitarbeiter ?? []), ...(neu?.mitarbeiter ?? [])])];
    const { data: profile } = alle.length
      ? await sb.from("profiles").select("id, vorname").in("id", alle)
      : { data: [] as { id: string; vorname: string | null }[] };
    const namen = new Map((profile ?? []).map((p) => [p.id, (p.vorname ?? "").trim()]));

    const protokoll: Record<string, unknown>[] = [];
    for (const id of an) {
      const m = nachricht(op, alt, neu, id, namen);
      if (!m) { protokoll.push({ an: id, uebersprungen: true }); continue; }
      protokoll.push({ an: id, titel: m.title, text: m.body, ...(await senden(sb, id, m)) });
    }
    console.log(JSON.stringify({ termin: (neu ?? alt)?.id, op, aenderer, protokoll }));
    return antwort({ ok: true, protokoll });
  } catch (e) {
    console.error("termin-push:", e);
    return antwort({ error: String((e as Error).message || e) }, 400);
  }
});
