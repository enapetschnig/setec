import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Palmtree, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { datum as datumText, isoZuDatum } from "@/lib/format";
import { abwesenheitTon } from "@/lib/terminplaner";
import { ABWESENHEIT_ART, type AbwesenheitArt } from "@/lib/types";
import { cn } from "@/lib/utils";

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const kurz = (iso: string) => `${WT[(isoZuDatum(iso).getDay() + 6) % 7]} ${datumText(iso).slice(0, 6)}`;
const TON = {
  rot: "bg-status-rot text-status-rot-fg",
  gruen: "bg-status-gruen text-status-gruen-fg",
  gelb: "bg-status-gelb text-status-gelb-fg",
} as const;

/** Was angetippt bzw. aufgezogen wurde — eine Person, ein Tag oder Zeitraum, evtl. eine Uhrzeit */
export type LeerWahl = {
  x: number;
  y: number;
  wer: string;
  datum: string;
  bisDatum?: string;
  von?: string;
  bis?: string;
  /** Liegt dort schon eine Abwesenheit? Dann: bearbeiten, löschen oder trotzdem ein Einsatz */
  abwesenheit?: { id: string | null; art: string | null; von: string | null; bis: string | null } | null;
};

/**
 * Kleine Wahl an der angetippten Stelle (nur Chef): „Einsatz“ oder
 * „Abwesenheit“ — auf einer Abwesenheit stattdessen bearbeiten/löschen.
 */
export function ZellWahl({ wahl, onEinsatz, onAbwesenheit, onAbwBearbeiten, onAbwLoeschen, onZu }: {
  wahl: LeerWahl;
  onEinsatz: () => void;
  onAbwesenheit: () => void;
  onAbwBearbeiten: (id: string) => void;
  onAbwLoeschen: (id: string) => void;
  onZu: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: wahl.x + 8, top: wahl.y + 8 });
  const [loeschFrage, setLoeschFrage] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const unten = window.innerHeight - r.height - 8;
    setLage({
      left: Math.max(8, Math.min(wahl.x + 8, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(unten, wahl.y + 8 > unten ? wahl.y - r.height - 8 : wahl.y + 8)),
    });
    setLoeschFrage(false);
  }, [wahl.x, wahl.y]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onZu(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    // erst nach dem Loslassen scharf schalten — sonst schließt das eigene Antippen sofort
    const t = window.setTimeout(() => document.addEventListener("pointerdown", weg, true), 0);
    window.addEventListener("keydown", taste);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", weg, true); window.removeEventListener("keydown", taste); };
  }, [onZu]);

  const a = wahl.abwesenheit;
  const art = a ? ABWESENHEIT_ART[a.art as AbwesenheitArt] : undefined;
  const zeit = `${kurz(wahl.datum)}${wahl.bisDatum && wahl.bisDatum > wahl.datum ? ` – ${kurz(wahl.bisDatum)}` : ""}${wahl.von && !wahl.bisDatum ? ` · ${wahl.von}–${wahl.bis}` : ""}`;

  return (
    <div ref={ref} role="dialog" aria-label="Was eintragen?" data-zell-wahl
      className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border-2 border-primary/40 bg-card text-sm shadow-xl" style={lage}>
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{wahl.wer}</p>
          <p className="text-xs text-muted-foreground">{zeit}</p>
        </div>
        <button type="button" onClick={onZu} className="-mr-1 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schließen"><X className="h-4 w-4" /></button>
      </div>
      {a?.id && (
        <div className="space-y-2 border-b px-3 py-2.5">
          <p className={cn("rounded px-2 py-1 text-xs font-semibold", TON[abwesenheitTon(a.art)])}>
            {art?.text ?? "Abwesend"}{a.von && a.bis ? ` · ${a.von === a.bis ? kurz(a.von) : `${kurz(a.von)} – ${kurz(a.bis)}`}` : ""}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-10 flex-1 gap-1.5" onClick={() => onAbwBearbeiten(a.id!)}><Pencil className="h-4 w-4" /> Bearbeiten</Button>
            {loeschFrage ? (
              <Button size="sm" variant="destructive" className="h-10 flex-1" onClick={() => onAbwLoeschen(a.id!)}>Wirklich löschen</Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-10 flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}><Trash2 className="h-4 w-4" /> Löschen</Button>
            )}
          </div>
        </div>
      )}
      <div className={cn("grid gap-1.5 p-2", a?.id ? "grid-cols-1" : "grid-cols-2")}>
        <Button className="h-12 gap-1.5" variant={a?.id ? "outline" : "default"} onClick={onEinsatz}>
          <CalendarPlus className="h-4 w-4" /> {a?.id ? "Trotzdem Einsatz" : "Einsatz"}
        </Button>
        {!a?.id && <Button className="h-12 gap-1.5" variant="outline" onClick={onAbwesenheit}><Palmtree className="h-4 w-4" /> Abwesenheit</Button>}
      </div>
    </div>
  );
}
