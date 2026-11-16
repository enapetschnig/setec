import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Kunden-Lieferscheine (Material an Kunden ausgeben, Retour): Abfragen und
 * Speichern. Nicht verwechseln mit `lieferscheine` (die der Lieferanten).
 * Query-Keys beginnen mit „kls“.
 */

export const KLS_BUCKET = "kunden-lieferscheine";

export type KundenLieferschein = Tables<"kunden_lieferscheine">;
export type KlsPosition = Tables<"kunden_lieferschein_positionen">;
export type KlsVoll = KundenLieferschein & {
  kunden_lieferschein_positionen: KlsPosition[];
  lagerorte: { name: string } | null;
  rechnung: { id: string; nummer: string | null } | null;
};

const FELDER = "*, kunden_lieferschein_positionen(*), lagerorte(name), rechnung:belege(id, nummer)";

/** Alle (oder die eines Kunden), neueste zuerst */
export function useKundenLieferscheine(kundeId?: string, aktiv = true) {
  return useQuery({
    queryKey: ["kls", "liste", kundeId ?? "alle"],
    enabled: aktiv,
    queryFn: async () => {
      let q = supabase.from("kunden_lieferscheine").select(FELDER);
      if (kundeId) q = q.eq("kunde_id", kundeId);
      const { data, error } = await q.order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KlsVoll[];
    },
  });
}

export async function klsLaden(id: string): Promise<KlsVoll | null> {
  const { data, error } = await supabase.from("kunden_lieferscheine").select(FELDER).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const l = data as unknown as KlsVoll;
  l.kunden_lieferschein_positionen.sort((a, b) => a.pos - b.pos);
  return l;
}

export function useKundenLieferschein(id: string | null) {
  return useQuery({
    queryKey: ["kls", "eins", id],
    enabled: !!id,
    queryFn: () => klsLaden(id!),
  });
}

export type KlsKopf = Pick<KundenLieferschein,
  "kunde_id" | "empf_name" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_email" | "datum" | "lagerort_id" | "notiz">;
export type KlsZeile = { artikel_id: string | null; artikelnummer: string | null; bezeichnung: string; menge: number; einheit: string; retour: boolean };

/** Entwurf speichern: Kopf, dann die Zeilen ganz ersetzen */
export async function klsSpeichern(id: string, neu: boolean, kopf: KlsKopf, zeilen: KlsZeile[]) {
  if (neu) {
    const { error } = await supabase.from("kunden_lieferscheine").insert({ id, ...kopf });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("kunden_lieferscheine").update(kopf).eq("id", id).eq("status", "entwurf").select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Der Lieferschein ist schon abgeschlossen oder gelöscht.");
  }
  const { error: weg } = await supabase.from("kunden_lieferschein_positionen").delete().eq("lieferschein_id", id);
  if (weg) throw weg;
  if (zeilen.length) {
    // alle Felder in jeder Zeile — sonst setzt PostgREST fehlende auf NULL
    const { error } = await supabase.from("kunden_lieferschein_positionen").insert(zeilen.map((z, i) => ({
      lieferschein_id: id, pos: i + 1, artikel_id: z.artikel_id, artikelnummer: z.artikelnummer,
      bezeichnung: z.bezeichnung.trim(), menge: z.menge, einheit: z.einheit || "Stk", retour: z.retour,
    })));
    if (error) throw error;
  }
}

/** Nummer vergeben und das Lager buchen (Ausgabe = Abgang, Retour = Zugang) */
export async function klsAbschliessen(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("kunden_lieferschein_abschliessen", { p_id: id });
  if (error) throw error;
  return data as string;
}

export async function klsLoeschen(id: string) {
  const { data, error } = await supabase.from("kunden_lieferscheine").delete().eq("id", id).eq("status", "entwurf").select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nur ein Entwurf lässt sich löschen.");
}

/** Unterschrift ablegen (privat, nie löschbar) und am Lieferschein vermerken */
export async function klsUnterschreiben(id: string, name: string, png: Blob) {
  const speicher = supabase.storage.from(KLS_BUCKET);
  const pfad = `${id}/unterschrift-${Date.now()}.png`;
  const { error } = await speicher.upload(pfad, png, { upsert: false, contentType: "image/png" });
  if (error) throw new Error(`Unterschrift nicht gespeichert: ${error.message}`);
  const { data, error: e2 } = await supabase.from("kunden_lieferscheine")
    .update({ unterschrift_pfad: pfad, unterschrift_name: name, unterschrieben_am: new Date().toISOString() })
    .eq("id", id).eq("status", "fertig").is("unterschrift_pfad", null).select("id");
  if (e2) throw e2;
  if (!data?.length) throw new Error("Schon unterschrieben oder noch nicht abgeschlossen.");
}

/** Die neue Rechnung am Lieferschein vermerken (gegen doppelt verrechnen) */
export async function klsRechnungSetzen(id: string, rechnungId: string) {
  const { error } = await supabase.from("kunden_lieferscheine").update({ rechnung_id: rechnungId }).eq("id", id).is("rechnung_id", null);
  if (error) throw error;
}
