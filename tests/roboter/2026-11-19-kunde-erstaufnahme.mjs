// Probefahrt 19.11.2026 (Stefan, Kontakt-Ansicht): „bitte hier oben noch einen Link, bzw. das Feld Erstaufnahme einfügen“.
// Prüft (PC und Handy, Chef und Monteur):
// - oben beim Kontakt steht der Knopf „Erstaufnahme“ (auch beim Monteur, der keine Angebote/Rechnungen sieht)
// - Knopf öffnet die neue Erstaufnahme mit diesem Kunden vorbelegt; „Erstaufnahme anlegen“ hängt sie an den Kunden
// - Karte „Erstaufnahmen“ beim Kontakt zeigt nur die dieses Kunden
// - beim Lieferanten kein Knopf
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=… API_URL=… SERVICE_ROLE_KEY=… node tests/roboter/2026-11-19-kunde-erstaufnahme.mjs
// Legt selbst an (alles „ZZ KE“): Chef, Monteur, zwei Kunden, einen Lieferanten, Erstaufnahmen. Räumt danach auf.
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

const chefId = await konto("zz-ke-chef@test.local", "chef", "Chefin");
const monteurId = await konto("zz-ke-monteur@test.local", "monteur", "Max");
const { data: kunden, error: eK } = await admin.from("kunden").insert([
  { name: "ZZ KE Thaler", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg", art: "kunde" },
  { name: "ZZ KE Andere", strasse: "Hauptstraße 2", plz: "8650", ort: "Kindberg", art: "kunde" },
  { name: "ZZ KE Großhandel", strasse: "Weg 3", plz: "8605", ort: "Kapfenberg", art: "lieferant" },
]).select("id, name");
if (eK) throw eK;
const kunde = kunden.find((k) => k.name === "ZZ KE Thaler"), andere = kunden.find((k) => k.name === "ZZ KE Andere");
const lieferant = kunden.find((k) => k.name === "ZZ KE Großhandel");
const { error: eE } = await admin.from("erstaufnahmen").insert([
  { kunde_id: kunde.id, kundenwunsch: "ZZ KE PV am Dach", erstellt_von: chefId },
  { kunde_id: andere.id, kundenwunsch: "ZZ KE fremde Wallbox", erstellt_von: chefId },
]);
if (eE) throw eE;

const fehler = [];
let browser;
async function anmelden(email, viewport) {
  const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(`[${email}] ${e.message}`));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill(email);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  return page;
}

async function anzahlEa() {
  const { count } = await admin.from("erstaufnahmen").select("id", { count: "exact", head: true }).eq("kunde_id", kunde.id);
  return count ?? 0;
}

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const laeufe = [
    ["chef-pc", "zz-ke-chef@test.local", { width: 1440, height: 1000 }],
    ["chef-handy", "zz-ke-chef@test.local", { width: 390, height: 844 }],
    ["monteur-handy", "zz-ke-monteur@test.local", { width: 390, height: 844 }],
  ];
  for (const [name, email, viewport] of laeufe) {
    const p = await anmelden(email, viewport);
    await p.goto(`${APP_URL}/kunden?k=${kunde.id}`);
    const aktionen = p.locator("[data-kunde-aktionen]").last();
    await aktionen.waitFor({ timeout: 20000 });
    const karte = p.locator("[data-kunde-erstaufnahmen]").last();
    await karte.waitFor({ timeout: 20000 });
    ok(await karte.getByText("ZZ KE PV am Dach").count() === 1, `${name}: Erstaufnahme des Kunden in der Karte`);
    ok(await karte.getByText("ZZ KE fremde Wallbox").count() === 0, `${name}: fremde Erstaufnahme nicht`);
    await p.screenshot({ path: `${BILDER}/kunde-erstaufnahme-${name}.png`, fullPage: false });

    const vorher = await anzahlEa();
    await aktionen.getByRole("link", { name: "Erstaufnahme" }).click();
    await p.waitForURL((u) => u.pathname === "/erstaufnahmen/neu" && u.searchParams.get("kunde") === kunde.id, { timeout: 10000 });
    await p.getByRole("button", { name: "Erstaufnahme anlegen" }).click();
    await p.waitForURL((u) => /^\/erstaufnahmen\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 });
    ok(await anzahlEa() === vorher + 1, `${name}: neue Erstaufnahme hängt am Kunden`);
    // ohne Eingabe zurück zum Kontakt: die Karte zeigt die neue sofort (nicht erst nach 30 s)
    await p.goBack();
    await p.waitForURL((u) => u.pathname === "/kunden", { timeout: 10000 });
    const karte2 = p.locator("[data-kunde-erstaufnahmen]").last();
    await karte2.waitFor({ timeout: 10000 });
    await p.waitForTimeout(1500);
    ok(await karte2.locator("[data-ea]").count() === vorher + 1, `${name}: neue Erstaufnahme gleich in der Kunden-Karte`);
    await p.context().close();
  }

  const chef = await anmelden("zz-ke-chef@test.local", { width: 1440, height: 1000 });
  await chef.goto(`${APP_URL}/kunden?k=${lieferant.id}`);
  await chef.getByText("ZZ KE Großhandel").first().waitFor({ timeout: 20000 });
  await chef.waitForTimeout(1000);
  ok(await chef.locator("[data-kunde-aktionen]").count() === 0, "Lieferant: kein Erstaufnahme-Knopf");
  ok(await chef.locator("[data-kunde-erstaufnahmen]").count() === 0, "Lieferant: keine Erstaufnahmen-Karte");
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("erstaufnahmen").delete().in("kunde_id", [kunde.id, andere.id]);
  await admin.from("kunden").delete().in("id", [kunde.id, andere.id, lieferant.id]);
  for (const id of [chefId, monteurId]) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
