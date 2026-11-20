// Grundablauf Regiebericht (20.11.2026): der Monteur schreibt am Handy zum Projekt einen Regiebericht
// (Arbeiten, 2 h, freie Materialzeile), der Kunde unterschreibt am Gerät. Danach: unterschrieben in der
// Datenbank, Stunden und Material hängen am Bericht, Unterschriftsbild im Speicher, Bericht festgeschrieben,
// das PDF enthält Kunde, Arbeiten und Unterzeichner.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { admin, als, anmelden, handySeite, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Monteur: Regiebericht am Handy mit Kundenunterschrift, danach fest und als PDF", async ({ browser }) => {
  const monteur = await konto("monteur");
  const p = await testProjekt("Regie");
  const arbeiten = `${LAUF} Steckdose getauscht, FI geprüft.`;
  const page = await handySeite(browser);
  const w = wache(page);
  await anmelden(page, monteur);

  await page.goto(`/regie/neu?projekt=${p.projektId}`);
  await page.getByLabel("Durchgeführte Arbeiten").fill(arbeiten);
  await page.getByRole("button", { name: "2 h", exact: true }).first().click();
  await page.getByRole("button", { name: "Frei", exact: true }).click();
  await page.locator("#fp-bez").fill(`${LAUF} Abzweigdose`);
  await page.locator("#fp-menge").fill("3");
  await page.getByRole("button", { name: "Hinzufügen" }).click();

  await page.getByRole("button", { name: /Unterschreiben lassen/ }).click();
  await page.locator("#ku-name").fill(`${LAUF} Kundin`);
  await page.getByRole("button", { name: /Weiter zur Unterschrift/ }).click();
  const feld = (await page.getByLabel("Unterschriftsfeld").boundingBox())!;
  await page.mouse.move(feld.x + feld.width * 0.15, feld.y + feld.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i < 20; i++) await page.mouse.move(feld.x + feld.width * (0.15 + i * 0.03), feld.y + feld.height * (0.6 - 0.25 * Math.sin(i / 2)));
  await page.mouse.up();
  await page.getByRole("button", { name: /Unterschrift bestätigen/ }).click();
  await expect(page.getByText("Unterschrieben", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  // Datenbank
  const { data: rb } = await admin.from("regieberichte").select("*").eq("projekt_id", p.projektId).single();
  expect(rb.status).toBe("unterschrieben");
  expect(rb.unterschrift_name).toBe(`${LAUF} Kundin`);
  expect(rb.arbeiten).toBe(arbeiten);
  expect(rb.nummer).toBeTruthy();
  const { data: z } = await admin.from("zeiten").select("stunden, user_id, projekt_id").eq("regiebericht_id", rb.id);
  expect(z).toEqual([{ stunden: 2, user_id: monteur.id, projekt_id: p.projektId }]);
  const { data: mb } = await admin.from("material_buchungen").select("menge, bezeichnung").eq("regiebericht_id", rb.id);
  expect(mb?.map((m) => [Number(m.menge), m.bezeichnung])).toEqual([[3, `${LAUF} Abzweigdose`]]);
  const ordner = path.posix.dirname(rb.unterschrift_pfad);
  const { data: dateien } = await admin.storage.from("projekt-dateien").list(ordner);
  expect(dateien?.some((d) => d.name === path.posix.basename(rb.unterschrift_pfad)), "Unterschriftsbild im Speicher").toBe(true);

  // Festgeschrieben: der Monteur ändert nichts mehr
  const db = await als(monteur);
  await db.from("regieberichte").update({ arbeiten: "nachträglich" }).eq("id", rb.id);
  await db.from("zeiten").update({ stunden: 5 }).eq("regiebericht_id", rb.id);
  const { data: nachher } = await admin.from("regieberichte").select("arbeiten").eq("id", rb.id).single();
  const { data: zNachher } = await admin.from("zeiten").select("stunden").eq("regiebericht_id", rb.id).single();
  expect(nachher.arbeiten).toBe(arbeiten);
  expect(zNachher.stunden).toBe(2);

  // PDF am Handy
  await page.goto(`/regie/${rb.id}`);
  await expect(page.getByText(arbeiten).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: /PDF teilen/ }).first().click(),
  ]);
  const pdf = path.join(os.tmpdir(), `zzgt-regie-${Date.now()}.pdf`);
  await download.saveAs(pdf);
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
  expect(text).toContain(p.name);
  expect(text).toContain(rb.nummer);
  expect(text).toContain(`${LAUF} Abzweigdose`);
  expect(text).toContain(`${LAUF} Kundin`);

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
  await page.context().close();
  // Unterschriebenes bleibt (festgeschrieben, Unterschriften nicht löschbar) — eindeutiger Name je Lauf.
});
