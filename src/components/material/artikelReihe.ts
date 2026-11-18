import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Artikel } from "@/lib/types";

/**
 * Blättern in der Artikelansicht (Stefan 18.11.2026: „Pfeil links und rechts,
 * ohne wieder in die Liste zu kommen“). Die Liste merkt sich beim Öffnen,
 * in welcher Reihe man war:
 *  - Suche: die Treffer in ihrer Reihenfolge (höchstens 200 IDs),
 *  - sonst die Filter — die Nachbarn holt die Datenbank (nach Bezeichnung,
 *    dann ID wie die Liste), auch über Seitengrenzen und bei 70.000 Artikeln.
 * Ohne gemerkte Reihe (Link, Scan, neuer Tab): alle aktiven nach Bezeichnung.
 */

export type ArtikelFilter = {
  kategorie: string;
  lieferant: string;
  hersteller: string;
  nurLager: boolean;
  inaktive: boolean;
  /** nur bei inaktiven: Teil der Bezeichnung (die Suche kennt nur aktive) */
  q: string;
};

export type ArtikelReihe = { ids: string[] } | { filter: ArtikelFilter };

export const OHNE_FILTER: ArtikelFilter = { kategorie: "alle", lieferant: "alle", hersteller: "alle", nurLager: false, inaktive: false, q: "" };

const SCHLUESSEL = "artikel-reihe";

export function reiheMerken(r: ArtikelReihe) {
  try { sessionStorage.setItem(SCHLUESSEL, JSON.stringify(r)); } catch { /* privates Fenster — dann ohne */ }
}

function reiheLesen(): ArtikelReihe {
  try {
    const r = JSON.parse(sessionStorage.getItem(SCHLUESSEL) ?? "null");
    if (r && (Array.isArray(r.ids) || r.filter)) return r;
  } catch { /* egal */ }
  return { filter: OHNE_FILTER };
}

/** Artikel-Abfrage mit den Filtern der Liste — dieselbe für Liste und Blättern. */
export function artikelGefiltert(select: string, f: ArtikelFilter, zaehlen = false) {
  let a = supabase.from("artikel").select(select, zaehlen ? { count: "exact" } : undefined).eq("aktiv", !f.inaktive);
  if (f.kategorie === "ohne") a = a.is("kategorie", null);
  else if (f.kategorie !== "alle") a = a.eq("kategorie", f.kategorie);
  if (f.lieferant !== "alle") a = a.eq("lieferant", f.lieferant);
  if (f.hersteller === "-") a = a.is("hersteller", null);
  else if (f.hersteller !== "alle") a = a.eq("hersteller", f.hersteller);
  if (f.nurLager) a = a.eq("lagerartikel", true);
  if (f.inaktive && f.q) a = a.ilike("bezeichnung", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  return a;
}

/** Wert für PostgREST-`or()` — Komma, Punkt, Klammern und Anführungszeichen in Bezeichnungen. */
const wert = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function nachbar(a: Artikel, f: ArtikelFilter, richtung: 1 | -1): Promise<string | null> {
  const op = richtung > 0 ? "gt" : "lt";
  const b = wert(a.bezeichnung);
  const { data, error } = await artikelGefiltert("id", f)
    .or(`bezeichnung.${op}.${b},and(bezeichnung.eq.${b},id.${op}.${a.id})`)
    .order("bezeichnung", { ascending: richtung > 0 })
    .order("id", { ascending: richtung > 0 })
    .limit(1);
  if (error) throw error;
  return (data as unknown as { id: string }[] | null)?.[0]?.id ?? null;
}

export type Nachbarn = { vor: string | null; nach: string | null; text?: string };

export function useArtikelNachbarn(a: Artikel | null | undefined): Nachbarn {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["artikel", "nachbarn", a?.id, a?.bezeichnung, sessionStorageStand()],
    enabled: !!a,
    staleTime: 60_000,
    queryFn: async (): Promise<Nachbarn> => {
      const r = reiheLesen();
      if ("ids" in r) {
        const i = r.ids.indexOf(a!.id);
        if (i >= 0) {
          return { vor: r.ids[i - 1] ?? null, nach: r.ids[i + 1] ?? null, text: `${i + 1} von ${r.ids.length}` };
        }
      }
      const f = "filter" in r ? r.filter : OHNE_FILTER;
      const [vor, nach] = await Promise.all([nachbar(a!, f, -1), nachbar(a!, f, 1)]);
      return { vor, nach };
    },
  });

  // Die Nachbarn schon laden — dann blättert es ohne „Lädt…“
  useEffect(() => {
    for (const id of [data?.nach, data?.vor]) {
      if (!id) continue;
      void qc.prefetchQuery({
        queryKey: ["artikel", "eins", id],
        staleTime: 30_000,
        queryFn: async () => {
          const { data: x, error } = await supabase.from("artikel").select("*").eq("id", id).maybeSingle();
          if (error) throw error;
          return x as Artikel | null;
        },
      });
    }
  }, [data?.nach, data?.vor, qc]);

  return data ?? { vor: null, nach: null };
}

/** Die Reihe als Teil des Abfrage-Schlüssels — neue Suche in der Liste → neue Nachbarn. */
function sessionStorageStand(): string {
  try { return sessionStorage.getItem(SCHLUESSEL) ?? ""; } catch { return ""; }
}
