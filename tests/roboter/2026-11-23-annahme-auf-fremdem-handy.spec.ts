// 23.11.2026 · Prüfung 22.11. (H2): Der Kunde unterschreibt vor Ort am Handy des Monteurs — dort ist der Monteur
// angemeldet. Bei Angeboten aus einer Erstaufnahme scheiterte die Annahme: `angebot_annehmen` lief mit dem Konto des
// Monteurs, und `erstaufnahme_schutz` lässt Status/Projekt nur Chef oder anonym ändern („… entscheidet der Chef.“).
// Jetzt nimmt der Kunde an, egal wer auf dem Gerät angemeldet ist — mit demselben Ergebnis wie im anonymen Browser
// (Angebot, Projekt, Erstaufnahme, Termin, Fotos, Verlauf).
import { expect, test, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { umgebung } from "./umgebung";
import { admin, als, anmelden, handySeite, konto, LAUF, nurTestumgebung, testProjekt, wache, type Rolle } from "./grundtest-hilfe";

nurTestumgebung();

const U = umgebung();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

type Fall = { belegId: string; eaId: string; terminId: string; token: string };

/** Erstaufnahme mit Termin und Foto, daraus ein fertiges Angebot mit Bestätigungslink — wie der Chef es macht */
async function angebotAusErstaufnahme(titel: string): Promise<Fall> {
  const chef = await als(await konto("chef"));
  const p = await testProjekt(titel); // nur für den Kunden; das Angebot hat kein Projekt
  const { data: termin, error: eT } = await admin.from("termine")
    .insert({ titel: `${LAUF} ${titel} Besichtigung`, datum: "2026-12-01", kunde_id: p.kundeId }).select("id").single();
  if (eT) throw eT;
  const { data: ea, error: eE } = await chef.from("erstaufnahmen").insert({
    kunde_id: p.kundeId, termin_id: termin.id, strasse: "Testweg 1", plz: "8650", ort: "Kindberg", kundenwunsch: `${LAUF} ${titel}`,
  }).select("id").single();
  if (eE) throw eE;
  const fotoPfad = `ea/${ea.id}/${randomUUID()}.png`;
  const { error: eU } = await chef.storage.from("projekt-dateien").upload(fotoPfad, PNG, { contentType: "image/png" });
  if (eU) throw eU;
  const { error: eF } = await chef.from("erstaufnahme_fotos").insert({ erstaufnahme_id: ea.id, pfad: fotoPfad });
  if (eF) throw eF;
  const { data: b, error: eB } = await chef.from("belege").insert({
    typ: "angebot", status: "entwurf", kunde_id: p.kundeId, erstaufnahme_id: ea.id, betreff: `${LAUF} ${titel}`, empf_name: p.name, ust_satz: 20,
  }).select("id").single();
  if (eB) throw eB;
  const { error: eP } = await chef.from("beleg_positionen")
    .insert({ beleg_id: b.id, pos: 1, art: "leistung", bezeichnung: `${LAUF} Steckdose setzen`, menge: 2, einheit: "Stk", einzelpreis: 45 });
  if (eP) throw eP;
  const { error: eFe } = await chef.rpc("beleg_fertigstellen", { p_id: b.id });
  if (eFe) throw eFe;
  const { data: token, error: eL } = await chef.rpc("angebot_link_erstellen", { p_beleg: b.id });
  if (eL) throw eL;
  return { belegId: b.id, eaId: ea.id, terminId: termin.id, token: token as string };
}

/** Wie die Bestätigungsseite: Unterschrift hochladen, Stand holen, annehmen — mit dem Client des Geräts */
async function annehmen(c: SupabaseClient, token: string) {
  const pfad = `${token}/${randomUUID()}.png`;
  const { error: eU } = await c.storage.from("angebot-bestaetigung").upload(pfad, PNG, { contentType: "image/png" });
  if (eU) throw eU;
  const { data: o, error: eO } = await c.rpc("angebot_oeffentlich", { p_token: token });
  if (eO) throw eO;
  return c.rpc("angebot_annehmen", {
    p_token: token, p_name: "Franz Testkunde", p_stand: (o as { stand: string }).stand, p_unterschrift: pfad, p_akzeptiert: true,
  });
}

/** Der ganze Endstand der Annahme, nicht nur „kein Fehler“ */
async function endstandPruefen(f: Fall) {
  const { data: b } = await admin.from("belege").select("status, projekt_id").eq("id", f.belegId).single();
  expect(b?.status).toBe("angenommen");
  expect(b?.projekt_id).toBeTruthy();
  const { data: pr } = await admin.from("projekte").select("status").eq("id", b!.projekt_id!).single();
  expect(pr?.status).toBe("aktiv");
  const { data: e } = await admin.from("erstaufnahmen").select("status, projekt_id").eq("id", f.eaId).single();
  expect(e).toEqual({ status: "auftrag", projekt_id: b!.projekt_id });
  const { data: t } = await admin.from("termine").select("projekt_id").eq("id", f.terminId).single();
  expect(t?.projekt_id).toBe(b!.projekt_id);
  const { count: fotos } = await admin.from("dateien").select("id", { count: "exact", head: true })
    .eq("projekt_id", b!.projekt_id!).not("erstaufnahme_foto_id", "is", null);
  expect(fotos).toBe(1);
  const { data: v } = await admin.from("angebot_verlauf").select("art, name").eq("beleg_id", f.belegId).eq("art", "angenommen");
  expect(v).toEqual([{ art: "angenommen", name: "Franz Testkunde" }]);
}

for (const rolle of ["monteur", "lehrling", "buero", "chef", null] as (Rolle | null)[]) {
  test(`Kunde nimmt an — auf dem Gerät angemeldet: ${rolle ?? "niemand"}`, async () => {
    const f = await angebotAusErstaufnahme(`Annahme ${rolle ?? "anonym"}`);
    const c = rolle ? await als(await konto(rolle)) : createClient(U.api, U.anon, { auth: { persistSession: false } });
    const r = await annehmen(c, f.token);
    expect(r.error?.message ?? null).toBeNull();
    await endstandPruefen(f);
  });
}

async function strich(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.55, { steps: 10 });
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.75, { steps: 10 });
  await page.mouse.up();
}

test("Handy des Monteurs: Kunde unterschreibt und nimmt verbindlich an", async ({ browser }) => {
  const f = await angebotAusErstaufnahme("Annahme Monteur-Handy");
  const page = await handySeite(browser);
  const w = wache(page);
  await anmelden(page, await konto("monteur"));
  await page.goto(`/angebot/${f.token}`);
  await page.getByRole("button", { name: "Angebot annehmen" }).click();
  await page.locator("#an-name").fill("Franz Testkunde");
  await page.getByLabel("Angebot bestätigen").click();
  await strich(page, page.locator('section[aria-label="Angebot annehmen"] canvas'));
  await page.getByRole("button", { name: "Angebot verbindlich annehmen" }).click();
  await expect(page.getByText("Vielen Dank — das Angebot ist angenommen.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/entscheidet der Chef/)).toHaveCount(0);
  await endstandPruefen(f);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await page.context().close();
});
