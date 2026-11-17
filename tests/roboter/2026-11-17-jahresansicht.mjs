// Probefahrt 17.11.2026: Jahresansicht der Belegslisten (nach der Odoo-Übernahme 2020–2026).
// - Rechnungen, Angebote, Eingangsrechnungen, Kontakt-Belege: nur das laufende Jahr, ältere unter „Archiv ▾“
// - Suche geht über alle Jahre (Hinweis „Suche in allen Jahren“)
// - Liste nach Monat mit Monatssumme, Odoo-Altbestand mit kleinem grauem Etikett
// - Offene Posten: weiter alles Offene, unabhängig vom Jahr
// - 390 px ohne waagrechte Scrollleiste
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55110 API_URL=http://127.0.0.1:55100 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-17-jahresansicht.mjs
// Legt selbst an (alles „ZZ“): Chef, Kunde, Lieferant, je Jahr ~50 Belege. Räumt danach auf.
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
const JAHR = new Date().getFullYear();
const heute = new Date().toISOString().slice(0, 10);
const pruef = (e, was) => { if (e) throw new Error(`${was}: ${e.message}`); };
const zufall = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const tagIm = (jahr, i, n) => {
  // gleichmäßig übers Jahr, im laufenden Jahr nur bis heute
  const ende = jahr === JAHR ? new Date(heute) : new Date(`${jahr}-12-31`);
  const anfang = new Date(`${jahr}-01-02`);
  const t = new Date(anfang.getTime() + ((ende - anfang) * (n - i)) / (n + 1));
  return t.toISOString().slice(0, 10);
};

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  pruef(error, "Konto");
  await admin.from("profiles").update({ aktiv: true, rolle, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}

const chefId = await konto("zz-chef@test.local", "chef", "Chefin");
const { data: kunden, error: eK } = await admin.from("kunden").insert([
  { name: "ZZ Huber Elektro", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg", art: "kunde" },
  { name: "ZZ Großhandel", art: "lieferant" },
]).select("id, name");
pruef(eK, "Kontakte");
const huber = kunden.find((k) => k.name === "ZZ Huber Elektro");
const grosshandel = kunden.find((k) => k.name === "ZZ Großhandel");
const NAMEN = ["ZZ Huber Elektro", "ZZ Bärnthaler GmbH", "ZZ Fa. Leitner", "ZZ Gemeinde Mürzhofen", "ZZ Sattler Wohnbau"];

// ── Ausgang: 2020–2025 Odoo (altbestand, alle bezahlt), 2026 Odoo bis Oktober + neue App-Rechnungen und Angebote ──
const belege = [];
const bezahlen = [];
for (let jahr = 2020; jahr <= JAHR; jahr++) {
  const n = 50;
  for (let i = 0; i < n; i++) {
    const d = tagIm(jahr, i, n);
    const netto = Math.round((300 + zufall() * 9000) * 100) / 100;
    const ust = Math.round(netto * 20) / 100;
    const id = crypto.randomUUID();
    const empf = NAMEN[i % NAMEN.length];
    const neu = jahr === JAHR && d >= `${JAHR}-11-01`;
    if (neu || (jahr === JAHR && i % 3 === 0)) continue; // Platz für App-Rechnungen
    belege.push({
      id, typ: "rechnung", status: "offen", altbestand: true, nummer: `ZZ-${jahr}-${String(i + 1).padStart(4, "0")}`, datum: d, faellig_am: d,
      empf_name: empf, kunde_id: empf === huber.name ? huber.id : null, netto, ust, brutto: Math.round((netto + ust) * 100) / 100,
      betreff: "Übernahme aus Odoo",
    });
    bezahlen.push({ beleg_id: id, datum: d, betrag: Math.round((netto + ust) * 100) / 100, art: "zahlung", notiz: "ZZ Test" });
  }
}
// App-Rechnungen im laufenden Jahr: offen, bezahlt, überfällig, Entwurf
for (let i = 0; i < 18; i++) {
  const d = tagIm(JAHR, i, 18);
  const netto = Math.round((500 + zufall() * 6000) * 100) / 100;
  const ust = Math.round(netto * 20) / 100;
  const brutto = Math.round((netto + ust) * 100) / 100;
  const entwurf = i === 0;
  const id = crypto.randomUUID();
  const faellig = new Date(new Date(d).getTime() + 14 * 864e5).toISOString().slice(0, 10);
  belege.push({
    id, typ: "rechnung", status: entwurf ? "entwurf" : "offen", altbestand: false, nummer: entwurf ? null : `ZZRE-${JAHR}-${String(18 - i).padStart(3, "0")}`,
    datum: d, faellig_am: faellig, empf_name: NAMEN[i % NAMEN.length], kunde_id: i % NAMEN.length === 0 ? huber.id : null,
    netto, ust, brutto, betreff: ["PV-Anlage 9 kWp", "Zählerplatz neu", "Wallbox 11 kW", "Störungsbehebung", "E-Befund"][i % 5],
  });
  if (!entwurf && i % 3 !== 1) bezahlen.push({ beleg_id: id, datum: faellig < heute ? faellig : heute, betrag: brutto, art: "zahlung", notiz: "ZZ Test" });
}
// Angebote 2024–laufend
for (let jahr = 2024; jahr <= JAHR; jahr++) {
  for (let i = 0; i < 12; i++) {
    const d = tagIm(jahr, i, 12);
    const netto = Math.round((800 + zufall() * 15000) * 100) / 100;
    const ust = Math.round(netto * 20) / 100;
    belege.push({
      id: crypto.randomUUID(), typ: "angebot", status: ["offen", "angenommen", "abgelehnt", "offen"][i % 4], altbestand: false,
      nummer: `ZZAN-${jahr}-${String(12 - i).padStart(3, "0")}`, datum: d, gueltig_bis: new Date(new Date(d).getTime() + 30 * 864e5).toISOString().slice(0, 10),
      empf_name: NAMEN[i % NAMEN.length], kunde_id: i % NAMEN.length === 0 ? huber.id : null, netto, ust, brutto: Math.round((netto + ust) * 100) / 100,
      betreff: "PV-Anlage mit Speicher",
    });
  }
}
const alleFelder = (z) => ({ gueltig_bis: null, faellig_am: null, kunde_id: null, nummer: null, ...z });
for (let i = 0; i < belege.length; i += 200) pruef((await admin.from("belege").insert(belege.slice(i, i + 200).map(alleFelder))).error, "Belege");
for (let i = 0; i < bezahlen.length; i += 200) pruef((await admin.from("zahlungen").insert(bezahlen.slice(i, i + 200))).error, "Zahlungen");
pruef((await admin.from("odoo_import").insert(belege.filter((b) => b.altbestand).map((b) => ({ tabelle: "belege", zeile_id: b.id, extern: b.nummer })))).error, "odoo_import belege");

// ── Eingang: 2023–laufend Odoo (alle bezahlt), dazu ein paar neue zum Prüfen ──
const eingang = [];
const LIEFERANTEN = ["ZZ Großhandel", "ZZ Sonepar", "ZZ Hager Vertrieb", "ZZ Tankstelle"];
for (let jahr = 2023; jahr <= JAHR; jahr++) {
  for (let i = 0; i < 50; i++) {
    const d = tagIm(jahr, i, 50);
    const netto = Math.round((40 + zufall() * 4000) * 100) / 100;
    const ust = Math.round(netto * 20) / 100;
    const neu = jahr === JAHR && i < 6;
    eingang.push({
      id: crypto.randomUUID(), lieferant: LIEFERANTEN[i % LIEFERANTEN.length], nummer: `ZZER-${jahr}-${i + 1}`, datum: d, faellig_am: d,
      netto, ust, brutto: Math.round((netto + ust) * 100) / 100, kategorie: "material", betrieb: true,
      bezahlt_am: neu ? null : d, freigabe: neu ? (i < 3 ? "offen" : "freigegeben") : "freigegeben", odoo: !neu,
    });
  }
}
for (let i = 0; i < eingang.length; i += 200) {
  pruef((await admin.from("eingangsrechnungen").insert(eingang.slice(i, i + 200).map(({ odoo, ...r }) => r))).error, "Eingang");
}
pruef((await admin.from("odoo_import").insert(eingang.filter((r) => r.odoo).map((r) => ({ tabelle: "eingangsrechnungen", zeile_id: r.id, extern: r.nummer })))).error, "odoo_import eingang");
console.log(`angelegt: ${belege.length} Belege, ${eingang.length} Eingangsrechnungen`);

const fehler = [];
let browser;
async function anmelden(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill("zz-chef@test.local");
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  return page;
}
const breiteOk = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const nummernSichtbar = async (page, muster) => (await page.getByText(muster).count());

try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const [geraet, viewport] of [["handy", { width: 390, height: 844 }], ["pc", { width: 1440, height: 900 }]]) {
    const page = await anmelden(viewport);
    const seite = async (pfad, name, warten) => {
      await page.goto(`${APP_URL}${pfad}`);
      await page.getByText(warten).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      ok(await breiteOk(page), `${geraet} ${name}: keine waagrechte Scrollleiste`);
      await page.screenshot({ path: `${BILDER}/jahresansicht-${name}-${geraet}.png`, fullPage: geraet === "handy" ? false : false });
    };

    await seite("/rechnungen", "rechnungen", /Monat|ZZRE|ZZ-/);
    ok(await nummernSichtbar(page, `ZZ-${JAHR - 1}-`) === 0, `${geraet} Rechnungen: Vorjahr nicht in der Standardansicht`);
    ok(await page.getByText(/^Odoo$/).count() > 0, `${geraet} Rechnungen: Odoo-Etikett sichtbar`);
    ok(await page.getByRole("button", { name: String(JAHR), exact: true }).getAttribute("aria-pressed") === "true", `${geraet} Rechnungen: ${JAHR} gewählt`);
    // Suche über alle Jahre
    await page.getByRole("textbox", { name: "Suchen" }).fill(`ZZ-2021-0007`);
    await page.waitForTimeout(500);
    ok(await nummernSichtbar(page, "ZZ-2021-0007") > 0, `${geraet} Suche findet Rechnung aus 2021`);
    ok(await page.getByText("Suche in allen Jahren").count() > 0, `${geraet} Hinweis „Suche in allen Jahren“`);
    await page.screenshot({ path: `${BILDER}/jahresansicht-rechnungen-suche-${geraet}.png` });
    await page.getByLabel("Suche leeren").click();
    // Archiv: 2022 wählen
    await page.getByRole("button", { name: /Archiv/ }).click();
    await page.getByRole("menuitem", { name: "2022" }).click();
    await page.waitForTimeout(500);
    ok(await nummernSichtbar(page, "ZZ-2022-") > 0 && await nummernSichtbar(page, `ZZRE-${JAHR}-`) === 0, `${geraet} Archiv 2022 zeigt nur 2022`);
    await page.screenshot({ path: `${BILDER}/jahresansicht-rechnungen-archiv-${geraet}.png` });
    await page.reload();
    await page.getByText(/ZZ-2022-/).first().waitFor({ timeout: 20000 });
    ok(true, `${geraet} Auswahl 2022 nach Neuladen gemerkt`);
    await page.getByRole("button", { name: String(JAHR), exact: true }).click();

    await seite("/angebote", "angebote", /ZZAN-/);
    await seite("/eingang?filter=bezahlt", "eingang", /ZZER-/);
    ok(await nummernSichtbar(page, `ZZER-${JAHR - 1}-`) === 0, `${geraet} Eingang bezahlt: Vorjahr nicht sichtbar`);
    await seite("/eingang", "eingang-pruefen", /ZZER-/);
    await seite("/offene-posten?filter=alle", "offene-posten", /ZZRE-/);
    await seite(`/kunden?k=${huber.id}`, "kunde", /Angebote & Rechnungen/);
    await seite(`/kunden?k=${grosshandel.id}&art=lieferant`, "lieferant", /ZZER-/);
    await seite(`/auswertung?jahr=${JAHR}`, "auswertung", /Umsatz netto/);
    ok(await page.getByText(/aus Odoo/).count() > 0, `${geraet} Auswertung: Odoo-Anteil gekennzeichnet`);
    await page.context().close();
  }
  ok(fehler.length === 0, `keine Fehler in der Konsole${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
} finally {
  await browser?.close();
  // aufräumen
  await admin.from("odoo_import").delete().in("zeile_id", [...belege.map((b) => b.id), ...eingang.map((r) => r.id)]);
  await admin.from("zahlungen").delete().eq("notiz", "ZZ Test");
  for (let i = 0; i < belege.length; i += 200) await admin.from("belege").delete().in("id", belege.slice(i, i + 200).map((b) => b.id));
  for (let i = 0; i < eingang.length; i += 200) await admin.from("eingangsrechnungen").delete().in("id", eingang.slice(i, i + 200).map((r) => r.id));
  await admin.from("kunden").delete().in("id", [huber.id, grosshandel.id]);
  await admin.auth.admin.deleteUser(chefId);
}
console.log(fehlschlaege ? `${fehlschlaege} Prüfungen fehlgeschlagen` : "alles gut");
process.exit(fehlschlaege ? 1 : 0);
