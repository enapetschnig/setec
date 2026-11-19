// Probefahrt 19.11.2026 — Zusage aus der Besprechung mit Stefan (17.11.): „Schaden am Auto per App
// mit Fotos protokollieren“ („super“).
// Prüft:
// - Monteur am Handy (390 px): Startseite „Schaden am Fahrzeug melden“ → sein Bus ist vorbelegt →
//   Text + 2 Fotos aus der Galerie (eines 3200 px breit) → Speichern. In der Datenbank: Eintrag
//   „schaden“, offen, von ihm; 2 Zeilen in fahrzeug_eintrag_fotos; 2 Dateien im Bucket fahrzeug-fotos
//   unter <eintrag_id>/ — das große Foto auf 2400 px verkleinert
// - Chef am Handy: Fuhrpark → Bus „1 Schaden offen“ → Bordbuch mit 2 Vorschaubildern → groß ansehen;
//   Chef am PC: Startseite „1 Schaden an Fahrzeugen gemeldet · 2 Fotos“; im Fahrzeug „+ Eintrag“
//   (Service mit km) zieht den km-Stand mit
// - Rechte (Datenbank/Speicher direkt): ein anderer Monteur kann zum fremden Eintrag nichts hochladen,
//   eintragen oder löschen; der Melder nicht zu einem Eintrag des Chefs, seine eingetragenen Fotos
//   löscht er nicht (nur eine nicht eingetragene eigene Datei); ohne Anmeldung und gesperrt: nichts zu sehen
// - Chef löscht den Eintrag → Fotozeilen und Dateien sind weg
// - 390 px ohne waagrechtes Scrollen, Konsole ohne Fehler
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55210 API_URL=http://127.0.0.1:55200 ANON_KEY=… SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-19-schaden-foto.mjs
// Legt selbst an (alles „ZZ“), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const ANON_KEY = process.env.ANON_KEY ?? process.env.VITE_SUPABASE_KEY;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, ANON_KEY und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "fahrzeug-fotos";
const PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle, vorname, { gesperrt = false } = {}) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  if (gesperrt) await admin.from("profiles").update({ gesperrt: true, aktiv: false }).eq("id", data.user.id);
  return data.user.id;
}
async function als(email) {
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}
const dateienIm = async (ordner) => ((await admin.storage.from(BUCKET).list(ordner)).data ?? []).filter((d) => d.id);

/** Breite × Höhe aus dem SOF-Block eines JPEG */
function jpegGroesse(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), b: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
const ids = {};
const fz = {};
let lagerId;
let eintragId;
let chefEintragId;
const fehler = [];
let browser;
try {
  ids.chef = await konto("zz-sf-chef@test.local", "chef", "Stefan");
  ids.max = await konto("zz-sf-max@test.local", "monteur", "Max");
  ids.fremd = await konto("zz-sf-fremd@test.local", "monteur", "Fritz");
  ids.gesperrt = await konto("zz-sf-gesperrt@test.local", "monteur", "Gustav", { gesperrt: true });
  // Max fährt „ZZ Bus Schaden“ (Lagerort im Bus gehört ihm) — der soll vorbelegt sein
  const { data: lager, error: eL } = await admin.from("lagerorte").insert({ name: "ZZ Bus Max", art: "fahrzeug", user_id: ids.max }).select("id").single();
  if (eL) throw eL;
  lagerId = lager.id;
  const { data: fzs, error: eF } = await admin.from("fahrzeuge").insert([
    { name: "ZZ Steiger", art: "steiger", kennzeichen: "BM-1 ZZ", lagerort_id: null, km_stand: null, reihenfolge: 0 },
    { name: "ZZ Bus Schaden", art: "bus", kennzeichen: "BM-2 ZZ", lagerort_id: lagerId, km_stand: 81234, reihenfolge: 1 },
  ]).select("id, name");
  if (eF) throw eF;
  fz.steiger = fzs.find((f) => f.name === "ZZ Steiger").id;
  fz.bus = fzs.find((f) => f.name === "ZZ Bus Schaden").id;

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  async function anmelden(email, viewport) {
    const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(`[${email}] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") fehler.push(`[${email}] Konsole: ${m.text()}`); });
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(email);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    return page;
  }
  const breitOk = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ── 1. Monteur meldet am Handy mit 2 Fotos ───────────────────────────────
  const max = await anmelden("zz-sf-max@test.local", { width: 390, height: 844 });
  const knopf = max.locator("[data-schaden-melden]");
  await knopf.waitFor({ timeout: 15000 });
  ok(await breitOk(max), "Handy Monteur: Startseite ohne waagrechtes Scrollen");
  await knopf.click();
  await max.locator("[data-eintrag-dialog]").waitFor({ timeout: 10000 });
  await max.waitForFunction(() => document.querySelector("#b-fahrzeug")?.textContent?.includes("ZZ Bus Schaden"), null, { timeout: 10000 }).catch(() => {});
  ok((await max.locator("#b-fahrzeug").textContent())?.includes("ZZ Bus Schaden"), "sein Bus ist vorbelegt (Lagerort im Bus)");
  ok(await max.locator("#b-km").inputValue() === "81234", "km-Stand des Busses vorbelegt");
  ok(await max.getByRole("button", { name: "Schaden", exact: true }).getAttribute("aria-pressed") === "true", "Art „Schaden“ gewählt");
  await max.locator("#b-text").fill("ZZ Seitenspiegel rechts gebrochen");
  // großes Foto wie vom Handy (3200 × 2400), im Browser gemalt
  const gross = await max.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 3200; c.height = 2400;
    const g = c.getContext("2d");
    g.fillStyle = "#866634"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff"; g.font = "220px sans-serif"; g.fillText("ZZ Spiegel", 300, 1300);
    const blob = await new Promise((fertig) => c.toBlob(fertig, "image/jpeg", 0.9));
    const roh = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < roh.length; i += 0x8000) s += String.fromCharCode(...roh.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await max.getByLabel("Fotos aus der Galerie").setInputFiles([
    { name: "spiegel.jpg", mimeType: "image/jpeg", buffer: Buffer.from(gross, "base64") },
    { name: "kratzer.png", mimeType: "image/png", buffer: PNG },
  ]);
  await max.locator("[data-schaden-fotos] img").nth(1).waitFor({ timeout: 10000 });
  ok(await max.locator("[data-schaden-fotos] img").count() === 2, "2 Vorschaubilder im Dialog");
  ok(await breitOk(max), "Handy Monteur: Dialog mit Fotos ohne waagrechtes Scrollen");
  await max.waitForTimeout(300);
  await max.screenshot({ path: `${BILDER}/schaden-foto-monteur.png` });
  await max.getByRole("button", { name: "Speichern" }).click();
  await max.getByText(/Schaden gemeldet · 2 Fotos/).first().waitFor({ timeout: 20000 });
  await max.locator("[data-eintrag-dialog]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  ok(await max.locator("[data-eintrag-dialog]").count() === 0, "Dialog nach dem Speichern zu");

  const { data: eintraege } = await admin.from("fahrzeug_eintraege").select("id, fahrzeug_id, art, erledigt, erstellt_von, km, text").eq("text", "ZZ Seitenspiegel rechts gebrochen");
  ok(eintraege?.length === 1, "ein Eintrag in fahrzeug_eintraege");
  const e = eintraege?.[0];
  eintragId = e?.id;
  ok(e?.fahrzeug_id === fz.bus && e?.art === "schaden" && e?.erledigt === false && e?.erstellt_von === ids.max && e?.km === 81234,
    "Eintrag: am Bus, Schaden, offen, von Max, km 81234");
  const { data: fotos } = await admin.from("fahrzeug_eintrag_fotos").select("pfad, name, mime, groesse, erstellt_von").eq("eintrag_id", eintragId);
  ok(fotos?.length === 2 && fotos.every((f) => f.erstellt_von === ids.max && f.pfad.startsWith(`${eintragId}/`) && f.groesse > 0),
    "2 Fotozeilen von Max, Pfad <eintrag_id>/…");
  const dateien = await dateienIm(eintragId);
  ok(dateien.length === 2, "2 Dateien im Bucket fahrzeug-fotos unter dem Eintrag");
  const grossesFoto = fotos?.find((f) => f.name === "spiegel.jpg");
  if (grossesFoto) {
    const { data: blob } = await admin.storage.from(BUCKET).download(grossesFoto.pfad);
    const masse = blob ? jpegGroesse(Buffer.from(await blob.arrayBuffer())) : null;
    ok(masse?.b === 2400 && masse?.h === 1800, `großes Foto auf 2400 px verkleinert (${masse ? `${masse.b} × ${masse.h}` : "nicht lesbar"})`);
  } else ok(false, "großes Foto gespeichert");
  await max.context().close();

  // ── 2. Chef sieht die Fotos ──────────────────────────────────────────────
  const chef = await anmelden("zz-sf-chef@test.local", { width: 390, height: 844 });
  await chef.goto(`${APP_URL}/fuhrpark`);
  const karte = chef.locator(`[data-fahrzeug="${fz.bus}"]`);
  await karte.waitFor({ timeout: 15000 });
  ok(await karte.getByText("1 Schaden offen").count() === 1, "Fuhrpark: Bus zeigt „1 Schaden offen“");
  await karte.click();
  const zeile = chef.locator(`[data-eintrag="${eintragId}"]`);
  await zeile.waitFor({ timeout: 15000 });
  await chef.waitForFunction((id) => {
    const imgs = [...document.querySelectorAll(`[data-eintrag="${id}"] img`)];
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, eintragId, { timeout: 15000 }).catch(() => {});
  ok(await zeile.locator("img").evaluateAll((l) => l.length === 2 && l.every((i) => i.naturalWidth > 0)), "Bordbuch: 2 Vorschaubilder geladen");
  ok(await breitOk(chef), "Handy Chef: Fahrzeug mit Fotos ohne waagrechtes Scrollen");
  await zeile.scrollIntoViewIfNeeded();
  await chef.waitForTimeout(400); // Dialog fertig eingeblendet
  await chef.screenshot({ path: `${BILDER}/schaden-foto-chef.png` });
  await zeile.getByRole("button", { name: "Foto 1 von 2 ansehen" }).click();
  const gross1 = chef.getByRole("dialog", { name: "Foto 1 von 2" });
  await gross1.waitFor({ timeout: 10000 });
  await chef.waitForFunction(() => [...document.querySelectorAll("[role=dialog] img")].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
  ok(await gross1.locator("img").evaluateAll((l) => l.some((i) => i.naturalWidth > 0)), "Foto groß ansehen (Bildbetrachter)");
  ok(await gross1.getByText("Max ZZ").count() >= 1, "im Bildbetrachter: wer fotografiert hat");
  await chef.waitForTimeout(400);
  await chef.screenshot({ path: `${BILDER}/schaden-foto-gross.png` });
  await gross1.getByRole("button", { name: "Schließen" }).click();
  // Der Chef trägt im offenen Fahrzeug selbst ein („+ Eintrag“, ausgelagerter Dialog): Service mit km zieht den km-Stand mit
  await chef.getByRole("button", { name: "Eintrag", exact: true }).click();
  const eintragDlg = chef.getByRole("dialog", { name: "Bordbuch-Eintrag" });
  await eintragDlg.waitFor({ timeout: 10000 });
  ok(await eintragDlg.getByRole("button", { name: "Service", exact: true }).getAttribute("aria-pressed") === "true", "Chef: „+ Eintrag“ mit Art Service");
  await eintragDlg.locator("#b-text").fill("ZZ Ölwechsel");
  await eintragDlg.locator("#b-km").fill("82000");
  await eintragDlg.getByRole("button", { name: "Speichern" }).click();
  await eintragDlg.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  const { data: service } = await admin.from("fahrzeug_eintraege").select("art, km, erledigt, erstellt_von").eq("text", "ZZ Ölwechsel");
  const { data: busNeu } = await admin.from("fahrzeuge").select("km_stand").eq("id", fz.bus).single();
  ok(service?.length === 1 && service[0].art === "service" && service[0].km === 82000 && service[0].erledigt === true
    && service[0].erstellt_von === ids.chef && busNeu?.km_stand === 82000, "Chef: Service-Eintrag gespeichert, km-Stand des Busses auf 82.000");
  await chef.context().close();

  const chefPc = await anmelden("zz-sf-chef@test.local", { width: 1440, height: 1000 });
  await chefPc.locator("[data-zu-erledigen]").waitFor({ timeout: 15000 });
  await chefPc.getByText("1 Schaden an Fahrzeugen gemeldet · 2 Fotos").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await chefPc.getByText("1 Schaden an Fahrzeugen gemeldet · 2 Fotos").count() === 1, "PC-Startseite: „1 Schaden an Fahrzeugen gemeldet · 2 Fotos“");
  ok(await chefPc.locator("[data-schaden-melden]").count() === 0, "Chef: kein eigener Startseiten-Knopf (er hat den Fuhrpark)");
  await chefPc.context().close();

  // ── 3. Rechte direkt in Datenbank und Speicher ────────────────────────────
  const fremd = await als("zz-sf-fremd@test.local");
  const { error: eUp } = await fremd.storage.from(BUCKET).upload(`${eintragId}/fremd.png`, PNG, { contentType: "image/png" });
  ok(!!eUp, `fremder Monteur: Hochladen zum fremden Eintrag abgelehnt${eUp ? "" : " — ging durch!"}`);
  const { error: eZeile } = await fremd.from("fahrzeug_eintrag_fotos").insert({ eintrag_id: eintragId, pfad: `${eintragId}/fremd.png` });
  ok(!!eZeile, "fremder Monteur: Fotozeile zum fremden Eintrag abgelehnt");
  await fremd.from("fahrzeug_eintrag_fotos").delete().eq("eintrag_id", eintragId);
  await fremd.storage.from(BUCKET).remove(fotos.map((f) => f.pfad));
  const { count: nochZeilen } = await admin.from("fahrzeug_eintrag_fotos").select("id", { count: "exact", head: true }).eq("eintrag_id", eintragId);
  ok(nochZeilen === 2 && (await dateienIm(eintragId)).length === 2, "fremder Monteur: kann Fotos (Zeilen, Dateien) nicht löschen");

  const maxApi = await als("zz-sf-max@test.local");
  const { data: chefE } = await admin.from("fahrzeug_eintraege").insert({ fahrzeug_id: fz.bus, art: "service", text: "ZZ Service vom Chef", erstellt_von: ids.chef }).select("id").single();
  chefEintragId = chefE.id;
  const { error: eUp2 } = await maxApi.storage.from(BUCKET).upload(`${chefEintragId}/max.png`, PNG, { contentType: "image/png" });
  const { error: eZeile2 } = await maxApi.from("fahrzeug_eintrag_fotos").insert({ eintrag_id: chefEintragId, pfad: `${chefEintragId}/max.png` });
  ok(!!eUp2 && !!eZeile2, "Monteur: zum Eintrag des Chefs weder Datei noch Zeile");
  await maxApi.storage.from(BUCKET).remove([fotos[0].pfad]);
  ok((await dateienIm(eintragId)).length === 2, "Monteur: sein eingetragenes Foto löscht er nicht");
  // Hochladen gelang, Zeile nicht → die eigene, nicht eingetragene Datei darf er wegräumen
  const { error: eUp3 } = await maxApi.storage.from(BUCKET).upload(`${eintragId}/ohne-zeile.png`, PNG, { contentType: "image/png" });
  ok(!eUp3, "Monteur: zum eigenen Eintrag hochladen geht");
  await maxApi.storage.from(BUCKET).remove([`${eintragId}/ohne-zeile.png`]);
  ok(!(await dateienIm(eintragId)).some((d) => d.name === "ohne-zeile.png"), "Monteur: eigene, nicht eingetragene Datei wieder weg (Aufräumen)");

  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: anonUrl } = await anon.storage.from(BUCKET).createSignedUrl(fotos[0].pfad, 60);
  const { data: anonZeilen } = await anon.from("fahrzeug_eintrag_fotos").select("id").eq("eintrag_id", eintragId);
  ok(!anonUrl?.signedUrl && !anonZeilen?.length, "ohne Anmeldung: weder Datei noch Zeilen");
  const gesperrt = await als("zz-sf-gesperrt@test.local");
  const { data: gUrl } = await gesperrt.storage.from(BUCKET).createSignedUrl(fotos[0].pfad, 60);
  const { data: gZeilen } = await gesperrt.from("fahrzeug_eintrag_fotos").select("id").eq("eintrag_id", eintragId);
  const { error: gUp } = await gesperrt.storage.from(BUCKET).upload(`${eintragId}/g.png`, PNG, { contentType: "image/png" });
  ok(!gUrl?.signedUrl && !gZeilen?.length && !!gUp, "gesperrtes Konto: nichts sehen, nichts hochladen");
  const { data: fUrl } = await fremd.storage.from(BUCKET).createSignedUrl(fotos[0].pfad, 60);
  ok(!!fUrl?.signedUrl, "aktiver Kollege sieht die Fotos (wie die Bordbuch-Einträge)");

  // ── 4. Chef löscht den Eintrag → Fotos mit ───────────────────────────────
  const chef2 = await anmelden("zz-sf-chef@test.local", { width: 390, height: 844 });
  await chef2.goto(`${APP_URL}/fuhrpark`);
  await chef2.locator(`[data-fahrzeug="${fz.bus}"]`).click();
  const zeile2 = chef2.locator(`[data-eintrag="${eintragId}"]`);
  await zeile2.waitFor({ timeout: 15000 });
  await zeile2.getByRole("button", { name: "Eintrag löschen" }).click();
  const frage = chef2.getByRole("alertdialog");
  await frage.waitFor({ timeout: 5000 });
  ok(await frage.getByText(/samt 2 Fotos/).count() === 1, "Rückfrage nennt die Fotos");
  await frage.getByRole("button", { name: "Löschen" }).click();
  await zeile2.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await chef2.waitForTimeout(800);
  const { count: eintragDa } = await admin.from("fahrzeug_eintraege").select("id", { count: "exact", head: true }).eq("id", eintragId);
  const { count: zeilenDa } = await admin.from("fahrzeug_eintrag_fotos").select("id", { count: "exact", head: true }).eq("eintrag_id", eintragId);
  ok(eintragDa === 0 && zeilenDa === 0, "Eintrag und Fotozeilen gelöscht (on delete cascade)");
  ok((await dateienIm(eintragId)).length === 0, "Dateien im Speicher gelöscht");
  await chef2.context().close();

  ok(fehler.length === 0, `keine Seitenfehler und Konsolenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  // Aufräumen: Dateien (über die Storage-API), Einträge samt Fotozeilen, Fahrzeuge, Lagerort, Konten
  const { data: reste } = await admin.from("fahrzeug_eintraege").select("id").in("fahrzeug_id", Object.values(fz));
  for (const r of reste ?? []) {
    const weg = await dateienIm(r.id);
    if (weg.length) await admin.storage.from(BUCKET).remove(weg.map((d) => `${r.id}/${d.name}`));
  }
  if (eintragId) {
    const weg = await dateienIm(eintragId);
    if (weg.length) await admin.storage.from(BUCKET).remove(weg.map((d) => `${eintragId}/${d.name}`));
  }
  if (Object.values(fz).length) await admin.from("fahrzeuge").delete().in("id", Object.values(fz));
  if (lagerId) await admin.from("lagerorte").delete().eq("id", lagerId);
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
