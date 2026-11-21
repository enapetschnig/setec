// Grundablauf Listen (20.11.2026): Chef (Kopie des echten Kontos) öffnet mit den anonymisierten Echtdaten
// die Seiten, die SETEC täglich nutzt — am PC und am Handy. Keine Seite stürzt ab, keine Abfrage wird von
// der Datenbank abgelehnt (falsche Spalte, RLS, Timeout), jede zeigt ihre Überschrift.
// Eingangsrechnungen: alle Reiter. Rechnungen: die erste der Liste öffnet (Altrechnung oder Editor).
import { expect, test, type Page } from "@playwright/test";
import { anmelden, handySeite, konto, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

const SEITEN = [
  "/", "/projekte", "/kunden", "/kunden?ansicht=karte", "/erstaufnahmen", "/angebote", "/rechnungen", "/kalender",
  "/zeiten", "/aufgaben", "/regie", "/eingang", "/offene-posten", "/buchhaltung", "/kunden-lieferscheine",
  "/fuhrpark", "/artikel", "/dokumente", "/mitarbeiter", "/einstellungen", "/wuensche",
];

async function durchklicken(page: Page) {
  const w = wache(page);
  for (const pfad of SEITEN) {
    await page.goto(pfad);
    await expect(page.locator("h1:visible").first(), pfad).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Etwas ist schiefgelaufen|Seite nicht gefunden/), pfad).toHaveCount(0);
  }
  return w;
}

test("Chef am PC: alle Hauptseiten mit Echtdaten ohne Fehler", async ({ page }) => {
  test.setTimeout(150_000); // ~20 Seiten, grün in ~15 s
  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, await konto("chef"));
  const w = await durchklicken(page);

  // Eingangsrechnungen: jeder Reiter
  for (const filter of ["", "?filter=bezahlt", "?filter=bezahlt&weg=bar", "?filter=skonto"]) {
    await page.goto(`/eingang${filter}`);
    await page.waitForLoadState("networkidle");
  }
  // Rechnungen: eine aus der Liste öffnen
  await page.goto("/rechnungen");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('a[href^="/belege/"]').nth(1), "Rechnungsliste nicht leer").toBeAttached();
  const hrefs = await page.locator('a[href^="/belege/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const ziel = hrefs.find((h) => /^\/belege\/[0-9a-f-]{36}$/.test(h));
  expect(ziel, "eine bestehende Rechnung in der Liste").toBeTruthy();
  await page.locator(`a[href="${ziel}"]`).first().click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await expect(page.getByText(/Etwas ist schiefgelaufen/)).toHaveCount(0);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});

test("Chef am Handy: alle Hauptseiten mit Echtdaten ohne Fehler", async ({ browser }) => {
  test.setTimeout(150_000); // ~20 Seiten, grün in ~15 s
  const page = await handySeite(browser);
  await anmelden(page, await konto("chef"));
  const w = await durchklicken(page);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await page.context().close();
});

test("Monteur am Handy: seine Seiten ohne Fehler", async ({ browser }) => {
  const page = await handySeite(browser);
  const w = wache(page);
  await anmelden(page, await konto("monteur"));
  for (const pfad of ["/", "/zeiten", "/kalender", "/regie", "/erstaufnahmen", "/lieferscheine", "/einstellungen", "/wuensche"]) {
    await page.goto(pfad);
    await expect(page.locator("h1:visible").first(), pfad).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
  }
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await page.context().close();
});
