import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Truck } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { KundeDialog } from "@/components/stamm/KundeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKunden } from "@/hooks/useDaten";
import { istLieferant } from "@/components/kontakte/kontaktLogik";
import { cn } from "@/lib/utils";

/**
 * Lieferant aus den angelegten Lieferanten-Kontakten wählen (oder gleich neu
 * anlegen) — keine Tippfehler mehr am Artikel. Gespeichert wird weiter der
 * Name als Text (Artikel, Bestellung, Rabatte hängen am Namen). Ein alter
 * Name, der noch kein Kontakt ist, bleibt wählbar.
 */
export function LieferantWahl({
  id, wert, onChange, ohne = [], eigen, className,
}: {
  id?: string;
  /** Name des Lieferanten ("" = keiner) */
  wert: string;
  onChange: (name: string) => void;
  /** nicht anbieten (schon eingetragen) */
  ohne?: string[];
  /** Eintrag für „kein Lieferant“, z. B. „Eigen“ */
  eigen?: string;
  className?: string;
}) {
  const { data: alle = [] } = useKunden();
  const lieferanten = useMemo(() => alle.filter((k) => k.art === "lieferant"), [alle]);
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [neuName, setNeuName] = useState<string | null>(null);

  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const kontakt = wert.trim() ? lieferanten.find((k) => istLieferant(k, wert)) : undefined;
  const istEigen = !!eigen && gleich(wert, eigen);
  const fremd = !!wert.trim() && !kontakt && !istEigen;

  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  const treffer = lieferanten
    .filter((k) => !ohne.some((o) => istLieferant(k, o)) || k === kontakt)
    .filter((k) => woerter.every((w) => [k.name, ...(k.namen ?? []), k.ort].filter(Boolean).join(" ").toLowerCase().includes(w)));

  const waehlen = (name: string) => {
    onChange(name);
    setOffen(false);
  };

  return (
    <>
      <button id={id} type="button" onClick={() => { setSuche(""); setOffen(true); }}
        className={cn("flex h-11 w-full items-center gap-3 rounded-md border bg-background px-3 text-left transition-colors hover:bg-muted/50", className)}>
        <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !wert.trim() && "text-muted-foreground")}>
          {kontakt ? kontakt.name : wert.trim() || "Lieferant wählen"}
          {fremd && <span className="text-xs text-muted-foreground"> · nicht unter Kontakte</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <FormularDialog open={offen} onOpenChange={setOffen} titel="Lieferant wählen"
        beschreibung="Aus den Lieferanten unter Kontakte">
        <div className="max-w-xl space-y-3">
          <Button variant="secondary" className="h-12 w-full justify-start gap-2"
            onClick={() => { setOffen(false); setNeuName(suche.trim()); }}>
            <Plus className="h-4 w-4" /> Neuer Lieferant{suche.trim() && <span className="truncate">: „{suche.trim()}“</span>}
          </Button>
          {lieferanten.length > 6 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Lieferant suchen" className="h-12 pl-9"
                inputMode="search" autoComplete="off" aria-label="Lieferanten suchen" />
            </div>
          )}
          <div className="divide-y rounded-lg border bg-card" role="listbox" aria-label="Lieferanten">
            {eigen && !woerter.length && (
              <Zeile name={`${eigen} (kein Lieferant)`} gewaehlt={istEigen} onClick={() => waehlen(eigen)} />
            )}
            {fremd && !woerter.length && (
              <Zeile name={wert.trim()} unter="bisher am Artikel · nicht unter Kontakte" gewaehlt onClick={() => setOffen(false)} />
            )}
            {treffer.map((k) => (
              <Zeile key={k.id} name={k.name} unter={k.ort ?? undefined} gewaehlt={k === kontakt} onClick={() => waehlen(k.name)} />
            ))}
            {treffer.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {lieferanten.length ? "Kein Lieferant gefunden" : "Noch keine Lieferanten unter Kontakte – oben neu anlegen."}
              </p>
            )}
          </div>
        </div>
      </FormularDialog>

      <KundeDialog open={neuName !== null} onOpenChange={(o) => { if (!o) setNeuName(null); }} kunde={null}
        vorgabeName={neuName ?? ""} vorgabeArt="lieferant" onGespeichert={(k) => onChange(k.name)} />
    </>
  );
}

function Zeile({ name, unter, gewaehlt, onClick }: { name: string; unter?: string; gewaehlt: boolean; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={gewaehlt} onClick={onClick}
      className={cn("flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60", gewaehlt && "bg-primary-soft")}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {unter && <span className="block truncate text-xs text-muted-foreground">{unter}</span>}
      </span>
    </button>
  );
}
