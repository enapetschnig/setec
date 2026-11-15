import { supabase } from "@/integrations/supabase/client";

/**
 * Fertige Rechnungen als PDF aufbewahren — genau so, wie sie verschickt
 * wurden. Neu erzeugt sähe eine alte Rechnung nach einer Änderung im Betrieb
 * (Bank, Anschrift, Logo) oder am Projekt anders aus.
 *
 * Speicher „beleg-archiv“, Datei <beleg-id>.pdf. Die Policies erlauben das
 * Ablegen nur für fertige Rechnungen, nie das Überschreiben und das Löschen
 * erst, wenn die Rechnung weg ist (Migration 20261025170000_beleg_archiv.sql).
 * Nach „Rechnung ändern“ kommt jede neue Fassung daneben: <id>-1.pdf, <id>-2.pdf …
 * (`belege.archiv_stand`, Migration 20261115100000_rechnung_aendern.sql).
 */
const BUCKET = "beleg-archiv";

export const archivPfad = (belegId: string, stand = 0) => `${belegId}${stand > 0 ? `-${stand}` : ""}.pdf`;

async function aktuellerPfad(belegId: string): Promise<string> {
  const { data } = await supabase.from("belege").select("archiv_stand").eq("id", belegId).maybeSingle();
  return archivPfad(belegId, data?.archiv_stand ?? 0);
}

/** Das abgelegte Original der aktuellen Fassung — null, wenn (noch) keins da ist */
export async function archivLaden(belegId: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(await aktuellerPfad(belegId));
  return error ? null : data;
}

/** Ablegen. Liegt schon eins da, bleibt das erste — true heißt: im Archiv. */
export async function archivieren(belegId: string, pdf: Blob): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).upload(await aktuellerPfad(belegId), pdf, { contentType: "application/pdf", upsert: false });
  return !error || /already exists|duplicate/i.test(error.message);
}
