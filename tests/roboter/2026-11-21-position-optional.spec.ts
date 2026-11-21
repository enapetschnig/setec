// Optional/alternativ (Stefan 21.11.2026): „eine Position als alternativ oder optional setzen — der Preis soll
// ersichtlich sein, aber nicht in die Kalkulation und die Summe einfließen“. Chef markiert im Angebot eine Zeile
// über das Zeilenmenü → Betrag in Klammern, Summe ohne sie; gespeichert: variante, gesamt 0, Netto ohne sie (auch
// nach dem Fertigstellen in der Datenbank). Der Kunde sieht sie beim Bestätigungslink mit Hinweis, im Gesamtbetrag
// nicht. In einer Rechnung gibt es das nicht (Trigger).
import { expect, test } from "@playwright/test";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

test("Chef: Position optional — Preis steht da, Summe ohne sie, auch beim Kunden", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Optional");
  const { data: beleg, error } = await admin.from("belege").insert({
    typ: "angebot", status: "entwurf", kunde_id: p.kundeId, empf_name: p.name, betreff: `${LAUF} PV mit Speicher`, ust_satz: 20,
  }).select("id").single();
  if (error) throw error;
  const { error: eP } = await admin.from("beleg_positionen").insert([
    { beleg_id: beleg.id, pos: 1, art: "leistung", bezeichnung: `${LAUF} PV-Montage`, menge: 2, einheit: "Stk", einzelpreis: 100 },
    { beleg_id: beleg.id, pos: 2, art: "leistung", bezeichnung: `${LAUF} Speicher`, menge: 1, einheit: "Set", einzelpreis: 5000 },
  ]);
  if (eP) throw eP;

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/${beleg.id}`);
  const zeile = page.getByRole("row").filter({ has: page.getByLabel("Bezeichnung 2", { exact: true }) });
  await expect(zeile).toBeVisible({ timeout: 60_000 });
  await zeile.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Als optional/ }).click();
  await expect(zeile.locator('[data-variante="optional"]')).toContainText("nicht in der Summe");
  await expect(zeile).toContainText(/\(€\s5\.000,00\)/);
  await expect(page.getByText(/Summe netto/).first().locator("..")).toContainText(/€\s200,00/);

  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => (await admin.from("belege").select("netto").eq("id", beleg.id).single()).data?.netto).toBe(200);
  const { data: pos } = await admin.from("beleg_positionen").select("pos, variante, gesamt").eq("beleg_id", beleg.id).order("pos");
  expect(pos?.map((x) => [x.variante, Number(x.gesamt)])).toEqual([[null, 200], ["optional", 0]]);

  // Fertigstellen rechnet in der Datenbank — dort zählt sie auch nicht
  const chefDb = await als(chef);
  const { error: eF } = await chefDb.rpc("beleg_fertigstellen", { p_id: beleg.id });
  if (eF) throw eF;
  const { data: fertig } = await admin.from("belege").select("netto, brutto, status").eq("id", beleg.id).single();
  expect([fertig?.status, Number(fertig?.netto), Number(fertig?.brutto)]).toEqual(["offen", 200, 240]);

  // Kunde: Betrag in Klammern mit Hinweis, Gesamtbetrag ohne
  const { data: token, error: eL } = await chefDb.rpc("angebot_link_erstellen", { p_beleg: beleg.id });
  if (eL) throw eL;
  const kunde = await page.context().browser()!.newPage();
  await kunde.goto(`/angebot/${token}`);
  const positionen = kunde.getByRole("region", { name: "Positionen" });
  await expect(positionen.locator('[data-variante="optional"]')).toContainText("nicht im Gesamtbetrag enthalten", { timeout: 30_000 });
  await expect(positionen).toContainText(/\(€\s5\.000,00\)/);
  await expect(kunde.getByText(/€\s240,00/).first()).toBeVisible();
  await kunde.close();

  // In einer Rechnung gibt es optional/alternativ nicht
  const { data: re } = await admin.from("belege").insert({ typ: "rechnung", status: "entwurf", empf_name: p.name }).select("id").single();
  const { error: eR } = await admin.from("beleg_positionen").insert({ beleg_id: re!.id, pos: 1, art: "leistung", bezeichnung: "x", menge: 1, einzelpreis: 1, variante: "optional" });
  expect(eR?.message).toContain("nur im Angebot");
  await admin.from("belege").delete().eq("id", re!.id);

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});

test("Chef: fertiges Angebot ändern → Alternative; PDF zeigt sie in Klammern; Kopie nimmt Anhänge mit", async ({ page }) => {
  const chef = await konto("chef");
  const chefDb = await als(chef);
  const p = await testProjekt("Alternativ");
  const { data: beleg, error } = await admin.from("belege").insert({
    typ: "angebot", status: "entwurf", kunde_id: p.kundeId, empf_name: p.name, betreff: `${LAUF} Wallbox`, ust_satz: 20,
  }).select("id").single();
  if (error) throw error;
  // Sammel-Insert: jede Zeile mit denselben Feldern (sonst NULL statt Standard)
  const { error: eP } = await admin.from("beleg_positionen").insert([
    { beleg_id: beleg.id, pos: 1, art: "titel", bezeichnung: "Wallbox", menge: 1, einheit: "Stk", einzelpreis: 0 },
    { beleg_id: beleg.id, pos: 2, art: "leistung", bezeichnung: `${LAUF} Wallbox 11 kW`, menge: 1, einheit: "Stk", einzelpreis: 1000 },
    { beleg_id: beleg.id, pos: 3, art: "leistung", bezeichnung: `${LAUF} Wallbox 22 kW`, menge: 1, einheit: "Stk", einzelpreis: 1500 },
  ]);
  if (eP) throw eP;
  const { error: eF } = await chefDb.rpc("beleg_fertigstellen", { p_id: beleg.id });
  if (eF) throw eF;
  const { data: token } = await chefDb.rpc("angebot_link_erstellen", { p_beleg: beleg.id });
  // ein eigener Anhang (Wunsch 1) — die Kopie soll ihn mitnehmen
  const pfad = `angebot/${beleg.id}/zz-plan.pdf`;
  await admin.storage.from("projekt-dateien").upload(pfad, Buffer.from("%PDF-1.4\n%%EOF\n"), { contentType: "application/pdf" });
  await admin.from("beleg_anhaenge").insert({ beleg_id: beleg.id, name: "PV-Planung.pdf", pfad, groesse: 15 });

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/${beleg.id}`);
  // so geht es am offenen Angebot: ⋮ → „Angebot ändern“ → Ändern
  await page.locator("header").getByRole("button", { name: "Weitere Aktionen" }).click({ timeout: 60_000 });
  await page.getByRole("menuitem", { name: "Angebot ändern" }).click();
  await page.getByRole("button", { name: "Ändern", exact: true }).click();
  const zeile = page.getByRole("row").filter({ has: page.getByLabel("Bezeichnung 1.2", { exact: true }) });
  await zeile.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Als Alternative/ }).click();
  await expect(zeile.locator('[data-variante="alternativ"]')).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => Number((await admin.from("belege").select("netto").eq("id", beleg.id).single()).data?.netto)).toBe(1000);
  const { data: b } = await admin.from("belege").select("status, brutto").eq("id", beleg.id).single();
  expect([b?.status, Number(b?.brutto)]).toEqual(["offen", 1200]);

  // PDF vom Bestätigungslink: „Alternativ:“, Betrag in Klammern, Summe ohne
  const kunde = await page.context().browser()!.newPage();
  await kunde.goto(`/angebot/${token}`);
  const [dl] = await Promise.all([kunde.waitForEvent("download"), kunde.getByRole("button", { name: "Angebot als PDF" }).click()]);
  const datei = test.info().outputPath("angebot-alternativ.pdf");
  await dl.saveAs(datei);
  await kunde.close();
  const { execFileSync } = await import("node:child_process");
  const text = execFileSync("pdftotext", ["-layout", datei, "-"], { encoding: "utf8" });
  expect(text).toMatch(/Alternativ: .*Wallbox 22 kW/);
  expect(text).toContain("(1.500,00)");
  expect(text).toContain("Nicht in der Gesamtsumme enthalten.");
  expect(text).toMatch(/1\.200,00/);
  expect(text).not.toMatch(/2\.500,00|3\.000,00/);

  // Kopieren (neuer Entwurf): Markierung und Anhang gehen mit
  await page.locator("header").getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Kopieren/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(beleg.id) && /\/belege\/[0-9a-f-]{36}$/.test(u.pathname));
  const kopie = page.url().match(/belege\/([0-9a-f-]{36})/)![1];
  const { data: kp } = await admin.from("beleg_positionen").select("variante").eq("beleg_id", kopie).order("pos");
  expect(kp?.map((x) => x.variante)).toEqual([null, null, "alternativ"]);
  const { data: ka } = await admin.from("beleg_anhaenge").select("name, pfad").eq("beleg_id", kopie);
  expect(ka?.map((x) => x.name)).toEqual(["PV-Planung.pdf"]);
  expect((await admin.storage.from("projekt-dateien").download(ka![0].pfad)).error).toBeNull();

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
