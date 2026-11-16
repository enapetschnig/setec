import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bus, Check, ChevronDown, FileText, FolderKanban, Mail, MapPin, Navigation, Package, Phone, ScanBarcode, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useAngebotMaterial } from "@/components/material/artikelDaten";
import { ausfassVorschlag, verbrauchtKarte } from "@/components/material/artikelLogik";
import { mengeText, useProjektMaterial } from "@/components/material/materialDaten";
import { useFahrzeuge, useMitarbeiter, useProjekt, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { name, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const karte = (adresse: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
const route = (adresse: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`;
const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/**
 * „Heute – Morgen“ aufgeklappt: alles, was man vor Ort zum Einsatz braucht —
 * Adresse mit Karte und Navigation, Kunde mit Telefon, Notizen, wer noch
 * dabei ist, Bus und Geräte, offene Hinweise und der Weg ins Projekt.
 */
export function EinsatzDetails({ t }: { t: Termin }) {
  const { profil } = useSitzung();
  const { data: projekt, isLoading } = useProjekt(t.projekt_id ?? undefined);
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: teams = [] } = useTeams();
  const { data: regieOffen = 0 } = useQuery({
    queryKey: ["regieberichte", "offen", t.projekt_id],
    enabled: !!t.projekt_id,
    queryFn: async () => {
      const { count, error } = await supabase.from("regieberichte").select("id", { count: "exact", head: true }).eq("projekt_id", t.projekt_id!).eq("status", "entwurf");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const adresse = (projekt ? [projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") || t.ort || "";
  const kunde = projekt?.kunden;
  const kollegen = t.mitarbeiter.filter((id) => id !== profil?.id).map((id) => mitarbeiter.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const team = teams.find((x) => x.id === t.team_id);
  const geraete = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f);
  const hinweise = [
    t.dringend && t.status !== "erledigt" ? "Dringend — zuerst erledigen" : null,
    regieOffen ? `${regieOffen} Regiebericht${regieOffen === 1 ? "" : "e"} noch nicht unterschrieben` : null,
    projekt?.status === "angebot" ? "Projekt ist noch im Angebot — Buchen erst, wenn es „In Arbeit“ ist" : null,
  ].filter((x): x is string => !!x);

  if (t.projekt_id && isLoading) return <p className="py-2 text-sm text-muted-foreground">Projekt wird geladen …</p>;

  return (
    <div className="space-y-3 border-t pt-3 text-sm" data-einsatz-details>
      {projekt && (
        <p className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span><span className="font-mono text-xs text-muted-foreground">{projekt.nummer}</span> <span className="font-semibold">{projekt.name}</span></span>
        </p>
      )}
      {adresse && (
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p>{adresse}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="h-11"><a href={karte(adresse)} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" /> Karte</a></Button>
              <Button asChild variant="outline" className="h-11"><a href={route(adresse)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Navigation</a></Button>
            </div>
          </div>
        </div>
      )}
      {kunde && (
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{kunde.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {kunde.telefon && <a href={tel(kunde.telefon)} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary"><Phone className="h-4 w-4" />{kunde.telefon}</a>}
              {kunde.email && <a href={`mailto:${kunde.email}`} className="inline-flex min-h-11 min-w-0 items-center gap-1.5 text-primary"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{kunde.email}</span></a>}
            </div>
          </div>
        </div>
      )}
      {(t.beschreibung || projekt?.beschreibung) && (
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1">
            {t.beschreibung && <p className="whitespace-pre-line">{t.beschreibung}</p>}
            {projekt?.beschreibung && <p className="whitespace-pre-line text-muted-foreground">{projekt.beschreibung}</p>}
          </div>
        </div>
      )}
      {(kollegen.length > 0 || team) && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dabei{team ? ` · Team ${team.name}` : ""}</p>
          {kollegen.length === 0 ? <p className="text-muted-foreground">Nur du</p> : (
            <ul className="space-y-1">
              {kollegen.map((m) => (
                <li key={m.id} className="flex min-h-11 items-center gap-2">
                  <Avatar profil={m} className="h-7 w-7 text-[0.625rem]" />
                  <span className="min-w-0 flex-1 truncate">{name(m)}</span>
                  {m.telefon && <a href={tel(m.telefon)} aria-label={`${name(m)} anrufen`} className="flex h-11 w-11 items-center justify-center rounded-md border text-primary"><Phone className="h-4 w-4" /></a>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {geraete.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          <Bus className="h-4 w-4 shrink-0 text-muted-foreground" />
          {geraete.map((f) => <span key={f.id} className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">{f.name}{f.kennzeichen ? ` · ${f.kennzeichen}` : ""}</span>)}
        </p>
      )}
      {hinweise.length > 0 && (
        <ul className="space-y-1 rounded-md border border-status-gelb-fg/30 bg-status-gelb px-3 py-2 text-status-gelb-fg">
          {hinweise.map((h) => <li key={h} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{h}</li>)}
        </ul>
      )}
      {t.projekt_id && <MaterialLautAngebot projektId={t.projekt_id} buchbar={projekt?.status !== "angebot"} />}
      {t.projekt_id && (
        <Button asChild className="h-11 w-full sm:w-auto"><Link to={`/projekte/${t.projekt_id}`}><FolderKanban className="h-4 w-4" /> Ins Projekt</Link></Button>
      )}
      {!projekt && !adresse && !t.beschreibung && !kollegen.length && <p className="text-muted-foreground">Kein Projekt hinterlegt.</p>}
    </div>
  );
}

/**
 * „Das Material brauche ich“: was laut Angebot noch mitzunehmen ist — ohne
 * Preise, schon Ausgefasstes abgezogen (wie der Vorschlag beim Ausfassen).
 */
function MaterialLautAngebot({ projektId, buchbar }: { projektId: string; buchbar: boolean }) {
  const [offen, setOffen] = useState(false);
  const { data: angebot } = useAngebotMaterial(projektId);
  const { data: projektMaterial } = useProjektMaterial(angebot ? projektId : null);
  const liste = useMemo(
    () => (angebot && projektMaterial ? ausfassVorschlag(angebot.bedarf, verbrauchtKarte(projektMaterial)) : []),
    [angebot, projektMaterial],
  );
  if (!angebot || !liste.length) return null;
  const nochOffen = liste.filter((v) => v.offen > 0).length;
  return (
    <div className="rounded-md border" data-einsatz-material>
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left">
        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 font-medium">Material laut Angebot ({liste.length})</span>
        <span className="shrink-0 text-xs text-muted-foreground">{nochOffen ? `${nochOffen} offen` : "alles ausgefasst"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
      </button>
      {offen && (
        <div className="border-t px-3 pb-3">
          <ul className="divide-y">
            {liste.map((v) => {
              const a = angebot.artikel.get(v.artikel_id);
              return (
                <li key={v.artikel_id} className={cn("flex items-start gap-2 py-2", v.offen === 0 && "text-muted-foreground")}>
                  <span className="min-w-0 flex-1">{a?.bezeichnung ?? "Artikel"}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    {v.offen === 0
                      ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />{mengeText(v.soll, a?.einheit)}</span>
                      : <><span className="font-semibold">{mengeText(v.offen, a?.einheit)}</span>{v.schon > 0 && <span className="block text-xs text-muted-foreground">von {mengeText(v.soll, a?.einheit)}</span>}</>}
                  </span>
                </li>
              );
            })}
          </ul>
          {buchbar && nochOffen > 0 && (
            <Button asChild variant="outline" className="mt-2 h-11 w-full">
              <Link to={`/scan?projekt=${projektId}&modus=ausfassung`}><ScanBarcode className="h-4 w-4" /> Jetzt ausfassen</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
