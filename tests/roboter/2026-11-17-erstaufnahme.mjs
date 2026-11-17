// Probefahrt 17.11.2026: Erstaufnahme → Angebot ohne Projekt → Annahme → Projekt (Stufe 3,
// docs/ABLAUF-TERMIN-BIS-RECHNUNG.md Abschnitte 2–4).
// - Kalender: Besichtigung antippen → „Erstaufnahme“ legt sie mit Kunde und Ort des Termins an
// - Erstaufnahme: Kundenwunsch, Notizen, Messwert, Foto mit Zeichnung + Beschriftung (Original bleibt), Skizze
// - „Angebot erstellen“: Editor mit Erstaufnahme-Block, Speichern legt KEIN Projekt an
// - Kunde nimmt online an (anon) → Projekt „In Arbeit“ mit Adresse, Fotos, Notizen; Termin hängt am Projekt
// - Monteur sieht im Projekt den Block „Erstaufnahme“
// - Chef „Angenommen“ → Projekt, andere Variante abgelehnt; „Gleich Projekt“ ohne Angebot
// - Service-Termin: Knopf „Regiebericht“ → /regie/neu?kunde=…&termin=…
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-17-erstaufnahme.mjs
// Legt selbst an (alles „ZZ“), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };
const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());
// 1×1-PNG reicht für Zeilen, die nur der Speicher braucht
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefId = await konto("zz-ea-chef@test.local", "chef", "Chefin");
const monteurId = await konto("zz-ea-monteur@test.local", "monteur", "Max");
const { data: kunde, error: eK } = await admin.from("kunden")
  .insert({ name: "ZZ Kunde Leitner", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" }).select("id").single();
if (eK) throw eK;
const { data: termine, error: eT } = await admin.from("termine").insert([
  { titel: "ZZ Besichtigung Leitner", art: "besichtigung", kunde_id: kunde.id, ort: "Feldweg 3, 8643 Allerheiligen", datum: heute, von: "09:00", bis: "10:00", mitarbeiter: [chefId] },
  { titel: "ZZ Service Leitner", art: "service", kunde_id: kunde.id, ort: "Hauptstraße 1, 8650 Kindberg", datum: heute, von: "13:00", bis: "14:00", mitarbeiter: [monteurId] },
]).select("id, titel");
if (eT) throw eT;
const besichtigung = termine.find((t) => t.art === "besichtigung" || t.titel.includes("Besichtigung"));
const service = termine.find((t) => t.titel.includes("Service"));

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
/** Strich über ein Element ziehen (Maus = Finger/Stift) */
async function strich(page, loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 8 });
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.7, { steps: 8 });
  await page.mouse.up();
}
const projekteDesKunden = async () => (await admin.from("projekte").select("*").eq("kunde_id", kunde.id)).data ?? [];

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  // ── Chef am Tablet (quer) ──
  const chef = await anmelden("zz-ea-chef@test.local", { width: 1180, height: 820 });
  await chef.goto(`${APP_URL}/kalender`);
  await chef.waitForTimeout(2500);
  await chef.locator(`[data-block="${besichtigung.id}"]`).first().click();
  await chef.locator('[data-termin-weiter="erstaufnahme"]').click();
  await chef.waitForURL(/\/erstaufnahmen\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const eaId = chef.url().split("/").pop();
  let { data: ea } = await admin.from("erstaufnahmen").select("*").eq("id", eaId).single();
  ok(/^EA-\d{4}-\d{3}$/.test(ea.nummer) && ea.termin_id === besichtigung.id && ea.kunde_id === kunde.id && ea.status === "offen",
    `Erstaufnahme ${ea.nummer} aus dem Termin: Kunde, Termin, offen`);
  ok(ea.strasse === "Feldweg 3" && ea.plz === "8643" && ea.ort === "Allerheiligen", "Adresse = Ort des Termins");

  await chef.locator("#ea-wunsch").fill("PV 10 kW mit Speicher\nWallbox später");
  await chef.locator("#ea-notizen").fill("Zählerkasten im Keller, Dach Süd 30°");
  await chef.getByRole("button", { name: /\+ Jahresverbrauch/ }).click();
  await chef.getByLabel("Messwert 1 Wert").fill("4500");
  await chef.waitForTimeout(2500);
  ({ data: ea } = await admin.from("erstaufnahmen").select("*").eq("id", eaId).single());
  ok(ea.kundenwunsch?.startsWith("PV 10 kW") && ea.notizen?.includes("Keller")
    && ea.messwerte?.length === 1 && ea.messwerte[0].bezeichnung === "Jahresverbrauch" && ea.messwerte[0].wert === "4500" && ea.messwerte[0].einheit === "kWh",
  "Kundenwunsch, Notizen, Messwert von selbst gespeichert");

  // Foto mit Zeichnung und Beschriftung
  const bild = Buffer.from((await chef.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const x = c.getContext("2d"); x.fillStyle = "#8aa9c1"; x.fillRect(0, 0, 800, 600); x.fillStyle = "#333"; x.fillRect(300, 200, 200, 200);
    return c.toDataURL("image/png");
  })).split(",")[1], "base64");
  await chef.locator("[data-ea-kamera]").setInputFiles({ name: "dach.png", mimeType: "image/png", buffer: bild });
  await chef.locator("[data-leinwand]").waitFor({ timeout: 10000 });
  await chef.waitForTimeout(600); // Dialog fährt noch ein
  await strich(chef, chef.locator("[data-leinwand]"));
  await chef.getByLabel("Beschriftung").fill("Zählerkasten");
  await chef.screenshot({ path: `${BILDER}/ea-zeichnen.png` });
  await chef.locator("[data-zeichnen]").getByRole("button", { name: "Speichern" }).click();
  await chef.waitForTimeout(2500);
  // Skizze auf leerem Blatt
  await chef.getByRole("button", { name: "Skizze" }).click();
  await chef.locator("[data-leinwand]").waitFor({ timeout: 10000 });
  await chef.waitForTimeout(600); // Dialog fährt noch ein
  await strich(chef, chef.locator("[data-leinwand]"));
  await chef.locator("[data-zeichnen]").getByRole("button", { name: "Speichern" }).click();
  await chef.waitForTimeout(2500);
  const { data: fotos } = await admin.from("erstaufnahme_fotos").select("*").eq("erstaufnahme_id", eaId).order("reihenfolge");
  ok(fotos?.length === 2, "Foto und Skizze gespeichert");
  ok(fotos?.[0]?.beschriftung === "Zählerkasten" && !!fotos[0].original_pfad && fotos[0].pfad.startsWith(`ea/${eaId}/`), "Foto: gezeichnet, beschriftet, Original behalten, Pfad ea/<id>/");
  ok(fotos?.[1]?.skizze === true && fotos[1].pfad.endsWith(".png"), "Skizze als PNG");
  await chef.screenshot({ path: `${BILDER}/ea-tablet.png`, fullPage: true });

  // Angebot aus der Erstaufnahme — ohne Projekt
  await chef.getByRole("button", { name: "Angebot erstellen" }).click();
  await chef.waitForURL(/\/belege\/neu\?typ=angebot&erstaufnahme=/, { timeout: 15000 });
  await chef.waitForTimeout(1500);
  ok(await chef.locator("[data-erstaufnahme-block]").count() === 1, "Editor zeigt den Block „Erstaufnahme“");
  ok(await chef.getByText("Kein Projekt nötig", { exact: false }).count() > 0, "Hinweis: Projekt entsteht bei Annahme");
  await chef.screenshot({ path: `${BILDER}/ea-angebot-editor.png` });
  await chef.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await chef.waitForURL(/\/belege\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const angebotId = chef.url().split("/").pop();
  let { data: angebot } = await admin.from("belege").select("*").eq("id", angebotId).single();
  ok(angebot.erstaufnahme_id === eaId && angebot.projekt_id === null && angebot.kunde_id === kunde.id && angebot.betreff === "PV 10 kW mit Speicher",
    "Angebot gespeichert: an der Erstaufnahme, Kunde, Betreff aus dem Wunsch, KEIN Projekt");
  ok((await projekteDesKunden()).length === 0, "kein Projekt angelegt");
  ({ data: ea } = await admin.from("erstaufnahmen").select("status").eq("id", eaId).single());
  ok(ea.status === "angebot", "Erstaufnahme steht auf „Angebot“");

  // Fertigstellen und Link wie der Chef (Positionen per Dienst-Schlüssel)
  await admin.from("beleg_positionen").insert({ beleg_id: angebotId, pos: 1, art: "pauschale", bezeichnung: "ZZ PV-Anlage 10 kWp", menge: 1, einheit: "Psch", einzelpreis: 12000 });
  const chefApi = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  await chefApi.auth.signInWithPassword({ email: "zz-ea-chef@test.local", password: PW });
  const { error: eF } = await chefApi.rpc("beleg_fertigstellen", { p_id: angebotId });
  ok(!eF, `Angebot fertiggestellt${eF ? ": " + eF.message : ""}`);
  const { data: token, error: eL } = await chefApi.rpc("angebot_link_erstellen", { p_beleg: angebotId });
  ok(!eL && !!token, "Bestätigungslink erzeugt");

  // ── Kunde am Handy, ohne Anmeldung ──
  const kctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  const kundeSeite = await kctx.newPage();
  kundeSeite.on("pageerror", (e) => fehler.push(`[kunde] ${e.message}`));
  await kundeSeite.goto(`${APP_URL}/angebot/${token}`);
  await kundeSeite.getByRole("button", { name: "Angebot annehmen" }).click();
  await kundeSeite.locator("#an-name").fill("Franz Leitner");
  await kundeSeite.getByLabel("Angebot bestätigen").click();
  await strich(kundeSeite, kundeSeite.locator('section[aria-label="Angebot annehmen"] canvas'));
  await kundeSeite.screenshot({ path: `${BILDER}/ea-online-annehmen.png` });
  await kundeSeite.getByRole("button", { name: "Angebot verbindlich annehmen" }).click({ timeout: 10000 });
  await kundeSeite.waitForTimeout(3000);
  await kundeSeite.screenshot({ path: `${BILDER}/ea-online-angenommen.png` });
  ({ data: angebot } = await admin.from("belege").select("*").eq("id", angebotId).single());
  const [projekt] = await projekteDesKunden();
  ok(angebot.status === "angenommen" && !!projekt && angebot.projekt_id === projekt.id, "online angenommen → Projekt angelegt und am Angebot");
  ok(projekt?.status === "aktiv" && projekt.name === "PV 10 kW mit Speicher" && projekt.strasse === "Feldweg 3" && projekt.ort === "Allerheiligen",
    "Projekt „In Arbeit“, Name = Betreff, Adresse aus der Erstaufnahme");
  ok(/2026-\d{4}|\d{4}-\d{4}/.test(projekt?.nummer ?? ""), `Projektnummer vergeben (${projekt?.nummer}) — auch als anon`);
  ok(projekt?.beschreibung?.includes("PV 10 kW") && projekt.beschreibung.includes("Jahresverbrauch: 4500 kWh"), "Kundenwunsch und Messwerte in der Projektbeschreibung");
  const { data: dateien } = await admin.from("dateien").select("*").eq("projekt_id", projekt?.id ?? "");
  ok(dateien?.length === 2 && dateien.every((d) => d.erstaufnahme_foto_id && d.pfad.startsWith(`ea/${eaId}/`)), "Foto und Skizze als Projekt-Dateien (ohne Kopie)");
  ({ data: ea } = await admin.from("erstaufnahmen").select("*").eq("id", eaId).single());
  ok(ea.status === "auftrag" && ea.projekt_id === projekt?.id, "Erstaufnahme: Auftrag, mit Projekt");
  const { data: tb } = await admin.from("termine").select("projekt_id").eq("id", besichtigung.id).single();
  ok(tb.projekt_id === projekt?.id, "Besichtigungstermin hängt jetzt am Projekt");

  // ── Monteur sieht im Projekt die Erstaufnahme ──
  const max = await anmelden("zz-ea-monteur@test.local", { width: 390, height: 844 });
  await max.goto(`${APP_URL}/projekte/${projekt?.id}`);
  await max.waitForTimeout(2500);
  ok(await max.locator("[data-erstaufnahme-block]").count() === 1, "Monteur: Block „Erstaufnahme“ im Projekt");
  ok(await max.getByText("PV 10 kW mit Speicher", { exact: false }).count() > 0, "Monteur sieht den Kundenwunsch");
  await max.screenshot({ path: `${BILDER}/ea-projekt-monteur.png`, fullPage: true });

  // Service-Termin: Monteur → Regiebericht mit Kunde und Termin
  await max.goto(`${APP_URL}/kalender`);
  await max.waitForTimeout(2000);
  const woche = max.getByRole("button", { name: "Woche", exact: true });
  if (await woche.count()) await woche.click();
  await max.waitForTimeout(800);
  await max.getByText("ZZ Service Leitner").first().click();
  await max.waitForTimeout(800);
  const regieKnopf = max.locator('[data-termin-weiter="regie"]');
  ok(await regieKnopf.count() > 0, "Service-Termin: Knopf „Regiebericht“ für den eingeteilten Monteur");
  if (await regieKnopf.count()) {
    await regieKnopf.first().click();
    await max.waitForURL(/\/regie\/neu\?kunde=/, { timeout: 10000 }).catch(() => {});
    ok(max.url().includes(`kunde=${kunde.id}`) && max.url().includes(`termin=${service.id}`), "Regiebericht öffnet mit Kunde und Termin");
  }

  // ── Chef „Angenommen“ (zweite Erstaufnahme mit zwei Varianten) ──
  const { data: ea2 } = await admin.from("erstaufnahmen").insert({ kunde_id: kunde.id, strasse: "Bachgasse 5", plz: "8650", ort: "Kindberg", kundenwunsch: "Speicher nachrüsten" }).select("*").single();
  await admin.storage.from("projekt-dateien").upload(`ea/${ea2.id}/zz.png`, PNG, { contentType: "image/png" });
  await admin.from("erstaufnahme_fotos").insert({ erstaufnahme_id: ea2.id, pfad: `ea/${ea2.id}/zz.png`, beschriftung: "Keller" });
  const { data: varianten } = await admin.from("belege").insert([
    { typ: "angebot", status: "offen", nummer: "ZZ-AN-1", kunde_id: kunde.id, empf_name: "ZZ Kunde Leitner", betreff: "Speicher 10 kWh", erstaufnahme_id: ea2.id },
    { typ: "angebot", status: "offen", nummer: "ZZ-AN-2", kunde_id: kunde.id, empf_name: "ZZ Kunde Leitner", betreff: "Speicher 5 kWh", erstaufnahme_id: ea2.id },
  ]).select("id, betreff");
  const v1 = varianten.find((v) => v.betreff === "Speicher 10 kWh");
  const v2 = varianten.find((v) => v.betreff === "Speicher 5 kWh");
  await chef.goto(`${APP_URL}/belege/${v1.id}`);
  await chef.waitForTimeout(2500);
  await chef.getByRole("button", { name: "Angenommen", exact: true }).first().click();
  await chef.waitForTimeout(2500);
  const { data: b1 } = await admin.from("belege").select("status, projekt_id").eq("id", v1.id).single();
  const { data: b2 } = await admin.from("belege").select("status, projekt_id").eq("id", v2.id).single();
  const { data: p2 } = await admin.from("projekte").select("*").eq("id", b1.projekt_id ?? "").maybeSingle();
  ok(b1.status === "angenommen" && p2?.status === "aktiv" && p2.strasse === "Bachgasse 5", "Chef „Angenommen“: Projekt angelegt, Adresse der Erstaufnahme");
  ok(b2.status === "abgelehnt" && b2.projekt_id === null, "andere Variante derselben Erstaufnahme → abgelehnt");
  const { count: d2 } = await admin.from("dateien").select("id", { count: "exact", head: true }).eq("projekt_id", p2?.id ?? "");
  ok(d2 === 1, "Foto der Erstaufnahme im Projekt");

  // ── „Gleich Projekt“ (Kleinauftrag ohne Angebot) ──
  const { data: ea3 } = await admin.from("erstaufnahmen").insert({ kunde_id: kunde.id, kundenwunsch: "Steckdose Garage" }).select("id").single();
  await chef.goto(`${APP_URL}/erstaufnahmen/${ea3.id}`);
  await chef.waitForTimeout(2000);
  await chef.getByRole("button", { name: "Gleich Projekt" }).click();
  await chef.getByRole("button", { name: "Projekt anlegen" }).click();
  await chef.waitForURL(/\/projekte\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {});
  const { data: e3 } = await admin.from("erstaufnahmen").select("status, projekt_id").eq("id", ea3.id).single();
  const { data: p3 } = await admin.from("projekte").select("name, status").eq("id", e3.projekt_id ?? "").maybeSingle();
  ok(e3.status === "auftrag" && p3?.name === "Steckdose Garage" && p3.status === "aktiv", "„Gleich Projekt“: Projekt aus dem Kundenwunsch, In Arbeit");

  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  const { data: eas } = await admin.from("erstaufnahmen").select("id").eq("kunde_id", kunde.id);
  const pfade = [];
  for (const e of eas ?? []) {
    const { data: inhalt } = await admin.storage.from("projekt-dateien").list(`ea/${e.id}`, { limit: 1000 });
    (inhalt ?? []).forEach((o) => pfade.push(`ea/${e.id}/${o.name}`));
  }
  const { data: prj } = await admin.from("projekte").select("id").eq("kunde_id", kunde.id);
  const pids = (prj ?? []).map((p) => p.id);
  if (pids.length) await admin.from("dateien").delete().in("projekt_id", pids);
  await admin.from("belege").delete().eq("kunde_id", kunde.id);
  await admin.from("erstaufnahmen").delete().eq("kunde_id", kunde.id);
  if (pfade.length) await admin.storage.from("projekt-dateien").remove(pfade);
  await admin.from("regieberichte").delete().eq("kunde_id", kunde.id);
  await admin.from("termine").delete().eq("kunde_id", kunde.id);
  if (pids.length) await admin.from("projekte").delete().in("id", pids);
  await admin.from("kunden").delete().eq("id", kunde.id);
  await admin.auth.admin.deleteUser(chefId);
  await admin.auth.admin.deleteUser(monteurId);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
