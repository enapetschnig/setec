/**
 * Gemeinsame Hilfen der Grundtests (kein Test selbst). Nur gegen die Testumgebung (umgebung.ts).
 * Konten: die anonymisierten Kopien der echten Benutzer (nutzerN@example.invalid, Rolle wie bei SETEC),
 * fehlt eine Rolle, ein eigenes Konto „zzgt-…@test.local“. Eigene Daten tragen „ZZGT <Lauf>“.
 * Aus den Echtdaten steht nichts im Test (keine Namen, Nummern, IDs) — gewählt wird zur Laufzeit.
 */
import { test, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { umgebung } from "./umgebung";

const U = umgebung();
// Je Arbeiter-Prozess eindeutig (laufen mit --workers=4 gleichzeitig): Zeit + Zufall.
export const LAUF = `ZZGT ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORT_KOPIE = "Test1234!"; // festes Passwort der Testumgebung für die Kopien
const PASSWORT_EIGEN = "zzgt-Test1234!";

export const admin = createClient(U.api, U.service, { auth: { persistSession: false } });

export type Konto = { id: string; email: string; passwort: string };
export type Rolle = "chef" | "monteur" | "buero" | "lehrling";

/** In jeder Spec zuerst: alles, was nicht lokal ist, wird im Browser gesperrt (zweite Sperre neben umgebung.ts). */
export function nurTestumgebung() {
  test.beforeEach(async ({ context }) => {
    await context.route(/supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
    await context.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  });
}

const merk = new Map<string, Konto>();
export const ROLLEN: Rolle[] = ["chef", "monteur", "buero", "lehrling"];

/**
 * Konto dieser Rolle: Kopie eines echten Benutzers dieser Grundstufe (aktiv, nicht versteckt, ohne eigene Rolle),
 * sonst das eigene „zzgt-<rolle>@test.local“. Nur lesen — angelegt werden die eigenen Konten einmal vorab
 * (`kontenAnlegen` in vorab.ts), damit parallele Arbeiter sich nicht gegenseitig Konten/Passwörter umstellen.
 */
export async function konto(rolle: Rolle): Promise<Konto> {
  if (merk.has(rolle)) return merk.get(rolle)!;
  const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let k: Konto | null = null;
  if (rolle === "chef" || rolle === "monteur") {
    const { data: profile } = await admin.from("profiles").select("id").eq("rolle", rolle).eq("aktiv", true)
      .eq("versteckt", false).is("rolle_id", null).eq("passwort_neu", false).order("id");
    const kopie = liste.users.find((u) => /^nutzer\d+@example\.invalid$/.test(u.email ?? "") && profile?.some((p) => p.id === u.id));
    if (kopie) k = { id: kopie.id, email: kopie.email!, passwort: PASSWORT_KOPIE };
  }
  if (!k) {
    const eigen = liste.users.find((u) => u.email === eigeneEmail(rolle));
    if (!eigen) throw new Error(`Konto ${eigeneEmail(rolle)} fehlt — globalSetup (tests/roboter/vorab.ts) lief nicht.`);
    k = { id: eigen.id, email: eigen.email!, passwort: PASSWORT_EIGEN };
  }
  merk.set(rolle, k);
  return k;
}

const eigeneEmail = (rolle: Rolle) => `zzgt-${rolle}@test.local`;

/** Vorab einmal (vorab.ts): je Rolle ohne passende Kopie ein eigenes Konto anlegen bzw. zurücksetzen. */
export async function kontenAnlegen() {
  for (const rolle of ROLLEN) {
    if (rolle === "chef" || rolle === "monteur") {
      const { data: profile } = await admin.from("profiles").select("id").eq("rolle", rolle).eq("aktiv", true)
        .eq("versteckt", false).is("rolle_id", null).eq("passwort_neu", false);
      const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (liste.users.some((u) => /^nutzer\d+@example\.invalid$/.test(u.email ?? "") && profile?.some((p) => p.id === u.id))) continue;
    }
    await eigenesKonto(rolle);
  }
}

/** Eigenes Konto mit einer eingebauten Rolle (Büro, Lehrling …) bzw. Grundstufe. */
async function eigenesKonto(rolle: Rolle): Promise<Konto> {
  const email = eigeneEmail(rolle);
  const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let id = liste.users.find((u) => u.email === email)?.id;
  if (id) await admin.auth.admin.updateUserById(id, { password: PASSWORT_EIGEN });
  else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORT_EIGEN, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
  }
  let rolleId: string | null = null;
  let basis: "chef" | "monteur" = rolle === "chef" ? "chef" : "monteur";
  if (rolle === "buero" || rolle === "lehrling") {
    const { data: r, error } = await admin.from("rollen").select("id, basis").eq("schluessel", rolle).single();
    if (error) throw new Error(`eingebaute Rolle ${rolle} fehlt: ${error.message}`);
    rolleId = r.id;
    basis = r.basis;
  }
  const { error } = await admin.from("profiles")
    .update({ aktiv: true, rolle: basis, rolle_id: rolleId, vorname: "ZZGT", nachname: rolle, passwort_neu: false }).eq("id", id);
  if (error) throw error;
  return { id, email, passwort: PASSWORT_EIGEN };
}

/** Datenbank mit den Rechten dieses Kontos (RLS greift). */
export async function als(k: Konto): Promise<SupabaseClient> {
  const c = createClient(U.api, U.anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: k.email, password: k.passwort });
  if (error) throw new Error(`Anmeldung ${k.email}: ${error.message}`);
  return c;
}

export async function anmelden(page: Page, k: Konto) {
  await page.goto("/auth");
  await page.locator("#benutzer").fill(k.email);
  await page.locator("#password").fill(k.passwort);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 });
}

export const HANDY = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

/** Neue Seite am Handy (390 px) — wie der Monteur auf der Baustelle. */
export async function handySeite(browser: Browser) {
  const ctx = await browser.newContext({ ...HANDY, locale: "de-AT", timezoneId: "Europe/Vienna", baseURL: process.env.TEST_APP_URL, serviceWorkers: "block" });
  await ctx.route(/supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  return ctx.newPage();
}

/** Sammelt Abstürze der Seite und von der Datenbank abgelehnte Abfragen. */
export function wache(page: Page) {
  const abstuerze: string[] = [];
  const abgelehnt: string[] = [];
  page.on("pageerror", (e) => abstuerze.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/") && r.status() >= 400) abgelehnt.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return { abstuerze, abgelehnt };
}

/** Eigener Kunde + Projekt „In Arbeit“ (Projekte entstehen sonst erst mit der Angebotsannahme). */
export async function testProjekt(titel: string) {
  const name = `${LAUF} ${titel}`;
  // Nummer selbst vergeben: nach dem Laden der Echtdaten steht der Zähler (identity) sonst noch auf den alten Nummern.
  // Parallele Arbeiter können dieselbe Nummer ziehen → bei Doppelung (23505) neu würfeln.
  let kunde: { id: string } | null = null;
  for (let versuch = 0; !kunde; versuch++) {
    const { data: hoechste } = await admin.from("kunden").select("nummer").order("nummer", { ascending: false, nullsFirst: false }).limit(1);
    const nummer = Number(hoechste?.[0]?.nummer ?? 0) + 1 + Math.floor(Math.random() * 500);
    const { data, error } = await admin.from("kunden").insert({ name, nummer, ort: "Testort", plz: "8600", strasse: "Teststraße 1" }).select("id").single();
    if (error && (error.code !== "23505" || versuch >= 5)) throw error;
    kunde = data;
  }
  const { data: projekt, error: e2 } = await admin.from("projekte").insert({ name, kunde_id: kunde.id, status: "aktiv" }).select("id, nummer, status").single();
  if (e2) throw e2;
  return { kundeId: kunde.id as string, projektId: projekt.id as string, nummer: projekt.nummer as string, name };
}

/**
 * Läuft nur vorab (vorab.ts), nie in einem Test.
 * Ohne `testumgebung.mjs daten` ist die Datenbank leer — dann je eine eigene Zeile, damit „sieht der Chef die
 * Rechnungen / Eingangsrechnungen / Kategorien?“ etwas zu sehen hat. Mit Echtdaten wird nichts angelegt.
 */
export async function grundbestand() {
  const leer = async (t: string) => ((await admin.from(t).select("id", { count: "exact", head: true })).count ?? 0) === 0;
  if (await leer("belege")) {
    const { error } = await admin.from("belege").insert({ typ: "rechnung", status: "entwurf", empf_name: "ZZGT Grundbestand", betreff: "ZZGT Grundbestand" });
    if (error) throw error;
  }
  if (await leer("eingangsrechnungen")) {
    const { error } = await admin.from("eingangsrechnungen").insert({ lieferant: "ZZGT Grundbestand" });
    if (error) throw error;
  }
  if (await leer("rechnung_kategorien")) {
    const { error } = await admin.from("rechnung_kategorien").insert({ richtung: "ausgang", name: "ZZGT Grundbestand" });
    if (error) throw error;
  }
}
