import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Image as Bild, Lock, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Gruppentitel, StatusPille } from "@/components/Bausteine";
import { Rueckfrage, type Frage } from "@/components/Rueckfrage";
import { Button } from "@/components/ui/button";
import { DokumentDialog } from "@/components/dokumente/DokumentDialog";
import { dateiHerunterladen, dateiOeffnen, useFirmenDokumente } from "@/components/dokumente/dokumentDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { ablauf, groesseText } from "@/lib/dokumente";
import { isoTag } from "@/lib/format";
import type { Fahrzeug } from "@/lib/types";

/**
 * Dokumente und Fotos am Fahrzeug / an der Maschine (Stefan, 18.11.2026):
 * Leasingvertrag, Polizze, Rechnung für die Garantie, Foto vom Typenschild.
 * Liegen in den Firmendokumenten (Ordner „Fuhrpark“, `fahrzeug_id`) — dort
 * sind sie auch unter Dokumente zu finden. Ablegen und löschen: Chef/Büro.
 */
export function FahrzeugDokumente({ fahrzeug }: { fahrzeug: Fahrzeug }) {
  const { istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: alle = [] } = useFirmenDokumente();
  const [neu, setNeu] = useState(false);
  const [frage, setFrage] = useState<Frage | null>(null);
  const dokumente = alle.filter((d) => d.fahrzeug_id === fahrzeug.id);
  const heute = isoTag();

  // Vorschaubilder (Typenschild …): signierte Adressen der Fotos auf einmal
  const fotos = dokumente.filter((d) => d.mime?.startsWith("image/")).map((d) => d.pfad);
  const { data: vorschau = {} } = useQuery({
    queryKey: ["dokumente", "vorschau", fotos.join("|")],
    enabled: fotos.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("firmen-dokumente").createSignedUrls(fotos, 600);
      return Object.fromEntries((data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl]));
    },
  });

  const loeschen = (d: (typeof dokumente)[number]) => setFrage({
    titel: `„${d.titel}“ löschen?`,
    text: "Die Datei ist danach weg — auch unter Dokumente.",
    knopf: "Löschen",
    gefahr: true,
    aktion: async () => {
      const { error } = await supabase.from("firmen_dokumente").delete().eq("id", d.id);
      if (error) return void toast.error("Nicht gelöscht", { description: fehlerText(error) });
      await supabase.storage.from("firmen-dokumente").remove([d.pfad]);
      toast.success("Gelöscht");
      await neuLaden("dokumente");
    },
  });

  return (
    <section className="space-y-2" data-fahrzeug-dokumente>
      <div className="flex items-center justify-between gap-2">
        <Gruppentitel className="pb-0">Dokumente & Fotos</Gruppentitel>
        {istChef && (
          <Button variant="outline" className="h-11 gap-1.5" onClick={() => setNeu(true)}>
            <Plus className="h-4 w-4" /> Dokument / Foto
          </Button>
        )}
      </div>
      {dokumente.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {istChef ? "Noch nichts abgelegt — z. B. Leasingvertrag, Versicherungspolizze, Rechnung (Garantie), Foto vom Typenschild." : "Noch nichts abgelegt."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {dokumente.map((d) => {
            const g = ablauf(d.gueltig_bis, heute);
            const bild = vorschau[d.pfad];
            return (
              <li key={d.id} className="flex items-center gap-1 pr-1">
                <button type="button" onClick={() => void dateiOeffnen("firmen-dokumente", d.pfad)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                  {bild ? (
                    <img src={bild} alt="" className="h-12 w-12 shrink-0 rounded-md border object-cover" />
                  ) : d.mime?.startsWith("image/") ? (
                    <Bild className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.titel}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate">{d.name}</span>
                      {d.groesse ? <span>· {groesseText(d.groesse)}</span> : null}
                      {g && <StatusPille eintrag={{ ton: g.stufe === "abgelaufen" ? "rot" : g.stufe === "bald" ? "gelb" : "grau", text: g.text }} />}
                      {d.nur_chef && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> nur Chef</span>}
                    </span>
                  </span>
                </button>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${d.titel} herunterladen`}
                  onClick={() => void dateiHerunterladen("firmen-dokumente", d.pfad, d.name)}>
                  <Download className="h-4 w-4" />
                </Button>
                {istChef && (
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${d.titel} löschen`} onClick={() => loeschen(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DokumentDialog open={neu} onOpenChange={setNeu} ziel={{ art: "firma", ordner: "Fuhrpark", fahrzeug: { id: fahrzeug.id, name: fahrzeug.name } }} />
      <Rueckfrage frage={frage} onClose={() => setFrage(null)} />
    </section>
  );
}
