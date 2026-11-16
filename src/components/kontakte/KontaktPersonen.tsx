import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import FormularDialog from "@/components/FormularDialog";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feld, leerNull, useBeimOeffnen, Zusatz } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { cn } from "@/lib/utils";

export type KontaktPerson = Tables<"kontakt_personen">;

/** Ansprechpersonen aller Kontakte — wenige Zeilen, einmal laden (Liste, Suche, Kontakt) */
export function useKontaktPersonen() {
  return useQuery({
    queryKey: ["kunden", "personen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kontakt_personen").select("*").order("name").limit(5000);
      if (error) throw error;
      return (data ?? []) as KontaktPerson[];
    },
  });
}

const FUNKTIONEN = ["Außendienst", "Innendienst"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const telLink = (t: string | null) => {
  const n = (t ?? "").replace(/[^\d+]/g, "");
  return n ? `tel:${n}` : null;
};

/**
 * Ansprechpersonen eines Lieferanten (oder Partners): Außendienst,
 * Innendienst … je mit Telefon und E-Mail — antippen ruft an bzw. schreibt.
 */
export function KontaktPersonen({ kundeId }: { kundeId: string }) {
  const { data: alle = [], isLoading } = useKontaktPersonen();
  const personen = alle.filter((p) => p.kunde_id === kundeId);
  const [dialog, setDialog] = useState<{ person: KontaktPerson | null } | null>(null);

  return (
    <Karte titel={`Ansprechpersonen${personen.length ? ` · ${personen.length}` : ""}`} ohnePolster
      aktion={
        <Button variant="outline" className="h-10" onClick={() => setDialog({ person: null })}>
          <Plus className="h-4 w-4" /> Person
        </Button>
      }>
      {isLoading ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Lädt…</p>
      ) : personen.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">
          Noch keine – z. B. Außendienst und Innendienst mit Telefon und E-Mail eintragen.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {personen.map((p) => {
            const tel = telLink(p.telefon);
            return (
              <li key={p.id} className="flex min-h-14 items-center gap-2 px-4 py-2 lg:px-5">
                <button type="button" onClick={() => setDialog({ person: p })} className="min-w-0 flex-1 text-left" aria-label={`${p.name} bearbeiten`}>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span className="truncate">{p.name}</span>
                    {p.funktion && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{p.funktion}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{[p.telefon, p.email].filter(Boolean).join(" · ") || "–"}</p>
                  {p.notiz && <p className="truncate text-xs text-muted-foreground">{p.notiz}</p>}
                </button>
                {tel && (
                  <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0">
                    <a href={tel} aria-label={`${p.name} anrufen`} title={p.telefon ?? undefined}><Phone className="h-4 w-4" /></a>
                  </Button>
                )}
                {p.email && (
                  <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0">
                    <a href={`mailto:${p.email}`} aria-label={`${p.name} schreiben`} title={p.email}><Mail className="h-4 w-4" /></a>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="hidden h-11 w-11 shrink-0 sm:inline-flex" onClick={() => setDialog({ person: p })} aria-label={`${p.name} bearbeiten`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <PersonDialog offen={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }} kundeId={kundeId} person={dialog?.person ?? null} />
    </Karte>
  );
}

type Form = { name: string; funktion: string; telefon: string; email: string; notiz: string };
const formAus = (p: KontaktPerson | null): Form => ({
  name: p?.name ?? "", funktion: p?.funktion ?? "", telefon: p?.telefon ?? "", email: p?.email ?? "", notiz: p?.notiz ?? "",
});

function PersonDialog({ offen, onOpenChange, kundeId, person }: {
  offen: boolean; onOpenChange: (o: boolean) => void; kundeId: string; person: KontaktPerson | null;
}) {
  const neuLaden = useNeuLaden();
  const [f, setF] = useState<Form>(formAus(null));
  const [basis, setBasis] = useState("");
  const [speichert, setSpeichert] = useState(false);
  useBeimOeffnen(offen ? person?.id ?? "neu" : null, () => {
    const start = formAus(person);
    setF(start);
    setBasis(JSON.stringify(start));
  });
  const setze = <K extends keyof Form>(k: K, v: Form[K]) => setF((a) => ({ ...a, [k]: v }));

  const speichern = async () => {
    const name = f.name.trim();
    if (!name) return toast.error("Bitte einen Namen eingeben.");
    const email = f.email.trim();
    if (email && !EMAIL.test(email)) return toast.error(`E-Mail: „${email}“ sieht nicht wie eine Adresse aus.`);
    const daten = {
      kunde_id: kundeId, name, funktion: leerNull(f.funktion), telefon: leerNull(f.telefon), email: email || null, notiz: leerNull(f.notiz),
    };
    setSpeichert(true);
    const { error } = person
      ? await supabase.from("kontakt_personen").update(daten).eq("id", person.id)
      : await supabase.from("kontakt_personen").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("kunden");
    toast.success(person ? "Person gespeichert" : "Person angelegt");
    onOpenChange(false);
  };

  const entfernen = async () => {
    if (!person) return;
    setSpeichert(true);
    const { error } = await supabase.from("kontakt_personen").delete().eq("id", person.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht entfernt", { description: fehlerText(error) });
    await neuLaden("kunden");
    toast.success(`${person.name} entfernt`);
    onOpenChange(false);
  };

  return (
    <FormularDialog open={offen} onOpenChange={onOpenChange} titel={person ? person.name : "Neue Ansprechperson"}
      gesperrt={speichert} ungespeichert={JSON.stringify(f) !== basis}
      fuss={
        <>
          {person && (
            <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" onClick={() => void entfernen()} disabled={speichert}>
              <Trash2 className="h-4 w-4" /> Entfernen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={() => void speichern()} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      }>
      <div className="mx-auto max-w-2xl space-y-4">
        <Feld id="kp-name" label="Name">
          <Input id="kp-name" className="h-11" value={f.name} onChange={(e) => setze("name", e.target.value)} autoFocus={!person} placeholder="z. B. Martin Huber" />
        </Feld>
        <Feld id="kp-funktion" label={<>Aufgabe<Zusatz>(optional)</Zusatz></>}>
          <div className="flex flex-wrap gap-2">
            {FUNKTIONEN.map((x) => (
              <button key={x} type="button" aria-pressed={f.funktion === x} onClick={() => setze("funktion", f.funktion === x ? "" : x)}
                className={cn("h-10 rounded-md border px-3 text-sm font-medium transition-colors",
                  f.funktion === x ? "border-primary bg-primary-soft text-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
                {x}
              </button>
            ))}
          </div>
          <Input id="kp-funktion" className="h-11" value={f.funktion} onChange={(e) => setze("funktion", e.target.value)} maxLength={60}
            placeholder="oder selbst eintragen, z. B. Buchhaltung" />
        </Feld>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld id="kp-tel" label="Telefon">
            <Input id="kp-tel" className="h-11" type="tel" inputMode="tel" value={f.telefon} onChange={(e) => setze("telefon", e.target.value)} />
          </Feld>
          <Feld id="kp-mail" label="E-Mail">
            <Input id="kp-mail" className="h-11" type="email" inputMode="email" value={f.email} onChange={(e) => setze("email", e.target.value)} />
          </Feld>
        </div>
        <Feld id="kp-notiz" label={<>Notiz<Zusatz>(optional)</Zusatz></>}>
          <Input id="kp-notiz" className="h-11" value={f.notiz} onChange={(e) => setze("notiz", e.target.value)} maxLength={500}
            placeholder="z. B. zuständig für PV, Mo–Do erreichbar" />
        </Feld>
      </div>
    </FormularDialog>
  );
}
