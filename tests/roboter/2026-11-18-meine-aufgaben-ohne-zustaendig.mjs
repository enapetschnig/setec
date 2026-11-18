// Probefahrt 18.11.2026 (Stefan): „Obwohl ich für heute eine Aufgabe angelegt habe, erscheint diese
// nicht am Startbildschirm.“ Ursache: „Meine Aufgaben“ zeigte nur Aufgaben, bei denen man zuständig
// ist — eine selbst angelegte ohne Zuständigen sah dort niemand.
// Prüft:
// - Chef legt auf der Startseite über „+ Aufgabe“ eine Aufgabe für heute OHNE Zuständigen an → sie steht sofort unter „Meine Aufgaben“
// - nach Neuladen weiterhin da; eine fremde Aufgabe ohne Zuständigen (anderer Chef) steht NICHT bei ihm
// - eine Aufgabe, die er dem Monteur zuteilt, steht beim Monteur, nicht bei ihm
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55210 API_URL=http://127.0.0.1:55200 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-meine-aufgaben-ohne-zustaendig.mjs
// Legt selbst an (alles „ZZ“): zwei Chefs, einen Monteur, Aufgaben. Räumt danach auf.
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

const chefId = await konto("zz-chef@test.local", "chef", "Chefin");
const chef2Id = await konto("zz-chef2@test.local", "chef", "Zweiter");
const monteurId = await konto("zz-monteur@test.local", "monteur", "Max");
const { error: eA } = await admin.from("aufgaben").insert([
  { titel: "ZZ fremd ohne Zuständigen", zustaendig: [], erstellt_von: chef2Id, faellig_am: heute },
  { titel: "ZZ für Max", zustaendig: [monteurId], erstellt_von: chefId, faellig_am: heute },
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
    const titel = `ZZ Richter anrufen ${name}`;
    const chef = await anmelden("zz-chef@test.local", viewport);
    await chef.goto(`${APP_URL}/`);
    const karte = chef.locator("[data-meine-aufgaben]");
    await karte.waitFor({ timeout: 15000 });
    ok(await karte.getByText("ZZ fremd ohne Zuständigen").count() === 0, `${name}: fremde Aufgabe ohne Zuständigen nicht bei mir`);
    ok(await karte.getByText("ZZ für Max").count() === 0, `${name}: Aufgabe für Max nicht bei mir`);
    // „+ Aufgabe“ in der Karte (nur solange sie leer ist) — sonst über die Aufgaben-Seite
    const plus = chef.getByRole("button", { name: "Aufgabe", exact: true }).last();
    if (name === "pc") await plus.click();
    else { await chef.goto(`${APP_URL}/aufgaben`); await chef.getByRole("button", { name: "Aufgabe", exact: true }).first().click(); }
    await chef.locator("#a-titel").fill(titel);
    const datum = chef.locator("#a-faellig");
    if (await datum.count()) await datum.fill(heute);
    await chef.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await chef.waitForTimeout(1500);
    const { data: neu } = await admin.from("aufgaben").select("zustaendig, erstellt_von").eq("titel", titel).maybeSingle();
    ok(neu && neu.zustaendig.length === 0 && neu.erstellt_von === chefId, `${name}: Aufgabe ohne Zuständigen gespeichert`);
    await chef.goto(`${APP_URL}/`);
    await chef.locator("[data-meine-aufgaben]").waitFor({ timeout: 15000 });
    ok(await chef.locator("[data-meine-aufgaben]").getByText(titel).count() === 1, `${name}: steht nach Neuladen unter „Meine Aufgaben“`);
    await chef.screenshot({ path: `${BILDER}/meine-aufgaben-${name}.png`, fullPage: true });
    await chef.context().close();
  }

  const max = await anmelden("zz-monteur@test.local", { width: 390, height: 844 });
  await max.goto(`${APP_URL}/`);
  await max.locator("[data-meine-aufgaben]").waitFor({ timeout: 15000 });
  ok(await max.locator("[data-meine-aufgaben]").getByText("ZZ für Max").count() === 1, "Monteur sieht die ihm zugeteilte Aufgabe");
  ok(await max.locator("[data-meine-aufgaben]").getByText(/ZZ Richter|ZZ fremd/).count() === 0, "Monteur sieht fremde Aufgaben ohne Zuständigen nicht");
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("aufgaben").delete().like("titel", "ZZ%");
  for (const id of [chefId, chef2Id, monteurId]) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
