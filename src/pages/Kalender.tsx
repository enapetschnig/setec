import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, FolderKanban, MapPin, Settings2, Truck, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Seite } from "@/components/PageHeader";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useIstPc } from "@/components/AppLayout";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { TeamsDialog } from "@/components/plantafel/TeamsDialog";
import { NichtEingeplant, type Ablage } from "@/components/plantafel/NichtEingeplant";
import { FilterWahl, gefiltert, Legende, MiniKalender, Terminplaner, TerminplanerHandy, useGruppen, type HandyModus, type PlanLeer } from "@/components/plantafel/Terminplaner";
import { ZellWahl, type LeerWahl } from "@/components/plantafel/ZellWahl";
import { AbwesenheitDialog } from "@/components/zeiten/AbwesenheitDialog";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useFahrzeuge, useKunden, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { adresseZeile, artText, einsatzAusProjekt, geraeteSpalten, nichtEingeplant, terminArt, terminFarbe, titelVorschlag } from "@/lib/kalender";
import { kalenderwoche, planStunden } from "@/lib/terminplaner";
import { amTag, konflikte, type Konflikt } from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import { ABWESENHEIT_ART, name, type AbwesenheitArt, type Fahrzeug, type Kunde, type Profil, type Projekt, type Team, type Termin } from "@/lib/types";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { cn } from "@/lib/utils";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
/** Handy: Tag (Leute untereinander), Person (Mo–Fr) oder Woche als Liste — gemerkt */
const HANDY_KEY = "elektro.kalender.handy";
type Handy = HandyModus | "liste";
const lesen = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const merken = (k: string, w: string) => { try { localStorage.setItem(k, w); } catch { /* egal */ } };
const montagVon = (iso: string) => tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
type SchnellTermin = Pick<Termin, "titel" | "art" | "projekt_id" | "kunde_id" | "ort" | "datum" | "bis_datum" | "ganztags" | "mitarbeiter" | "fahrzeuge"> & { von: string; bis: string };
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);

/**
 * /kalender — der einzige Ort zum Einteilen (früher Plantafel mit Gantt).
 * Eine Woche: Spalten = Leute nach Gruppen, Zeilen = Tage mit Stunden, in der
 * Tageszeile Geräte & Fahrzeuge (components/plantafel/Terminplaner). Rechts
 * Monatskalender zum Springen wie in Stefans altem Terminplaner.
 * - Chef: leere Stelle antippen = schnell einplanen (Projekt/Kunde tippen),
 *   ziehen, Knopf „Nicht eingeplant“ = Projektliste statt Monatskalender
 * - Monteur: nur lesen, eigene Termine hervorgehoben; Abwesenheit anderer
 *   nur „abwesend“ (Sicht abwesenheit_kalender)
 * - Handy: Tag | Person | Woche (Liste, Monteur: „Meine“)
 */
export default function Kalender() {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const { istChef, profil, firma } = useSitzung();
  const stunden = useMemo(() => planStunden(firma?.plan_von, firma?.plan_bis), [firma?.plan_von, firma?.plan_bis]);
  const heute = isoTag();
  const [bezug, setBezug] = useState(heute);
  const [nurMeine, setNurMeine] = useState(!istChef);
  const [handy, setHandyState] = useState<Handy>(() => {
    const w = lesen(HANDY_KEY);
    return w === "tag" || w === "person" || w === "liste" ? w : istChef ? "tag" : "liste";
  });
  const setHandy = (m: Handy) => { setHandyState(m); merken(HANDY_KEY, m); };
  const [filter, setFilter] = useState("");
  const [tagIndex, setTagIndex] = useState(() => Math.min(6, (isoZuDatum(heute).getDay() + 6) % 7));
  const [person, setPerson] = useState(profil?.id ?? "");
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string; bisDatum?: string; mitarbeiterId?: string; teamId?: string; fahrzeugId?: string; projektId?: string; von?: string; bis?: string; titel?: string } | null>(null);
  const [teamsOffen, setTeamsOffen] = useState(false);
  const [wahl, setWahl] = useState<(LeerWahl & { mitarbeiterId: string }) | null>(null);
  const [projektListe, setProjektListe] = useState(false);
  const [abwDialog, setAbwDialog] = useState<{ userId?: string; von?: string; bis?: string; id?: string } | null>(null);

  const start = montagVon(bezug);
  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => tageDazu(start, i)), [start]);
  const von = tage[0];
  const bis = tage[6];

  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: projekte = [] } = useProjekte();
  const { data: kunden = [] } = useKunden();
  const { data: abwesend = [] } = useKalenderAbwesenheit(von, bis);
  const gruppen = useGruppen(mitarbeiter, teams);
  const sichtbar = gefiltert(gruppen, filter);
  const geraete = useMemo(() => geraeteSpalten(fahrzeuge), [fahrzeuge]);
  useEffect(() => { if (!person && profil?.id) setPerson(profil.id); }, [person, profil?.id]);
  const termineKey = ["termine", "kalender", von, bis];
  const { data: termine = [] } = useQuery({
    queryKey: termineKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*").lte("datum", bis)
        .or(`bis_datum.gte.${von},and(bis_datum.is.null,datum.gte.${von})`)
        .order("datum").order("von", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Termin[];
    },
    placeholderData: (alt) => alt,
  });
  // Für „Noch nicht eingeplant“: Projekte mit einem Einsatz ab heute
  const { data: eingeplant = new Set<string>() } = useQuery({
    queryKey: ["termine", "eingeplant", heute],
    enabled: istChef,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("projekt_id").not("projekt_id", "is", null)
        .or(`datum.gte.${heute},bis_datum.gte.${heute}`);
      if (error) throw error;
      return new Set((data ?? []).map((x) => x.projekt_id as string));
    },
  });

  useEffect(() => {
    const kanal = supabase.channel("kalender")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => void neuLaden("termine"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abw = abwesend.filter((x): x is typeof x & { user_id: string; von: string; bis: string } => !!x.user_id && !!x.von && !!x.bis);
  const liste = konflikte(termine, tage, abw);
  const konfliktIds = new Set(liste.flatMap((k) => k.termine));
  const meine = nurMeine && profil ? termine.filter((t) => t.mitarbeiter.includes(profil.id)) : termine;

  const blaettern = (r: number) => setBezug(tageDazu(bezug, r * 7));
  const ungeplant = nichtEingeplant(projekte, eingeplant).length;
  const titel = `KW ${kalenderwoche(von)} · ${datumText(von).slice(0, 6)} – ${datumText(bis)}`;

  const wer = (id: string | null | undefined) => name(mitarbeiter.find((m) => m.id === id));
  const leerAusPlan = (v: PlanLeer) => { if (istChef) setWahl({ ...v, wer: wer(v.mitarbeiterId) }); };
  const planDaten = {
    tage, termine, termineKey, teams, mitarbeiter, fahrzeuge, projekte, kunden, abwesend, konfliktIds, darf: istChef, heute, stunden, ich: profil?.id,
    onBearbeiten: (t: Termin) => setDialog({ termin: t }), onLeer: leerAusPlan,
  };
  const abwLoeschen = async (id: string) => {
    setWahl(null);
    const { data, error } = await supabase.from("abwesenheiten").delete().eq("id", id).select("id");
    if (error || !data?.length) { toast.error("Nicht gelöscht", { description: error ? fehlerText(error) : undefined }); return; }
    toast.success("Abwesenheit gelöscht");
    void neuLaden("abwesenheiten", "zeiten");
  };
  const neuerTermin = () => setDialog({ datum: tage.includes(heute) ? heute : von });

  /** Projekt aus „Noch nicht eingeplant“ auf eine Person gezogen */
  const projektAblegen = async (projektId: string, ziel: Ablage) => {
    const p = projekte.find((x) => x.id === projektId);
    if (!p || !istChef) return;
    const werte = einsatzAusProjekt(p, ziel.tag, { art: "person", id: ziel.spalte });
    const { data, error } = await supabase.from("termine").insert(werte).select("id").single();
    if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return; }
    const wo = wer(ziel.spalte);
    toast.success(`${p.nummer} ${p.name}`, {
      description: `${wo ?? ""} · ${datumText(werte.datum).slice(0, 6)}${werte.bis_datum ? ` – ${datumText(werte.bis_datum).slice(0, 6)}` : ""}`,
      duration: 8000,
      action: { label: "Rückgängig", onClick: () => void supabase.from("termine").delete().eq("id", data.id).then(() => neuLaden("termine")) },
    });
    void neuLaden("termine");
  };

  /**
   * Schnell einplanen aus dem kleinen Fenster: Projekt = Montage (angetippt:
   * der Tag 7:00–15:30, aufgezogen: genau der Zeitraum), Kunde = Besichtigung
   * zur angetippten Uhrzeit. Gibt es dieselbe Montage dort schon (gleiches
   * Projekt, gleiche Tage und Zeit), kommt die Person dazu statt eines zweiten Termins.
   */
  const schnellEinplanen = async (w: LeerWahl & { mitarbeiterId: string }, ziel: { projekt: ProjektMitKunde } | { kunde: Kunde }) => {
    setWahl(null);
    const zeit = { von: w.von ?? "07:00", bis: w.bis ?? "15:30" };
    const werte: SchnellTermin = "projekt" in ziel
      ? {
          titel: ziel.projekt.name, art: "montage", projekt_id: ziel.projekt.id, kunde_id: ziel.projekt.kunde_id,
          ort: adresseZeile(ziel.projekt) || adresseZeile(kunden.find((k) => k.id === ziel.projekt.kunde_id)) || null,
          datum: w.datum, bis_datum: w.bisDatum && w.bisDatum > w.datum ? w.bisDatum : null, ganztags: false,
          ...(w.aufgezogen ? zeit : { von: "07:00", bis: "15:30" }),
          mitarbeiter: [w.mitarbeiterId], fahrzeuge: [],
        }
      : {
          titel: titelVorschlag("besichtigung", ziel.kunde.name), art: "besichtigung", projekt_id: null, kunde_id: ziel.kunde.id,
          ort: adresseZeile(ziel.kunde) || null,
          datum: w.datum, bis_datum: null, ganztags: false, ...zeit,
          mitarbeiter: [w.mitarbeiterId], fahrzeuge: [],
        };
    const wann = `${datumText(werte.datum).slice(0, 6)}${werte.bis_datum ? ` – ${datumText(werte.bis_datum).slice(0, 6)}` : ""} · ${werte.von}–${werte.bis}`;
    const gleich = werte.projekt_id ? termine.find((t) => t.projekt_id === werte.projekt_id && t.datum === werte.datum && (t.bis_datum ?? null) === werte.bis_datum
      && t.von?.slice(0, 5) === werte.von && t.bis?.slice(0, 5) === werte.bis) : undefined;
    if (gleich) {
      if (gleich.mitarbeiter.includes(w.mitarbeiterId)) { toast(`${w.wer} ist bei ${gleich.titel} schon dabei`); return; }
      const alt = gleich.mitarbeiter;
      const { error } = await supabase.from("termine").update({ mitarbeiter: [...alt, w.mitarbeiterId] }).eq("id", gleich.id);
      if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return; }
      toast.success(`${w.wer} → ${gleich.titel}`, {
        description: wann, duration: 8000,
        action: { label: "Rückgängig", onClick: () => void supabase.from("termine").update({ mitarbeiter: alt }).eq("id", gleich.id).then(() => neuLaden("termine")) },
      });
      void neuLaden("termine");
      return;
    }
    const { data, error } = await supabase.from("termine").insert(werte).select("id").single();
    if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return; }
    toast.success(werte.titel, {
      description: `${w.wer} · ${wann}`, duration: 8000,
      action: { label: "Rückgängig", onClick: () => void supabase.from("termine").delete().eq("id", data.id).then(() => neuLaden("termine")) },
    });
    void neuLaden("termine");
  };

  const dialoge = (
    <>
      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} termin={dialog?.termin} datum={dialog?.datum} bisDatum={dialog?.bisDatum}
        mitarbeiterId={dialog?.mitarbeiterId} teamId={dialog?.teamId} fahrzeugId={dialog?.fahrzeugId} projektId={dialog?.projektId} von={dialog?.von} bis={dialog?.bis} titel={dialog?.titel} />
      <AbwesenheitDialog open={!!abwDialog} onOpenChange={(o) => !o && setAbwDialog(null)} userId={abwDialog?.userId} von={abwDialog?.von} bis={abwDialog?.bis} abwesenheitId={abwDialog?.id} />
      <TeamsDialog open={teamsOffen} onOpenChange={setTeamsOffen} />
      {wahl && istChef && (
        <ZellWahl wahl={wahl} onZu={() => setWahl(null)} projekte={projekte} kunden={kunden} eingeplant={eingeplant}
          onProjekt={(p) => void schnellEinplanen(wahl, { projekt: p })}
          onKunde={(k) => void schnellEinplanen(wahl, { kunde: k })}
          onMehr={(text) => { setDialog({ datum: wahl.datum, bisDatum: wahl.bisDatum, von: wahl.von, bis: wahl.bis, mitarbeiterId: wahl.mitarbeiterId, titel: text }); setWahl(null); }}
          onAbwesenheit={() => { setAbwDialog({ userId: wahl.mitarbeiterId, von: wahl.datum, bis: wahl.bisDatum ?? wahl.datum }); setWahl(null); }}
          onAbwBearbeiten={(id) => { setAbwDialog({ id }); setWahl(null); }}
          onAbwLoeschen={(id) => void abwLoeschen(id)} />
      )}
    </>
  );

  const blaetterKnoepfe = (hoch: string) => (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className={cn(hoch, "w-auto aspect-square")} aria-label="Woche zurück" onClick={() => blaettern(-1)}><ChevronLeft className="h-5 w-5" /></Button>
      <Button variant="outline" className={hoch} onClick={() => setBezug(heute)}>Heute</Button>
      <Button variant="outline" size="icon" className={cn(hoch, "w-auto aspect-square")} aria-label="Woche weiter" onClick={() => blaettern(1)}><ChevronRight className="h-5 w-5" /></Button>
    </div>
  );

  if (!pc) {
    return (
      <Seite titel="Kalender" untertitel={titel}
        aktionen={istChef ? <Button className="h-11 gap-1.5" onClick={neuerTermin}><CalendarPlus className="h-4 w-4" /> Termin</Button> : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {blaetterKnoepfe("h-11")}
          <Segment werte={[["tag", "Tag"], ["person", "Person"], ["liste", "Woche"]]} wert={handy} onChange={(w) => setHandy(w as Handy)} />
          {handy === "liste" && <Segment werte={[["meine", "Meine"], ["alle", "Alle"]]} wert={nurMeine ? "meine" : "alle"} onChange={(w) => setNurMeine(w === "meine")} />}
          {handy === "tag" && <FilterWahl gruppen={gruppen} wert={filter} onChange={setFilter} alleText="Alle" className="h-11 min-w-0 flex-1 text-base" />}
        </div>
        {liste.length > 0 && istChef && <KonfliktListe liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}
        {handy === "liste" ? (
          <>
            <HandyListe tage={tage} heute={heute} termine={meine} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} projekte={projekte} kunden={kunden}
              abwesend={nurMeine && profil ? abwesend.filter((x) => x.user_id === profil.id) : abwesend} darf={istChef} ich={profil?.id}
              konfliktIds={konfliktIds} onTermin={(t) => setDialog({ termin: t })} onNeu={(datum) => setDialog({ datum })} />
            <Legende />
          </>
        ) : (
          <TerminplanerHandy {...planDaten} gruppen={handy === "tag" ? sichtbar : gruppen} modus={handy} tagIndex={tagIndex} onTagIndex={setTagIndex}
            person={person} onPerson={(id) => { setPerson(id); setHandy("person"); }} onBlaettern={blaettern} />
        )}
        {dialoge}
      </Seite>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="Kalender" untertitel={titel} voll
        aktionen={istChef ? (
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setTeamsOffen(true)}><Settings2 className="h-4 w-4" /> Teams</Button>
            <Button className="h-10 gap-1.5" onClick={neuerTermin}><CalendarPlus className="h-4 w-4" /> Termin</Button>
          </>
        ) : undefined} />
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        {blaetterKnoepfe("h-9")}
        <FilterWahl gruppen={gruppen} wert={filter} onChange={setFilter} className="h-9" />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground" title="Gehe zu Datum"><span className="hidden 2xl:inline">Gehe zu</span>
          <input type="date" className="h-9 rounded-md border bg-card px-2 text-base text-foreground [@media(pointer:fine)]:text-sm" onChange={(e) => e.target.value && setBezug(e.target.value)} />
        </label>
        {istChef && (
          <Button variant={projektListe ? "secondary" : "outline"} className="h-9 gap-1.5" aria-pressed={projektListe} onClick={() => setProjektListe(!projektListe)}
            title={projektListe ? "Wieder den Monatskalender zeigen" : "Projekte in Arbeit ohne Einsatz — zum Hineinziehen"}>
            <FolderKanban className="h-4 w-4" /> Nicht eingeplant
            <span className={cn("rounded-full px-1.5 text-xs font-semibold", ungeplant ? "bg-status-gelb text-status-gelb-fg" : "bg-muted text-muted-foreground")}>{ungeplant}</span>
          </Button>
        )}
        {!istChef && <span className="text-sm text-muted-foreground">Nur lesen — deine Termine sind umrandet</span>}
        <Legende className="ml-auto hidden 2xl:flex" />
        {liste.length > 0 && istChef && <KonfliktKnopf liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}
      </div>

      <Terminplaner className="flex-1" {...planDaten} gruppen={sichtbar} geraete={geraete} konfliktListe={liste}
        onGeraetLeer={(v) => setDialog({ datum: v.datum, von: v.von, bis: v.bis, fahrzeugId: v.fahrzeugId })}
        seite={istChef && projektListe ? (
          <NichtEingeplant projekte={projekte} eingeplant={eingeplant} onZu={() => setProjektListe(false)}
            onAblegen={(id, ziel) => void projektAblegen(id, ziel)}
            onAntippen={(id) => setDialog({ projektId: id, datum: tage.includes(heute) ? heute : von })} />
        ) : (
          <MiniKalender bezug={bezug} woche={tage} heute={heute} onTag={setBezug} />
        )} />
      {dialoge}
    </div>
  );
}

function Segment({ werte, wert, onChange, klein }: { werte: [string, string][]; wert: string; onChange: (w: string) => void; klein?: boolean }) {
  return (
    <div className={cn("flex overflow-hidden rounded-md border bg-card", klein ? "h-9" : "h-11")}>
      {werte.map(([w, t], i) => (
        <button key={w} type="button" onClick={() => onChange(w)} aria-pressed={wert === w}
          className={cn("px-3.5 text-sm font-medium transition-colors", i > 0 && "border-l", wert === w ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {t}
        </button>
      ))}
    </div>
  );
}

const konfliktText = (k: Konflikt, mitarbeiter: Profil[], fahrzeuge: Fahrzeug[]) => {
  const wer = k.art === "fahrzeug_doppelt" ? fahrzeuge.find((f) => f.id === k.ressource)?.name ?? "Fahrzeug" : name(mitarbeiter.find((m) => m.id === k.ressource));
  const tag = `${WOCHENTAGE[(isoZuDatum(k.tag).getDay() + 6) % 7]} ${datumText(k.tag).slice(0, 6)}`;
  return k.art === "person_abwesend" ? `${wer} ist am ${tag} abwesend, aber eingeteilt` : `${wer} ist am ${tag} doppelt eingeteilt`;
};

function KonfliktZeilen({ liste, termine, mitarbeiter, fahrzeuge, onTermin }: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {liste.map((k) => (
        <li key={`${k.art}${k.tag}${k.ressource}`} className="flex flex-wrap items-center gap-x-2">
          <span>{konfliktText(k, mitarbeiter, fahrzeuge)}:</span>
          {k.termine.map((id) => {
            const t = termine.find((x) => x.id === id);
            return t && <button key={id} type="button" className="min-h-8 font-medium text-primary underline-offset-2 hover:underline" onClick={() => onTermin(t)}>{t.titel}</button>;
          })}
        </li>
      ))}
    </ul>
  );
}

/** PC: kleiner roter Knopf in der Leiste, die Liste klappt darunter auf */
function KonfliktKnopf(p: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
        className="flex h-9 items-center gap-1.5 rounded-md border border-status-rot-fg/40 bg-status-rot px-3 text-sm font-semibold text-status-rot-fg">
        <AlertTriangle className="h-4 w-4" />{p.liste.length === 1 ? "1 Konflikt" : `${p.liste.length} Konflikte`}
      </button>
      {offen && (
        <div className="absolute right-0 top-11 z-50 max-h-96 w-[28rem] overflow-auto rounded-lg border-2 border-status-rot-fg/40 bg-card p-3 shadow-xl">
          <KonfliktZeilen {...p} onTermin={(t) => { setOffen(false); p.onTermin(t); }} />
        </div>
      )}
    </div>
  );
}

function KonfliktListe(p: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <section className="rounded-lg border border-status-rot-fg/40 bg-status-rot/30 px-3 py-1.5" role="status">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} className="flex min-h-9 w-full items-center gap-1.5 text-left text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="shrink-0 whitespace-nowrap font-semibold">{p.liste.length === 1 ? "1 Konflikt" : `${p.liste.length} Konflikte`}</span>
        {!offen && <span className="truncate text-muted-foreground">· {konfliktText(p.liste[0], p.mitarbeiter, p.fahrzeuge)}{p.liste.length > 1 ? " …" : ""}</span>}
        <span className="ml-auto shrink-0 text-xs font-medium text-primary">{offen ? "zuklappen" : "zeigen"}</span>
      </button>
      {offen && <div className="pb-1.5"><KonfliktZeilen {...p} /></div>}
    </section>
  );
}

/** Handy: je Tag die Termine, Farbstreifen nach Art bzw. Projekt; leeres Wochenende fällt weg */
function HandyListe({
  tage, heute, termine, teams, mitarbeiter, fahrzeuge, projekte, kunden, abwesend, darf, ich, konfliktIds, onTermin, onNeu,
}: {
  tage: string[];
  heute: string;
  termine: Termin[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: Projekt[];
  kunden: Kunde[];
  abwesend: { id: string | null; user_id: string | null; von: string | null; bis: string | null; art: string | null }[];
  darf: boolean;
  ich?: string;
  konfliktIds: Set<string>;
  onTermin: (t: Termin) => void;
  onNeu: (tag: string) => void;
}) {
  return (
    <div className="space-y-4">
      {tage.map((tag, i) => {
        const liste = termine.filter((t) => amTag(t, tag));
        const weg = abwesend.filter((x) => x.von && x.bis && x.von <= tag && x.bis >= tag);
        if (i >= 5 && !liste.length && tag !== heute) return null;
        return (
          <section key={tag}>
            <div className="flex items-center justify-between px-1 pb-1.5">
              <h3 className={cn("text-sm font-semibold", tag === heute && "text-primary")}>
                {tag === heute ? "Heute, " : `${WOCHENTAGE[(isoZuDatum(tag).getDay() + 6) % 7]}, `}{datumText(tag).slice(0, 6)}
                {feiertagName(tag) && <span className="font-normal text-muted-foreground"> · {feiertagName(tag)}</span>}
              </h3>
              {darf && <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-sm font-medium text-primary" onClick={() => onNeu(tag)}>+ Termin</button>}
            </div>
            {weg.map((x) => (
              <p key={`${x.id}${tag}`} className="mb-1.5 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                <Avatar profil={mitarbeiter.find((m) => m.id === x.user_id)} className="h-6 w-6 text-[10px]" />
                {name(mitarbeiter.find((m) => m.id === x.user_id))} · {ABWESENHEIT_ART[x.art as AbwesenheitArt]?.text ?? "Abwesend"}
              </p>
            ))}
            {liste.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">Nichts eingeteilt</p>
            ) : (
              <ul className="space-y-2">
                {liste.map((t) => {
                  const team = teams.find((x) => x.id === t.team_id);
                  const p = projekte.find((x) => x.id === t.projekt_id);
                  const kunde = kunden.find((k) => k.id === t.kunde_id);
                  const fz = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean);
                  const meins = !darf && !!ich && t.mitarbeiter.includes(ich);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => onTermin(t)} style={{ borderLeft: `6px solid ${terminFarbe(t.art, p).streifen}` }}
                        className={cn("w-full rounded-lg border bg-card p-3 text-left", konfliktIds.has(t.id) && "ring-2 ring-status-rot-fg", meins && "border-primary")}>
                        <span className="block font-semibold">{konfliktIds.has(t.id) ? "⚠ " : ""}{t.status === "erledigt" ? "✓ " : ""}{t.titel}</span>
                        <span className="block text-sm text-muted-foreground">
                          {zeitText(t)}{terminArt(t.art) !== "montage" ? ` · ${artText(t.art)}` : ""}{p ? ` · ${p.nummer}` : ""}{team ? ` · Team ${team.name}` : ""}
                        </span>
                        {kunde && <span className="flex items-center gap-1 text-sm text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{kunde.name}</span>}
                        {t.ort && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{t.ort}</span>}
                        {fz.length > 0 && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Truck className="h-3.5 w-3.5" />{fz.join(", ")}</span>}
                        <span className="mt-1.5 flex -space-x-1.5">
                          {t.mitarbeiter.map((id) => <Avatar key={id} profil={mitarbeiter.find((m) => m.id === id)} className="h-7 w-7 text-[10px] ring-2 ring-card" />)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
