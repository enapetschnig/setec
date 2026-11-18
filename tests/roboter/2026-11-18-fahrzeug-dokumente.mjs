// Probefahrt 18.11.2026 (Stefan, Fuhrpark): „Bei Fahrzeugen und Maschinen eine Schnittstelle zu den
// Dokumenten — Leasingvertrag, Versicherungspolizze, Rechnung für den Garantiefall, auch Bilder
// (Typenschild).“
// Prüft:
// - Chef öffnet im Fuhrpark eine Maschine → „Dokument / Foto“ → Foto vom Typenschild hochladen:
//   in firmen_dokumente mit fahrzeug_id und Ordner „Fuhrpark“, im Fahrzeug mit Vorschaubild sichtbar
// - Polizze als PDF „nur für den Chef“: im Fahrzeug da
// - unter Dokumente im Ordner „Fuhrpark“ mit dem Namen der Maschine; Suche nach dem Maschinennamen findet sie
// - Monteur sieht das Typenschild-Foto, nicht die Chef-Polizze, und hat keinen Knopf zum Ablegen
// - Handy (390 px) und PC
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55310 API_URL=http://127.0.0.1:55300 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-fahrzeug-dokumente.mjs
// Legt selbst an (alles „ZZ“), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

// Kleine echte Dateien: PNG (1×1, rot) und ein PDF
const ordner = mkdtempSync(join(tmpdir(), "zz-fz-"));
const png = join(ordner, "typenschild.png");
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));
const pdf = join(ordner, "polizze.pdf");
writeFileSync(pdf, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const ids = {};
let fz;
const fehler = [];
let browser;
try {
  ids.chef = await konto("zz-fz-chef@test.local", "chef", "Stefan");
  ids.monteur = await konto("zz-fz-monteur@test.local", "monteur", "Max");
  const { data, error } = await admin.from("fahrzeuge").insert({ name: "ZZ Bohrhammer", art: "maschine" }).select("id").single();
  if (error) throw error;
  fz = data.id;

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
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
  async function ablegen(page, datei, titel, nurChef) {
    await page.getByRole("button", { name: "Dokument / Foto" }).click();
    await page.getByLabel("Datei", { exact: true }).setInputFiles(datei);
    await page.locator("#d-titel").fill(titel);
    if (nurChef) await page.getByRole("switch", { name: "Nur für den Chef" }).click();
    await page.getByRole("button", { name: "Hochladen" }).click();
    await page.getByText(titel).first().waitFor({ timeout: 15000 });
  }

  for (const [name, viewport] of [["handy", { width: 390, height: 844 }], ["pc", { width: 1440, height: 1000 }]]) {
    const chef = await anmelden("zz-fz-chef@test.local", viewport);
    await chef.goto(`${APP_URL}/fuhrpark`);
    await chef.locator(`[data-fahrzeug="${fz}"]`).click();
    await chef.locator("[data-fahrzeug-dokumente]").waitFor({ timeout: 15000 });
    await ablegen(chef, png, `ZZ Typenschild ${name}`, false);
    await ablegen(chef, pdf, `ZZ Polizze ${name}`, true);
    const { data: d } = await admin.from("firmen_dokumente").select("fahrzeug_id, ordner, nur_chef, mime").like("titel", `ZZ % ${name}`);
    ok(d?.length === 2 && d.every((x) => x.fahrzeug_id === fz && x.ordner === "Fuhrpark"), `${name}: beide am Fahrzeug, Ordner „Fuhrpark“`);
    ok(d?.some((x) => x.nur_chef && x.mime === "application/pdf") && d?.some((x) => !x.nur_chef && x.mime?.startsWith("image/")), `${name}: Polizze nur Chef, Foto für alle`);
    await chef.locator("[data-fahrzeug-dokumente] img").first().waitFor({ timeout: 10000 });
    ok(true, `${name}: Vorschaubild vom Typenschild im Fahrzeug`);
    await chef.screenshot({ path: `${BILDER}/fahrzeug-dokumente-${name}.png`, fullPage: true });

    await chef.goto(`${APP_URL}/dokumente`);
    const fuhrpark = chef.locator('[data-ordner="Fuhrpark"]');
    await fuhrpark.waitFor({ timeout: 15000 });
    ok(await fuhrpark.getByText(`ZZ Typenschild ${name}`).count() === 1, `${name}: unter Dokumente im Ordner „Fuhrpark“`);
    ok(await fuhrpark.getByText("ZZ Bohrhammer").count() >= 1, `${name}: dort mit dem Namen der Maschine`);
    await chef.getByLabel("Dokumente suchen").fill("Bohrhammer");
    await chef.waitForTimeout(400);
    ok(await chef.getByText(`ZZ Polizze ${name}`).count() === 1, `${name}: Suche nach dem Maschinennamen findet die Polizze`);
    await chef.context().close();
  }

  const max = await anmelden("zz-fz-monteur@test.local", { width: 390, height: 844 });
  await max.goto(`${APP_URL}/fuhrpark`);
  await max.locator(`[data-fahrzeug="${fz}"]`).click();
  await max.locator("[data-fahrzeug-dokumente]").waitFor({ timeout: 15000 });
  await max.waitForTimeout(1500);
  ok(await max.getByText("ZZ Typenschild handy").count() === 1, "Monteur sieht das Typenschild-Foto");
  ok(await max.getByText(/ZZ Polizze/).count() === 0, "Monteur sieht die Chef-Polizze nicht");
  ok(await max.getByRole("button", { name: "Dokument / Foto" }).count() === 0, "Monteur hat keinen Knopf zum Ablegen");
  await max.context().close();
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  const { data: weg } = await admin.from("firmen_dokumente").select("pfad").like("titel", "ZZ %");
  if (weg?.length) await admin.storage.from("firmen-dokumente").remove(weg.map((d) => d.pfad));
  await admin.from("firmen_dokumente").delete().like("titel", "ZZ %");
  if (fz) await admin.from("fahrzeuge").delete().eq("id", fz);
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
