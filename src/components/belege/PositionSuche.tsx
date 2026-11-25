import { useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CornerDownLeft, ListChecks, Package, Replace } from "lucide-react";
import { TextareaWachsend } from "@/components/ui/textarea-wachsend";
import { useArtikelSuche } from "@/components/material/ArtikelSuche";
import { useSitzung } from "@/hooks/useSitzung";
import { euro } from "@/lib/format";
import { artikelVk, leistungPreis } from "@/lib/preise";
import type { Artikel, Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { artikelPosition, leistungenFinden, leistungPosition, mengeVon, positionTauschen, type EditorPosition, type KatalogLeistung } from "./editor";

export type SuchTreffer = { art: "leistung"; l: KatalogLeistung } | { art: "artikel"; a: Artikel };

/** Leistung oder Artikel als Zeile einer Trefferliste (Name, Nummer, Preis je Einheit) */
export function TrefferInhalt({ t, menge, stundensatz }: { t: SuchTreffer; menge: number; stundensatz: number }) {
  const { firma } = useSitzung();
  if (t.art === "leistung") {
    return (
      <>
        <ListChecks className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 line-clamp-2 break-words leading-snug" title={t.l.kurztext}>{t.l.kurztext}</span>
        <span className="zahl shrink-0 text-muted-foreground">{euro(leistungPreis(t.l, t.l.leistung_material ?? [], firma, stundensatz, menge))} / {t.l.einheit}</span>
      </>
    );
  }
  return (
    <>
      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words leading-snug" title={t.a.bezeichnung}>{t.a.bezeichnung}</span>
        <span className="block truncate text-xs text-muted-foreground">{[t.a.hersteller, t.a.artikelnummer].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="zahl shrink-0 text-muted-foreground">{euro(artikelVk(t.a, firma))} / {t.a.einheit || "Stk"}</span>
    </>
  );
}

/** Leistungen und Artikel zum getippten Text — nur solange `aktiv` (sonst keine Abfrage) */
export function useTauschSuche(text: string, katalog: KatalogLeistung[], aktiv: boolean) {
  const such = aktiv ? text.trim() : "";
  const { data: artikel = [], wartet } = useArtikelSuche(such.length >= 2 ? such : "", 6, null, aktiv && such.length >= 2);
  const sucht = such.length >= 2 && wartet;
  const treffer = useMemo<SuchTreffer[]>(() => {
    if (such.length < 2) return [];
    return [
      ...leistungenFinden(katalog, such).map((l): SuchTreffer => ({ art: "leistung", l })),
      ...(sucht ? [] : artikel.slice(0, 6).map((a): SuchTreffer => ({ art: "artikel", a }))),
    ];
  }, [such, katalog, artikel, sucht]);
  return { treffer, laeuft: sucht };
}

/** Die Zeile mit dem gewählten Treffer ersetzen — Platz, Menge und optional/alternativ bleiben */
export function mitTreffer(
  p: EditorPosition, t: SuchTreffer,
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined, stundensatz: number,
): EditorPosition {
  const neu = t.art === "leistung" ? leistungPosition(t.l, firma, stundensatz, mengeVon(p)) : artikelPosition(t.a, firma);
  return positionTauschen(p, neu);
}

/** Liste der Treffer zum Tauschen (PC im Aufklapp-Fenster, Handy im Formular) */
export function TauschListe({
  treffer, laeuft, markiert, setMarkiert, onWahl, menge, stundensatz, id, className,
}: {
  treffer: SuchTreffer[];
  laeuft: boolean;
  markiert: number;
  setMarkiert: (i: number) => void;
  onWahl: (t: SuchTreffer) => void;
  menge: number;
  stundensatz: number;
  id: string;
  className?: string;
}) {
  const titelVorher = (i: number) => i === 0 || treffer[i - 1].art !== treffer[i].art;
  return (
    <ul id={id} role="listbox" aria-label="Position ersetzen durch" className={cn("text-sm", className)}>
      <li className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
        <Replace className="h-3.5 w-3.5" /> Antippen ersetzt diese Position — Menge und Platz bleiben
      </li>
      {treffer.map((t, i) => (
        <li key={t.art === "leistung" ? `l${t.l.id}` : `a${t.a.id}`}>
          {titelVorher(i) && (
            <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t.art === "leistung" ? "Leistungen" : "Artikel"}
            </p>
          )}
          <button type="button" role="option" aria-selected={i === markiert}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onWahl(t)} onMouseEnter={() => setMarkiert(i)}
            className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left", i === markiert && "bg-primary-soft")}>
            <TrefferInhalt t={t} menge={menge} stundensatz={stundensatz} />
            {i === markiert && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </button>
        </li>
      ))}
      {laeuft && <li className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Artikel werden gesucht …</li>}
      {!laeuft && !treffer.length && <li className="px-2.5 py-2 text-xs text-muted-foreground">Nichts gefunden — der Text bleibt, wie er ist.</li>}
    </ul>
  );
}

/**
 * Bezeichnung einer Zeile am PC: bleibt ein normales Textfeld (Tippfehler ausbessern), zeigt beim Tippen aber
 * passende Leistungen und Artikel. Erst ein Klick (oder ↓ + Enter) ersetzt die Position — ohne Wahl bleibt nur der Text.
 */
export function BezeichnungSuche({
  p, katalog, stundensatz, onText, onTausch, ariaLabel,
}: {
  p: EditorPosition;
  katalog: KatalogLeistung[];
  stundensatz: number;
  onText: (text: string) => void;
  onTausch: (neu: EditorPosition) => void;
  ariaLabel: string;
}) {
  const { firma } = useSitzung();
  const [suchen, setSuchen] = useState(false);
  const [markiert, setMarkiert] = useState(-1);
  const anker = useRef<HTMLDivElement>(null);
  // Text vor dem ersten Tastendruck — Escape holt ihn zurück (Suche abgebrochen)
  const vorher = useRef<string | null>(null);
  const { treffer, laeuft } = useTauschSuche(p.bezeichnung, katalog, suchen);
  const zeigen = suchen && p.bezeichnung.trim().length >= 2;
  const listeId = `tausch-${p.id}`;

  const schliessen = () => { setSuchen(false); setMarkiert(-1); vorher.current = null; };
  /** Escape: Suche abbrechen, der Text von vorher kommt zurück */
  const abbrechen = () => { if (vorher.current != null) onText(vorher.current); schliessen(); };
  const waehlen = (t: SuchTreffer) => { onTausch(mitTreffer(p, t, firma, stundensatz)); schliessen(); };
  const taste = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Die Bezeichnung bricht um, bleibt aber eine Zeile Text — Enter macht nie einen Zeilenumbruch
    if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault();
    if (!zeigen) return;
    if (e.key === "ArrowDown" && treffer.length) { e.preventDefault(); setMarkiert((m) => Math.min(m + 1, treffer.length - 1)); }
    else if (e.key === "ArrowUp" && treffer.length) { e.preventDefault(); setMarkiert((m) => Math.max(m - 1, -1)); }
    else if (e.key === "Enter") {
      // Enter ohne markierten Treffer behält den getippten Text
      e.preventDefault();
      if (markiert >= 0 && treffer[markiert]) waehlen(treffer[markiert]);
      else schliessen();
    }
    else if (e.key === "Escape") { e.preventDefault(); abbrechen(); }
  };

  return (
    <PopoverPrimitive.Root open={zeigen} onOpenChange={(o) => { if (!o) schliessen(); }}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={anker}>
          <TextareaWachsend
            value={p.bezeichnung}
            onChange={(e) => { if (vorher.current == null) vorher.current = p.bezeichnung; onText(e.target.value); setSuchen(true); setMarkiert(-1); }}
            onBlur={() => window.setTimeout(schliessen, 150)}
            onKeyDown={taste}
            className="py-[7px]"
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={zeigen}
            aria-controls={zeigen ? listeId : undefined}
            autoComplete="off"
          />
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          // Radix setzt role="dialog" — das ist hier nur eine Trefferliste (listbox darin). Sonst hält Strg+S im
          // Beleg-Editor sie für einen offenen Dialog und speichert nicht, solange getippt wird.
          role="presentation"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Radix fängt Escape vor dem Feld ab — dort abbrechen, sonst wäre der alte Text schon vergessen
          onEscapeKeyDown={(e) => { e.preventDefault(); abbrechen(); }}
          onInteractOutside={(e) => { if (anker.current?.contains(e.target as Node)) e.preventDefault(); }}
          className="z-50 max-h-[26rem] w-[min(52rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <TauschListe id={listeId} treffer={treffer} laeuft={laeuft} markiert={markiert} setMarkiert={setMarkiert} onWahl={waehlen}
            menge={mengeVon(p)} stundensatz={stundensatz} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
