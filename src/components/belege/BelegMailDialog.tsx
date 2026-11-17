import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Mail, Paperclip, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mailAdresse } from "./bestaetigung";
import type { Datenblatt } from "./datenblattLogik";
import { blobBase64, empfaengerLesen, type MailArt, type MailVorgabe } from "./mail";
import { standardAbsender, usePostfaecher } from "@/lib/postfach";

/**
 * Angebot oder Rechnung per E-Mail an den Kunden — mit dem PDF als Anhang
 * (Edge Function `beleg-mail`, Resend). Empfänger, Betreff und Text sind
 * vorbelegt und änderbar; Antworten gehen an die Firmen-Mail. Bei Rechnungen
 * hängt die Function das abgelegte Original an, beim Angebot das PDF wie beim
 * Herunterladen plus die gewählten Datenblätter. „Mail-App öffnen“ (mailto:)
 * bleibt als Ausweichweg — dort ohne Anhang.
 * Mit Postfach (Einstellungen → E-Mail, „Senden“ an) geht die Mail über Gmail
 * von dieser Adresse; mehrere → Auswahl „Senden von“ (Vorgabe: Standard-Absender).
 */
export function BelegMailDialog({
  open, onOpenChange, belegId, lieferscheinId, art, vorgabe, anhangName, vorbereiten, datenblaetter = [], startGewaehlt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  belegId?: string;
  /** Kunden-Lieferschein statt Angebot/Rechnung (PDF kommt aus `vorbereiten`) */
  lieferscheinId?: string;
  art: MailArt;
  vorgabe: MailVorgabe;
  anhangName: string;
  /** Angebot: liefert das PDF. Rechnung: stellt sicher, dass das Original im Archiv liegt (kein PDF zurück). */
  vorbereiten: () => Promise<Blob | null>;
  /** nur Angebot — schon gefiltert (nie intern, „nach Auftrag“ erst bei Annahme) */
  datenblaetter?: Datenblatt[];
  startGewaehlt?: string[];
}) {
  const qc = useQueryClient();
  const [an, setAn] = useState(vorgabe.an);
  const [betreff, setBetreff] = useState(vorgabe.betreff);
  const [text, setText] = useState(vorgabe.text);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set(startGewaehlt ?? datenblaetter.map((d) => d.pfad)));
  const [sendet, setSendet] = useState(false);
  const { data: postfaecher = [] } = usePostfaecher(open);
  const absender = postfaecher.filter((p) => p.aktiv && p.senden).map((p) => p.adresse).sort();
  const [von, setVon] = useState<string | null>(null);
  const vonGilt = von && absender.includes(von) ? von : standardAbsender(postfaecher);

  // Beim Öffnen frisch vorbelegen (Link, Anzahl Datenblätter können sich geändert haben)
  useEffect(() => {
    if (!open) return;
    setAn(vorgabe.an);
    setBetreff(vorgabe.betreff);
    setText(vorgabe.text);
    setGewaehlt(new Set(startGewaehlt ?? datenblaetter.map((d) => d.pfad)));
    setVon(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const empfaenger = empfaengerLesen(an);
  const geaendert = an !== vorgabe.an || betreff !== vorgabe.betreff || text !== vorgabe.text;

  const senden = async () => {
    if (!empfaenger) return toast.error("Bitte eine gültige E-Mail-Adresse eintragen", { description: "Mehrere mit Komma trennen, höchstens 3." });
    if (!betreff.trim() || !text.trim()) return toast.error("Betreff und Text brauchen wir");
    setSendet(true);
    try {
      const pdf = await vorbereiten();
      const { data, error } = await supabase.functions.invoke("beleg-mail", {
        body: {
          ...(lieferscheinId ? { kunden_lieferschein_id: lieferscheinId } : { beleg_id: belegId }), an: empfaenger.join(", "), betreff: betreff.trim(), text: text.trim(), pdf_name: anhangName,
          ...(pdf ? { pdf: await blobBase64(pdf) } : {}),
          datenblaetter: datenblaetter.filter((d) => gewaehlt.has(d.pfad)).map((d) => d.pfad),
          ...(vonGilt ? { von: vonGilt } : {}),
        },
      });
      if (error) {
        let meldung = error.message;
        try { meldung = (await (error as { context?: Response }).context?.json())?.error ?? meldung; } catch { /* Netz */ }
        throw new Error(meldung);
      }
      toast.success(`${art} an ${(data as { an?: string[] })?.an?.join(", ") ?? empfaenger.join(", ")} gesendet`);
      if (lieferscheinId) void qc.invalidateQueries({ queryKey: ["kls"] });
      void qc.invalidateQueries({ queryKey: ["belege", "online", belegId] });
      void qc.invalidateQueries({ queryKey: ["belege", "gesendet", belegId] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gesendet", { description: (e as Error).message });
    } finally {
      setSendet(false);
    }
  };

  const zahl = datenblaetter.filter((d) => gewaehlt.has(d.pfad)).length;

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={`${art} per E-Mail`}
      beschreibung={vonGilt ? `Mit PDF im Anhang — von ${vonGilt}, liegt danach in Gmail unter „Gesendet“.` : "Mit PDF im Anhang — Antworten des Kunden kommen an die Firmen-Mail."}
      gesperrt={sendet}
      ungespeichert={geaendert && !sendet}
      fuss={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" asChild>
            <a href={mailAdresse(an, betreff, text)}><Mail className="h-4 w-4" /> Mail-App öffnen (ohne Anhang)</a>
          </Button>
          <Button className="h-11" onClick={() => void senden()} disabled={sendet}>
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sendet ? "Sendet …" : "Senden"}
          </Button>
        </div>
      }
    >
      <div className="max-w-2xl space-y-4">
        {absender.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="mail-von">Senden von</Label>
            <select id="mail-von" className="h-11 w-full rounded-md border bg-card px-3 text-base sm:text-sm" value={vonGilt ?? ""} onChange={(e) => setVon(e.target.value)}>
              {absender.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="mail-an">An</Label>
          <Input id="mail-an" type="email" inputMode="email" autoComplete="email" className="h-11" value={an} multiple
            placeholder="kunde@beispiel.at" onChange={(e) => setAn(e.target.value)} aria-invalid={!!an && !empfaenger} />
          {!an.trim()
            ? <p className="text-xs text-muted-foreground">Beim Kunden ist keine Mail-Adresse hinterlegt — hier eintragen.</p>
            : !empfaenger && <p className="text-xs font-medium text-destructive">Das ist keine gültige Adresse (mehrere mit Komma, höchstens 3).</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail-betreff">Betreff</Label>
          <Input id="mail-betreff" className="h-11" value={betreff} maxLength={200} onChange={(e) => setBetreff(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail-text">Text</Label>
          <Textarea id="mail-text" rows={12} value={text} maxLength={10000} onChange={(e) => setText(e.target.value)} className="min-h-[14rem]" />
        </div>

        <section aria-label="Anhänge" className="rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold">
            <Paperclip className="h-4 w-4 text-primary" /> Anhänge
          </h3>
          <ul className="divide-y text-sm">
            <li className="flex min-h-11 items-center gap-2 px-4 py-1.5">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{anhangName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{art === "Angebot" || art === "Lieferschein" ? "PDF" : "Original"}</span>
            </li>
            {datenblaetter.map((d) => (
              <li key={d.pfad}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-1.5">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={gewaehlt.has(d.pfad)}
                    onChange={(e) => setGewaehlt((s) => { const n = new Set(s); if (e.target.checked) n.add(d.pfad); else n.delete(d.pfad); return n; })} />
                  <span className="min-w-0 flex-1 truncate">{d.name}{d.artikel && <span className="text-muted-foreground"> · {d.artikel}</span>}</span>
                </label>
              </li>
            ))}
          </ul>
          {datenblaetter.length > 0 && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              {zahl} von {datenblaetter.length} {datenblaetter.length === 1 ? "Datenblatt" : "Datenblättern"} — „nur intern“ geht nie mit, „erst nach Auftrag“ erst nach der Annahme.
            </p>
          )}
        </section>
      </div>
    </FormularDialog>
  );
}
