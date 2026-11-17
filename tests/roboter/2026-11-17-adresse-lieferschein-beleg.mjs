// Probefahrt 17.11.2026 (Nachtschicht-Gegenprobe zu „Adress-Vervollständigung“):
//  1) Kunden-Lieferschein neu: Laufkunde, Straße tippen → Vorschlag antippen → Straße, PLZ, Ort stehen drin
//  2) Rechnung neu → „Anschrift ohne Kundenstamm eingeben“: dasselbe im Anschrift-Dialog
// Photon wird nachgestellt (ohne Netz, immer gleich).
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55610 API_URL=http://127.0.0.1:55600 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-17-adresse-lieferschein-beleg.mjs
// Legt nur ein Chef-Konto an, speichert nichts.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHEF = "zz-chef-adresse@test.local", PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === CHEF);
if (alt) await admin.auth.admin.deleteUser(alt.id);
const { data: neu, error } = await admin.auth.admin.createUser({ email: CHEF, password: PW, email_confirm: true });
if (error) throw error;
await admin.from("profiles").update({ aktiv: true, rolle: "chef", vorname: "ZZ", nachname: "Chef" }).eq("id", neu.user.id);

const PHOTON = {
  features: [
    { properties: { countrycode: "AT", type: "house", street: "Hauptstraße", housenumber: "10", postcode: "8650", city: "Kindberg" }, geometry: { coordinates: [15.44, 47.5] } },
  ],
};

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const breite of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    await ctx.route("https://photon.komoot.io/**", (r) => r.fulfill({ json: PHOTON }));
    await ctx.route("https://nominatim.openstreetmap.org/**", (r) => r.fulfill({ json: [] }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(CHEF);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    console.log(`— ${breite} px`);

    // 1) Kunden-Lieferschein
    await page.goto(`${APP_URL}/kunden-lieferscheine/neu`);
    await page.locator("#kls-name").fill("ZZ Laufkunde");
    await page.getByLabel("Straße").pressSequentially("Hauptstr 10 Kindb", { delay: 20 });
    await page.getByRole("option", { name: /Hauptstraße 10/ }).click();
    ok((await page.getByLabel("Straße").inputValue()) === "Hauptstraße 10", "Lieferschein: Straße übernommen");
    ok((await page.getByLabel("PLZ").inputValue()) === "8650", "Lieferschein: PLZ übernommen");
    ok((await page.getByLabel("Ort").inputValue()) === "Kindberg", "Lieferschein: Ort übernommen");

    // 2) Rechnung: Anschrift ohne Kundenstamm
    await page.goto(`${APP_URL}/belege/neu?typ=rechnung`);
    const ohneStamm = page.getByRole("button", { name: "Anschrift ohne Kundenstamm eingeben" });
    await page.getByText(/Kopfdaten|Noch kein Empfänger|Anschrift ohne Kundenstamm/).first().waitFor();
    if (!(await ohneStamm.isVisible())) await page.getByText("Noch kein Empfänger").first().click();
    await ohneStamm.click();
    await page.locator("#a-empf_name").fill("ZZ Laufkunde");
    await page.locator("#a-empf_strasse").pressSequentially("Hauptstr 10 Kindb", { delay: 20 });
    await page.getByRole("option", { name: /Hauptstraße 10/ }).click();
    ok((await page.locator("#a-empf_strasse").inputValue()) === "Hauptstraße 10", "Beleg: Straße übernommen");
    ok((await page.locator("#a-empf_plz").inputValue()) === "8650", "Beleg: PLZ übernommen");
    ok((await page.locator("#a-empf_ort").inputValue()) === "Kindberg", "Beleg: Ort übernommen");
    await page.getByRole("button", { name: "Fertig" }).click();
    ok(await page.getByText("8650 Kindberg").first().isVisible(), "Beleg: Anschrift im Kopf sichtbar");
    await ctx.close();
  }
} finally {
  await browser?.close();
  await admin.auth.admin.deleteUser(neu.user.id);
}
ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
if (fehlschlaege) { console.log(`${fehlschlaege} Fehlschläge`); process.exit(1); }
console.log("Alles gut.");
