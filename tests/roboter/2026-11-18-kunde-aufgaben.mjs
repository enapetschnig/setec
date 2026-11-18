// Probefahrt 18.11.2026 (Stefan): „Wenn eine Aufgabe mit dem jeweiligen Kunden verknüpft ist, würde ich
// diese auch gerne beim Kunden in der Kontaktansicht sehen.“
// Prüft (PC und Handy):
// - Kontakt zeigt Aufgaben am Kunden UND an seinen Projekten, nicht die anderer Kunden
// - „+ Aufgabe“ in der Karte legt die Aufgabe gleich mit diesem Kunden an, sie erscheint sofort
// - Monteur sieht beim Kontakt nur seine (RLS)
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-kunde-aufgaben.mjs
// Legt selbst an (alles „ZZ“): Chef, Monteur, zwei Kunden, ein Projekt, Aufgaben. Räumt danach auf.
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
const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefId = await konto("zz-ka-chef@test.local", "chef", "Chefin");
const monteurId = await konto("zz-ka-monteur@test.local", "monteur", "Max");
const { data: kunden, error: eK } = await admin.from("kunden").insert([
  { name: "ZZ KA Thaler", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
  { name: "ZZ KA Andere", strasse: "Hauptstraße 2", plz: "8650", ort: "Kindberg" },
]).select("id, name");
if (eK) throw eK;
const kunde = kunden.find((k) => k.name === "ZZ KA Thaler"), andere = kunden.find((k) => k.name === "ZZ KA Andere");
const { data: prj, error: eP } = await admin.from("projekte").insert({ name: "ZZ KA PV Dach", status: "aktiv", kunde_id: kunde.id }).select("id").single();
if (eP) throw eP;
const { error: eA } = await admin.from("aufgaben").insert([
  { titel: "ZZ KA Rückruf Kunde", kunde_id: kunde.id, projekt_id: null, zustaendig: [], erstellt_von: chefId, faellig_am: heute },
  { titel: "ZZ KA Zählertausch Projekt", kunde_id: null, projekt_id: prj.id, zustaendig: [monteurId], erstellt_von: chefId, faellig_am: heute },
  { titel: "ZZ KA fremder Kunde", kunde_id: andere.id, projekt_id: null, zustaendig: [], erstellt_von: chefId, faellig_am: heute },
]);
if (eA) throw eA;

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

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const [name, viewport] of [["pc", { width: 1440, height: 1000 }], ["handy", { width: 390, height: 844 }]]) {
    const chef = await anmelden("zz-ka-chef@test.local", viewport);
    await chef.goto(`${APP_URL}/kunden?k=${kunde.id}`);
    const karte = chef.locator("[data-kunde-aufgaben]");
    await karte.waitFor({ timeout: 20000 });
    await chef.waitForTimeout(800);
    ok(await karte.getByText("ZZ KA Rückruf Kunde").count() === 1, `${name}: Aufgabe am Kunden sichtbar`);
    ok(await karte.getByText("ZZ KA Zählertausch Projekt").count() === 1, `${name}: Aufgabe am Projekt des Kunden sichtbar`);
    ok(await karte.getByText("ZZ KA fremder Kunde").count() === 0, `${name}: Aufgabe eines anderen Kunden nicht`);
    await karte.scrollIntoViewIfNeeded();
    await chef.screenshot({ path: `${BILDER}/kunde-aufgaben-${name}.png`, fullPage: false });

    // neue Aufgabe direkt beim Kontakt
    const titel = `ZZ KA neu ${name}`;
    await chef.locator("div").filter({ has: karte }).getByRole("button", { name: "Aufgabe", exact: true }).last().click();
    await chef.locator("#a-titel").fill(titel);
    await chef.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await chef.waitForTimeout(1500);
    const { data: neu } = await admin.from("aufgaben").select("kunde_id").eq("titel", titel).maybeSingle();
    ok(neu?.kunde_id === kunde.id, `${name}: neue Aufgabe hängt am Kunden`);
    ok(await karte.getByText(titel).count() === 1, `${name}: neue Aufgabe erscheint sofort beim Kontakt`);
    await chef.context().close();
  }

  const max = await anmelden("zz-ka-monteur@test.local", { width: 390, height: 844 });
  await max.goto(`${APP_URL}/kunden?k=${kunde.id}`);
  const k2 = max.locator("[data-kunde-aufgaben]");
  await k2.waitFor({ timeout: 20000 });
  await max.waitForTimeout(800);
  ok(await k2.getByText("ZZ KA Zählertausch Projekt").count() === 1, "Monteur sieht seine Aufgabe beim Kontakt");
  ok(await k2.getByText("ZZ KA Rückruf Kunde").count() === 0, "Monteur sieht fremde Aufgaben nicht");
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("aufgaben").delete().like("titel", "ZZ KA%");
  await admin.from("projekte").delete().eq("id", prj.id);
  await admin.from("kunden").delete().in("id", [kunde.id, andere.id]);
  for (const id of [chefId, monteurId]) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
