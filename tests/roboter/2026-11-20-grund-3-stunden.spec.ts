// Grundablauf Stunden (20.11.2026): der Monteur bucht am Handy über die Startseite 4 h auf ein Projekt
// „In Arbeit“ — die Buchung steht danach mit ihm, dem Projekt und der Tätigkeit in der Datenbank und in
// „Stunden“. Ein Projekt, das noch Angebot ist, wird gar nicht angeboten (Wunsch 12.11.: nur buchbare Projekte).
import { expect, test } from "@playwright/test";
import { admin, anmelden, handySeite, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Monteur bucht 4 h am Handy auf ein Projekt „In Arbeit“", async ({ browser }) => {
  const monteur = await konto("monteur");
  const p = await testProjekt("Stunden");
  const { data: angebot } = await admin.from("projekte").insert({ name: `${LAUF} Noch Angebot`, kunde_id: p.kundeId, status: "angebot" }).select("id").single();
  const taetigkeit = `${LAUF} Leitungen eingezogen`;
  try {
    const page = await handySeite(browser);
    const w = wache(page);
    await anmelden(page, monteur);
    await page.getByRole("button", { name: /Stunden.*buchen/ }).first().click();

    // Projekt wählen: das „Angebot“-Projekt ist nicht dabei, das „In Arbeit“ schon
    await page.locator("#z-projekt").click();
    const suche = page.getByPlaceholder("Nummer, Name, Kunde oder Ort tippen …");
    await suche.fill(LAUF);
    await expect(page.getByRole("option", { name: new RegExp(`${LAUF} Stunden`) })).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(`${LAUF} Noch Angebot`) })).toHaveCount(0);
    await page.getByRole("option", { name: new RegExp(`${LAUF} Stunden`) }).click();

    const stundenModus = page.getByRole("button", { name: "Stunden", exact: true });
    if (await stundenModus.count()) await stundenModus.click();
    await page.getByRole("button", { name: "4 h", exact: true }).click();
    await page.locator("#z-taetigkeit").fill(taetigkeit);
    await page.getByRole("button", { name: /4 h buchen/ }).click();

    await expect.poll(async () => {
      const { data } = await admin.from("zeiten").select("stunden, user_id, taetigkeit").eq("projekt_id", p.projektId);
      return data ?? [];
    }, { message: "Buchung in der Datenbank" }).toEqual([{ stunden: 4, user_id: monteur.id, taetigkeit }]);

    // In „Stunden“ steht die Buchung
    await page.goto("/zeiten");
    await expect(page.getByText(taetigkeit).first()).toBeVisible();
    expect(w.abstuerze).toEqual([]);
    expect(w.abgelehnt).toEqual([]);
    await page.context().close();
  } finally {
    await admin.from("zeiten").delete().eq("projekt_id", p.projektId);
    await admin.from("projekte").delete().in("id", [p.projektId, angebot?.id].filter(Boolean));
    await admin.from("kunden").delete().eq("id", p.kundeId);
  }
});
