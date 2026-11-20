import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, ListChecks, Minus, Package, PenLine, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormularDialog } from "@/components/FormularDialog";
import { Leer } from "@/components/Bausteine";
import { euro, zahl } from "@/lib/format";
import { useArtikelSuche } from "@/components/material/ArtikelSuche";
import { artikelVk, leistungPreis } from "@/lib/preise";
import { normalisieren, RAUM_VORSCHLAEGE } from "@/lib/sprachParser";
import type { Artikel, Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { gruppenEnde, mengeInGruppe, mengeVon, type EditorPosition, type KatalogLeistung } from "./editor";

/** Wie oft steckt ein Artikel schon in der Gruppe? */
function artikelInGruppe(positionen: EditorPosition[], titelId: string | null, artikelId: string): number {
  const start = titelId ? positionen.findIndex((p) => p.id === titelId) + 1 : 0;
  const ende = gruppenEnde(positionen, titelId);
  return positionen.slice(start, ende).reduce((s, p) => (p.artikel_id === artikelId ? s + mengeVon(p) : s), 0);
}

/**
 * „+ Artikel“: EIN Dialog für alles, was ins Angebot kommt. Leer zeigt er die
 * Leistungen (Artikel samt Montagezeit) als Kacheln nach Kategorie; beim
 * Tippen sucht er zusätzlich im Artikelstamm, und ohne Treffer wird der Text
 * eine freie Position. Antippen = +1 im gewählten Raum, die Zahl zeigt, wie
 * viele dort schon stehen. Der Raum lässt sich oben wechseln.
 */
export function LeistungDialog({
  open, onOpenChange, katalog, laedt, positionen, titelId, onTitelWahl, onNeuerTitel, onPlus, onMinus, onArtikel, onFrei, onKatalog, firma, stundensatz,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  katalog: KatalogLeistung[];
  laedt: boolean;
  positionen: EditorPosition[];
  titelId: string | null;
  onTitelWahl: (id: string | null) => void;
  /** Neuen Titel mit diesem Namen anlegen und gleich wählen */
  onNeuerTitel: (name: string) => void;
  onPlus: (l: KatalogLeistung) => void;
  onMinus: (l: KatalogLeistung) => void;
  onArtikel: (a: Artikel) => void;
  /** Freie Position mit diesem Text (Preis trägt man danach ein) */
  onFrei: (text: string) => void;
  /** Artikel nach Kategorien blättern */
  onKatalog: () => void;
  firma: Firma | null;
  stundensatz: number;
}) {
  const [suche, setSuche] = useState("");
  useEffect(() => { if (open) setSuche(""); }, [open]);
  const such = suche.trim().length >= 2 ? suche.trim() : "";
  const { data: artikel = [], isFetching: artikelLaedt } = useArtikelSuche(such, 12);
  // Neuer Raum direkt in der Chip-Reihe — kein eigener Dialog
  const [neuRaum, setNeuRaum] = useState<string | null>(null);
  const raumAnlegen = () => {
    if (neuRaum?.trim()) onNeuerTitel(neuRaum.trim());
    setNeuRaum(null);
  };
  const titel = positionen.filter((p) => p.art === "titel");

  const gruppen = useMemo(() => {
    const q = normalisieren(suche.trim());
    const treffer = katalog.filter((l) => !q
      || q.split(/\s+/).every((w) => normalisieren(`${l.nummer ?? ""} ${l.kurztext} ${l.suchwoerter ?? ""} ${l.kategorie}`).includes(w)));
    const map = new Map<string, KatalogLeistung[]>();
    treffer.forEach((l) => map.set(l.kategorie || "Sonstiges", [...(map.get(l.kategorie || "Sonstiges") ?? []), l]));
    return [...map.entries()];
  }, [katalog, suche]);

  const gewaehlt = titel.find((t) => t.id === titelId);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Artikel hinzufügen"
      beschreibung={`Leistungen (mit Montagezeit) und Artikel — ${gewaehlt ? `landet unter „${gewaehlt.bezeichnung}“, ` : ""}antippen = +1`}
      breite="breit"
      fuss={<Button className="h-12 sm:min-w-40" onClick={() => onOpenChange(false)}>Fertig</Button>}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen – Steckdose, FI, Wallbox, Artikelnummer …"
          className="h-12 pl-9"
          inputMode="search"
          enterKeyHint="search"
        />
      </div>

      {/* Raum wählen */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-2 pb-1">
          {titel.length > 0 && <RaumChip aktiv={!titelId} onClick={() => onTitelWahl(null)}>Ohne Raum</RaumChip>}
          {titel.map((t) => (
            <RaumChip key={t.id} aktiv={t.id === titelId} onClick={() => onTitelWahl(t.id)}>{t.bezeichnung || "Ohne Namen"}</RaumChip>
          ))}
          {neuRaum == null ? (
            <button
              type="button"
              onClick={() => setNeuRaum("")}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-dashed px-3.5 text-sm font-medium text-primary hover:border-primary"
            >
              <Plus className="h-4 w-4" /> Raum
            </button>
          ) : (
            <Input
              autoFocus
              value={neuRaum}
              onChange={(e) => setNeuRaum(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); raumAnlegen(); } if (e.key === "Escape") setNeuRaum(null); }}
              onBlur={raumAnlegen}
              list="raum-vorschlaege"
              placeholder="Raum, Enter"
              aria-label="Neuer Raum"
              enterKeyHint="done"
              className="h-10 w-44 shrink-0 rounded-full"
            />
          )}
          <datalist id="raum-vorschlaege">{RAUM_VORSCHLAEGE.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
      </div>

      {laedt && <p className="py-6 text-center text-sm text-muted-foreground">Katalog wird geladen …</p>}
      {!laedt && !such && gruppen.length === 0 && (
        <Leer icon={ListChecks} text={katalog.length ? "Keine Leistung gefunden." : "Noch keine Leistungen — oben einen Artikel suchen."} />
      )}
      {!such && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={onKatalog}><LayoutGrid className="h-4 w-4" /> Artikel nach Kategorie</Button>
          <Button variant="outline" className="h-11" onClick={() => onFrei("")}><PenLine className="h-4 w-4" /> Freie Position</Button>
        </div>
      )}

      {gruppen.map(([kategorie, liste]) => (
        <section key={kategorie} className="space-y-2">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{kategorie}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {liste.map((l) => {
              const anzahl = mengeInGruppe(positionen, titelId, l.id);
              // Staffel: Preis zur Menge, die schon im Angebot steht
              const preis = leistungPreis(l, l.leistung_material ?? [], firma, stundensatz, anzahl || 1);
              return (
                <div key={l.id} className={cn("relative rounded-lg border bg-card transition-colors", anzahl > 0 && "border-primary bg-primary-soft")}>
                  <button
                    type="button"
                    onClick={() => onPlus(l)}
                    className="flex min-h-[5.5rem] w-full flex-col justify-between gap-1.5 p-3 text-left active:scale-[0.98]"
                  >
                    <span lang="de" className="line-clamp-2 hyphens-auto break-words pr-7 text-sm font-medium leading-snug">{l.kurztext}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="zahl font-semibold text-foreground">{euro(preis)}</span> / {l.einheit}
                    </span>
                  </button>
                  {anzahl > 0 && (
                    <>
                      <span className="zahl pointer-events-none absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                        {zahl(anzahl)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onMinus(l)}
                        aria-label={`${l.kurztext} eins weniger`}
                        className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {such && (
        <section className="space-y-2" aria-label="Artikel">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Artikel{artikelLaedt ? " …" : ""}</h3>
          {!artikelLaedt && artikel.length === 0 && <p className="px-1 text-sm text-muted-foreground">Kein Artikel gefunden.</p>}
          <ul className="divide-y rounded-lg border bg-card">
            {artikel.map((a) => {
              const anzahl = artikelInGruppe(positionen, titelId, a.id);
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onArtikel(a)}
                    className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted/40", anzahl > 0 && "bg-primary-soft")}>
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug [overflow-wrap:anywhere]">{a.bezeichnung}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[a.hersteller, a.artikelnummer].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="zahl shrink-0 text-right text-sm">
                      <span className="block font-semibold">{euro(artikelVk(a, firma))}</span>
                      <span className="block text-xs text-muted-foreground">/ {a.einheit || "Stk"}</span>
                    </span>
                    {anzahl > 0 && (
                      <span className="zahl inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{zahl(anzahl)}</span>
                    )}
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => { onFrei(such); setSuche(""); }} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted/40">
                <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm">„{such}“ als freie Position — Preis selbst eintragen</span>
              </button>
            </li>
          </ul>
        </section>
      )}
    </FormularDialog>
  );
}

function RaumChip({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        aktiv ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60",
      )}
    >
      {children}
    </button>
  );
}
