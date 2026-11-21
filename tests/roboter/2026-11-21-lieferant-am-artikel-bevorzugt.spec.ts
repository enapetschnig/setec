// Stefan 21.11.2026 (Artikel SOLAX Smart Power Sensor): „Ich würde hier auch das selbe Menü brauchen, das ich beim
// unteren Lieferanten öffnen kann. GBC ist unser bevorzugter Lieferant, das kann ich aber nicht anwählen, da dieser der
// Lieferant ‚am Artikel‘ ist.“ → Zeile „am Artikel“ öffnet denselben Dialog, „Bevorzugt bestellen“ speichert
// artikel.lieferant_bevorzugt; höchstens einer ist bevorzugt (Trigger artikel_bevorzugt_einer, in beide Richtungen).
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Lieferant am Artikel als bevorzugt markieren, obwohl ein weiterer günstiger ist", async ({ page }) => {
  const chef = await konto("chef");
  const gbc = `${LAUF} GBC`;
  const em = `${LAUF} Elektromaterial`;
  const { data: art, error: eA } = await admin.from("artikel").insert({
    lieferant: gbc, artikelnummer: `${LAUF}-B`, bezeichnung: `${LAUF} Smart Power Sensor`, einheit: "Stk", ek_preis: 111.3, vk_preis: 150.26,
  }).select("id").single();
  if (eA) throw eA;
  const { data: weiter, error: eW } = await admin.from("artikel_lieferanten").insert({
    artikel_id: art.id, lieferant: em, lieferanten_nr: `${LAUF}-E`, ek_preis: 111, bevorzugt: true,
  }).select("id").single();
  if (eW) throw eW;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/artikel/${art.id}`);
  const zeileGbc = page.getByRole("button").filter({ hasText: gbc });
  await expect(zeileGbc).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button").filter({ hasText: em })).toContainText("bevorzugt");

  // Zeile „am Artikel“ öffnet den Dialog, Preis nur lesbar, „Bevorzugt bestellen“ einschalten
  await zeileGbc.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Lieferant ${gbc}`)).toBeVisible();
  await expect(dialog.getByLabel("EK")).toBeDisabled();
  await dialog.getByRole("switch").click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => (await admin.from("artikel").select("lieferant_bevorzugt").eq("id", art.id).single()).data?.lieferant_bevorzugt).toBe(true);
  // der weitere ist nicht mehr bevorzugt (Trigger)
  expect((await admin.from("artikel_lieferanten").select("bevorzugt").eq("id", weiter.id).single()).data?.bevorzugt).toBe(false);
  await expect(zeileGbc).toContainText("bevorzugt");
  await expect(page.getByRole("button").filter({ hasText: em })).not.toContainText("günstigster");

  // Umgekehrt: weiteren wieder bevorzugen → am Artikel aus
  await page.getByRole("button").filter({ hasText: em }).click();
  await dialog.getByRole("switch").click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await admin.from("artikel").select("lieferant_bevorzugt").eq("id", art.id).single()).data?.lieferant_bevorzugt).toBe(false);
  await expect(page.getByRole("button").filter({ hasText: em })).toContainText("bevorzugt");

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
