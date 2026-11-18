import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// pdf.js (1 MB) erst laden, wenn wirklich ein PDF zu zeigen ist
const PdfAnsicht = lazy(() => import("@/components/projekt/PdfAnsicht"));
const PdfVollbild = lazy(() => import("@/components/projekt/PdfAnsicht").then((m) => ({ default: m.PdfVollbild })));

/** Woher die Datei kommt: schon im Gerät (gerade gewählt, schon geladen) oder im Speicher */
export type DateiQuelle = Blob | { bucket: string; pfad: string };

/** Lässt sich die Datei einbetten — als PDF oder als Foto? */
export function vorschauArt(mime: string | null | undefined, name: string | null | undefined): "pdf" | "bild" | null {
  if (mime === "application/pdf" || /\.pdf$/i.test(name ?? "")) return "pdf";
  if (mime?.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(name ?? "")) return "bild";
  return null;
}

/**
 * Datei → Object-URL, beim Wechsel und Schließen wieder freigegeben. Aus dem
 * Speicher wird sie ganz geladen statt über eine signierte Adresse: die läuft
 * nach 10 Minuten ab, pdf.js holt Seiten aber erst beim Blättern nach.
 */
function useObjektUrl(quelle: DateiQuelle | null) {
  const blob = quelle instanceof Blob ? quelle : null;
  const bucket = quelle && !(quelle instanceof Blob) ? quelle.bucket : null;
  const pfad = quelle && !(quelle instanceof Blob) ? quelle.pfad : null;
  const [stand, setStand] = useState<{ url: string | null; fehler: string | null }>({ url: null, fehler: null });

  useEffect(() => {
    let ab = false;
    let url: string | null = null;
    const zeigen = (b: Blob) => {
      url = URL.createObjectURL(b);
      setStand({ url, fehler: null });
    };
    setStand({ url: null, fehler: null });
    if (blob) zeigen(blob);
    else if (bucket && pfad) {
      supabase.storage.from(bucket).download(pfad)
        .then(({ data, error }) => {
          if (ab) return;
          if (data) zeigen(data);
          else setStand({ url: null, fehler: error?.message || "Datei nicht gefunden" });
        })
        .catch((e: unknown) => { if (!ab) setStand({ url: null, fehler: e instanceof Error ? e.message : "Datei nicht geladen" }); });
    }
    return () => {
      ab = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, bucket, pfad]);

  return stand;
}

/**
 * Beleg im Original, gleich beim Öffnen: PDF über pdf.js (alle Seiten, auch am
 * iPhone — ein eingebettetes PDF zeigt dort oft nur die erste Seite), Foto
 * eingepasst. ⤢ bzw. Antippen öffnet das Vollbild mit Zoom. Die Höhe kommt
 * über `className` (Spalte am PC `h-full`, am Handy z. B. `h-[45vh]`).
 * Nichts anderes als PDF oder Foto → nichts (dafür bleibt „Ansehen“).
 */
export function DateiVorschau({ quelle, name, mime, className }: {
  quelle: DateiQuelle | null;
  name: string;
  mime: string | null;
  className?: string;
}) {
  const art = quelle ? vorschauArt(mime ?? (quelle instanceof Blob ? quelle.type : null), name) : null;
  const { url, fehler } = useObjektUrl(art ? quelle : null);
  const [voll, setVoll] = useState(false);
  const [bildFehler, setBildFehler] = useState(false);
  useEffect(() => { setBildFehler(false); setVoll(false); }, [url]);

  if (!art) return null;
  const rahmen = cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card", className);
  const laedt = (
    <div className={cn(rahmen, "items-center justify-center gap-2 text-sm text-muted-foreground")} aria-busy="true">
      <Loader2 className="h-5 w-5 animate-spin" /> Beleg wird geladen …
    </div>
  );
  if (fehler) {
    return (
      <div className={rahmen}>
        <p className="m-3 rounded-md bg-status-rot px-3 py-2 text-sm text-status-rot-fg">Beleg nicht geladen: {fehler}</p>
      </div>
    );
  }
  if (!url) return laedt;

  if (art === "pdf") {
    return (
      <>
        <Suspense fallback={laedt}>
          <PdfAnsicht url={url} name={name} hoch onVollbild={() => setVoll(true)} className={className} />
        </Suspense>
        {voll && <Suspense fallback={null}><PdfVollbild datei={{ url, name }} onSchliessen={() => setVoll(false)} /></Suspense>}
      </>
    );
  }

  return (
    <div className={rahmen}>
      <div className="flex items-center gap-1 border-b px-1">
        <p className="min-w-0 flex-1 truncate px-2 text-sm font-medium" title={name}>{name}</p>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" onClick={() => setVoll(true)} aria-label="Vollbild">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      {bildFehler ? (
        // z. B. HEIC am PC — ein gespeichertes öffnet „Ansehen“
        <p className="m-3 text-sm text-muted-foreground">Dieses Foto lässt sich hier nicht anzeigen.</p>
      ) : (
        <button type="button" className="min-h-0 flex-1 bg-muted/40 p-2" onClick={() => setVoll(true)} aria-label="Foto groß ansehen">
          <img src={url} alt={name} className="h-full w-full object-contain" onError={() => setBildFehler(true)} />
        </button>
      )}
      <BildBetrachter bilder={[{ url, alt: name }]} index={voll && !bildFehler ? 0 : null} onIndex={() => undefined} onSchliessen={() => setVoll(false)} />
    </div>
  );
}
