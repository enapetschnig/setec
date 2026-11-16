import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, euro, stunden, zahl } from "@/lib/format";
import { arbeitszeitText, stundensaetzeLesen, type Lohnart } from "@/lib/kalkulation";
import { runden2 } from "@/lib/preise";
import { leerePosition, preisText, zahlText, type EditorPosition } from "./editor";

/**
 * Arbeitszeit auf einmal eingeben: für jeden Stundensatz (Standard, Meister,
 * Lehrling …) die Stunden — daraus wird je Satz eine Position. Den Satz kann
 * man hier für diesen Beleg ändern, und eine neue Rolle gleich anlegen (auf
 * Wunsch für den Betrieb gemerkt, sonst nur hier).
 */
export function ArbeitszeitDialog({
  open, onOpenChange, lohnarten, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lohnarten: Lohnart[];
  onUebernehmen: (positionen: EditorPosition[]) => void;
}) {
  const { firma, istChef, neuLaden } = useSitzung();
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [saetze, setSaetze] = useState<Record<string, string>>({});
  const [eigene, setEigene] = useState<Lohnart[]>([]);
  const [neu, setNeu] = useState<{ name: string; satz: string; merken: boolean } | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { if (open) { setWerte({}); setSaetze({}); setEigene([]); setNeu(null); setText(""); } }, [open]);

  const alle = [...lohnarten, ...eigene.filter((e) => !lohnarten.some((l) => l.name === e.name))];
  const satzVon = (l: Lohnart) => dezimalLesen(saetze[l.name] ?? "") ?? l.satz;
  const zeilen = alle
    .map((l) => ({ l: { ...l, satz: satzVon(l) }, h: dezimalLesen(werte[l.name] ?? "") ?? 0 }))
    .filter((z) => z.h > 0);
  const summe = runden2(zeilen.reduce((s, z) => s + runden2(z.h * z.l.satz), 0));
  const falsch = alle.some((l) => (dezimalLesen(werte[l.name] ?? "") ?? 0) < 0 || satzVon(l) <= 0);

  const uebernehmen = () => {
    onUebernehmen(zeilen.map((z) => leerePosition("arbeit", {
      bezeichnung: arbeitszeitText(z.l),
      langtext: text.trim(),
      menge: zahlText(z.h),
      einheit: "h",
      einzelpreis: preisText(z.l.satz),
    })));
    onOpenChange(false);
  };

  const neuAnlegen = async () => {
    if (!neu) return;
    const name = neu.name.trim();
    const satz = dezimalLesen(neu.satz) ?? 0;
    if (!name || satz <= 0) { toast.error("Bitte Bezeichnung und Stundensatz eintragen."); return; }
    if (alle.some((l) => (l.standard ? "Standard" : l.name).toLowerCase() === name.toLowerCase())) { toast.error(`„${name}“ gibt es schon.`); return; }
    if (neu.merken && istChef && firma) {
      const { error } = await supabase.from("firma").update({ stundensaetze: [...stundensaetzeLesen(firma.stundensaetze), { name, satz }] }).eq("id", firma.id);
      if (error) { toast.error(`Nicht gespeichert: ${error.message}`); return; }
      await neuLaden();
      toast.success(`Stundensatz „${name}“ gespeichert — steht ab jetzt überall zur Wahl.`);
    }
    setEigene((e) => [...e, { name, satz }]);
    setNeu(null);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Arbeitszeit"
      beschreibung="Stunden je Rolle eintragen — jede wird eine Position. Den Satz kannst du hier für diesen Beleg ändern."
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!zeilen.length || falsch} onClick={uebernehmen}>
            {zeilen.length ? `Übernehmen · ${euro(summe)}` : "Übernehmen"}
          </Button>
        </>
      )}
    >
      <div className="divide-y rounded-lg border bg-card">
        {alle.map((l) => {
          const h = dezimalLesen(werte[l.name] ?? "") ?? 0;
          const satz = satzVon(l);
          return (
            <div key={l.name} className="flex items-center gap-2 px-3 py-2.5">
              <Label htmlFor={`az-${l.name}`} className="min-w-0 flex-1">
                <span className="block font-medium">{l.standard ? "Standard" : l.name}</span>
                {h > 0 && <span className="zahl block text-xs font-normal text-muted-foreground">{euro(runden2(h * satz))}</span>}
              </Label>
              <div className="relative w-24 shrink-0">
                <Input inputMode="decimal" aria-label={`Stundensatz ${l.standard ? "Standard" : l.name}`} className="zahl h-12 pr-9 text-right"
                  value={saetze[l.name] ?? zahl(l.satz)} onChange={(e) => setSaetze({ ...saetze, [l.name]: e.target.value })} />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€/h</span>
              </div>
              <Input id={`az-${l.name}`} inputMode="decimal" placeholder="Std." className="zahl h-12 w-20 shrink-0 text-right"
                value={werte[l.name] ?? ""} onChange={(e) => setWerte({ ...werte, [l.name]: e.target.value })} />
            </div>
          );
        })}
        {neu ? (
          <div className="space-y-2 bg-muted/30 px-3 py-3">
            <div className="flex gap-2">
              <Input autoFocus className="h-12 min-w-0 flex-1" placeholder="Rolle, z. B. Meister, Lehrling, Helfer" aria-label="Neue Rolle"
                value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} />
              <div className="relative w-28 shrink-0">
                <Input inputMode="decimal" className="zahl h-12 pr-9 text-right" placeholder="0" aria-label="Stundensatz der neuen Rolle"
                  value={neu.satz} onChange={(e) => setNeu({ ...neu, satz: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void neuAnlegen(); } }} />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€/h</span>
              </div>
            </div>
            {istChef && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={neu.merken} onCheckedChange={(v) => setNeu({ ...neu, merken: !!v })} className="h-5 w-5" />
                Für den Betrieb merken (Einstellungen → Kalkulation)
              </label>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="h-11" onClick={() => setNeu(null)}>Abbrechen</Button>
              <Button className="h-11" onClick={() => void neuAnlegen()}>Rolle anlegen</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNeu({ name: "", satz: "", merken: true })}
            className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/40">
            <Plus className="h-4 w-4" /> Weitere Rolle / Stundensatz
          </button>
        )}
      </div>
      {zeilen.length > 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          Zusammen <span className="zahl font-medium text-foreground">{stunden(zeilen.reduce((s, z) => s + z.h, 0))}</span> ·{" "}
          <span className="zahl font-medium text-foreground">{euro(summe)}</span> netto
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="az-text">Was wird gemacht? <span className="font-normal text-muted-foreground">(optional, steht klein darunter)</span></Label>
        <Input id="az-text" className="h-11" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Montage und Inbetriebnahme" />
      </div>
    </FormularDialog>
  );
}
