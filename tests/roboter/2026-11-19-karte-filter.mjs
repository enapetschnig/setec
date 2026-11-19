// Probefahrt 19.11.2026 — Zusage aus der Besprechung mit Stefan (17.11.): Karte als Referenz für
// Nachbarn — „alle Kunden mit einer 15-kWp-Anlage mit Einspeisebegrenzung im Umkreis“.
// Prüft (Chef am Handy, 390 px):
// - Kontakte-Karte mit 5 ZZ-Kontakten: alle Punkte da
// - „Einspeisung begrenzt“: 70 %, 4 kW bei 15,2 kWp und 0 kW (Nulleinspeisung) zählen,
//   20 kW bei 16 kWp nicht; Filter steht in der Adresse (?filter=begrenzt)
// - „ab 15 kWp“ dazu: nur die 15,2-kWp-Anlage mit Begrenzung (Leistung und Begrenzung an derselben
//   Anlage); ?kwp=15; nochmals tippen nimmt die Stufe weg
// - Kärtchen am Punkt: kWp und „Einspeisung begrenzt auf 4 kW“
// - „Öffnen“ → Kontakt → „Zurück“: Karte mit denselben Filtern
// - Adresse direkt (?filter=pv&kwp=10): Chips gewählt, passende Punkte
// - 390 px ohne waagrechtes Scrollen, Konsole ohne Fehler (Kartenkacheln kommen im Test von hier)
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55210 API_URL=http://127.0.0.1:55200 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-19-karte-filter.mjs
// Legt selbst an (alles „ZZ“): Chef, fünf Kontakte mit Anlagen. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

// 1 × 1 px grau — statt der OpenStreetMap-Kacheln (kein Netz im Test, keine Last bei OSM)
const KACHEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAI2gPkOeVZ0QAAAABJRU5ErkJggg==", "base64");
const ort = (strasse, plz, ortName, lat, lng) => ({ strasse, plz, ort: ortName, lat, lng, geo_adresse: `${strasse}, ${plz} ${ortName}, Österreich` });

const chefId = await konto("zz-kf-chef@test.local", "chef", "Stefan");
const { data: kontakte, error: eK } = await admin.from("kunden").insert([
  { name: "ZZ Karte Huber", art: "kunde", ...ort("Hauptstraße 1", "8650", "Kindberg", 47.505, 15.448) },
  { name: "ZZ Karte Maier", art: "kunde", ...ort("Wiener Straße 5", "8680", "Mürzzuschlag", 47.607, 15.672) },
  { name: "ZZ Karte Klein", art: "kunde", ...ort("Grazer Straße 3", "8605", "Kapfenberg", 47.444, 15.293) },
  { name: "ZZ Karte Prozent", art: "kunde", ...ort("Bahnhofstraße 2", "8600", "Bruck an der Mur", 47.41, 15.27) },
  { name: "ZZ Karte Ohne", art: "kunde", ...ort("Hauptplatz 1", "8670", "Krieglach", 47.546, 15.563) },
]).select("id, name");
if (eK) throw eK;
const k = Object.fromEntries(kontakte.map((x) => [x.name.replace("ZZ Karte ", ""), x.id]));
// Alle Felder je Zeile (PostgREST-Sammel-Insert: fehlende Felder würden NULL)
const anlage = (kunde, bezeichnung, art, pv_kwp, einspeisung_kw, einspeisung_prozent, wallbox = null) =>
  ({ kunde_id: kunde, bezeichnung, art, pv_kwp, einspeisung_kw, einspeisung_prozent, wallbox });
const { error: eA } = await admin.from("anlagen").insert([
  anlage(k.Huber, "ZZ PV Huber", "pv", 15.2, 4, null),
  anlage(k.Huber, "ZZ Wallbox Huber", "ladestation", null, null, null, "go-e 11 kW"),
  anlage(k.Maier, "ZZ PV Maier", "pv", 16, 20, null),
  anlage(k.Klein, "ZZ PV Klein", "pv", 8, 0, null),
  anlage(k.Prozent, "ZZ PV Prozent", "pv", 5, null, 70),
]);
if (eA) throw eA;

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  await ctx.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: KACHEL }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(`Konsole: ${m.text()}`); });
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill("zz-kf-chef@test.local");
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });

  const punkte = page.locator('.leaflet-marker-icon[title^="ZZ Karte"]');
  const namen = async () => (await punkte.evaluateAll((l) => l.map((e) => e.getAttribute("title").replace("ZZ Karte ", "")))).sort().join(",");
  const warteAuf = async (liste) => {
    await page.waitForFunction((soll) => [...document.querySelectorAll('.leaflet-marker-icon[title^="ZZ Karte"]')]
      .map((e) => e.getAttribute("title").replace("ZZ Karte ", "")).sort().join(",") === soll, liste, { timeout: 10000 }).catch(() => {});
    return (await namen()) === liste;
  };
  const adresse = () => new URL(page.url()).searchParams;
  const chip = (text) => page.locator("[data-karten-filter]").getByRole("button", { name: text, exact: true });
  const breitOk = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await page.goto(`${APP_URL}/kunden?ansicht=karte`);
  await page.locator("[data-karten-filter]").waitFor({ timeout: 20000 });
  ok(await warteAuf("Huber,Klein,Maier,Ohne,Prozent"), `ohne Filter alle 5 Punkte (${await namen()})`);
  ok(await chip("alle").getAttribute("aria-pressed") === "true", "Leistung: „alle“ gewählt");
  ok(await breitOk(), "Handy: Karte mit Filtern ohne waagrechtes Scrollen");

  await chip("Einspeisung begrenzt").click();
  ok(await warteAuf("Huber,Klein,Prozent"), `„Einspeisung begrenzt“: 4 kW bei 15,2 kWp, 0 kW, 70 % — nicht 20 kW bei 16 kWp (${await namen()})`);
  ok(adresse().get("filter") === "begrenzt" && adresse().get("ansicht") === "karte", "Filter steht in der Adresse");

  await chip("ab 15 kWp").click();
  ok(await warteAuf("Huber"), `dazu „ab 15 kWp“: nur Huber (${await namen()})`);
  ok(adresse().get("kwp") === "15" && adresse().get("filter") === "begrenzt", "?kwp=15&filter=begrenzt in der Adresse");
  ok(await chip("ab 15 kWp").getAttribute("aria-pressed") === "true" && await chip("alle").getAttribute("aria-pressed") === "false", "Chip „ab 15 kWp“ gewählt");
  ok(await page.getByText(/^1 auf der Karte · 15,2 kWp$/).count() === 1, "Zähler unter der Karte: „1 auf der Karte · 15,2 kWp“");
  ok(await breitOk(), "Handy: mit gewählten Filtern ohne waagrechtes Scrollen");
  await page.screenshot({ path: `${BILDER}/karte-filter-handy.png` });

  // Kärtchen am Punkt
  await punkte.first().click();
  const popup = page.locator("[data-karten-popup]");
  await popup.waitFor({ timeout: 10000 });
  const popupText = (await popup.innerText()).replace(/\s+/g, " ");
  ok(popupText.includes("ZZ Karte Huber") && popupText.includes("15,2 kWp"), `Kärtchen: Name und 15,2 kWp (${popupText})`);
  ok(popupText.includes("Einspeisung begrenzt auf 4 kW"), "Kärtchen: „Einspeisung begrenzt auf 4 kW“");
  ok(popupText.includes("Wallbox"), "Kärtchen: Wallbox (eigene Anlage) steht auch da");
  ok(await breitOk(), "Handy: Kärtchen ohne waagrechtes Scrollen");
  await page.waitForTimeout(400); // Leaflet blendet das Kärtchen ein
  await page.screenshot({ path: `${BILDER}/karte-filter-kaertchen.png` });

  // Öffnen → Kontakt → Zurück: Filter bleiben
  await popup.getByRole("button", { name: "Öffnen" }).click();
  await page.waitForURL((u) => new URL(u).searchParams.get("k") === k.Huber, { timeout: 10000 });
  await page.getByRole("heading", { name: "ZZ Karte Huber" }).first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByRole("heading", { name: "ZZ Karte Huber" }).count() >= 1, "„Öffnen“ zeigt den Kontakt");
  await page.getByRole("button", { name: "Zurück" }).click();
  await page.locator("[data-karten-filter]").waitFor({ timeout: 10000 });
  ok(adresse().get("ansicht") === "karte" && adresse().get("filter") === "begrenzt" && adresse().get("kwp") === "15" && !adresse().get("k"),
    `nach „Zurück“: Karte mit ?filter=begrenzt&kwp=15 (${new URL(page.url()).search})`);
  ok(await chip("Einspeisung begrenzt").getAttribute("aria-pressed") === "true" && await chip("ab 15 kWp").getAttribute("aria-pressed") === "true",
    "nach „Zurück“: Chips noch gewählt");
  ok(await warteAuf("Huber"), "nach „Zurück“: wieder nur Huber");

  // Stufe nochmals tippen nimmt sie weg; Begrenzung aus → alle
  await chip("ab 15 kWp").click();
  ok(await warteAuf("Huber,Klein,Prozent") && !adresse().get("kwp"), "„ab 15 kWp“ nochmals: Stufe weg, ?kwp weg");
  await chip("Einspeisung begrenzt").click();
  ok(await warteAuf("Huber,Klein,Maier,Ohne,Prozent") && !adresse().get("filter"), "Begrenzung aus: alle, ?filter weg");

  // Adresse direkt: Mit PV ab 10 kWp
  await page.goto(`${APP_URL}/kunden?ansicht=karte&filter=pv&kwp=10`);
  await page.locator("[data-karten-filter]").waitFor({ timeout: 20000 });
  ok(await chip("Mit PV").getAttribute("aria-pressed") === "true" && await chip("ab 10 kWp").getAttribute("aria-pressed") === "true",
    "Adresse ?filter=pv&kwp=10: Chips gewählt");
  ok(await warteAuf("Huber,Maier"), `Mit PV ab 10 kWp: Huber und Maier (${await namen()})`);
  // eine andere Zahl aus der Adresse bleibt als eigener Chip sichtbar
  await page.goto(`${APP_URL}/kunden?ansicht=karte&kwp=12`);
  await page.locator("[data-karten-filter]").waitFor({ timeout: 20000 });
  ok(await chip("ab 12 kWp").getAttribute("aria-pressed") === "true", "?kwp=12: eigener Chip „ab 12 kWp“");
  ok(await warteAuf("Huber,Maier"), "ab 12 kWp: Huber und Maier");
  ok(await breitOk(), "Handy: ohne waagrechtes Scrollen");

  // PC: Filter über der Karte
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${APP_URL}/kunden?ansicht=karte&filter=begrenzt&kwp=15`);
  await page.locator("[data-karten-filter]").waitFor({ timeout: 20000 });
  ok(await warteAuf("Huber"), "PC: Adresse mit Filtern zeigt nur Huber");
  await page.screenshot({ path: `${BILDER}/karte-filter-pc.png` });

  ok(fehler.length === 0, `keine Seitenfehler und Konsolenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("anlagen").delete().in("kunde_id", Object.values(k));
  await admin.from("kunden").delete().in("id", Object.values(k));
  await admin.auth.admin.deleteUser(chefId);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
