import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2, PackageCheck, Plus, Search, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { useKundenLieferscheine } from "@/components/kundenlieferschein/klsDaten";
import { KLS_STATUS, klsStatus, type KlsStatus } from "@/components/kundenlieferschein/klsLogik";
import { passtSuche } from "@/components/regie/regieLogik";
import { datum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "alle" | KlsStatus | "ohne_rechnung";
const FILTER: { wert: Filter; text: string }[] = [
  { wert: "alle", text: "Alle" },
  { wert: "entwurf", text: "Entwurf" },
  { wert: "fertig", text: "Nicht unterschrieben" },
  { wert: "ohne_rechnung", text: "Ohne Rechnung" },
];

/** /kunden-lieferscheine — Material an Kunden (Theke, Sonderbestellung), mit Retour (nur Chef) */
export default function KundenLieferscheine() {
  const pc = useIstPc();
  const { data: alle = [], isLoading, error } = useKundenLieferscheine();
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");

  const passt = (l: (typeof alle)[number], f: Filter) =>
    f === "alle" ? true : f === "ohne_rechnung" ? l.status === "fertig" && !l.rechnung_id : klsStatus(l) === f;
  const liste = useMemo(() => alle.filter((l) => passt(l, filter) && passtSuche([
    l.nummer, l.empf_name, l.empf_ort, l.notiz, ...l.kunden_lieferschein_positionen.flatMap((p) => [p.bezeichnung, p.artikelnummer]),
  ], suche)), [alle, filter, suche]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Seite
      titel="Kunden-Lieferscheine"
      untertitel={isLoading ? undefined : `${alle.length} ${alle.length === 1 ? "Lieferschein" : "Lieferscheine"}`}
      aktionen={<Button asChild className="h-11 gap-1.5 px-3 sm:px-4"><Link to="/kunden-lieferscheine/neu"><Plus className="h-4 w-4" />{pc ? "Neuer Lieferschein" : "Neu"}</Link></Button>}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button key={x.wert} type="button" onClick={() => setFilter(x.wert)}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
              {x.text}
              <span className="zahl text-xs text-muted-foreground">{alle.filter((l) => passt(l, x.wert)).length}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Kunde, Nummer, Artikel …"
            className="h-11 pl-9 pr-10" inputMode="search" autoComplete="off" />
          {suche && (
            <button type="button" onClick={() => setSuche("")} aria-label="Suche leeren" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <Leer icon={PackageCheck} text={`Konnte nicht geladen werden: ${(error as Error).message}`} />
      ) : liste.length === 0 ? (
        <Leer icon={PackageCheck} text={suche.trim() ? "Nichts gefunden." : "Kauft ein Kunde Material oder holt eine Sonderbestellung ab: Lieferschein schreiben, unterschreiben lassen — das Lager bucht mit."}>
          {!suche.trim() && <Button asChild className="h-11 gap-1.5"><Link to="/kunden-lieferscheine/neu"><Plus className="h-4 w-4" /> Neuer Lieferschein</Link></Button>}
        </Leer>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((l) => {
            const aus = l.kunden_lieferschein_positionen.filter((p) => !p.retour).length;
            const zur = l.kunden_lieferschein_positionen.filter((p) => p.retour).length;
            return (
              <li key={l.id}>
                <Link to={`/kunden-lieferscheine/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 lg:px-5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{l.empf_name || "–"}</span>
                      <StatusPille eintrag={KLS_STATUS[klsStatus(l)]} />
                      {l.rechnung && <StatusPille eintrag={{ ton: "lila", text: `Rechnung ${l.rechnung.nummer ?? "Entwurf"}` }} />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.nummer, datum(l.datum), `${aus} ${aus === 1 ? "Position" : "Positionen"}`, zur ? `${zur} Retour` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Seite>
  );
}
