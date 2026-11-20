// Staffel der Montagezeit (Stefan 20.11.2026): an einer Leistung der Kategorie „Montagearbeiten“
// gilt je nach Menge eine andere Zeit je Stück (2–10 Module 160 min, 11–18 145, ab 19 130).
// Der Chef legt die Staffel im Leistungs-Dialog an (in anderen Kategorien gibt es sie nicht),
// im Angebot rechnet die Zeile beim Ändern der Menge Preis und Minuten nach der Stufe — eine Zeile bleibt.
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Staffel an Montage-Leistung, Angebot rechnet nach der Menge", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Staffel");
  // eigener Stundensatz am Projekt — 60 €/h, damit 1 Minute = 1 €
  const { error: eSatz } = await admin.from("projekte").update({ stundensatz: 60 }).eq("id", p.projektId);
  if (eSatz) throw eSatz;
  const name = `${LAUF} PV Montage Staffel`;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto("/leistungen");
  await page.getByRole("button", { name: /Neue Leistung/ }).first().click();
  await page.locator("#l-kurz").fill(name);
  await page.locator("#l-kat").fill("PV Montagematerial");
  await expect(page.getByTestId("staffel"), "andere Kategorie: keine Staffel").toHaveCount(0);
  await page.locator("#l-kat").fill("Montagearbeiten");
  const staffel = page.getByTestId("staffel");
  await expect(staffel).toBeVisible();
  await page.locator("#l-min").fill("115");
  for (const [i, ab, min] of [[1, "2", "160"], [2, "11", "145"], [3, "19", "130"]] as const) {
    await staffel.getByRole("button", { name: "Stufe" }).click();
    await staffel.getByLabel(`Staffel ${i} ab Menge`).fill(ab);
    await staffel.getByLabel(`Staffel ${i} Minuten`).fill(min);
  }
  await expect(staffel.getByText("11–18 Stk")).toBeVisible();
  await page.getByRole("button", { name: "Leistung anlegen" }).click();
  await expect(page.getByText("Leistung angelegt")).toBeVisible();
  const { data: l } = await admin.from("leistungen").select("id, minuten, staffel").eq("kurztext", name).single();
  expect(Number(l.minuten)).toBe(115);
  expect(l.staffel).toEqual([{ ab: 2, minuten: 160 }, { ab: 11, minuten: 145 }, { ab: 19, minuten: 130 }]);
  await expect(page.getByText("Staffel").first()).toBeVisible();

  // Angebot: 5 Module → 160 €, auf 12 → 145 €, auf 20 → 130 €
  await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
  const eingabe = page.getByPlaceholder(/Position eingeben/);
  await expect(eingabe).toBeVisible({ timeout: 60_000 });
  await eingabe.fill(`5 ${LAUF} PV Montage Staffel`);
  await page.getByRole("option", { name: new RegExp(`PV Montage Staffel.*€\\s160,00`) }).click();
  const menge = page.getByLabel("Menge 1", { exact: true });
  const preis = page.getByLabel("Einzelpreis 1", { exact: true });
  await expect(preis).toHaveValue("160,00");
  await menge.fill("12");
  await expect(preis).toHaveValue("145,00");
  await menge.fill("20");
  await expect(preis).toHaveValue("130,00");
  await menge.fill("12");
  await expect(preis).toHaveValue("145,00");
  // von Hand gesetzter Preis bleibt beim Ändern der Menge
  await preis.fill("150,00");
  await menge.fill("15");
  await expect(preis).toHaveValue("150,00");

  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}$/);
  const belegId = page.url().match(/belege\/([0-9a-f-]{36})/)![1];
  const { data: pos } = await admin.from("beleg_positionen").select("menge, einzelpreis, minuten, leistung_id").eq("beleg_id", belegId);
  expect(pos?.map((x) => [Number(x.menge), Number(x.einzelpreis), Number(x.minuten), x.leistung_id])).toEqual([[15, 150, 145, l.id]]);

  // Neu geladen: der gespeicherte Preis bleibt stehen, eine Zeile
  await page.reload();
  await expect(page.getByLabel("Einzelpreis 1", { exact: true })).toHaveValue("150,00", { timeout: 30_000 });
  await expect(page.getByLabel("Einzelpreis 2", { exact: true })).toHaveCount(0);

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
