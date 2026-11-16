import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, isoTag, zahl } from "@/lib/format";
import { ABWESENHEIT_ART, name, type Abwesenheit, type AbwesenheitArt } from "@/lib/types";
import { abwesenheitsTage } from "@/lib/zeitkonto";
import { cn } from "@/lib/utils";

const ARTEN: AbwesenheitArt[] = ["urlaub", "krank", "arzt", "zeitausgleich", "berufsschule", "sonstiges"];

/**
 * Urlaub & Co.: der Monteur beantragt, der Chef genehmigt — Krankenstand ist
 * eine Meldung und gilt sofort. Trägt der Chef ein, gilt es auch sofort.
 * Aus der Plantafel: Person und Tag(e) vorbelegt, oder eine bestehende
 * Abwesenheit (`abwesenheitId`) bearbeiten bzw. löschen.
 */
export function AbwesenheitDialog({ open, onOpenChange, userId: vorUser, von: vorVon, bis: vorBis, abwesenheitId }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: string;
  von?: string;
  bis?: string;
  abwesenheitId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [userId, setUserId] = useState("");
  const [art, setArt] = useState<AbwesenheitArt>("urlaub");
  const [von, setVon] = useState(isoTag());
  const [bis, setBis] = useState(isoTag());
  const [std, setStd] = useState("");
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  // Bearbeiten: die ganze Zeile (Grund, Notiz) — die Kalender-Sicht hat nur „abwesend“
  const { data: alt } = useQuery({
    queryKey: ["abwesenheiten", "eine", abwesenheitId],
    enabled: open && !!abwesenheitId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abwesenheiten").select("*").eq("id", abwesenheitId!).maybeSingle();
      if (error) throw error;
      return data as Abwesenheit | null;
    },
  });
  const bearbeiten = abwesenheitId ? alt ?? null : null;

  useBeimOeffnen(!open ? null : abwesenheitId ? (bearbeiten ? `e|${bearbeiten.id}` : null) : `n|${vorUser ?? ""}|${vorVon ?? ""}|${vorBis ?? ""}`, () => {
    setLoeschFrage(false);
    if (bearbeiten) {
      setUserId(bearbeiten.user_id);
      setArt(bearbeiten.art as AbwesenheitArt);
      setVon(bearbeiten.von);
      setBis(bearbeiten.bis);
      setStd(bearbeiten.stunden ? String(bearbeiten.stunden).replace(".", ",") : "");
      setNotiz(bearbeiten.notiz ?? "");
      return;
    }
    setUserId(vorUser ?? profil?.id ?? "");
    setArt("urlaub");
    setVon(vorVon ?? isoTag());
    setBis(vorBis && vorBis >= (vorVon ?? "") ? vorBis : vorVon ?? isoTag());
    setStd("");
    setNotiz("");
  });

  const einTag = von === bis;
  const tage = von && bis && bis >= von ? abwesenheitsTage({ von, bis }).length : 0;
  const sofort = istChef || art === "krank";

  const speichern = async () => {
    if (!von || !bis) return toast.error("Bitte von und bis eintragen.");
    if (bis < von) return toast.error("„Bis“ liegt vor „Von“.");
    if (tage === 0) return toast.error("In diesem Zeitraum liegt kein Arbeitstag — Wochenende oder Feiertag.");
    const stunden = einTag && std.trim() ? dezimalLesen(std) : null;
    if (einTag && std.trim() && !(stunden && stunden > 0 && stunden <= 24)) return toast.error("Stunden bitte prüfen.");
    setSpeichert(true);
    const werte = { user_id: userId || profil!.id, art, von, bis, stunden, notiz: notiz.trim() || null };
    const { error } = bearbeiten
      ? await supabase.from("abwesenheiten").update(werte).eq("id", bearbeiten.id)
      : await supabase.from("abwesenheiten").insert(werte);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(bearbeiten ? `${ABWESENHEIT_ART[art].text} geändert`
      : sofort ? `${ABWESENHEIT_ART[art].text} eingetragen` : `${ABWESENHEIT_ART[art].text} beantragt — der Chef bekommt das auf die Startseite`);
    await neuLaden("abwesenheiten", "zeiten");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!bearbeiten) return;
    setSpeichert(true);
    const { data, error } = await supabase.from("abwesenheiten").delete().eq("id", bearbeiten.id).select("id");
    setSpeichert(false);
    if (error || !data?.length) return toast.error("Nicht gelöscht", { description: error ? fehlerText(error) : "Genehmigtes löscht nur der Chef." });
    toast.success(`${ABWESENHEIT_ART[bearbeiten.art as AbwesenheitArt]?.text ?? "Abwesenheit"} gelöscht`);
    await neuLaden("abwesenheiten", "zeiten");
    onOpenChange(false);
  };
  const darfLoeschen = !!bearbeiten && (istChef || (bearbeiten.user_id === profil?.id && bearbeiten.status === "beantragt"));

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel={abwesenheitId ? "Abwesenheit bearbeiten" : "Abwesenheit"} gesperrt={speichert}
      fuss={
        <>
          {darfLoeschen && (loeschFrage ? (
            <Button variant="destructive" className="sm:mr-auto" onClick={loeschen} disabled={speichert}>Wirklich löschen</Button>
          ) : (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setLoeschFrage(true)} disabled={speichert}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          ))}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert || (!!abwesenheitId && !bearbeiten)} className="min-w-40 gap-2">
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} {bearbeiten ? "Speichern" : sofort ? "Eintragen" : "Beantragen"}
          </Button>
        </>
      }
    >
      {abwesenheitId && !bearbeiten ? <p className="text-sm text-muted-foreground">Wird geladen …</p> : (
      <div className="max-w-xl space-y-5">
        {istChef && mitarbeiter.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="ab-wer">Für wen?</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="ab-wer" className="h-12"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
              <SelectContent>
                {mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{name(m)}{m.id === profil?.id ? " (ich)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Was?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Art der Abwesenheit">
            {ARTEN.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={art === a} onClick={() => setArt(a)}
                className={cn("h-12 rounded-md border px-2 text-sm font-medium transition-colors",
                  art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                {ABWESENHEIT_ART[a].text}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ab-von" className="text-xs">Von</Label>
            <Input id="ab-von" type="date" className="h-12" value={von}
              onChange={(e) => { setVon(e.target.value); if (!bis || bis < e.target.value) setBis(e.target.value); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ab-bis" className="text-xs">Bis</Label>
            <Input id="ab-bis" type="date" className="h-12" min={von} value={bis} onChange={(e) => setBis(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {tage === 1 ? "1 Arbeitstag" : `${zahl(tage)} Arbeitstage`} — Wochenenden und Feiertage zählen nicht.
        </p>
        {einTag && (
          <div className="space-y-1">
            <Label htmlFor="ab-std">Nur ein Teil des Tages? <span className="font-normal text-muted-foreground">(Stunden, optional)</span></Label>
            <Input id="ab-std" inputMode="decimal" className="h-12 w-32" value={std} onChange={(e) => setStd(e.target.value)} placeholder="z. B. 2" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="ab-notiz">Notiz <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="ab-notiz" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
      </div>
      )}
    </FormularDialog>
  );
}
