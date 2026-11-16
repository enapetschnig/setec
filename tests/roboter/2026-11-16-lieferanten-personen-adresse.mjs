// Probefahrt 16.11.2026 (Wünsche SETEC):
//  1) Lieferant: Ansprechpersonen (Außendienst/Innendienst) mit Telefon und E-Mail anlegen
//  2) Neuer Kunde: Adress-Vorschlag antippen → Straße, PLZ, Ort stehen drin (Photon wird hier
//     nachgestellt, damit der Test ohne Netz und immer gleich läuft)
//  3) Artikel → „+ Lieferant“: Lieferant aus den Lieferanten-Kontakten wählen
// Dazu: der Monteur sieht die Ansprechpersonen (Rechte).
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55210 API_URL=http://127.0.0.1:55200 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-16-lieferanten-personen-adresse.mjs
// Legt selbst an (Präfix ZZ): Chef, Monteur, Lieferant, Artikel, Kunde. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHEF = "zz-chef@test.local", MONTEUR = "zz-monteur2@test.local", PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname: "ZZ", nachname: rolle }).eq("id", data.user.id);
  return data.user.id;
}
async function aufraeumen() {
  await admin.from("artikel").delete().like("bezeichnung", "ZZ %");
  await admin.from("kunden").delete().like("name", "ZZ %");
}

await aufraeumen();
await konto(CHEF, "chef");
await konto(MONTEUR, "monteur");
const { data: lief, error: eL } = await admin.from("kunden").insert({ name: "ZZ Großhandel", art: "lieferant", ort: "Graz" }).select().single();
if (eL) throw eL;
await admin.from("kunden").insert({ name: "ZZ Kunde Nicht Lieferant", art: "kunde" });
const { data: art, error: eA } = await admin.from("artikel")
  .insert({ bezeichnung: "ZZ Wechselrichter", lieferant: "ZZ Alt GmbH", artikelnummer: "ZZ-1", einheit: "Stk", ek_preis: 100 }).select().single();
if (eA) throw eA;

// Nachgestellte Photon-Antwort (Adress-Vorschläge)
const PHOTON = {
  features: [
    { properties: { countrycode: "AT", type: "house", street: "Hauptstraße", housenumber: "10", postcode: "8650", city: "Kindberg" }, geometry: { coordinates: [15.44, 47.5] } },
    { properties: { countrycode: "AT", type: "house", street: "Hauptstraße", housenumber: "10", postcode: "8605", city: "Kapfenberg" }, geometry: { coordinates: [15.29, 47.44] } },
  ],
};

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const breite of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    let photonFragen = 0;
    await ctx.route("https://photon.komoot.io/**", (r) => { photonFragen++; return r.fulfill({ json: PHOTON }); });
    await ctx.route("https://nominatim.openstreetmap.org/**", (r) => r.fulfill({ json: [] }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(CHEF);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    console.log(`— ${breite} px`);

    // 1) Ansprechperson beim Lieferanten
    const name = breite === 1280 ? "ZZ Martin Außendienst" : "ZZ Eva Innendienst";
    const funktion = breite === 1280 ? "Außendienst" : "Innendienst";
    await page.goto(`${APP_URL}/kunden?art=lieferant&k=${lief.id}`);
    await page.getByRole("button", { name: "Person" }).click();
    await page.locator("#kp-name").fill(name);
    await page.getByRole("button", { name: funktion, exact: true }).click();
    await page.locator("#kp-tel").fill("0664 1234567");
    await page.locator("#kp-mail").fill("zz@test.local");
    await page.getByRole("button", { name: "Speichern" }).click();
    await page.getByRole("link", { name: `${name} anrufen` }).waitFor({ timeout: 10000 });
    const { data: p } = await admin.from("kontakt_personen").select("*").eq("kunde_id", lief.id).eq("name", name).maybeSingle();
    ok(p?.funktion === funktion && p?.telefon === "0664 1234567" && p?.email === "zz@test.local", `${funktion} gespeichert`);
    ok(await page.getByRole("link", { name: `${name} anrufen` }).getAttribute("href") === "tel:06641234567", "Anrufen-Knopf wählt die Nummer");
    ok(await page.getByRole("link", { name: `${name} schreiben` }).getAttribute("href") === "mailto:zz@test.local", "E-Mail-Knopf");

    // Suche in Kontakte findet den Lieferanten über die Ansprechperson
    await page.goto(`${APP_URL}/kunden?art=alle`);
    await page.getByPlaceholder(/Suchen – Name/).fill(name.split(" ")[1]);
    await page.waitForTimeout(500);
    ok(await page.getByText("ZZ Großhandel").count() > 0, "Suche nach der Ansprechperson findet den Lieferanten");

    // 2) Neuer Kunde mit Adress-Vorschlag
    const kname = `ZZ Kunde ${breite}`;
    await page.goto(`${APP_URL}/kunden?art=kunde`);
    await page.getByRole("button", { name: "Neuer Kunde" }).first().click();
    await page.locator("#k-name").fill(kname);
    await page.locator("#k-strasse").pressSequentially("Hauptstr 10 Kindb", { delay: 20 });
    await page.getByRole("option", { name: /Hauptstraße 10.*8650 Kindberg/ }).click();
    ok(await page.locator("#k-strasse").inputValue() === "Hauptstraße 10", "Straße aus dem Vorschlag");
    ok(await page.locator("#k-plz").inputValue() === "8650" && await page.locator("#k-ort").inputValue() === "Kindberg", "PLZ und Ort ausgefüllt");
    ok(photonFragen > 0 && photonFragen < 6, `Vorschläge gefragt (${photonFragen}×, nicht bei jedem Tastendruck)`);
    // Schreibt jemand weiter und geht ins nächste Feld, darf die Liste nicht nachträglich aufgehen
    await ctx.unroute("https://photon.komoot.io/**");
    await ctx.route("https://photon.komoot.io/**", async (r) => { photonFragen++; await new Promise((x) => setTimeout(x, 1200)); return r.fulfill({ json: PHOTON }); });
    await page.locator("#k-strasse").pressSequentially("x", { delay: 10 });
    await page.locator("#k-telefon").click();
    await page.waitForTimeout(2000);
    ok(await page.getByRole("listbox", { name: "Adress-Vorschläge" }).count() === 0, "Liste bleibt zu, wenn das Feld verlassen wurde");
    await page.locator("#k-strasse").fill("Hauptstraße 10");
    await page.getByRole("button", { name: "Kunde anlegen" }).click();
    await page.waitForTimeout(1500);
    const { data: k } = await admin.from("kunden").select("strasse, plz, ort").eq("name", kname).maybeSingle();
    ok(k?.strasse === "Hauptstraße 10" && k?.plz === "8650" && k?.ort === "Kindberg", "Kunde mit der Adresse gespeichert");

    // 3) Artikel: weiterer Lieferant aus den Kontakten
    if (breite === 1280) {
      await page.goto(`${APP_URL}/artikel/${art.id}`);
      await page.getByRole("button", { name: "Lieferant", exact: true }).click();
      await page.locator("#al-lief").click();
      const liste = page.getByRole("listbox", { name: "Lieferanten" });
      ok(await liste.getByRole("option", { name: /ZZ Kunde Nicht Lieferant/ }).count() === 0, "Kunden stehen nicht in der Lieferanten-Liste");
      await liste.getByRole("option", { name: /ZZ Großhandel/ }).click();
      ok(/ZZ Großhandel/.test(await page.locator("#al-lief").innerText()), "gewählt: ZZ Großhandel");
      await page.locator("#al-ek").fill("95");
      await page.getByRole("button", { name: "Speichern" }).click();
      await page.waitForTimeout(1500);
      const { data: al } = await admin.from("artikel_lieferanten").select("lieferant, ek_preis").eq("artikel_id", art.id);
      ok(al?.length === 1 && al[0].lieferant === "ZZ Großhandel" && Number(al[0].ek_preis) === 95, "weiterer Lieferant gespeichert");

      // Bearbeiten: alter Lieferant (kein Kontakt) bleibt sichtbar
      await page.getByRole("button", { name: "Bearbeiten" }).first().click();
      ok(/ZZ Alt GmbH.*nicht unter Kontakte/s.test(await page.locator("#a-lief").innerText()), "alter Lieferant am Artikel bleibt, mit Hinweis");
      await page.locator("#a-lief").click();
      await page.getByRole("listbox", { name: "Lieferanten" }).getByRole("option", { name: /ZZ Großhandel/ }).click();
      await page.getByRole("button", { name: "Speichern" }).click();
      await page.waitForTimeout(1500);
      const { data: a2 } = await admin.from("artikel").select("lieferant").eq("id", art.id).single();
      ok(a2?.lieferant === "ZZ Großhandel", "Lieferant am Artikel aus den Kontakten gesetzt");
    }
    await ctx.close();
  }

  // Monteur sieht die Ansprechpersonen
  const mont = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  await mont.auth.signInWithPassword({ email: MONTEUR, password: PW });
  const { data: mp } = await mont.from("kontakt_personen").select("name").eq("kunde_id", lief.id);
  ok(mp?.length === 2, "Monteur sieht beide Ansprechpersonen");
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: ap } = await anon.from("kontakt_personen").select("name");
  ok(!ap?.length, "ohne Anmeldung nichts zu sehen");
  ok(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await aufraeumen();
  for (const e of [CHEF, MONTEUR]) {
    const u = (await admin.auth.admin.listUsers()).data.users.find((x) => x.email === e);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
}
console.log(fehlschlaege ? `${fehlschlaege} Prüfung(en) fehlgeschlagen` : "Alles gut");
process.exit(fehlschlaege ? 1 : 0);
