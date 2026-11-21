// Eigene Anhänge am Angebot (Stefan 21.11.2026): „die PV-Planung (SolarEdge-PDF) als Anhang mit dem Angebot
// versenden“. Chef hängt am fertigen Angebot eine Datei an → steht unter „Anhänge“ und im Mail-Dialog,
// `angebot_datenblaetter` (prüft die Mail-Function) gibt sie frei, der Kunde lädt sie über den Bestätigungslink
// (ohne Link nicht), der Monteur sieht weder Zeile noch Datei. Entfernen löscht Zeile und Datei.
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";
import { umgebung } from "./umgebung";

nurTestumgebung();

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test("Chef hängt die PV-Planung ans Angebot — geht mit Mail und Bestätigungslink, Monteur sieht sie nicht", async ({ page }) => {
  const chef = await konto("chef");
  const p = await testProjekt("Anhang");
  const { data: beleg, error } = await admin.from("belege").insert({
    typ: "angebot", status: "offen", nummer: `${LAUF} AN`, kunde_id: p.kundeId, empf_name: p.name, betreff: `${LAUF} PV-Anlage`,
    gueltig_bis: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  }).select("id").single();
  if (error) throw error;
  await admin.from("beleg_positionen").insert({ beleg_id: beleg.id, pos: 1, art: "position", bezeichnung: "PV-Montage", menge: 1, einheit: "Psch", einzelpreis: 100 });

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, chef);
  await page.goto(`/belege/${beleg.id}`);
  const karte = page.getByRole("region", { name: "Anhänge" });
  await expect(karte).toBeVisible({ timeout: 60_000 });
  await karte.locator("input[data-anhang-datei]").setInputFiles({ name: "PV-Planung SolarEdge.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(karte.locator('[data-anhang="eigen"]')).toContainText("PV-Planung SolarEdge.pdf");

  const { data: zeilen } = await admin.from("beleg_anhaenge").select("id, pfad, name").eq("beleg_id", beleg.id);
  expect(zeilen).toHaveLength(1);
  const pfad = zeilen![0].pfad;
  expect(pfad).toMatch(new RegExp(`^angebot/${beleg.id}/`));

  // Mail-Function nimmt nur, was angebot_datenblaetter freigibt
  const { data: frei } = await admin.rpc("angebot_datenblaetter", { p_beleg: beleg.id });
  expect((frei as { pfad: string }[]).map((d) => d.pfad)).toContain(pfad);

  // Mail-Dialog: Anhang angehakt, Text nennt ihn
  await page.getByRole("button", { name: "Per E-Mail" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("PV-Planung SolarEdge.pdf")).toBeVisible();
  await expect(dialog.getByText("eigener Anhang")).toBeVisible();
  await expect(dialog.locator("#mail-text")).toHaveValue(/samt Anhang|weiteren Anhang/);
  await page.keyboard.press("Escape");

  // Kunde (anon): ohne Link nicht, mit Link schon
  const U = umgebung();
  const kunde = createClient(U.api, U.anon, { auth: { persistSession: false } });
  const ohne = await kunde.storage.from("projekt-dateien").download(pfad);
  expect(ohne.data).toBeNull();
  const chefDb = await als(chef);
  const { data: token, error: eL } = await chefDb.rpc("angebot_link_erstellen", { p_beleg: beleg.id });
  if (eL) throw eL;
  const { data: oeffentlich } = await kunde.rpc("angebot_oeffentlich", { p_token: token });
  expect(((oeffentlich as { datenblaetter: { pfad: string }[] }).datenblaetter).map((d) => d.pfad)).toContain(pfad);
  const mit = await kunde.storage.from("projekt-dateien").download(pfad);
  expect(mit.error).toBeNull();
  expect((await mit.data!.text()).startsWith("%PDF")).toBe(true);

  // Monteur: weder Zeile noch Datei — auch wenn ein Kundenlink besteht
  const monteur = await als(await konto("monteur"));
  const { data: mz } = await monteur.from("beleg_anhaenge").select("id").eq("beleg_id", beleg.id);
  expect(mz ?? []).toHaveLength(0);
  const md = await monteur.storage.from("projekt-dateien").list(`angebot/${beleg.id}`);
  expect(md.data ?? []).toHaveLength(0);

  // Entfernen: Zeile und Datei weg
  page.once("dialog", (d) => void d.accept());
  await page.reload();
  await karte.getByRole("button", { name: "PV-Planung SolarEdge.pdf entfernen" }).click();
  await expect(karte.locator('[data-anhang="eigen"]')).toHaveCount(0);
  const { data: rest } = await admin.from("beleg_anhaenge").select("id").eq("beleg_id", beleg.id);
  expect(rest).toHaveLength(0);
  const { data: dateiRest } = await admin.storage.from("projekt-dateien").list(`angebot/${beleg.id}`);
  expect(dateiRest ?? []).toHaveLength(0);

  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});
