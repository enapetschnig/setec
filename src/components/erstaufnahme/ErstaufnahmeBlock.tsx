import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { StatusPille } from "@/components/Bausteine";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { datum } from "@/lib/format";
import { eaAdresse, messwerteLesen, messwertZeilen } from "@/lib/erstaufnahme";
import { ERSTAUFNAHME_STATUS, type ErstaufnahmeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { EaMitFotos } from "./eaDaten";

/** Fotos einer Erstaufnahme als Kacheln, antippen = groß (Zoom, wischen) */
export function EaFotoKacheln({ fotos, urls, klein = false }: { fotos: EaMitFotos["fotos"]; urls: Record<string, string>; klein?: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!fotos.length) return null;
  const aktuelles = index !== null ? fotos[index] : null;
  return (
    <>
      <div className={cn("grid gap-1.5", klein ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4")}>
        {fotos.map((f, i) => (
          <button key={f.id} type="button" onClick={() => setIndex(i)} aria-label={`${f.skizze ? "Skizze" : "Foto"} ${i + 1} groß ansehen`}
            className="relative aspect-square overflow-hidden rounded-md border bg-muted">
            {urls[f.pfad] && <img src={urls[f.pfad]} alt={f.beschriftung || (f.skizze ? "Skizze" : "Foto")} loading="lazy" className="h-full w-full object-cover" />}
            {(f.beschriftung || f.skizze) && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-[10px] font-medium text-white">
                {f.beschriftung || "Skizze"}
              </span>
            )}
          </button>
        ))}
      </div>
      <BildBetrachter
        bilder={fotos.map((f) => ({ url: urls[f.pfad] ?? "", alt: f.beschriftung || (f.skizze ? "Skizze" : "Foto") }))}
        index={index}
        onIndex={setIndex}
        onSchliessen={() => setIndex(null)}
        fuss={aktuelles && (
          <p className="p-3 text-sm text-white">{aktuelles.beschriftung || (aktuelles.skizze ? "Skizze" : "Foto")} · {datum(aktuelles.created_at)}</p>
        )}
      />
    </>
  );
}

/**
 * Was bei der Besichtigung erfasst wurde — Kundenwunsch, Notizen, Messwerte,
 * Fotos. Im Angebot (beim Kalkulieren) und im Projekt (für die Monteure,
 * ohne Preise). Aufklappbar.
 */
export function ErstaufnahmeBlock({ daten, startOffen = true, mitLink = true }: { daten: EaMitFotos; startOffen?: boolean; mitLink?: boolean }) {
  const [offen, setOffen] = useState(startOffen);
  const { ea, fotos, urls } = daten;
  const werte = messwertZeilen(messwerteLesen(ea.messwerte));
  const adresse = eaAdresse(ea);
  return (
    <section className="rounded-lg border bg-card" data-erstaufnahme-block>
      <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left">
        <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="text-[0.9375rem] font-semibold">Erstaufnahme</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">{ea.nummer}</span>
          <span className="ml-2 text-xs text-muted-foreground">{datum(ea.created_at)}{fotos.length ? ` · ${fotos.length} ${fotos.length === 1 ? "Bild" : "Bilder"}` : ""}</span>
        </span>
        <StatusPille eintrag={ERSTAUFNAHME_STATUS[ea.status as ErstaufnahmeStatus]} />
        {offen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {offen && (
        <div className="space-y-3 border-t px-3 py-3 text-sm">
          {adresse && <p className="text-muted-foreground">{adresse}</p>}
          {ea.kundenwunsch && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Kundenwunsch</p>
              <p className="whitespace-pre-line">{ea.kundenwunsch}</p>
            </div>
          )}
          {ea.notizen && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notizen</p>
              <p className="whitespace-pre-line">{ea.notizen}</p>
            </div>
          )}
          {werte.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Messwerte</p>
              <ul className="mt-0.5 grid gap-x-4 sm:grid-cols-2">{werte.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <EaFotoKacheln fotos={fotos} urls={urls} />
          {!ea.kundenwunsch && !ea.notizen && !werte.length && !fotos.length && <p className="text-muted-foreground">Noch nichts erfasst.</p>}
          {mitLink && <Link to={`/erstaufnahmen/${ea.id}`} className="inline-block text-sm font-medium text-primary hover:underline">Erstaufnahme öffnen</Link>}
        </div>
      )}
    </section>
  );
}
