import { useState } from "react";
import { Plus } from "lucide-react";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { AufgabeDialog } from "@/components/aufgaben/AufgabeDialog";
import { AufgabeDetail } from "@/components/aufgaben/AufgabeDetail";
import { AufgabenListe } from "@/components/aufgaben/AufgabenListe";
import { useAufgaben, type AufgabeMitInfo } from "@/components/aufgaben/aufgabenDaten";
import { sortieren } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";

/**
 * Beim Kontakt: Aufgaben, die am Kunden oder an einem seiner Projekte hängen
 * (offene und kürzlich erledigte) — beim Telefonat gleich den Stand vor Augen
 * (Stefan 18.11.2026). Neue gleich mit diesem Kunden.
 */
export function KundeAufgaben({ kundeId, projektIds }: { kundeId: string; projektIds: string[] }) {
  const { data: aufgaben = [] } = useAufgaben({ kundeId, kundenProjekte: projektIds });
  const [gewaehlt, setGewaehlt] = useState<AufgabeMitInfo | null>(null);
  const [neu, setNeu] = useState(false);
  const liste = sortieren(aufgaben, isoTag());
  const offen = aufgaben.filter((a) => a.status !== "erledigt").length;

  return (
    <Karte titel={`Aufgaben${offen ? ` · ${offen} offen` : ""}`}
      aktion={<Button variant="ghost" size="sm" className="-my-2 h-11 gap-1 text-primary" onClick={() => setNeu(true)}><Plus className="h-4 w-4" /> Aufgabe</Button>}
      ohnePolster>
      <div className="px-3 pb-3 lg:px-4" data-kunde-aufgaben>
        {liste.length === 0
          ? <p className="px-1 text-sm text-muted-foreground">Keine Aufgaben zu diesem Kontakt.</p>
          : <AufgabenListe aufgaben={liste} onWahl={setGewaehlt} mitKunde={false} />}
      </div>
      <AufgabeDetail aufgabe={gewaehlt} onOpenChange={(o) => !o && setGewaehlt(null)} />
      <AufgabeDialog open={neu} onOpenChange={setNeu} kundeId={kundeId} />
    </Karte>
  );
}
