// Stefan 24.11.2026: „Kann man die Leiste um einiges breiter machen? Ich kann bei sehr vielen Artikeln nur einen
// kurzen Teil lesen, was die Auswahl erschwert.“ Die Trefferliste beim Tauschen in der Zeile war so breit wie das
// Bezeichnungsfeld (mind. 26rem) und schnitt Namen nach einer Zeile ab. Jetzt bis 52rem breit, Namen bis 2 Zeilen,
// und sie bleibt im Fenster.
import { expect, test } from "@playwright/test";
import { admin, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

const LANG = "Professionelle Reinigung der PV Anlage inkl. Sichtprüfung der Module und Unterkonstruktion mit Bericht";

test("PC: Trefferliste beim Tauschen ist breit, lange Namen sind lesbar und bleiben im Fenster", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Tausch breit");
  const name = `${LAUF}B ${LANG}`;
  const { error } = await admin.from("artikel").insert({
    lieferant: `${LAUF} Lief`, artikelnummer: `${LAUF}B-1`, bezeichnung: name, einheit: "Stk", ek_preis: 100, vk_preis: 200,
  });
  if (error) throw error;

  for (const breite of [1440, 1024]) {
    await page.setViewportSize({ width: breite, height: 900 });
    if (breite === 1440) {
      wache(page);
      await anmelden(page, chef);
    }
    await page.goto(`/belege/neu?typ=angebot&projekt=${p.projektId}`);
    const eingabe = page.getByPlaceholder(/Position eingeben/);
    await expect(eingabe).toBeVisible({ timeout: 60_000 });
    await eingabe.fill("1 Freitext Zeile");
    await eingabe.press("Enter");
    const feld = page.getByLabel("Bezeichnung 1", { exact: true });
    await expect(feld).toBeVisible();
    await feld.fill(`${LAUF}B Professionelle`);

    const liste = page.getByRole("listbox", { name: "Position ersetzen durch" });
    const treffer = liste.getByRole("option").filter({ hasText: `${LAUF}B-1` });
    await expect(treffer).toBeVisible({ timeout: 20_000 });

    const kasten = (await liste.locator("xpath=..").boundingBox())!;
    const feldKasten = (await feld.boundingBox())!;
    expect(kasten.width).toBeGreaterThan(Math.min(700, breite - 300));
    expect(kasten.width).toBeGreaterThan(feldKasten.width * 1.3);
    expect(kasten.x).toBeGreaterThanOrEqual(0);
    expect(kasten.x + kasten.width).toBeLessThanOrEqual(breite);

    // Der ganze Name steht da (höchstens 2 Zeilen, nicht abgeschnitten)
    const text = treffer.getByTitle(name);
    await expect(text).toHaveText(name);
    const abgeschnitten = await text.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    expect(abgeschnitten).toBe(false);
    if (process.env.BILD) await page.screenshot({ path: `test-results/tausch-breit-${breite}.png` });
    await feld.press("Escape");
  }
});
