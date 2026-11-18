import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alleZeilen } from "@/lib/abfrage";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import { istMeine, kundeFilter, meineFilter, zaehlen } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";
import type { Aufgabe, AufgabeVerlauf, Profil } from "@/lib/types";

export type AufgabeMitInfo = Aufgabe & {
  projekte: { nummer: string; name: string } | null;
  kunden: { name: string } | null;
};

const FELDER = "*, projekte(nummer, name), kunden(name)";

/**
 * Aufgaben — die Datenbank liefert dem Chef alle, einem Mitarbeiter nur die
 * ihm zugewiesenen und selbst angelegten (RLS). Erledigte nur der letzten
 * 90 Tage, sonst wird die Liste mit der Zeit endlos.
 */
export function useAufgaben(filter: { projektId?: string; kundeId?: string; kundenProjekte?: string[] } = {}) {
  return useQuery({
    queryKey: ["aufgaben", "liste", filter],
    queryFn: async () => {
      const seit = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const data = await alleZeilen((von, bis) => {
        let q = supabase.from("aufgaben").select(FELDER)
          .or(`status.neq.erledigt,erledigt_am.gte.${seit}`)
          .order("faellig_am", { ascending: true, nullsFirst: false }).order("id");
        if (filter.projektId) q = q.eq("projekt_id", filter.projektId);
        // Beim Kontakt: am Kunden hängende und die seiner Projekte
        if (filter.kundeId) q = q.or(kundeFilter(filter.kundeId, filter.kundenProjekte ?? []));
        return q.range(von, bis);
      });
      return data as AufgabeMitInfo[];
    },
  });
}

/** Offene Aufgaben, für die ich zuständig bin — auch selbst angelegte ohne Zuständigen (Startseite) */
export function useMeineAufgaben(userId: string | undefined) {
  return useQuery({
    queryKey: ["aufgaben", "meine", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("aufgaben").select(FELDER)
        .or(meineFilter(userId!)).neq("status", "erledigt").limit(200);
      if (error) throw error;
      return ((data ?? []) as AufgabeMitInfo[]).filter((a) => istMeine(a, userId!));
    },
  });
}

export type VerlaufMitPerson = AufgabeVerlauf & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };

export function useAufgabeVerlauf(aufgabeId: string | undefined) {
  return useQuery({
    queryKey: ["aufgaben", "verlauf", aufgabeId],
    enabled: !!aufgabeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("aufgabe_verlauf")
        .select("*, profiles(vorname, nachname, farbe)").eq("aufgabe_id", aufgabeId!).order("created_at");
      if (error) throw error;
      return (data ?? []) as VerlaufMitPerson[];
    },
  });
}

/** Foto zu einer Aufgabe hochladen — verkleinert, Pfad <aufgabe>/<zufall>-<name> */
export async function aufgabeFotoHochladen(aufgabeId: string, roh: File): Promise<string> {
  const datei = await bildVerkleinern(roh);
  const pfad = `${aufgabeId}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(datei.name)}`;
  const { error } = await supabase.storage.from("aufgaben").upload(pfad, datei, { contentType: datei.type || "image/jpeg" });
  if (error) throw error;
  return pfad;
}

/** Für den Chef: wie viele Aufgaben offen und überfällig sind (Zu erledigen) */
export function useAufgabenZaehler(aktiv: boolean) {
  const { data = [] } = useAufgaben();
  return aktiv ? zaehlen(data, isoTag()) : { offen: 0, ueberfaellig: 0, heute: 0, erledigt: 0 };
}
