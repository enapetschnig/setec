// Probefahrt 16.11.2026 (Wunsch SETEC): Eingangsrechnung mit SEPA-Mandat beim Händler.
//  - Neue Rechnung eines Händlers, der schon per Lastschrift abbucht → Schalter und Tag vorbelegt
//  - Freigeben → nicht unter „Zu überweisen“, sondern unter „Lastschrift“ (abzüglich Skonto)
//  - „Als abgebucht markieren“ → bezahlt; normale Rechnung bleibt unter „Zu überweisen“
//  - Skonto wird bei Lastschrift abgezogen, auch wenn das Skonto-Datum vor der Abbuchung liegt
//  - Mandat an einer freigegebenen Rechnung einschalten → bleibt freigegeben, wandert zu „Lastschrift“,
//    die anderen offenen Rechnungen desselben Händlers ziehen mit
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55310 API_URL=http://127.0.0.1:55300 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-16-eingang-lastschrift.mjs
// Legt selbst an (Präfix ZZ): Chef, Eingangsrechnungen. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHEF = "zz-chef-ls@test.local", PW = "test1234!";
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
const aufraeumen = () => admin.from("eingangsrechnungen").delete().like("lieferant", "ZZ %");

await aufraeumen();
await konto(CHEF, "chef");
// Frühere Rechnung: Händler bucht am 25. ab
{
  const { error } = await admin.from("eingangsrechnungen").insert([
    { lieferant: "ZZ Lastschrift GmbH", nummer: "ZZ-ALT", datum: "2026-10-01", netto: 100, ust_satz: 20, ust: 20, brutto: 120, betrieb: true, freigabe: "offen", iban: null, lastschrift: true, lastschrift_tag: 25 },
    { lieferant: "ZZ Wechsel GmbH", nummer: "ZZ-W1", datum: "2026-11-02", netto: 100, ust_satz: 20, ust: 20, brutto: 120, betrieb: true, freigabe: "freigegeben", iban: "AT611904300234573201", lastschrift: false, lastschrift_tag: null },
    { lieferant: "ZZ Wechsel GmbH", nummer: "ZZ-W2", datum: "2026-11-03", netto: 100, ust_satz: 20, ust: 20, brutto: 120, betrieb: true, freigabe: "offen", iban: null, lastschrift: false, lastschrift_tag: null },
    { lieferant: "ZZ Überweisung GmbH", nummer: "ZZ-UE", datum: "2026-11-01", netto: 100, ust_satz: 20, ust: 20, brutto: 120, betrieb: true, freigabe: "freigegeben", iban: "AT611904300234573201", lastschrift: false, lastschrift_tag: null },
  ]);
  if (error) throw error;
}

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const breite of [1280, 390]) {
    const nr = `ZZ-${breite}`;
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

    // Neue Rechnung desselben Händlers → Lastschrift und Tag vorbelegt
    await page.goto(`${APP_URL}/eingang`);
    await page.getByRole("button", { name: breite >= 1024 ? "Rechnung erfassen" : "Neu" }).first().click();
    await page.locator("#e-lieferant").fill("ZZ Lastschrift GmbH");
    await page.locator("#e-nummer").fill(nr);
    await page.locator("#e-netto").fill("1000");
    await page.locator("#e-skonto").fill("3");
    await page.locator("#e-datum").fill("2026-11-16").catch(() => {});
    await page.locator("#e-skonto-bis").fill("2026-11-20");
    const schalter = page.locator("#e-lastschrift");
    await page.waitForTimeout(500);
    ok((await schalter.getAttribute("aria-checked")) === "true", "Lastschrift beim selben Händler vorbelegt");
    ok((await page.locator("#e-lastschrift-tag").inputValue()) === "25", "Abbuchungstag 25 vorbelegt");
    // Betrieb, damit nichts zuzuordnen ist (falls es den Knopf gibt)
    const betrieb = page.getByText("Betrieb", { exact: true }).first();
    if (await betrieb.isVisible().catch(() => false)) await betrieb.click().catch(() => {});
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.waitForTimeout(1500);
    const { data: neu } = await admin.from("eingangsrechnungen").select("*").eq("nummer", nr).single();
    ok(neu?.lastschrift === true && neu?.lastschrift_tag === 25, "gespeichert mit Lastschrift am 25.");

    // Freigeben
    await page.goto(`${APP_URL}/eingang`);
    await page.getByRole("button", { name: /ZZ Lastschrift GmbH/ }).filter({ hasText: nr }).click();
    await page.getByRole("button", { name: "Freigeben", exact: true }).click();
    await page.waitForTimeout(1500);
    const { data: frei } = await admin.from("eingangsrechnungen").select("freigabe").eq("nummer", nr).single();
    ok(frei?.freigabe === "freigegeben", "freigegeben");

    // Zu überweisen: nur die normale Rechnung
    await page.goto(`${APP_URL}/eingang?filter=freigegeben`);
    await page.waitForTimeout(800);
    ok(await page.getByText("ZZ Überweisung GmbH").first().isVisible(), "normale Rechnung unter „Zu überweisen“");
    ok(!(await page.getByText(nr).count()), "Lastschrift-Rechnung NICHT unter „Zu überweisen“");

    // Lastschrift: abzüglich 3 % Skonto (1200 → 1164)
    await page.goto(`${APP_URL}/eingang?filter=lastschrift`);
    await page.waitForTimeout(800);
    ok(await page.getByText(nr).isVisible(), "Rechnung unter „Lastschrift“");
    ok(await page.getByText("€ 1.164,00").first().isVisible(), "Betrag abzüglich Skonto (1.164,00)");
    await page.screenshot({ path: `/tmp/lastschrift-${breite}.png`, fullPage: true });
    await page.getByRole("button", { name: "Als abgebucht markieren" }).click();
    await page.waitForTimeout(1500);
    const { data: bez } = await admin.from("eingangsrechnungen").select("bezahlt_am").eq("nummer", nr).single();
    ok(!!bez?.bezahlt_am, "als abgebucht markiert (bezahlt)");
    const { data: ue } = await admin.from("eingangsrechnungen").select("bezahlt_am").eq("nummer", "ZZ-UE").single();
    ok(!ue?.bezahlt_am, "normale Rechnung bleibt offen");

    if (breite === 1280) {
      // Mandat an einer schon freigegebenen Rechnung einschalten
      await page.goto(`${APP_URL}/eingang?filter=freigegeben`);
      await page.getByRole("button", { name: /ZZ Wechsel GmbH/ }).filter({ hasText: "ZZ-W1" }).click();
      await page.locator("#e-lastschrift").click();
      await page.locator("#e-lastschrift-tag").fill("10");
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await page.waitForTimeout(1500);
      const { data: w } = await admin.from("eingangsrechnungen").select("nummer, freigabe, lastschrift, lastschrift_tag").like("nummer", "ZZ-W%").order("nummer");
      ok(w?.[0]?.lastschrift === true && w?.[0]?.lastschrift_tag === 10 && w?.[0]?.freigabe === "freigegeben", "W1: Lastschrift am 10., bleibt freigegeben");
      ok(w?.[1]?.lastschrift === true && w?.[1]?.lastschrift_tag === 10, "W2 (andere offene Rechnung des Händlers) zieht mit");
      await page.goto(`${APP_URL}/eingang?filter=freigegeben`);
      await page.waitForTimeout(800);
      ok(!(await page.getByText("ZZ-W1").count()), "W1 nicht mehr unter „Zu überweisen“");
      await page.goto(`${APP_URL}/eingang?filter=lastschrift`);
      await page.waitForTimeout(800);
      ok(await page.getByText("ZZ-W1").isVisible(), "W1 unter „Lastschrift“");
      await page.goto(`${APP_URL}/eingang`);
      await page.getByRole("button", { name: "Rechnung erfassen" }).first().click();
      await page.locator("#e-lieferant").fill("ZZ Wechsel GmbH");
      await page.waitForTimeout(500);
      ok((await page.locator("#e-lastschrift").getAttribute("aria-checked")) === "true"
        && (await page.locator("#e-lastschrift-tag").inputValue()) === "10", "neue Rechnung von ZZ Wechsel: Lastschrift am 10. vorbelegt");
    }
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
