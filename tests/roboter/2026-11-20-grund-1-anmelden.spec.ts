// Grundablauf Anmelden (20.11.2026): Chef und Monteur (Kopien der echten SETEC-Konten) kommen auf die
// Startseite = Menü, Büro und Lehrling (eingebaute Rollen) ebenso; falsches Passwort bleibt auf der
// Anmeldung; ohne Anmeldung führt jede Seite zur Anmeldung.
import { expect, test } from "@playwright/test";
import { anmelden, handySeite, konto, nurTestumgebung, wache, type Rolle } from "./grundtest-hilfe";

nurTestumgebung();

for (const rolle of ["chef", "monteur", "buero", "lehrling"] as Rolle[]) {
  test(`${rolle}: Anmelden am Handy führt auf die Startseite mit Menü`, async ({ browser }) => {
    const page = await handySeite(browser);
    const w = wache(page);
    await anmelden(page, await konto(rolle));
    await expect(page).toHaveURL(/\/$/);
    // Die Startseite ist am Handy das Menü: große Karten „… öffnen“
    await expect(page.getByText("Stunden öffnen").first()).toBeVisible();
    await expect(page.getByText("Regieberichte öffnen").first()).toBeVisible();
    await expect(page.getByText(/Zugang nicht aktiv|Zugang gesperrt/)).toHaveCount(0);
    expect(w.abstuerze).toEqual([]);
    expect(w.abgelehnt).toEqual([]);
    await page.context().close();
  });
}

test("Chef am PC: Seitenleiste mit Büro-Bereichen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, await konto("chef"));
  for (const titel of ["Projekte", "Rechnungen", "Kalender", "Eingangsrechnungen", "Buchhaltung", "Stunden"]) {
    await expect(page.locator("nav[data-menue-gruppe]").getByRole("link", { name: titel, exact: true }).first(), titel).toBeVisible();
  }
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});

test("Falsches Passwort: bleibt auf der Anmeldung, mit Meldung", async ({ page }) => {
  const k = await konto("monteur");
  await page.goto("/auth");
  await page.locator("#benutzer").fill(k.email);
  await page.locator("#password").fill("ganz-falsch-123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Anmeldung fehlgeschlagen")).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});

test("Ohne Anmeldung: jede Seite führt zur Anmeldung", async ({ page }) => {
  for (const pfad of ["/", "/zeiten", "/projekte", "/rechnungen", "/eingang", "/regie/neu"]) {
    await page.goto(pfad);
    await expect(page, pfad).toHaveURL(/\/auth$/);
  }
});
