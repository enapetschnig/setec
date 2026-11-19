// Probefahrt 19.11.2026 (Nachtschicht-Gegenprobe zu „Rollen & Rechte“):
// - Projekt → Belege: die Karte „Eingangsrechnungen“ samt „Erfassen“ nur mit dem Recht „Eingangsrechnungen“
//   (vorher nur istChef — eine Büro-Rolle mit Rechnungen, ohne Eingang sah den Knopf)
// - Kunden-Lieferschein: „Rechnung schreiben“ nur mit dem Recht „Angebote & Rechnungen“
//   (vorher immer — führte auf „Für deine Rolle nicht freigegeben“)
// - voller Chef sieht beides wie bisher
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55810 API_URL=http://127.0.0.1:55800 ANON_KEY=… SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-19-rechte-eingang-lieferschein.mjs
// Eigene Konten/Daten mit Präfix „ZZR19“ je Lauf; Rollen und Projekt werden danach gelöscht
// (der abgeschlossene Lieferschein bleibt — nicht löschbar, eindeutiger Name je Lauf).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const ANON_KEY = process.env.ANON_KEY ?? process.env.VITE_SUPABASE_KEY;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, ANON_KEY und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
const LAUF = Date.now().toString(36);
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle, rolleId = null) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ aktiv: true, rolle, rolle_id: rolleId, vorname: "ZZR19", nachname: LAUF, passwort_neu: false }).eq("id", data.user.id);
  return data.user.id;
}
async function als(email) {
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

const konten = [];
const rollenIds = [];
let projektId = null;
let browser;
const fehler = [];
try {
  // Rollen: Büro A (Rechnungen, ohne Eingang), Büro B (Eingang, ohne Rechnungen)
  const { data: ra, error: eRa } = await admin.from("rollen").insert({ name: `ZZR19 Rechnung ohne Eingang ${LAUF}`, basis: "chef", rechte: ["rechnungen", "material"] }).select("id").single();
  if (eRa) throw eRa;
  const { data: rb, error: eRb } = await admin.from("rollen").insert({ name: `ZZR19 Eingang ohne Rechnung ${LAUF}`, basis: "chef", rechte: ["eingang", "material"] }).select("id").single();
  if (eRb) throw eRb;
  rollenIds.push(ra.id, rb.id);

  const mail = { chef: `zzr19-chef-${LAUF}@test.local`, a: `zzr19-a-${LAUF}@test.local`, b: `zzr19-b-${LAUF}@test.local` };
  konten.push(await konto(mail.chef, "chef"));
  konten.push(await konto(mail.a, "chef", ra.id));
  konten.push(await konto(mail.b, "chef", rb.id));

  const chef = await als(mail.chef);
  const a = await als(mail.a);
  ok((await a.rpc("hat_recht", { p_recht: "rechnungen" })).data === true && (await a.rpc("hat_recht", { p_recht: "eingang" })).data === false, "Rolle A: Rechnungen ja, Eingang nein");

  const { data: pr, error: ePr } = await chef.from("projekte").insert({ name: `ZZR19 Projekt ${LAUF}` }).select("id").single();
  if (ePr) throw ePr;
  projektId = pr.id;

  // Kunden-Lieferschein mit einer freien Zeile, abgeschlossen
  const { data: ls, error: eLs } = await chef.from("kunden_lieferscheine").insert({ empf_name: `ZZR19 Theke ${LAUF}` }).select("id").single();
  if (eLs) throw eLs;
  const { error: ePos } = await chef.from("kunden_lieferschein_positionen").insert({ lieferschein_id: ls.id, pos: 1, bezeichnung: "ZZR19 Klemme", einheit: "Stk", menge: 1, retour: false });
  if (ePos) throw ePos;
  const { error: eAb } = await chef.rpc("kunden_lieferschein_abschliessen", { p_id: ls.id });
  ok(!eAb, `Lieferschein abgeschlossen${eAb ? ": " + eAb.message : ""}`);

  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const breite of [1280, 390]) {
    for (const [wer, email, eingangDa, rechnungDa] of [["Chef", mail.chef, true, true], ["Rolle A", mail.a, false, true], ["Rolle B", mail.b, null, false]]) {
      const ctx = await browser.newContext({
        viewport: { width: breite, height: 900 }, locale: "de-AT", timezoneId: "Europe/Vienna",
        ...(breite === 390 ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: true } : {}),
      });
      await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
      const page = await ctx.newPage();
      page.on("pageerror", (e) => fehler.push(`${wer} ${breite}: ${e.message}`));
      await page.goto(`${APP_URL}/auth`);
      await page.locator("#benutzer").fill(email);
      await page.locator("#password").fill(PW);
      await page.getByRole("button", { name: "Anmelden" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });

      // Projekt → Belege (Rolle B hat kein Rechnungen-Recht → Ordner gibt es nicht, nichts zu prüfen)
      if (eingangDa !== null) {
        await page.goto(`${APP_URL}/projekte/${projektId}?ordner=belege`);
        await page.getByText("Noch nicht verrechnet").waitFor({ timeout: 15000 });
        await page.waitForTimeout(800);
        const karte = await page.getByText("Eingangsrechnungen", { exact: true }).count();
        const erfassen = await page.getByRole("button", { name: "Erfassen" }).count();
        ok(eingangDa ? karte > 0 && erfassen > 0 : karte === 0 && erfassen === 0,
          `${breite} px ${wer}: Projekt-Belege ${eingangDa ? "mit" : "ohne"} Eingangsrechnungen/„Erfassen“`);
      }

      // Kunden-Lieferschein
      await page.goto(`${APP_URL}/kunden-lieferscheine/${ls.id}`);
      await page.getByRole("button", { name: /Per E-Mail/ }).waitFor({ timeout: 15000 });
      const link = await page.getByRole("link", { name: /Rechnung schreiben/ }).count();
      ok(rechnungDa ? link === 1 : link === 0, `${breite} px ${wer}: Lieferschein ${rechnungDa ? "mit" : "ohne"} „Rechnung schreiben“`);
      if (rechnungDa && wer !== "Chef") {
        await page.getByRole("link", { name: /Rechnung schreiben/ }).click();
        await page.waitForURL(/belege\/neu/);
        await page.waitForTimeout(1000);
        ok(!(await page.getByText(/nicht freigegeben/).count()), `${breite} px ${wer}: Rechnung schreiben öffnet den Editor`);
      }
      await ctx.close();
    }
  }
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  if (projektId) await admin.from("projekte").delete().eq("id", projektId);
  for (const id of konten) await admin.auth.admin.deleteUser(id);
  if (rollenIds.length) await admin.from("rollen").delete().in("id", rollenIds);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) rot` : "\nalles grün");
process.exit(fehlschlaege ? 1 : 0);
