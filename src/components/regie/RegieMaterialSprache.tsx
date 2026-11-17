import { useEffect, useState } from "react";
import { Check, Loader2, Mic, MicOff, PenLine, Sparkles } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { StatusPille } from "@/components/Bausteine";
import { useDiktat } from "@/components/DiktatKnopf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { materialVorschlag, type KiMaterial } from "@/lib/ki";
import { cn } from "@/lib/utils";
import { kiAuswahlZuMaterial, KI_OHNE, mengeSchritt, type KiAuswahl, type KiMaterialPosten } from "./regieLogik";

/**
 * Material reinreden: „3 Steckdosen, 20 Meter NYM 3x1,5, ein FI 40 A“ —
 * die KI (Edge Function `ki`, material_vorschlag im Modus „verbraucht“)
 * nimmt genau das Gesagte und sucht es im eigenen Artikelstamm. Der Monteur
 * tippt an, was stimmt, ändert Mengen oder Artikel und übernimmt.
 * Geht die KI nicht, bleibt der Text als freie Position.
 */
export function RegieMaterialSprache({
  open, onOpenChange, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUebernehmen: (posten: KiMaterialPosten[]) => void;
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<KiMaterial | null>(null);
  const [auswahl, setAuswahl] = useState<KiAuswahl[]>([]);
  const diktat = useDiktat((t) => setText((alt) => (alt.trim() ? `${alt.trimEnd()}, ${t}` : t)));
  const { aktiv: hoert, stop: diktatStop, start: diktatStart, moeglich } = diktat;

  // Gleich zuhören — dafür ist der Knopf da
  useEffect(() => {
    if (open && moeglich && !ergebnis) diktatStart();
    if (!open && hoert) diktatStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const zuruecksetzen = () => {
    setText("");
    setErgebnis(null);
    setAuswahl([]);
    setFehler(null);
  };
  const schliessen = (o: boolean) => {
    if (laeuft) return;
    onOpenChange(o);
    if (!o) zuruecksetzen();
  };

  const fragen = async () => {
    diktatStop();
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await materialVorschlag(text, "verbraucht");
      setErgebnis(r);
      setAuswahl(r.komponenten.map((k) => ({
        aktiv: true, menge: String(k.menge).replace(".", ","), artikelId: k.artikel?.id ?? KI_OHNE,
      })));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  const setZeile = (i: number, teil: Partial<KiAuswahl>) => setAuswahl((a) => a.map((x, j) => (j === i ? { ...x, ...teil } : x)));
  const posten = ergebnis ? kiAuswahlZuMaterial(ergebnis.komponenten, auswahl) : [];

  const uebernehmen = (liste: KiMaterialPosten[]) => {
    onUebernehmen(liste);
    onOpenChange(false);
    zuruecksetzen();
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={schliessen}
      titel="Material reinreden"
      beschreibung={ergebnis ? "Antippen, was stimmt — Menge und Artikel lassen sich ändern." : "Sagen, was verbaut wurde — die KI sucht es im Artikelstamm."}
      gesperrt={laeuft}
      fuss={ergebnis ? (
        <>
          <Button variant="outline" className="h-12 sm:mr-auto" onClick={() => { setErgebnis(null); setAuswahl([]); }}>Nochmal sagen</Button>
          <Button className="h-12 min-w-40 gap-1.5" disabled={!posten.length} onClick={() => uebernehmen(posten)}>
            <Check className="h-4 w-4" /> {posten.length} übernehmen
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="h-12" disabled={laeuft} onClick={() => schliessen(false)}>Abbrechen</Button>
          <Button className="h-12 min-w-40 gap-1.5" disabled={laeuft || text.trim().length < 3} onClick={() => void fragen()}>
            {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Artikel suchen
          </Button>
        </>
      )}
    >
      {!ergebnis && (
        <div className="max-w-xl space-y-3">
          {moeglich && (
            <Button type="button" variant={hoert ? "default" : "outline"} className="h-16 w-full gap-2 text-base" disabled={laeuft}
              onClick={() => (hoert ? diktatStop() : diktatStart())}>
              {hoert ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {hoert ? "Hört zu … antippen zum Beenden" : "Antippen und sprechen"}
            </Button>
          )}
          {hoert && diktat.zwischen && <p className="px-1 text-sm italic text-muted-foreground">{diktat.zwischen}</p>}
          <Textarea rows={4} className="text-base" value={text} onChange={(e) => setText(e.target.value)} disabled={laeuft}
            placeholder="z. B. 3 Steckdosen Schuko, 20 m NYM-J 3x1,5, 1 FI 40 A 4-polig" aria-label="Verbautes Material" />
          {laeuft && (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              <span>Sucht im Artikelstamm … dauert ein paar Sekunden.</span>
            </div>
          )}
          {fehler && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="text-destructive">{fehler}</p>
              <Button type="button" variant="outline" className="h-11 gap-1.5"
                onClick={() => uebernehmen([{ artikel: null, bezeichnung: text.trim(), einheit: "Stk", menge: 1 }])}>
                <PenLine className="h-4 w-4" /> Text als freie Position übernehmen
              </Button>
            </div>
          )}
        </div>
      )}

      {ergebnis && (
        <ul className="max-w-2xl space-y-2">
          {ergebnis.komponenten.map((k, i) => {
            const z = auswahl[i];
            if (!z) return null;
            const kandidaten = [k.artikel, ...k.alternativen].filter((x): x is NonNullable<typeof x> => !!x);
            const gewaehlt = kandidaten.find((a) => a.id === z.artikelId) ?? null;
            return (
              <li key={i} className={cn("rounded-lg border bg-card p-3 transition-colors", z.aktiv ? "border-primary/60" : "opacity-60")}>
                <button type="button" onClick={() => setZeile(i, { aktiv: !z.aktiv })} aria-pressed={z.aktiv}
                  className="flex min-h-11 w-full items-start gap-3 text-left">
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                    z.aktiv ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                    {z.aktiv && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{gewaehlt?.bezeichnung ?? k.was}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {gewaehlt ? <>gesagt: „{k.was}“</> : <StatusPille eintrag={{ ton: "grau", text: "nicht im Stamm — freie Position" }} />}
                      {gewaehlt && k.passt === "aehnlich" && z.artikelId === k.artikel?.id && <StatusPille eintrag={{ ton: "gelb", text: "ähnlich — prüfen" }} />}
                    </span>
                  </span>
                </button>
                {z.aktiv && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
                    <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Eins weniger"
                      onClick={() => setZeile(i, { menge: mengeSchritt(z.menge, -1) })}>−</Button>
                    <Input inputMode="decimal" className="zahl h-11 w-16 px-1 text-center text-base font-semibold" value={z.menge}
                      onChange={(e) => setZeile(i, { menge: e.target.value })} aria-label={`Menge ${k.was}`} />
                    <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Eins mehr"
                      onClick={() => setZeile(i, { menge: mengeSchritt(z.menge, 1) })}>+</Button>
                    <span className="w-9 truncate text-sm text-muted-foreground">{gewaehlt?.einheit || k.einheit}</span>
                    {kandidaten.length > 0 && (
                      <select value={z.artikelId} onChange={(e) => setZeile(i, { artikelId: e.target.value })} aria-label="Artikel"
                        className="h-11 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2 text-sm">
                        {kandidaten.map((a) => (
                          <option key={a.id} value={a.id}>{a.bezeichnung}{a.hersteller ? ` · ${a.hersteller}` : ""}</option>
                        ))}
                        <option value={KI_OHNE}>Ohne Artikel (freie Position)</option>
                      </select>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {ergebnis.komponenten.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nichts erkannt — nochmal sagen.</li>
          )}
        </ul>
      )}
    </FormularDialog>
  );
}
