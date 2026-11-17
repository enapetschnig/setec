// Stufe 2 (17.11.2026): Regiebericht ohne Projekt (Service beim Kunden) — von der Baustelle bis zur Rechnung.
//  - Monteur am Handy (390 px): /regie/neu?kunde=… → Einsatzort aus der Kundenadresse, Stunden,
//    Material aus dem Katalog (Bus) und freie Position, Kunde unterschreibt am Gerät
//  - Datenbank: unterschrieben, Bild unter regie/<id>/unterschriften/, Stunden und Material ohne Projekt,
//    Bus-Bestand gesunken, Bericht danach fest (auch die Fotos)
//  - PDF: Kunde, Einsatzort, Material, Unterschrift
//  - Chef am PC (1280 px): /rechnungen → Block „Noch nicht verrechnet“ → „Rechnung daraus“ → Speichern
//    → rechnung_id am Bericht, an Stunden und Material; Block danach leer (ausgeblendet)
//  - „Reinreden“ (KI) ist hier nicht prüfbar: die Testumgebung hat keine Edge Functions.
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55410 API_URL=http://127.0.0.1:55400 SERVICE_ROLE_KEY=… ANON_KEY=… \
//   node tests/roboter/2026-11-17-regie-ohne-projekt.mjs
// Legt selbst an (Präfix ZZR): Chef, Monteur, Kunde, Bus, Artikel. Die Testumgebung ist wegwerfbar.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const { APP_URL, API_URL, SERVICE_ROLE_KEY, ANON_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, SERVICE_ROLE_KEY und ANON_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Konten mit Stunden lassen sich nicht löschen — deshalb eigene Adressen je Lauf
const LAUF = Date.now().toString(36);
const CHEF = `zzr-chef-${LAUF}@test.local`, MONTEUR = `zzr-monteur-${LAUF}@test.local`, PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  if (alt) await admin.auth.admin.deleteUser(alt.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, vorname: "ZZR", nachname: rolle === "chef" ? "Chef" : "Monteur" }).eq("id", data.user.id);
  return data.user.id;
}
const KUNDE = `ZZR Service Kunde ${LAUF}`, ARTIKEL = `ZZR Schuko-Steckdose ${LAUF}`;

await konto(CHEF, "chef");
const monteurId = await konto(MONTEUR, "monteur");
const { data: bus, error: e1 } = await admin.from("lagerorte").insert({ name: `ZZR Bus ${LAUF}`, art: "fahrzeug", user_id: monteurId }).select().single();
if (e1) throw e1;
const { data: artikel, error: e2 } = await admin.from("artikel").insert({ bezeichnung: ARTIKEL, artikelnummer: `ZZR-${LAUF}`, einheit: "Stk", vk_preis: 8.9, ek_preis: 3 }).select().single();
if (e2) throw e2;
const { error: e3 } = await admin.from("material_buchungen").insert({ art: "zugang", artikel_id: artikel.id, menge: 10, lagerort_id: bus.id });
if (e3) throw e3;
const { data: kunde, error: e4 } = await admin.from("kunden").insert({ name: KUNDE, art: "kunde", strasse: "Hauptstraße 7", plz: "8650", ort: "Kindberg" }).select().single();
if (e4) throw e4;
const bestand = async () => {
  const { data } = await admin.from("lagerbestand").select("bestand").eq("artikel_id", artikel.id).eq("lagerort_id", bus.id).maybeSingle();
  return Number(data?.bestand ?? 0);
};

async function anmelden(browser, email, breite) {
  const ctx = await browser.newContext({
    viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna", acceptDownloads: true,
    ...(breite === 390 ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: true } : {}),
  });
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill(email);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  return { ctx, page };
}

const fehler = [];
let browser, berichtId = null;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

  // ── Monteur am Handy ──────────────────────────────────────────────
  {
    const { ctx, page } = await anmelden(browser, MONTEUR, 390);
    console.log("— Monteur 390 px");
    await page.goto(`${APP_URL}/regie/neu?kunde=${kunde.id}`);
    await page.getByLabel("Durchgeführte Arbeiten").waitFor({ timeout: 15000 });
    ok((await page.locator("#rb-strasse").inputValue()) === "Hauptstraße 7"
      && (await page.getByLabel("Ort", { exact: true }).inputValue()) === "Kindberg", "Einsatzort aus der Kundenadresse vorbelegt");
    ok(await page.getByText(KUNDE).first().isVisible(), "Kunde gewählt");
    await page.getByLabel("Durchgeführte Arbeiten").fill("ZZR Service: Steckdose in der Küche getauscht, FI geprüft.");
    await page.getByRole("button", { name: "2 h", exact: true }).first().click();

    // Material aus dem Katalog (Quelle: eigener Bus)
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder(/Artikel suchen/).fill(ARTIKEL);
    await page.getByRole("button", { name: new RegExp(ARTIKEL) }).first().click();
    await page.getByLabel(`Menge ${ARTIKEL}`).fill("2");
    // freie Position
    await page.getByRole("button", { name: "Frei", exact: true }).click();
    await page.locator("#fp-bez").fill("ZZR Abzweigdose Sonderteil");
    await page.locator("#fp-menge").fill("1");
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await page.screenshot({ path: `/tmp/zzr-regie-ausgefuellt.png`, fullPage: true });

    // Unterschrift
    await page.getByRole("button", { name: /Unterschreiben lassen/ }).click();
    await page.locator("#ku-name").fill("ZZR Kundin");
    await page.getByRole("button", { name: /Weiter zur Unterschrift/ }).click();
    const feld = await page.getByLabel("Unterschriftsfeld").boundingBox();
    await page.mouse.move(feld.x + feld.width * 0.15, feld.y + feld.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i < 20; i++) await page.mouse.move(feld.x + feld.width * (0.15 + i * 0.03), feld.y + feld.height * (0.6 - 0.25 * Math.sin(i / 2)));
    await page.mouse.up();
    await page.getByRole("button", { name: /Unterschrift bestätigen/ }).click();
    await page.getByText("Unterschrieben", { exact: true }).first().waitFor({ timeout: 20000 });

    const { data: rb } = await admin.from("regieberichte").select("*").eq("kunde_id", kunde.id).single();
    berichtId = rb?.id;
    ok(rb?.status === "unterschrieben" && rb.projekt_id === null && rb.strasse === "Hauptstraße 7", `unterschrieben ohne Projekt (${rb?.nummer})`);
    ok((rb?.unterschrift_pfad ?? "").startsWith(`regie/${rb?.id}/unterschriften/`), `Unterschrift abgelegt unter ${rb?.unterschrift_pfad}`);
    const { data: z } = await admin.from("zeiten").select("stunden, projekt_id").eq("regiebericht_id", rb.id);
    ok(z?.length === 1 && Number(z[0].stunden) === 2 && z[0].projekt_id === null, "2 h gebucht, ohne Projekt");
    const { data: mb } = await admin.from("material_buchungen").select("art, menge, projekt_id, lagerort_id, bezeichnung").eq("regiebericht_id", rb.id);
    ok(mb?.length === 2 && mb.every((m) => m.projekt_id === null), "2 Materialzeilen, ohne Projekt");
    ok(mb?.some((m) => m.lagerort_id === bus.id && Number(m.menge) === 2), "Steckdose aus dem Bus");
    ok(Math.abs((await bestand()) - 8) < 0.001, `Bus-Bestand gesunken: ${await bestand()} (erwartet 8)`);

    // Danach fest: auch als Monteur nichts mehr ändern, keine Fotos dazu
    const m = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    await m.auth.signInWithPassword({ email: MONTEUR, password: PW });
    const { data: geaendert } = await m.from("regieberichte").update({ arbeiten: "nachträglich" }).eq("id", rb.id).select();
    const { data: nachher } = await admin.from("regieberichte").select("arbeiten").eq("id", rb.id).single();
    ok(!geaendert?.length && nachher.arbeiten.startsWith("ZZR Service"), "unterschriebener Bericht fest");
    const { error: eFoto } = await m.from("dateien").insert({ regiebericht_id: rb.id, name: "x.jpg", pfad: `regie/${rb.id}/x.jpg`, art: "foto", user_id: monteurId });
    ok(!!eFoto, "nach der Unterschrift kein Foto mehr dazu");

    // PDF (am Handy kommt die Datei)
    await page.goto(`${APP_URL}/regie/${rb.id}`);
    await page.getByText(KUNDE).first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: `/tmp/zzr-regie-ansicht.png`, fullPage: true });
    try {
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: /PDF teilen/ }).first().click()]);
      const pfad = `/tmp/zzr-regie-${LAUF}.pdf`;
      await download.saveAs(pfad);
      const text = execFileSync("pdftotext", ["-layout", pfad, "-"], { encoding: "utf8" });
      ok(text.includes(KUNDE) && /Einsatzort/.test(text) && /Hauptstraße 7/.test(text), "PDF: Kunde und Einsatzort");
      ok(text.includes(ARTIKEL) && text.includes("ZZR Abzweigdose"), "PDF: beide Materialzeilen");
      ok(/ZZR Kundin/.test(text) && !/Projekt\s+20\d\d-/.test(text), "PDF: Unterzeichner, kein Projekt");
    } catch (e) {
      ok(false, `PDF heruntergeladen: ${e.message}`);
    }
    await ctx.close();
  }

  // ── Chef am PC: Rechnungen → Noch nicht verrechnet ────────────────
  {
    const { ctx, page } = await anmelden(browser, CHEF, 1280);
    console.log("— Chef 1280 px");
    await page.goto(`${APP_URL}/rechnungen`);
    const block = page.getByRole("region", { name: "Noch nicht verrechnet" });
    await block.waitFor({ timeout: 15000 });
    ok(await block.getByText(KUNDE).first().isVisible(), "Bericht steht unter „Noch nicht verrechnet“");
    await page.screenshot({ path: `/tmp/zzr-rechnungen.png`, fullPage: false });
    await block.getByRole("button", { name: /Rechnung daraus/ }).first().click();
    await page.waitForURL(/belege\/neu/);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/zzr-rechnung-neu.png`, fullPage: true });
    await page.getByRole("button", { name: /^Speichern/ }).first().click();
    await page.waitForURL((u) => !/belege\/neu/.test(u.pathname), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const { data: rb } = await admin.from("regieberichte").select("rechnung_id").eq("id", berichtId).single();
    ok(!!rb?.rechnung_id, "Rechnung am Bericht vermerkt");
    const { data: beleg } = rb?.rechnung_id ? await admin.from("belege").select("kunde_id, projekt_id").eq("id", rb.rechnung_id).single() : { data: null };
    ok(beleg?.kunde_id === kunde.id && beleg?.projekt_id === null, "Rechnung an den Kunden, ohne Projekt");
    const { data: pos } = rb?.rechnung_id ? await admin.from("beleg_positionen").select("bezeichnung, menge, einzelpreis, einheit").eq("beleg_id", rb.rechnung_id) : { data: [] };
    const st = pos?.find((p) => p.bezeichnung.startsWith(ARTIKEL));
    ok(st && Number(st.menge) === 2 && Number(st.einzelpreis) === 8.9, "Steckdose 2 Stk zu € 8,90");
    ok(pos?.some((p) => p.bezeichnung.startsWith("ZZR Abzweigdose")), "freie Position in der Rechnung");
    ok(pos?.some((p) => Number(p.menge) === 2 && /h|Stunde|Arbeit/i.test(p.bezeichnung + (p.einheit ?? ""))), "2 Arbeitsstunden in der Rechnung");
    const { data: z } = await admin.from("zeiten").select("rechnung_id").eq("regiebericht_id", berichtId);
    const { data: mb } = await admin.from("material_buchungen").select("rechnung_id").eq("regiebericht_id", berichtId);
    ok([...(z ?? []), ...(mb ?? [])].every((x) => x.rechnung_id === rb?.rechnung_id), "Stunden und Material als verrechnet gebunden");

    await page.goto(`${APP_URL}/rechnungen`);
    await page.waitForTimeout(2500);
    ok(!(await page.getByRole("region", { name: "Noch nicht verrechnet" }).count()), "Block ausgeblendet, wenn nichts mehr offen ist");
    await ctx.close();
  }
} finally {
  await browser?.close();
}
ok(!fehler.length, `keine Seitenfehler${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
if (fehlschlaege) { console.log(`${fehlschlaege} Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log("Alles gut.");
