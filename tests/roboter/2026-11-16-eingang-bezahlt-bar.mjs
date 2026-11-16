// Probefahrt 16.11.2026 (Wunsch SETEC): Reiter „Bezahlt“ mit Unterfilter Überwiesen / Lastschrift / Bar bezahlt.
//  - Baumarkt-Beleg neu erfassen, „Bezahlt“ + „Bar / eigene Karte“ → bar_bezahlt, gilt als bezahlt
//  - Alter Link ?filter=ueberwiesen führt auf „Bezahlt“; Unterfilter zeigen je nur ihre Rechnungen
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55310 API_URL=http://127.0.0.1:55300 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-16-eingang-bezahlt-bar.mjs
// Legt selbst an (Präfix ZZB): Chef, Eingangsrechnungen. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHEF = "zz-chef-bar@test.local", PW = "test1234!";
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
const aufraeumen = () => admin.from("eingangsrechnungen").delete().like("lieferant", "ZZB %");

await aufraeumen();
await konto(CHEF, "chef");
{
  // alle Felder in jeder Zeile — sonst setzt PostgREST fehlende auf NULL
  const zeile = (lieferant, nummer, lastschrift) => ({ lieferant, nummer, datum: "2026-11-02", netto: 100, ust_satz: 20, ust: 20, brutto: 120, betrieb: true,
    freigabe: "freigegeben", bezahlt_am: "2026-11-05", lastschrift, lastschrift_tag: null, iban: null });
  const { error } = await admin.from("eingangsrechnungen").insert([zeile("ZZB Überwiesen GmbH", "ZZB-UE", false), zeile("ZZB Lastschrift GmbH", "ZZB-LS", true)]);
  if (error) throw error;
}

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const breite of [1280, 390]) {
    const nr = `ZZB-BAR-${breite}`;
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(CHEF);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    console.log(`— ${breite} px`);

    // Baumarkt-Beleg: bar bezahlt
    await page.goto(`${APP_URL}/eingang`);
    await page.getByRole("button", { name: breite >= 1024 ? "Rechnung erfassen" : "Neu" }).first().click();
    await page.locator("#e-lieferant").fill("ZZB Baumarkt");
    await page.locator("#e-nummer").fill(nr);
    await page.locator("#e-brutto").fill("48,90");
    await page.locator("#e-bezahlt").click();
    await page.getByRole("button", { name: "Bar / eigene Karte" }).click();
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.waitForTimeout(1500);
    const { data: neu } = await admin.from("eingangsrechnungen").select("bezahlt_am, bar_bezahlt, freigabe").eq("nummer", nr).single();
    ok(!!neu?.bezahlt_am && neu?.bar_bezahlt === true && neu?.freigabe === "freigegeben", "Baumarkt-Beleg bar bezahlt gespeichert");

    // alter Link → Reiter „Bezahlt“
    await page.goto(`${APP_URL}/eingang?filter=ueberwiesen`);
    await page.waitForTimeout(800);
    ok(await page.getByRole("button", { name: /^Bezahlt/ }).first().isVisible(), "Reiter heißt „Bezahlt“");
    for (const [weg, sieht, nicht] of [["Bar bezahlt", nr, "ZZB-UE"], ["Überwiesen", "ZZB-UE", nr], ["Lastschrift", "ZZB-LS", "ZZB-UE"]]) {
      await page.getByRole("group", { name: "Wie bezahlt" }).getByRole("button", { name: new RegExp(`^${weg}`) }).click();
      await page.waitForTimeout(400);
      ok(await page.getByText(sieht).first().isVisible() && !(await page.getByText(nicht).count()), `Unterfilter „${weg}“ zeigt nur seine`);
    }
    await page.screenshot({ path: `/tmp/bezahlt-${breite}.png`, fullPage: true });
    await ctx.close();
  }
} finally {
  await browser?.close();
  await aufraeumen();
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === CHEF);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
}
ok(!fehler.length, `keine Seitenfehler${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
if (fehlschlaege) { console.log(`${fehlschlaege} Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log("Alles gut.");
