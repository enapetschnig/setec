// Prüfung 18.11.2026 — Postfach-Abruf härten (H1, H2, M1, L2–L5). Derselbe Kern wie die Edge
// Function postfach-abruf (_shared/abruf.ts) gegen die Docker-Testumgebung; Gmail und die KI sind
// nachgebaut (kein Netz, keine echten Mails, kein Postfach-Inhalt).
// Prüft:
// - dieselbe Rechnung unter anderem Namen und Nummernformat (Odoo-Übernahme) → „doppelt“ (H1)
// - Lieferant über die UID zugeordnet; KI-Schreibweise nach einer Korrektur gelernt
// - Beleg ohne Nummer und Datum: Tag der Mail in Wien (L4); zweite Kopie mit anderem Namen,
//   gleichem Absender → „doppelt“ (L3)
// - zu großer Anhang: nicht gelesen, aber gemeldet; nur zu groß → „nicht lesbar“ (H2)
// - mehr als 4 Anhänge: Hinweis statt still weg (L2)
// - hängengebliebene Mail (3 Versuche) → „fehler“ mit Text; kaputter Beleg nach 3 Versuchen endgültig
// - KI überlastet → Versuch zählt nicht, Lauf hört auf, der nächste liest sie
// - neue Mails vor Wiederholungen; das zweite Postfach bekommt seinen Anteil am Lauf (L5)
// - als_gelesen aus → UNREAD bleibt; an → UNREAD weg; Label immer
// - Postfach einer fremden Domain wird nie geöffnet, letzter_fehler sagt warum (M1)
// - Rechte: Chef sieht „nicht gelesene Mails“, Monteur nicht; Doppelt-Suche und Domain-Liste
//   sind für App-Benutzer gesperrt
// - ein weiterer Abruf ändert nichts
// - mit APP_URL auch die Oberfläche: Liste unter Einstellungen → E-Mail, Haken „als gelesen
//   markieren“ speichern, Hinweis auf /eingang am Handy (aufklappen, ✕ bleibt weg)
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   API_URL=http://127.0.0.1:55200 ANON_KEY=… SERVICE_ROLE_KEY=… [APP_URL=http://127.0.0.1:55210] \
//   node tests/roboter/2026-11-18-postfach-haerten.mjs
// Legt alles mit „ZZ PF“ bzw. *.test an und räumt danach auf.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { abrufen, VERSUCHE_MAX } from "../../supabase/functions/_shared/abruf.ts";

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, APP_URL } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) throw new Error("API_URL, ANON_KEY und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API_URL)) throw new Error("Nur gegen die lokale Testumgebung.");

const sb = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };
const pruefe = ({ error }, was) => { if (error) throw new Error(`${was}: ${error.message}`); };

const DOMAIN = "zz-setec.test";
const M1 = `rechnung@${DOMAIN}`, M2 = `s.sattler@${DOMAIN}`, M3 = "office@zz-fremd.test";
const MAILS = [M1, M2, M3];
const PW = "test1234!";

// ── aufräumen (auch Reste eines abgebrochenen Laufs) ─────────────────────
async function aufraeumen() {
  const { data: pm } = await sb.from("postfach_mails").select("id").in("postfach", MAILS);
  const mailIds = (pm ?? []).map((m) => m.id);
  const { data: er1 } = mailIds.length ? await sb.from("eingangsrechnungen").select("id, datei_pfad").in("postfach_mail_id", mailIds) : { data: [] };
  const { data: er2 } = await sb.from("eingangsrechnungen").select("id, datei_pfad").like("lieferant", "ZZ PF %");
  const er = [...(er1 ?? []), ...(er2 ?? [])];
  const pfade = er.map((r) => r.datei_pfad).filter(Boolean);
  if (pfade.length) await sb.storage.from("eingangsrechnungen").remove(pfade);
  if (er.length) pruefe(await sb.from("eingangsrechnungen").delete().in("id", [...new Set(er.map((r) => r.id))]), "Rechnungen löschen");
  pruefe(await sb.from("postfach_mails").delete().in("postfach", MAILS), "Mails löschen");
  pruefe(await sb.from("postfaecher").delete().in("adresse", MAILS), "Postfächer löschen");
  pruefe(await sb.from("kunden").delete().like("name", "ZZ PF %"), "Kontakte löschen");
  const { data: u } = await sb.auth.admin.listUsers();
  for (const x of u?.users ?? []) if (/^zz-pf-/.test(x.email ?? "")) await sb.auth.admin.deleteUser(x.id);
}

// ── Gmail-Nachbau ────────────────────────────────────────────────────────
const gmail = new Map(MAILS.map((a) => [a, { mails: [], anhaenge: new Map(), geoeffnet: 0, voll: [], geladen: [] }]));
const pdf = (beleg) => Buffer.concat([
  Buffer.from(`%PDF-1.4\n% ${JSON.stringify(beleg)}\n%%EOF\n`),
  Buffer.from([0xfb, 0xff, 0xfe, 0x3e, 0x3f]), // ergibt „-“ und „_“ in base64url
]);
const originale = new Map(); // attachmentId → Buffer
/** Mail anlegen; neueste stehen in der Liste vorne (wie bei Gmail) */
function mail(adresse, { id, von, betreff, zeit, anhaenge }) {
  const pf = gmail.get(adresse);
  const parts = [{ partId: "0", mimeType: "text/plain", body: { size: 12, data: Buffer.from("Siehe Anhang").toString("base64url") } }];
  for (const [i, a] of anhaenge.entries()) {
    const att = `${id}-a${i}`;
    if (a.beleg) {
      const b = pdf(a.beleg);
      originale.set(att, b);
      pf.anhaenge.set(att, b.toString("base64url"));
    }
    parts.push({
      partId: String(i + 1), mimeType: a.mime ?? "application/pdf", filename: a.name,
      headers: [{ name: "Content-Disposition", value: `attachment; filename="${a.name}"` }],
      body: { attachmentId: att, size: a.groesse ?? originale.get(att).length },
    });
  }
  pf.mails.unshift({
    id, internalDate: String(Date.parse(zeit)), labels: new Set(["INBOX", "UNREAD"]),
    payload: { mimeType: "multipart/mixed", headers: [{ name: "From", value: von }, { name: "Subject", value: betreff }], parts },
  });
}
function zugang(pf) {
  const finde = (id) => pf.mails.find((m) => m.id === id) ?? (() => { throw new Error(`Gmail (404): ${id} nicht gefunden`); })();
  return {
    async api(pfad, init) {
      if (pfad.startsWith("messages?")) return { messages: pf.mails.map((m) => ({ id: m.id })) };
      let t = pfad.match(/^messages\/([^/?]+)\/attachments\/([^/?]+)$/);
      if (t) { pf.geladen.push(t[2]); return { data: pf.anhaenge.get(t[2]) }; }
      t = pfad.match(/^messages\/([^/?]+)\/modify$/);
      if (t) {
        const b = JSON.parse(init.body), m = finde(t[1]);
        for (const l of b.addLabelIds ?? []) m.labels.add(l);
        for (const l of b.removeLabelIds ?? []) m.labels.delete(l);
        return {};
      }
      t = pfad.match(/^messages\/([^/?]+)\?format=full$/);
      if (t) { const m = finde(t[1]); pf.voll.push(m.id); return { id: m.id, internalDate: m.internalDate, payload: m.payload }; }
      throw new Error(`Gmail-Nachbau kennt ${pfad} nicht`);
    },
    async label() { return "Label_ZZ"; },
  };
}
const oeffnen = async (adresse) => { const pf = gmail.get(adresse); pf.geoeffnet++; return zugang(pf); };
const labels = (adresse, id) => [...(gmail.get(adresse).mails.find((m) => m.id === id)?.labels ?? [])];

// ── KI-Nachbau: der Beleg steht als JSON im „PDF“ ─────────────────────────
const gelesen = [];
const schonUeberlastet = new Set();
let firmaBeimLesen;
const lesen = async (datei, firma) => {
  firmaBeimLesen = firma;
  gelesen.push(datei.name);
  const text = Buffer.from(datei.base64, "base64").toString("utf8");
  const b = JSON.parse(text.match(/^%PDF-1\.4\n% (.*)\n%%EOF/s)[1]);
  if (b.absturz === "ueberlastet" && !schonUeberlastet.has(datei.name)) {
    schonUeberlastet.add(datei.name);
    throw Object.assign(new Error("Overloaded"), { status: 529 });
  }
  if (b.absturz === "kaputt") throw Object.assign(new Error("Could not process PDF"), { status: 400 });
  return {
    art: "rechnung", lieferant: null, lieferant_uid: null, nummer: null, datum: null, faellig_am: null, netto: null, ust_satz: 20,
    brutto: null, iban: null, skonto_prozent: null, skonto_bis: null, lieferschein_nummern: [], positionen: [], hinweis: null, ...b,
  };
};
const lauf = (extra = {}) => abrufen({ sb, lesen, oeffnen, domains: [DOMAIN], ...extra });

/** Einstellungen → E-Mail (PC) und /eingang (Handy) als Chef */
async function oberflaeche() {
  const { chromium } = await import("@playwright/test");
  fs.mkdirSync(BILDER, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const fehler = [];
  const seite = async (viewport, handy = false) => {
    const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna", isMobile: handy, hasTouch: handy });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill("zz-pf-chef@test.local");
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    return page;
  };
  try {
    const pc = await seite({ width: 1440, height: 1000 });
    await pc.goto(`${APP_URL}/einstellungen?bereich=email`);
    const liste = pc.locator('[data-pruef="ungelesene-mails"]');
    await liste.waitFor({ timeout: 20000 });
    ok(await liste.locator("li").count() === 5, "Einstellungen → E-Mail: „Nicht gelesene Mails“ (5)");
    ok((await liste.textContent()).includes("ist zu groß für die KI"), "… mit Grund");
    const href = await liste.locator("a", { hasText: "In Gmail öffnen" }).first().getAttribute("href");
    ok(/^https:\/\/mail\.google\.com\/mail\/\?authuser=[^#]+#all\/zz-/.test(href ?? ""), `… und Link nach Gmail (${href})`);
    await pc.screenshot({ path: `${BILDER}/postfach-ungelesen-pc.png`, fullPage: true });

    // Haken „als gelesen markieren“ bei s.sattler@ aus → speichern → Datenbank
    const zeilen = pc.locator('[data-pruef="postfach-zeile"]');
    let zeileM2 = null;
    for (let i = 0; i < await zeilen.count(); i++) {
      if (await zeilen.nth(i).locator('input[type="email"]').inputValue() === M2) zeileM2 = zeilen.nth(i);
    }
    const haken = zeileM2.locator('[data-pruef="als-gelesen"] button[role="checkbox"]');
    ok(await haken.getAttribute("aria-checked") === "true", "Haken „als gelesen markieren“ steht wie gespeichert");
    await haken.click();
    await pc.getByRole("button", { name: "Postfächer speichern" }).click();
    await pc.getByText("Postfächer gespeichert").first().waitFor({ timeout: 10000 });
    const { data: pfs } = await sb.from("postfaecher").select("adresse, als_gelesen").in("adresse", MAILS);
    ok(pfs?.find((p) => p.adresse === M2)?.als_gelesen === false && pfs?.find((p) => p.adresse === M1)?.als_gelesen === true, "Haken aus → nur bei s.sattler@ gespeichert");

    const handy = await seite({ width: 390, height: 844 }, true);
    await handy.goto(`${APP_URL}/eingang`);
    const hinweis = handy.locator('[data-pruef="ungelesen-hinweis"]');
    await hinweis.waitFor({ timeout: 20000 });
    ok(/5 Mails aus dem Postfach konnte die App nicht lesen/.test(await hinweis.textContent()), "/eingang: Hinweis mit Anzahl");
    await hinweis.getByRole("button", { name: "Ansehen" }).click();
    ok(await hinweis.locator("li").count() === 5, "aufgeklappt: die Mails");
    await handy.screenshot({ path: `${BILDER}/postfach-ungelesen-handy.png`, fullPage: true });
    const breite = await handy.evaluate(() => document.documentElement.scrollWidth);
    ok(breite <= 390, `Handy: nichts ragt seitlich hinaus (${breite} px)`);
    await hinweis.getByRole("button", { name: "Hinweis ausblenden" }).click();
    ok(await hinweis.count() === 0, "✕ blendet den Hinweis aus");
    await handy.reload();
    await handy.waitForLoadState("networkidle");
    ok(await handy.locator('[data-pruef="ungelesen-hinweis"]').count() === 0, "… auch nach dem Neuladen");
  } finally {
    await browser.close();
  }
  ok(fehler.length === 0, `keine Fehler im Browser${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
}
const zeile = async (id) => (await sb.from("postfach_mails").select("*").eq("message_id", id).maybeSingle()).data;
const rechnung = async (id) => (await sb.from("eingangsrechnungen").select("*").eq("id", id).maybeSingle()).data;

await aufraeumen();
const benutzer = [];
try {
  // ── Ausgangslage ───────────────────────────────────────────────────────
  pruefe(await sb.from("kunden").insert([
    { name: "ZZ PF Muster Großhandel", art: "lieferant", uid: "ATU 1234 5678" },
  ]), "Kontakt");
  const { data: odoo, error: eO } = await sb.from("eingangsrechnungen").insert({
    lieferant: "ZZ PF Muster Großhandel", nummer: "RE-2026/0815", datum: "2026-11-10", netto: 1028.8, ust: 205.76, brutto: 1234.56, notiz: "aus Odoo",
  }).select("id").single();
  if (eO) throw eO;
  const { data: pfs, error: eP } = await sb.from("postfaecher").insert([
    { adresse: M1, rechnungen_einlesen: true, als_gelesen: true },
    { adresse: M2, rechnungen_einlesen: true, als_gelesen: false },
    { adresse: M3, rechnungen_einlesen: true, als_gelesen: true },
  ]).select("id, adresse");
  if (eP) throw eP;
  const pfId = Object.fromEntries(pfs.map((p) => [p.adresse, p.id]));
  const alt = new Date(Date.now() - 30 * 60_000).toISOString();
  pruefe(await sb.from("postfach_mails").insert([
    { postfach_id: pfId[M1], postfach: M1, message_id: "zz-haengt", ergebnis: "in_arbeit", versuche: VERSUCHE_MAX,
      fehler: "bei „riesig.pdf“, 9,5 MB", von: "Lieferant <r@lieferant-zz.test>", betreff: "ZZ hängt", created_at: alt, updated_at: alt },
    { postfach_id: pfId[M1], postfach: M1, message_id: "zz-wieder", ergebnis: "fehler", versuche: 1,
      fehler: "Gmail (500): kurz weg", von: "Wieder <r@wieder-zz.test>", betreff: "ZZ wieder", created_at: alt, updated_at: alt },
  ]), "alte Mails");

  // ── Postfach 1: rechnung@ (als gelesen markieren) ──────────────────────
  mail(M1, { id: "zz-wieder", von: "Wieder <r@wieder-zz.test>", betreff: "ZZ wieder", zeit: "2026-10-30T08:00:00Z",
    anhaenge: [{ name: "W-1.pdf", beleg: { lieferant: "ZZ PF Wieder GmbH", nummer: "W-1", datum: "2026-10-30", brutto: 50 } }] });
  mail(M1, { id: "zz-tanke1", von: "Tankstelle <beleg@tanke-zz.test>", betreff: "Beleg", zeit: "2026-10-31T23:30:00Z",
    anhaenge: [{ name: "Beleg.pdf", beleg: { lieferant: "ZZ PF Tankstelle Mürz", brutto: 80, netto: 66.67 } }] });
  mail(M1, { id: "zz-tanke2", von: "Tankstelle <kassa@tanke-zz.test>", betreff: "Beleg (Kopie)", zeit: "2026-10-31T23:45:00Z",
    anhaenge: [{ name: "Beleg Kopie.pdf", beleg: { lieferant: "ZZ PF Tankstelle Mürz GmbH & Co KG", brutto: 80, netto: 66.67 } }] });
  mail(M1, { id: "zz-odoo", von: "MGH <rechnung@muster-zz.test>", betreff: "Ihre Rechnung", zeit: "2026-11-16T07:00:00Z",
    anhaenge: [{ name: "RE 2026 0815.pdf", beleg: { lieferant: "MUSTER Elektro-Großhandels GmbH Filiale Graz", nummer: "re 2026 0815", datum: "2026-11-10", brutto: 1234.56, netto: 1028.8 } }] });
  mail(M1, { id: "zz-uid", von: "Buchhaltung <noreply@portal-zz.test>", betreff: "Rechnung GA-77", zeit: "2026-11-16T08:00:00Z",
    anhaenge: [{ name: "GA-77.pdf", beleg: { lieferant: "Ganz Anderer Name Handels GmbH", lieferant_uid: "ATU12345678", nummer: "GA-77", datum: "2026-11-12", brutto: 240, netto: 200 } }] });
  mail(M1, { id: "zz-gross", von: "Huber <office@huber-zz.test>", betreff: "Rechnung + Plan", zeit: "2026-11-16T09:00:00Z",
    anhaenge: [
      { name: "Plan riesig.pdf", groesse: 15 * 1024 * 1024 },
      { name: "Rechnung R-9.pdf", beleg: { lieferant: "ZZ PF Elektro Huber", nummer: "R-9", datum: "2026-11-13", brutto: 99 } },
    ] });
  mail(M1, { id: "zz-nurgross", von: "Kunde <k@kunde-zz.test>", betreff: "Foto", zeit: "2026-11-16T10:00:00Z",
    anhaenge: [{ name: "Foto.jpg", mime: "image/jpeg", groesse: 5 * 1024 * 1024 }] });
  mail(M1, { id: "zz-sechs", von: "Sechs <s@sechs-zz.test>", betreff: "Unterlagen", zeit: "2026-11-16T11:00:00Z",
    anhaenge: ["a", "b", "c", "d", "e", "f"].map((x, i) => ({
      name: `${x}.pdf`, beleg: i === 0 ? { lieferant: "ZZ PF Sechs GmbH", nummer: "S-1", datum: "2026-11-14", brutto: 10 } : { art: "sonstiges" },
    })) });
  mail(M1, { id: "zz-neu1", von: "Händler <r@haendler-zz.test>", betreff: "Rechnung K-1", zeit: "2026-11-16T12:00:00Z",
    anhaenge: [{ name: "K-1.pdf", beleg: { lieferant: "ZZ PF Neuer Händler XY", nummer: "K-1", datum: "2026-11-14", brutto: 30 } }] });
  // ── Postfach 2: s.sattler@ (persönlich: nicht als gelesen markieren) ───
  mail(M2, { id: "zz-sattler", von: "Baumarkt <rechnung@baumarkt-zz.test>", betreff: "Ihr Einkauf", zeit: "2026-11-16T09:30:00Z",
    anhaenge: [{ name: "BM-5.pdf", beleg: { lieferant: "ZZ PF Baumarkt", nummer: "BM-5", datum: "2026-11-15", brutto: 45.9 } }] });
  // ── Postfach 3: fremde Domain ─────────────────────────────────────────
  mail(M3, { id: "zz-fremd", von: "x <x@y-zz.test>", betreff: "geheim", zeit: "2026-11-16T09:00:00Z",
    anhaenge: [{ name: "X.pdf", beleg: { lieferant: "ZZ PF Fremd", nummer: "X-1", brutto: 1 } }] });

  // ── Lauf 1 ─────────────────────────────────────────────────────────────
  const b1 = await lauf();
  console.log("Lauf 1:", JSON.stringify({ ...b1, meldungen: b1.meldungen.length }));
  ok(gmail.get(M3).geoeffnet === 0, "fremde Domain: Postfach nie geöffnet");
  const p3 = (await sb.from("postfaecher").select("letzter_fehler, zuletzt_abgerufen").eq("adresse", M3).single()).data;
  ok(/zz-fremd\.test.*nicht freigegeben/.test(p3?.letzter_fehler ?? "") && !p3?.zuletzt_abgerufen, "fremde Domain: letzter_fehler sagt warum");
  ok(b1.meldungen.some((m) => m.startsWith(M3)), "fremde Domain steht in der Bilanz");
  ok((await zeile("zz-sattler"))?.ergebnis === "rechnung", "zweites Postfach kam im selben Lauf dran (gerechter Anteil)");
  ok(b1.offen > 0, `Postfach 1 hat noch offene Mails (${b1.offen})`);
  ok(!gmail.get(M1).voll.includes("zz-wieder"), "Wiederholung wartet, neue Mails zuerst");
  ok(gmail.get(M1).voll[0] === "zz-tanke1", "älteste neue Mail zuerst");
  const haengt = await zeile("zz-haengt");
  ok(haengt?.ergebnis === "fehler" && /^Nach 3 Versuchen abgebrochen \(zuletzt bei „riesig\.pdf“, 9,5 MB\)/.test(haengt?.ungelesen ?? ""),
    `hängengebliebene Mail → fehler + Text: ${haengt?.ungelesen?.slice(0, 80)}`);
  ok(b1.ungelesen >= 1, "Bilanz zählt die nicht gelesene Mail");
  ok(firmaBeimLesen === (await sb.from("firma").select("name").limit(1).single()).data?.name, "KI bekommt den Firmennamen");

  // ── weitere Läufe, bis nichts mehr offen ist ───────────────────────────
  for (let n = 2; n <= 8; n++) {
    const b = await lauf();
    console.log(`Lauf ${n}:`, JSON.stringify({ ...b, meldungen: b.meldungen.length }));
    if (!b.offen) break;
  }
  ok(!gmail.get(M3).geoeffnet, "fremde Domain auch später nie geöffnet");

  // H1: dieselbe Rechnung wie aus Odoo, anderer Name, anderes Nummernformat
  const zOdoo = await zeile("zz-odoo");
  ok(zOdoo?.ergebnis === "doppelt" && zOdoo?.eingangsrechnung_id === odoo.id, "Odoo-Rechnung unter anderem Namen → doppelt, zeigt auf das Original");
  const { count: anzOdoo } = await sb.from("eingangsrechnungen").select("id", { count: "exact", head: true }).ilike("nummer", "%0815%");
  ok(anzOdoo === 1, "keine zweite Rechnung RE-2026/0815");

  // UID
  const zUid = await zeile("zz-uid");
  const rUid = await rechnung(zUid?.eingangsrechnung_id);
  ok(zUid?.ergebnis === "rechnung" && rUid?.lieferant === "ZZ PF Muster Großhandel", `über die UID zugeordnet: ${rUid?.lieferant}`);
  ok(rUid?.lieferant_gelesen === "Ganz Anderer Name Handels GmbH" && rUid?.lieferant_uid === "ATU12345678", "Schreibweise und UID wie gelesen gespeichert");
  ok(/Lieferant zugeordnet über UID-Nummer \(auf der Rechnung: „Ganz Anderer Name Handels GmbH“\)/.test(rUid?.notiz ?? ""), "Notiz sagt, wie zugeordnet");

  // L4 + L3: ohne Nummer und Datum
  const r1 = await rechnung((await zeile("zz-tanke1"))?.eingangsrechnung_id);
  ok(r1?.datum === "2026-11-01", `Datum = Tag der Mail in Wien (31.10. 23:30 UTC → ${r1?.datum})`);
  const zT2 = await zeile("zz-tanke2");
  ok(zT2?.ergebnis === "doppelt" && zT2?.eingangsrechnung_id === r1?.id, "Kopie ohne Nummer, anderer Name, gleicher Absender → doppelt");
  const { data: datei } = await sb.storage.from("eingangsrechnungen").download(r1?.datei_pfad ?? "x");
  ok(!!datei && Buffer.from(await datei.arrayBuffer()).equals(originale.get("zz-tanke1-a0")), "abgelegte Datei Byte für Byte wie der Anhang (base64url)");
  ok(labels(M1, "zz-tanke1").includes("Label_ZZ") && !labels(M1, "zz-tanke1").includes("UNREAD"), "Postfach 1: Label + als gelesen markiert");
  ok(labels(M1, "zz-tanke2").includes("Label_ZZ") && labels(M1, "zz-tanke2").includes("UNREAD"), "doppelt: Label, bleibt ungelesen");

  // als_gelesen aus
  ok(labels(M2, "zz-sattler").includes("Label_ZZ") && labels(M2, "zz-sattler").includes("UNREAD"), "Postfach 2 (als_gelesen aus): Label, bleibt ungelesen");

  // H2: zu groß
  const zG = await zeile("zz-gross");
  ok(zG?.ergebnis === "rechnung" && /„Plan riesig\.pdf“ ist zu groß für die KI \(15,0 MB, höchstens 10,0 MB\)/.test(zG?.ungelesen ?? ""), "zu großer Anhang: übersprungen und gemeldet, Rechnung trotzdem da");
  ok(!gmail.get(M1).geladen.includes("zz-gross-a0") && !gelesen.includes("Plan riesig.pdf"), "zu großer Anhang nie geladen");
  const zNG = await zeile("zz-nurgross");
  ok(zNG?.ergebnis === "fehler" && /„Foto\.jpg“ ist zu groß/.test(zNG?.ungelesen ?? "") && zNG?.fehler === zNG?.ungelesen, "nur zu großer Anhang → nicht lesbar, endgültig");

  // L2: mehr als 4 Anhänge
  const zS = await zeile("zz-sechs");
  ok(/2 weitere Anhänge nicht gelesen \(höchstens 4 je Mail\): „e\.pdf“, „f\.pdf“/.test(zS?.ungelesen ?? ""), "6 Anhänge: Hinweis auf e.pdf und f.pdf");
  ok(["a.pdf", "b.pdf", "c.pdf", "d.pdf"].every((x) => gelesen.includes(x)) && !gelesen.includes("e.pdf") && !gmail.get(M1).geladen.includes("zz-sechs-a5"), "nur 4 gelesen, Rest nie geladen");

  // Wiederholung
  const zW = await zeile("zz-wieder");
  ok(zW?.ergebnis === "rechnung" && zW?.versuche === 2, `alte Fehlschlag-Mail später wiederholt (Versuch ${zW?.versuche})`);

  // ── KI überlastet und kaputter Beleg ───────────────────────────────────
  mail(M1, { id: "zz-ueberlastet", von: "Leasing <r@leasing-zz.test>", betreff: "Rate", zeit: "2026-11-17T08:00:00Z",
    anhaenge: [{ name: "L-1.pdf", beleg: { lieferant: "ZZ PF Leasing AG", nummer: "L-1", datum: "2026-11-17", brutto: 300, absturz: "ueberlastet" } }] });
  mail(M1, { id: "zz-kaputt", von: "Kaputt <r@kaputt-zz.test>", betreff: "Rechnung", zeit: "2026-11-17T09:00:00Z",
    anhaenge: [{ name: "kaputt.pdf", beleg: { absturz: "kaputt" } }] });
  const bU = await lauf();
  console.log("Lauf Ü:", JSON.stringify({ ...bU, meldungen: bU.meldungen.length }));
  const zU = await zeile("zz-ueberlastet");
  ok(zU?.ergebnis === "fehler" && zU?.versuche === 0 && !zU?.ungelesen, "KI überlastet: Versuch zählt nicht");
  ok(bU.meldungen.some((m) => /Abruf unterbrochen \(Overloaded\)/.test(m)) && bU.offen >= 1, "Lauf hört auf und sagt es");
  ok((await zeile("zz-kaputt")) == null, "Mail danach blieb für den nächsten Lauf");
  for (let n = 0; n < 4; n++) {
    const b = await lauf();
    console.log(`Lauf K${n + 1}:`, JSON.stringify({ ...b, meldungen: b.meldungen.length }));
  }
  ok((await zeile("zz-ueberlastet"))?.ergebnis === "rechnung", "überlastete Mail im nächsten Lauf gelesen");
  const zK = await zeile("zz-kaputt");
  ok(zK?.ergebnis === "fehler" && zK?.versuche === VERSUCHE_MAX && /^Nach 3 Versuchen nicht lesbar: Could not process PDF/.test(zK?.ungelesen ?? ""),
    `kaputter Beleg nach ${zK?.versuche} Versuchen endgültig: ${zK?.ungelesen}`);
  ok(gelesen.filter((x) => x === "kaputt.pdf").length === VERSUCHE_MAX, "kaputter Beleg genau 3× an die KI");

  // ── Korrektur wird gelernt ─────────────────────────────────────────────
  const rNeu = await rechnung((await zeile("zz-neu1"))?.eingangsrechnung_id);
  ok(rNeu?.lieferant === "ZZ PF Neuer Händler XY" && rNeu?.lieferant_gelesen === "ZZ PF Neuer Händler XY", "neuer Händler wie gelesen");
  pruefe(await sb.from("eingangsrechnungen").update({ lieferant: "ZZ PF Händler Korrigiert" }).eq("id", rNeu.id), "Korrektur");
  mail(M1, { id: "zz-neu2", von: "Händler <r@haendler-zz.test>", betreff: "Rechnung K-2", zeit: "2026-11-17T10:00:00Z",
    anhaenge: [{ name: "K-2.pdf", beleg: { lieferant: "ZZ PF Neuer Händler XY", nummer: "K-2", datum: "2026-11-17", brutto: 31 } }] });
  await lauf();
  const rNeu2 = await rechnung((await zeile("zz-neu2"))?.eingangsrechnung_id);
  ok(rNeu2?.lieferant === "ZZ PF Händler Korrigiert" && /Schreibweise einer früheren Rechnung/.test(rNeu2?.notiz ?? ""),
    `Korrektur gelernt: ${rNeu2?.lieferant}`);

  // ── noch ein Abruf: nichts Neues ───────────────────────────────────────
  const vorher = gelesen.length;
  const bN = await lauf();
  ok(bN.rechnungen + bN.doppelt + bN.andere + bN.fehler + bN.offen + bN.ungelesen === 0 && gelesen.length === vorher, "weiterer Abruf ändert nichts");

  // ── Rechte (App-Benutzer) ──────────────────────────────────────────────
  async function anmelden(email, rolle) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw error;
    benutzer.push(data.user.id);
    pruefe(await sb.from("profiles").update({ aktiv: true, rolle, vorname: "ZZ", nachname: "PF", passwort_neu: false }).eq("id", data.user.id), "Profil");
    const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    pruefe(await c.auth.signInWithPassword({ email, password: PW }), "Anmelden");
    return c;
  }
  const chef = await anmelden("zz-pf-chef@test.local", "chef");
  const monteur = await anmelden("zz-pf-monteur@test.local", "monteur");
  const { data: liste } = await chef.from("postfach_mails").select("message_id, von, betreff, datum, ungelesen").not("ungelesen", "is", null).in("postfach", MAILS);
  ok(["zz-haengt", "zz-nurgross", "zz-gross", "zz-sechs", "zz-kaputt"].every((id) => liste?.some((z) => z.message_id === id)), `Chef sieht „nicht gelesene Mails“ (${liste?.length})`);
  const { data: mListe } = await monteur.from("postfach_mails").select("id").in("postfach", MAILS);
  ok((mListe ?? []).length === 0, "Monteur sieht keine Mails");
  const { error: eRpc } = await chef.rpc("eingang_doppelt_kandidaten", { p_kern: "re20260815", p_brutto: null, p_datum: null });
  ok(!!eRpc, `Doppelt-Suche für App-Benutzer gesperrt (${eRpc?.code ?? "–"})`);
  const { error: eDom } = await chef.from("postfach_domains").insert({ domain: "boese-zz.test" });
  const { data: dLesen, error: eDomL } = await chef.from("postfach_domains").select("domain");
  ok(!!eDom && (!!eDomL || (dLesen ?? []).length === 0), "Domain-Liste: Chef kann sie weder erweitern noch lesen");
  const { error: eAls } = await chef.from("postfaecher").update({ als_gelesen: true }).eq("adresse", M2);
  ok(!eAls && (await sb.from("postfaecher").select("als_gelesen").eq("adresse", M2).single()).data?.als_gelesen === true, "Chef schaltet „als gelesen markieren“ um");

  // ── Oberfläche (nur mit APP_URL: gebaute App gegen diese Testumgebung) ──
  if (APP_URL) await oberflaeche();
} finally {
  await aufraeumen();
  for (const id of benutzer) await sb.auth.admin.deleteUser(id).catch(() => {});
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden.");
process.exit(fehlschlaege ? 1 : 0);
