// Probefahrt 19.11.2026: In der Artikelansicht blättern (Commit 447ecf7, Stefan 18.11.: „Pfeil links und rechts,
// ohne wieder in die Liste zu kommen“).
// - Liste mit Filter (Lieferant), Seite 2 → Artikel öffnen → ‹ springt über die Seitengrenze auf den letzten von Seite 1
// - Pfeiltasten → und ← wie › und ‹; am Ende ist › gesperrt, am Anfang ‹ (Pfeiltaste bleibt dann stehen)
// - Blättern ersetzt den Verlaufseintrag (history.length bleibt) — „Zurück“ führt gleich zur Liste
// - Zurück in der Liste: derselbe Filter, dieselbe Seite; mit Suche: „n von m“ in den Treffern, Suche bleibt stehen
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-19-artikel-blaettern.mjs
// Legt 55 Artikel „ZZB<Lauf> Klemme 001…055“ eines eigenen Lieferanten und einen Chef an, räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY) throw new Error("APP_URL, API_URL und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
const LAUF = Date.now().toString(36);
const TOKEN = `ZZB${LAUF}`;
const LIEFERANT = `ZZB Lieferant ${LAUF}`;
const MAIL = `zzb-chef-${LAUF}@test.local`;
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };
const nr = (i) => String(i).padStart(3, "0");

let chefId = null;
let browser;
const fehler = [];
try {
  const { data: u, error: eU } = await admin.auth.admin.createUser({ email: MAIL, password: PW, email_confirm: true });
  if (eU) throw eU;
  chefId = u.user.id;
  await admin.from("profiles").update({ aktiv: true, rolle: "chef", vorname: "Chefin", nachname: TOKEN, passwort_neu: false }).eq("id", chefId);
  const { data: artikel, error: eA } = await admin.from("artikel")
    .insert(Array.from({ length: 55 }, (_, i) => ({ bezeichnung: `${TOKEN} Klemme ${nr(i + 1)}`, lieferant: LIEFERANT, artikelnummer: `ZZB-${nr(i + 1)}`, einheit: "Stk" })))
    .select("id, bezeichnung");
  if (eA) throw eA;
  const id = (i) => artikel.find((a) => a.bezeichnung.endsWith(`Klemme ${nr(i)}`)).id;

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill(MAIL);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((x) => !x.pathname.startsWith("/auth"), { timeout: 20000 });

  const titel = () => page.locator("h1").first().innerText();
  /** Warten, bis die Artikelansicht dieses Artikels steht und ihre Nachbarn kennt */
  const steht = async (i) => {
    await page.waitForURL(new RegExp(`/artikel/${id(i)}$`), { timeout: 10000 }).catch(() => {});
    await page.locator("h1", { hasText: `Klemme ${nr(i)}` }).waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    return page.url().endsWith(`/artikel/${id(i)}`) && (await titel()).endsWith(`Klemme ${nr(i)}`);
  };
  const vor = page.getByRole("button", { name: "Voriger Artikel" });
  const nach = page.getByRole("button", { name: "Nächster Artikel" });

  // ── Liste mit Filter, Seite 2 ──
  await page.goto(`${APP_URL}/artikel`);
  await page.getByRole("combobox", { name: "Lieferant" }).click();
  await page.getByRole("option", { name: LIEFERANT }).click();
  await page.getByText("1–50 von 55").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByText("1–50 von 55").count() === 1 && await page.getByText("55 Artikel", { exact: true }).count() === 1, "Filter Lieferant: 55 Artikel auf zwei Seiten");
  await page.getByRole("button", { name: /Weiter/ }).click();
  await page.getByText("51–55 von 55").waitFor({ timeout: 10000 });
  await page.locator("tr", { hasText: `Klemme ${nr(51)}` }).click();
  ok(await steht(51), "Seite 2: Klemme 051 geöffnet");
  const verlauf = await page.evaluate(() => history.length);

  await vor.click();
  ok(await steht(50), "‹ → Klemme 050 — über die Seitengrenze zurück auf Seite 1");
  await page.keyboard.press("ArrowRight");
  ok(await steht(51), "Pfeiltaste → wieder Klemme 051");
  for (let i = 52; i <= 55; i++) {
    await page.keyboard.press("ArrowRight");
    await steht(i);
  }
  ok(await steht(55) && await nach.isDisabled() && !(await vor.isDisabled()), "bis Klemme 055 geblättert: dort ist › gesperrt, ‹ nicht");
  await page.keyboard.press("ArrowLeft");
  ok(await steht(54), "Pfeiltaste ← → Klemme 054");
  ok(await page.evaluate(() => history.length) === verlauf, "Blättern ersetzt den Verlaufseintrag (history.length bleibt)");
  await page.screenshot({ path: `${BILDER}/artikel-blaettern.png` });

  // ── Zurück: Filter und Seite bleiben ──
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await page.waitForURL(/\/artikel$/, { timeout: 10000 });
  await page.getByText("51–55 von 55").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByText("51–55 von 55").count() === 1 && (await page.getByRole("combobox", { name: "Lieferant" }).innerText()).includes(LIEFERANT),
    "zurück in der Liste: derselbe Lieferant, dieselbe Seite 2");
  await page.getByRole("button", { name: /Zurück/ }).last().click();
  await page.getByText("1–50 von 55").waitFor({ timeout: 10000 });
  await page.locator("tr", { hasText: `Klemme ${nr(1)}` }).click();
  ok(await steht(1) && await vor.isDisabled(), "Klemme 001: ‹ gesperrt");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  ok(page.url().endsWith(`/artikel/${id(1)}`), "Pfeiltaste ← am Anfang bleibt stehen");
  await nach.click();
  ok(await steht(2), "› → Klemme 002");

  // ── Mit Suche: „n von m“ ──
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await page.waitForURL(/\/artikel$/, { timeout: 10000 });
  await page.getByLabel("Artikel suchen").fill(TOKEN);
  await page.getByText("55 Treffer").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByText("55 Treffer").count() === 1, "Suche: 55 Treffer");
  await page.locator("tr", { hasText: `Klemme ${nr(3)}` }).click();
  ok(await steht(3) && await page.getByText("3 von 55", { exact: true }).count() === 1, "Treffer 3 geöffnet: „3 von 55“");
  await nach.click();
  ok(await steht(4) && await page.getByText("4 von 55", { exact: true }).count() === 1, "› → Treffer 4: „4 von 55“");
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await page.waitForURL(/\/artikel$/, { timeout: 10000 });
  await page.getByText("55 Treffer").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByLabel("Artikel suchen").inputValue() === TOKEN && await page.getByText("55 Treffer").count() === 1, "zurück in der Liste: die Suche steht noch");

  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("artikel").delete().eq("lieferant", LIEFERANT);
  if (chefId) await admin.auth.admin.deleteUser(chefId);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
