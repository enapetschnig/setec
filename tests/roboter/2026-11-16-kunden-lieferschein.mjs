// Probefahrt 16.11.2026 (Wunsch SETEC): Kunden-Lieferschein — Kunde kauft Material / holt Sonderbestellung ab.
//  - Aus dem Kontakt „Lieferschein“: Artikel aus dem Lager, freie Zeile, Retour-Zeile
//  - Abschließen → Nummer LS-…, Lager gebucht (Abgang/Zugang), Inhalt fest, löschen gesperrt
//  - Kunde unterschreibt am Gerät → Bild im Speicher, PDF lässt sich öffnen, Mail-Dialog mit Kunden-Mail
//  - „Rechnung schreiben“ → Rechnung mit VK-Preisen und Retour im Minus, am Lieferschein vermerkt
//  - Monteur sieht keine Kunden-Lieferscheine und kann keinen abschließen
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55310 API_URL=http://127.0.0.1:55300 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-16-kunden-lieferschein.mjs
// Legt selbst an (Präfix ZZK): Chef, Monteur, Kunde, Artikel, Lager, Buchungen. Räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHEF = "zzk-chef@test.local", MONTEUR = "zzk-monteur@test.local", PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname: "ZZK", nachname: rolle }).eq("id", data.user.id);
  return data.user.id;
}
// Abgeschlossene Lieferscheine lassen sich absichtlich nicht löschen — deshalb eindeutige Namen je
// Lauf statt Aufräumen; die Testumgebung ist ohnehin wegwerfbar (testumgebung.mjs stop).
const LAUF = Date.now().toString(36);
let lagerId = null, artikelId = null, kundeId = null;

await konto(CHEF, "chef");
await konto(MONTEUR, "monteur");
{
  const { data: lo, error: e1 } = await admin.from("lagerorte").insert({ name: `ZZK Hauptlager ${LAUF}`, art: "lager", reihenfolge: -1 }).select().single();
  if (e1) throw e1;
  lagerId = lo.id;
  const { data: a, error: e2 } = await admin.from("artikel").insert({ bezeichnung: `ZZK Kabel NYM-J 3x1,5 ${LAUF}`, artikelnummer: `ZZK-${LAUF}`, einheit: "m", vk_preis: 2.5, ek_preis: 1 }).select().single();
  if (e2) throw e2;
  artikelId = a.id;
  const { error: e3 } = await admin.from("material_buchungen").insert({ art: "zugang", artikel_id: artikelId, menge: 100, lagerort_id: lagerId });
  if (e3) throw e3;
  const { data: k, error: e4 } = await admin.from("kunden").insert({ name: `ZZK Kunde Theke ${LAUF}`, art: "kunde", ort: "Kindberg", email: "zzk-kunde@example.com" }).select().single();
  if (e4) throw e4;
  kundeId = k.id;
}
const bestand = async () => {
  const { data } = await admin.from("lagerbestand").select("bestand").eq("artikel_id", artikelId).eq("lagerort_id", lagerId).maybeSingle();
  return Number(data?.bestand ?? 0);
};

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  let erwartet = 100;
  for (const breite of [1280, 390]) {
    const ctx = await browser.newContext({
      viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna", acceptDownloads: true,
      ...(breite === 390 ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: true } : {}),
    });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(CHEF);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    console.log(`— ${breite} px`);

    // Aus dem Kontakt
    await page.goto(`${APP_URL}/kunden?k=${kundeId}`);
    await page.getByRole("link", { name: "Lieferschein", exact: true }).first().click();
    await page.waitForURL(/kunden-lieferscheine\/neu/);
    ok((await page.locator("#kls-name").inputValue()) === `ZZK Kunde Theke ${LAUF}`, "Kunde aus dem Kontakt vorbelegt");
    await page.locator("#kls-lager").click();
    await page.getByRole("option", { name: `ZZK Hauptlager ${LAUF}` }).click();

    // Artikel: 12,5 m
    await page.getByRole("button", { name: "Artikel", exact: true }).click();
    await page.getByPlaceholder(/Artikel suchen/).fill(`ZZK Kabel NYM-J 3x1,5 ${LAUF}`);
    await page.getByRole("button", { name: /ZZK Kabel NYM/ }).first().click();
    await page.getByRole("button", { name: "Fertig" }).click();
    await page.getByLabel("Menge").first().fill("12,5");
    ok(await page.getByText(/im Lager \d/).first().isVisible(), "Lagerbestand wird angezeigt");
    // freie Zeile
    await page.getByRole("button", { name: "Freie Zeile" }).click();
    await page.getByLabel("Bezeichnung").last().fill("ZZK Sonderbestellung Steckdose");
    await page.getByLabel("Menge").nth(1).fill("2");
    // Retour 1 m
    await page.getByRole("button", { name: "Retour-Artikel" }).click();
    await page.getByPlaceholder(/Artikel suchen/).fill(`ZZK Kabel NYM-J 3x1,5 ${LAUF}`);
    await page.getByRole("button", { name: /ZZK Kabel NYM/ }).first().click();
    await page.getByRole("button", { name: "Fertig" }).click();

    await page.getByRole("button", { name: "Abschließen", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abschließen" }).click();
    await page.waitForTimeout(2500);
    const { data: ls } = await admin.from("kunden_lieferscheine").select("*, kunden_lieferschein_positionen(*)").eq("kunde_id", kundeId).order("created_at", { ascending: false }).limit(1).single();
    ok(ls?.status === "fertig" && /^LS-\d{4}-\d{3}$/.test(ls?.nummer ?? ""), `abgeschlossen mit Nummer ${ls?.nummer}`);
    ok(ls?.kunden_lieferschein_positionen.length === 3, "3 Zeilen gespeichert");
    erwartet = erwartet - 12.5 + 1;
    ok(Math.abs((await bestand()) - erwartet) < 0.001, `Lager gebucht: Bestand ${await bestand()} (erwartet ${erwartet})`);
    const { data: buch } = await admin.from("material_buchungen").select("art, menge").eq("vorgang", ls.id);
    ok(buch?.length === 2, "nur Artikel-Zeilen buchen (freie Zeile nicht)");

    // Fest: ändern und löschen gesperrt (als Chef über die Oberfläche-Rechte)
    const chef = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    await chef.auth.signInWithPassword({ email: CHEF, password: PW });
    const { error: eDel } = await chef.from("kunden_lieferscheine").delete().eq("id", ls.id);
    ok(!!eDel, "abgeschlossener Lieferschein lässt sich nicht löschen");
    const { error: ePos } = await chef.from("kunden_lieferschein_positionen").update({ menge: 99 }).eq("lieferschein_id", ls.id);
    ok(!!ePos, "Zeilen nach dem Abschließen fest");

    // Unterschrift
    await page.getByRole("button", { name: "Kunde unterschreibt" }).click();
    await page.getByRole("button", { name: /Weiter zur Unterschrift/ }).click();
    const feld = await page.getByLabel("Unterschriftsfeld").boundingBox();
    await page.mouse.move(feld.x + feld.width * 0.15, feld.y + feld.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i < 20; i++) await page.mouse.move(feld.x + feld.width * (0.15 + i * 0.03), feld.y + feld.height * (0.6 - 0.25 * Math.sin(i / 2)));
    await page.mouse.up();
    await page.getByRole("button", { name: /Unterschrift bestätigen/ }).click();
    await page.waitForTimeout(2000);
    const { data: u } = await admin.from("kunden_lieferscheine").select("unterschrift_pfad, unterschrift_name").eq("id", ls.id).single();
    ok(!!u?.unterschrift_pfad && u?.unterschrift_name === `ZZK Kunde Theke ${LAUF}`, "unterschrieben, Bild abgelegt");
    ok(await page.getByText("Unterschrieben", { exact: true }).first().isVisible(), "Status „Unterschrieben“");

    // PDF: am PC öffnet ein Fenster zum Drucken, am Handy (390 px, iPhone-Kennung) kommt die Datei
    if (breite === 1280) {
      const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 15000 }), page.getByRole("button", { name: /PDF/ }).click()]);
      await page.waitForTimeout(3000);
      ok(!!popup && !(await page.locator("[data-sonner-toast]").filter({ hasText: "PDF ging nicht" }).count()), "PDF-Fenster zum Drucken geöffnet, ohne Fehler");
      await popup.close().catch(() => {});
    } else {
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: /PDF/ }).click()]);
      const pfad = `/tmp/kls-${LAUF}.pdf`;
      await download.saveAs(pfad);
      const { execFileSync } = await import("node:child_process");
      const text = execFileSync("pdftotext", ["-layout", pfad, "-"], { encoding: "utf8" });
      ok(text.includes(`Lieferschein ${ls.nummer}`) && /Retour/.test(text) && text.includes(`ZZK Kunde Theke ${LAUF}`) && /unterschrieben am/.test(text),
        "PDF: Nummer, Geliefert/Retour, Kunde, Unterschrift");
      ok(!/€/.test(text.split("Ware übernommen")[0].split("Geliefert")[1] ?? ""), "PDF ohne Preise");
    }

    // Mail-Dialog: Kunden-Mail vorbelegt (gesendet wird hier nicht)
    await page.getByRole("button", { name: "Per E-Mail" }).click();
    ok((await page.locator("#mail-an").inputValue()) === "zzk-kunde@example.com", "Mail an den Kunden vorbelegt");
    ok((await page.locator("#mail-betreff").inputValue()).startsWith(`Lieferschein ${ls.nummer}`), "Betreff „Lieferschein LS-…“");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Rechnung daraus
    await page.getByRole("link", { name: "Rechnung schreiben" }).click();
    await page.waitForURL(/belege\/neu/);
    await page.waitForTimeout(1500);
    ok(await page.getByText(/Retour: ZZK Kabel/).first().isVisible().catch(() => false)
      || (await page.locator("input[value^='Retour: ZZK Kabel']").count()) > 0, "Retour-Zeile in der Rechnung");
    await page.getByRole("button", { name: /^Speichern/ }).first().click();
    await page.waitForTimeout(2500);
    const { data: ls2 } = await admin.from("kunden_lieferscheine").select("rechnung_id").eq("id", ls.id).single();
    const { data: pos } = ls2?.rechnung_id ? await admin.from("beleg_positionen").select("bezeichnung, menge, einzelpreis").eq("beleg_id", ls2.rechnung_id) : { data: [] };
    ok(!!ls2?.rechnung_id, "Rechnung am Lieferschein vermerkt");
    const kabel = pos?.find((p) => p.bezeichnung.startsWith("ZZK Kabel"));
    const zurueck = pos?.find((p) => p.bezeichnung.startsWith("Retour: ZZK Kabel"));
    ok(kabel && Number(kabel.menge) === 12.5 && Number(kabel.einzelpreis) === 2.5, "Kabel 12,5 m zu € 2,50 (VK)");
    ok(zurueck && Number(zurueck.menge) === -1, "Retour mit −1");
    ok(Math.abs((await bestand()) - erwartet) < 0.001, "Rechnung ändert den Lagerstand nicht");
    await page.screenshot({ path: `/tmp/kls-rechnung-${breite}.png`, fullPage: false });

    // Retour dazu: neuer Entwurf mit den Ausgabe-Zeilen als Retour
    await page.goto(`${APP_URL}/kunden-lieferscheine/${ls.id}`);
    await page.screenshot({ path: `/tmp/kls-ansicht-${breite}.png`, fullPage: true });
    await page.getByRole("link", { name: "Retour dazu" }).click();
    await page.waitForURL(/retour=/);
    ok(await page.getByText(/Retour · 2/).first().isVisible(), "Retour-Lieferschein mit den ausgegebenen Zeilen vorbereitet");
    await page.screenshot({ path: `/tmp/kls-retour-${breite}.png`, fullPage: true });
    await ctx.close();
  }

  // Kontakt löschen geht trotz abgeschlossener Lieferscheine — der Name bleibt am Lieferschein
  {
    const { data: vorher } = await admin.from("kunden_lieferscheine").select("id").eq("kunde_id", kundeId);
    const { error: eK } = await admin.from("kunden").delete().eq("id", kundeId);
    ok(!eK, `Kontakt mit Lieferscheinen löschbar${eK ? `: ${eK.message}` : ""}`);
    const { data: nachher } = await admin.from("kunden_lieferscheine").select("kunde_id, empf_name").in("id", (vorher ?? []).map((x) => x.id));
    ok((nachher ?? []).length > 0 && nachher.every((x) => x.kunde_id === null && x.empf_name.startsWith("ZZK Kunde Theke")), "Lieferscheine bleiben mit Namen");
  }

  // Monteur: sieht nichts, kann nichts abschließen
  const m = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  await m.auth.signInWithPassword({ email: MONTEUR, password: PW });
  const { data: sicht } = await m.from("kunden_lieferscheine").select("id");
  ok((sicht ?? []).length === 0, "Monteur sieht keine Kunden-Lieferscheine");
  const { data: einer } = await admin.from("kunden_lieferscheine").select("id").like("empf_name", `ZZK Kunde Theke ${LAUF}%`).limit(1).single();
  const { error: eM } = await m.rpc("kunden_lieferschein_abschliessen", { p_id: einer.id });
  ok(!!eM, "Monteur kann nicht abschließen");
} finally {
  await browser?.close();
}
ok(!fehler.length, `keine Seitenfehler${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
if (fehlschlaege) { console.log(`${fehlschlaege} Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log("Alles gut.");
