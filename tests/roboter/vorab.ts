/**
 * Einmal vor allen Playwright-Tests (globalSetup in playwright.config.ts) — legt das Gemeinsame an, das die
 * Tests danach nur noch lesen. So laufen sie parallel (--workers=4), ohne sich gegenseitig zu stören:
 *  - eigene Konten je Rolle, die die Echtdaten nicht mitbringen (zzgt-…@test.local),
 *  - Grundbestand (je eine Rechnung/Eingangsrechnung/Kategorie, nur in leerer Datenbank),
 *  - Stunden- und Lohnkostensatz der Firma (77 €/h, 38 €/h) für die Rechnungen in den Leistungs-Tests.
 * Kein Test ändert Einstellungen, Nummernkreise oder fremde Daten — nur eigene Zeilen mit LAUF-Präfix.
 * Die Firmenwerte stellt der zurückgegebene Teardown wieder her.
 */
import { admin, grundbestand, kontenAnlegen } from "./grundtest-hilfe";

export const FIRMA_TEST = { stundensatz: 77, kostensatz: 38 };

export default async function vorab() {
  await kontenAnlegen();
  await grundbestand();
  const { data: vorher, error } = await admin.from("firma").select("stundensatz, kostensatz").eq("id", 1).single();
  if (error) throw error;
  const { error: e2 } = await admin.from("firma").update(FIRMA_TEST).eq("id", 1);
  if (e2) throw e2;
  return async () => {
    await admin.from("firma").update({ stundensatz: vorher.stundensatz ?? 0, kostensatz: vorher.kostensatz ?? null }).eq("id", 1);
  };
}
