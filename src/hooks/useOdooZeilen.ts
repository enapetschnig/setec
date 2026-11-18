import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alleZeilen, inHaeppchen } from "@/lib/abfrage";

type Antwort = PromiseLike<{ data: { zeile_id: string }[] | null; error: unknown }>;
type Roh = { from: (t: string) => { select: (f: string) => { eq: (k: string, v: string) => {
  order: (k: string) => { range: (a: number, b: number) => Antwort };
  in: (k: string, v: string[]) => Antwort;
} } } };

/**
 * IDs der Zeilen einer Tabelle, die aus Odoo übernommen sind (Tabelle
 * `odoo_import`, lesbar mit dem Recht des Bereichs — Eingangsrechnungen:
 * „eingang“ —, sonst leer). Belege tragen das selbst (`altbestand`),
 * Eingangsrechnungen nicht: dafür ist das hier.
 */
export function useOdooZeilen(tabelle: "eingangsrechnungen", aktiv = true) {
  return useQuery({
    queryKey: ["odoo", tabelle],
    enabled: aktiv,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      // nicht in den erzeugten Typen — die Tabelle kennt nur die Übernahme
      const roh = supabase as unknown as Roh;
      const data = await alleZeilen((von, bis) => roh.from("odoo_import").select("zeile_id").eq("tabelle", tabelle).order("zeile_id").range(von, bis));
      return new Set(data.map((z) => z.zeile_id));
    },
  });
}

/**
 * Welche der gegebenen Zeilen aus Odoo stammen — für die Übergabe eines
 * Monats (die IDs des Monats in Häppchen statt der ganzen Übernahme).
 */
export async function odooZeilenVon(tabelle: "eingangsrechnungen", ids: string[]): Promise<Set<string>> {
  const roh = supabase as unknown as Roh;
  const data = await inHaeppchen(ids, (teil) => roh.from("odoo_import").select("zeile_id").eq("tabelle", tabelle).in("zeile_id", teil));
  return new Set(data.map((z) => z.zeile_id));
}
