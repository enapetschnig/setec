// 23.11.2026 · Prüfung 22.11. (H5 + B2): Doppel-Tipp auf „Abschließen“ (mit ungespeicherter Änderung) verdoppelte
// die Zeilen und den Lagerabgang: zweimal Speichern (Zeilen löschen, dann neu einfügen — zwei Anfragen) liefen
// ineinander. Und scheiterte das Einfügen (Menge 0,0004), waren alle gespeicherten Zeilen weg.
// Jetzt: Speichern ist eine Datenbank-Funktion (`kunden_lieferschein_speichern`, sperrt den Lieferschein, ersetzt Kopf
// und Zeilen in einem Schritt), Speichern/Abschließen laufen nacheinander, `(lieferschein_id, pos)` ist eindeutig
// (schützt auch ältere App-Fassungen), und die App nimmt keinen zweiten Tipp an.
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { umgebung } from "./umgebung";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

const U = umgebung();

async function vorrat() {
  const { data: lager, error: eL } = await admin.from("lagerorte").insert({ name: `${LAUF} KLS-Lager`, art: "lager" }).select("id").single();
  if (eL) throw eL;
  const { data: art, error: eA } = await admin.from("artikel").insert([
    { bezeichnung: `${LAUF} KLS Steckdose`, einheit: "Stk", ek_preis: 4.2 },
    { bezeichnung: `${LAUF} KLS Kabel`, einheit: "m", ek_preis: 0.8 },
  ]).select("id, bezeichnung, einheit");
  if (eA) throw eA;
  return { lager: lager.id as string, artikel: art! };
}

type Vorrat = Awaited<ReturnType<typeof vorrat>>;
const kopf = (v: Vorrat, name: string) => ({
  kunde_id: null, empf_name: `${LAUF} ${name}`, empf_strasse: null, empf_plz: null, empf_ort: null, empf_email: null,
  datum: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date()), lagerort_id: v.lager, notiz: null,
});
const zeilen = (v: Vorrat, menge = 2) => [
  { artikel_id: v.artikel[0].id, artikelnummer: null, bezeichnung: v.artikel[0].bezeichnung, menge, einheit: "Stk", retour: false },
  { artikel_id: v.artikel[1].id, artikelnummer: null, bezeichnung: v.artikel[1].bezeichnung, menge: 12.5, einheit: "m", retour: false },
  { artikel_id: null, artikelnummer: null, bezeichnung: `${LAUF} Montagehilfe (frei)`, menge: 1, einheit: "Stk", retour: false },
];
const speichern = (c: SupabaseClient, id: string, neu: boolean, k: object, z: object[]) =>
  c.rpc("kunden_lieferschein_speichern", { p_id: id, p_neu: neu, p_kopf: k, p_zeilen: z });
const anzahl = async (tabelle: string, spalte: string, id: string) =>
  (await admin.from(tabelle).select("id", { count: "exact", head: true }).eq(spalte, id)).count;

test("Gleichzeitig speichern und abschließen: jede Zeile einmal, ein Abgang je Artikelzeile", async () => {
  const chef = await als(await konto("chef"));
  const v = await vorrat();
  for (let runde = 1; runde <= 5; runde++) {
    const id = randomUUID();
    const r0 = await speichern(chef, id, true, kopf(v, `Runde ${runde}`), zeilen(v));
    expect(r0.error?.message ?? null).toBeNull();
    // Doppel-Tipp: zweimal speichern + zweimal abschließen, alles auf einmal
    const ergebnisse = await Promise.all([
      speichern(chef, id, false, kopf(v, `Runde ${runde}`), zeilen(v, 3)),
      chef.rpc("kunden_lieferschein_abschliessen", { p_id: id }),
      speichern(chef, id, false, kopf(v, `Runde ${runde}`), zeilen(v, 3)),
      chef.rpc("kunden_lieferschein_abschliessen", { p_id: id }),
    ]);
    const abgeschlossen = [ergebnisse[1], ergebnisse[3]].filter((r) => !r.error);
    expect(abgeschlossen).toHaveLength(1);
    expect(await anzahl("kunden_lieferschein_positionen", "lieferschein_id", id)).toBe(3);
    expect(await anzahl("material_buchungen", "vorgang", id)).toBe(2); // die freie Zeile bucht nichts
    const { data: l } = await admin.from("kunden_lieferscheine").select("status, nummer").eq("id", id).single();
    expect(l?.status).toBe("fertig");
    expect(l?.nummer).toMatch(/^LS-\d{4}-\d{3}$/);
    // Abgänge passen zu den gespeicherten Zeilen
    const { data: pos } = await admin.from("kunden_lieferschein_positionen").select("artikel_id, menge").eq("lieferschein_id", id).not("artikel_id", "is", null);
    const { data: ab } = await admin.from("material_buchungen").select("artikel_id, menge, art").eq("vorgang", id);
    expect(ab!.every((b) => b.art === "abgang")).toBe(true);
    expect(ab!.map((b) => `${b.artikel_id}:${Number(b.menge)}`).sort()).toEqual(pos!.map((p) => `${p.artikel_id}:${Number(p.menge)}`).sort());
  }
});

test("Ältere App-Fassung (Zeilen löschen, dann einfügen) kann keine doppelten Zeilen mehr anlegen", async () => {
  const chef = await als(await konto("chef"));
  const v = await vorrat();
  const id = randomUUID();
  const { error: eK } = await chef.from("kunden_lieferscheine").insert({ id, ...kopf(v, "alte Fassung") });
  if (eK) throw eK;
  const altZeilen = zeilen(v).map((z, i) => ({ lieferschein_id: id, pos: i + 1, ...z }));
  // genau die Reihenfolge des Rennens aus der Prüfung: beide löschen, dann beide einfügen
  await chef.from("kunden_lieferschein_positionen").delete().eq("lieferschein_id", id);
  await chef.from("kunden_lieferschein_positionen").delete().eq("lieferschein_id", id);
  const e1 = await chef.from("kunden_lieferschein_positionen").insert(altZeilen);
  const e2 = await chef.from("kunden_lieferschein_positionen").insert(altZeilen);
  expect(e1.error?.message ?? null).toBeNull();
  expect(e2.error?.code).toBe("23505");
  expect(await anzahl("kunden_lieferschein_positionen", "lieferschein_id", id)).toBe(3);
});

test("Speichern scheitert (Menge 0,0004) → gespeicherte Zeilen bleiben, verständliche Meldung", async () => {
  const chef = await als(await konto("chef"));
  const v = await vorrat();
  const id = randomUUID();
  const r0 = await speichern(chef, id, true, kopf(v, "Menge klein"), zeilen(v));
  expect(r0.error?.message ?? null).toBeNull();
  const r1 = await speichern(chef, id, false, kopf(v, "Menge klein"), zeilen(v, 0.0004));
  expect(r1.error?.message ?? "").toMatch(/Menge/);
  expect(r1.error?.message ?? "").not.toMatch(/violates|constraint/);
  const { data: pos } = await admin.from("kunden_lieferschein_positionen").select("menge").eq("lieferschein_id", id).order("pos");
  expect(pos!.map((p) => Number(p.menge))).toEqual([2, 12.5, 1]);
});

test("Doppel-Tipp auf „Abschließen“ in der App: ein Abschluss, keine roten Meldungen", async ({ browser }) => {
  const chef = await als(await konto("chef"));
  const v = await vorrat();
  const id = randomUUID();
  // Entwurf direkt in den Tabellen (so wie ihn auch eine ältere App-Fassung gespeichert hat)
  const { error: eK } = await chef.from("kunden_lieferscheine").insert({ id, ...kopf(v, "Doppel-Tipp") });
  if (eK) throw eK;
  const { error: eZ } = await chef.from("kunden_lieferschein_positionen").insert(zeilen(v).map((z, i) => ({ lieferschein_id: id, pos: i + 1, ...z })));
  if (eZ) throw eZ;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-AT", timezoneId: "Europe/Vienna", baseURL: U.app, serviceWorkers: "block" });
  await ctx.route(/supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  const w = wache(page);
  await anmelden(page, await konto("chef"));
  await page.goto(`/kunden-lieferscheine/${id}`);
  await page.getByLabel("Menge").first().fill("3"); // ungespeicherte Änderung
  await page.getByRole("button", { name: "Abschließen", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Abschließen" }).dblclick();
  await expect(page.getByText(/Lieferschein LS-\d{4}-\d{3} abgeschlossen/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Nicht abgeschlossen")).toHaveCount(0);
  await expect(page.getByText("Nicht gespeichert")).toHaveCount(0);
  expect(await anzahl("kunden_lieferschein_positionen", "lieferschein_id", id)).toBe(3);
  expect(await anzahl("material_buchungen", "vorgang", id)).toBe(2);
  const { data: erste } = await admin.from("kunden_lieferschein_positionen").select("menge").eq("lieferschein_id", id).eq("pos", 1).single();
  expect(Number(erste?.menge)).toBe(3);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await ctx.close();
});
