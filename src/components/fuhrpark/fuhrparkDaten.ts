import { useQuery } from "@tanstack/react-query";
import { Bus, Car, Container, Gauge, Truck, Wrench, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import type { FahrzeugArt } from "@/lib/types";

/** Bild je Art — Fuhrpark und Plantafel */
export const FAHRZEUG_ICON: Record<FahrzeugArt, LucideIcon> = { bus: Bus, pkw: Car, steiger: Truck, anhaenger: Container, maschine: Wrench, messgeraet: Gauge };

/** Offene Schäden: wie viele je Fahrzeug und wie viele Fotos daran hängen — eine Abfrage für beide Hooks */
async function offeneSchaedenLaden() {
  const { data, error } = await supabase.from("fahrzeug_eintraege").select("fahrzeug_id, fahrzeug_eintrag_fotos(count)").eq("art", "schaden").eq("erledigt", false);
  if (error) throw error;
  const jeFahrzeug: Record<string, number> = {};
  let fotos = 0;
  (data ?? []).forEach((e) => {
    jeFahrzeug[e.fahrzeug_id] = (jeFahrzeug[e.fahrzeug_id] ?? 0) + 1;
    fotos += e.fahrzeug_eintrag_fotos?.[0]?.count ?? 0;
  });
  return { jeFahrzeug, fotos };
}

/** Offene Schäden je Fahrzeug */
export function useOffeneSchaeden() {
  return useQuery({ queryKey: ["fahrzeuge", "schaeden"], queryFn: offeneSchaedenLaden, select: (d) => d.jeFahrzeug });
}

/** Fotos an allen offenen Schäden (Startseite: „… gemeldet · 3 Fotos“) */
export function useOffeneSchadenFotos() {
  return useQuery({ queryKey: ["fahrzeuge", "schaeden"], queryFn: offeneSchaedenLaden, select: (d) => d.fotos });
}

// ── Fotos am Bordbuch-Eintrag (Schaden) ─────────────────────────────────
/** Privater Bucket, Pfad <eintrag_id>/<datei> (Migration 20261119114500) */
export const FAHRZEUG_FOTOS = "fahrzeug-fotos";

/** Signierte Adressen der Fotos (1 h) — Schlüssel mit den Pfaden, neue Fotos holen von selbst neu */
export function useFahrzeugFotoAdressen(pfade: string[]) {
  return useQuery({
    queryKey: ["fahrzeug-fotos", pfade.join("|")],
    enabled: pfade.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(FAHRZEUG_FOTOS).createSignedUrls(pfade, 3600);
      return Object.fromEntries((data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl]));
    },
  });
}

/**
 * Fotos an einen Bordbuch-Eintrag hängen: verkleinern wie die Baustellenfotos
 * (2400 px), hochladen nach <eintrag_id>/…, Zeile eintragen. Scheitert die
 * Zeile, kommt die Datei gleich wieder weg (das darf der Melder, solange sie
 * nirgends eingetragen ist). Ein Fehler stoppt die anderen Fotos nicht —
 * zurück kommen die, die nicht gespeichert wurden.
 */
export async function fahrzeugFotosHochladen(eintragId: string, dateien: File[]): Promise<{ fehlgeschlagen: File[]; fehler: string[] }> {
  const fehlgeschlagen: File[] = [];
  const fehler: string[] = [];
  for (const roh of dateien) {
    const datei = await bildVerkleinern(roh);
    const pfad = `${eintragId}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(datei.name)}`;
    const { error: e1 } = await supabase.storage.from(FAHRZEUG_FOTOS).upload(pfad, datei, { contentType: datei.type || "image/jpeg" });
    if (e1) { fehlgeschlagen.push(roh); fehler.push(e1.message); continue; }
    const { error: e2 } = await supabase.from("fahrzeug_eintrag_fotos").insert({
      eintrag_id: eintragId, pfad, name: roh.name, mime: datei.type || null, groesse: datei.size,
    });
    if (e2) {
      await supabase.storage.from(FAHRZEUG_FOTOS).remove([pfad]);
      fehlgeschlagen.push(roh);
      fehler.push(e2.message);
    }
  }
  return { fehlgeschlagen, fehler };
}
