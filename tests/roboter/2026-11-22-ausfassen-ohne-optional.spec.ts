// Gegenprobe 22.11.2026: Optionale/alternative Positionen im Angebot (Stefan 21.11.) zählten beim Ausfassen
// trotzdem als Material „laut Angebot“ — `angebot_material` lieferte `variante` nicht mit. Jetzt kommen sie
// gar nicht erst aus der Datenbank (auch Leistungs-Material nicht); der Monteur sieht am Handy nur das Gezählte.
import { expect, test } from "@playwright/test";
import { admin, als, anmelden, handySeite, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Monteur: Ausfassen laut Angebot ohne optionale/alternative Positionen", async ({ browser }) => {
  const monteur = await konto("monteur");
  const p = await testProjekt("Ausfassen optional");
  const art = async (n: string) => {
    const { data, error } = await admin.from("artikel").insert({ bezeichnung: `${LAUF} ${n}`, einheit: "Stk" }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  const kabel = await art("Kabel gezählt");
  const speicher = await art("Speicher optional");
  const wallbox = await art("Wallbox alternativ");
  const klemme = await art("Klemme aus Leistung");
  const { data: lOpt, error: eL } = await admin.from("leistungen").insert({ kurztext: `${LAUF} Wallbox montieren` }).select("id").single();
  if (eL) throw eL;
  const { data: lZ, error: eL2 } = await admin.from("leistungen").insert({ kurztext: `${LAUF} Dose setzen` }).select("id").single();
  if (eL2) throw eL2;
  const { error: eLm } = await admin.from("leistung_material").insert([
    { leistung_id: lOpt.id, artikel_id: wallbox, menge: 1 },
    { leistung_id: lZ.id, artikel_id: klemme, menge: 3 },
  ]);
  if (eLm) throw eLm;

  const { data: beleg, error } = await admin.from("belege").insert({
    typ: "angebot", status: "offen", projekt_id: p.projektId, kunde_id: p.kundeId, empf_name: p.name, betreff: `${LAUF} Angebot`, ust_satz: 20,
  }).select("id").single();
  if (error) throw error;
  // Sammel-Insert: jede Zeile mit denselben Feldern (sonst NULL statt Standard)
  const z = (pos: number, art: string, artikel_id: string | null, leistung_id: string | null, menge: number, variante: string | null) =>
    ({ beleg_id: beleg.id, pos, art, bezeichnung: `${LAUF} ${pos}`, menge, einheit: "Stk", einzelpreis: 10, artikel_id, leistung_id, variante });
  const { error: eP } = await admin.from("beleg_positionen").insert([
    z(1, "artikel", kabel, null, 5, null),
    z(2, "artikel", speicher, null, 1, "optional"),
    z(3, "leistung", null, lOpt.id, 1, "alternativ"),
    z(4, "leistung", null, lZ.id, 2, null),
  ]);
  if (eP) throw eP;

  // Datenbank: als Monteur nur die gezählten Positionen und ihr Leistungs-Material
  const db = await als(monteur);
  const { data: am, error: eA } = await db.rpc("angebot_material", { p_projekt: p.projektId });
  if (eA) throw eA;
  const d = am as { positionen: { artikel_id: string | null; leistung_id: string | null }[]; leistung_material: { artikel_id: string }[] };
  expect(d.positionen.map((x) => x.artikel_id ?? x.leistung_id).sort()).toEqual([kabel, lZ.id].sort());
  expect(d.leistung_material.map((x) => x.artikel_id)).toEqual([klemme]);

  // Am Handy beim Ausfassen
  const page = await handySeite(browser);
  const w = wache(page);
  await anmelden(page, monteur);
  await page.goto(`/scan?projekt=${p.projektId}&modus=ausfassung`);
  await expect(page.getByText(/Laut Angebot .* antippen/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: new RegExp(`${LAUF} Kabel gezählt`) })).toContainText("noch 5 von 5");
  await expect(page.getByRole("button", { name: new RegExp(`${LAUF} Klemme aus Leistung`) })).toContainText("noch 6 von 6");
  await expect(page.getByText(`${LAUF} Speicher optional`)).toHaveCount(0);
  await expect(page.getByText(`${LAUF} Wallbox alternativ`)).toHaveCount(0);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await page.context().close();
});
