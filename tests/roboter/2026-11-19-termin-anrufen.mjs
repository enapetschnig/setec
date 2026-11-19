// Probefahrt 19.11.2026 (Stefan, Startseite): „Termin verschieben … Kunden anrufen. Dieser Button wäre bei der Terminansicht eine Erleichterung.“
// Ursache: „Anrufen“ nahm die Nummer nur über das Projekt — Besichtigungen haben nur einen Kunden (termine.kunde_id), kein Projekt.
// Prüft:
// - Startseite (Handy, Chef und Monteur): Besichtigung ohne Projekt hat „Anrufen“ mit tel:-Link auf die Kundennummer
// - Montage mit Projekt (ohne kunde_id am Termin): weiterhin „Anrufen“ über den Projekt-Kunden
// - Kunde ohne Telefonnummer: kein Knopf
// - aufgeklappt („Projekt, Kunde, Adresse“): Kunde mit Nummer
// - Kalender PC: kleines Fenster am Termin hat „Anrufen“; Termin-Formular (Handy-Kalender öffnet es direkt) ebenso
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=… API_URL=… SERVICE_ROLE_KEY=… node tests/roboter/2026-11-19-termin-anrufen.mjs
// Legt selbst an (alles „ZZ TA <Lauf>“): Chef, Monteur, drei Kunden, ein Projekt, drei Termine heute. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY) throw new Error("APP_URL, API_URL und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
const LAUF = Math.random().toString(36).slice(2, 6);
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefEmail = `zz-ta-chef-${LAUF}@test.local`, monteurEmail = `zz-ta-monteur-${LAUF}@test.local`;
const chefId = await konto(chefEmail, "chef", "Chefin");
const monteurId = await konto(monteurEmail, "monteur", "Max");
const { data: kunden, error: eK } = await admin.from("kunden").insert([
  { name: `ZZ TA Sommer ${LAUF}`, telefon: "0664 123 45 67", strasse: "Weg 1", plz: "8605", ort: "Kapfenberg", art: "kunde" },
  { name: `ZZ TA Projektkunde ${LAUF}`, telefon: "+43 3865 9988", strasse: "Weg 2", plz: "8650", ort: "Kindberg", art: "kunde" },
  { name: `ZZ TA Ohnetel ${LAUF}`, telefon: null, strasse: "Weg 3", plz: "8650", ort: "Kindberg", art: "kunde" },
]).select("id, name");
if (eK) throw eK;
const [besKunde, projKunde, ohneKunde] = kunden;
const { data: projekt, error: eP } = await admin.from("projekte").insert({ name: `ZZ TA Projekt ${LAUF}`, kunde_id: projKunde.id, status: "aktiv" }).select("id").single();
if (eP) throw eP;
const alle = [chefId, monteurId];
const { data: termine, error: eT } = await admin.from("termine").insert([
  { titel: `Besichtigung ZZ TA Sommer ${LAUF}`, art: "besichtigung", datum: heute, von: "08:00", bis: "09:00", kunde_id: besKunde.id, projekt_id: null, ort: "Weg 1, 8605 Kapfenberg", mitarbeiter: alle, fahrzeuge: [] },
  { titel: `Montage ZZ TA ${LAUF}`, art: "montage", datum: heute, von: "10:00", bis: "12:00", kunde_id: null, projekt_id: projekt.id, ort: "Weg 2, 8650 Kindberg", mitarbeiter: alle, fahrzeuge: [] },
  { titel: `Besichtigung ZZ TA Ohne ${LAUF}`, art: "besichtigung", datum: heute, von: "13:00", bis: "14:00", kunde_id: ohneKunde.id, projekt_id: null, ort: "Weg 3, 8650 Kindberg", mitarbeiter: alle, fahrzeuge: [] },
]).select("id, titel");
if (eT) throw eT;
const [tBes, tMont, tOhne] = termine;

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
const karteVon = (p, titel) => p.locator('section[aria-label="Heute eingeteilt"] li').filter({ hasText: titel }).first();

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const [name, email] of [["chef", chefEmail], ["monteur", monteurEmail]]) {
    const p = await anmelden(email, { width: 390, height: 844 });
    await p.goto(`${APP_URL}/`);
    const bes = karteVon(p, tBes.titel);
    await bes.waitFor({ timeout: 20000 });
    await p.waitForTimeout(800);
    ok(await bes.locator("[data-kunde-anrufen] >> visible=true").first().getAttribute("href") === "tel:06641234567", `${name} Startseite: Besichtigung ohne Projekt → Anrufen tel:06641234567`);
    const mont = karteVon(p, tMont.titel);
    ok(await mont.locator("[data-kunde-anrufen]").first().getAttribute("href") === "tel:+4338659988", `${name} Startseite: Montage → Anrufen über den Projekt-Kunden`);
    ok(await karteVon(p, tOhne.titel).locator("[data-kunde-anrufen]").count() === 0, `${name} Startseite: Kunde ohne Nummer → kein Knopf`);
    await p.screenshot({ path: `${BILDER}/termin-anrufen-start-${name}.png`, fullPage: true });
    await bes.getByRole("button", { name: "Projekt, Kunde, Adresse" }).click();
    const details = bes.locator("[data-einsatz-details]");
    await details.waitFor({ timeout: 5000 });
    ok(await details.locator('a[href="tel:06641234567"]').count() === 1 && (await details.innerText()).includes(besKunde.name), `${name} aufgeklappt: Kunde mit Nummer`);
    await p.context().close();
  }

  // Kalender PC: kleines Fenster am Termin
  const chef = await anmelden(chefEmail, { width: 1440, height: 1000 });
  await chef.goto(`${APP_URL}/kalender`);
  const block = chef.locator(`[data-block="${tBes.id}"]`).first();
  await block.waitFor({ timeout: 20000 });
  await block.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await chef.waitForTimeout(300);
  await block.click();
  const info = chef.locator("[data-balken-info]");
  await info.waitFor({ timeout: 5000 });
  ok(await info.locator("[data-kunde-anrufen]").getAttribute("href") === "tel:06641234567", "Kalender PC: Anrufen im Fenster am Termin");
  await chef.screenshot({ path: `${BILDER}/termin-anrufen-kalender.png` });
  // Bearbeiten → Termin-Formular
  await info.getByRole("button", { name: "Bearbeiten" }).click();
  const dialog = chef.getByRole("dialog").filter({ hasText: "Kunde" }).last();
  await dialog.waitFor({ timeout: 5000 });
  ok(await dialog.locator('[data-kunde-anrufen]').getAttribute("href") === "tel:06641234567", "Termin-Formular: Anrufen beim Kunden");
  await chef.screenshot({ path: `${BILDER}/termin-anrufen-formular.png` });
  await chef.keyboard.press("Escape");
  await chef.waitForTimeout(300);
  // Montage mit Projekt (Kunde kommt aus dem Projekt)
  const block2 = chef.locator(`[data-block="${tMont.id}"]`).first();
  await block2.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await chef.waitForTimeout(300);
  await block2.click();
  await info.waitFor({ timeout: 5000 });
  ok(await info.locator("[data-kunde-anrufen]").getAttribute("href") === "tel:+4338659988", "Kalender PC: Montage → Anrufen über den Projekt-Kunden");
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("termine").delete().in("id", termine.map((t) => t.id));
  await admin.from("projekte").delete().eq("id", projekt.id);
  await admin.from("kunden").delete().in("id", kunden.map((k) => k.id));
  for (const id of [chefId, monteurId]) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
