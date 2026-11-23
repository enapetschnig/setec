// 23.11.2026 · Prüfung 22.11. (H3): Zu einem angenommenen Angebot aus einer Erstaufnahme wurde ein Nachtrag
// (Kopie, dieselbe Erstaufnahme) verschickt. Jede Teilrechnung, „In Rechnung umwandeln“ oder erneutes „Angenommen“
// zum ersten Angebot setzte den Nachtrag still auf „abgelehnt“ — der Kunde sah „nicht mehr gültig“.
// Jetzt fallen andere Varianten nur weg, wenn die Erstaufnahme zum ersten Mal Auftrag wird (gewollt: der Kunde hat
// sich für eine Variante entschieden). Später bleibt jedes offene Angebot offen.
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { umgebung } from "./umgebung";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

const U = umgebung();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const status = async (id: string) => (await admin.from("belege").select("status").eq("id", id).single()).data?.status;

test("Nachtrag zur selben Erstaufnahme bleibt offen — Varianten fallen nur beim ersten Auftrag weg", async ({ browser }) => {
  const chef = await als(await konto("chef"));
  const p = await testProjekt("Nachtrag"); // nur für den Kunden
  const { data: ea, error: eE } = await chef.from("erstaufnahmen")
    .insert({ kunde_id: p.kundeId, strasse: "Testweg 1", plz: "8650", ort: "Kindberg", kundenwunsch: `${LAUF} Nachtrag` }).select("id").single();
  if (eE) throw eE;
  const angebot = async (c: SupabaseClient, titel: string, betrag: number) => {
    const { data: b, error } = await c.from("belege").insert({
      typ: "angebot", status: "entwurf", kunde_id: p.kundeId, erstaufnahme_id: ea.id, betreff: `${LAUF} ${titel}`, empf_name: p.name, ust_satz: 20,
    }).select("id").single();
    if (error) throw error;
    const { error: eP } = await c.from("beleg_positionen")
      .insert({ beleg_id: b.id, pos: 1, art: "leistung", bezeichnung: `${LAUF} ${titel}`, menge: 1, einheit: "Psch", einzelpreis: betrag });
    if (eP) throw eP;
    const { error: eF } = await c.rpc("beleg_fertigstellen", { p_id: b.id });
    if (eF) throw eF;
    const { data: token, error: eL } = await c.rpc("angebot_link_erstellen", { p_beleg: b.id });
    if (eL) throw eL;
    return { id: b.id as string, token: token as string };
  };

  // 1. Zwei Varianten verschickt, der Kunde entscheidet sich für Variante 1 → Variante 2 fällt weg (gewollt)
  const v1 = await angebot(chef, "Variante 1", 2000);
  const v2 = await angebot(chef, "Variante 2", 3000);
  const { data: projektId, error: eA } = await chef.rpc("projekt_aus_angebot", { p_beleg: v1.id });
  if (eA) throw eA;
  expect(await status(v1.id)).toBe("angenommen");
  expect(await status(v2.id)).toBe("abgelehnt");
  const { data: e1 } = await admin.from("erstaufnahmen").select("status, projekt_id").eq("id", ea.id).single();
  expect(e1).toEqual({ status: "auftrag", projekt_id: projektId });

  // 2. Nachtrag zur selben Erstaufnahme verschickt (wie „Kopieren (neuer Entwurf)“)
  const n = await angebot(chef, "Nachtrag", 500);
  expect(await status(n.id)).toBe("offen");

  // 3. Erneut „Angenommen“, Teilrechnung, „In Rechnung umwandeln“ — alle rufen projekt_aus_angebot für Variante 1
  for (let i = 0; i < 3; i++) {
    const { data, error } = await chef.rpc("projekt_aus_angebot", { p_beleg: v1.id });
    expect(error?.message ?? null).toBeNull();
    expect(data).toBe(projektId);
  }
  expect(await status(n.id)).toBe("offen");

  // 4. In der App: Teilrechnung zu Variante 1 am PC
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-AT", timezoneId: "Europe/Vienna", baseURL: U.app, serviceWorkers: "block" });
  await ctx.route(/supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  const w = wache(page);
  await anmelden(page, await konto("chef"));
  await page.goto(`/belege/${v1.id}`);
  await page.getByRole("button", { name: "Teilrechnung", exact: true }).first().click();
  await page.getByRole("button", { name: "50 %" }).click();
  await page.getByRole("button", { name: /Teilrechnung über/ }).click();
  await expect.poll(async () => (await admin.from("belege").select("id", { count: "exact", head: true })
    .eq("angebot_id", v1.id).eq("typ", "rechnung").not("teil_nr", "is", null)).count, { timeout: 30_000 }).toBe(1);
  expect(await status(n.id)).toBe("offen");
  expect(w.abstuerze).toEqual([]);
  await ctx.close();

  // 5. Der Kunde kann den Nachtrag über seinen Link weiter annehmen — er landet im selben Projekt
  const kunde = createClient(U.api, U.anon, { auth: { persistSession: false } });
  const pfad = `${n.token}/${randomUUID()}.png`;
  const { error: eU } = await kunde.storage.from("angebot-bestaetigung").upload(pfad, PNG, { contentType: "image/png" });
  if (eU) throw eU;
  const { data: o } = await kunde.rpc("angebot_oeffentlich", { p_token: n.token });
  expect((o as { zustand: string }).zustand).toBe("offen");
  const { error: eN } = await kunde.rpc("angebot_annehmen", {
    p_token: n.token, p_name: "Franz Testkunde", p_stand: (o as { stand: string }).stand, p_unterschrift: pfad, p_akzeptiert: true,
  });
  expect(eN?.message ?? null).toBeNull();
  expect(await status(n.id)).toBe("angenommen");
  const { data: nb } = await admin.from("belege").select("projekt_id").eq("id", n.id).single();
  expect(nb?.projekt_id).toBe(projektId);
  expect(await status(v2.id)).toBe("abgelehnt"); // die verworfene Variante bleibt verworfen
});
