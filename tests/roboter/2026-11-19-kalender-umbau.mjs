// Probefahrt 19.11.2026: Kalender-Umbau vom 18.11. (95c5269) — jeder Schritt in der Datenbank nachgeprüft.
// (a) Tageszeile „+ Fahrzeug“: Gerät zu einem Termin („Mitnehmen zu“), im Kärtchen „Dabei bei“ mit ✕ wieder weg,
//     „Eigenen Termin für …“ = großes Formular mit dem Gerät
// (b) Schnell einplanen (ZellWahl): Zelle antippen → Projekt = Montage 07:00–15:30 mit der Person, aufgezogen =
//     genau der Zeitraum, Enter = erster Treffer, Kunde = Besichtigung (Projekt im Angebot steht nicht zur Wahl),
//     gleiches Projekt + gleicher Zeitraum = Person kommt dazu, „Rückgängig“; auf einer Abwesenheit: bearbeiten,
//     löschen, trotzdem einplanen
// (c) Monatskalender rechts springt in die Woche; Knopf „Nicht eingeplant“ zeigt die Liste (Suche nur „In Arbeit“)
// (d) Versteckte Konten (ePower) nirgends: Spalten, Filter, ZellWahl, kleines Fenster, Fahrzeug-Fenster,
//     Termin-Dialog — auch nicht für sich selbst (neuer Termin teilt ihn nicht unsichtbar ein)
// (e) Handy 390 px: Tag/Person/Woche ohne waagrechtes Überlaufen, im Tag die Fahrzeuge + „+ Fahrzeug“,
//     Block → kleines Fenster → „Erstaufnahme“, Konsole ohne Fehler
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-19-kalender-umbau.mjs
// Legt alles mit „ZZK“ + Laufkennung an (4 Konten, 2 Kunden, 4 Projekte, 2 Geräte, 1 Termin, 1 Urlaub), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY) throw new Error("APP_URL, API_URL und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
const LAUF = Date.now().toString(36);
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

// Die gezeigte Woche (Montag bis Freitag) — der Kalender öffnet mit der Woche von heute
const wien = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(d);
const plusTage = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wochentag = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const heute = wien(new Date());
const montag = plusTage(heute, -wochentag(heute));
const tag = (i) => plusTage(montag, i);
const kurz = (iso) => `${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][wochentag(iso)]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const datumText = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
function kw(iso) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const uhr = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const warten = (page, ms = 1200) => page.waitForTimeout(ms);

async function konto(email, rolle, vorname, extra = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const { error: e2 } = await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: `ZZK${LAUF}`, passwort_neu: false, ...extra }).eq("id", data.user.id);
  if (e2) throw e2;
  return data.user.id;
}
const MAIL = { chef: `zzk-chef-${LAUF}@test.local`, max: `zzk-max-${LAUF}@test.local`, lisa: `zzk-lisa-${LAUF}@test.local`, versteckt: `zzk-versteckt-${LAUF}@test.local` };
const ids = {};
const kundenIds = [];
const projektIds = [];
const fahrzeugIds = [];
const fehler = [];
let browser;

async function anmelden(email, viewport, touch = false, konsole = null) {
  const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna", hasTouch: touch });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(`[${email}] ${e.message}`));
  // Realtime läuft in der Testumgebung nicht — dessen WebSocket-Fehler gehören nicht zur App
  if (konsole) page.on("console", (m) => { if (m.type() === "error" && !/realtime\/v1\/websocket/.test(m.text())) konsole.push(m.text().slice(0, 300)); });
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill(email);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  return page;
}

// ── PC: Zellen der Tafel (24 px je Stunde) ──
const STD = 24;
let AB = 6 * 60;
/** Zelle in die Mitte der Tafel rollen (nicht unter die klebenden Kopfzeilen) und das Scroll-Ereignis abwarten */
async function zelle(page, person, iso) {
  const z = page.locator(`[data-zelle="${person}"][data-tag="${iso}"]`);
  await z.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(300);
  return z.boundingBox();
}
const yVon = (b, minute) => b.y + ((minute - AB) / 60) * STD + 1;
async function tippen(page, person, iso, minute) {
  const b = await zelle(page, person, iso);
  await page.mouse.click(b.x + b.width * 0.85, yVon(b, minute));
}
async function aufziehen(page, person, iso, von, bis) {
  const b = await zelle(page, person, iso);
  const x = b.x + b.width * 0.85;
  await page.mouse.move(x, yVon(b, von));
  await page.mouse.down();
  await page.mouse.move(x, yVon(b, bis), { steps: 10 });
  await page.mouse.up();
}
/** Block öffnen: erst ins Bild rollen — rollt click() selbst, schließt das späte Scroll-Ereignis das Fenster wieder */
async function blockOeffnen(page, id) {
  const block = page.locator(`[data-block="${id}"]`).first();
  await block.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(300);
  await block.click();
}
const termin = async (id) => (await admin.from("termine").select("*").eq("id", id).single()).data;
const termineVon = async (filter) => {
  let q = admin.from("termine").select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  return (await q).data ?? [];
};
const gleich = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());
const ueberlauf = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));

try {
  // ── Daten ──
  ids.chef = await konto(MAIL.chef, "chef", "Chefin");
  ids.max = await konto(MAIL.max, "monteur", "Max");
  ids.lisa = await konto(MAIL.lisa, "monteur", "Lisa");
  ids.versteckt = await konto(MAIL.versteckt, "chef", "Versteckt", { versteckt: true });
  const { data: kunden, error: eK } = await admin.from("kunden").insert([
    { name: `ZZK Kunde Huber ${LAUF}`, strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
    { name: `ZZK Kunde Moser ${LAUF}`, strasse: "Bachgasse 7", plz: "8650", ort: "Kindberg" },
  ]).select("id, name");
  if (eK) throw eK;
  const huber = kunden.find((k) => k.name.includes("Huber"));
  const moser = kunden.find((k) => k.name.includes("Moser"));
  kundenIds.push(huber.id, moser.id);
  const { data: prj, error: eP } = await admin.from("projekte").insert([
    { name: `ZZK PV Dach ${LAUF}`, status: "aktiv", kunde_id: huber.id, strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" },
    { name: `ZZK Zählerkasten ${LAUF}`, status: "aktiv", kunde_id: huber.id, strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
    { name: `ZZK Speicher ${LAUF}`, status: "angebot", kunde_id: huber.id, strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
    { name: `ZZK Wallbox ${LAUF}`, status: "angebot", kunde_id: moser.id, strasse: "Bachgasse 7", plz: "8650", ort: "Kindberg" },
  ]).select("id, name");
  if (eP) throw eP;
  projektIds.push(...prj.map((p) => p.id));
  const pv = prj.find((p) => p.name.includes("PV Dach"));
  const zaehler = prj.find((p) => p.name.includes("Zählerkasten"));
  const { data: fz, error: eF } = await admin.from("fahrzeuge").insert([
    { name: `ZZK Steiger ${LAUF}`, art: "steiger" },
    { name: `ZZK Bus ${LAUF}`, art: "bus" },
  ]).select("id, name");
  if (eF) throw eF;
  fahrzeugIds.push(...fz.map((f) => f.id));
  const steiger = fz.find((f) => f.name.includes("Steiger"));
  const bus = fz.find((f) => f.name.includes("Bus"));
  // Montag: Max (und das versteckte Konto) im Lager — dorthin nimmt der Chef Geräte mit
  const { data: lager, error: eT } = await admin.from("termine").insert({
    titel: `ZZK Lager ${LAUF}`, art: "buero", datum: tag(0), von: "07:00", bis: "12:00", mitarbeiter: [ids.max, ids.versteckt], fahrzeuge: [],
  }).select("id, titel").single();
  if (eT) throw eT;
  // Freitag: Lisa auf Urlaub
  const { data: urlaub, error: eA } = await admin.from("abwesenheiten").insert({ user_id: ids.lisa, art: "urlaub", von: tag(4), bis: tag(4), status: "genehmigt" }).select("id").single();
  if (eA) throw eA;

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const chef = await anmelden(MAIL.chef, { width: 1440, height: 900 });
  await chef.goto(`${APP_URL}/kalender`);
  await chef.locator(`[data-zelle="${ids.max}"][data-tag="${tag(0)}"]`).waitFor({ timeout: 15000 });
  await warten(chef, 1500);
  // Beginn der Tafel aus der Zeitspalte (Betrieb: Standard 6–18)
  const ersteZeit = await chef.locator(`[data-tagzeile="${tag(0)}"] > div:nth-child(2) > div:first-child > span`).first().textContent();
  AB = Number(ersteZeit.slice(0, 2)) * 60;

  // ── (a) Geräte & Fahrzeuge in der Tageszeile ──
  const zeileMo = chef.locator(`[data-tagzeile="${tag(0)}"]`);
  await zeileMo.scrollIntoViewIfNeeded();
  await zeileMo.getByRole("button", { name: "Fahrzeug", exact: true }).click();
  const fenster = chef.locator("[data-fahrzeug-fenster]");
  await fenster.waitFor({ timeout: 5000 });
  const steigerZeile = fenster.getByRole("button", { name: new RegExp(`ZZK Steiger ${LAUF}`) });
  ok(await steigerZeile.count() === 1 && (await steigerZeile.innerText()).includes("frei"), "„+ Fahrzeug“: Fenster mit allen Geräten, Steiger „frei“");
  await steigerZeile.click();
  const mitnehmen = fenster.getByRole("button", { name: new RegExp(`ZZK Lager ${LAUF}`) });
  // Zeile „07:00–12:00 · Max“ — vorher „… · Max, –“ für das versteckte Konto
  ok(await fenster.getByText("Mitnehmen zu").count() === 1 && (await mitnehmen.innerText()).trim().endsWith("07:00–12:00 · Max"),
    "Steiger gewählt → „Mitnehmen zu“ zeigt den Termin des Tages mit Max (das versteckte Konto nicht, auch nicht als „–“)");
  await mitnehmen.click();
  await warten(chef);
  ok(gleich((await termin(lager.id)).fahrzeuge, [steiger.id]), "Steiger beim Termin eingetragen (Datenbank)");
  const kaertchen = zeileMo.locator(`[data-fahrzeug-tag="${steiger.id}"]`);
  ok(await kaertchen.count() === 1, "Kärtchen „ZZK Steiger“ steht in der Tageszeile");
  await kaertchen.click();
  await fenster.waitFor({ timeout: 5000 });
  ok(await fenster.getByText("Dabei bei").count() === 1 && await fenster.getByText(`ZZK Lager ${LAUF}`).count() === 1, "Kärtchen antippen → „Dabei bei“ mit dem Termin");
  await chef.screenshot({ path: `${BILDER}/kalender-umbau-fahrzeug.png` });
  await fenster.getByRole("button", { name: `ZZK Steiger ${LAUF} bei ZZK Lager ${LAUF} entfernen` }).click();
  await warten(chef);
  ok(gleich((await termin(lager.id)).fahrzeuge, []), "✕ nimmt den Steiger wieder ab (Datenbank)");
  ok(await kaertchen.count() === 0, "Kärtchen verschwindet aus der Tageszeile");
  // „Eigenen Termin für …“ → großes Formular mit dem Gerät
  await zeileMo.getByRole("button", { name: "Fahrzeug", exact: true }).click();
  await fenster.getByRole("button", { name: new RegExp(`ZZK Bus ${LAUF}`) }).click();
  await fenster.getByRole("button", { name: new RegExp(`Eigenen Termin für ZZK Bus ${LAUF}`) }).click();
  const dialog = chef.getByRole("dialog").filter({ hasText: "Neuer Termin" });
  await dialog.waitFor({ timeout: 5000 });
  ok(await dialog.getByRole("button", { name: new RegExp(`ZZK Bus ${LAUF}`) }).getAttribute("aria-pressed") === "true" && await chef.locator("#t-datum").inputValue() === tag(0),
    "„Eigenen Termin für …“: Formular mit dem Bus und dem Tag");
  await dialog.getByRole("radio", { name: /Büro/ }).click();
  await chef.locator("#t-titel").fill(`ZZK Bus Werkstatt ${LAUF}`);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await warten(chef, 1500);
  const [werkstatt] = await termineVon({ titel: `ZZK Bus Werkstatt ${LAUF}` });
  ok(werkstatt && gleich(werkstatt.fahrzeuge, [bus.id]) && werkstatt.datum === tag(0) && gleich(werkstatt.mitarbeiter, []) && werkstatt.art === "buero",
    "Termin für den Bus gespeichert: Gerät, Tag, ohne Leute");
  ok(await zeileMo.locator(`[data-fahrzeug-tag="${bus.id}"]`).count() === 1, "Bus steht danach in der Tageszeile");

  // ── (b) Schnell einplanen ──
  const wahl = chef.locator("[data-zell-wahl]");
  await tippen(chef, ids.max, tag(1), 10 * 60);
  await wahl.waitFor({ timeout: 5000 });
  const kopf = await wahl.locator("p").first().innerText();
  ok(kopf.includes("Max") && (await wahl.innerText()).includes(kurz(tag(1))), "Leere Zelle antippen → kleines Fenster für Max am Dienstag");
  ok(await wahl.getByText(`ZZK PV Dach ${LAUF}`).count() === 1 && await wahl.getByText(`ZZK Speicher ${LAUF}`).count() === 0 && await wahl.getByText(`ZZK Wallbox ${LAUF}`).count() === 0,
    "ohne Suche: Projekte „In Arbeit“ (PV Dach), keine im Angebot");
  await wahl.getByRole("button", { name: new RegExp(`ZZK PV Dach ${LAUF}`) }).click();
  await warten(chef, 1500);
  let pvTermine = await termineVon({ projekt_id: pv.id, datum: tag(1) });
  const montage = pvTermine[0];
  ok(pvTermine.length === 1 && montage.art === "montage" && montage.kunde_id === huber.id && montage.von?.startsWith("07:00") && montage.bis?.startsWith("15:30")
    && gleich(montage.mitarbeiter, [ids.max]) && montage.bis_datum === null && montage.ort === "Feldweg 3, 8643 Allerheiligen",
  "Projekt angetippt → Montage 07:00–15:30 mit Max, Kunde, Ort = Projektadresse");

  // gleiches Projekt, gleicher Zeitraum → Lisa kommt dazu
  await tippen(chef, ids.lisa, tag(1), 10 * 60);
  await wahl.waitFor({ timeout: 5000 });
  await wahl.getByRole("button", { name: new RegExp(`ZZK PV Dach ${LAUF}`) }).click();
  await warten(chef, 1500);
  pvTermine = await termineVon({ projekt_id: pv.id, datum: tag(1) });
  ok(pvTermine.length === 1 && gleich(pvTermine[0].mitarbeiter, [ids.max, ids.lisa]), "gleiches Projekt + Zeitraum: Lisa kommt zum bestehenden Termin dazu (kein zweiter)");
  const lisaToast = chef.locator("[data-sonner-toast]").filter({ hasText: "Lisa" }).filter({ hasText: "→" });
  ok(await lisaToast.count() > 0, "Hinweis „Lisa … → ZZK PV Dach“");
  await lisaToast.first().getByRole("button", { name: "Rückgängig" }).click();
  await warten(chef, 1500);
  ok(gleich((await termin(montage.id)).mitarbeiter, [ids.max]), "„Rückgängig“: Lisa wieder heraus (Datenbank)");

  // aufgezogen 08:00–12:00 + Enter = erster Treffer
  await aufziehen(chef, ids.lisa, tag(2), 8 * 60, 12 * 60);
  await wahl.waitFor({ timeout: 5000 });
  ok((await wahl.innerText()).includes("08:00–12:00"), "Aufziehen → Fenster mit dem Zeitraum 08:00–12:00");
  await wahl.getByLabel("Projekt oder Kunde suchen").fill(`pv dach ${LAUF}`);
  await wahl.getByLabel("Projekt oder Kunde suchen").press("Enter");
  await warten(chef, 1500);
  const [aufgezogen] = await termineVon({ projekt_id: pv.id, datum: tag(2) });
  ok(aufgezogen?.von?.startsWith("08:00") && aufgezogen.bis?.startsWith("12:00") && gleich(aufgezogen.mitarbeiter, [ids.lisa]) && aufgezogen.art === "montage",
    "Enter nimmt den ersten Treffer → Montage genau 08:00–12:00 mit Lisa");

  // Kunde → Besichtigung; Projekte im Angebot stehen nicht zur Wahl
  await tippen(chef, ids.chef, tag(3), 13 * 60 + 10);
  await wahl.waitFor({ timeout: 5000 });
  const suche = wahl.getByLabel("Projekt oder Kunde suchen");
  await suche.fill(`ZZK Speicher ${LAUF}`);
  await warten(chef, 300);
  ok(await wahl.getByRole("button", { name: new RegExp(`ZZK Speicher ${LAUF}`) }).count() === 0 && await wahl.getByText("Nichts gefunden", { exact: false }).count() === 1,
    "Suche nach einem Projekt im Angebot: nicht zur Wahl (nur „In Arbeit“ wie im Termin-Formular)");
  await suche.fill(`Moser ${LAUF}`);
  await warten(chef, 300);
  ok(await wahl.getByRole("button", { name: new RegExp(`ZZK Wallbox ${LAUF}`) }).count() === 0
    && await wahl.getByText("Kein Projekt „In Arbeit“", { exact: false }).count() === 1
    && await wahl.getByRole("button", { name: new RegExp(`ZZK Kunde Moser ${LAUF}`) }).count() === 1,
  "Kunde nur mit Angebot: kein Projekt, Hinweis, „Besichtigung bei“ dem Kunden");
  await suche.press("Enter");
  await warten(chef, 1500);
  const [besichtigung] = await termineVon({ kunde_id: moser.id, datum: tag(3) });
  ok(besichtigung?.art === "besichtigung" && besichtigung.projekt_id === null && besichtigung.von?.startsWith("13:00") && besichtigung.bis?.startsWith("15:00")
    && gleich(besichtigung.mitarbeiter, [ids.chef]) && besichtigung.ort === "Bachgasse 7, 8650 Kindberg" && besichtigung.titel === `Besichtigung ZZK Kunde Moser ${LAUF}`,
  "Kunde → Besichtigung 13:00–15:00 im angetippten Fenster, Ort = Kundenadresse, ohne Projekt");

  // Auf einer Abwesenheit: bearbeiten, löschen, trotzdem einplanen
  await tippen(chef, ids.lisa, tag(4), 10 * 60);
  await wahl.waitFor({ timeout: 5000 });
  const wahlText = await wahl.innerText();
  ok(wahlText.includes("Urlaub") && await wahl.getByRole("button", { name: "Bearbeiten" }).count() === 1 && await wahl.getByRole("button", { name: "Löschen" }).count() === 1
    && await wahl.getByPlaceholder("Trotzdem einplanen: Projekt oder Kunde …").count() === 1
    && await wahl.getByRole("button", { name: "Abwesenheit" }).count() === 1 && await wahl.getByRole("button", { name: /Mit Details/ }).count() === 1,
  "Auf dem Urlaub: Urlaub, „Bearbeiten“, „Löschen“, „Trotzdem einplanen“, „Abwesenheit“, „Mit Details …“");
  await wahl.getByRole("button", { name: "Löschen" }).click();
  ok(await wahl.getByRole("button", { name: "Wirklich löschen" }).count() === 1, "„Löschen“ fragt nach („Wirklich löschen“)");
  await wahl.getByRole("button", { name: "Bearbeiten" }).click();
  const abwDialog = chef.getByRole("dialog").filter({ hasText: "Abwesenheit bearbeiten" });
  await abwDialog.waitFor({ timeout: 5000 }).catch(() => {});
  ok(await abwDialog.count() === 1, "„Bearbeiten“ öffnet den Urlaub im Formular");
  await chef.keyboard.press("Escape");
  await warten(chef, 800);
  ok((await admin.from("abwesenheiten").select("id").eq("id", urlaub.id)).data?.length === 1, "Urlaub bleibt (nichts bestätigt)");
  await tippen(chef, ids.lisa, tag(4), 10 * 60);
  await wahl.waitFor({ timeout: 5000 });
  await wahl.getByLabel("Projekt oder Kunde suchen").fill(`PV Dach ${LAUF}`);
  await wahl.getByLabel("Projekt oder Kunde suchen").press("Enter");
  await warten(chef, 1500);
  const [trotzdem] = await termineVon({ projekt_id: pv.id, datum: tag(4) });
  ok(trotzdem && gleich(trotzdem.mitarbeiter, [ids.lisa]), "„Trotzdem einplanen“ auf dem Urlaub legt die Montage an");
  ok(await chef.getByRole("button", { name: /Konflikt/ }).count() === 1, "… und der Kalender meldet den Konflikt (abwesend, aber eingeteilt)");
  await chef.screenshot({ path: `${BILDER}/kalender-umbau-pc.png` });

  // ── (c) Monatskalender und „Nicht eingeplant“ ──
  const mini = chef.locator('aside[aria-label="Monatskalender"]');
  ok(await mini.count() === 1, "rechts steht der Monatskalender");
  const ziel = plusTage(montag, 14);
  await mini.getByRole("button", { name: datumText(ziel), exact: true }).first().click();
  await warten(chef, 1500);
  ok(await chef.locator(`[data-tagzeile="${ziel}"]`).count() === 1 && await chef.locator(`[data-tagzeile="${tag(0)}"]`).count() === 0
    && await chef.getByText(new RegExp(`^KW ${kw(ziel)} ·`)).count() > 0,
  `Klick auf den ${datumText(ziel)} im Monatskalender → Woche KW ${kw(ziel)}`);
  await chef.getByRole("button", { name: "Heute", exact: true }).click();
  await warten(chef, 1500);
  ok(await chef.locator(`[data-tagzeile="${tag(0)}"]`).count() === 1, "„Heute“ → zurück in die Woche von heute");
  await chef.getByRole("button", { name: /Nicht eingeplant/ }).click();
  const liste = chef.locator('aside[aria-label="Noch nicht eingeplant"]');
  await liste.waitFor({ timeout: 5000 });
  ok(await mini.count() === 0 && await liste.locator(`[data-projekt-ziehen="${zaehler.id}"]`).count() === 1, "„Nicht eingeplant“ zeigt statt des Monatskalenders die Liste (Zählerkasten)");
  await liste.getByLabel("Projekt suchen").fill(`ZZK Speicher ${LAUF}`);
  await warten(chef, 300);
  ok(await liste.locator("[data-projekt-ziehen]").count() === 0 && await liste.getByText("Kein Projekt „In Arbeit“ gefunden.").count() === 1, "Suche dort: Projekt im Angebot nicht dabei");
  await liste.getByLabel("Projekt suchen").fill(`PV Dach ${LAUF}`);
  await warten(chef, 300);
  ok(await liste.locator(`[data-projekt-ziehen="${pv.id}"]`).count() === 1, "Suche dort findet Projekte „In Arbeit“, auch eingeplante");
  await liste.getByRole("button", { name: "Wieder den Monatskalender zeigen" }).click();
  ok(await mini.count() === 1 && await liste.count() === 0, "✕ → wieder der Monatskalender");

  // ── (d) Versteckte Konten nirgends ──
  ok(await chef.locator(`[data-zelle="${ids.versteckt}"]`).count() === 0, "Chef: keine Spalte für das versteckte Konto");
  const optionen = await chef.locator('select[aria-label="Wen zeigen?"] option').allTextContents();
  ok(optionen.some((o) => o.includes("Max")) && !optionen.some((o) => o.includes("Versteckt")), "Filter „Wen zeigen?“ ohne das versteckte Konto");
  await blockOeffnen(chef, lager.id);
  const info = chef.locator("[data-balken-info]");
  await info.waitFor({ timeout: 5000 });
  ok((await info.innerText()).includes("Max") && !(await info.innerText()).includes("Versteckt"), "kleines Fenster am Termin: Max ja, das versteckte Konto nicht");
  await chef.keyboard.press("Escape");
  await chef.getByRole("button", { name: "Termin", exact: true }).click();
  const neuDialog = chef.getByRole("dialog").filter({ hasText: "Neuer Termin" });
  await neuDialog.waitFor({ timeout: 5000 });
  // Knopf = Kürzel + Vorname („MZ Max“)
  ok(await neuDialog.getByRole("button", { name: /Max$/ }).count() === 1 && await neuDialog.getByRole("button", { name: /Versteckt/ }).count() === 0, "Termin-Dialog „Wer ist dabei?“ ohne das versteckte Konto");
  await neuDialog.getByRole("button", { name: "Abbrechen" }).click();
  await warten(chef, 500);

  // … auch nicht für sich selbst (ePower-Zugang ist Chef)
  const versteckt = await anmelden(MAIL.versteckt, { width: 1440, height: 900 });
  await versteckt.goto(`${APP_URL}/kalender`);
  await versteckt.locator(`[data-zelle="${ids.max}"][data-tag="${tag(0)}"]`).waitFor({ timeout: 15000 });
  await warten(versteckt, 1000);
  ok(await versteckt.locator(`[data-zelle="${ids.versteckt}"]`).count() === 0
    && !(await versteckt.locator('select[aria-label="Wen zeigen?"] option').allTextContents()).some((o) => o.includes("Versteckt")),
  "versteckt angemeldet: keine eigene Spalte, nicht im Filter");
  await tippen(versteckt, ids.max, tag(2), 15 * 60);
  const wahlV = versteckt.locator("[data-zell-wahl]");
  await wahlV.waitFor({ timeout: 5000 });
  ok((await wahlV.innerText()).includes("Max") && !(await wahlV.innerText()).includes("Versteckt"), "versteckt angemeldet: kleines Fenster zum Einplanen ohne das eigene Konto");
  await versteckt.keyboard.press("Escape");
  await versteckt.getByRole("button", { name: "Termin", exact: true }).click();
  const dialogV = versteckt.getByRole("dialog").filter({ hasText: "Neuer Termin" });
  await dialogV.waitFor({ timeout: 5000 });
  ok(await dialogV.getByRole("button", { name: /Versteckt/ }).count() === 0 && await dialogV.locator('button[aria-pressed="true"]').count() === 0,
    "versteckt angemeldet: Termin-Dialog ohne das eigene Konto, niemand vorgewählt");
  await dialogV.getByRole("radio", { name: /Büro/ }).click();
  await versteckt.locator("#t-titel").fill(`ZZK von Versteckt ${LAUF}`);
  await dialogV.getByRole("button", { name: "Speichern" }).click();
  await warten(versteckt, 1500);
  const [vonVersteckt] = await termineVon({ titel: `ZZK von Versteckt ${LAUF}` });
  ok(vonVersteckt && !vonVersteckt.mitarbeiter.includes(ids.versteckt), "neuer Termin des versteckten Kontos teilt es nicht unsichtbar ein (Datenbank)");

  // ── (e) Handy 390 px ──
  const konsole = [];
  const handy = await anmelden(MAIL.chef, { width: 390, height: 844 }, true, konsole);
  await handy.goto(`${APP_URL}/kalender`);
  await handy.getByRole("button", { name: "Tag", exact: true }).click();
  const tageKnoepfe = handy.locator('[role="group"][aria-label="Tag"] button');
  await tageKnoepfe.first().waitFor({ timeout: 15000 });
  await tageKnoepfe.nth(0).click();
  await warten(handy, 1500);
  ok(await ueberlauf(handy) <= 390, "Handy „Tag“: kein waagrechtes Überlaufen");
  const fzZeile = handy.locator(`[data-fahrzeug-zeile="${tag(0)}"]`);
  ok(await fzZeile.locator(`[data-fahrzeug-tag="${bus.id}"]`).count() === 1 && await fzZeile.getByRole("button", { name: "Fahrzeug", exact: true }).count() === 1,
    "Handy „Tag“: Fahrzeuge des Tages (Bus) und „+ Fahrzeug“");
  await fzZeile.getByRole("button", { name: "Fahrzeug", exact: true }).tap();
  const fensterH = handy.locator("[data-fahrzeug-fenster]");
  await fensterH.waitFor({ timeout: 5000 });
  await warten(handy, 300);
  const r = await fensterH.boundingBox();
  ok(r && r.x >= 0 && r.x + r.width <= 390, `Handy: Fahrzeug-Fenster passt in die Breite (${r && Math.round(r.x)}–${r && Math.round(r.x + r.width)} px)`);
  await fensterH.getByRole("button", { name: new RegExp(`ZZK Steiger ${LAUF}`) }).tap();
  await fensterH.getByRole("button", { name: new RegExp(`ZZK Lager ${LAUF}`) }).tap();
  await warten(handy);
  ok(gleich((await termin(lager.id)).fahrzeuge, [steiger.id]), "Handy: Steiger zum Termin mitgenommen (Datenbank)");
  ok(await fzZeile.locator(`[data-fahrzeug-tag="${steiger.id}"]`).count() === 1, "Handy: Steiger-Kärtchen erscheint");
  await handy.screenshot({ path: `${BILDER}/kalender-umbau-handy-tag.png`, fullPage: true });
  // Block → kleines Fenster → „Erstaufnahme“
  await tageKnoepfe.nth(3).click();
  await warten(handy, 800);
  await handy.locator(`[data-block="${besichtigung.id}"]`).first().tap();
  const knopf = handy.locator('[data-balken-info] [data-termin-weiter="erstaufnahme"]');
  await knopf.waitFor({ timeout: 5000 }).catch(() => {});
  ok(await knopf.count() === 1, "Handy: Besichtigung antippen → kleines Fenster mit „Erstaufnahme“");
  if (await knopf.count()) {
    await knopf.tap();
    await handy.waitForURL(/\/erstaufnahmen\/[0-9a-f-]{36}$/, { timeout: 15000 }).catch(() => {});
    const { data: ea } = await admin.from("erstaufnahmen").select("termin_id, kunde_id").eq("id", handy.url().split("/").pop()).maybeSingle();
    ok(ea?.termin_id === besichtigung.id && ea.kunde_id === moser.id, "Handy: Erstaufnahme zum Termin angelegt (Datenbank)");
  }
  await handy.goto(`${APP_URL}/kalender`);
  await handy.getByRole("button", { name: "Person", exact: true }).click();
  await warten(handy, 1000);
  ok(await ueberlauf(handy) <= 390, "Handy „Person“: kein waagrechtes Überlaufen");
  await handy.getByRole("button", { name: "Woche", exact: true }).click();
  await handy.getByRole("button", { name: "Alle", exact: true }).click();
  await warten(handy, 1000);
  ok(await ueberlauf(handy) <= 390, "Handy „Woche“: kein waagrechtes Überlaufen");
  ok(await handy.getByText(`ZZK Lager ${LAUF}`).count() > 0, "Handy „Woche“: Termine der Woche");
  await handy.screenshot({ path: `${BILDER}/kalender-umbau-handy-woche.png`, fullPage: true });
  ok(konsole.length === 0, `Handy: Konsole ohne Fehler${konsole.length ? ": " + konsole.join(" | ") : ""}`);

  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  if (kundenIds.length) {
    await admin.from("erstaufnahmen").delete().in("kunde_id", kundenIds);
    await admin.from("termine").delete().in("kunde_id", kundenIds);
  }
  if (projektIds.length) await admin.from("termine").delete().in("projekt_id", projektIds);
  await admin.from("termine").delete().like("titel", `ZZK%${LAUF}`);
  if (projektIds.length) await admin.from("projekte").delete().in("id", projektIds);
  if (fahrzeugIds.length) await admin.from("fahrzeuge").delete().in("id", fahrzeugIds);
  if (kundenIds.length) await admin.from("kunden").delete().in("id", kundenIds);
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
