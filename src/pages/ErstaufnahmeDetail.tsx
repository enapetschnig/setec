import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Ban, Camera, Check, ClipboardList, FilePlus2, FolderPlus, Images, Loader2, PenLine, RotateCcw, Trash2, X,
} from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusBadge, StatusPille } from "@/components/Bausteine";
import { AdresseFeld } from "@/components/AdresseFeld";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { KundeWahl } from "@/components/KundeWahl";
import { Serienaufnahme } from "@/components/Serienaufnahme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { ZeichnenDialog, type ZeichnenErgebnis } from "@/components/erstaufnahme/Zeichnen";
import {
  eaAnlegen, eaGleichProjekt, eaLoeschen, eaSpeichern, eaStatusSetzen, eaZumTermin, fotoAblegen, fotoBeschriften, fotoLoeschen,
  fotoNeuGezeichnet, useEaAngebote, useErstaufnahme, type EaFelder, type EaMitFotos,
} from "@/components/erstaufnahme/eaDaten";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { euro } from "@/lib/format";
import { eaAktionen, messwerteLesen, offeneVorschlaege, type Messwert } from "@/lib/erstaufnahme";
import { bildVerkleinern } from "@/lib/upload";
import { supabase } from "@/integrations/supabase/client";
import { ERSTAUFNAHME_STATUS, type ErstaufnahmeFoto, type ErstaufnahmeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * /erstaufnahmen/neu[?termin=<id>|?kunde=<id>] und /erstaufnahmen/:id
 * Aus dem Termin: die zugehörige öffnen oder mit Kunde und Ort anlegen.
 */
export default function ErstaufnahmeDetail() {
  const { id } = useParams();
  if (id) return <ErstaufnahmeSeite key={id} id={id} />;
  return <NeueErstaufnahme />;
}

function NeueErstaufnahme() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { data: kunden = [] } = useKunden();
  const [kundeId, setKundeId] = useState<string | null>(params.get("kunde"));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const terminId = params.get("termin");
  const gestartet = useRef(false);

  useEffect(() => {
    if (!terminId || gestartet.current) return;
    gestartet.current = true;
    (async () => {
      const { data: t, error } = await supabase.from("termine").select("id, kunde_id, ort").eq("id", terminId).maybeSingle();
      if (error || !t) throw new Error(error?.message ?? "Termin nicht gefunden.");
      const eaId = await eaZumTermin(t);
      void neuLaden("erstaufnahmen");
      navigate(`/erstaufnahmen/${eaId}`, { replace: true });
    })().catch((e) => setFehler((e as Error).message));
  }, [terminId, navigate, neuLaden]);

  const anlegen = async () => {
    setLaeuft(true);
    try {
      const k = kunden.find((x) => x.id === kundeId);
      const eaId = await eaAnlegen({ kunde_id: kundeId, strasse: k?.strasse ?? null, plz: k?.plz ?? null, ort: k?.ort ?? null, termin_id: null });
      // Liste und Kunden-Karte gleich mit — sonst 30 s alter Stand beim Zurück
      void neuLaden("erstaufnahmen");
      navigate(`/erstaufnahmen/${eaId}`, { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setLaeuft(false);
    }
  };

  if (terminId) {
    return (
      <Seite titel="Erstaufnahme" zurueckPfad="/kalender">
        {fehler ? <Leer icon={AlertTriangle} text={fehler} /> : <p className="py-10 text-center text-sm text-muted-foreground">Erstaufnahme wird geöffnet …</p>}
      </Seite>
    );
  }
  return (
    <Seite titel="Neue Erstaufnahme" zurueckPfad="/erstaufnahmen">
      <div className="max-w-xl space-y-4">
        <div className="space-y-1.5">
          <Label>Für welchen Kunden?</Label>
          <KundeWahl wert={kundeId} onChange={(k) => setKundeId(k?.id ?? null)} />
          <p className="text-xs text-muted-foreground">Die Adresse kommt vom Kunden und lässt sich danach ändern.</p>
        </div>
        <Button className="h-12 w-full gap-2 sm:w-auto" onClick={() => void anlegen()} disabled={laeuft || !kundeId}>
          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Erstaufnahme anlegen
        </Button>
      </div>
    </Seite>
  );
}

const felderAus = (d: EaMitFotos): EaFelder => ({
  kunde_id: d.ea.kunde_id,
  strasse: d.ea.strasse ?? "", plz: d.ea.plz ?? "", ort: d.ea.ort ?? "",
  kundenwunsch: d.ea.kundenwunsch ?? "", notizen: d.ea.notizen ?? "",
  messwerte: messwerteLesen(d.ea.messwerte),
});
const anhaengen = (alt: string, neu: string) => (alt.trim() ? `${alt.trimEnd()} ${neu}` : neu);

type ZeichnenAuftrag =
  | { art: "neu"; bild: Blob }
  | { art: "skizze" }
  | { art: "foto"; foto: ErstaufnahmeFoto; url: string };

function ErstaufnahmeSeite({ id }: { id: string }) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { istChef, darf: darfRecht } = useSitzung();
  // Angebote nur mit dem Recht „Angebote & Rechnungen“ (Route /belege, Regel auf belege)
  const dRech = istChef && darfRecht("rechnungen");
  const { data: kunden = [] } = useKunden();
  const { data, isLoading, error, refetch } = useErstaufnahme(id);
  const angebote = useEaAngebote(id, dRech);
  const [f, setF] = useState<EaFelder | null>(null);
  const [zustand, setZustand] = useState<"gespeichert" | "geaendert" | "speichert" | "fehler">("gespeichert");
  const [zeichnen, setZeichnen] = useState<ZeichnenAuftrag | null>(null);
  const [serie, setSerie] = useState(false);
  const [fotoOffen, setFotoOffen] = useState<ErstaufnahmeFoto | null>(null);
  const [gross, setGross] = useState<number | null>(null);
  const [frage, setFrage] = useState<"projekt" | "loeschen" | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const kameraFeld = useRef<HTMLInputElement>(null);
  const fRef = useRef<EaFelder | null>(null);
  const zeitgeber = useRef<number | null>(null);

  // Nur einmal füllen — Nachladen (Fotos, Status) setzt keine Eingabe zurück
  useEffect(() => { if (data && !f) { setF(felderAus(data)); fRef.current = felderAus(data); } }, [data, f]);

  const speichern = useCallback(async () => {
    if (zeitgeber.current) { window.clearTimeout(zeitgeber.current); zeitgeber.current = null; }
    const werte = fRef.current;
    if (!werte) return true;
    setZustand("speichert");
    try {
      await eaSpeichern(id, werte);
      // In der Zwischenzeit getippt? Dann bleibt „geändert“ (der Zeitgeber läuft wieder)
      setZustand(fRef.current === werte ? "gespeichert" : "geaendert");
      void neuLaden("erstaufnahmen");
      return true;
    } catch (e) {
      setZustand("fehler");
      toast.error((e as Error).message);
      return false;
    }
  }, [id, neuLaden]);

  const aendern = (teil: Partial<EaFelder>) => {
    setF((alt) => {
      if (!alt) return alt;
      const neu = { ...alt, ...teil };
      fRef.current = neu;
      return neu;
    });
    setZustand("geaendert");
    if (zeitgeber.current) window.clearTimeout(zeitgeber.current);
    zeitgeber.current = window.setTimeout(() => void speichern(), 1200);
  };

  // Beim Verlassen noch schreiben, was getippt ist
  const ungespeichert = useRef(false);
  ungespeichert.current = zustand === "geaendert" || zustand === "fehler";
  useEffect(() => () => { if (ungespeichert.current && fRef.current) void eaSpeichern(id, fRef.current).catch(() => {}); }, [id]);
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => { if (ungespeichert.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, []);

  if (isLoading || (data && !f)) return <Seite titel="Erstaufnahme"><p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p></Seite>;
  if (error || !data || !f) {
    return (
      <Seite titel="Erstaufnahme" zurueckPfad="/erstaufnahmen">
        <Leer icon={AlertTriangle} text={error ? `Nicht geladen: ${(error as Error).message}` : "Diese Erstaufnahme gibt es nicht (mehr)."} />
      </Seite>
    );
  }

  const { ea, fotos, urls } = data;
  const status = ea.status as ErstaufnahmeStatus;
  const darf = eaAktionen(status, istChef, !!ea.projekt_id);
  const naechsteReihe = fotos.reduce((m, x) => Math.max(m, x.reihenfolge), 0) + 1;

  const ausfuehren = async (los: () => Promise<void>) => {
    setLaeuft(true);
    try { await los(); } catch (e) { toast.error((e as Error).message); } finally { setLaeuft(false); }
  };
  const fotosNeu = async () => { await refetch(); void neuLaden("dateien"); };

  const zeichnenFertig = async (z: ZeichnenErgebnis) => {
    const auftrag = zeichnen;
    if (!auftrag) return;
    if (auftrag.art === "neu") {
      await fotoAblegen(id, z.gezeichnet ? z.bild : auftrag.bild, { original: z.gezeichnet ? auftrag.bild : null, beschriftung: z.beschriftung, reihenfolge: naechsteReihe });
      toast.success("Foto gespeichert");
    } else if (auftrag.art === "skizze") {
      await fotoAblegen(id, z.bild, { skizze: true, beschriftung: z.beschriftung, reihenfolge: naechsteReihe });
      toast.success("Skizze gespeichert");
    } else {
      if (z.gezeichnet) await fotoNeuGezeichnet(auftrag.foto, z.bild);
      if ((z.beschriftung || "") !== (auftrag.foto.beschriftung ?? "")) await fotoBeschriften(auftrag.foto.id, z.beschriftung);
      toast.success("Gespeichert");
    }
    setZeichnen(null);
    setFotoOffen(null);
    await fotosNeu();
  };

  const kameraGewaehlt = async (liste: FileList | null) => {
    const datei = liste?.[0];
    if (kameraFeld.current) kameraFeld.current.value = "";
    if (!datei) return;
    setZeichnen({ art: "neu", bild: await bildVerkleinern(datei) });
  };

  const serieFertig = async (dateien: File[]) => {
    let n = naechsteReihe;
    let fehler = 0;
    for (const d of dateien) {
      try { await fotoAblegen(id, await bildVerkleinern(d), { reihenfolge: n++ }); } catch { fehler++; }
    }
    if (fehler) toast.error(`${fehler} von ${dateien.length} Fotos nicht gespeichert.`);
    else toast.success(`${dateien.length} ${dateien.length === 1 ? "Foto" : "Fotos"} gespeichert`);
    await fotosNeu();
  };

  const angebotErstellen = () => ausfuehren(async () => {
    if (!(await speichern())) return;
    navigate(`/belege/neu?typ=angebot&erstaufnahme=${id}`);
  });
  const gleichProjekt = () => ausfuehren(async () => {
    setFrage(null);
    if (!(await speichern())) return;
    const pid = await eaGleichProjekt(id);
    void neuLaden("erstaufnahmen", "projekte", "dateien", "termine");
    toast.success("Projekt angelegt — mit Fotos und Notizen der Erstaufnahme.");
    navigate(`/projekte/${pid}`);
  });
  const statusSetzen = (s: "offen" | "kein_auftrag") => ausfuehren(async () => {
    await eaStatusSetzen(id, s);
    await refetch();
    void neuLaden("erstaufnahmen");
    toast.success(s === "kein_auftrag" ? "Als „Kein Auftrag“ abgelegt" : "Wieder offen");
  });
  const loeschen = () => ausfuehren(async () => {
    setFrage(null);
    await eaLoeschen(id, fotos);
    ungespeichert.current = false;
    fRef.current = null;
    void neuLaden("erstaufnahmen");
    toast.success("Erstaufnahme gelöscht");
    navigate("/erstaufnahmen", { replace: true });
  });

  const messwertAendern = (i: number, teil: Partial<Messwert>) =>
    aendern({ messwerte: f.messwerte.map((m, j) => (j === i ? { ...m, ...teil } : m)) });

  const zustandText = { gespeichert: "Gespeichert", geaendert: "Wird gespeichert …", speichert: "Speichert …", fehler: "Nicht gespeichert" }[zustand];

  return (
    <Seite
      titel={`Erstaufnahme ${ea.nummer}`}
      untertitel={<>{kunden.find((k) => k.id === f.kunde_id)?.name ?? "Ohne Kunde"} · <span className={cn(zustand === "fehler" && "text-destructive")} data-speicher-zustand={zustand}>{zustandText}</span></>}
      zurueckPfad="/erstaufnahmen"
      aktionen={<StatusPille eintrag={ERSTAUFNAHME_STATUS[status]} />}
    >
      {ea.projekt_id && (
        <Link to={`/projekte/${ea.projekt_id}`} className="block rounded-lg border border-status-gruen bg-status-gruen/40 px-3 py-2.5 text-sm font-medium">
          Auftrag erteilt — zum Projekt. Fotos und Notizen sind dort unter „Erstaufnahme“.
        </Link>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Links: Kunde, Wunsch, Notizen, Messwerte */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kunde</Label>
            <KundeWahl wert={f.kunde_id} onChange={(k) => aendern({
              kunde_id: k?.id ?? null,
              ...(k && !f.strasse && !f.ort ? { strasse: k.strasse ?? "", plz: k.plz ?? "", ort: k.ort ?? "" } : {}),
            })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ea-strasse">Adresse der Besichtigung</Label>
            <AdresseFeld id="ea-strasse" wert={f.strasse} onChange={(strasse) => aendern({ strasse })}
              onWaehlen={(a) => aendern({ strasse: a.strasse, plz: a.plz, ort: a.ort })} className="h-12 text-base sm:text-sm" />
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Input aria-label="PLZ" placeholder="PLZ" value={f.plz} onChange={(e) => aendern({ plz: e.target.value })} className="h-12 text-base sm:text-sm" inputMode="numeric" />
              <Input aria-label="Ort" placeholder="Ort" value={f.ort} onChange={(e) => aendern({ ort: e.target.value })} className="h-12 text-base sm:text-sm" />
            </div>
          </div>
          <TextFeld id="ea-wunsch" label="Kundenwunsch" platzhalter="z. B. PV 10 kW mit Speicher, Wallbox später" zeilen={3}
            wert={f.kundenwunsch} onChange={(kundenwunsch) => aendern({ kundenwunsch })} />
          <TextFeld id="ea-notizen" label="Notizen" platzhalter="Was besprochen wurde, Dach, Zählerplatz, Leitungsweg …" zeilen={6}
            wert={f.notizen} onChange={(notizen) => aendern({ notizen })} />

          <div className="space-y-2">
            <Label>Messwerte</Label>
            {f.messwerte.length > 0 && (
              <div className="space-y-2">
                {f.messwerte.map((m, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_auto] gap-1.5" data-messwert={i}>
                    <Input aria-label={`Messwert ${i + 1} Bezeichnung`} placeholder="Bezeichnung" value={m.bezeichnung}
                      onChange={(e) => messwertAendern(i, { bezeichnung: e.target.value })} className="h-11 text-base sm:text-sm" />
                    <Input aria-label={`Messwert ${i + 1} Wert`} placeholder="Wert" value={m.wert}
                      onChange={(e) => messwertAendern(i, { wert: e.target.value })} className="h-11 text-base sm:text-sm" />
                    <Input aria-label={`Messwert ${i + 1} Einheit`} placeholder="Einheit" value={m.einheit}
                      onChange={(e) => messwertAendern(i, { einheit: e.target.value })} className="h-11 text-base sm:text-sm" />
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Messwert ${i + 1} entfernen`}
                      onClick={() => aendern({ messwerte: f.messwerte.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {offeneVorschlaege(f.messwerte).map((v) => (
                <button key={v.bezeichnung} type="button" onClick={() => aendern({ messwerte: [...f.messwerte, { bezeichnung: v.bezeichnung, wert: "", einheit: v.einheit }] })}
                  className="h-9 rounded-full border bg-card px-3 text-sm hover:bg-muted">
                  + {v.bezeichnung}{v.einheit && <span className="text-muted-foreground"> ({v.einheit})</span>}
                </button>
              ))}
              <button type="button" onClick={() => aendern({ messwerte: [...f.messwerte, { bezeichnung: "", wert: "", einheit: "" }] })}
                className="h-9 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted">+ Eigener</button>
            </div>
          </div>
        </div>

        {/* Rechts: Fotos und Skizzen, Entscheidung */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fotos und Skizzen</Label>
              <span className="text-xs text-muted-foreground">{fotos.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" className="h-14 flex-col gap-0.5 text-xs" onClick={() => kameraFeld.current?.click()}>
                <Camera className="h-5 w-5" /> Foto
              </Button>
              <Button type="button" variant="outline" className="h-14 flex-col gap-0.5 text-xs" onClick={() => setSerie(true)}>
                <Images className="h-5 w-5" /> Mehrere
              </Button>
              <Button type="button" variant="outline" className="h-14 flex-col gap-0.5 text-xs" onClick={() => setZeichnen({ art: "skizze" })}>
                <PenLine className="h-5 w-5" /> Skizze
              </Button>
            </div>
            <input ref={kameraFeld} type="file" accept="image/*" capture="environment" className="hidden" data-ea-kamera
              onChange={(e) => void kameraGewaehlt(e.target.files)} />
            {fotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                {fotos.map((x, i) => (
                  <button key={x.id} type="button" onClick={() => setFotoOffen(x)} data-ea-foto={i}
                    className="relative aspect-square overflow-hidden rounded-md border bg-muted" aria-label={`${x.skizze ? "Skizze" : "Foto"} ${i + 1}: ${x.beschriftung ?? ""}`}>
                    {urls[x.pfad] && <img src={urls[x.pfad]} alt={x.beschriftung || ""} loading="lazy" className="h-full w-full object-cover" />}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-[11px] font-medium text-white">
                      {x.beschriftung || (x.skizze ? "Skizze" : x.original_pfad ? "Gezeichnet" : "Foto")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Fotos machen und darauf zeichnen oder beschriften — oder eine Skizze auf leerem Blatt.
              </p>
            )}
          </div>

          {istChef && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <p className="text-sm font-semibold">Wie geht es weiter?</p>
              <div className="flex flex-wrap gap-2">
                {darf.angebot && dRech && (
                  <Button className="h-11 gap-1.5" onClick={() => void angebotErstellen()} disabled={laeuft}>
                    <FilePlus2 className="h-4 w-4" /> {angebote.data?.length ? "Weiteres Angebot" : "Angebot erstellen"}
                  </Button>
                )}
                {darf.gleichProjekt && darfRecht("projekte_anlegen") && (
                  <Button variant="outline" className="h-11 gap-1.5" onClick={() => setFrage("projekt")} disabled={laeuft}>
                    <FolderPlus className="h-4 w-4" /> Gleich Projekt
                  </Button>
                )}
                {darf.keinAuftrag && (
                  <Button variant="outline" className="h-11 gap-1.5" onClick={() => void statusSetzen("kein_auftrag")} disabled={laeuft}>
                    <Ban className="h-4 w-4" /> Kein Auftrag
                  </Button>
                )}
                {darf.wiederOffen && (
                  <Button variant="outline" className="h-11 gap-1.5" onClick={() => void statusSetzen("offen")} disabled={laeuft}>
                    <RotateCcw className="h-4 w-4" /> Wieder offen
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Das Projekt entsteht erst, wenn der Kunde annimmt — dann sind Fotos, Skizzen und Notizen schon drin.
                „Gleich Projekt“ = Kleinauftrag ohne Angebot.
              </p>
              {dRech && !!angebote.data?.length && (
                <ul className="divide-y rounded-md border">
                  {angebote.data.map((b) => (
                    <li key={b.id}>
                      <Link to={`/belege/${b.id}`} className="flex min-h-12 items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono text-xs">{b.nummer ?? "Entwurf"}</span> {b.betreff}
                        </span>
                        <span className="zahl text-muted-foreground">{euro(Number(b.brutto))}</span>
                        <StatusBadge status={b.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {darf.loeschen && (
                <Button variant="ghost" className="h-10 gap-1.5 text-destructive hover:text-destructive" onClick={() => setFrage("loeschen")} disabled={laeuft}>
                  <Trash2 className="h-4 w-4" /> Erstaufnahme löschen
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Foto antippen: groß, zeichnen/beschriften, löschen */}
      <Dialog open={!!fotoOffen && !zeichnen && gross === null} onOpenChange={(o) => { if (!o) setFotoOffen(null); }}>
        <DialogContent className="max-w-lg gap-3">
          <DialogTitle>{fotoOffen?.beschriftung || (fotoOffen?.skizze ? "Skizze" : "Foto")}</DialogTitle>
          <DialogDescription className="sr-only">Foto ansehen, zeichnen, beschriften oder löschen</DialogDescription>
          {fotoOffen && urls[fotoOffen.pfad] && (
            <button type="button" onClick={() => setGross(fotos.findIndex((x) => x.id === fotoOffen.id))} className="overflow-hidden rounded-md border bg-muted">
              <img src={urls[fotoOffen.pfad]} alt="" className="max-h-[50vh] w-full object-contain" />
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 gap-1.5" onClick={() => fotoOffen && setZeichnen({ art: "foto", foto: fotoOffen, url: urls[fotoOffen.pfad] })}>
              <PenLine className="h-4 w-4" /> Zeichnen / beschriften
            </Button>
            {fotoOffen?.original_pfad && urls[fotoOffen.original_pfad] && (
              <Button asChild variant="outline" className="h-11"><a href={urls[fotoOffen.original_pfad]} target="_blank" rel="noopener">Original</a></Button>
            )}
            {status !== "auftrag" && (
              <Button variant="ghost" className="ml-auto h-11 gap-1.5 text-destructive hover:text-destructive" disabled={laeuft}
                onClick={() => fotoOffen && void ausfuehren(async () => { await fotoLoeschen(fotoOffen); setFotoOffen(null); await fotosNeu(); toast.success("Gelöscht"); })}>
                <Trash2 className="h-4 w-4" /> Löschen
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BildBetrachter
        bilder={fotos.map((x) => ({ url: urls[x.pfad] ?? "", alt: x.beschriftung || "" }))}
        index={gross}
        onIndex={setGross}
        onSchliessen={() => setGross(null)}
        fuss={gross !== null && fotos[gross] && <p className="p-3 text-sm text-white">{fotos[gross].beschriftung || (fotos[gross].skizze ? "Skizze" : "Foto")}</p>}
      />

      <ZeichnenDialog
        open={!!zeichnen}
        bild={zeichnen?.art === "neu" ? zeichnen.bild : zeichnen?.art === "foto" ? zeichnen.url : null}
        titel={zeichnen?.art === "skizze" ? "Skizze — mit Finger oder Stift" : "Auf dem Foto zeichnen oder beschriften"}
        beschriftung={zeichnen?.art === "foto" ? zeichnen.foto.beschriftung ?? "" : ""}
        onAbbrechen={() => setZeichnen(null)}
        onFertig={zeichnenFertig}
      />
      <Serienaufnahme open={serie} onOpenChange={setSerie} onFertig={serieFertig} titel="Fotos zur Erstaufnahme" />

      <AlertDialog open={frage !== null} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{frage === "projekt" ? "Gleich ein Projekt anlegen?" : "Erstaufnahme löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {frage === "projekt"
                ? "Für Kleinaufträge ohne Angebot: Das Projekt kommt sofort auf „In Arbeit“, mit Kunde, Adresse, Fotos, Skizzen und Notizen."
                : "Fotos, Skizzen und Notizen sind danach weg. Angebote dazu bleiben (ohne Verweis)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            {frage === "projekt"
              ? <Button className="h-11 gap-1.5" onClick={() => void gleichProjekt()} disabled={laeuft}><Check className="h-4 w-4" /> Projekt anlegen</Button>
              : <Button variant="destructive" className="h-11" onClick={() => void loeschen()} disabled={laeuft}>Löschen</Button>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}

function TextFeld({ id, label, platzhalter, zeilen, wert, onChange }: {
  id: string; label: string; platzhalter: string; zeilen: number; wert: string; onChange: (s: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <DiktatKnopf onText={(t) => onChange(anhaengen(wert, t))} />
      </div>
      <Textarea id={id} rows={zeilen} value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} className="text-base sm:text-sm" />
    </div>
  );
}
