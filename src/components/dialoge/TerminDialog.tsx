import { AdresseFeld } from "@/components/AdresseFeld";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ClipboardList, ClipboardSignature, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, StatusPille } from "@/components/Bausteine";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { KundeWahl } from "@/components/KundeWahl";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useFahrzeuge, useKunden, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";
import { adresseZeile, kundenProjekte, ortVorschlaege, TERMIN_ARTEN, terminArt, terminFarbe, terminWeiter, titelVorschlag, type TerminArt } from "@/lib/kalender";
import { EINSATZ_STATUS, FAHRZEUG_ART, PROJEKT_STATUS, TEAM_FARBEN, type FahrzeugArt, type Kunde, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TerminWerte = {
  art: TerminArt;
  kundeId: string;
  titel: string;
  datum: string;
  bisDatum: string;
  ganztags: boolean;
  von: string;
  bis: string;
  projektId: string;
  ort: string;
  beschreibung: string;
  dabei: string[];
  dringend: boolean;
  teamId: string;
  fahrzeuge: string[];
};

/** Was am Termin nicht stimmt — null, wenn er so gespeichert werden kann */
export function terminFehler(
  w: Pick<TerminWerte, "titel" | "datum" | "bisDatum" | "ganztags" | "von" | "bis"> & Partial<Pick<TerminWerte, "art" | "kundeId" | "projektId">>,
): string | null {
  if ((w.art === "besichtigung" || w.art === "service") && !w.kundeId) return "Bitte den Kunden wählen";
  if (w.art === "montage" && !w.projektId) return "Bitte ein Projekt „In Arbeit“ wählen — ohne Projekt: Art „Service“ oder „Büro“";
  if (!w.titel.trim()) return "Bitte einen Titel eingeben";
  if (!w.datum) return "Bitte ein Datum wählen";
  if (w.bisDatum && w.bisDatum < w.datum) return "„Bis“ liegt vor dem Datum";
  if (w.ganztags) return null;
  if (!w.von) return "Bitte eine Uhrzeit eintragen — oder „Ganztägig“ wählen";
  // Über mehrere Tage darf das Ende am letzten Tag früher sein als der Beginn am ersten
  const mehrtaegig = !!w.bisDatum && w.bisDatum > w.datum;
  if (w.bis && w.bis <= w.von && !mehrtaegig) return "Das Ende liegt vor dem Beginn";
  return null;
}

/**
 * Termin im Kalender: zuerst die Art, dann der Kunde (suchen oder „+ Neuer
 * Kunde“), dann
 * - Montage: nur Projekte DIESES Kunden „In Arbeit“, Ort = Projektadresse
 * - Besichtigung / Service: Adresse des Kunden, eines seiner Projekte oder frei — kein Projekt
 * - Büro: ohne Kunde
 * Danach Team, Leute, Geräte, Zeit. Aus dem Projekt geöffnet: Kunde und Projekt vorbelegt.
 * Gespeicherte Besichtigung → Knopf „Erstaufnahme“, Service → „Regiebericht“ (`terminWeiter`).
 */
export function TerminDialog({
  open, onOpenChange, termin, datum: vorDatum, bisDatum: vorBis, projektId: vorProjekt, mitarbeiterId, teamId, fahrzeugId, von: vorVon, bis: vorBisZeit, titel: vorTitel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  termin?: Termin | null;
  datum?: string;
  /** Aus der Plantafel aufgezogen: letzter Tag */
  bisDatum?: string;
  projektId?: string;
  /** Aus der Einteilung: dieser Mitarbeiter ist vorausgewählt */
  mitarbeiterId?: string;
  /** Aus der Plantafel: dieses Team / Fahrzeug ist vorausgewählt */
  teamId?: string;
  fahrzeugId?: string;
  /** Aus dem Terminplaner: Uhrzeit der angetippten Zelle */
  von?: string;
  bis?: string;
  /** Aus dem schnellen Einplanen: schon getippter Text */
  titel?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef, darf } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: kunden = [] } = useKunden();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeugListe = [] } = useFahrzeuge();
  const [w, setW] = useState<TerminWerte>(() => leer(isoTag()));
  const [basis, setBasis] = useState<TerminWerte>(w);
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const setze = (teil: Partial<TerminWerte>) => setW((x) => ({ ...x, ...teil }));

  // Nur beim Öffnen füllen: Nachladen (Projekte, Profil) setzt keine Eingabe zurück
  useBeimOeffnen(open ? termin?.id ?? `neu|${vorDatum ?? ""}|${vorBis ?? ""}|${vorProjekt ?? ""}|${mitarbeiterId ?? ""}|${teamId ?? ""}|${fahrzeugId ?? ""}|${vorVon ?? ""}|${vorTitel ?? ""}` : null, () => {
    let v: TerminWerte;
    if (termin) {
      v = {
        art: terminArt(termin.art),
        kundeId: termin.kunde_id ?? projekte.find((x) => x.id === termin.projekt_id)?.kunde_id ?? "",
        titel: termin.titel,
        datum: termin.datum,
        bisDatum: termin.bis_datum || "",
        ganztags: termin.ganztags,
        von: termin.von?.slice(0, 5) || "07:00",
        bis: termin.bis?.slice(0, 5) || "15:30",
        projektId: termin.projekt_id || "",
        ort: termin.ort || "",
        beschreibung: termin.beschreibung || "",
        dabei: termin.mitarbeiter ?? [],
        dringend: termin.dringend,
        teamId: termin.team_id ?? "",
        fahrzeuge: termin.fahrzeuge ?? [],
      };
    } else {
      const p = projekte.find((x) => x.id === vorProjekt);
      v = {
        ...leer(vorDatum || isoTag()),
        bisDatum: vorBis && vorBis > (vorDatum || "") ? vorBis : "",
        titel: p?.name ?? vorTitel?.trim() ?? "",
        projektId: p?.id ?? "",
        kundeId: p?.kunde_id ?? "",
        ort: adresseZeile(p),
        // Sich selbst vorwählen — ein verstecktes Konto (ePower) nie: es steht nirgends zur Wahl und wäre unsichtbar eingeteilt
        dabei: mitarbeiterId ? [mitarbeiterId] : profil && !profil.versteckt && !teamId && !fahrzeugId ? [profil.id] : [],
        fahrzeuge: fahrzeugId ? [fahrzeugId] : [],
        ...(vorVon ? { von: vorVon, bis: vorBisZeit && vorBisZeit > vorVon ? vorBisZeit : vorVon } : {}),
      };
      const team = teams.find((x) => x.id === teamId);
      if (team) {
        v.teamId = team.id;
        v.dabei = [...team.mitglieder];
        if (team.fahrzeug_id && !v.fahrzeuge.includes(team.fahrzeug_id)) v.fahrzeuge.push(team.fahrzeug_id);
      }
    }
    setW(v);
    setBasis(v);
    setLoeschFrage(false);
  });

  const { data: abwesend = [] } = useKalenderAbwesenheit(open ? w.datum : undefined, open ? w.bisDatum || w.datum : undefined);
  const abwesendeNamen = mitarbeiter.filter((m) => w.dabei.includes(m.id) && abwesend.some((a) => a.user_id === m.id)).map((m) => m.vorname || m.nachname);

  const teamWaehlen = (id: string) => setW((x) => {
    const alt = teams.find((t) => t.id === x.teamId);
    const neu = id === x.teamId ? undefined : teams.find((t) => t.id === id);
    let dabei = x.dabei.filter((m) => !alt?.mitglieder.includes(m));
    let fz = x.fahrzeuge.filter((f) => f !== alt?.fahrzeug_id);
    if (neu) {
      dabei = [...dabei, ...neu.mitglieder.filter((m) => !dabei.includes(m))];
      if (neu.fahrzeug_id && !fz.includes(neu.fahrzeug_id)) fz = [...fz, neu.fahrzeug_id];
    }
    return { ...x, teamId: neu?.id ?? "", dabei, fahrzeuge: fz };
  });

  const kundeVon = (id: string) => kunden.find((k) => k.id === id);
  const projektVon = (id: string) => projekte.find((p) => p.id === id);
  /** Titel nur nachführen, solange er leer ist oder noch der alte Vorschlag */
  const vorschlagVon = (x: TerminWerte) => titelVorschlag(x.art, kundeVon(x.kundeId)?.name, projektVon(x.projektId)?.name);
  const mitTitel = (alt: TerminWerte, neu: TerminWerte): TerminWerte =>
    !alt.titel.trim() || alt.titel === vorschlagVon(alt) || alt.titel === projektVon(alt.projektId)?.name ? { ...neu, titel: vorschlagVon(neu) } : neu;

  const artWaehlen = (art: TerminArt) => setW((x) => {
    const neu: TerminWerte = {
      ...x, art,
      kundeId: art === "buero" ? "" : x.kundeId,
      projektId: art === "montage" ? x.projektId : "",
    };
    // Montage: hat der Kunde genau ein Projekt in Arbeit, gleich dieses
    if (art === "montage" && !neu.projektId && neu.kundeId) {
      const liste = kundenProjekte(projekte, neu.kundeId);
      if (liste.length === 1) { neu.projektId = liste[0].id; neu.ort = adresseZeile(liste[0]) || neu.ort; }
    }
    if ((art === "besichtigung" || art === "service") && !neu.ort) neu.ort = adresseZeile(kundeVon(neu.kundeId));
    return mitTitel(x, neu);
  });

  const kundeWaehlen = (k: Kunde | null) => setW((x) => {
    const id = k?.id ?? "";
    const neu: TerminWerte = { ...x, kundeId: id };
    const altKunde = adresseZeile(kundeVon(x.kundeId));
    if (x.projektId && projektVon(x.projektId)?.kunde_id !== id) neu.projektId = "";
    if (x.art === "montage" && !neu.projektId && id) {
      const liste = kundenProjekte(projekte, id);
      if (liste.length === 1) { neu.projektId = liste[0].id; neu.ort = adresseZeile(liste[0]); }
    }
    // Ort folgt dem Kunden, solange er nicht von Hand geändert wurde
    if ((x.art === "besichtigung" || x.art === "service") && (!x.ort || x.ort === altKunde)) neu.ort = adresseZeile(k);
    return mitTitel(x, neu);
  });

  const projektWaehlen = (id: string) => setW((x) => {
    const p = projektVon(id);
    const neu: TerminWerte = { ...x, projektId: id, ort: adresseZeile(p) || x.ort, kundeId: x.kundeId || p?.kunde_id || "" };
    return mitTitel(x, neu);
  });

  const kunde = kundeVon(w.kundeId);
  const kundenListe = kundenProjekte(projekte, w.kundeId, w.projektId);
  const orte = ortVorschlaege(kunde, projekte.filter((p) => w.kundeId && p.kunde_id === w.kundeId && p.status !== "abgeschlossen"));

  // Einteilen, verschieben, löschen: nur der Chef. Wer eingeteilt ist, meldet erledigt.
  const nurLesen = !istChef;
  const navigate = useNavigate();
  // Nur für gespeicherte Termine in der gespeicherten Art (sonst passt der Kunde nicht)
  const weiter = termin && terminArt(termin.art) === w.art
    ? terminWeiter({ ...termin, kunde_id: termin.kunde_id ?? null }, istChef || (!!profil && termin.mitarbeiter.includes(profil.id)), darf("regie"))
    : null;
  const darfStatus = istChef || (!!termin && !!profil && termin.mitarbeiter.includes(profil.id));

  const speichern = async () => {
    if (nurLesen) return;
    const fehler = terminFehler(w);
    if (fehler) return toast.error(fehler);
    setSpeichert(true);
    const daten = {
      art: w.art,
      kunde_id: w.art === "buero" ? null : w.kundeId || null,
      titel: w.titel.trim(),
      datum: w.datum,
      bis_datum: w.bisDatum && w.bisDatum > w.datum ? w.bisDatum : null,
      ganztags: w.ganztags,
      von: w.ganztags ? null : w.von || null,
      bis: w.ganztags ? null : w.bis || null,
      projekt_id: w.art === "montage" ? w.projektId || null : null,
      ort: w.ort.trim() || null,
      beschreibung: w.beschreibung.trim() || null,
      mitarbeiter: w.dabei,
      dringend: w.dringend,
      team_id: w.teamId || null,
      fahrzeuge: w.fahrzeuge,
    };
    const { error } = termin
      ? await supabase.from("termine").update(daten).eq("id", termin.id)
      : await supabase.from("termine").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success("Termin gespeichert");
    await neuLaden("termine");
    onOpenChange(false);
  };

  const statusSetzen = async (status: string) => {
    if (!termin) return;
    setSpeichert(true);
    const { error } = await supabase.from("termine").update({ status }).eq("id", termin.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(EINSATZ_STATUS[status].text);
    await neuLaden("termine");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!termin) return;
    setLoeschFrage(false);
    setSpeichert(true);
    const { data: weg, error } = await supabase.from("termine").delete().eq("id", termin.id).select("id");
    setSpeichert(false);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    if (!weg?.length) return toast.error("Nicht gelöscht", { description: "Termine löscht nur der Chef." });
    toast.success("Termin gelöscht");
    await neuLaden("termine");
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={nurLesen ? "Termin" : termin ? "Termin bearbeiten" : "Neuer Termin"}
      gesperrt={speichert}
      ungespeichert={JSON.stringify(w) !== JSON.stringify(basis)}
      fuss={
        <>
          {termin && istChef && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setLoeschFrage(true)} disabled={speichert}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          )}
          {weiter && (
            <Button variant="outline" className="gap-2" disabled={speichert} data-termin-weiter={weiter.art}
              onClick={() => { onOpenChange(false); navigate(weiter.pfad); }}>
              {weiter.art === "erstaufnahme" ? <ClipboardList className="h-4 w-4" /> : <ClipboardSignature className="h-4 w-4" />} {weiter.text}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>{nurLesen ? "Schließen" : "Abbrechen"}</Button>
          {!nurLesen && (
            <Button onClick={speichern} disabled={speichert} className="min-w-32 gap-2">
              {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
            </Button>
          )}
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {termin && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2.5">
            <StatusPille eintrag={EINSATZ_STATUS[termin.status]} />
            {termin.erledigt_am && <span className="text-xs text-muted-foreground">{new Date(termin.erledigt_am).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</span>}
            <span className="flex-1" />
            {darfStatus && termin.status !== "erledigt" && <Button variant="outline" className="h-11 bg-card" disabled={speichert} onClick={() => void statusSetzen("erledigt")}>Erledigt</Button>}
            {darfStatus && termin.status !== "geplant" && <Button variant="ghost" className="h-11" disabled={speichert} onClick={() => void statusSetzen("geplant")}>Zurücksetzen</Button>}
          </div>
        )}
        {nurLesen && <p className="text-sm text-muted-foreground">Die Einteilung ändert nur der Chef.</p>}
        <fieldset disabled={nurLesen} className="min-w-0 space-y-5">
        <div className="space-y-2">
          <Label>Art</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Art des Termins">
            {TERMIN_ARTEN.map((a) => {
              const an = w.art === a.wert;
              const f = terminFarbe(a.wert);
              return (
                <button key={a.wert} type="button" role="radio" aria-checked={an} onClick={() => artWaehlen(a.wert)} title={a.hinweis}
                  className={cn("flex min-h-12 items-center gap-2 rounded-md border px-3 text-left text-sm font-medium transition-colors",
                    an ? "border-primary bg-primary-soft text-primary ring-1 ring-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                  <span className={cn("h-3.5 w-3.5 shrink-0 rounded-sm", a.wert !== "montage" && f.klasse)} style={a.wert === "montage" ? { background: f.streifen } : undefined} />
                  <span className="min-w-0">
                    <span className="block">{a.text}</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">{a.hinweis}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {w.art !== "buero" && (
          <div className="space-y-2">
            <Label>Kunde</Label>
            <KundeWahl wert={w.kundeId || null} onChange={kundeWaehlen} />
          </div>
        )}

        {w.art === "montage" && (
          <div className="space-y-2">
            <Label>Projekt</Label>
            {!w.kundeId && !w.projektId ? (
              <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Zuerst den Kunden wählen — dann stehen hier seine Projekte „In Arbeit“.</p>
            ) : kundenListe.length === 0 ? (
              <p className="rounded-md border border-status-gelb bg-status-gelb/40 px-3 py-2.5 text-sm">
                Kein Projekt „In Arbeit“ bei {kunde?.name ?? "diesem Kunden"}. Ein Projekt entsteht, wenn das Angebot angenommen ist — bis dahin Art „Besichtigung“ oder „Service“.
              </p>
            ) : (
              <div className="grid gap-2" role="radiogroup" aria-label="Projekt">
                {kundenListe.map((p) => {
                  const an = w.projektId === p.id;
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={an} onClick={() => projektWaehlen(p.id)}
                      className={cn("flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                        an ? "border-primary bg-primary-soft ring-1 ring-primary" : "bg-card hover:bg-muted")}>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: terminFarbe("montage", p).streifen }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.nummer} · {p.name}</span>
                        {adresseZeile(p) && <span className="block truncate text-xs text-muted-foreground">{adresseZeile(p)}</span>}
                      </span>
                      {p.status !== "aktiv" && <StatusPille eintrag={PROJEKT_STATUS[p.status as keyof typeof PROJEKT_STATUS]} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(w.art === "besichtigung" || w.art === "service") && orte.length > 0 && (
          <div className="space-y-2">
            <Label>Wo?</Label>
            <div className="flex flex-wrap gap-2">
              {orte.map((o) => {
                const an = w.ort === o.text;
                return (
                  <button key={o.text} type="button" aria-pressed={an} onClick={() => setze({ ort: o.text })}
                    className={cn("flex min-h-11 max-w-full flex-col items-start rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
                      an ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                    <span className="max-w-full truncate font-medium">{o.text}</span>
                    <span className="max-w-full truncate text-[11px] text-muted-foreground">{o.wo}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="t-ort">{w.art === "besichtigung" || w.art === "service" ? "Adresse (oder frei eintippen)" : "Ort"}</Label>
          <AdresseFeld id="t-ort" className="h-12" wert={w.ort} onChange={(ort) => setze({ ort })} placeholder="Adresse – Vorschläge kommen beim Tippen"
            onWaehlen={(a) => setze({ ort: `${a.strasse}, ${a.plz} ${a.ort}` })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-titel">Titel</Label>
          <Input id="t-titel" className="h-12" value={w.titel} onChange={(e) => setze({ titel: e.target.value })} placeholder="z. B. Montage, Abnahme, Baubesprechung" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="t-datum" className="text-xs">Datum</Label>
            <Input id="t-datum" type="date" className="h-12" value={w.datum} onChange={(e) => setze({ datum: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-bisdatum" className="text-xs">Bis (mehrtägig)</Label>
            <Input id="t-bisdatum" type="date" className="h-12" min={w.datum} value={w.bisDatum} onChange={(e) => setze({ bisDatum: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="t-ganztags" checked={w.ganztags} onCheckedChange={(ganztags) => setze({ ganztags })} />
          <Label htmlFor="t-ganztags">Ganztägig</Label>
        </div>
        {!w.ganztags && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="t-von" className="text-xs">Von</Label>
              <Input id="t-von" type="time" className="h-12" value={w.von} onChange={(e) => setze({ von: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-bis" className="text-xs">Bis</Label>
              <Input id="t-bis" type="time" className="h-12" value={w.bis} onChange={(e) => setze({ bis: e.target.value })} />
            </div>
          </div>
        )}

        {teams.length > 0 && (
          <div className="space-y-2">
            <Label>Team</Label>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => {
                const an = w.teamId === t.id;
                return (
                  <button key={t.id} type="button" aria-pressed={an} onClick={() => teamWaehlen(t.id)}
                    className={cn("flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                    <span className={cn("h-2.5 w-2.5 rounded-full", TEAM_FARBEN[t.farbe]?.punkt ?? "bg-slate-500")} />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Wer ist dabei?</Label>
          <div className="flex flex-wrap gap-2">
            {mitarbeiter.map((m) => {
              const an = w.dabei.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={an}
                  onClick={() => setze({ dabei: an ? w.dabei.filter((x) => x !== m.id) : [...w.dabei, m.id] })}
                  className={cn("flex h-11 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-colors",
                    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                  <Avatar profil={m} className={cn("h-7 w-7 text-[11px]", !an && "opacity-50")} />
                  {m.vorname || m.nachname}
                </button>
              );
            })}
          </div>
        </div>

        {fahrzeugListe.length > 0 && (
          <div className="space-y-2">
            <Label>Bus, Steiger, Geräte</Label>
            <div className="flex flex-wrap gap-2">
              {fahrzeugListe.map((f) => {
                const an = w.fahrzeuge.includes(f.id);
                return (
                  <button key={f.id} type="button" aria-pressed={an}
                    onClick={() => setze({ fahrzeuge: an ? w.fahrzeuge.filter((x) => x !== f.id) : [...w.fahrzeuge, f.id] })}
                    className={cn("flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                    {f.name}
                    <span className="text-xs font-normal opacity-70">{FAHRZEUG_ART[f.art as FahrzeugArt]?.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {abwesendeNamen.length > 0 && (
          <p className="rounded-md border border-status-gelb bg-status-gelb/40 px-3 py-2 text-sm" role="status">
            {abwesendeNamen.join(", ")} {abwesendeNamen.length === 1 ? "ist" : "sind"} in dieser Zeit abwesend.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Switch id="t-dringend" checked={w.dringend} onCheckedChange={(dringend) => setze({ dringend })} />
          <Label htmlFor="t-dringend">Dringend (Kundendienst, Störung)</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-beschr">Notiz</Label>
          <Textarea id="t-beschr" rows={3} value={w.beschreibung} onChange={(e) => setze({ beschreibung: e.target.value })} />
        </div>
        </fieldset>
      </div>

      <AlertDialog open={loeschFrage} onOpenChange={setLoeschFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Termin löschen?</AlertDialogTitle>
            <AlertDialogDescription>„{termin?.titel}“ verschwindet aus dem Kalender — für alle, die eingeteilt sind.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschen}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}

function leer(datum: string): TerminWerte {
  return { art: "montage", kundeId: "", titel: "", datum, bisDatum: "", ganztags: false, von: "07:00", bis: "15:30", projektId: "", ort: "", beschreibung: "", dabei: [], dringend: false, teamId: "", fahrzeuge: [] };
}
