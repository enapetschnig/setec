import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { dezimalLesen, euro, zahl } from "@/lib/format";
import { aufschlaegeSetzen, aufschlagAus } from "@/lib/kalkulation";
import { mengeVon, preisText, preisVon, summen, type EditorPosition } from "./editor";

/**
 * Material-Aufschlag und Stundensatz neu setzen — aber nur für die Positionen,
 * die man anhakt. Artikel mit eigenem Aufschlag oder ausgehandeltem Preis
 * bleiben sonst unberührt (früher änderte der Dialog jeden Preis im Beleg).
 */
export function AufschlaegeDialog({
  open, onOpenChange, positionen, stundensatz, materialStandard, ustSatz, ohneUst, onAnwenden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  positionen: EditorPosition[];
  stundensatz: number;
  /** Aufschlag des Betriebs aus den Einstellungen */
  materialStandard: number;
  ustSatz: number;
  ohneUst: boolean;
  onAnwenden: (neu: EditorPosition[]) => void;
}) {
  // Aufschlag, der jetzt im Beleg steckt (nach Einkauf gewichtet)
  const jetzt = useMemo(() => {
    let ek = 0;
    let material = 0;
    positionen.forEach((p) => {
      if (p.ek_preis == null || p.ek_preis <= 0 || p.art === "arbeit") return;
      const auf = aufschlagAus({ preis: preisVon(p), ek: p.ek_preis, minuten: p.minuten, satz: stundensatz });
      if (auf == null) return;
      ek += p.ek_preis * mengeVon(p);
      material += p.ek_preis * (1 + auf / 100) * mengeVon(p);
    });
    return ek > 0 ? Math.round((material / ek - 1) * 1000) / 10 : null;
  }, [positionen, stundensatz]);

  const [material, setMaterial] = useState("");
  const [satz, setSatz] = useState("");
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setWahl(new Set());
    setMaterial(zahl(jetzt ?? materialStandard));
    setSatz(zahl(stundensatz));
  }, [open, jetzt, materialStandard, stundensatz]);

  const m = dezimalLesen(material);
  const sz = dezimalLesen(satz);
  const neuePreise = useMemo(() => aufschlaegeSetzen(
    positionen.map((p) => ({ art: p.art, einheit: p.einheit, einzelpreis: preisVon(p), ek_preis: p.ek_preis, minuten: p.minuten })),
    { material: m != null && m !== jetzt ? m : null, satz: sz != null && sz > 0 && sz !== stundensatz ? sz : null },
    stundensatz,
  ), [positionen, m, sz, jetzt, stundensatz]);
  const betroffen = positionen.flatMap((p, i) => (neuePreise[i] == null ? [] : [{ p, preis: neuePreise[i]! }]));
  const geaendert = betroffen.filter((b) => wahl.has(b.p.id)).length;
  const neu = positionen.map((p, i) => (neuePreise[i] == null || !wahl.has(p.id) ? p : { ...p, einzelpreis: preisText(neuePreise[i]) }));
  const umschalten = (id: string) => setWahl((w) => { const n = new Set(w); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const vorher = summen(positionen, ustSatz, ohneUst).netto;
  const nachher = summen(neu, ustSatz, ohneUst).netto;
  const ohneEk = positionen.filter((p) => (p.art === "artikel" || p.art === "material" || p.art === "leistung") && p.ek_preis == null && p.minuten == null).length;

  const schnell = (feld: "m" | "s", d: number) => {
    // auf ganze Prozent: aus „35,2“ wird mit +5 „40“, nicht „40,2“
    if (feld === "m") setMaterial(zahl(Math.round((m ?? 0) + d)));
    else setSatz(zahl(Math.max(0, (sz ?? 0) + d)));
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Aufschläge"
      beschreibung="Neuen Aufschlag eintragen, dann anhaken, welche Positionen ihn bekommen — die anderen behalten ihren Preis."
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!geaendert} onClick={() => { onAnwenden(neu); onOpenChange(false); }}>
            {geaendert ? `${geaendert} ${geaendert === 1 ? "Preis" : "Preise"} ändern` : "Nichts zu ändern"}
          </Button>
        </>
      )}
    >
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label htmlFor="auf-material" className="text-base">Material-Aufschlag auf den Einkauf</Label>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-12 w-14" onClick={() => schnell("m", -5)}>−5</Button>
          <Input id="auf-material" inputMode="decimal" className="zahl h-12 w-24 text-center text-base" value={material} onChange={(e) => setMaterial(e.target.value)} />
          <span>%</span>
          <Button variant="outline" className="h-12 w-14" onClick={() => schnell("m", 5)}>+5</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {jetzt != null ? `Jetzt im Beleg: ${zahl(jetzt)} % · ` : ""}Standard des Betriebs: {zahl(materialStandard)} %
        </p>
      </section>
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <Label htmlFor="auf-satz" className="text-base">Stundensatz</Label>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-12 w-14" onClick={() => schnell("s", -5)}>−5</Button>
          <Input id="auf-satz" inputMode="decimal" className="zahl h-12 w-24 text-center text-base" value={satz} onChange={(e) => setSatz(e.target.value)} />
          <span>€/h</span>
          <Button variant="outline" className="h-12 w-14" onClick={() => schnell("s", 5)}>+5</Button>
        </div>
        <p className="text-xs text-muted-foreground">Gilt für Arbeitszeit zum Satz {euro(stundensatz)} und für die Montagezeit kalkulierter Leistungen. Meister- und Sondersätze bleiben.</p>
      </section>
      {betroffen.length > 0 && (
        <section className="space-y-2" aria-label="Welche Positionen">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-medium">Welche Positionen? <span className="font-normal text-muted-foreground">{geaendert} von {betroffen.length}</span></p>
            <button type="button" className="text-sm font-medium text-primary" onClick={() => setWahl(geaendert === betroffen.length ? new Set() : new Set(betroffen.map((b) => b.p.id)))}>
              {geaendert === betroffen.length ? "Keine" : "Alle"}
            </button>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border bg-card">
            {betroffen.map(({ p, preis }) => (
              <li key={p.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <Checkbox checked={wahl.has(p.id)} onCheckedChange={() => umschalten(p.id)} className="h-5 w-5" aria-label={p.bezeichnung || "Position"} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.bezeichnung || "Ohne Bezeichnung"}</span>
                  <span className="zahl shrink-0 text-right text-xs">
                    <span className="text-muted-foreground line-through">{euro(preisVon(p))}</span>{" "}
                    <span className="font-semibold">{euro(preis)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm">
        Netto <span className="zahl font-semibold">{euro(nachher)}</span>
        {nachher !== vorher && <span className="text-muted-foreground"> statt {euro(vorher)}</span>}
      </p>
      {ohneEk > 0 && (
        <p className="text-xs text-muted-foreground">
          {ohneEk} {ohneEk === 1 ? "Position hat" : "Positionen haben"} keinen Einkaufspreis und {ohneEk === 1 ? "bleibt" : "bleiben"} — dort den Preis direkt ändern.
        </p>
      )}
    </FormularDialog>
  );
}
