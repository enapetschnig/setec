import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alleZeilen } from "@/lib/abfrage";
import { fehlerText } from "@/components/stamm/stammDaten";
import { signierteAdressen } from "@/lib/upload";
import { eaPfad, messwerteBereinigen, ortZerlegen, type Messwert } from "@/lib/erstaufnahme";
import type { Erstaufnahme, ErstaufnahmeFoto, Termin } from "@/lib/types";

/** Speicher: derselbe Bucket wie die Projekt-Dateien — bei der Annahme wird nichts kopiert */
export const EA_BUCKET = "projekt-dateien";

export type EaZeile = Erstaufnahme & { kunden: { name: string; ort: string | null } | null };
export type EaMitFotos = { ea: EaZeile; fotos: ErstaufnahmeFoto[]; urls: Record<string, string> };

const fehler = (text: string, e: { code?: string; message: string } | null | undefined) =>
  new Error(e?.message ? `${text}: ${fehlerText(e)}` : text);

const AUSWAHL = "*, kunden(name, ort)";

export function useErstaufnahmen() {
  return useQuery({
    queryKey: ["erstaufnahmen", "liste"],
    queryFn: async () => {
      const data = await alleZeilen((von, bis) => supabase.from("erstaufnahmen").select(AUSWAHL)
        .order("created_at", { ascending: false }).order("id").range(von, bis));
      return data as unknown as EaZeile[];
    },
  });
}

/** Erstaufnahmen eines Kunden — Block beim Kontakt (Stefan 19.11.2026) */
export function useKundeErstaufnahmen(kundeId: string | null | undefined) {
  return useQuery({
    queryKey: ["erstaufnahmen", "kunde", kundeId],
    enabled: !!kundeId,
    queryFn: async () => {
      const data = await alleZeilen((von, bis) => supabase.from("erstaufnahmen").select(AUSWAHL).eq("kunde_id", kundeId!)
        .order("created_at", { ascending: false }).order("id").range(von, bis));
      return data as unknown as EaZeile[];
    },
  });
}

async function fotosLaden(eaIds: string[]): Promise<{ fotos: ErstaufnahmeFoto[]; urls: Record<string, string> }> {
  if (!eaIds.length) return { fotos: [], urls: {} };
  const { data, error } = await supabase.from("erstaufnahme_fotos").select("*").in("erstaufnahme_id", eaIds)
    .order("reihenfolge").order("created_at");
  if (error) throw error;
  const fotos = data ?? [];
  const urls = await signierteAdressen(fotos.flatMap((f) => [f.pfad, ...(f.original_pfad ? [f.original_pfad] : [])]));
  return { fotos, urls };
}

/** Eine Erstaufnahme samt Fotos und signierten Adressen (1 h) */
export function useErstaufnahme(id: string | null | undefined) {
  return useQuery({
    queryKey: ["erstaufnahmen", "eine", id],
    enabled: !!id,
    queryFn: async (): Promise<EaMitFotos | null> => {
      const { data, error } = await supabase.from("erstaufnahmen").select(AUSWAHL).eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ea: data as unknown as EaZeile, ...(await fotosLaden([id!])) };
    },
  });
}

/** Erstaufnahmen, aus denen ein Projekt wurde — Block „Erstaufnahme“ im Projekt */
export function useErstaufnahmenZumProjekt(projektId: string | null | undefined) {
  return useQuery({
    queryKey: ["erstaufnahmen", "projekt", projektId],
    enabled: !!projektId,
    queryFn: async (): Promise<EaMitFotos[]> => {
      const { data, error } = await supabase.from("erstaufnahmen").select(AUSWAHL).eq("projekt_id", projektId!).order("created_at");
      if (error) throw error;
      const liste = (data ?? []) as unknown as EaZeile[];
      const { fotos, urls } = await fotosLaden(liste.map((e) => e.id));
      return liste.map((ea) => ({ ea, fotos: fotos.filter((f) => f.erstaufnahme_id === ea.id), urls }));
    },
  });
}

/** Angebote (Varianten) zu einer Erstaufnahme — nur der Chef sieht Belege (RLS) */
export function useEaAngebote(eaId: string | null | undefined, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "erstaufnahme", eaId],
    enabled: !!eaId && aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege").select("id, nummer, status, betreff, brutto, datum, projekt_id")
        .eq("erstaufnahme_id", eaId!).eq("typ", "angebot").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Neue Erstaufnahme — aus einem Besichtigungstermin (Kunde, Ort) oder frei */
export async function eaAnlegen(werte: {
  kunde_id: string | null; strasse: string | null; plz: string | null; ort: string | null; termin_id: string | null;
}): Promise<string> {
  const { data, error } = await supabase.from("erstaufnahmen").insert(werte).select("id").single();
  if (error) throw fehler("Erstaufnahme konnte nicht angelegt werden", error);
  return data.id;
}

/**
 * Zum Besichtigungstermin die vorhandene Erstaufnahme — oder eine neue mit
 * Kunde und Adresse des Termins (bzw. des Kunden). Je Termin höchstens eine
 * (eindeutiger Index): tippen zwei gleichzeitig, gewinnt die erste.
 */
export async function eaZumTermin(termin: Pick<Termin, "id" | "kunde_id" | "ort">): Promise<string> {
  const suchen = async () => {
    const { data, error } = await supabase.from("erstaufnahmen").select("id").eq("termin_id", termin.id).maybeSingle();
    if (error) throw fehler("Erstaufnahme nicht gefunden", error);
    return data?.id ?? null;
  };
  const da = await suchen();
  if (da) return da;
  let adresse = { strasse: null as string | null, plz: null as string | null, ort: null as string | null };
  if (termin.kunde_id) {
    const { data: k } = await supabase.from("kunden").select("strasse, plz, ort").eq("id", termin.kunde_id).maybeSingle();
    if (k) adresse = { strasse: k.strasse, plz: k.plz, ort: k.ort };
  }
  // Ort am Termin weicht von der Kundenadresse ab (andere Baustelle) → der gilt
  const ortTermin = termin.ort?.trim();
  const kundeZeile = [adresse.strasse, [adresse.plz, adresse.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (ortTermin && ortTermin !== kundeZeile) adresse = ortZerlegen(ortTermin);
  try {
    return await eaAnlegen({ kunde_id: termin.kunde_id, ...adresse, termin_id: termin.id });
  } catch (e) {
    const nochmal = await suchen();
    if (nochmal) return nochmal;
    throw e;
  }
}

export type EaFelder = {
  kunde_id: string | null; strasse: string; plz: string; ort: string;
  kundenwunsch: string; notizen: string; messwerte: Messwert[];
};

export async function eaSpeichern(id: string, f: EaFelder): Promise<void> {
  const leerNull = (s: string) => (s.trim() ? s.trim() : null);
  const { data, error } = await supabase.from("erstaufnahmen").update({
    kunde_id: f.kunde_id,
    strasse: leerNull(f.strasse), plz: leerNull(f.plz), ort: leerNull(f.ort),
    kundenwunsch: leerNull(f.kundenwunsch), notizen: leerNull(f.notizen),
    messwerte: messwerteBereinigen(f.messwerte),
  }).eq("id", id).select("id");
  if (error) throw fehler("Nicht gespeichert", error);
  if (!data?.length) throw new Error("Nicht gespeichert — gibt es die Erstaufnahme noch?");
}

export async function eaStatusSetzen(id: string, status: "offen" | "kein_auftrag"): Promise<void> {
  const { data, error } = await supabase.from("erstaufnahmen").update({ status }).eq("id", id).select("id");
  if (error) throw fehler("Status nicht geändert", error);
  if (!data?.length) throw new Error("Status nicht geändert.");
}

/** „Gleich Projekt“ (Kleinauftrag ohne Angebot) — gibt die Projekt-ID zurück */
export async function eaGleichProjekt(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("projekt_aus_erstaufnahme", { p_ea: id });
  if (error) throw fehler("Projekt nicht angelegt", error);
  return data;
}

/** Löschen (nur Chef, nicht nach dem Auftrag) — samt Dateien im Speicher */
export async function eaLoeschen(id: string, fotos: ErstaufnahmeFoto[]): Promise<void> {
  const { data, error } = await supabase.from("erstaufnahmen").delete().eq("id", id).select("id");
  if (error) throw fehler("Nicht gelöscht", error);
  if (!data?.length) throw new Error("Nicht gelöscht — nach dem Auftrag bleibt die Erstaufnahme (sie steckt im Projekt).");
  const pfade = fotos.flatMap((f) => [f.pfad, ...(f.original_pfad ? [f.original_pfad] : [])]);
  if (pfade.length) await supabase.storage.from(EA_BUCKET).remove(pfade);
}

const zufall = () => crypto.randomUUID().slice(0, 12);
const endung = (b: Blob): "jpg" | "png" => (b.type === "image/png" ? "png" : "jpg");

async function hochladen(pfad: string, b: Blob) {
  const { error } = await supabase.storage.from(EA_BUCKET).upload(pfad, b, { contentType: b.type || "image/jpeg" });
  if (error) throw fehler("Bild nicht hochgeladen", error);
}

/**
 * Foto oder Skizze ablegen. Mit Zeichnung: das Original bleibt daneben
 * (`original_pfad`), gezeigt wird das gezeichnete Bild.
 */
export async function fotoAblegen(eaId: string, bild: Blob, opt: {
  original?: Blob | null; beschriftung?: string | null; skizze?: boolean; reihenfolge: number;
}): Promise<void> {
  const z = zufall();
  const pfad = eaPfad(eaId, z, endung(bild));
  await hochladen(pfad, bild);
  let originalPfad: string | null = null;
  if (opt.original) {
    originalPfad = eaPfad(eaId, z, endung(opt.original), true);
    try { await hochladen(originalPfad, opt.original); } catch { originalPfad = null; }
  }
  const { error } = await supabase.from("erstaufnahme_fotos").insert({
    erstaufnahme_id: eaId, pfad, original_pfad: originalPfad,
    beschriftung: opt.beschriftung?.trim() || null, skizze: !!opt.skizze, reihenfolge: opt.reihenfolge,
  });
  if (error) {
    await supabase.storage.from(EA_BUCKET).remove([pfad, ...(originalPfad ? [originalPfad] : [])]);
    throw fehler("Foto nicht gespeichert", error);
  }
}

/**
 * Neu gezeichnet: neues Bild ablegen, die Zeile zeigt darauf; das erste
 * Original bleibt (beim ersten Zeichnen wird das bisherige Bild zum Original).
 */
export async function fotoNeuGezeichnet(foto: ErstaufnahmeFoto, bild: Blob): Promise<void> {
  const pfad = eaPfad(foto.erstaufnahme_id, zufall(), endung(bild));
  await hochladen(pfad, bild);
  const original = foto.original_pfad ?? (foto.skizze ? null : foto.pfad);
  const { error } = await supabase.from("erstaufnahme_fotos").update({ pfad, original_pfad: original }).eq("id", foto.id);
  if (error) {
    await supabase.storage.from(EA_BUCKET).remove([pfad]);
    throw fehler("Zeichnung nicht gespeichert", error);
  }
  // Das vorige gezeichnete Bild ist überholt (Original und Projekt-Datei zeigen nicht mehr darauf)
  if (foto.pfad !== original) await supabase.storage.from(EA_BUCKET).remove([foto.pfad]);
}

export async function fotoBeschriften(id: string, beschriftung: string): Promise<void> {
  const { error } = await supabase.from("erstaufnahme_fotos").update({ beschriftung: beschriftung.trim() || null }).eq("id", id);
  if (error) throw fehler("Beschriftung nicht gespeichert", error);
}

export async function fotoLoeschen(foto: ErstaufnahmeFoto): Promise<void> {
  const { data, error } = await supabase.from("erstaufnahme_fotos").delete().eq("id", foto.id).select("id");
  if (error) throw fehler("Nicht gelöscht", error);
  if (!data?.length) throw new Error("Nicht gelöscht — löschen kann, wer fotografiert hat, oder der Chef; nach dem Auftrag bleibt es.");
  await supabase.storage.from(EA_BUCKET).remove([foto.pfad, ...(foto.original_pfad ? [foto.original_pfad] : [])]);
}
