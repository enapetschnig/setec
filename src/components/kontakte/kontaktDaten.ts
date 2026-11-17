import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { alleZeilen } from "@/lib/abfrage";
import type { Kunde } from "@/lib/types";
import { brauchtGeo, geoAnfrage, nominatimLesen, nominatimUrl, type LieferantBeleg } from "./kontaktLogik";

/** Eingangsrechnungen, Lieferscheine und Bestellungen eines Lieferanten (RLS: Rechnungen/Bestellungen nur Chef) */
export function useLieferantBelege(kontaktId: string | null | undefined, aktiv: boolean) {
  return useQuery({
    queryKey: ["eingang", "kontakt", kontaktId],
    enabled: !!kontaktId && aktiv,
    queryFn: async () => {
      // ein großer Händler hat über die Jahre leicht mehr als 1000 Belege — in Seiten
      const data = await alleZeilen((von, bis) => supabase.rpc("kontakt_belege", { p_kontakt: kontaktId! })
        .order("datum", { ascending: false, nullsFirst: false }).order("quelle").order("id").range(von, bis));
      return data as LieferantBeleg[];
    },
  });
}

/** Kreditorennummer der Buchhaltung, falls schon vergeben (nur Chef) */
export function useKreditor(namen: string[], aktiv: boolean) {
  const schluessel = namen.map((n) => n.trim().toLowerCase()).filter(Boolean);
  return useQuery({
    queryKey: ["kunden", "kreditor", schluessel],
    enabled: aktiv && schluessel.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("kreditor_konten").select("konto").in("schluessel", schluessel).order("konto").limit(1);
      if (error) throw error;
      return data?.[0]?.konto ?? null;
    },
  });
}

// ── Koordinaten per Nominatim ────────────────────────────────────────────
// Nutzungsregeln: höchstens 1 Anfrage je Sekunde, Ergebnis speichern. Die
// Drossel gilt für die ganze App (Kontakt speichern und Karte zugleich).
const PAUSE_MS = 1100;
let naechsteErlaubt = 0;
const warten = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function drossel() {
  const jetzt = Date.now();
  const ab = Math.max(jetzt, naechsteErlaubt);
  naechsteErlaubt = ab + PAUSE_MS;
  if (ab > jetzt) await warten(ab - jetzt);
}

/**
 * Lage eines Kontakts aus seiner Adresse suchen und speichern. Nicht
 * gefunden: trotzdem merken, wofür gesucht wurde — sonst fragte jede Karte
 * wieder. Gibt zurück, ob ein Punkt gefunden wurde.
 */
export async function geoSuchen(k: Pick<Kunde, "id" | "strasse" | "plz" | "ort">): Promise<boolean> {
  const anfrage = geoAnfrage(k);
  if (!anfrage) return false;
  await drossel();
  const antwort = await fetch(nominatimUrl(anfrage), { headers: { Accept: "application/json" } });
  if (!antwort.ok) throw new Error(`Nominatim ${antwort.status}`);
  const punkt = nominatimLesen(await antwort.json());
  const { error } = await supabase.from("kunden")
    .update({ lat: punkt?.lat ?? null, lng: punkt?.lng ?? null, geo_adresse: anfrage }).eq("id", k.id);
  if (error) throw error;
  return !!punkt;
}

/**
 * Lage im Hintergrund suchen (Kontakt gespeichert oder geöffnet). Schlägt die
 * Suche fehl (Netz, Dienst überlastet), bleibt `geo_adresse` alt — beim
 * nächsten Öffnen oder Speichern wird erneut gesucht. Dezenter Hinweis statt
 * stillem Fehlschlag.
 */
const imGang = new Set<string>();
export async function geoImHintergrund(k: Pick<Kunde, "id" | "strasse" | "plz" | "ort">, danach?: () => unknown, { beimOeffnen = false } = {}) {
  if (imGang.has(k.id)) return;
  imGang.add(k.id);
  try {
    const gefunden = await geoSuchen(k);
    if (!gefunden && !beimOeffnen) toast("Adresse auf der Karte nicht gefunden – bitte PLZ und Ort prüfen.");
    await danach?.();
  } catch {
    toast("Ort auf der Karte nicht gefunden – später erneut");
  } finally {
    imGang.delete(k.id);
  }
}

/**
 * Kontakte ohne (aktuelle) Koordinaten — auf der Karte mit Knopf
 * „Lage suchen“: nacheinander, nur solange die Karte offen ist.
 */
export function useGeokodierung(kontakte: Kunde[]) {
  const qc = useQueryClient();
  const offen = useRef(true);
  useEffect(() => { offen.current = true; return () => { offen.current = false; }; }, []);
  const [laeuft, setLaeuft] = useState(false);
  const fehlend = kontakte.filter(brauchtGeo);

  const starten = async () => {
    if (laeuft) return;
    setLaeuft(true);
    let n = 0, gefunden = 0, fehler = false;
    for (const k of fehlend) {
      if (!offen.current) break;
      try {
        if (await geoSuchen(k)) gefunden++;
      } catch {
        // Netz weg oder Dienst überlastet: später noch einmal
        fehler = true;
        break;
      }
      // je 5 einmal neu laden, damit die Punkte nach und nach erscheinen
      if (++n % 5 === 0) void qc.invalidateQueries({ queryKey: ["kunden"] });
    }
    await qc.invalidateQueries({ queryKey: ["kunden"] });
    if (offen.current) setLaeuft(false);
    return { gesucht: n, gefunden, fehler };
  };

  return { fehlend, laeuft, starten };
}
