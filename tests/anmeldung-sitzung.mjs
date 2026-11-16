// Nach Anmelden, „Passwort vergessen“ und Registrieren lädt die App wirklich —
// nie „Zugang nicht aktiv“ (16.11.2026: nach dem neuen Passwort blieb Christoph
// dort hängen, weil neuLaden() die beim Rendern festgehaltene Sitzung „keine“ nahm).
// Legt ZZTEST-Konten an und löscht sie wieder. Braucht eine laufende Vorschau.
//   APP=http://127.0.0.1:8093 SERVICE=<service_role> ANON=<anon> BILDER=/tmp/… node tests/anmeldung-sitzung.mjs
import { chromium, devices } from "playwright";
const APP = process.env.APP ?? "http://127.0.0.1:8094";
const U = "https://xcsbbaiwzdivmaodltxm.supabase.co";
const { SERVICE, ANON, BILDER } = process.env;
let ok = 0, fehler = 0;
const pruef = (w, t) => { w ? ok++ : fehler++; console.log(`${w ? "✓" : "✗"} ${t}`); };
const admin = (pfad, init = {}) => fetch(`${U}${pfad}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" } }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const email = `zztest-sitzung-${Date.now()}@setec-test.at`;
const reg = await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Zztest-111", data: { vorname: "ZZTEST", nachname: "Sitzung" } }) }).then((r) => r.json());
const id = reg.user?.id ?? reg.id;
const link = async () => { const l = await admin("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "recovery", email, redirect_to: "https://setec.handwerkapp.at/passwort-neu" }) }); return l.hashed_token ?? l.properties.hashed_token; };

/** beobachtet die Seite bis die App da ist; meldet, ob „Zugang nicht aktiv“ je erschien */
async function bisApp(p, name) {
  let sahSperre = false;
  for (let i = 0; i < 40; i++) {
    if (await p.getByText("Zugang nicht aktiv").count()) sahSperre = true;
    if (await p.getByRole("heading", { name: /ZZTEST/ }).first().isVisible().catch(() => false)) break;
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(1500);
  if (await p.getByText("Zugang nicht aktiv").count()) sahSperre = true;
  const da = await p.getByRole("heading", { name: /ZZTEST/ }).first().isVisible().catch(() => false);
  await p.screenshot({ path: `${BILDER}/${name}.png` });
  pruef(da && !sahSperre, `${name}: App geladen=${da}, „Zugang nicht aktiv“ gesehen=${sahSperre}`);
}

const browser0 = await chromium.launch();
const browser = { newContext: async (o) => { const c = await browser0.newContext(o); await c.addInitScript(() => localStorage.setItem("setec.installhinweis", "x")); return c; }, close: () => browser0.close() };
try {
  // 1. Anmelden über das Formular (PC)
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await a.goto(`${APP}/auth`);
  await a.fill("#benutzer", email); await a.fill("#password", "Zztest-111");
  await a.click("form button[type=submit]");
  await bisApp(a, "1-anmelden-pc");

  // 2. Passwort vergessen am PC (genau Christophs Fall)
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await b.goto(`${APP}/passwort-neu?token_hash=${await link()}&type=recovery`);
  await b.fill("#neu-passwort", "Zztest-222");
  await b.click('[data-pruef="passwort-neu"] button[type=submit]');
  await b.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20000 });
  await bisApp(b, "2-neues-passwort-pc");

  // 3. Vorläufiges Passwort vom Chef + Passwort vergessen
  await admin(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ passwort_neu: true }) });
  const c = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await c.goto(`${APP}/passwort-neu?token_hash=${await link()}&type=recovery`);
  await c.fill("#neu-passwort", "Zztest-333");
  await c.click('[data-pruef="passwort-neu"] button[type=submit]');
  await c.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20000 });
  await bisApp(c, "3-nach-vorlaeufig-pc");
  pruef(await c.getByRole("dialog").count() === 0, "kein zweiter Pflichtdialog fürs Passwort");

  // 4. Handy: neues Passwort → „Hier im Browser weiter“ → App
  const d = await (await browser.newContext({ ...devices["iPhone 15"] })).newPage();
  await d.goto(`${APP}/passwort-neu?token_hash=${await link()}&type=recovery`);
  await d.fill("#neu-passwort", "Zztest-444");
  await d.click('[data-pruef="passwort-neu"] button[type=submit]');
  await d.locator('[data-pruef="passwort-gespeichert"]').waitFor({ timeout: 15000 });
  await d.getByRole("button", { name: "Hier im Browser weiter" }).click();
  await bisApp(d, "4-handy-weiter");

  // 5. Registrieren über /start am Handy → App
  const e = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
  const email2 = `zztest-sitzung2-${Date.now()}@setec-test.at`;
  await e.goto(`${APP}/auth?modus=registrieren`);
  await e.fill("#ein-vorname", "ZZTEST"); await e.fill("#ein-nachname", "Sitzung");
  await e.fill("#ein-email", email2); await e.fill("#ein-passwort", "Zztest-555");
  await e.click('[data-pruef="los"]');
  await bisApp(e, "5-registrieren-handy");
} finally {
  await browser.close();
  const rest = await admin("/rest/v1/profiles?email=like.zztest-sitzung*&select=id");
  for (const r of rest) await admin(`/auth/v1/admin/users/${r.id}`, { method: "DELETE" });
  const nach = await admin("/rest/v1/profiles?email=like.zztest-sitzung*&select=id");
  console.log(`aufgeräumt: ${nach.length === 0 ? "ja" : "NEIN"}`);
  console.log(`\n${ok} ok, ${fehler} Fehler`);
}
