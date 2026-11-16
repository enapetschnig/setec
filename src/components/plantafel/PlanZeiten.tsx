import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSitzung } from "@/hooks/useSitzung";
import { planStunden } from "@/lib/terminplaner";

const STUNDEN = Array.from({ length: 25 }, (_, i) => i);

/**
 * Einstellungen → Betrieb: welche Stunden der Wochenplan zeigt (Standard
 * 6–18 Uhr). Einsätze davor oder danach erweitern die Ansicht trotzdem.
 * Speichert für sich (nicht mit dem Betriebsformular).
 */
export function PlanZeiten() {
  const { firma, neuLaden } = useSitzung();
  const [gespeichert0, gespeichert1] = planStunden(firma?.plan_von, firma?.plan_bis);
  const [von, setVon] = useState(gespeichert0);
  const [bis, setBis] = useState(gespeichert1);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { setVon(gespeichert0); setBis(gespeichert1); }, [gespeichert0, gespeichert1]);
  const geaendert = von !== gespeichert0 || bis !== gespeichert1;

  const speichern = async () => {
    if (von >= bis) return toast.error("Der Tag muss vor seinem Ende beginnen.");
    setLaeuft(true);
    const { error } = await supabase.from("firma").update({ plan_von: von, plan_bis: bis }).eq("id", 1);
    setLaeuft(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success(`Wochenplan zeigt jetzt ${von}–${bis} Uhr`);
    await neuLaden();
  };

  const wahl = (id: string, wert: number, setze: (n: number) => void, werte: number[]) => (
    <select id={id} value={wert} onChange={(e) => setze(Number(e.target.value))}
      className="h-11 w-28 rounded-md border bg-card px-2 text-base [@media(pointer:fine)]:text-sm">
      {werte.map((h) => <option key={h} value={h}>{h}:00</option>)}
    </select>
  );

  return (
    <Karte titel="Plantafel">
      <p className="mb-3 text-sm text-muted-foreground">
        Welche Stunden der Wochenplan zeigt. Einsätze davor oder danach sind trotzdem zu sehen.
      </p>
      <div className="flex flex-wrap items-end gap-3" data-plan-zeiten>
        <div className="space-y-1"><Label htmlFor="plan-von" className="text-xs">Tagesbeginn</Label>{wahl("plan-von", von, setVon, STUNDEN.slice(0, 24))}</div>
        <div className="space-y-1"><Label htmlFor="plan-bis" className="text-xs">Tagesende</Label>{wahl("plan-bis", bis, setBis, STUNDEN.slice(1))}</div>
        <Button className="h-11 min-w-28 gap-2" onClick={speichern} disabled={!geaendert || laeuft}>
          {laeuft && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
        </Button>
      </div>
    </Karte>
  );
}
