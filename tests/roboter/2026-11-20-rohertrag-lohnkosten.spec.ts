// Rohertrag mit Lohnkosten (Stefan 20.11.2026): eine reine Montage-Leistung zeigte 100 % Rohertrag, weil nur
// der Material-Einkauf abgezogen wurde. Jetzt: Rohertrag = Preis − Material-EK − Minuten × Lohnkosten je Stunde
// (Einstellungen). Liste /leistungen, Leistungs-Dialog und Kalkulation im Angebot.
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Rohertrag der Leistung und im Angebot zieht die Lohnkosten ab", async ({ page }) => {
  const chef = await konto("chef");
  const { data: firmaVorher } = await admin.from("firma").select("stundensatz, kostensatz").eq("id", 1).single();
  await admin.from("firma").update({ stundensatz: 77, kostensatz: 38 }).eq("id", 1);
  try {
    const name = `${LAUF} Montage Lohnkosten`;
    const { error } = await admin.from("leistungen").insert({ kurztext: name, kategorie: `${LAUF} Montage`, minuten: 115, einheit: "Stk" });
    if (error) throw error;
    const p = await testProjekt("Lohnkosten");

    await page.setViewportSize({ width: 1440, height: 900 });
    const w = wache(page);
    await anmelden(page, chef);
    await page.goto("/leistungen");
    // 115 min × 77 € = 147,58 € Preis; Lohnkosten 115 min × 38 € = 72,83 € → Rohertrag 74,75 € = 50,65 %
    const zeile = page.getByRole("row").filter({ hasText: name });
    await expect(zeile).toContainText(/€\s147,58/);
    await expect(zeile).toContainText("50,65 %");
    await zeile.click();
    await expect(page.getByText(/Lohnkosten 115 min × €\s38,00\/h/)).toBeVisible();
    await expect(page.getByText(/€\s74,75 · 50,65 %/)).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await expect(page.getByText(/Lohnkosten 115 min/)).toHaveCount(0);

    // Angebot mit 2 Stück: 230 min = 3,83 h; netto 295,16 €, Lohnkosten 3,83 h × 38 € = 145,67 € → 149,49 €
    await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
    const eingabe = page.getByPlaceholder(/Position eingeben/);
    await expect(eingabe).toBeVisible({ timeout: 60_000 });
    await eingabe.fill(`2 ${name}`);
    await page.getByRole("option", { name: new RegExp(`${name}.*€`) }).click();
    await expect(page.getByText("Rohertrag nach Lohn").first()).toBeVisible();
    await expect(page.locator("dl").getByText(/€\s145,67/)).toBeVisible();
    await expect(page.locator("dl").getByText(/€\s149,49/)).toBeVisible();

    expect(w.abstuerze).toEqual([]);
    expect(w.abgelehnt).toEqual([]);
  } finally {
    await admin.from("firma").update({ stundensatz: firmaVorher?.stundensatz ?? 0, kostensatz: firmaVorher?.kostensatz ?? null }).eq("id", 1);
  }
});
