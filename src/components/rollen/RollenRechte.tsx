import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Karte } from "@/components/Bausteine";
import { Rueckfrage, type Frage } from "@/components/Rueckfrage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { RECHTE, type Recht, type RollenZeile } from "@/lib/rechte";
import type { Profil } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Rollen & Rechte (nur der Chef): je Rolle die Bereiche an- und abschalten,
 * eigene Rollen anlegen. „Chef“ darf immer alles. Büro-Rollen sehen das
 * Büro (Grundstufe chef), Baustellen-Rollen nur, was ein Monteur sieht.
 */
export function RollenRechte({ personen }: { personen: Profil[] }) {
  const { rollen, neuLaden } = useSitzung();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [neu, setNeu] = useState<{ name: string; basis: "chef" | "monteur" } | null>(null);
  const [frage, setFrage] = useState<Frage | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const rolle = rollen.find((r) => r.id === gewaehlt) ?? rollen.find((r) => r.schluessel === "buero") ?? rollen[0];
  if (!rolle) return null;

  const wer = (r: RollenZeile) => personen.filter((p) => (p.rolle_id
    ? p.rolle_id === r.id
    : r.schluessel === (p.rolle === "chef" ? "chef" : "monteur")));

  const speichern = async (id: string, daten: Partial<RollenZeile>) => {
    setLaeuft(true);
    const { error } = await supabase.from("rollen").update(daten).eq("id", id);
    setLaeuft(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    await neuLaden();
  };

  const umschalten = (r: RollenZeile, recht: Recht, an: boolean) =>
    speichern(r.id, { rechte: an ? [...new Set([...r.rechte, recht])] : r.rechte.filter((x) => x !== recht) });

  const anlegen = async () => {
    if (!neu?.name.trim()) return;
    // Startwert: wie die eingebaute Rolle derselben Stufe (Büro bzw. Monteur)
    const vorlage = rollen.find((r) => r.schluessel === (neu.basis === "chef" ? "buero" : "monteur"));
    setLaeuft(true);
    const { data, error } = await supabase.from("rollen")
      .insert({ name: neu.name.trim(), basis: neu.basis, rechte: vorlage?.rechte ?? [], reihenfolge: 100 })
      .select("id").single();
    setLaeuft(false);
    if (error) {
      return toast.error("Rolle nicht angelegt", {
        description: /rollen_name_key|duplicate/.test(error.message) ? "Diesen Namen gibt es schon." : error.message,
      });
    }
    setNeu(null);
    await neuLaden();
    setGewaehlt(data.id);
    toast.success(`Rolle „${neu.name.trim()}“ angelegt — jetzt die Rechte anhaken`);
  };

  const loeschen = (r: RollenZeile) => setFrage({
    titel: `Rolle „${r.name}“ löschen?`,
    text: "Die Rolle verschwindet aus der Auswahl. Wer sie noch hat, muss vorher eine andere bekommen.",
    knopf: "Löschen",
    gefahr: true,
    aktion: async () => {
      const { error } = await supabase.from("rollen").delete().eq("id", r.id);
      if (error) return void toast.error("Nicht gelöscht", { description: error.message });
      setGewaehlt(null);
      await neuLaden();
    },
  });

  const istChefRolle = rolle.schluessel === "chef";
  const sichtbar = RECHTE.filter((x) => rolle.basis === "chef" || !x.nurBuero);
  const leute = wer(rolle);

  return (
    <Karte titel="Rollen & Rechte">
      <p className="mb-3 text-sm text-muted-foreground">
        Wähle eine Rolle und schalte ein, was sie darf. Wer welche Rolle hat, stellst du unten bei der Person ein.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rollen">
        {rollen.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === rolle.id} onClick={() => setGewaehlt(r.id)}
            className={cn("min-h-10 rounded-md border px-3 text-sm font-medium transition-colors",
              r.id === rolle.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {r.name}
          </button>
        ))}
        <button type="button" onClick={() => setNeu({ name: "", basis: "chef" })}
          className="flex min-h-10 items-center gap-1 rounded-md border border-dashed px-3 text-sm font-medium text-primary hover:border-primary/50">
          <Plus className="h-4 w-4" /> Rolle
        </button>
      </div>

      {neu && (
        <div className="mt-3 space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="rolle-name">Name der neuen Rolle</Label>
            <Input id="rolle-name" value={neu.name} maxLength={40} autoFocus placeholder="z. B. Büro ohne Buchhaltung"
              onChange={(e) => setNeu({ ...neu, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") void anlegen(); }} />
          </div>
          <div className="flex h-10 overflow-hidden rounded-md border text-sm" role="group" aria-label="Stufe">
            {([["chef", "Büro-Zugang"], ["monteur", "Nur Baustelle"]] as const).map(([b, t], i) => (
              <button key={b} type="button" aria-pressed={neu.basis === b} onClick={() => setNeu({ ...neu, basis: b })}
                className={cn("flex-1 px-3 font-medium", i > 0 && "border-l", neu.basis === b ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-10" onClick={() => setNeu(null)}>Abbrechen</Button>
            <Button className="h-10" disabled={!neu.name.trim() || laeuft} onClick={() => void anlegen()}>Anlegen</Button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md border" data-rolle={rolle.name}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-semibold">{rolle.name}</p>
          <span className="text-xs text-muted-foreground">{rolle.basis === "chef" ? "Büro-Zugang" : "Nur Baustelle"}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {leute.length === 0 ? "Hat noch niemand" : leute.map((p) => p.vorname || p.email).join(", ")}
          </span>
        </div>
        {istChefRolle ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Der Chef darf immer alles — auch Rollen und Rechte vergeben.</p>
        ) : (
          <ul className="divide-y">
            {sichtbar.map((x) => {
              const an = rolle.rechte.includes(x.recht);
              return (
                <li key={x.recht} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`recht-${x.recht}`} className="font-medium">{x.titel}</Label>
                    <p className="text-xs text-muted-foreground">{x.text}</p>
                  </div>
                  <Switch id={`recht-${x.recht}`} checked={an} disabled={laeuft} aria-label={`${rolle.name}: ${x.titel}`}
                    onCheckedChange={(v) => void umschalten(rolle, x.recht, v)} />
                </li>
              );
            })}
          </ul>
        )}
        {rolle.basis === "monteur" && !istChefRolle && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Baustellen-Rollen sehen nie Rechnungen, Angebote, Einkaufspreise oder die Buchhaltung.
          </p>
        )}
        {!rolle.schluessel && (
          <div className="flex justify-end border-t px-3 py-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => loeschen(rolle)}>
              <Trash2 className="h-4 w-4" /> Rolle löschen
            </Button>
          </div>
        )}
      </div>
      <Rueckfrage frage={frage} onClose={() => setFrage(null)} />
    </Karte>
  );
}
