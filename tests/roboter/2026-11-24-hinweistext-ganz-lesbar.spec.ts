// Stefan 24.11.2026: „Bitte wenn ein Text eingebaut wird das Feld entsprechend vergrößern, dass der ganze Text
// lesbar ist.“ Der Hinweistext im Angebot war am PC ein einzeiliges Feld — langer Text war abgeschnitten.
// Jetzt wächst das Feld mit dem Text (beim Tippen, nach dem Laden, wenn die Spalte schmäler wird).
import { expect, test, type Locator } from "@playwright/test";
import { anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

const TEXT = "Erneuern des Zählerverteilers inklusive Stammarbeiten. Es wird ausdrücklich darauf hingewiesen, dass "
  + "Arbeiten des Netzbetreibers (Zählertausch, Plombierung) nicht im Angebot enthalten sind und gesondert verrechnet werden. "
  + "Die Abschaltung erfolgt nach Terminvereinbarung mit dem Kunden.";

const ganzSichtbar = (feld: Locator) =>
  feld.evaluate((el) => ({ ok: el.scrollHeight <= el.clientHeight + 1, hoehe: el.clientHeight }));

test("PC: langer Hinweistext im Angebot ist ganz lesbar, auch nach dem Speichern", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Hinweistext lang");
  await page.setViewportSize({ width: 1440, height: 900 });
  wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
  await expect(page.getByPlaceholder(/Position eingeben/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const feld = page.getByLabel("Hinweistext", { exact: true });
  await expect(feld).toBeFocused();
  const leer = await ganzSichtbar(feld);
  await feld.fill(`${LAUF} ${TEXT}`);
  const voll = await ganzSichtbar(feld);
  expect(voll.ok).toBe(true);
  expect(voll.hoehe).toBeGreaterThan(leer.hoehe * 1.5); // mehrere Zeilen statt einer
  expect(leer.hoehe).toBeLessThan(50); // leer bleibt es eine Zeile

  // Spalte schmäler (Fenster kleiner) → Feld wächst nach
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(async () => (await ganzSichtbar(feld)).ok).toBe(true);

  // Speichern und neu laden: der gespeicherte Text ist sofort ganz zu sehen
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await expect(page).toHaveURL(/\/belege\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.reload();
  const geladen = page.getByLabel("Hinweistext", { exact: true });
  await expect(geladen).toHaveValue(`${LAUF} ${TEXT}`, { timeout: 60_000 });
  expect((await ganzSichtbar(geladen)).ok).toBe(true);
  if (process.env.BILD) await page.screenshot({ path: "test-results/hinweistext-lang.png" });
});
