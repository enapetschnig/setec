// Probefahrt 18.11.2026 (Stefan): „Bitte noch weitere Rollen neben Chef und Monteur — Büro, Lehrling;
// Rechte selbst vergeben: Melanie soll die Buchhaltung sehen dürfen, Klaus nicht.“
// Prüft (Datenbank direkt über die API UND die Oberfläche):
// - bestehende Konten ohne Rolle (Chef, Monteur) verhalten sich wie vorher
// - Chef legt eine eigene Rolle an (Büro ohne Buchhaltung) und gibt sie Klaus; Melanie bekommt „Büro“
// - Klaus: kein Menüpunkt Buchhaltung, /buchhaltung gesperrt, Kategorien/Übergaben per API unsichtbar,
//   Betriebsdaten nicht änderbar, kann sich nicht selbst befördern, keine Rollen anlegen, kein Chef-Passwort
// - Melanie: Buchhaltung im Menü und lesbar
// - Lehrling: kein Projekt anlegen, keine Stunden für Kollegen (API und Oberfläche)
// - alte App-Fassung setzt nur `rolle` → eingebaute Rolle; der letzte volle Chef bleibt Chef
// - Chef schaltet auf „Mitarbeiter & Zugänge → Rollen & Rechte“ ein Recht um, legt eine Rolle an
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55310 API_URL=http://127.0.0.1:55300 ANON_KEY=… SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-rollen-rechte.mjs
// Legt selbst an (alles „ZZ“), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const ANON_KEY = process.env.ANON_KEY ?? process.env.VITE_SUPABASE_KEY;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, ANON_KEY und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  // Wer eine fertige Rechnung geschrieben hat, lässt sich nicht löschen (festgeschrieben) → wiederverwenden
  let id = alt && (await admin.auth.admin.deleteUser(alt.id)).error ? alt.id : null;
  if (id) await admin.auth.admin.updateUserById(id, { password: PW });
  else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
  }
  await admin.from("profiles").update({ aktiv: true, rolle, rolle_id: null, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", id);
  return id;
}
async function als(email) {
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

const ids = {};
let eigeneRolle = null;
const fehler = [];
let browser;
try {
  ids.chef = await konto("zz-chef@test.local", "chef", "Stefan");
  ids.klaus = await konto("zz-klaus@test.local", "monteur", "Klaus");
  ids.melanie = await konto("zz-melanie@test.local", "monteur", "Melanie");
  ids.lehrling = await konto("zz-lehrling@test.local", "monteur", "Lukas");
  ids.monteur = await konto("zz-monteur@test.local", "monteur", "Max");
  const { data: rollen } = await admin.from("rollen").select("*");
  const r = (k) => rollen.find((x) => x.schluessel === k);
  ok(rollen.length >= 4 && r("chef") && r("buero") && r("monteur") && r("lehrling"), "eingebaute Rollen Chef, Büro, Monteur, Lehrling da");

  const chef = await als("zz-chef@test.local");
  const monteur = await als("zz-monteur@test.local");

  // ── bestehende Konten ohne Rolle: wie bisher ─────────────────────────
  ok((await chef.rpc("hat_recht", { p_recht: "buchhaltung" })).data === true, "Chef ohne Rolle: Buchhaltung");
  ok((await chef.rpc("ist_voller_chef")).data === true, "Chef ohne Rolle ist voller Chef");
  ok((await monteur.rpc("hat_recht", { p_recht: "projekte_anlegen" })).data === true, "Monteur ohne Rolle: Projekt anlegen wie bisher");
  const pm = await monteur.from("projekte").insert({ name: "ZZ Monteur-Projekt" }).select("id").single();
  ok(!pm.error, `Monteur legt weiter Projekte an${pm.error ? ": " + pm.error.message : ""}`);

  // ── Chef legt eigene Rolle an und vergibt Rollen ─────────────────────
  const neu = await chef.from("rollen").insert({ name: "ZZ Büro ohne Buchhaltung", basis: "chef", rechte: ["rechnungen", "eingang", "regie", "material", "projekte_anlegen", "stunden_andere"] }).select("*").single();
  ok(!neu.error, `Chef legt Rolle an${neu.error ? ": " + neu.error.message : ""}`);
  eigeneRolle = neu.data?.id;
  const k1 = await chef.from("profiles").update({ rolle_id: eigeneRolle }).eq("id", ids.klaus).select("rolle, rolle_id").single();
  ok(k1.data?.rolle === "chef", "Rolle mit Büro-Zugang setzt die Grundstufe auf chef");
  await chef.from("profiles").update({ rolle_id: r("buero").id }).eq("id", ids.melanie);
  await chef.from("profiles").update({ rolle_id: r("lehrling").id }).eq("id", ids.lehrling);
  const klaus = await als("zz-klaus@test.local");
  const melanie = await als("zz-melanie@test.local");
  const lehrling = await als("zz-lehrling@test.local");

  // ── Buchhaltung: Melanie ja, Klaus nein ──────────────────────────────
  const kat = await admin.from("rechnung_kategorien").insert({ name: "ZZ Kategorie", richtung: "eingang", art: "sonstiges" });
  if (kat.error) throw kat.error;
  const kk = await klaus.from("rechnung_kategorien").select("id").eq("name", "ZZ Kategorie");
  const km = await melanie.from("rechnung_kategorien").select("id").eq("name", "ZZ Kategorie");
  ok((kk.data ?? []).length === 0, "Klaus sieht die Buchhaltungs-Kategorien nicht (API)");
  ok((km.data ?? []).length === 1, "Melanie sieht die Buchhaltungs-Kategorien");
  const ku = await klaus.from("fibu_uebergaben").select("id").limit(1);
  ok(!ku.error && (ku.data ?? []).length === 0, "Klaus: Übergaben leer");
  ok((await klaus.rpc("hat_recht", { p_recht: "rechnungen" })).data === true, "Klaus: Rechnungen ja");
  ok((await klaus.rpc("ist_chef")).data === true && (await klaus.rpc("ist_voller_chef")).data === false, "Klaus: Büro-Zugang, aber nicht der Chef");

  // ── keine Selbst-Beförderung, keine Chef-Sachen ──────────────────────
  const s1 = await klaus.from("profiles").update({ rolle_id: r("chef").id }).eq("id", ids.klaus);
  ok(!!s1.error, "Klaus kann sich nicht selbst zum Chef machen");
  const s2 = await klaus.from("profiles").update({ rolle_id: null }).eq("id", ids.klaus);
  ok(!!s2.error, "Klaus kann seine Rolle nicht leeren (= Chef)");
  const s3 = await klaus.from("rollen").update({ rechte: ["buchhaltung"] }).eq("id", eigeneRolle).select("id");
  ok(!!s3.error || (s3.data ?? []).length === 0, "Klaus kann seine Rolle nicht ändern");
  const s4 = await klaus.from("rollen").insert({ name: "ZZ Hintertür", basis: "chef", rechte: ["buchhaltung"] });
  ok(!!s4.error, "Klaus kann keine Rolle anlegen");
  const s5 = await klaus.rpc("passwort_setzen", { p_user: ids.chef, p_passwort: "hintertuer1" });
  ok(!!s5.error, "Klaus vergibt kein Passwort (auch nicht dem Chef)");
  const s6 = await klaus.from("profiles").update({ gesperrt: true }).eq("id", ids.chef);
  ok(!!s6.error, "Klaus sperrt den Chef nicht");
  const s7 = await klaus.from("firma").update({ name: "ZZ Fremdfirma" }).eq("id", 1);
  ok(!!s7.error, "Klaus ändert die Betriebsdaten nicht");
  const { data: f } = await admin.from("firma").select("plan_von").eq("id", 1).single();
  const s8 = await klaus.from("firma").update({ plan_von: f.plan_von }).eq("id", 1);
  ok(!s8.error, `Klaus darf Arbeitsfelder (Plan-Zeiten) weiter speichern${s8.error ? ": " + s8.error.message : ""}`);
  const s9 = await melanie.from("firma").update({ name: "ZZ Fremdfirma" }).eq("id", 1);
  ok(!!s9.error, "Büro (ohne Einstellungen) ändert die Betriebsdaten nicht");

  // ── Büro arbeitet normal weiter (Rechnung, Eingangsrechnung, Datei) ──
  const b1 = await melanie.from("belege").insert({ typ: "rechnung", status: "entwurf", empf_name: "ZZ Kunde Rolle", betreff: "ZZ Rollen-Test" }).select("id").single();
  ok(!b1.error, `Büro legt eine Rechnung an${b1.error ? ": " + b1.error.message : ""}`);
  if (b1.data) {
    const b2 = await melanie.from("beleg_positionen").insert({ beleg_id: b1.data.id, pos: 1, art: "pauschale", bezeichnung: "ZZ Arbeit", menge: 1, einheit: "Psch", einzelpreis: 100 });
    ok(!b2.error, `Büro schreibt Positionen${b2.error ? ": " + b2.error.message : ""}`);
    const b3 = await melanie.rpc("beleg_fertigstellen", { p_id: b1.data.id });
    ok(!b3.error, `Büro stellt die Rechnung fertig${b3.error ? ": " + b3.error.message : ""}`);
  }
  const e1 = await melanie.from("eingangsrechnungen").insert({ lieferant: "ZZ Rollen GmbH", nummer: "ZZ-R1", datum: "2026-11-18", netto: 10, ust_satz: 20, ust: 2, brutto: 12, betrieb: true, freigabe: "offen" }).select("id").single();
  ok(!e1.error, `Büro erfasst eine Eingangsrechnung${e1.error ? ": " + e1.error.message : ""}`);
  const e2 = await melanie.storage.from("eingangsrechnungen").upload(`zz-rollen/${Date.now()}.pdf`, new Blob(["%PDF-1.4 ZZ"], { type: "application/pdf" }));
  ok(!e2.error, `Büro lädt die Datei dazu hoch${e2.error ? ": " + e2.error.message : ""}`);
  if (!e2.error) await admin.storage.from("eingangsrechnungen").remove([e2.data.path]);
  const k8 = await klaus.from("eingangsrechnungen").select("id").eq("nummer", "ZZ-R1");
  ok((k8.data ?? []).length === 1, "Klaus (Eingang erlaubt) sieht die Eingangsrechnung");
  const d1 = await klaus.from("profiles").delete().eq("id", ids.chef).select("id");
  ok(!!d1.error || (d1.data ?? []).length === 0, "Klaus löscht das Konto des Chefs nicht");

  // ── Lehrling ─────────────────────────────────────────────────────────
  const l1 = await lehrling.from("projekte").insert({ name: "ZZ Lehrling-Projekt" });
  ok(!!l1.error, "Lehrling legt kein Projekt an (API)");
  const l2 = await lehrling.from("zeiten").insert({ user_id: ids.monteur, datum: "2026-11-18", stunden: 1, projekt_id: pm.data?.id ?? null });
  ok(!!l2.error, "Lehrling bucht keine Stunden für Kollegen (API)");
  ok((await lehrling.rpc("hat_recht", { p_recht: "regie" })).data === true, "Lehrling: Regiebericht ja");
  await admin.from("projekte").update({ status: "aktiv" }).eq("id", pm.data?.id);
  const l3 = await lehrling.from("zeiten").insert({ user_id: ids.lehrling, datum: "2026-11-18", stunden: 2, projekt_id: pm.data?.id });
  ok(!l3.error, `Lehrling bucht eigene Stunden${l3.error ? ": " + l3.error.message : ""}`);
  const l4 = await lehrling.from("regieberichte").insert({ projekt_id: pm.data?.id, datum: "2026-11-18", status: "entwurf" }).select("id").single();
  ok(!l4.error, `Lehrling legt einen Regiebericht an${l4.error ? ": " + l4.error.message : ""}`);
  const l5 = await lehrling.from("material_buchungen").insert({ art: "direkt", menge: 1, projekt_id: pm.data?.id, user_id: ids.lehrling, bezeichnung: "ZZ Kabel", einheit: "Stk", regiebericht_id: l4.data?.id ?? null });
  ok(!l5.error, `Lehrling bucht Material in den Regiebericht${l5.error ? ": " + l5.error.message : ""}`);

  // ── alte App-Fassung und letzter Chef ────────────────────────────────
  const a1 = await chef.from("profiles").update({ rolle: "monteur" }).eq("id", ids.melanie).select("rolle, rolle_id").single();
  ok(a1.data?.rolle === "monteur" && a1.data?.rolle_id === null, "alte App setzt nur „rolle“ → eingebaute Rolle Monteur");
  await chef.from("profiles").update({ rolle_id: r("buero").id }).eq("id", ids.melanie);
  const { count: andereChefs } = await admin.from("profiles").select("id", { count: "exact", head: true })
    .eq("rolle", "chef").eq("aktiv", true).is("rolle_id", null).neq("id", ids.chef);
  if (!andereChefs) {
    const c1 = await chef.from("profiles").update({ rolle_id: r("buero").id }).eq("id", ids.chef);
    ok(!!c1.error, "der letzte volle Chef kann sich nicht selbst zu „Büro“ machen");
  }

  // ── Oberfläche ───────────────────────────────────────────────────────
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  async function anmelden(email, viewport) {
    const ctx = await browser.newContext({ viewport, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(`[${email}] ${e.message}`));
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill(email);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    return page;
  }
  const PC = { width: 1440, height: 1000 };
  const HANDY = { width: 390, height: 844 };
  const seitenleiste = (p) => p.locator("aside, nav").first();

  const pk = await anmelden("zz-klaus@test.local", PC);
  await pk.goto(`${APP_URL}/`);
  await pk.getByRole("link", { name: "Rechnungen" }).first().waitFor({ timeout: 15000 });
  ok(await pk.getByRole("link", { name: "Buchhaltung" }).count() === 0, "Klaus: kein Menüpunkt Buchhaltung");
  ok(await pk.getByRole("link", { name: "Mitarbeiter & Zugänge" }).count() === 0, "Klaus: kein Menüpunkt Mitarbeiter & Zugänge");
  await pk.goto(`${APP_URL}/buchhaltung`);
  await pk.getByText("Für deine Rolle nicht freigegeben").waitFor({ timeout: 10000 }).catch(() => {});
  ok(await pk.getByText("Für deine Rolle nicht freigegeben").count() === 1, "Klaus: /buchhaltung zeigt „nicht freigegeben“");
  await pk.goto(`${APP_URL}/rechnungen`);
  await pk.waitForTimeout(1500);
  ok(await pk.getByText("Für deine Rolle nicht freigegeben").count() === 0, "Klaus: Rechnungen gehen");
  await pk.screenshot({ path: `${BILDER}/rollen-klaus-pc.png` });
  await pk.context().close();

  const pm2 = await anmelden("zz-melanie@test.local", PC);
  await pm2.goto(`${APP_URL}/`);
  await pm2.getByRole("link", { name: "Buchhaltung" }).first().waitFor({ timeout: 15000 });
  ok(true, "Melanie: Menüpunkt Buchhaltung da");
  await pm2.goto(`${APP_URL}/buchhaltung`);
  await pm2.waitForTimeout(1500);
  ok(await pm2.getByText("Für deine Rolle nicht freigegeben").count() === 0, "Melanie: Buchhaltung geht auf");
  await pm2.context().close();

  const pl = await anmelden("zz-lehrling@test.local", HANDY);
  await pl.goto(`${APP_URL}/`);
  await pl.getByText("Schnell festhalten").waitFor({ timeout: 15000 });
  ok(await pl.getByRole("button", { name: /Neue Baustelle anlegen/ }).count() === 0, "Lehrling: kein „Neue Baustelle anlegen“");
  ok(await pl.getByRole("button", { name: /Regiebericht/ }).count() >= 1, "Lehrling: Regiebericht da");
  await pl.screenshot({ path: `${BILDER}/rollen-lehrling-handy.png`, fullPage: true });
  await pl.context().close();

  const pmo = await anmelden("zz-monteur@test.local", HANDY);
  await pmo.goto(`${APP_URL}/`);
  await pmo.getByText("Schnell festhalten").waitFor({ timeout: 15000 });
  ok(await pmo.getByRole("button", { name: /Neue Baustelle anlegen/ }).count() === 1, "Monteur ohne Rolle: „Neue Baustelle anlegen“ wie bisher");
  await pmo.context().close();

  for (const [name, viewport] of [["pc", PC], ["handy", HANDY]]) {
    const pc = await anmelden("zz-chef@test.local", viewport);
    await pc.goto(`${APP_URL}/mitarbeiter`);
    await pc.getByText("Rollen & Rechte").waitFor({ timeout: 15000 });
    ok(await pc.getByRole("group", { name: "Rolle Klaus ZZ" }).getByRole("button", { name: "ZZ Büro ohne Buchhaltung" }).getAttribute("aria-pressed") === "true",
      `${name}: bei Klaus ist seine Rolle gewählt`);
    await pc.getByRole("tab", { name: "ZZ Büro ohne Buchhaltung" }).click();
    const sw = pc.getByRole("switch", { name: "ZZ Büro ohne Buchhaltung: Buchhaltung" });
    const vorher = await sw.getAttribute("aria-checked");
    await sw.click();
    await pc.waitForTimeout(1200);
    const { data: nach } = await admin.from("rollen").select("rechte").eq("id", eigeneRolle).single();
    ok(nach.rechte.includes("buchhaltung") === (vorher === "false"), `${name}: Schalter Buchhaltung gespeichert`);
    await sw.click();
    await pc.waitForTimeout(1200);
    if (name === "pc") {
      await pc.getByRole("button", { name: "Rolle", exact: true }).click();
      await pc.locator("#rolle-name").fill("ZZ Helfer");
      await pc.getByRole("button", { name: "Nur Baustelle" }).click();
      await pc.getByRole("button", { name: "Anlegen", exact: true }).click();
      await pc.waitForTimeout(1500);
      const { data: h } = await admin.from("rollen").select("basis, rechte").eq("name", "ZZ Helfer").maybeSingle();
      ok(h?.basis === "monteur" && h.rechte.includes("regie") && !h.rechte.includes("rechnungen"), "neue Baustellen-Rolle mit Monteur-Rechten angelegt");
    }
    await pc.screenshot({ path: `${BILDER}/rollen-chef-${name}.png`, fullPage: true });
    await pc.context().close();
  }
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("rechnung_kategorien").delete().like("name", "ZZ%");
  await admin.from("eingangsrechnungen").delete().like("lieferant", "ZZ %");
  await admin.from("material_buchungen").delete().eq("bezeichnung", "ZZ Kabel");
  await admin.from("zeiten").delete().in("user_id", Object.values(ids));
  await admin.from("regieberichte").delete().in("projekt_id", (await admin.from("projekte").select("id").like("name", "ZZ%")).data?.map((p) => p.id) ?? []);
  await admin.from("projekte").delete().like("name", "ZZ%");
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  await admin.from("rollen").delete().like("name", "ZZ%");
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
