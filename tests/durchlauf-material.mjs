// Durchklick-Test „viel Material“: Monteur am Handy, Chef am PC — mehrere
// Artikel aus dem Bus (Stück, Meter mit Komma, eigener und Standard-Aufschlag,
// fester VK), Rückgabe, Stunden für sich und für eine Kollegin, Rechnung mit
// Cent-genauer Nachrechnung, Fertigstellen, „Rechnung ändern“ (Nummer bleibt,
// alte Fassung im Archiv), erneut fertig, Zahlung sperrt das Ändern.
//
//   APP_URL=http://127.0.0.1:8093 MONTEUR_PW=… CHEF_PW=… node tests/durchlauf-material.mjs
//   DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs   danach IMMER
//
// BROWSER=webkit: Monteur wie am iPhone (Safari-Technik).
import { chromium, webkit, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";

const URL = process.env.APP_URL || "http://127.0.0.1:8093";
const MONTEUR_PW = process.env.MONTEUR_PW;
const CHEF_PW = process.env.CHEF_PW;
if (!MONTEUR_PW || !CHEF_PW) {
  console.error("MONTEUR_PW und CHEF_PW fehlen (Passwörter der Demo-Konten max und chef).");
  process.exit(1);
}
const BILDER = "tests/bilder";
fs.mkdirSync(BILDER, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)));
const NAME = `TEST Durchlauf Material ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`;
const KUNDE = "Familie Huber";

// Was Max aus seinem Bus nimmt (EAN, Menge so wie er sie eintippt)
const MATERIAL = [
  { ean: "4011377062993", text: "SCHUKO-Steckdose LS 990", menge: "3" },     // fester VK 9,90
  { ean: "4011377114203", text: "Rahmen 1-fach LS 990", menge: "3" },        // Standard-Aufschlag des Betriebs
  { ean: "4050821808442", text: "Hebelklemme 221", menge: "20" },            // eigener Aufschlag 60 %
  { ean: "9005555121218", text: "Flexrohr M20", menge: "12,5" },             // Meter mit Komma
];
const ZURUECK = { text: "Hebelklemme 221", menge: 5 };

let fehlgeschlagen = 0;
const ok = (bedingung, text) => {
  if (!bedingung) fehlgeschlagen++;
  console.log((bedingung ? "✓ " : "✗ FEHLER ") + text);
};
const r2 = (x) => Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9) / 100;

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });
{
  const { error } = await db.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: CHEF_PW });
  if (error) throw new Error(`Chef-Anmeldung für die Prüfung: ${error.message}`);
}
const { data: profile } = await db.from("profiles").select("id, vorname, email").in("email", ["max@elektro.handwerkapp.at", "lisa@elektro.handwerkapp.at"]);
const maxP = profile.find((p) => p.email.startsWith("max"));
const lisaP = profile.find((p) => p.email.startsWith("lisa"));
const { data: firma } = await db.from("firma").select("name, material_aufschlag").eq("id", 1).single();
const { data: bus } = await db.from("lagerorte").select("id, name").ilike("name", "%Bus 1%").single();
const bestandVorher = new Map();
for (const m of MATERIAL) {
  const { data: a } = await db.from("artikel").select("id, bezeichnung, einheit, ek_preis, vk_preis, aufschlag, listenpreis").eq("ean", m.ean).eq("quelle", "demo").limit(1).single();
  m.artikel = a;
  const { data: b } = await db.from("lagerbestand").select("bestand").eq("artikel_id", a.id).eq("lagerort_id", bus.id).maybeSingle();
  bestandVorher.set(a.id, Number(b?.bestand ?? 0));
}
const vk = (a) => a.vk_preis != null ? r2(Number(a.vk_preis))
  : r2(Number(a.ek_preis) * (1 + (a.aufschlag != null ? Number(a.aufschlag) : Number(firma.material_aufschlag)) / 100));

const IPHONE = process.env.BROWSER === "webkit";
const handyBrowser = IPHONE ? await webkit.launch() : await chromium.launch();
const pcBrowser = IPHONE ? await chromium.launch() : handyBrowser;
const fehler = [];

async function sitzung(benutzer, passwort, pc = false) {
  const geraet = pc ? { viewport: { width: 1366, height: 768 } } : IPHONE ? devices["iPhone 15"] : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = await (pc ? pcBrowser : handyBrowser).newContext({ ...geraet, locale: "de-AT", timezoneId: "Europe/Vienna", acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem("mayr.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(`[${benutzer}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(`[${benutzer}] console: ${m.text()}`); });
  await page.goto(`${URL}/auth`);
  await page.locator("#benutzer").fill(benutzer);
  await page.locator("#password").fill(passwort);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 });
  return page;
}
const bild = (page, name) => page.screenshot({ path: `${BILDER}/material-${name}.png`, fullPage: true });

let projektId = null;
try {
  const max = await sitzung("max", MONTEUR_PW);

  // ── 1. Projekt ──────────────────────────────────────────────────────────
  console.log(`\n— Monteur Max${IPHONE ? " (iPhone)" : " (Android)"}: ${NAME} —`);
  await max.goto(`${URL}/projekte?neu=1`);
  await max.getByRole("button", { name: /Kunde wählen oder neu anlegen/ }).click();
  await max.getByPlaceholder(/^Name, Ort/).fill(KUNDE.split(" ").pop());
  await max.getByRole("button", { name: new RegExp(KUNDE) }).click();
  await max.locator("#p-name").fill(NAME);
  await max.getByRole("button", { name: "Projekt anlegen" }).click();
  await max.waitForURL(/\/projekte\/[0-9a-f-]{36}/, { timeout: 15000 });
  projektId = max.url().match(/projekte\/([0-9a-f-]{36})/)[1];
  const { data: pr } = await db.from("projekte").select("nummer").eq("id", projektId).single();
  ok(!!pr?.nummer, `Projekt ${pr?.nummer} angelegt`);

  // ── 2. Viel Material aus dem Bus ────────────────────────────────────────
  await max.goto(`${URL}/scan?modus=ausfassung&projekt=${projektId}`);
  await max.getByRole("button", { name: /Bus 1/ }).click();
  await max.getByRole("button", { name: "Scannen", exact: true }).click();
  for (const m of MATERIAL) {
    const feld = max.getByPlaceholder("Code eintippen");
    await feld.fill(m.ean);
    await feld.press("Enter");
    await max.waitForTimeout(1000);
  }
  await max.getByRole("button", { name: "Schließen" }).click();
  for (const m of MATERIAL) {
    const menge = max.locator(`input[aria-label^="Menge ${m.artikel.bezeichnung}"]`);
    await menge.fill(m.menge);
  }
  await bild(max, "2-ausfassen");
  await max.getByRole("button", { name: /ausfassen$/ }).click();
  await max.waitForTimeout(2000);
  const { data: mb } = await db.from("material_buchungen").select("artikel_id, art, menge, lagerort_id").eq("projekt_id", projektId);
  for (const m of MATERIAL) {
    const b = (mb ?? []).filter((x) => x.artikel_id === m.artikel.id && x.art === "ausfassung");
    ok(b.length === 1 && Number(b[0].menge) === Number(m.menge.replace(",", ".")) && b[0].lagerort_id === bus.id,
      `ausgefasst: ${m.menge} ${m.artikel.einheit} ${m.text}`);
  }

  // ── 3. Rückgabe: 5 Hebelklemmen zurück in den Bus ──────────────────────
  await max.goto(`${URL}/scan?modus=rueckgabe&projekt=${projektId}`);
  await max.getByRole("button", { name: /Bus 1/ }).click().catch(() => {});
  const zurueckArtikel = MATERIAL.find((m) => m.text === ZURUECK.text).artikel;
  await max.getByRole("button", { name: new RegExp(zurueckArtikel.bezeichnung.split(" ")[0]) }).first().click();
  await max.locator(`input[aria-label^="Menge ${zurueckArtikel.bezeichnung}"]`).fill(String(ZURUECK.menge));
  await bild(max, "3-rueckgabe");
  await max.getByRole("button", { name: /zurückgeben$|Rückgabe buchen|zurück in/ }).last().click();
  await max.waitForTimeout(2000);
  const { data: rg } = await db.from("material_buchungen").select("menge").eq("projekt_id", projektId).eq("art", "rueckgabe");
  ok(rg?.length === 1 && Number(rg[0].menge) === ZURUECK.menge, `Rückgabe: ${rg?.[0]?.menge ?? "keine"} Hebelklemmen zurück in den Bus`);

  // ── 4. Stunden: Max 3,5 h ───────────────────────────────────────────────
  await max.goto(`${URL}/projekte/${projektId}`);
  await max.getByRole("button", { name: "+ Stunden" }).first().click();
  await max.getByLabel("Andere Stundenzahl").fill("3,5");
  await max.locator("#z-taetigkeit").fill("TEST Material: Steckdosen gesetzt");
  await max.getByRole("button", { name: /3,5 h buchen/ }).click();
  await max.waitForTimeout(1500);

  // ── 5. Chef am PC: 2 h für Lisa, dann Rechnung ─────────────────────────
  console.log("\n— Chef am PC —");
  const chef = await sitzung("chef", CHEF_PW, true);
  await chef.goto(`${URL}/projekte/${projektId}`);
  await chef.getByRole("button", { name: "+ Stunden" }).first().click();
  const fuerWen = chef.getByRole("group", { name: "Für wen" });
  await fuerWen.getByRole("button", { pressed: true }).first().click();   // sich selbst abwählen
  await fuerWen.getByRole("button", { name: new RegExp(lisaP.vorname) }).click();
  await chef.getByRole("button", { name: "2 h", exact: true }).click();
  await chef.locator("#z-taetigkeit").fill("TEST Material: Verteiler beschriftet");
  await chef.getByRole("button", { name: /2 h buchen/ }).click();
  await chef.waitForTimeout(1500);
  const { data: zeiten } = await db.from("zeiten").select("user_id, stunden").eq("projekt_id", projektId);
  ok(zeiten?.length === 2 && zeiten.some((z) => z.user_id === maxP.id && Number(z.stunden) === 3.5) && zeiten.some((z) => z.user_id === lisaP.id && Number(z.stunden) === 2),
    `Stunden: ${(zeiten ?? []).map((z) => `${z.stunden} h ${z.user_id === maxP.id ? "Max" : z.user_id === lisaP.id ? "Lisa" : "?"}`).join(", ")}`);

  await chef.goto(`${URL}/belege/neu?typ=rechnung&projekt=${projektId}&import=1`);
  const uebernehmen = chef.getByRole("button", { name: /Positionen? übernehmen/ });
  await uebernehmen.waitFor({ timeout: 15000 });
  await bild(chef, "5-import");
  await uebernehmen.click();
  await chef.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await chef.waitForURL(/\/belege\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const belegId = chef.url().match(/belege\/([0-9a-f-]{36})/)[1];
  await chef.waitForTimeout(800);
  await bild(chef, "5-entwurf");

  const { data: pos } = await db.from("beleg_positionen").select("art, bezeichnung, menge, einheit, einzelpreis, gesamt, artikel_id").eq("beleg_id", belegId).order("pos");
  for (const m of MATERIAL) {
    const soll = Number(m.menge.replace(",", ".")) - (m.text === ZURUECK.text ? ZURUECK.menge : 0);
    const p = (pos ?? []).filter((x) => x.artikel_id === m.artikel.id);
    const menge = p.reduce((s, x) => s + Number(x.menge), 0);
    ok(menge === soll && p.every((x) => Number(x.einzelpreis) === vk(m.artikel)),
      `Rechnung: ${menge} ${m.artikel.einheit} ${m.text} à ${p[0]?.einzelpreis ?? "?"} (soll ${soll} à ${vk(m.artikel)})`);
  }
  const std = (pos ?? []).filter((x) => x.einheit === "h");
  ok(std.reduce((s, x) => s + Number(x.menge), 0) === 5.5 && std.every((x) => Number(x.einzelpreis) > 0),
    `Rechnung: Stunden ${std.map((x) => `${x.menge} h à ${x.einzelpreis}`).join(" + ")}`);
  for (const p of pos ?? []) {
    if (p.art === "titel" || p.art === "text") continue;
    const soll = r2(Number(p.menge) * Number(p.einzelpreis));
    if (Math.abs(Number(p.gesamt) - soll) > 0.001) ok(false, `Zeile ${p.bezeichnung}: ${p.gesamt} statt ${soll}`);
  }

  // ── 6. Fertigstellen ────────────────────────────────────────────────────
  const fertig = async () => {
    await chef.getByRole("button", { name: /Fertigstellen/ }).first().click();
    await chef.getByText("Rechnung fertigstellen?").waitFor({ timeout: 5000 });
    await chef.getByRole("button", { name: "Fertigstellen", exact: true }).last().click();
    await chef.getByText(/ist fertig\./).first().waitFor({ timeout: 15000 });
    await chef.waitForTimeout(1500);
  };
  await fertig();
  const summen = async () => {
    const { data: b } = await db.from("belege").select("nummer, status, netto, ust, brutto, ust_satz, archiv_stand").eq("id", belegId).single();
    const { data: p } = await db.from("beleg_positionen").select("gesamt, art").eq("beleg_id", belegId);
    const netto = r2((p ?? []).reduce((s, x) => s + Number(x.gesamt ?? 0), 0));
    return { b, netto, ust: r2(netto * Number(b.ust_satz) / 100) };
  };
  const s1 = await summen();
  ok(/^RE-\d{4}-\d{3,}$/.test(s1.b.nummer ?? "") && s1.b.status === "offen", `Rechnung ${s1.b.nummer} fertig`);
  ok(Number(s1.b.netto) === s1.netto && Number(s1.b.ust) === s1.ust && Number(s1.b.brutto) === r2(s1.netto + s1.ust),
    `Summen stimmen auf den Cent: netto ${s1.b.netto}, USt ${s1.b.ust}, brutto ${s1.b.brutto}`);
  const archiv = async (pfad) => {
    for (let i = 0; i < 30; i++) {
      const { data } = await db.storage.from("beleg-archiv").download(pfad);
      if (data) return Buffer.from(await data.arrayBuffer());
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };
  const pdf1 = await archiv(`${belegId}.pdf`);
  ok(!!pdf1, "PDF abgelegt");
  fs.writeFileSync(`${BILDER}/material-rechnung-1.pdf`, pdf1 ?? "");
  const text1 = pdf1 ? execFileSync("pdftotext", ["-layout", `${BILDER}/material-rechnung-1.pdf`, "-"], { encoding: "utf8" }) : "";
  const euroText = (x) => Number(x).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ok(text1.includes(firma.name) && !/Elektro Muster/i.test(text1), `PDF trägt den Betrieb „${firma.name}“`);
  ok(text1.includes(euroText(s1.b.brutto)) && text1.includes("12,5"), `PDF zeigt brutto ${euroText(s1.b.brutto)} und 12,5 m Flexrohr`);

  // ── 7. Rechnung ändern: Steckdosen 3 → 2, dann erneut fertig ───────────
  await chef.getByRole("button", { name: "Ändern", exact: true }).first().click();
  await chef.getByText(/Rechnung RE-.* ändern\?/).waitFor({ timeout: 5000 });
  await bild(chef, "7-aendern-frage");
  await chef.getByRole("button", { name: "Ändern", exact: true }).last().click();
  await chef.getByText(/wird geändert/).first().waitFor({ timeout: 10000 });
  const { data: offen } = await db.from("belege").select("status, nummer, archiv_stand").eq("id", belegId).single();
  ok(offen.status === "entwurf" && offen.nummer === s1.b.nummer && offen.archiv_stand === 1, `wieder Entwurf, Nummer ${offen.nummer} bleibt`);
  const { data: loesch } = await db.from("belege").delete().eq("id", belegId).select("id");
  ok(!loesch?.length, "Entwurf mit Nummer lässt sich nicht löschen (keine Lücke)");
  // PC-Tabelle: Zeile mit der Steckdose, Menge 3 → 2
  const zeile = chef.locator("tr").filter({ has: chef.locator(`input[aria-label^="Bezeichnung"][value^="${MATERIAL[0].artikel.bezeichnung}"]`) });
  await zeile.locator('input[aria-label^="Menge"]').fill("2");
  await bild(chef, "7-geaendert");
  await chef.getByRole("button", { name: "Speichern", exact: true }).first().click().catch(() => {});
  await chef.waitForTimeout(1200);
  await fertig();
  const s2 = await summen();
  ok(s2.b.nummer === s1.b.nummer && s2.b.status === "offen" && s2.b.archiv_stand === 1, `erneut fertig — Nummer ${s2.b.nummer} unverändert`);
  ok(r2(Number(s1.b.netto) - Number(s2.b.netto)) === vk(MATERIAL[0].artikel) && Number(s2.b.brutto) === r2(s2.netto + s2.ust),
    `netto ${s1.b.netto} → ${s2.b.netto} (eine Steckdose à ${vk(MATERIAL[0].artikel)} weniger), brutto ${s2.b.brutto}`);
  const pdf2 = await archiv(`${belegId}-1.pdf`);
  const alt = await archiv(`${belegId}.pdf`);
  ok(!!pdf2 && !!alt && !pdf2.equals(alt), "neue Fassung im Archiv (…-1.pdf), die erste bleibt daneben");
  fs.writeFileSync(`${BILDER}/material-rechnung-2.pdf`, pdf2 ?? "");
  const text2 = pdf2 ? execFileSync("pdftotext", ["-layout", `${BILDER}/material-rechnung-2.pdf`, "-"], { encoding: "utf8" }) : "";
  ok(text2.includes(s2.b.nummer) && text2.includes(euroText(s2.b.brutto)), `neues PDF: ${s2.b.nummer}, brutto ${euroText(s2.b.brutto)}`);
  const [download] = await Promise.all([
    chef.waitForEvent("download", { timeout: 15000 }),
    chef.getByRole("button", { name: "PDF", exact: true }).first().click(),
  ]);
  await download.saveAs(`${BILDER}/material-download.pdf`);
  ok(!!pdf2 && pdf2.equals(fs.readFileSync(`${BILDER}/material-download.pdf`)), "der PDF-Knopf liefert die neue Fassung");

  // ── 8. Nach einer Zahlung geht Ändern nicht mehr ───────────────────────
  const { data: zahlung, error: zf } = await db.from("zahlungen").insert({ beleg_id: belegId, betrag: 10, datum: new Date().toISOString().slice(0, 10) }).select("id").single();
  const { error: gesperrt } = await db.rpc("rechnung_aendern", { p_id: belegId });
  ok(!zf && /Zahlung/.test(gesperrt?.message ?? ""), `mit Zahlung: „${gesperrt?.message ?? "kein Fehler!"}“`);
  if (zahlung) await db.from("zahlungen").delete().eq("id", zahlung.id);

  // ── 9. Lager: Bus 1 um das Verbrauchte weniger ─────────────────────────
  for (const m of MATERIAL) {
    const { data: b } = await db.from("lagerbestand").select("bestand").eq("artikel_id", m.artikel.id).eq("lagerort_id", bus.id).maybeSingle();
    const weg = Number(m.menge.replace(",", ".")) - (m.text === ZURUECK.text ? ZURUECK.menge : 0);
    ok(r2(bestandVorher.get(m.artikel.id) - Number(b?.bestand ?? 0)) === weg, `Bus 1: ${m.text} ${bestandVorher.get(m.artikel.id)} → ${b?.bestand} (−${weg})`);
  }
} catch (e) {
  fehlgeschlagen++;
  console.log(`✗ FEHLER Abbruch: ${e.message.split("\n")[0]}`);
} finally {
  if (fehler.length) console.log("\nFehler im Browser:\n" + [...new Set(fehler)].join("\n"));
  await handyBrowser.close();
  if (pcBrowser !== handyBrowser) await pcBrowser.close();
}
console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt aufräumen: DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs");
process.exit(fehlgeschlagen ? 1 : 0);
