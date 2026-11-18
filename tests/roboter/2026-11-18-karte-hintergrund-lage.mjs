// Probefahrt 18.11.2026 (Stefan): „Die Kartenansicht zeigt keine Einträge an.“ Ursache: die Lage
// eines Kontakts suchte nur die App (Speichern/Öffnen/„Lage suchen“ unter der Karte) — die ~1000
// importierten Kontakte waren nie gesucht. Jetzt sucht der Server im Hintergrund (pg_cron →
// Edge Function geo-suchen → _shared/geo.ts geoLauf).
// Prüft:
// - Cron-Job „geo-suchen“ ist eingetragen
// - Kontakte ohne Lage: Karte zeigt den Hinweis „im Hintergrund gesucht“, keine Punkte
// - derselbe Lauf wie die Edge Function (geoLauf, Photon durch festen Punkt ersetzt) verortet alle
// - die offene Karte zeigt die Punkte danach ohne Neuladen (Nachladen alle 30 s)
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55210 API_URL=http://127.0.0.1:55200 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-karte-hintergrund-lage.mjs
// Legt selbst an (alles „ZZ“): Chef, drei Kontakte. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { geoLauf } from "../../supabase/functions/_shared/geo.ts";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY) throw new Error("APP_URL, API_URL und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefId = await konto("zz-geo-chef@test.local", "chef", "Chefin");
// Wie importiert: Adresse da, nie gesucht
const { data: kontakte, error: eK } = await admin.from("kunden").insert([
  { name: "ZZ Geo Huber", art: "kunde", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
  { name: "ZZ Geo Maier", art: "kunde", strasse: "Wiener Straße 5", plz: "8680", ort: "Mürzzuschlag" },
  { name: "ZZ Geo Großhandel", art: "lieferant", strasse: "Industriestraße 2", plz: "8605", ort: "Kapfenberg" },
]).select("id");
if (eK) throw eK;
const ids = kontakte.map((k) => k.id);

const fehler = [];
let browser;
try {
  // Cron-Job eingetragen — das Schema cron ist über die API meist nicht freigegeben, dann übersprungen
  const { data: job, error: eJ } = await admin.schema("cron").from("job").select("jobname, schedule").eq("jobname", "geo-suchen");
  if (eJ) console.log(`(Cron-Job nicht über die API lesbar: ${eJ.message} — per psql prüfen)`);
  else ok(job?.length === 1 && job[0].schedule === "* * * * *", "Cron-Job geo-suchen jede Minute");

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill("zz-geo-chef@test.local");
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });

  await page.goto(`${APP_URL}/kunden?ansicht=karte`);
  await page.locator("[data-geo-hintergrund]").waitFor({ timeout: 20000 });
  ok(true, "Hinweis „im Hintergrund gesucht“ steht unter der Karte");
  const meine = page.locator('.leaflet-marker-icon[title^="ZZ Geo"]');
  ok(await meine.count() === 0, "vorher keine Punkte");
  await page.screenshot({ path: `${BILDER}/karte-vorher.png` });

  // Der Lauf der Edge Function — Photon durch feste Punkte ersetzt (kein Netz im Test)
  const punkte = { Kindberg: [47.505, 15.448], Mürzzuschlag: [47.607, 15.672], Kapfenberg: [47.444, 15.293] };
  const r = await geoLauf(admin, {
    bisMs: 20_000, pauseMs: 10,
    holen: async (url) => {
      const q = decodeURIComponent(url);
      const ort = Object.keys(punkte).find((o) => q.includes(o));
      const plz = q.match(/ (\d{4}) /)?.[1];
      const f = ort ? [{ geometry: { coordinates: [punkte[ort][1], punkte[ort][0]] }, properties: { countrycode: "AT", postcode: plz, city: ort } }] : [];
      return new Response(JSON.stringify({ features: f }), { status: 200 });
    },
  });
  ok(r.gesucht >= 3 && r.gefunden >= 3 && !r.abbruch, `Hintergrund-Lauf: ${r.gefunden} von ${r.gesucht} gefunden`);
  const { data: nachher } = await admin.from("kunden").select("lat, lng, geo_adresse").in("id", ids);
  ok(nachher.every((k) => k.lat != null && k.lng != null && k.geo_adresse), "alle drei Kontakte haben Koordinaten");

  // ohne Neuladen: die Karte holt alle 30 s nach
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon[title^="ZZ Geo"]').length >= 3, null, { timeout: 45000 }).catch(() => {});
  ok(await meine.count() === 3, "Karte zeigt die drei Punkte ohne Neuladen");
  // (Hinweis verschwindet nur, wenn nichts mehr fehlt — andere Tests lassen evtl. Kontakte ohne Ort zurück)
  const { count: fehlt } = await admin.from("kunden").select("id", { count: "exact", head: true }).is("geo_adresse", null).not("ort", "is", null);
  if (!fehlt) ok(await page.locator("[data-geo-hintergrund]").count() === 0, "Hinweis verschwindet, wenn nichts mehr fehlt");
  await page.screenshot({ path: `${BILDER}/karte-nachher.png` });
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("kunden").delete().in("id", ids);
  await admin.auth.admin.deleteUser(chefId);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
