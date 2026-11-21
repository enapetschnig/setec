// Langtext der Artikel (Stefan 21.11.2026): „Bitte auch bei den Artikeln den Langtext einblenden soweit einer
// vorhanden ist.“ Ein Artikel mit Langtext kommt mit ihm ins Angebot (Eingabezeile → Zeile zeigt ihn, gespeichert in
// beleg_positionen.langtext); eine ältere Artikel-Zeile ohne Langtext bekommt ihn über „Langtext hinzufügen“ vorgeschlagen.
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Artikel mit Langtext ins Angebot — Langtext steht in der Zeile und wird gespeichert", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Langtext");
  const name = `${LAUF} Modul Glas-Glas`;
  const lang = `${LAUF} Bifaciales Glas-Glas Modul\nFULLBLACK - schwarzer Rahmen`;
  const { data: art, error: eA } = await admin.from("artikel").insert({
    lieferant: `${LAUF} Lief`, artikelnummer: `${LAUF}-1`, bezeichnung: name, langtext: lang, einheit: "Stk", ek_preis: 60, vk_preis: 90,
  }).select("id").single();
  if (eA) throw eA;
  const { data: ohne, error: eO } = await admin.from("artikel").insert({
    lieferant: `${LAUF} Lief`, artikelnummer: `${LAUF}-2`, bezeichnung: `${LAUF} Wechselrichter`, langtext: `${LAUF} Hybrid 15 kW`, einheit: "Stk", ek_preis: 1000, vk_preis: 1500,
  }).select("id").single();
  if (eO) throw eO;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
  const eingabe = page.getByPlaceholder(/Position eingeben/);
  await expect(eingabe).toBeVisible({ timeout: 60_000 });
  await eingabe.fill(`24 ${name}`);
  // der Artikel-Treffer (mit Artikelnummer), nicht die freie Zeile — die steht schon da, bevor die Suche fertig ist
  await page.getByRole("option").filter({ hasText: `${LAUF}-1` }).click();
  const zeile = page.getByRole("row").filter({ has: page.getByLabel("Bezeichnung 1", { exact: true }) });
  await expect(zeile).toContainText("FULLBLACK - schwarzer Rahmen");

  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}$/);
  const belegId = page.url().match(/belege\/([0-9a-f-]{36})/)![1];
  const { data: pos } = await admin.from("beleg_positionen").select("langtext, artikel_id").eq("beleg_id", belegId);
  expect(pos).toEqual([{ langtext: lang, artikel_id: art.id }]);

  // Ältere Zeile (vor dem 21.11. übernommen, ohne Langtext): „Langtext hinzufügen“ schlägt den des Artikels vor
  const { error: eP } = await admin.from("beleg_positionen").insert({
    beleg_id: belegId, pos: 2, art: "artikel", bezeichnung: `${LAUF} Wechselrichter`, menge: 1, einheit: "Stk", einzelpreis: 1500, artikel_id: ohne.id,
  });
  if (eP) throw eP;
  await page.reload();
  const zeile2 = page.getByRole("row").filter({ has: page.getByLabel("Bezeichnung 2", { exact: true }) });
  await expect(zeile2).toBeVisible({ timeout: 60_000 });
  await zeile2.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Langtext hinzufügen/ }).click();
  await expect(zeile2.getByPlaceholder("Langtext")).toHaveValue(`${LAUF} Hybrid 15 kW`);
  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => (await admin.from("beleg_positionen").select("langtext").eq("beleg_id", belegId).eq("pos", 2).single()).data?.langtext)
    .toBe(`${LAUF} Hybrid 15 kW`);

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
