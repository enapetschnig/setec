import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Loader2, PenLine, Type, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Ein Strich oder ein Text in BILD-Koordinaten (nicht Bildschirm) */
type Zeichen =
  | { art: "strich"; farbe: string; breite: number; punkte: { x: number; y: number }[] }
  | { art: "text"; farbe: string; groesse: number; x: number; y: number; text: string };

const FARBEN = [
  { wert: "#e11d48", name: "Rot" },
  { wert: "#111827", name: "Schwarz" },
  { wert: "#2563eb", name: "Blau" },
  { wert: "#16a34a", name: "Grün" },
];
const BREITEN = [{ faktor: 1, name: "Dünn" }, { faktor: 2.2, name: "Dick" }];

/** Leeres Blatt für eine Skizze (quer, wie ein Tablet) */
const BLATT = { breite: 1600, hoehe: 1100 };

export type ZeichnenErgebnis = { bild: Blob; gezeichnet: boolean; beschriftung: string };

/**
 * Auf einem Foto zeichnen und beschriften — oder auf einem leeren Blatt
 * skizzieren. Mit dem Finger oder dem Stift am Tablet (Stefan: „dass du
 * gleich was dazu schreiben könntest … oder zeichnen“). Aufbau wie
 * `wunsch/BildMarkieren`: Vollbild, Striche in Bild-Koordinaten.
 *
 * Wer einmal mit dem Stift zeichnet, malt danach nur noch mit dem Stift —
 * die aufgelegte Hand macht keine Striche mehr.
 */
export function ZeichnenDialog({
  open, bild, titel, beschriftung: startText = "", onAbbrechen, onFertig,
}: {
  open: boolean;
  /** Foto (Datei oder Adresse) — null = leeres Blatt (Skizze) */
  bild: Blob | string | null;
  titel: string;
  beschriftung?: string;
  onAbbrechen: () => void;
  onFertig: (e: ZeichnenErgebnis) => Promise<void> | void;
}) {
  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const grund = useRef<HTMLImageElement | ImageBitmap | null>(null);
  const [masse, setMasse] = useState<{ b: number; h: number } | null>(null);
  const [zeichen, setZeichen] = useState<Zeichen[]>([]);
  const [farbe, setFarbe] = useState(FARBEN[0].wert);
  const [breite, setBreite] = useState(BREITEN[0].faktor);
  const [modus, setModus] = useState<"stift" | "text">("stift");
  const [textStelle, setTextStelle] = useState<{ x: number; y: number } | null>(null);
  const [textEingabe, setTextEingabe] = useState("");
  const [beschriftung, setBeschriftung] = useState(startText);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const malt = useRef<number | null>(null);
  const nurStift = useRef(false);

  // Grundbild laden — erst danach kennen wir die Maße. Adressen holen wir als
  // Datei, sonst wäre die Leinwand „verunreinigt“ (fremde Herkunft) und ließe
  // sich nicht speichern.
  useEffect(() => {
    if (!open) return;
    let weg = false;
    setZeichen([]); setMasse(null); setFehler(null); setTextStelle(null); setBeschriftung(startText); setModus("stift");
    nurStift.current = false;
    grund.current = null;
    (async () => {
      if (!bild) { if (!weg) setMasse({ b: BLATT.breite, h: BLATT.hoehe }); return; }
      const blob = typeof bild === "string" ? await (await fetch(bild)).blob() : bild;
      const bmp = await createImageBitmap(blob);
      if (weg) return;
      grund.current = bmp;
      setMasse({ b: bmp.width, h: bmp.height });
    })().catch(() => { if (!weg) setFehler("Das Bild ließ sich nicht öffnen."); });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bild]);

  const strichBasis = masse ? Math.max(3, Math.round(Math.max(masse.b, masse.h) / 350)) : 3;
  const textBasis = masse ? Math.max(18, Math.round(Math.max(masse.b, masse.h) / 32)) : 24;

  // Alles neu zeichnen: Grund, darüber Striche und Texte
  useEffect(() => {
    const c = leinwand.current;
    if (!c || !masse) return;
    c.width = masse.b;
    c.height = masse.h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (grund.current) ctx.drawImage(grund.current, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const z of zeichen) {
      if (z.art === "strich") {
        ctx.strokeStyle = z.farbe;
        ctx.lineWidth = z.breite;
        ctx.beginPath();
        ctx.moveTo(z.punkte[0].x, z.punkte[0].y);
        if (z.punkte.length === 1) ctx.lineTo(z.punkte[0].x + 0.1, z.punkte[0].y);
        for (const p of z.punkte.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.font = `600 ${z.groesse}px system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        // weißer Rand: lesbar auf jedem Foto
        ctx.lineWidth = Math.max(3, z.groesse / 6);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(z.text, z.x, z.y);
        ctx.fillStyle = z.farbe;
        ctx.fillText(z.text, z.x, z.y);
      }
    }
  }, [zeichen, masse]);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = leinwand.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const anfangen = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") nurStift.current = true;
    else if (nurStift.current) return; // Handballen auf dem Tablet
    if (modus === "text") {
      setTextStelle(punkt(e));
      setTextEingabe("");
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    malt.current = e.pointerId;
    setZeichen((alt) => [...alt, { art: "strich", farbe, breite: strichBasis * breite, punkte: [punkt(e)] }]);
  };
  const weiter = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (malt.current !== e.pointerId) return;
    const p = punkt(e);
    setZeichen((alt) => {
      const letzter = alt[alt.length - 1];
      if (!letzter || letzter.art !== "strich") return alt;
      return [...alt.slice(0, -1), { ...letzter, punkte: [...letzter.punkte, p] }];
    });
  };
  const aufhoeren = (e: React.PointerEvent<HTMLCanvasElement>) => { if (malt.current === e.pointerId) malt.current = null; };

  const textSetzen = () => {
    const t = textEingabe.trim();
    if (t && textStelle) setZeichen((alt) => [...alt, { art: "text", farbe, groesse: Math.round(textBasis * breite * 0.8), x: textStelle.x, y: textStelle.y, text: t }]);
    setTextStelle(null);
    setTextEingabe("");
  };

  const fertig = async () => {
    const c = leinwand.current;
    if (!c || speichert) return;
    setSpeichert(true);
    try {
      const skizze = !bild;
      const blob = await new Promise<Blob | null>((f) => c.toBlob(f, skizze ? "image/png" : "image/jpeg", 0.88));
      if (!blob) throw new Error("Bild konnte nicht erstellt werden.");
      await onFertig({ bild: blob, gezeichnet: zeichen.length > 0, beschriftung: beschriftung.trim() });
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !speichert) onAbbrechen(); }}>
      <DialogContent
        className="left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none border-0 bg-neutral-900 p-0"
        data-bildschirmfoto="aus" data-zeichnen
        // Ein Handballen neben dem Bild darf die Zeichnung nicht wegwerfen
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          <DialogTitle className="mr-auto text-sm font-medium text-white/90">{titel}</DialogTitle>
          <DialogDescription className="sr-only">Mit Finger oder Stift zeichnen, Text antippen und schreiben</DialogDescription>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Farbe">
            {FARBEN.map((f) => (
              <button key={f.wert} type="button" role="radio" aria-checked={farbe === f.wert} aria-label={f.name} onClick={() => setFarbe(f.wert)}
                className={cn("h-9 w-9 rounded-full border-2", farbe === f.wert ? "border-white" : "border-transparent")}>
                <span className="mx-auto block h-6 w-6 rounded-full" style={{ background: f.wert }} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {BREITEN.map((b) => (
              <Button key={b.name} type="button" size="sm" variant={breite === b.faktor ? "secondary" : "ghost"}
                className={cn("h-9", breite !== b.faktor && "text-white/80 hover:text-white")} onClick={() => setBreite(b.faktor)} aria-pressed={breite === b.faktor}>
                {b.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant={modus === "stift" ? "secondary" : "ghost"} className={cn("h-9 gap-1.5", modus !== "stift" && "text-white/80")}
              onClick={() => setModus("stift")} aria-pressed={modus === "stift"}><PenLine className="h-4 w-4" /> Zeichnen</Button>
            <Button type="button" size="sm" variant={modus === "text" ? "secondary" : "ghost"} className={cn("h-9 gap-1.5", modus !== "text" && "text-white/80")}
              onClick={() => setModus("text")} aria-pressed={modus === "text"}><Type className="h-4 w-4" /> Text</Button>
          </div>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden p-2">
          {fehler && !masse ? (
            <p className="text-sm text-white/80">{fehler}</p>
          ) : masse ? (
            <canvas
              ref={leinwand}
              onPointerDown={anfangen}
              onPointerMove={weiter}
              onPointerUp={aufhoeren}
              onPointerCancel={aufhoeren}
              aria-label={bild ? "Foto zum Zeichnen" : "Leeres Blatt für die Skizze"}
              data-leinwand
              className={cn("max-h-full max-w-full touch-none rounded bg-white", modus === "text" ? "cursor-text" : "cursor-crosshair")}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-white/70"><Loader2 className="h-4 w-4 animate-spin" /> Bild wird geladen …</p>
          )}
          {textStelle && (
            <div className="absolute inset-x-3 top-3 mx-auto flex max-w-md gap-2 rounded-lg bg-card p-2 shadow-lg">
              <Input autoFocus value={textEingabe} onChange={(e) => setTextEingabe(e.target.value)} placeholder="Text an diese Stelle"
                className="h-11 text-base" aria-label="Text an der Stelle"
                onKeyDown={(e) => { if (e.key === "Enter") textSetzen(); if (e.key === "Escape") setTextStelle(null); }} />
              <Button type="button" className="h-11" onClick={textSetzen}>Setzen</Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => setZeichen((a) => a.slice(0, -1))} disabled={!zeichen.length}>
            <Undo2 className="h-4 w-4" /> Zurück
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => setZeichen([])} disabled={!zeichen.length}>
            <Eraser className="h-4 w-4" /> Alles weg
          </Button>
          <Input value={beschriftung} onChange={(e) => setBeschriftung(e.target.value)} placeholder="Beschriftung, z. B. Zählerkasten Keller"
            aria-label="Beschriftung" className="h-10 min-w-[12rem] flex-1 bg-white text-base sm:text-sm" />
          {fehler && masse && <p className="w-full text-xs text-red-300">{fehler}</p>}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={onAbbrechen} disabled={speichert}>
              <X className="h-4 w-4" /> Abbrechen
            </Button>
            <Button type="button" size="sm" className="h-10 gap-2" onClick={() => void fertig()} disabled={!masse || speichert}>
              {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
