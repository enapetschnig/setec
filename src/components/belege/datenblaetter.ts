import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ANHANG_MAX, anhangPfad, DATEIEN_BUCKET, datenblaetterOrdnen, sichtbarkeitLesen, type Datenblatt } from "./datenblattLogik";

export { ANHANG_TYPEN, artikelIdsVon, DATEIEN_BUCKET, fuerKunden, paketNamen, type Datenblatt } from "./datenblattLogik";

/**
 * Datenblätter der Artikel im Angebot — als Anhang zum Angebot.
 * Abgelegt werden sie am Artikel (Tabelle `artikel_dateien`, Speicher
 * `projekt-dateien`, Pfad `artikel/<artikel_id>/…`). Schlägt die Abfrage
 * fehl, gibt es eben keine Anhänge — kein Fehler.
 */

/**
 * `namen`: Artikel-ID → Bezeichnung (aus dem Angebot). Liefert alle
 * Datenblätter samt Sichtbarkeit — was davon zum Kunden darf, entscheidet
 * `fuerKunden` (intern nie, „nach Auftrag“ erst bei Annahme).
 */
export function useDatenblaetter(artikelIds: string[], namen: Map<string, string>, aktiv = true) {
  return useQuery({
    queryKey: ["artikel_dateien", "datenblaetter", artikelIds.join(",")],
    enabled: aktiv && artikelIds.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Datenblatt[]> => {
      const { data, error } = await supabase
        .from("artikel_dateien")
        .select("id, artikel_id, name, pfad, sichtbar")
        .in("artikel_id", artikelIds.slice(0, 300))
        .eq("art", "datenblatt");
      if (error) return [];
      return datenblaetterOrdnen((data ?? []).map((d) => ({
        id: d.id, artikel_id: d.artikel_id, name: d.name || d.pfad.split("/").pop() || "Datenblatt", pfad: d.pfad,
        artikel: namen.get(d.artikel_id) ?? null, sichtbar: sichtbarkeitLesen(d.sichtbar),
      })));
    },
  });
}

export async function datenblattLaden(pfad: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(DATEIEN_BUCKET).download(pfad);
  if (error || !data) throw new Error(`Datenblatt nicht geladen: ${error?.message ?? "unbekannt"}`);
  return data;
}

/** Angebot + Datenblätter als ZIP (fflate, ohne Komprimierung — PDFs sind schon gepackt) */
export async function paketZip(dateien: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const inhalt: Record<string, Uint8Array> = {};
  for (const d of dateien) inhalt[d.name] = new Uint8Array(await d.blob.arrayBuffer());
  const zip = zipSync(inhalt, { level: 0 });
  return new Blob([zip], { type: "application/zip" });
}

/**
 * Eigene Anhänge am Angebot (Tabelle `beleg_anhaenge`, Speicher
 * `projekt-dateien/angebot/<beleg_id>/…`) — z. B. die PV-Planung. Gehen immer
 * mit dem Angebot mit (Mail, Bestätigungslink über `angebot_datenblaetter`).
 */
export function useAngebotAnhaenge(belegId: string, aktiv = true) {
  return useQuery({
    queryKey: ["beleg_anhaenge", belegId],
    enabled: aktiv,
    queryFn: async (): Promise<Datenblatt[]> => {
      const { data, error } = await supabase.from("beleg_anhaenge").select("id, name, pfad").eq("beleg_id", belegId).order("created_at").order("id");
      if (error) throw error;
      return (data ?? []).map((a) => ({ id: a.id, name: a.name, pfad: a.pfad, artikel: null, sichtbar: "angebot", eigen: true }));
    },
  });
}

export async function anhangHochladen(belegId: string, datei: File): Promise<void> {
  const istPdf = datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
  const istBild = /^image\/(jpeg|png|webp)$/.test(datei.type) || /\.(jpe?g|png|webp)$/i.test(datei.name);
  if (!istPdf && !istBild) throw new Error(`„${datei.name}“: nur PDF oder Foto (JPG, PNG) geht als Anhang.`);
  if (datei.size > ANHANG_MAX) throw new Error(`„${datei.name}“ ist größer als 15 MB — so groß nimmt sie keine Mail.`);
  const pfad = anhangPfad(belegId, datei.name, crypto.randomUUID().slice(0, 8));
  const typ = datei.type || (istPdf ? "application/pdf" : "image/jpeg");
  const { error: eS } = await supabase.storage.from(DATEIEN_BUCKET).upload(pfad, datei, { contentType: typ, upsert: false });
  if (eS) throw new Error(`„${datei.name}“ nicht hochgeladen: ${eS.message}`);
  const { error } = await supabase.from("beleg_anhaenge").insert({ beleg_id: belegId, name: datei.name.slice(0, 200), pfad, groesse: datei.size });
  if (error) {
    await supabase.storage.from(DATEIEN_BUCKET).remove([pfad]).catch(() => undefined);
    throw new Error(`„${datei.name}“ nicht angehängt: ${error.message}`);
  }
}

export async function anhangLoeschen(a: { id?: string; pfad: string }): Promise<void> {
  const { data, error } = await supabase.from("beleg_anhaenge").delete().eq("id", a.id!).select("id");
  if (error) throw new Error(`Anhang nicht entfernt: ${error.message}`);
  if (!data?.length) throw new Error("Anhang nicht entfernt.");
  await supabase.storage.from(DATEIEN_BUCKET).remove([a.pfad]).catch(() => undefined);
}
