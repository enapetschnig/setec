import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { adressAnfrage, photonLesen, photonUrl, type AdressVorschlag } from "@/lib/adresse";
import { cn } from "@/lib/utils";

/**
 * Straßenfeld mit Adress-Vorschlägen: tippen („Hauptstr 10 Kindb…“), Treffer
 * antippen → Straße mit Hausnummer, PLZ und Ort stehen so drin, wie das Navi
 * sie kennt. Freies Tippen bleibt möglich (Neubau, Hof ohne Hausnummer).
 */
export function AdresseFeld({
  id, wert, onChange, onWaehlen, className, placeholder = "Straße und Hausnummer", ...rest
}: {
  id?: string;
  wert: string;
  onChange: (strasse: string) => void;
  onWaehlen: (a: AdressVorschlag) => void;
  className?: string;
  placeholder?: string;
} & Pick<React.ComponentProps<typeof Input>, "autoFocus" | "aria-label">) {
  const listeId = useId();
  const [vorschlaege, setVorschlaege] = useState<AdressVorschlag[]>([]);
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  /** nur nach echtem Tippen suchen — nicht beim Öffnen oder nach dem Wählen */
  const getippt = useRef(false);
  const feld = useRef<HTMLInputElement>(null);

  const anfrage = adressAnfrage(wert);
  useEffect(() => {
    if (!getippt.current || !anfrage) {
      setVorschlaege([]);
      setLaedt(false);
      return;
    }
    const abbruch = new AbortController();
    setLaedt(true);
    const zeit = setTimeout(async () => {
      try {
        const antwort = await fetch(photonUrl(anfrage), { signal: abbruch.signal, headers: { Accept: "application/json" } });
        if (!antwort.ok) throw new Error(String(antwort.status));
        const liste = photonLesen(await antwort.json(), anfrage);
        setVorschlaege(liste);
        setAktiv(-1);
        // Nur aufklappen, wenn noch jemand im Feld ist (sonst deckt die Liste PLZ und Ort zu)
        setOffen(document.activeElement === feld.current);
      } catch {
        // Kein Netz oder Dienst überlastet: einfach ohne Vorschläge weiter
        if (!abbruch.signal.aborted) setVorschlaege([]);
      } finally {
        if (!abbruch.signal.aborted) setLaedt(false);
      }
    }, 350);
    return () => { clearTimeout(zeit); abbruch.abort(); };
  }, [anfrage]);

  const waehlen = (a: AdressVorschlag) => {
    getippt.current = false;
    setOffen(false);
    setVorschlaege([]);
    onWaehlen(a);
  };

  const zeigen = offen && vorschlaege.length > 0;

  return (
    <div className="relative">
      <Input
        ref={feld}
        id={id}
        className={cn("pr-9", className)}
        value={wert}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={zeigen}
        aria-controls={listeId}
        aria-autocomplete="list"
        {...rest}
        onChange={(e) => { getippt.current = true; onChange(e.target.value); }}
        onFocus={() => vorschlaege.length && setOffen(true)}
        // Antippen in der Liste muss noch ankommen (am Handy kommt der Blur zuerst)
        onBlur={() => setTimeout(() => setOffen(false), 200)}
        onKeyDown={(e) => {
          if (!zeigen) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAktiv((i) => Math.min(i + 1, vorschlaege.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAktiv((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && aktiv >= 0) { e.preventDefault(); waehlen(vorschlaege[aktiv]); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOffen(false); }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {laedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
      </span>
      {zeigen && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-card shadow-lg">
          <ul id={listeId} role="listbox" aria-label="Adress-Vorschläge" className="max-h-72 divide-y overflow-y-auto">
            {vorschlaege.map((a, i) => (
              <li key={`${a.strasse}|${a.plz}|${a.ort}`} role="option" aria-selected={i === aktiv}>
                <button type="button" tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(a)}
                  className={cn("flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60", i === aktiv && "bg-muted/60")}>
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.strasse}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.plz} {a.ort}{a.zusatz && ` · ${a.zusatz}`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-1 text-right text-[11px] text-muted-foreground">Adressen © OpenStreetMap</p>
        </div>
      )}
    </div>
  );
}
