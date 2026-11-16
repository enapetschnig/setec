// Einladung per SMS: der Chef tippt eine Handynummer, der Mitarbeiter bekommt
// den EINEN Link zur App (/start — Gerät erkennen, Startbildschirm, registrieren).
//   POST { nummer: "0664 1234567" }  →  { ok: true, an: "+436641234567" }
// Nur der Chef (JWT-Prüfung an, Rolle aus profiles). Der Text steht hier fest —
// die Funktion verschickt nie fremden Inhalt. Nur Handynummern (Liste HANDY).
// Drossel: 3 SMS je Nummer und Tag, 40 je Tag insgesamt — gezählt und
// reserviert atomar in sms_platz() (Migration 20261116130000). Absender ist die Twilio-Nummer — der Name „SETEC“ als
// Absender wird von Twilio für dieses Konto abgelehnt (Fehler 21612, 16.11.2026).
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, APP_URL.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

/** Nur Handynummern (keine Mehrwert- oder Festnetznummern): AT, DE, CH, IT, SI, HR, HU, SK, CZ, PL, RO, BA, RS */
const HANDY = /^\+(43(6\d{8,12})|49(1[5-7]\d{8,10})|41(7\d{8})|39(3\d{8,9})|386([3-7]\d{7})|385(9\d{7,8})|36((20|30|31|50|70)\d{7})|421(9\d{8})|420([67]\d{8})|48([4-8]\d{8})|40(7\d{8})|387(6\d{7,8})|381(6\d{7,8}))$/;

/** 0664 123 45 67 · 0043 664… · +43 (0) 664… · +49… → E.164-Handynummer, sonst null (gleich wie handyNummer in src/lib/einladung.ts) */
export function e164(eingabe: string): string | null {
  let n = eingabe.replace(/\(0\)/g, "").replace(/[\s/().-]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("0")) n = "+43" + n.slice(1);
  else if (!n.startsWith("+")) n = "+43" + n;
  return HANDY.test(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  const url = Deno.env.get("SUPABASE_URL")!;
  const dienst = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await dienst.auth.getUser(jwt);
    if (!user) return antwort({ error: "Bitte anmelden." }, 401);
    const { data: ich } = await dienst.from("profiles").select("rolle, aktiv").eq("id", user.id).maybeSingle();
    if (ich?.rolle !== "chef" || !ich.aktiv) return antwort({ error: "Einladen per SMS kann nur der Chef." }, 403);

    const { nummer } = await req.json();
    const an = typeof nummer === "string" ? e164(nummer) : null;
    if (!an) return antwort({ error: "Das ist keine Handynummer — z. B. 0664 1234567." }, 400);

    // Zählen und Platz reservieren in einem Schritt (Sperre in der Datenbank)
    const { data: platz, error: ePlatz } = await dienst.rpc("sms_platz", { p_nummer: an, p_von: user.id });
    if (ePlatz?.message.includes("zu_viele_nummer")) return antwort({ error: "An diese Nummer gingen heute schon 3 SMS. Bitte morgen wieder." }, 429);
    if (ePlatz?.message.includes("zu_viele_tag")) return antwort({ error: "Heute gingen schon 40 SMS hinaus. Bitte morgen wieder." }, 429);
    if (ePlatz) throw ePlatz;

    const link = `${(Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")}/start`;
    // Ohne Umlaute: sonst wird es eine Unicode-SMS mit nur 70 Zeichen
    const text = `SETEC GmbH: Hier ist der Link zu unserer Firmen-App. Am Handy oeffnen, auf den Startbildschirm legen und registrieren: ${link}`;
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: an, From: Deno.env.get("TWILIO_FROM")!, Body: text }),
    }).then(async (x) => ({ ok: x.ok, daten: await x.json() }))
      .catch((e) => ({ ok: false, daten: { message: `Twilio nicht erreichbar: ${(e as Error).message}` } }));
    await dienst.from("sms_einladungen").update({
      status: r.ok ? "gesendet" : "fehler",
      twilio_sid: r.ok ? r.daten.sid : null,
      fehler: r.ok ? null : String(r.daten?.message ?? "unbekannt").slice(0, 300),
    }).eq("id", platz);
    if (!r.ok) return antwort({ error: `SMS ging nicht hinaus: ${r.daten?.message ?? "unbekannt"}` }, 502);
    return antwort({ ok: true, an });
  } catch (e) {
    return antwort({ error: String((e as Error).message || e) }, 400);
  }
});
