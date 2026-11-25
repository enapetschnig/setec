// Nachtschicht-Gegenprobe 25.11.2026: Die Trefferliste beim Tauschen in der Zeile (BezeichnungSuche, Radix-Popover)
// trug role="dialog" → Strg+S im Beleg-Editor hielt sie für einen offenen Dialog und speicherte nicht, solange man tippte.
// Jetzt speichert Strg+S den getippten Text, auch wenn die Liste offen ist (ohne einen Treffer zu wählen).
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("PC: Strg+S speichert, während die Trefferliste in der Bezeichnung offen ist", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Strg S Trefferliste");
  const { error } = await admin.from("artikel").insert({
    lieferant: `${LAUF} Lief`, artikelnummer: `${LAUF}S-0`, bezeichnung: `${LAUF} S Kabel NYM`, langtext: "",
    einheit: "Stk", ek_preis: 5, vk_preis: 10,
  });
  if (error) throw error;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
  const eingabe = page.getByPlaceholder(/Position eingeben/);
  await expect(eingabe).toBeVisible({ timeout: 60_000 });
  await eingabe.fill(`3 ${LAUF} S Kabel`);
  await page.getByRole("option").filter({ hasText: `${LAUF}S-0` }).click();
  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}$/);
  const belegId = page.url().match(/belege\/([0-9a-f-]{36})/)![1];

  const feld = page.getByLabel("Bezeichnung 1", { exact: true });
  await feld.fill(`${LAUF} S Kabel NYM-J 3x1,5`);
  await expect(page.getByRole("listbox", { name: "Position ersetzen durch" })).toBeVisible();
  await feld.press("Control+s");

  await expect.poll(async () =>
    (await admin.from("beleg_positionen").select("bezeichnung").eq("beleg_id", belegId)).data?.map((z) => z.bezeichnung),
  ).toEqual([`${LAUF} S Kabel NYM-J 3x1,5`]);
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
