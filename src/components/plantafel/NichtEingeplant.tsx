import { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderKanban, Search, X } from "lucide-react";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { nichtEingeplant } from "@/lib/kalender";
import { projektFarbe } from "@/lib/plantafel";
import { projekteSuchen } from "@/lib/projektSuche";
import { cn } from "@/lib/utils";

/** Wohin ein Projekt gezogen wurde: Spalte (Person) und Tag */
export type Ablage = { spalte: string; tag: string };

/**
 * Rechts im Kalender (PC, Chef) auf Knopfdruck statt des Monatskalenders:
 * Projekte „In Arbeit“ ohne Einsatz ab heute. Auf eine Person an einem Tag
 * ziehen = Montage bis Freitag, antippen = Formular mit dem Projekt. Die Suche
 * findet alle „In Arbeit“, auch schon eingeplante — eines im Angebot nicht
 * (Montage erst nach der Annahme, wie im Termin-Formular).
 */
export function NichtEingeplant({ projekte, eingeplant, onAblegen, onAntippen, onZu }: {
  projekte: ProjektMitKunde[];
  eingeplant: Set<string>;
  onAblegen: (projektId: string, ziel: Ablage) => void;
  onAntippen: (projektId: string) => void;
  /** zurück zum Monatskalender */
  onZu: () => void;
}) {
  const [suche, setSuche] = useState("");
  const [zug, setZug] = useState<{ id: string; x: number; y: number; bewegt: boolean } | null>(null);
  const zugRef = useRef(zug);
  zugRef.current = zug;
  const ungeplant = nichtEingeplant(projekte, eingeplant);
  const q = suche.trim();
  const liste = (q ? projekteSuchen(projekte.filter((p) => p.status === "aktiv"), q) : ungeplant).slice(0, 60);

  useEffect(() => {
    if (!zug) return;
    const x0 = zug.x, y0 = zug.y;
    const bewegen = (e: PointerEvent) => {
      const z = zugRef.current;
      if (!z) return;
      setZug({ ...z, x: e.clientX, y: e.clientY, bewegt: z.bewegt || Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 5 });
    };
    const los = (e: PointerEvent) => {
      const z = zugRef.current;
      setZug(null);
      if (!z) return;
      if (!z.bewegt) { onAntippen(z.id); return; }
      const zelle = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-zelle]") as HTMLElement | null;
      if (zelle?.dataset.zelle && zelle.dataset.tag) onAblegen(z.id, { spalte: zelle.dataset.zelle, tag: zelle.dataset.tag });
    };
    const abbrechen = () => setZug(null);
    const halt = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", abbrechen);
    document.addEventListener("touchmove", halt, { passive: false });
    return () => {
      window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", los);
      window.removeEventListener("pointercancel", abbrechen); document.removeEventListener("touchmove", halt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zug !== null]);

  /** Maus: sofort ziehen. Tablet: kurz halten = ziehen, tippen = Formular, wischen = rollen */
  const runter = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.pointerType !== "touch") { setZug({ id, x: e.clientX, y: e.clientY, bewegt: false }); return; }
    const x0 = e.clientX, y0 = e.clientY;
    let timer = 0;
    const weg = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", bew); window.removeEventListener("pointerup", auf); window.removeEventListener("pointercancel", weg);
    };
    const bew = (ev: PointerEvent) => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 10) weg(); };
    const auf = () => { weg(); onAntippen(id); };
    window.addEventListener("pointermove", bew); window.addEventListener("pointerup", auf); window.addEventListener("pointercancel", weg);
    timer = window.setTimeout(() => { weg(); navigator.vibrate?.(25); setZug({ id, x: x0, y: y0, bewegt: true }); }, 350);
  };

  const zahl = (
    <span className={cn("rounded-full px-1.5 text-xs font-semibold", ungeplant.length ? "bg-status-gelb text-status-gelb-fg" : "bg-muted text-muted-foreground")}>{ungeplant.length}</span>
  );
  const gezogen = zug?.bewegt ? projekte.find((p) => p.id === zug.id) : undefined;

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col border-l border-t bg-card xl:w-64" aria-label="Noch nicht eingeplant">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm font-semibold">Noch nicht eingeplant</span>
          {zahl}
          <button type="button" onClick={onZu} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Wieder den Monatskalender zeigen" title="Wieder den Monatskalender zeigen"><X className="h-4 w-4" /></button>
        </div>
        <label className="relative mx-3 mt-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Projekt, Kunde, Ort …" aria-label="Projekt suchen"
            className="h-10 w-full rounded-md border bg-background pl-8 pr-2 text-base [@media(pointer:fine)]:text-sm" />
        </label>
        <p className="px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
          {q ? "In Arbeit, auch eingeplante" : "In Arbeit, ohne Einsatz ab heute"} — auf eine Person ziehen oder antippen
        </p>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {liste.map((p) => {
            const ort = p.ort ?? p.kunden?.ort;
            return (
              <li key={p.id}>
                <div onPointerDown={(e) => runter(p.id, e)} data-projekt-ziehen={p.id}
                  title={`${p.nummer} ${p.name} — auf eine Person ziehen, antippen = Formular`}
                  className={cn("flex cursor-grab touch-none select-none items-stretch gap-2 rounded-md border bg-card py-1.5 pl-1.5 pr-2 hover:border-foreground/40",
                    zug?.bewegt && zug.id === p.id && "opacity-40")}>
                  <span className="w-1.5 shrink-0 rounded-full" style={{ background: projektFarbe(p) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono font-semibold">{p.nummer}</span>
                      {eingeplant.has(p.id) && <span className="text-[10px] text-muted-foreground">eingeplant</span>}
                    </span>
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    {(p.kunden?.name || ort) && <span className="block truncate text-xs text-muted-foreground">{[p.kunden?.name, ort].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50" />
                </div>
              </li>
            );
          })}
          {!liste.length && <li className="py-4 text-center text-xs text-muted-foreground">{q ? "Kein Projekt „In Arbeit“ gefunden." : "Alle Projekte in Arbeit sind eingeplant."}</li>}
        </ul>
      </aside>
      {gezogen && zug && (
        <div className="pointer-events-none fixed z-50 max-w-64 truncate rounded-md border-2 bg-card px-2 py-1 text-xs font-semibold shadow-lg"
          style={{ left: zug.x + 14, top: zug.y + 12, borderColor: projektFarbe(gezogen) }}>
          {gezogen.nummer} {gezogen.name} — auf eine Person loslassen
        </div>
      )}
    </>
  );
}
