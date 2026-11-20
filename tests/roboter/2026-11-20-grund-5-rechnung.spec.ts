// Grundablauf Rechnung (20.11.2026): der Chef am PC übernimmt die Stunden eines Projekts in eine Rechnung,
// speichert den Entwurf (noch ohne Nummer), stellt fertig (Nummer RE-JJJJ-NNN, Stunden an der Quelle
// verrechnet und festgeschrieben, PDF abgelegt) und lädt das PDF — es ist genau das abgelegte Original.
// Fertige Rechnungen lassen sich nicht löschen → eigenes Projekt mit eindeutigem Namen je Lauf.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Rechnung aus dem Projekt, fertigstellen, PDF = abgelegtes Original", async ({ page }) => {
  const chef = await konto("chef");
  const monteur = await konto("monteur");
  const p = await testProjekt("Rechnung");
  const gestern = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { error: eZeit } = await admin.from("zeiten").insert({
    projekt_id: p.projektId, user_id: monteur.id, datum: gestern, stunden: 3, taetigkeit: `${LAUF} Verteiler gesetzt`,
  });
  if (eZeit) throw eZeit;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/neu?typ=rechnung&projekt=${p.projektId}&import=1`);
  const uebernehmen = page.getByRole("button", { name: /übernehmen · €/ });
  await expect(uebernehmen).toBeVisible({ timeout: 60_000 }); // erster Aufruf: vite übersetzt den Beleg-Editor erst
  await expect(page.getByRole("dialog").getByText(/Stunden/).first()).toBeVisible();
  await page.locator("#imp-satz").fill("65");
  await expect(uebernehmen).toHaveText(/€\s195,00/);
  await uebernehmen.click();
  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await page.waitForURL(/\/belege\/[0-9a-f-]{36}$/);
  const belegId = page.url().match(/belege\/([0-9a-f-]{36})/)![1];

  const { data: entwurf } = await admin.from("belege").select("status, nummer, typ, projekt_id").eq("id", belegId).single();
  expect(entwurf).toMatchObject({ status: "entwurf", typ: "rechnung", projekt_id: p.projektId });
  expect(entwurf.nummer ?? "").toBe("");
  const { data: pos } = await admin.from("beleg_positionen").select("menge, einheit, einzelpreis, gesamt").eq("beleg_id", belegId);
  expect(pos?.map((x) => [Number(x.menge), x.einheit, Number(x.einzelpreis), Number(x.gesamt)]), "3 h à 65 € auf der Rechnung").toEqual([[3, "h", 65, 195]]);
  const { data: zeit } = await admin.from("zeiten").select("id, rechnung_id").eq("projekt_id", p.projektId).single();
  expect(zeit.rechnung_id, "Stunde an der Quelle verrechnet").toBe(belegId);

  // Fertigstellen
  await page.locator("header").getByRole("button", { name: "Fertigstellen", exact: true }).click();
  const frage = page.getByRole("alertdialog");
  await expect(frage.getByText("Rechnung fertigstellen?")).toBeVisible();
  await expect(frage.getByText(/€\s234,00/)).toBeVisible(); // 195 netto + 20 % USt
  await frage.getByRole("button", { name: "Fertigstellen", exact: true }).click();
  await expect(page.getByText(/ist fertig\./).first()).toBeVisible({ timeout: 20_000 });
  const { data: re } = await admin.from("belege").select("nummer, status").eq("id", belegId).single();
  expect(re.nummer).toMatch(/^RE-\d{4}-\d{3,}$/);
  expect(re.status).toBe("offen");

  // Festgeschrieben — auch für den Chef
  const db = await als(chef);
  expect((await db.from("belege").update({ betreff: "nachträglich" }).eq("id", belegId)).error, "fertige Rechnung fest").not.toBeNull();
  expect((await db.from("zeiten").update({ stunden: 9 }).eq("id", zeit.id)).error, "verrechnete Stunde fest").not.toBeNull();

  // Abgelegtes Original und PDF-Knopf
  let archiv: Buffer | null = null;
  await expect.poll(async () => {
    const { data } = await admin.storage.from("beleg-archiv").download(`${belegId}.pdf`);
    archiv = data ? Buffer.from(await data.arrayBuffer()) : null;
    return !!archiv;
  }, { message: "PDF beim Fertigstellen abgelegt" }).toBe(true);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: "PDF", exact: true }).first().click(),
  ]);
  const datei = path.join(os.tmpdir(), `zzgt-rechnung-${Date.now()}.pdf`);
  await download.saveAs(datei);
  expect(archiv!.equals(fs.readFileSync(datei)), "PDF-Knopf liefert das abgelegte Original").toBe(true);
  const text = execFileSync("pdftotext", ["-layout", datei, "-"], { encoding: "utf8" });
  expect(text).toContain(re.nummer);
  expect(text).toContain(p.nummer);

  // In der Rechnungsliste
  await page.goto("/rechnungen");
  await expect(page.getByText(re.nummer).first()).toBeVisible();
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
