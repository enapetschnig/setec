import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Serienaufnahme } from "@/components/Serienaufnahme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Feld, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { fahrzeugFotosHochladen } from "@/components/fuhrpark/fuhrparkDaten";
import { useFahrzeuge, useLagerorte, useNeuLaden, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, isoTag } from "@/lib/format";
import { meinFahrzeug } from "@/lib/fuhrpark";
import { FAHRZEUG_EINTRAG, type Fahrzeug } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Höchstens so viele Fotos je Eintrag auf einmal */
const MAX_FOTOS = 20;

/**
 * Neuer Bordbuch-Eintrag. Monteure: nur Schaden oder Tanken. Fotos dazu
 * (Kamera oder Galerie, verkleinert wie die Baustellenfotos) — Stefan,
 * Besprechung 17.11.2026: „Schaden am Auto per App mit Fotos“.
 * Ohne `fahrzeug` (Startseite „Schaden melden“) wird zuerst das Fahrzeug
 * gewählt, vorbelegt mit dem eigenen Bus (`meinFahrzeug`).
 */
export function EintragDialog({ open, onOpenChange, fahrzeug, onKm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = Fahrzeug im Dialog wählen */
  fahrzeug: Fahrzeug | null;
  onKm?: (km: number) => void;
}) {
  const neuLaden = useNeuLaden();
  const { istChef, profil } = useSitzung();
  const { data: alleFahrzeuge = [] } = useFahrzeuge();
  const { data: lagerorte = [] } = useLagerorte();
  const { data: teams = [] } = useTeams();
  const arten = istChef ? Object.keys(FAHRZEUG_EINTRAG) : ["schaden", "tanken"];
  const startArt = istChef && fahrzeug ? "service" : "schaden";
  const [art, setArt] = useState(startArt);
  const [fahrzeugId, setFahrzeugId] = useState("");
  const [text, setText] = useState("");
  const [tag, setTag] = useState(isoTag());
  const [km, setKm] = useState("");
  const [kosten, setKosten] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [vorschauen, setVorschauen] = useState<string[]>([]);
  const [serieOffen, setSerieOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  // Eintrag steht schon, nur Fotos fehlen noch (Funkloch) — „Speichern“ lädt dann nur sie nach
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const fz = fahrzeug ?? alleFahrzeuge.find((f) => f.id === fahrzeugId) ?? null;
  const kmVon = (f: Fahrzeug | null | undefined) => (f?.km_stand != null ? String(f.km_stand) : "");

  useBeimOeffnen(open ? "offen" : null, () => {
    setArt(startArt);
    setFahrzeugId(fahrzeug?.id ?? "");
    setText("");
    setTag(isoTag());
    setKm(kmVon(fahrzeug));
    setKosten("");
    setFotos([]);
    setGespeichert(null);
  });

  // Startseite: den eigenen Bus vorbelegen, sobald Fahrzeuge, Lagerorte und Teams da sind
  const vorschlag = fahrzeug ? null : meinFahrzeug(alleFahrzeuge, lagerorte, teams, profil?.id);
  useEffect(() => {
    if (!open || fahrzeug || fahrzeugId || !vorschlag) return;
    setFahrzeugId(vorschlag);
    setKm(kmVon(alleFahrzeuge.find((f) => f.id === vorschlag)));
  }, [open, fahrzeug, fahrzeugId, vorschlag, alleFahrzeuge]);

  useEffect(() => {
    const neu = fotos.map((d) => URL.createObjectURL(d));
    setVorschauen(neu);
    return () => neu.forEach((u) => URL.revokeObjectURL(u));
  }, [fotos]);

  const fotosDazu = (liste: FileList | File[] | null) => {
    if (!liste || !liste.length) return;
    // Sofort kopieren — die FileList des Feldes ist nach dem Leeren weg
    const neu = Array.from(liste).filter((d) => d.type.startsWith("image/") || /\.(heic|heif)$/i.test(d.name));
    setFotos((v) => [...v, ...neu].slice(0, MAX_FOTOS));
  };

  const speichern = async () => {
    if (!fz) return toast.error("Bitte zuerst das Fahrzeug oder Gerät wählen.");
    let id = gespeichert;
    if (!id) {
      if (!text.trim()) return toast.error(art === "schaden" ? "Bitte kurz beschreiben, was kaputt ist." : "Bitte kurz beschreiben, was gemacht wurde.");
      const kmZahl = km.trim() ? dezimalLesen(km) : null;
      const kostenZahl = kosten.trim() ? dezimalLesen(kosten) : null;
      if ((kmZahl !== null && kmZahl < 0) || (kostenZahl !== null && kostenZahl < 0)) return toast.error("Kilometer und Kosten können nicht negativ sein.");
      setSpeichert(true);
      const { data, error } = await supabase.from("fahrzeug_eintraege").insert({
        fahrzeug_id: fz.id, art, text: text.trim(), datum: tag, km: kmZahl === null ? null : Math.round(kmZahl),
        kosten: kostenZahl, erledigt: art !== "schaden", erstellt_von: profil?.id,
      }).select("id").single();
      if (error || !data) {
        setSpeichert(false);
        return toast.error("Nicht gespeichert", { description: error ? fehlerText(error) : undefined });
      }
      id = data.id;
      setGespeichert(id);
      // km-Stand mitziehen, wenn er höher ist (nur Chef darf das Fahrzeug ändern)
      if (istChef && kmZahl !== null && kmZahl > (fz.km_stand ?? 0)) {
        const { error: kmFehler } = await supabase.from("fahrzeuge").update({ km_stand: Math.round(kmZahl) }).eq("id", fz.id);
        if (!kmFehler) onKm?.(Math.round(kmZahl));
      }
    } else {
      setSpeichert(true);
    }
    const anzahl = fotos.length;
    const { fehlgeschlagen, fehler } = anzahl ? await fahrzeugFotosHochladen(id, fotos) : { fehlgeschlagen: [], fehler: [] };
    setSpeichert(false);
    await neuLaden("fahrzeuge");
    if (fehlgeschlagen.length) {
      setFotos(fehlgeschlagen);
      return toast.error(`${fehlgeschlagen.length} von ${anzahl} ${anzahl === 1 ? "Foto" : "Fotos"} nicht gespeichert`, {
        description: `Der Eintrag ist gespeichert. „Fotos nachladen“ versucht es noch einmal. ${fehler[0] ?? ""}`.trim(),
      });
    }
    const mitFotos = anzahl ? ` · ${anzahl} ${anzahl === 1 ? "Foto" : "Fotos"}` : "";
    toast.success(art === "schaden" ? `Schaden gemeldet${mitFotos} — der Chef sieht es` : `Eingetragen${mitFotos}`);
    onOpenChange(false);
  };

  const titel = istChef && fahrzeug ? "Bordbuch-Eintrag" : art === "tanken" ? "Tanken eintragen" : "Schaden melden";
  return (
    <>
      <FormularDialog open={open && !serieOffen} onOpenChange={onOpenChange} titel={titel} beschreibung={fahrzeug?.name}
        gesperrt={speichert} ungespeichert={gespeichert ? fotos.length > 0 : !!text.trim() || fotos.length > 0}
        fuss={(
          <>
            <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>{gespeichert ? "Ohne Fotos schließen" : "Abbrechen"}</Button>
            <Button className="h-12 min-w-32" onClick={() => void speichern()} disabled={speichert}>
              {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {speichert && fotos.length ? "Lädt hoch …" : gespeichert ? "Fotos nachladen" : "Speichern"}
            </Button>
          </>
        )}>
        <div className="max-w-xl space-y-4" data-eintrag-dialog>
          {gespeichert && (
            <p className="rounded-lg border border-status-gelb-fg/40 bg-status-gelb/40 px-3 py-2.5 text-sm">
              Der Eintrag ist gespeichert — {fotos.length === 1 ? "1 Foto fehlt" : `${fotos.length} Fotos fehlen`} noch.
            </p>
          )}
          <fieldset disabled={!!gespeichert} className="min-w-0 space-y-4">
            {!fahrzeug && (
              <Feld id="b-fahrzeug" label="Welches Fahrzeug oder Gerät?">
                <Select value={fahrzeugId} onValueChange={(id) => { setFahrzeugId(id); setKm(kmVon(alleFahrzeuge.find((f) => f.id === id))); }}>
                  <SelectTrigger id="b-fahrzeug" className="h-12 text-base"><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                  <SelectContent>
                    {alleFahrzeuge.map((f) => <SelectItem key={f.id} value={f.id}>{[f.name, f.kennzeichen].filter(Boolean).join(" · ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Feld>
            )}
            <div className="flex flex-wrap gap-2">
              {arten.map((a) => (
                <button key={a} type="button" aria-pressed={art === a} onClick={() => setArt(a)}
                  className={cn("min-h-11 rounded-full border px-3.5 text-sm font-medium", art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                  {FAHRZEUG_EINTRAG[a].text}
                </button>
              ))}
            </div>
            <Feld id="b-text" label={art === "schaden" ? "Was ist kaputt?" : "Was wurde gemacht?"}>
              <Textarea id="b-text" rows={3} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={art === "schaden" ? "z. B. Seitenspiegel rechts gebrochen" : "z. B. Ölwechsel, Bremsen vorne"} />
            </Feld>
          </fieldset>

          <div className="space-y-2" data-schaden-fotos>
            <Label>{art === "schaden" ? "Fotos vom Schaden" : "Fotos"}<Zusatz>(optional)</Zusatz></Label>
            {!gespeichert && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => setSerieOffen(true)} disabled={speichert}>
                  <Camera className="h-5 w-5" /> Fotos machen
                </Button>
                <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => galerie.current?.click()} disabled={speichert}>
                  <ImagePlus className="h-5 w-5" /> Aus Galerie
                </Button>
              </div>
            )}
            <input ref={galerie} type="file" accept="image/*" multiple className="hidden" aria-label="Fotos aus der Galerie"
              onChange={(e) => { fotosDazu(e.target.files); e.target.value = ""; }} />
            {fotos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotos.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="relative">
                    {vorschauen[i] && <img src={vorschauen[i]} alt={d.name} className="aspect-square w-full rounded-md border object-cover" />}
                    {!speichert && (
                      <button type="button" onClick={() => setFotos((v) => v.filter((_, j) => j !== i))}
                        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow" aria-label={`Foto ${i + 1} entfernen`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <fieldset disabled={!!gespeichert} className="min-w-0">
            <div className="grid grid-cols-3 gap-2">
              <Feld id="b-datum" label="Datum"><Input id="b-datum" type="date" className="h-11" value={tag} onChange={(e) => setTag(e.target.value)} /></Feld>
              <Feld id="b-km" label="km"><Input id="b-km" className="zahl h-11" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Feld>
              <Feld id="b-kosten" label="Kosten €"><Input id="b-kosten" className="zahl h-11 text-right" inputMode="decimal" value={kosten} onChange={(e) => setKosten(e.target.value)} placeholder={zahlFeld(null)} /></Feld>
            </div>
          </fieldset>
        </div>
      </FormularDialog>

      <Serienaufnahme open={serieOffen} onOpenChange={setSerieOffen} titel={art === "schaden" ? "Fotos vom Schaden" : "Fotos"}
        onFertig={(neu) => { fotosDazu(neu); setSerieOffen(false); }} />
    </>
  );
}
