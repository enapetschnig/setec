import { createContext, useCallback, useContext, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { datum as datumText, euro } from "@/lib/format";
import { monatsGruppen, type Jahr } from "@/lib/jahre";
import { cn } from "@/lib/utils";

/**
 * Jahresansicht für alle Belegslisten (Rechnungen, Angebote,
 * Eingangsrechnungen, Offene Posten, Kontakt-Belege) — ein Bauteil, überall
 * gleich: Jahres-Chips „2026 | Archiv ▾“, Liste nach Monat mit Monatssumme,
 * Zeile mit Nummer, Name, Datum, Betrag rechts und Status-Pille,
 * Odoo-Altbestand als kleines graues Etikett. Logik in lib/jahre.ts.
 */

const aktuellesJahr = () => new Date().getFullYear();

/**
 * Gewähltes Jahr je Seite, gemerkt im Browser (`setec.jahr.<seite>`).
 * Ohne Eintrag das laufende Jahr; `null` = alle Jahre.
 */
export function useJahrWahl(seite: string): [Jahr, (j: Jahr) => void] {
  const key = `setec.jahr.${seite}`;
  const [jahr, setJahrState] = useState<Jahr>(() => {
    try {
      const w = localStorage.getItem(key);
      if (w === "alle") return null;
      const n = Number(w);
      return w && Number.isInteger(n) && n > 1900 && n <= aktuellesJahr() ? n : aktuellesJahr();
    } catch {
      return aktuellesJahr();
    }
  });
  const setJahr = useCallback((j: Jahr) => {
    setJahrState(j);
    try {
      if (j === aktuellesJahr()) localStorage.removeItem(key);
      else localStorage.setItem(key, j == null ? "alle" : String(j));
    } catch { /* privates Fenster: dann eben nicht gemerkt */ }
  }, [key]);
  return [jahr, setJahr];
}

/**
 * „2026 | Archiv ▾“ — das laufende Jahr als Chip, ältere Jahre und „Alle
 * Jahre“ im Archiv-Menü. `ueberAlle`: die Liste zeigt gerade ohnehin alle
 * Jahre (Suche, offene Posten) — dann ein Hinweis statt aktiver Auswahl.
 */
export function JahrWahl({
  jahre, jahr, onWahl, ueberAlle, className,
}: {
  /** Jahre aus den Daten, neueste zuerst (jahreAus) */
  jahre: number[];
  jahr: Jahr;
  onWahl: (j: Jahr) => void;
  /** z. B. „Suche in allen Jahren“ */
  ueberAlle?: string | null;
  className?: string;
}) {
  const aktuell = aktuellesJahr();
  const aeltere = jahre.filter((j) => j !== aktuell);
  const imArchiv = jahr !== aktuell;
  const chip = (an: boolean) => cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
    an && !ueberAlle ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted",
  );
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)} role="group" aria-label="Jahr">
      <button type="button" className={chip(jahr === aktuell)} aria-pressed={jahr === aktuell && !ueberAlle} onClick={() => onWahl(aktuell)}>
        <span className="zahl">{aktuell}</span>
      </button>
      {aeltere.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(imArchiv)} aria-pressed={imArchiv && !ueberAlle}>
              <Archive className="h-3.5 w-3.5" />
              {imArchiv ? <span className="zahl">{jahr ?? "Alle Jahre"}</span> : "Archiv"}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            {aeltere.map((j) => (
              <DropdownMenuItem key={j} onSelect={() => onWahl(j)} className="h-10 justify-between">
                <span className="zahl">{j}</span>{jahr === j && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => onWahl(null)} className="h-10 justify-between border-t">
              Alle Jahre{jahr == null && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {ueberAlle && (
        <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <Search className="h-3 w-3" />{ueberAlle}
        </span>
      )}
    </div>
  );
}

/** Kleines graues Etikett: aus Odoo übernommen (Altbestand) — keine eigene Farbe */
export function OdooEtikett({ className }: { className?: string }) {
  return (
    <span title="Altbestand — aus Odoo übernommen"
      className={cn("inline-flex shrink-0 items-center rounded border px-1 text-[10px] font-medium uppercase leading-4 tracking-wide text-muted-foreground", className)}>
      Odoo
    </span>
  );
}

// ── Liste ──────────────────────────────────────────────────────────────

/** Spalten am PC: Nummer | Datum | Name · Betreff | Status | Betrag | Pfeil */
const PC_SPALTEN = "grid grid-cols-[minmax(8rem,10rem)_5.75rem_minmax(0,1fr)_minmax(7rem,auto)_8rem_1rem] items-center gap-x-4";

type ListenKontext = { tabelle: boolean; inKarte: boolean };
const Kontext = createContext<ListenKontext>({ tabelle: false, inKarte: false });

/**
 * Eine weiße Karte: am PC Spaltenkopf, dann je Monat ein Band
 * („November 2026 · 12“ links, Monatssumme rechts) und die Zeilen.
 * `gruppieren = false` für Listen mit eigener Sortierung (z. B. nach Fälligkeit).
 */
export function MonatsListe<T>({
  eintraege, datum, betrag, schluessel, zeile, tabelle = false, gruppieren = true, kopf, kopfKlasse, fuss, rahmen = true,
}: {
  eintraege: T[];
  datum: (t: T) => string | null | undefined;
  /** Betrag für die Monatssumme, `null` = zählt nicht (Entwurf, Storno …) */
  betrag: (t: T) => number | null;
  schluessel: (t: T) => string;
  zeile: (t: T) => ReactNode;
  /** PC: Spalten statt Karte */
  tabelle?: boolean;
  gruppieren?: boolean;
  /** Spaltenüberschriften am PC (Standard: Nummer, Datum, Name, Status, Betrag) */
  kopf?: { nummer?: string; name?: string; status?: string; betrag?: string };
  /** Spaltenkopf einrücken, wenn Zeilen etwas vorne/hinten haben (Häkchen, Knöpfe) */
  kopfKlasse?: string;
  fuss?: ReactNode;
  /** false: in einer Karte (Kontakt) — nur Linie oben statt eigener Karte */
  rahmen?: boolean;
}) {
  const gruppen = gruppieren
    ? monatsGruppen(eintraege, datum, betrag)
    : [{ schluessel: "alle", titel: "", eintraege, summe: 0, anzahl: eintraege.length }];
  return (
    <Kontext.Provider value={{ tabelle, inKarte: !rahmen }}>
      <div className={rahmen ? "overflow-hidden rounded-lg border bg-card" : "border-t"}>
        {tabelle && (
          <div className={cn(PC_SPALTEN, "border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground", kopfKlasse)}>
            <span>{kopf?.nummer ?? "Nummer"}</span>
            <span>Datum</span>
            <span>{kopf?.name ?? "Name"}</span>
            <span>{kopf?.status ?? "Status"}</span>
            <span className="text-right">{kopf?.betrag ?? "Brutto"}</span>
            <span />
          </div>
        )}
        {gruppen.map((g, i) => (
          <section key={g.schluessel} aria-label={g.titel || undefined}>
            {gruppieren && (
              <div className={cn("flex items-baseline justify-between gap-3 bg-muted/40 px-4 py-1.5 text-xs", (i > 0 || tabelle) && "border-t", "border-b", !rahmen && "lg:px-5")}>
                <span className="font-semibold text-foreground">{g.titel} <span className="zahl font-normal text-muted-foreground">· {g.anzahl}</span></span>
                {g.summe !== 0 && <span className="zahl font-semibold text-foreground">{euro(g.summe)}</span>}
              </div>
            )}
            <ul className="divide-y">
              {g.eintraege.map((t) => <li key={schluessel(t)} className="flex flex-wrap items-stretch">{zeile(t)}</li>)}
            </ul>
          </section>
        ))}
      </div>
      {fuss}
    </Kontext.Provider>
  );
}

type Icon = ComponentType<{ className?: string; "aria-label"?: string }>;

/**
 * Eine Zeile — Handy: Name | Betrag, Nummer · Datum | Termin/netto,
 * Betreff | Etikett + Pille; PC (in einer MonatsListe mit `tabelle`): Spalten.
 */
export function BelegZeile({
  to, onClick, vorne, hinten, icon: I, nummer, name, unter, datum, betrag, betragUnter, pillen, odoo, durchgestrichen,
}: {
  to?: string;
  onClick?: () => void;
  /** z. B. Häkchen zum Überweisen — links außerhalb des Klickbereichs */
  vorne?: ReactNode;
  /** Knöpfe rechts (Offene Posten: Zahlung, Mahnen) — am Handy darunter */
  hinten?: ReactNode;
  icon?: Icon;
  /** leer: nur das Datum (Kontakt-Belege, wo die Nummer im Namen steht) */
  nummer?: ReactNode;
  name: ReactNode;
  /** zweite Zeile: Betreff, Projekt, Kategorie … */
  unter?: ReactNode;
  datum: string | null | undefined;
  betrag: ReactNode;
  betragUnter?: ReactNode;
  pillen?: ReactNode;
  odoo?: boolean;
  durchgestrichen?: boolean;
}) {
  const { tabelle, inKarte } = useContext(Kontext);
  const klasse = cn("flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
    inKarte && "lg:px-5");
  const betragKlasse = cn("zahl whitespace-nowrap font-semibold", durchgestrichen && "text-muted-foreground line-through");

  const etikett = odoo ? <OdooEtikett /> : null;

  const inhalt = tabelle ? (
    <div className={cn(PC_SPALTEN, "w-full text-sm")}>
      <span className="flex min-w-0 items-center gap-2">
        {I && <I className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="zahl truncate font-medium">{nummer}</span>
      </span>
      <span className="zahl whitespace-nowrap text-muted-foreground">{datumText(datum)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {unter && <span className="block truncate text-xs text-muted-foreground">{unter}</span>}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1">{etikett}{pillen}</span>
      <span className="text-right">
        <span className={cn("block", betragKlasse)}>{betrag}</span>
        {betragUnter && <span className="zahl block truncate text-xs text-muted-foreground">{betragUnter}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  ) : (
    <>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[0.9375rem] font-medium leading-snug">{name}</p>
          <span className={cn("shrink-0 text-sm", betragKlasse)}>{betrag}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {I && <I className="h-3.5 w-3.5 shrink-0 self-center" />}
            {nummer && <span className="zahl truncate">{nummer}</span>}
            {nummer && datum && <span aria-hidden>·</span>}
            {datum && <span className="zahl shrink-0">{datumText(datum)}</span>}
          </span>
          {betragUnter && <span className="zahl shrink-0">{betragUnter}</span>}
        </div>
        {(unter || etikett || pillen) && (
          <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{unter}</span>
            {(etikett || pillen) && <span className="flex max-w-[70%] shrink-0 flex-wrap items-center justify-end gap-1">{etikett}{pillen}</span>}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  return (
    <>
      {vorne && <span className="flex shrink-0 items-center pl-4">{vorne}</span>}
      {to ? <Link to={to} className={klasse}>{inhalt}</Link> : <button type="button" onClick={onClick} className={klasse}>{inhalt}</button>}
      {hinten && <div className="flex basis-full items-center px-4 pb-3 sm:basis-auto sm:py-2 sm:pl-0">{hinten}</div>}
    </>
  );
}
