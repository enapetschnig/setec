import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderInput, HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { stunden, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stundenAufBeleg, verbrauchZusammenfassen, type VerbrauchMaterial, type VerbrauchZeit } from "./verbrauch";

/**
 * Rechnung mit Projekt: was ist dort wirklich verbraucht — Stunden je
 * Mitarbeiter, Material je Artikel — und was davon steht schon auf einer
 * Rechnung. Offenes lässt sich gleich übernehmen.
 */
export function ProjektVerbrauch({
  projektId, belegId, positionen, onUebernehmen,
}: {
  projektId: string;
  /** null = noch nicht gespeichert */
  belegId: string | null;
  positionen: { art: string; menge: number; einheit: string; minuten: number | null }[];
  /** „Aus dem Projekt übernehmen“ öffnen; fehlt bei fertigen Rechnungen */
  onUebernehmen?: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["projekt_verbrauch", projektId, belegId],
    queryFn: async () => {
      const [zt, mt] = await Promise.all([
        supabase.from("zeiten").select("id, stunden, user_id, rechnung_id, profiles(vorname, nachname)").eq("projekt_id", projektId),
        supabase.from("material_buchungen").select("id, art, menge, einheit, bezeichnung, artikel_id, rechnung_id, artikel(bezeichnung, einheit)")
          .eq("projekt_id", projektId).in("art", ["ausfassung", "rueckgabe", "direkt"]),
      ]);
      if (zt.error) throw new Error(zt.error.message);
      if (mt.error) throw new Error(mt.error.message);
      const zeiten: VerbrauchZeit[] = (zt.data ?? []).map((z) => ({
        id: z.id, stunden: Number(z.stunden), user_id: z.user_id, rechnung_id: z.rechnung_id,
        name: [z.profiles?.vorname, z.profiles?.nachname].filter(Boolean).join(" ") || "Mitarbeiter",
      }));
      const material: VerbrauchMaterial[] = (mt.data ?? []).map((b) => ({
        id: b.id, art: b.art, menge: Number(b.menge), rechnung_id: b.rechnung_id, artikel_id: b.artikel_id,
        bezeichnung: b.artikel?.bezeichnung ?? b.bezeichnung ?? "Material", einheit: b.artikel?.einheit ?? b.einheit ?? "Stk",
      }));
      return verbrauchZusammenfassen(zeiten, material, belegId);
    },
  });

  if (isLoading || error || !data) return null;
  const { stunden: h, personen, material } = data;
  if (!h.gesamt && !material.length) return null;
  const aufRechnung = stundenAufBeleg(positionen);
  const offenMaterial = material.filter((m) => m.offen > 0).length;
  const nochOffen = h.offen > 0 || offenMaterial > 0;

  return (
    <section className="rounded-lg border bg-card" data-verbrauch>
      <button type="button" className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
        <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Im Projekt verbraucht</span>
          <span className="block text-sm text-muted-foreground">
            {[
              h.gesamt ? `${stunden(h.gesamt)} gebucht` : null,
              material.length ? `${material.length} ${material.length === 1 ? "Artikel" : "Artikel"} Material` : null,
              `auf dieser Rechnung ${stunden(aufRechnung)}`,
            ].filter(Boolean).join(" · ")}
          </span>
          {nochOffen && (
            <span className="mt-1 block text-sm font-medium text-primary">
              Noch nicht verrechnet: {[h.offen > 0 ? stunden(h.offen) : null, offenMaterial ? `${offenMaterial} Material` : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        <ChevronDown className={cn("mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
      </button>
      {offen && (
        <div className="space-y-4 border-t px-4 pb-4 pt-3 text-sm">
          {personen.length > 0 && (
            <Tabelle
              titel="Stunden"
              kopf={["Mitarbeiter", "Gebucht", "Hier", "Andere Rechn.", "Offen"]}
              zeilen={personen.map((p) => [p.name, stunden(p.gesamt), stunden(p.hier), p.anderswo ? stunden(p.anderswo) : "–", p.offen ? stunden(p.offen) : "–"])}
              summe={["Zusammen", stunden(h.gesamt), stunden(h.hier), h.anderswo ? stunden(h.anderswo) : "–", h.offen ? stunden(h.offen) : "–"]}
            />
          )}
          {material.length > 0 && (
            <Tabelle
              titel="Material"
              kopf={["Artikel", "Verbaut", "Hier", "Andere Rechn.", "Offen"]}
              zeilen={material.map((m) => [
                m.bezeichnung, `${zahl(m.gesamt)} ${m.einheit}`, zahl(m.hier), m.anderswo ? zahl(m.anderswo) : "–", m.offen ? zahl(m.offen) : "–",
              ])}
            />
          )}
          <p className="text-xs text-muted-foreground">„Hier“ zählt erst nach dem Speichern — Stunden und Material hängen dann an dieser Rechnung.</p>
          {onUebernehmen && nochOffen && (
            <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onUebernehmen}>
              <FolderInput className="h-4 w-4" /> Offenes übernehmen
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function Tabelle({ titel, kopf, zeilen, summe }: { titel: string; kopf: string[]; zeilen: string[][]; summe?: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>{kopf.map((k, i) => <th key={k} className={cn("py-1 pr-2 font-medium", i === 0 ? "text-left" : "text-right")}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {zeilen.map((z, j) => (
              <tr key={j} className="border-t">
                {z.map((c, i) => <td key={i} className={cn("py-1.5 pr-2", i === 0 ? "text-left" : "zahl text-right", i === 4 && c !== "–" && "font-semibold text-primary")}>{c}</td>)}
              </tr>
            ))}
            {summe && (
              <tr className="border-t font-semibold">
                {summe.map((c, i) => <td key={i} className={cn("py-1.5 pr-2", i === 0 ? "text-left" : "zahl text-right")}>{c}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
