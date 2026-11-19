import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Karte, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useKundeErstaufnahmen } from "@/components/erstaufnahme/eaDaten";
import { datum } from "@/lib/format";
import { eaAdresse } from "@/lib/erstaufnahme";
import { ERSTAUFNAHME_STATUS, type ErstaufnahmeStatus } from "@/lib/types";

/**
 * Beim Kontakt: seine Erstaufnahmen (Besichtigungen) mit Status — und eine
 * neue gleich mit diesem Kunden (Stefan 19.11.2026).
 */
export function KundeErstaufnahmen({ kundeId }: { kundeId: string }) {
  const { data: liste = [] } = useKundeErstaufnahmen(kundeId);
  return (
    <Karte titel={`Erstaufnahmen${liste.length ? ` · ${liste.length}` : ""}`}
      aktion={<Button asChild variant="ghost" size="sm" className="-my-2 h-11 gap-1 text-primary">
        <Link to={`/erstaufnahmen/neu?kunde=${kundeId}`}><Plus className="h-4 w-4" /> Erstaufnahme</Link></Button>}
      ohnePolster>
      {liste.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Noch keine Erstaufnahme.</p>
      ) : (
        <ul className="divide-y border-t" data-kunde-erstaufnahmen>
          {liste.map((e) => (
            <li key={e.id}>
              <Link to={`/erstaufnahmen/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5" data-ea={e.nummer}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.kundenwunsch?.split("\n")[0] || "Erstaufnahme"}</p>
                  <p className="truncate text-xs text-muted-foreground">{[e.nummer, datum(e.created_at), eaAdresse(e)].filter(Boolean).join(" · ")}</p>
                </div>
                <StatusPille eintrag={ERSTAUFNAHME_STATUS[e.status as ErstaufnahmeStatus]} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Karte>
  );
}
