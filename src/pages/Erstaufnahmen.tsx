import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErstaufnahmen } from "@/components/erstaufnahme/eaDaten";
import { datum } from "@/lib/format";
import { eaAdresse } from "@/lib/erstaufnahme";
import { ERSTAUFNAHME_STATUS, type ErstaufnahmeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER: { wert: ErstaufnahmeStatus | "alle"; text: string }[] = [
  { wert: "alle", text: "Alle" },
  { wert: "offen", text: "Offen" },
  { wert: "angebot", text: "Angebot" },
  { wert: "auftrag", text: "Auftrag" },
  { wert: "kein_auftrag", text: "Kein Auftrag" },
];

/**
 * Erstaufnahmen: Besichtigungen vor dem Angebot (Kundenwunsch, Fotos,
 * Skizzen, Messwerte). Daraus wird ein Angebot — und erst bei Annahme ein
 * Projekt (docs/ABLAUF-TERMIN-BIS-RECHNUNG.md).
 */
export default function Erstaufnahmen() {
  const { data = [], isLoading } = useErstaufnahmen();
  const [params, setParams] = useSearchParams();
  const filter = (FILTER.find((f) => f.wert === params.get("filter"))?.wert ?? "alle") as ErstaufnahmeStatus | "alle";
  const [suche, setSuche] = useState("");

  const anzahl = useMemo(() => {
    const n: Record<string, number> = { alle: data.length };
    data.forEach((e) => { n[e.status] = (n[e.status] ?? 0) + 1; });
    return n;
  }, [data]);

  const liste = useMemo(() => {
    const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
    return data.filter((e) => (filter === "alle" || e.status === filter) && woerter.every((w) =>
      [e.nummer, e.kunden?.name, e.kundenwunsch, e.notizen, e.strasse, e.ort].filter(Boolean).join(" ").toLowerCase().includes(w)));
  }, [data, filter, suche]);

  return (
    <Seite
      titel="Erstaufnahmen"
      untertitel="Besichtigung vor dem Angebot — das Projekt kommt erst mit dem Auftrag"
      aktionen={<Button asChild className="h-10 gap-1.5"><Link to="/erstaufnahmen/neu"><Plus className="h-4 w-4" /> Neu</Link></Button>}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
        {FILTER.map((f) => (
          <button key={f.wert} type="button" role="radio" aria-checked={filter === f.wert}
            onClick={() => setParams(f.wert === "alle" ? {} : { filter: f.wert }, { replace: true })}
            className={cn("h-10 rounded-full border px-3.5 text-sm font-medium", filter === f.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
            {f.text} <span className="ml-1 text-xs text-muted-foreground">{anzahl[f.wert] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Kunde, Ort, Wunsch, Nummer" className="h-11 pl-9 text-base sm:text-sm"
          inputMode="search" aria-label="Erstaufnahmen suchen" />
      </div>

      {!isLoading && !liste.length && (
        <Leer icon={ClipboardList} text={data.length ? "Nichts gefunden." : "Noch keine Erstaufnahme. Im Kalender auf einer Besichtigung „Erstaufnahme“ tippen — oder hier „Neu“."} />
      )}
      {liste.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((e) => (
            <li key={e.id}>
              <Link to={`/erstaufnahmen/${e.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 hover:bg-muted/50" data-ea={e.nummer}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {e.kunden?.name ?? "Ohne Kunde"}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{e.nummer}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[e.kundenwunsch?.split("\n")[0], eaAdresse(e)].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusPille eintrag={ERSTAUFNAHME_STATUS[e.status as ErstaufnahmeStatus]} />
                  <span className="text-xs text-muted-foreground">{datum(e.created_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Seite>
  );
}
