import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Karte, StatusPille } from "@/components/Bausteine";
import { datum } from "@/lib/format";
import { useKundenLieferscheine } from "./klsDaten";
import { KLS_STATUS, klsStatus } from "./klsLogik";

/** Beim Kunden (Kontakte): seine Lieferscheine — nur, wenn es welche gibt */
export function KundeLieferscheine({ kundeId }: { kundeId: string }) {
  const { data = [] } = useKundenLieferscheine(kundeId);
  if (!data.length) return null;
  return (
    <Karte titel={`Lieferscheine · ${data.length}`} ohnePolster>
      <ul className="divide-y border-t">
        {data.map((l) => (
          <li key={l.id}>
            <Link to={`/kunden-lieferscheine/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Lieferschein {l.nummer ?? "(Entwurf)"}</p>
                <p className="text-xs text-muted-foreground">
                  {[datum(l.datum), `${l.kunden_lieferschein_positionen.length} Zeilen`, l.rechnung ? `Rechnung ${l.rechnung.nummer ?? "Entwurf"}` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
              <StatusPille eintrag={KLS_STATUS[klsStatus(l)]} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Karte>
  );
}
