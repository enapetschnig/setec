// Probefahrt 17.11.2026: Kalender statt Plantafel/Gantt (Stufe 1, docs/ABLAUF-TERMIN-BIS-RECHNUNG.md).
// - /plantafel leitet auf /kalender
// - Termin „Service“: Kunde zuerst, Ort = Kundenadresse, kein Projekt
// - Termin „Montage“: Kunde → sein einziges Projekt „In Arbeit“ vorgewählt, Ort = Projektadresse
// - Geräte in der Tageszeile (seit 18.11., 95c5269 keine Gerätespalten mehr): Steiger doppelt belegt = rotes Kärtchen
// - „Nicht eingeplant“ (Knopf in der Leiste): Projekt auf eine Person ziehen = Montage bis Freitag
// - Monteur: Kalender nur lesen, am Handy „Woche“ mit seinen Terminen
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-17-kalender.mjs
// Legt selbst an (alles „ZZ“): Chef, Monteur, Kunde, zwei Projekte, Steiger, zwei Termine. Räumt danach auf.
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
const wien = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(d);
const heute = wien(new Date());
// ein Werktag dieser Woche nach heute (sonst heute) — damit alles in der gezeigten Woche liegt
const wt = (new Date(`${heute}T12:00:00Z`).getUTCDay() + 6) % 7;
const tag = wt < 4 ? wien(new Date(Date.now() + 864e5)) : heute;

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefId = await konto("zz-chef@test.local", "chef", "Chefin");
const monteurId = await konto("zz-monteur@test.local", "monteur", "Max");
const { data: kunde, error: eK } = await admin.from("kunden")
  .insert({ name: "ZZ Kunde Huber", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" }).select("id").single();
if (eK) throw eK;
const { data: prj, error: eP } = await admin.from("projekte").insert([
  { name: "ZZ PV Dach", status: "aktiv", kunde_id: kunde.id, strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" },
  { name: "ZZ Speicher", status: "angebot", kunde_id: kunde.id, strasse: null, plz: null, ort: null },
]).select("id, name, nummer");
if (eP) throw eP;
const pv = prj.find((p) => p.name === "ZZ PV Dach");
const { data: steiger, error: eF } = await admin.from("fahrzeuge").insert({ name: "ZZ Steiger", art: "steiger" }).select("id").single();
if (eF) throw eF;
const { error: eT } = await admin.from("termine").insert([
  { titel: "ZZ Steiger früh", art: "buero", datum: tag, von: "07:00", bis: "12:00", fahrzeuge: [steiger.id], mitarbeiter: [monteurId] },
  { titel: "ZZ Steiger spät", art: "buero", datum: tag, von: "11:00", bis: "15:00", fahrzeuge: [steiger.id], mitarbeiter: [] },
]);
if (eT) throw eT;

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
const kundeWaehlen = async (page) => {
  await page.getByRole("button", { name: /Kunde wählen oder neu anlegen/ }).click();
  await page.getByLabel("Kunden suchen").fill("ZZ Kunde");
  await page.getByRole("button", { name: /ZZ Kunde Huber/ }).click();
  await page.waitForTimeout(300);
};
const termineVon = async (titel) => (await admin.from("termine").select("*").eq("titel", titel)).data ?? [];

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const chef = await anmelden("zz-chef@test.local", { width: 1440, height: 900 });
  await chef.goto(`${APP_URL}/plantafel`);
  await chef.waitForURL(/\/kalender/);
  ok(true, "/plantafel leitet auf /kalender");
  await chef.waitForTimeout(2000);
  ok(await chef.getByRole("button", { name: /^Gantt$/ }).count() === 0, "kein Umschalter Gantt mehr");
  const kaertchen = chef.locator(`[data-tagzeile="${tag}"] [data-fahrzeug-tag="${steiger.id}"]`);
  ok(await kaertchen.count() === 1 && await chef.locator(`[data-zelle="g:${steiger.id}"]`).count() === 0, "ZZ Steiger als Kärtchen in der Tageszeile, keine Gerätespalte");
  ok(/bg-status-rot/.test((await kaertchen.getAttribute("class")) ?? "") && (await kaertchen.innerText()).includes("⚠"), "Steiger doppelt belegt = rot");
  await chef.screenshot({ path: `${BILDER}/kalender-pc.png` });

  // Service: Kunde zuerst, Ort = Kundenadresse, kein Projekt
  await chef.getByRole("button", { name: "Termin", exact: true }).click();
  await chef.getByRole("radio", { name: /Service/ }).click();
  await kundeWaehlen(chef);
  ok(await chef.locator("#t-ort").inputValue() === "Hauptstraße 1, 8650 Kindberg", "Service: Ort = Adresse des Kunden");
  ok(await chef.locator("#t-titel").inputValue() === "Service ZZ Kunde Huber", "Service: Titel vorgeschlagen");
  await chef.locator("#t-datum").fill(tag);
  await chef.locator("#t-von").fill("08:00");
  await chef.locator("#t-bis").fill("09:00");
  await chef.screenshot({ path: `${BILDER}/kalender-dialog-service.png` });
  await chef.getByRole("button", { name: "Speichern" }).click();
  await chef.waitForTimeout(1500);
  const [service] = await termineVon("Service ZZ Kunde Huber");
  ok(service?.art === "service" && service.kunde_id === kunde.id && service.projekt_id === null, "Service gespeichert: Art, Kunde, ohne Projekt");

  // Montage: Kunde → sein einziges Projekt in Arbeit ist vorgewählt
  await chef.getByRole("button", { name: "Termin", exact: true }).click();
  await kundeWaehlen(chef);
  ok(await chef.getByRole("radio", { name: /ZZ PV Dach/ }).getAttribute("aria-checked") === "true", "Montage: einziges Projekt in Arbeit vorgewählt");
  ok(await chef.getByRole("radio", { name: /ZZ Speicher/ }).count() === 0, "Montage: Projekt im Angebot nicht zur Wahl");
  ok(await chef.locator("#t-ort").inputValue() === "Feldweg 3, 8643 Allerheiligen", "Montage: Ort = Projektadresse");
  await chef.locator("#t-titel").fill("ZZ Montage PV");
  await chef.locator("#t-datum").fill(tag);
  await chef.getByRole("button", { name: "Speichern" }).click();
  await chef.waitForTimeout(1500);
  const [montage] = await termineVon("ZZ Montage PV");
  ok(montage?.art === "montage" && montage.projekt_id === pv.id && montage.kunde_id === kunde.id, "Montage gespeichert: Projekt und Kunde");

  // Noch nicht eingeplant (Knopf in der Leiste): neues Projekt auf Max ziehen
  const { data: neuP } = await admin.from("projekte").insert({ name: "ZZ Zählerkasten", status: "aktiv", kunde_id: kunde.id }).select("id").single();
  await chef.reload();
  await chef.waitForTimeout(2500);
  await chef.getByRole("button", { name: /Nicht eingeplant/ }).click();
  const quelle = chef.locator(`[data-projekt-ziehen="${neuP.id}"]`);
  ok(await quelle.count() === 1, "„Noch nicht eingeplant“ zeigt das neue Projekt");
  const ziel = chef.locator(`[data-zelle="${monteurId}"][data-tag="${tag}"]`);
  await ziel.scrollIntoViewIfNeeded();
  const a = await quelle.boundingBox(), b = await ziel.boundingBox();
  if (a && b) {
    await chef.mouse.move(a.x + 20, a.y + 10);
    await chef.mouse.down();
    await chef.mouse.move(a.x - 40, a.y + 30, { steps: 5 });
    // unten in der Zelle (frei — oben steht schon „ZZ Steiger früh“), aber im Bild
    await chef.mouse.move(b.x + b.width / 2, Math.min(b.y + b.height - 20, 880), { steps: 10 });
    await chef.mouse.up();
    await chef.waitForTimeout(1500);
  }
  const { data: gezogen } = await admin.from("termine").select("*").eq("projekt_id", neuP.id);
  ok(gezogen?.length === 1 && gezogen[0].mitarbeiter.includes(monteurId) && gezogen[0].art === "montage" && gezogen[0].kunde_id === kunde.id,
    "Projekt auf Max gezogen = Montage mit Kunde");
  await chef.screenshot({ path: `${BILDER}/kalender-pc-nachher.png` });

  // Monteur: nur lesen
  const max = await anmelden("zz-monteur@test.local", { width: 390, height: 844 });
  await max.goto(`${APP_URL}/kalender`);
  await max.waitForTimeout(2000);
  ok(await max.getByRole("button", { name: "Termin", exact: true }).count() === 0, "Monteur: kein „Termin“-Knopf");
  await max.getByRole("button", { name: "Woche", exact: true }).click();
  await max.waitForTimeout(800);
  ok(await max.getByText("ZZ Zählerkasten").count() > 0, "Monteur sieht seinen Termin in der Woche");
  await max.screenshot({ path: `${BILDER}/kalender-handy-monteur.png`, fullPage: true });
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("termine").delete().or(`kunde_id.eq.${kunde.id},fahrzeuge.cs.{${steiger.id}}`);
  await admin.from("termine").delete().like("titel", "ZZ%");
  await admin.from("projekte").delete().eq("kunde_id", kunde.id);
  await admin.from("fahrzeuge").delete().eq("id", steiger.id);
  await admin.from("kunden").delete().eq("id", kunde.id);
  await admin.auth.admin.deleteUser(chefId);
  await admin.auth.admin.deleteUser(monteurId);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
