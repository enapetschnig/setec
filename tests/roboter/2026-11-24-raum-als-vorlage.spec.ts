// Stefan 24.11.2026: „Wenn man Titel (Räume) als Vorlage speichern kann. So wie hier z. B. der Verteilerumbau. Dann
// könnte ich den ganzen Raum als Vorlage ergänzen und müsste nur mehr Kleinigkeiten anpassen.“
// Titel → ⋮ → „Raum als Vorlage speichern“ speichert nur diesen Titel samt seinen Positionen; „Mehr → Aus Vorlage“
// fügt ihn in einem anderen Angebot als eigenen Abschnitt ein (Betreff bleibt leer).
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("PC: Raum als Vorlage speichern und in ein anderes Angebot einfügen", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Raum Vorlage");
  const RAUM = `${LAUF} Verteilerumbau`;
  await page.setViewportSize({ width: 1440, height: 900 });
  wache(page);
  await anmelden(page, chef);
  try {
    await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
    const eingabe = page.getByPlaceholder(/Position eingeben/);
    await expect(eingabe).toBeVisible({ timeout: 60_000 });

    // Erst ein anderer Raum (darf nicht mit in die Vorlage), dann der Verteiler mit Text und zwei Positionen
    await eingabe.fill("#PV Dach");
    await eingabe.press("Enter");
    await expect(eingabe).toHaveValue("");
    await eingabe.fill("3 Modul Dach");
    await eingabe.press("Enter");
    await expect(eingabe).toHaveValue("");
    await eingabe.fill(`#${RAUM}`);
    await eingabe.press("Enter");
    await expect(eingabe).toHaveValue("");
    await expect(page.getByLabel("Titel 2", { exact: true })).toHaveValue(RAUM);
    await eingabe.fill("2 FI Schalter");
    await eingabe.press("Enter");
    await expect(eingabe).toHaveValue("");
    await eingabe.fill("1 Zählerverteiler");
    await eingabe.press("Enter");
    await expect(eingabe).toHaveValue("");
    await expect(page.getByLabel("Bezeichnung 2.2", { exact: true })).toBeVisible();

    const zeile = page.locator("tr", { has: page.getByLabel("Titel 2", { exact: true }) });
    await zeile.getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "Raum als Vorlage speichern" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Raum als Vorlage speichern" })).toBeVisible();
    await expect(dialog.getByLabel("Name der Vorlage")).toHaveValue(RAUM);
    await expect(dialog.getByText("Einleitung und Schlusstext mitnehmen")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Vorlage speichern" }).click();
    await expect(page.getByText(`Vorlage „${RAUM}“ gespeichert`)).toBeVisible();

    const { data: v } = await admin.from("angebot_vorlagen").select("betreff, einleitung, positionen").eq("name", RAUM).single();
    const pos = v!.positionen as { art: string; bezeichnung: string }[];
    expect(pos.map((x) => x.bezeichnung)).toEqual([RAUM, "FI Schalter", "Zählerverteiler"]);
    expect(v!.betreff).toBeNull();
    expect(v!.einleitung).toBeNull();

    // Neues Angebot: Mehr → Aus Vorlage → Raum einfügen
    await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
    await expect(eingabe).toBeVisible({ timeout: 60_000 });
    const betreffVorher = await page.getByLabel("Betreff").inputValue();
    await page.getByRole("button", { name: "Mehr" }).click();
    await page.getByRole("menuitem", { name: "Aus Vorlage" }).click();
    await page.getByLabel("Vorlagen suchen").fill(LAUF);
    await page.getByRole("button", { name: new RegExp(RAUM) }).first().click();
    await page.getByRole("button", { name: /einfügen$/i }).click();
    await expect(page.getByLabel("Titel 1", { exact: true })).toHaveValue(RAUM);
    await expect(page.getByLabel("Bezeichnung 1.1", { exact: true })).toHaveValue("FI Schalter");
    await expect(page.getByLabel("Bezeichnung 1.2", { exact: true })).toHaveValue("Zählerverteiler");
    await expect(page.getByLabel("Betreff")).toHaveValue(betreffVorher);
    if (process.env.BILD) await page.screenshot({ path: "test-results/raum-vorlage.png" });
  } finally {
    await admin.from("angebot_vorlagen").delete().eq("name", RAUM);
  }
});
