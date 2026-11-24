// Stefan 24.11.2026: „Wenn ich den Artikel im Angebot gegen einen anderen ersetzen will, dass das System in der Zeile
// sucht (Montagematerial Ziegeldach → Trapezblech). Aktuell muss ich löschen, neu anlegen und wieder nach oben schieben.“
// Am PC: in der Bezeichnung tippen → Treffer anklicken → die Zeile wird ersetzt, an ihrem Platz, Menge bleibt.
// Ohne Wahl (nur Text ausbessern, Tab) bleibt Artikel und Preis. Am Handy dasselbe im Formular „Position bearbeiten“.
import { expect, test, type Page } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

async function artikelAnlegen(name: string, nr: string, vk: number, langtext: string) {
  const { data, error } = await admin.from("artikel").insert({
    lieferant: `${LAUF} Lief`, artikelnummer: nr, bezeichnung: name, langtext, einheit: "Stk", ek_preis: vk / 2, vk_preis: vk,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function angebotMitDreiZeilen(page: Page, projektId: string, namen: string[], k: string) {
  await page.goto(`/belege/neu?typ=angebot&projekt=${projektId}`);
  const eingabe = page.getByPlaceholder(/Position eingeben/);
  await expect(eingabe).toBeVisible({ timeout: 60_000 });
  for (const [i, n] of namen.entries()) {
    await eingabe.fill(`${i === 1 ? 24 : 1} ${n}`);
    await page.getByRole("option").filter({ hasText: `${LAUF}${k}-${i}` }).click();
  }
  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}$/);
  return page.url().match(/belege\/([0-9a-f-]{36})/)![1];
}

const zeilen = async (belegId: string) =>
  (await admin.from("beleg_positionen").select("pos, bezeichnung, langtext, menge, einzelpreis, artikel_id").eq("beleg_id", belegId).order("pos")).data ?? [];

test("PC: Artikel in der Zeile suchen und ersetzen — bleibt an ihrem Platz, Menge bleibt; nur Text ändern tauscht nichts", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Zeile tauschen");
  const ids = [
    await artikelAnlegen(`${LAUF} Modul Glas`, `${LAUF}P-0`, 90, "Glas-Glas"),
    await artikelAnlegen(`${LAUF} Montagematerial Ziegeldach`, `${LAUF}P-1`, 75.33, "Dachhaken"),
    await artikelAnlegen(`${LAUF} Wechselrichter`, `${LAUF}P-2`, 1500, "Hybrid"),
  ];
  const trapez = await artikelAnlegen(`${LAUF} Montagematerial Trapezblech`, `${LAUF}P-3`, 50, "Kurzschiene");

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  const belegId = await angebotMitDreiZeilen(page, p.projektId, [`${LAUF} Modul Glas`, `${LAUF} Montagematerial Ziegeldach`, `${LAUF} Wechselrichter`], "P");

  // Zeile 2 gegen Trapezblech tauschen
  const feld = page.getByLabel("Bezeichnung 2", { exact: true });
  await feld.fill(`${LAUF} Trapez`);
  await page.getByRole("listbox", { name: "Position ersetzen durch" }).getByRole("option").filter({ hasText: `${LAUF}P-3` }).click();
  await expect(feld).toHaveValue(`${LAUF} Montagematerial Trapezblech`);
  const zeile2 = page.getByRole("row").filter({ has: feld });
  await expect(zeile2).toContainText("Kurzschiene");

  // Zeile 3: nur den Text ausbessern (Tab) — Artikel und Preis bleiben
  const feld3 = page.getByLabel("Bezeichnung 3", { exact: true });
  await feld3.fill(`${LAUF} Wechselrichter Hybrid`);
  await expect(page.getByRole("listbox", { name: "Position ersetzen durch" })).toBeVisible();
  await feld3.press("Enter");
  await expect(page.getByRole("listbox", { name: "Position ersetzen durch" })).toBeHidden();

  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => (await zeilen(belegId)).map((z) => z.bezeichnung)).toEqual([
    `${LAUF} Modul Glas`, `${LAUF} Montagematerial Trapezblech`, `${LAUF} Wechselrichter Hybrid`,
  ]);
  const z = await zeilen(belegId);
  expect(z.map((x) => x.pos)).toEqual([1, 2, 3]);
  expect(z[1]).toMatchObject({ artikel_id: trapez, langtext: "Kurzschiene", menge: 24, einzelpreis: 50 });
  expect(z[0]).toMatchObject({ artikel_id: ids[0], einzelpreis: 90 });
  expect(z[2]).toMatchObject({ artikel_id: ids[2], einzelpreis: 1500, langtext: "Hybrid" });

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});

test("Handy: im Formular „Position bearbeiten“ suchen und ersetzen", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Zeile tauschen Handy");
  await artikelAnlegen(`${LAUF} H Modul Glas`, `${LAUF}H-0`, 90, "Glas-Glas");
  await artikelAnlegen(`${LAUF} H Montagematerial Ziegeldach`, `${LAUF}H-1`, 75.33, "Dachhaken");
  await artikelAnlegen(`${LAUF} H Wechselrichter`, `${LAUF}H-2`, 1500, "Hybrid");
  const trapez = await artikelAnlegen(`${LAUF} H Montagematerial Trapezblech`, `${LAUF}H-3`, 50, "Kurzschiene");

  // am PC anlegen, am Handy tauschen
  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  const belegId = await angebotMitDreiZeilen(page, p.projektId, [`${LAUF} H Modul Glas`, `${LAUF} H Montagematerial Ziegeldach`, `${LAUF} H Wechselrichter`], "H");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`${LAUF} H Montagematerial Ziegeldach`) }).click();
  const bez = page.getByLabel("Bezeichnung");
  await bez.fill(`${LAUF} Trapez`);
  await page.getByRole("listbox", { name: "Position ersetzen durch" }).getByRole("option").filter({ hasText: `${LAUF}H-3` }).click();
  await expect(bez).toHaveValue(`${LAUF} H Montagematerial Trapezblech`);
  await expect(page.getByLabel(/Langtext/)).toHaveValue("Kurzschiene");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await page.getByRole("button", { name: "Speichern", exact: true }).last().click();

  await expect.poll(async () => (await zeilen(belegId)).map((z) => z.artikel_id)).toContain(trapez);
  const z = await zeilen(belegId);
  expect(z.map((x) => x.bezeichnung)).toEqual([`${LAUF} H Modul Glas`, `${LAUF} H Montagematerial Trapezblech`, `${LAUF} H Wechselrichter`]);
  expect(z[1]).toMatchObject({ pos: 2, menge: 24, einzelpreis: 50, langtext: "Kurzschiene" });

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
