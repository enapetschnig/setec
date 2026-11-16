import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban, Calculator, Check, Clock, Copy, Download, Eye, FileText, FolderInput, HandCoins, LayoutTemplate, LockOpen, Mail, Mic, MoreHorizontal, MoreVertical, PenLine,
  Percent, Plus, LayoutGrid, Receipt, RotateCcw, Rows3, Save, Sparkles, SplitSquareHorizontal, ThumbsDown, ThumbsUp, Trash2, Type, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Seite } from "@/components/PageHeader";
import { StatusBadge } from "@/components/Bausteine";
import { FormularDialog } from "@/components/FormularDialog";
import { OpKarte } from "@/components/op/OpKarte";
import { useIstPc } from "@/components/AppLayout";
import { useNeuLaden, useProjekt } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { archivieren, archivLaden } from "@/lib/belegArchiv";
import { belegPdfErstellen } from "@/lib/belegPdf";
import { datum, dezimalLesen, euro, isoTag, zahl, zahlUngueltig } from "@/lib/format";
import { pdfDateiname, pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { lohnarten as lohnartenFuer, rohertrag } from "@/lib/kalkulation";
import { runden2, stundensatzFuer } from "@/lib/preise";
import { belegStatus, TON_KLASSE, type Artikel, type Beleg, type Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArbeitszeitDialog } from "./ArbeitszeitDialog";
import { AufschlaegeDialog } from "./AufschlaegeDialog";
import { BelegKopf, BelegTexte } from "./BelegKopf";
import { belegLaden, useBelegKurz, useFolgeRechnungen, useLeistungsKatalog, useNachfolger, type BelegMitPositionen } from "./daten";
import {
  artikelPosition, fertigHinweise, freierTitelName, hinzufuegen, istNachlass, kopfAusBeleg, leerePosition, leistungPosition, leistungWeniger, mengeVon,
  nachlassRechnen, nachlassSetzen, nachlassText, ohneBetrag, ohneUstFuer, positionAusDb, positionGesamt, preisVon, quelleLesen, quellenIds, summen,
  summeVorNachlass, titelMitNamen, titelPosition, titelUebersicht, zahlText,
  type EditorPosition, type KatalogLeistung, type Kopf,
} from "./editor";
import { ImportDialog, type ImportErgebnis } from "./ImportDialog";
import { KiMaterialDialog } from "./KiMaterialDialog";
import { KatalogDialog, type KatalogWahl } from "./KatalogDialog";
import { LiveVorschau } from "./LiveVorschau";
import { LeistungDialog } from "./LeistungDialog";
import { PositionDialog } from "./PositionDialog";
import { PositionenEditor } from "./PositionenEditor";
import { ProjektVerbrauch } from "./ProjektVerbrauch";
import {
  belegKopieren, belegLoeschen, belegSpeichern, fertigstellen, inRechnungUmwandeln, teilrechnungAnlegen, abzuegeLaden, projektAktivieren, projektLoeschen,
  projektNurFuerBeleg, projektZurueckAufAngebot, rechnungAendern, StandVeraltet, statusSetzen, stornieren,
} from "./speichern";
import { sicherungLesen, sicherungLoeschen, sicherungSchreiben, sicherungsSchluessel, type Sicherung } from "./sicherung";
import { SpracheDialog, type SprachUebernahme } from "./SpracheDialog";
import { TeilrechnungDialog } from "./TeilrechnungDialog";
import { Eingabezeile } from "./Eingabezeile";
import { AngebotVersand } from "./AngebotVersand";
import { BelegMailDialog } from "./BelegMailDialog";
import { mailArt, mailVorgabe, versendbar } from "./mail";
import { vorlageEinfuegen } from "./vorlagen";
import { useVorlagen, vorlageBerechnen } from "./vorlagenDaten";
import { VorlagenDialog, type VorlageWahl } from "./VorlagenDialog";
import { VorlageSpeichernDialog } from "./VorlageSpeichernDialog";
import { useVerlassenSchutz } from "./useVerlassenSchutz";
import { VerlassenDialog } from "./VerlassenSchutz";

/** Stand des Editors als Text — ungleich dem gespeicherten Stand = ungespeichert */
const schnappschuss = (k: Kopf, p: EditorPosition[]) => JSON.stringify([k, p]);
const DETAIL = (id: string) => ["belege", "detail", id];
const NACH_AENDERUNG = ["belege", "projekte", "projekt_zahlen", "zeiten", "material", "regieberichte", "projekt_verbrauch"];
const KALK_KEY = "elektro.beleg.kalk";
const VORSCHAU_KEY = "elektro.beleg.vorschau";
/** Feld einer gerade angelegten Zeile fokussieren (nach dem nächsten Zeichnen) */
// Inhalt markiert — Tippen ersetzt „0,00“ statt anzuhängen
/** Passt die Breite auf die Abfrage? (Vorschau rechts nur auf breiten Bildschirmen) */
function useMedia(abfrage: string) {
  const [ja, setJa] = useState(() => typeof window !== "undefined" && window.matchMedia(abfrage).matches);
  useEffect(() => {
    const mql = window.matchMedia(abfrage);
    const aendern = () => setJa(mql.matches);
    mql.addEventListener("change", aendern);
    return () => mql.removeEventListener("change", aendern);
  }, [abfrage]);
  return ja;
}

const fokus = (selektor: string) => window.setTimeout(() => {
  const feld = document.querySelector<HTMLInputElement>(selektor);
  feld?.focus();
  feld?.select();
}, 50);

type Frage = "fertig" | "storno" | "entsperren" | "aendern" | null;
type Dialog = "arbeitszeit" | "leistung" | "artikel" | "sprache" | "import" | "teil" | "aufschlaege" | "ki" | "katalog" | "vorlage" | "vorlageSpeichern" | null;
type Icon = ComponentType<{ className?: string }>;

/**
 * Angebot oder Rechnung bearbeiten und abwickeln. Ein neuer Beleg entsteht
 * erst beim ersten Speichern (Angebot ohne Projekt → Projekt wird angelegt).
 * Fertige Rechnungen sind zum Lesen, Bezahlen und Stornieren da — „Rechnung
 * ändern“ macht sie wieder zum Entwurf (Nummer bleibt), solange nichts darauf
 * aufbaut (Zahlung, Mahnung, Kanzlei).
 */
export function BelegEditor({
  id, daten, startKopf, autoSprache = false, autoImport = false, autoKi = false, startVorlage, startPositionen, nachNeuAnlegen,
}: {
  id: string;
  /** null = neuer Beleg, noch nicht in der Datenbank */
  daten: BelegMitPositionen | null;
  startKopf?: Kopf;
  autoSprache?: boolean;
  autoImport?: boolean;
  /** gleich „Material per KI“ öffnen */
  autoKi?: boolean;
  /** neues Angebot aus dieser Vorlage (Preise von heute oder wie in der Vorlage) */
  startVorlage?: { id: string; nachziehen: boolean };
  /** neuer Beleg mit diesen Positionen (z. B. aus einem Kunden-Lieferschein) */
  startPositionen?: EditorPosition[];
  /** nach dem ersten Speichern (z. B. Rechnung am Lieferschein vermerken) */
  nachNeuAnlegen?: (id: string) => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const neuLaden = useNeuLaden();
  const pc = useIstPc();
  const { firma, istChef } = useSitzung();
  const heute = isoTag();

  // ── Zustand ──
  const [start] = useState(() => {
    const k = daten ? kopfAusBeleg(daten.beleg) : startKopf!;
    const p = daten ? daten.positionen.map(positionAusDb) : startPositionen ?? [];
    return { k, p, s: schnappschuss(k, daten ? p : []) };
  });
  const [neu, setNeu] = useState(!daten);
  const [beleg, setBeleg] = useState<Beleg | null>(daten?.beleg ?? null);
  const [kopf, setKopf] = useState<Kopf>(start.k);
  const [positionen, setPositionen] = useState<EditorPosition[]>(start.p);
  const [basis, setBasis] = useState(start.s);
  const dbIds = useRef(new Set(start.p.map((p) => p.id)));
  const [aktiverTitel, setAktiverTitel] = useState<string | null>(() => [...start.p].reverse().find((p) => p.art === "titel")?.id ?? null);
  const [entsperrt, setEntsperrt] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [frage, setFrage] = useState<Frage>(null);
  const [loeschen, setLoeschen] = useState<{ projektMoeglich: boolean; projektAuch: boolean } | null>(null);
  const [vorschau, setVorschau] = useState<{ url: string; blob: Blob; dateiname: string } | null>(null);
  // Mitlaufende Vorschau: am breiten PC rechts daneben (gemerkt), sonst als Vollbild
  const [seitenVorschau, setSeitenVorschauState] = useState(() => { try { return localStorage.getItem(VORSCHAU_KEY) !== "aus"; } catch { return true; } });
  const setSeitenVorschau = (an: boolean) => { setSeitenVorschauState(an); try { localStorage.setItem(VORSCHAU_KEY, an ? "an" : "aus"); } catch { /* egal */ } };
  const [vollVorschau, setVollVorschau] = useState(false);
  const [mailOffen, setMailOffen] = useState(false);
  const breitGenug = useMedia("(min-width: 1536px)");
  const schmal = !useMedia("(min-width: 640px)");
  const [dialog, setDialog] = useState<Dialog>(autoSprache ? "sprache" : autoImport ? "import" : autoKi ? "ki" : null);
  // EK und Aufschlag als Spalten am PC — gemerkt je Gerät
  const [kalkSpalten, setKalkSpalten] = useState(() => {
    try { return localStorage.getItem(KALK_KEY) !== "aus"; } catch { return true; }
  });
  const kalkUmschalten = () => setKalkSpalten((v) => {
    try { localStorage.setItem(KALK_KEY, v ? "aus" : "an"); } catch { /* privat: egal */ }
    return !v;
  });
  const [freie, setFreie] = useState<EditorPosition | null>(null);
  /** Buchungen, die beim letzten Speichern schon an einer anderen Rechnung hingen */
  const [konflikte, setKonflikte] = useState(0);

  // Nachlass in % folgt jeder Änderung der Positionen und bleibt am Ende
  useEffect(() => {
    const n = nachlassRechnen(positionen);
    if (n !== positionen) setPositionen(n);
  }, [positionen]);

  const aktuell = useMemo(() => schnappschuss(kopf, positionen), [kopf, positionen]);
  const dirty = aktuell !== basis;
  const aktuellRef = useRef(aktuell);
  aktuellRef.current = aktuell;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const status = beleg?.status ?? "entwurf";
  const anzeigeStatus = beleg ? belegStatus(beleg, heute) : "entwurf";
  const istAngebot = kopf.typ === "angebot";
  const istStorno = status === "storno";
  const typText = istAngebot ? "Angebot" : istStorno ? "Stornorechnung"
    : beleg?.teil_nr ? "Teilrechnung" : positionen.some((p) => p.art === "abzug") ? "Schlussrechnung" : "Rechnung";
  const entwurf = status === "entwurf";
  const bearbeitbar = entwurf || (istAngebot && status === "offen" && entsperrt);

  const projektAbfrage = useProjekt(kopf.projekt_id ?? undefined);
  const projekt = projektAbfrage.data;
  const stundensatz = stundensatzFuer(projekt, firma);
  const { data: katalog = [], isLoading: katalogLaedt } = useLeistungsKatalog();
  const { data: folge = [] } = useFolgeRechnungen(id, !neu && istAngebot);
  // Teilrechnungen sperren das Angebot nicht — erst die (Schluss-)Rechnung
  const teilFolge = folge.filter((f) => f.teil_nr != null && f.status !== "storniert");
  const schlussDa = folge.some((f) => f.teil_nr == null && f.status !== "storniert");
  const umwandelnText = teilFolge.length ? "Schlussrechnung erstellen" : "In Rechnung umwandeln";
  const { data: angebot } = useBelegKurz(istAngebot ? null : kopf.angebot_id);
  // Storno: die Stornorechnung zeigt auf die Rechnung, die sie aufhebt
  const stornoQuelle = useBelegKurz(beleg?.storno_von ?? null);
  const { data: nachfolger } = useNachfolger(id, !neu && status === "storniert");
  const stornoBeleg = nachfolger?.storno ?? null;
  const korrekturBeleg = nachfolger?.korrektur ?? null;
  // Per E-Mail (Edge Function beleg-mail): nur der Chef, nur fertige Belege
  const mailMoeglich = istChef && !!beleg && versendbar(beleg);
  const { data: mailDaten } = useQuery({
    queryKey: ["belege", "gesendet", id],
    enabled: mailMoeglich,
    queryFn: async () => {
      const [k, g] = await Promise.all([
        beleg?.kunde_id ? supabase.from("kunden").select("email").eq("id", beleg.kunde_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("angebot_verlauf").select("name, created_at").eq("beleg_id", id).eq("art", "gesendet").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { kundeMail: (k.data as { email: string | null } | null)?.email ?? null, zuletzt: g.data };
    },
  });
  // Korrektur: die Rechnung, die sie ersetzt
  const ersetztQuelle = useBelegKurz(beleg?.korrektur_von ?? null);

  const ohneUst = ohneUstFuer(kopf, firma);
  const s = useMemo(() => summen(positionen, kopf.ust_satz, ohneUst), [positionen, kopf.ust_satz, ohneUst]);
  const belegt = useMemo(() => quellenIds(positionen), [positionen]);
  const anzahl = positionen.filter((p) => !ohneBetrag(p) && !istNachlass(p)).length;
  const titelName = positionen.find((p) => p.id === aktiverTitel && p.art === "titel")?.bezeichnung ?? null;

  const schutz = useVerlassenSchutz(dirty);

  // ── Sicherung im Gerät — gegen Zurück-Geste, Absturz, leeren Akku ──
  const schluessel = sicherungsSchluessel(id, neu, kopf.typ);
  const [gefunden, setGefunden] = useState<{ s: Sicherung; schluessel: string } | null>(() => {
    const k = sicherungsSchluessel(id, !daten, start.k.typ);
    const s = sicherungLesen(k);
    if (!s) return null;
    // Nur für Entwürfe — schon gespeichert oder inzwischen fertig: weg damit
    if ((daten && daten.beleg.status !== "entwurf") || schnappschuss(s.kopf, s.positionen) === start.s) {
      sicherungLoeschen(k);
      return null;
    }
    return { s, schluessel: k };
  });
  useEffect(() => {
    if (gefunden || !bearbeitbar) return; // erst entscheiden: wiederherstellen oder verwerfen
    if (dirty) sicherungSchreiben(schluessel, { zeit: new Date().toISOString(), basis, kopf, positionen });
    else sicherungLoeschen(schluessel);
  }, [kopf, positionen, dirty, basis, bearbeitbar, gefunden, schluessel]);

  const wiederherstellen = () => {
    if (!gefunden) return;
    const { s } = gefunden;
    setKopf({ ...s.kopf, typ: kopf.typ });
    setPositionen(s.positionen);
    setAktiverTitel([...s.positionen].reverse().find((p) => p.art === "titel")?.id ?? null);
    setGefunden(null);
    toast.success("Wiederhergestellt — zum Behalten speichern.");
  };
  const sicherungVerwerfen = () => {
    if (gefunden) sicherungLoeschen(gefunden.schluessel);
    setGefunden(null);
  };

  // ── Gespeicherten Stand übernehmen ──
  const anwenden = useCallback((d: BelegMitPositionen) => {
    const k = kopfAusBeleg(d.beleg);
    const p = d.positionen.map(positionAusDb);
    setBeleg(d.beleg);
    setKopf(k);
    setPositionen(p);
    setBasis(schnappschuss(k, p));
    dbIds.current = new Set(p.map((x) => x.id));
    setNeu(false);
  }, []);

  // Neu geladen (Fenster wieder im Vordergrund, Aktion anderswo) — übernehmen,
  // solange hier nichts ungespeichert ist
  const letzteDaten = useRef(daten);
  useEffect(() => {
    if (!daten || daten === letzteDaten.current) return;
    letzteDaten.current = daten;
    if (!dirtyRef.current) anwenden(daten);
  }, [daten, anwenden]);

  const neuHolen = async () => {
    const d = await belegLaden(id);
    if (d) {
      letzteDaten.current = d;
      qc.setQueryData(DETAIL(id), d);
      anwenden(d);
    }
    void neuLaden(...NACH_AENDERUNG);
    return d;
  };

  // Doppelklick: `laeuft` kommt erst mit dem nächsten Render an — die Sperre sofort
  const sperre = useRef(false);
  const gesperrt = async (fn: () => Promise<void>) => {
    if (sperre.current) return;
    sperre.current = true;
    try {
      await fn();
    } finally {
      sperre.current = false;
    }
  };
  const ausfuehren = async (was: string, fn: () => Promise<void>) => {
    if (laeuft || sperre.current) return;
    sperre.current = true;
    setLaeuft(was);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      sperre.current = false;
      setLaeuft(null);
    }
  };

  /**
   * Anderswo gespeichert: den neuen Stand laden, die eigenen Änderungen als
   * Sicherung anbieten — wiederherstellen und speichern ersetzt dann bewusst.
   */
  const standVeraltet = async () => {
    const meine: Sicherung = { zeit: new Date().toISOString(), basis, kopf, positionen };
    const d = await belegLaden(id).catch(() => null);
    if (!d) {
      toast.error("Beleg nicht gefunden — wurde er inzwischen gelöscht?");
      return;
    }
    const nochOffen = d.beleg.status === "entwurf" || (d.beleg.typ === "angebot" && d.beleg.status === "offen" && entsperrt);
    if (nochOffen) {
      sicherungSchreiben(schluessel, meine);
      setGefunden({ s: meine, schluessel });
    } else {
      sicherungLoeschen(schluessel);
    }
    letzteDaten.current = d;
    qc.setQueryData(DETAIL(id), d);
    anwenden(d);
    toast.error("Inzwischen woanders gespeichert — anderes Gerät oder Fenster.", {
      description: nochOffen
        ? "Der neue Stand ist geladen. Deine Änderungen kannst du oben wiederherstellen."
        : "Der Beleg ist inzwischen fertig — deine Änderungen ließen sich nicht mehr speichern.",
      duration: 12_000,
    });
  };

  // ── Speichern ──
  const speichernIntern = async ({ leise = false, weiterleiten = true }: { leise?: boolean; weiterleiten?: boolean } = {}): Promise<boolean> => {
    if (!kopf.datum) {
      toast.error("Bitte ein Datum eintragen.");
      return false;
    }
    if (istAngebot && !kopf.projekt_id && !kopf.empf_name.trim() && !kopf.betreff.trim()) {
      toast.error("Bitte zuerst Kunde oder Betreff eintragen — daraus wird das Projekt angelegt.");
      return false;
    }
    const falsch = positionen.findIndex((p) => zahlUngueltig(p.menge) || zahlUngueltig(p.einzelpreis));
    if (falsch >= 0) {
      toast.error(`Position ${falsch + 1}: Menge oder Preis ist keine Zahl („${zahlUngueltig(positionen[falsch].menge) ? positionen[falsch].menge : positionen[falsch].einzelpreis}“) — bitte korrigieren.`);
      return false;
    }
    const vorher = aktuellRef.current;
    const warNeu = neu;
    const merk: { projekt: string | null } = { projekt: null };
    setLaeuft("speichern");
    try {
      const geloescht = [...dbIds.current].filter((x) => !positionen.some((p) => p.id === x));
      const erg = await belegSpeichern({
        id, neu: warNeu, kopf, positionen, geloescht, firma, stand: warNeu ? null : beleg?.updated_at ?? null,
        onProjektAngelegt: (pid) => { merk.projekt = pid; },
      });
      const d: BelegMitPositionen = { beleg: erg.beleg, positionen: erg.positionen };
      if (warNeu) sicherungLoeschen(sicherungsSchluessel(id, true, kopf.typ));
      if (warNeu && nachNeuAnlegen) {
        try { await nachNeuAnlegen(id); } catch (e) { toast.warning("Nicht am Lieferschein vermerkt", { description: (e as Error).message }); }
      }
      letzteDaten.current = d;
      qc.setQueryData(DETAIL(id), d);
      if (aktuellRef.current === vorher) {
        anwenden(d);
      } else {
        // Während des Speicherns weitergetippt — das bleibt ungespeichert
        setBeleg(erg.beleg);
        setNeu(false);
        dbIds.current = new Set(erg.positionen.map((p) => p.id));
        setKopf((k) => ({ ...k, projekt_id: erg.beleg.projekt_id }));
        setBasis("");
      }
      setEntsperrt(false);
      setKonflikte(erg.konflikte);
      if (erg.konflikte > 0) {
        toast.warning(
          `${erg.konflikte} ${erg.konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — bitte die übernommenen Positionen prüfen.`,
          { duration: 10_000 },
        );
      } else if (!leise) {
        toast.success(warNeu ? (merk.projekt ? `${typText} und Projekt angelegt` : `${typText} angelegt`) : "Gespeichert");
      }
      void neuLaden(...NACH_AENDERUNG);
      if (warNeu && weiterleiten) navigate(`/belege/${id}`, { replace: true });
      return true;
    } catch (e) {
      if (merk.projekt) setKopf((k) => ({ ...k, projekt_id: merk.projekt }));
      if (e instanceof StandVeraltet) await standVeraltet();
      else toast.error((e as Error).message);
      return false;
    } finally {
      setLaeuft(null);
    }
  };
  const speichern = () => { if (!laeuft) void gesperrt(async () => { await speichernIntern(); }); };

  // Strg+S (Mac: Cmd+S) speichert — statt „Seite speichern unter …“ des Browsers.
  // Nicht, solange ein Dialog offen ist: dessen Eingabe steckt noch nicht im Beleg.
  const tasteSpeichern = useRef(() => {});
  tasteSpeichern.current = () => {
    if (bearbeitbar && !laeuft && (dirty || neu) && !document.querySelector('[role="dialog"], [role="alertdialog"]')) speichern();
  };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        tasteSpeichern.current();
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  // ── Fertigstellen ──
  const [teilHinweis, setTeilHinweis] = useState<string | null>(null);
  const warnungen = fertigHinweise(kopf, positionen, s.brutto, firma, heute);

  const fertigFragen = async () => {
    if (!anzahl) { toast.error("Zuerst mindestens eine Position mit Betrag hinzufügen."); return; }
    if (!kopf.empf_name.trim()) { toast.error("Bitte zuerst den Empfänger (Kunde) eintragen."); return; }
    // Schlussrechnung: jede Teilrechnung muss fertig und abgezogen sein — sonst wird doppelt verrechnet
    setTeilHinweis(null);
    if (!istAngebot && beleg?.angebot_id && beleg.teil_nr == null) {
      const { data: teile, error } = await supabase.from("belege").select("nummer, status")
        .eq("typ", "rechnung").eq("angebot_id", beleg.angebot_id).not("teil_nr", "is", null).neq("status", "storniert");
      if (error) { toast.error(error.message); return; }
      if ((teile ?? []).some((t) => t.status === "entwurf")) {
        toast.error("Eine Teilrechnung ist noch Entwurf — erst fertigstellen und dann hier mit „Aus dem Projekt übernehmen“ abziehen.", { duration: 10_000 });
        return;
      }
      if ((teile ?? []).length && !positionen.some((p) => p.art === "abzug")) {
        setTeilHinweis(`${(teile ?? []).length === 1 ? "Eine Teilrechnung ist" : `${(teile ?? []).length} Teilrechnungen sind`} gestellt, aber nicht abgezogen — doppelt verrechnet?`);
      }
    }
    setFrage("fertig");
  };
  const fertigAusfuehren = () => gesperrt(async () => {
    setFrage(null);
    const warNeu = neu;
    if (dirty || neu) {
      const ok = await speichernIntern({ leise: true, weiterleiten: false });
      if (!ok) return;
    }
    setLaeuft("fertig");
    try {
      const nr = await fertigstellen(id);
      const d = await neuHolen();
      toast.success(`${typText} ${nr} ist fertig.`);
      if (d) void archivAnlegen(d, { ersetzt: await ersetztFuerPdf() }).catch(() => toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen."));
      if (warNeu) navigate(`/belege/${id}`, { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  });

  // ── Status ──
  const angenommen = () => ausfuehren("status", async () => {
    await statusSetzen(id, "angenommen");
    const aktiviert = await projektAktivieren(kopf.projekt_id);
    await neuHolen();
    toast.success(aktiviert ? "Angebot angenommen — das Projekt steht jetzt auf „In Arbeit“." : "Angebot angenommen");
  });
  const abgelehnt = () => ausfuehren("status", async () => {
    await statusSetzen(id, "abgelehnt");
    await neuHolen();
    toast.success("Angebot als abgelehnt markiert");
  });
  const wiederOffen = () => ausfuehren("status", async () => {
    const warAngenommen = istAngebot && status === "angenommen";
    await statusSetzen(id, "offen");
    const zurueck = warAngenommen && (await projektZurueckAufAngebot(kopf.projekt_id, id).catch(() => false));
    await neuHolen();
    if (zurueck) toast.success("Wieder offen — das Projekt steht wieder auf „Angebot“.");
  });
  const aendernAusfuehren = () => ausfuehren("aendern", async () => {
    setFrage(null);
    await rechnungAendern(id);
    await neuHolen();
    toast.success(`Rechnung ${beleg?.nummer ?? ""} ist wieder ein Entwurf — ändern, dann erneut fertigstellen und die neue Fassung schicken.`, { duration: 8000 });
  });
  const stornoAusfuehren = () => ausfuehren("storno", async () => {
    setFrage(null);
    const rechnungNr = beleg?.nummer ?? null;
    const stornoId = await stornieren(id);
    await neuHolen();
    const d = await belegLaden(stornoId).catch(() => null);
    if (d) void archivAnlegen(d, { stornoZu: rechnungNr }).catch(() => toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen."));
    toast.success(`Stornorechnung ${d?.beleg.nummer ?? ""} angelegt — schick sie dem Kunden. Stunden, Material und Regieberichte sind wieder frei.`, {
      action: { label: "Öffnen", onClick: () => navigate(`/belege/${stornoId}`) },
    });
  });

  // ── Neue Belege aus diesem ──
  const frisch = async () => {
    if (dirtyRef.current) throw new Error("Bitte zuerst speichern.");
    const d = await belegLaden(id);
    if (!d) throw new Error("Beleg nicht gefunden.");
    return d;
  };
  const umwandeln = () => ausfuehren("kopieren", async () => {
    const d = await frisch();
    const neueId = await inRechnungUmwandeln(d.beleg, d.positionen, firma, heute);
    void neuLaden(...NACH_AENDERUNG);
    if (teilFolge.some((f) => f.status === "entwurf")) {
      toast.warning("Eine Teilrechnung ist noch Entwurf und deshalb nicht abgezogen — erst fertigstellen, dann hier „Aus dem Projekt übernehmen“.", { duration: 10_000 });
    } else toast.success(`${teilFolge.length ? "Schlussrechnung" : "Rechnung"} aus dem Angebot angelegt — prüfen, Leistungszeitraum eintragen, fertigstellen.`);
    navigate(`/belege/${neueId}`);
  });
  const teilAnlegen = (betrag: number, prozent: number | null) => ausfuehren("kopieren", async () => {
    const d = await frisch();
    const neueId = await teilrechnungAnlegen(d.beleg, betrag, prozent, firma, heute);
    setDialog(null);
    void neuLaden(...NACH_AENDERUNG);
    toast.success("Teilrechnung angelegt — prüfen und fertigstellen.");
    navigate(`/belege/${neueId}`);
  });
  const kopieren = (mitHerkunft: boolean) => ausfuehren("kopieren", async () => {
    const d = await frisch();
    const { id: neueId, konflikte, schonDa } = await belegKopieren({ quelle: d.beleg, positionen: d.positionen, typ: kopf.typ, firma, heute, mitHerkunft });
    void neuLaden(...NACH_AENDERUNG);
    if (schonDa) toast.info("Die Korrektur gibt es schon — hier ist sie.");
    else if (konflikte) toast.warning(`${konflikte} ${konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — bitte prüfen.`);
    else if (mitHerkunft) toast.success("Korrektur angelegt — Stunden und Material hängen jetzt an diesem Entwurf.");
    else if (!istAngebot && d.positionen.some((p) => p.quelle)) {
      // Eine Kopie bindet keine Stunden — sonst stünden sie in zwei Rechnungen
      toast.warning("Kopie angelegt — ohne Verbindung zu Stunden und Material des Projekts. Nichts doppelt verrechnen.", { duration: 10_000 });
    } else toast.success("Kopie angelegt");
    navigate(`/belege/${neueId}`);
  });
  const korrekturOeffnen = () => (korrekturBeleg ? navigate(`/belege/${korrekturBeleg.id}`) : kopieren(true));

  // ── Löschen ──
  const verwerfen = () => {
    sicherungLoeschen(schluessel);
    setBasis(aktuellRef.current);
    if (window.history.length > 1) navigate(-1);
    else navigate(istAngebot ? "/angebote" : "/rechnungen");
  };
  const loeschenFragen = () => ausfuehren("pruefen", async () => {
    const inRechnung = istAngebot ? folge.find((f) => f.status !== "entwurf") : undefined;
    if (inRechnung) {
      toast.error(`Das Angebot steckt in Rechnung ${inRechnung.nummer ?? ""} und bleibt als Nachweis erhalten.`);
      return;
    }
    let moeglich = false;
    if (istAngebot && beleg?.projekt_id) moeglich = await projektNurFuerBeleg(beleg.projekt_id, id).catch(() => false);
    setLoeschen({ projektMoeglich: moeglich, projektAuch: moeglich });
  });
  const loeschenAusfuehren = () => ausfuehren("loeschen", async () => {
    const projektAuch = loeschen?.projektAuch && beleg?.projekt_id ? beleg.projekt_id : null;
    setLoeschen(null);
    await belegLoeschen(id);
    sicherungLoeschen(schluessel);
    if (projektAuch) await projektLoeschen(projektAuch);
    setBasis(aktuellRef.current);
    toast.success(`${entwurf ? "Entwurf" : typText} gelöscht${projektAuch ? " — das Projekt auch" : ""}`);
    navigate(istAngebot ? "/angebote" : "/rechnungen", { replace: true });
    void neuLaden(...NACH_AENDERUNG);
  });

  // ── PDF ──
  // Gleich nach dem Öffnen kann das Projekt noch laden — sonst fehlt es im PDF
  const projektFuerPdf = async () => {
    const p = kopf.projekt_id ? projekt ?? (await projektAbfrage.refetch()).data ?? null : null;
    return p ? { nummer: p.nummer, name: p.name, strasse: p.strasse, plz: p.plz, ort: p.ort } : null;
  };

  /** Stornorechnung: Nummer der Rechnung, die sie aufhebt */
  const stornoZuFuerPdf = async () => {
    if (!beleg?.storno_von) return null;
    return (stornoQuelle.data ?? (await stornoQuelle.refetch()).data)?.nummer ?? null;
  };
  /** Korrektur: Nummer der stornierten Rechnung, die sie ersetzt */
  const ersetztFuerPdf = async () => {
    if (!beleg?.korrektur_von) return null;
    return (ersetztQuelle.data ?? (await ersetztQuelle.refetch()).data)?.nummer ?? null;
  };

  /**
   * Fertige Rechnung (oder neue Stornorechnung) ablegen — aus dem Stand in der
   * Datenbank (Nummer und Fälligkeit setzt erst das Fertigstellen)
   */
  const archivAnlegen = async (d: BelegMitPositionen, verweise: { stornoZu?: string | null; ersetzt?: string | null } = {}) => {
    if (!firma || d.beleg.typ !== "rechnung" || d.beleg.status === "entwurf") return;
    const { blob } = await belegPdfErstellen({
      beleg: d.beleg,
      positionen: d.positionen.map((p) => ({
        art: p.art, bezeichnung: p.bezeichnung, langtext: p.langtext, menge: Number(p.menge), einheit: p.einheit, einzelpreis: Number(p.einzelpreis), prozent: p.prozent,
      })),
      firma,
      projekt: await projektFuerPdf(),
      abzuege: await abzuegeLaden(d.positionen.filter((p) => p.art === "abzug").flatMap((p) => quelleLesen(p.quelle)?.teil ?? [])),
      ...verweise,
    });
    if (!(await archivieren(d.beleg.id, blob))) toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen.");
  };

  /** PDF aus dem Stand im Editor (auch ungespeichert) — für „PDF“ und die Vorschau */
  const entwurfPdf = async (f: NonNullable<typeof firma>) => belegPdfErstellen({
    beleg: {
      typ: kopf.typ,
      nummer: beleg?.nummer ?? null,
      status,
      datum: kopf.datum,
      leistung_von: kopf.leistung_von || null,
      leistung_bis: kopf.leistung_bis || null,
      gueltig_bis: kopf.gueltig_bis || null,
      faellig_am: kopf.faellig_am || null,
      betreff: kopf.betreff.trim() || null,
      einleitung: kopf.einleitung.trim() || null,
      schlusstext: kopf.schlusstext.trim() || null,
      ust_satz: kopf.ust_satz,
      reverse_charge: kopf.reverse_charge,
      kv_verbindlich: kopf.kv_verbindlich,
      empf_name: kopf.empf_name.trim() || null,
      empf_zusatz: kopf.empf_zusatz.trim() || null,
      empf_strasse: kopf.empf_strasse.trim() || null,
      empf_plz: kopf.empf_plz.trim() || null,
      empf_ort: kopf.empf_ort.trim() || null,
      empf_uid: kopf.empf_uid.trim() || null,
      teil_nr: beleg?.teil_nr ?? null,
      foerderung_text: kopf.foerderung_text?.trim() || null,
      foerderung_betrag: kopf.foerderung_betrag ?? null,
    },
    positionen: positionen.map((p) => ({
      art: p.art, bezeichnung: p.bezeichnung, langtext: p.langtext, menge: mengeVon(p), einheit: p.einheit, einzelpreis: preisVon(p), prozent: p.prozent,
    })),
    firma: f,
    projekt: await projektFuerPdf(),
    stornoZu: await stornoZuFuerPdf(),
    ersetzt: await ersetztFuerPdf(),
    abzuege: await abzuegeLaden(positionen.filter((p) => p.art === "abzug").flatMap((p) => p.quelle?.teil ?? [])),
  });

  const pdf = () => ausfuehren("pdf", async () => {
    if (!firma) throw new Error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    if (!entwurf && dirty) throw new Error("Bitte zuerst speichern.");
    // Fertige Rechnung: das abgelegte Original. Fehlt es (vor dem Archiv
    // fertiggestellt, Ablegen gescheitert), jetzt erzeugen und ablegen.
    const original = !istAngebot && !!beleg?.nummer && (status === "offen" || status === "bezahlt" || status === "storno");
    const archiv = original ? await archivLaden(id) : null;
    if (archiv) {
      const datei = { blob: new Blob([archiv], { type: "application/pdf" }), dateiname: pdfDateiname(typText, beleg?.nummer, beleg?.empf_name) };
      if (pc) setVorschau({ url: URL.createObjectURL(datei.blob), ...datei });
      else await pdfTeilenOderLaden(datei.blob, datei.dateiname);
      return;
    }
    const { blob, dateiname } = await entwurfPdf(firma);
    if (original) void archivieren(id, blob);
    if (pc) setVorschau({ url: URL.createObjectURL(blob), blob, dateiname });
    else await pdfTeilenOderLaden(blob, dateiname);
  });
  /** Vor dem Mailversand einer Rechnung: das Original muss im Archiv liegen — die Function hängt nur dieses an */
  const originalSichern = async (): Promise<null> => {
    if (!firma) throw new Error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    if (dirty) throw new Error("Bitte zuerst speichern.");
    if (!(await archivLaden(id))) {
      const { blob } = await entwurfPdf(firma);
      if (!(await archivieren(id, blob))) throw new Error("Das PDF konnte nicht abgelegt werden — bitte einmal „PDF“ öffnen.");
    }
    return null;
  };
  /** Angebot: das PDF wie beim Herunterladen — aber nie aus ungespeicherten Änderungen */
  const angebotPdf = async () => {
    if (!firma) throw new Error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    if (dirty) throw new Error("Bitte zuerst speichern.");
    return entwurfPdf(firma);
  };
  const vorschauSchliessen = () => {
    if (vorschau) URL.revokeObjectURL(vorschau.url);
    setVorschau(null);
  };

  // ── Positionen hinzufügen ──
  const kopfAendern = (w: Partial<Kopf>) => setKopf((k) => ({ ...k, ...w }));
  const leistungPlus = (l: KatalogLeistung) =>
    setPositionen((alt) => hinzufuegen(alt, leistungPosition(l, firma, stundensatz), aktiverTitel).liste);
  const leistungMinus = (l: KatalogLeistung) => setPositionen((alt) => leistungWeniger(alt, aktiverTitel, l.id));
  const artikelPlus = (a: Artikel) => setPositionen((alt) => hinzufuegen(alt, artikelPosition(a, firma), aktiverTitel).liste);
  /** Titel ans Ende; ohne Namen gleich zum Eintippen in der Zeile */
  const titelAnlegen = (name: string) => {
    const t = titelPosition(name ? freierTitelName(positionen, name) : "");
    setPositionen((alt) => [...alt, t]);
    setAktiverTitel(t.id);
    if (!name) fokus(`[data-titel-id="${t.id}"]`);
  };
  // Eingabezeile: unter den aktiven Titel, wie die Knöpfe
  const schnellLeistung = (l: KatalogLeistung, menge: number) =>
    setPositionen((alt) => hinzufuegen(alt, leistungPosition(l, firma, stundensatz, menge), aktiverTitel).liste);
  const katalogUebernehmen = (wahl: KatalogWahl[]) => {
    setPositionen((alt) => wahl.reduce((liste, w) => hinzufuegen(liste, { ...artikelPosition(w.artikel, firma), menge: zahlText(w.menge) }, aktiverTitel).liste, alt));
    toast.success(`${wahl.length} Artikel übernommen`);
  };
  const schnellArtikel = (a: Artikel, menge: number) =>
    setPositionen((alt) => hinzufuegen(alt, { ...artikelPosition(a, firma), menge: zahlText(menge) }, aktiverTitel).liste);
  const schnellFrei = (text: string, menge: number) => {
    const p = leerePosition("leistung", { bezeichnung: text, menge: zahlText(menge), einheit: "Stk" });
    setPositionen((alt) => hinzufuegen(alt, p, aktiverTitel).liste);
    fokus(`[data-preis-id="${p.id}"]`);
  };
  const schnellText = () => {
    const p = leerePosition("text", { menge: "0" });
    setPositionen((alt) => hinzufuegen(alt, p, aktiverTitel).liste);
    fokus(`[data-text-id="${p.id}"]`);
  };
  const arbeitszeitHinzufuegen = (neue: EditorPosition[]) =>
    setPositionen((alt) => neue.reduce((liste, p) => hinzufuegen(liste, p, aktiverTitel).liste, alt));
  /** Freie Position aus „+ Artikel“: mit Text gleich in die Liste (Preis eintragen), ohne Text als Formular */
  const freiAusSuche = (text: string) => {
    if (!text.trim()) { setDialog(null); setFreie(leerePosition("leistung")); return; }
    const p = leerePosition("leistung", { bezeichnung: text.trim(), einheit: "Stk" });
    setPositionen((alt) => hinzufuegen(alt, p, aktiverTitel).liste);
    toast.success(`„${text.trim()}“ hinzugefügt — Preis in der Position eintragen.`);
  };
  /** Vorschlag der KI: optional unter eigenem Titel, Hinweise als Textzeile */
  const kiUebernehmen = (neue: EditorPosition[], titel: string | null, hinweise: string[]) => {
    let liste = positionen;
    let ziel = aktiverTitel;
    if (titel) {
      const t = titelPosition(titel);
      liste = [...liste, t];
      ziel = t.id;
      setAktiverTitel(t.id);
    }
    if (hinweise.length) liste = hinzufuegen(liste, leerePosition("text", { bezeichnung: "Hinweise", langtext: hinweise.map((h) => `– ${h}`).join("\n"), menge: "0" }), ziel).liste;
    liste = neue.reduce((l, p) => hinzufuegen(l, p, ziel).liste, liste);
    setPositionen(liste);
    const ohnePreis = neue.filter((p) => !preisVon(p)).length;
    toast.success(`${neue.length} ${neue.length === 1 ? "Position" : "Positionen"} übernommen${ohnePreis ? ` — ${ohnePreis} ohne Preis, bitte eintragen` : ""}`);
  };
  const freieHinzufuegen = (p: EditorPosition) => {
    setPositionen((alt) => hinzufuegen(alt, p, aktiverTitel).liste);
    setFreie(null);
  };

  /** Vorlage unter den aktiven Titel; ein leeres Angebot bekommt auch Betreff und Texte der Vorlage */
  const vorlageUebernehmen = ({ vorlage, positionen: neue, abweichungen, nachgezogen }: VorlageWahl) => {
    const leer = !positionen.length;
    const { liste, letzterTitel } = vorlageEinfuegen(positionen, neue, aktiverTitel);
    setPositionen(liste);
    if (letzterTitel) setAktiverTitel(letzterTitel);
    setKopf((k) => ({
      ...k,
      betreff: k.betreff.trim() ? k.betreff : (vorlage.betreff ?? vorlage.name),
      ...(leer && vorlage.einleitung ? { einleitung: vorlage.einleitung } : {}),
      ...(leer && vorlage.schlusstext ? { schlusstext: vorlage.schlusstext } : {}),
    }));
    const n = neue.filter((p) => !ohneBetrag(p)).length;
    toast.success(`Vorlage „${vorlage.name}“: ${n} ${n === 1 ? "Position" : "Positionen"} übernommen`, {
      description: abweichungen.length
        ? `${abweichungen.length} ${abweichungen.length === 1 ? "Preis" : "Preise"} ${nachgezogen ? "auf heute aktualisiert" : "wie in der Vorlage (weicht von heute ab)"}.`
        : undefined,
      duration: abweichungen.length ? 8000 : 4000,
    });
  };
  // /belege/neu?…&vorlage=<id>: einmal einfügen, sobald Vorlagen und Katalog da sind
  const { data: startVorlagen } = useVorlagen(!!startVorlage);
  const vorlageGestartet = useRef(false);
  useEffect(() => {
    if (!startVorlage || vorlageGestartet.current || !startVorlagen || katalogLaedt) return;
    vorlageGestartet.current = true;
    const v = startVorlagen.find((x) => x.id === startVorlage.id);
    if (!v) { toast.error("Diese Vorlage gibt es nicht mehr."); return; }
    vorlageBerechnen(v, katalog, firma, stundensatz)
      .then((r) => vorlageUebernehmen({ vorlage: v, positionen: (startVorlage.nachziehen ? r.heute : r.wieVorlage).positionen, abweichungen: r.heute.abweichungen, nachgezogen: startVorlage.nachziehen }))
      .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startVorlage, startVorlagen, katalogLaedt]);

  const spracheUebernehmen = (posten: SprachUebernahme[]) => {
    let liste = positionen;
    let zuletzt = aktiverTitel;
    let ohnePreis = 0;
    posten.forEach((p) => {
      let ziel = aktiverTitel;
      if (p.raum) {
        const t = titelMitNamen(liste, p.raum);
        if (t) ziel = t.id;
        else {
          const neuerTitel = titelPosition(p.raum);
          liste = [...liste, neuerTitel];
          ziel = neuerTitel.id;
        }
        zuletzt = ziel;
      }
      const pos = p.leistung
        ? leistungPosition(p.leistung, firma, stundensatz, p.menge)
        : leerePosition("leistung", { bezeichnung: p.text, menge: zahlText(p.menge), einheit: p.einheit || "Stk" });
      if (!p.leistung) ohnePreis += 1;
      liste = hinzufuegen(liste, pos, ziel).liste;
    });
    setPositionen(liste);
    setAktiverTitel(zuletzt);
    toast.success(
      `${posten.length} ${posten.length === 1 ? "Position" : "Positionen"} übernommen${ohnePreis ? ` — ${ohnePreis} ohne Preis, bitte eintragen` : ""}`,
    );
  };

  const importUebernehmen = (e: ImportErgebnis) => {
    setPositionen((alt) => [...alt, ...e.positionen]);
    setKopf((k) => ({
      ...k,
      leistung_von: k.leistung_von || e.von || "",
      leistung_bis: k.leistung_bis || e.bis || "",
      angebot_id: k.angebot_id ?? e.angebotId,
    }));
    const letzterTitel = [...e.positionen].reverse().find((p) => p.art === "titel");
    if (letzterTitel) setAktiverTitel(letzterTitel.id);
    const n = e.positionen.filter((p) => !ohneBetrag(p)).length;
    toast.success(n
      ? `${n} ${n === 1 ? "Position" : "Positionen"} übernommen — Speichern markiert Stunden und Material als verrechnet.`
      : "Als abgegolten übernommen — Speichern markiert Stunden und Material als verrechnet.");
  };

  // ── Kopfzeile ──
  // Mit Nummer steht die Nummer oben (kurz genug fürs Handy), die Art darunter
  const titel = neu ? (istAngebot ? "Neues Angebot" : "Neue Rechnung") : beleg?.nummer ?? `${typText} – Entwurf`;
  const untertitel = (
    <span className="flex min-w-0 items-center gap-1.5">
      {!neu && <StatusBadge status={anzeigeStatus} className="px-1.5 py-0 text-[11px]" />}
      <span className="truncate">
        {[beleg?.nummer ? typText : null, kopf.empf_name || projekt?.name || (istAngebot ? "Kunde wählen, Leistungen antippen" : "Kunde und Projekt wählen")]
          .filter(Boolean).join(" · ")}
      </span>
    </span>
  );

  const menue = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Weitere Aktionen" disabled={!!laeuft}>
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {!pc && schmal && <MenuePunkt icon={Eye} onClick={() => setVollVorschau(true)}>Vorschau (so sieht es der Kunde)</MenuePunkt>}
        {entwurf && !pc && (
          <MenuePunkt icon={Check} onClick={() => void fertigFragen()}>Fertigstellen</MenuePunkt>
        )}
        {istAngebot && status === "offen" && !entsperrt && (
          <MenuePunkt icon={LockOpen} onClick={() => setFrage("entsperren")}>Angebot ändern</MenuePunkt>
        )}
        {istAngebot && (status === "offen" || status === "angenommen") && !schlussDa && (
          <>
            <MenuePunkt icon={SplitSquareHorizontal} onClick={() => setDialog("teil")}>Teilrechnung / Anzahlung</MenuePunkt>
            <MenuePunkt icon={Receipt} onClick={umwandeln}>{umwandelnText}</MenuePunkt>
          </>
        )}
        {istAngebot && (status === "angenommen" || status === "abgelehnt") && (
          <MenuePunkt icon={Undo2} onClick={wiederOffen}>Wieder auf „offen“</MenuePunkt>
        )}
        {!istAngebot && status === "storniert" && (
          <MenuePunkt icon={RotateCcw} onClick={korrekturOeffnen}>{korrekturBeleg ? "Korrektur öffnen" : "Korrektur anlegen"}</MenuePunkt>
        )}
        {!neu && !istStorno && <MenuePunkt icon={Copy} onClick={() => kopieren(false)}>Kopieren (neuer Entwurf)</MenuePunkt>}
        {istAngebot && anzahl > 0 && <MenuePunkt icon={LayoutTemplate} onClick={() => setDialog("vorlageSpeichern")}>Als Vorlage speichern</MenuePunkt>}
        <MenuePunkt icon={Download} onClick={pdf}>{pc ? "PDF ansehen" : "PDF teilen / laden"}</MenuePunkt>
        {mailMoeglich && <MenuePunkt icon={Mail} onClick={() => setMailOffen(true)}>Per E-Mail senden</MenuePunkt>}
        {!istAngebot && status === "offen" && (
          <MenuePunkt icon={LockOpen} onClick={() => setFrage("aendern")}>Rechnung ändern</MenuePunkt>
        )}
        {!istAngebot && (status === "offen" || status === "bezahlt") && (
          <>
            <DropdownMenuSeparator />
            <MenuePunkt icon={Ban} onClick={() => setFrage("storno")} gefahr>Stornieren</MenuePunkt>
          </>
        )}
        {((entwurf && !beleg?.nummer) || istAngebot) && (
          <>
            <DropdownMenuSeparator />
            <MenuePunkt icon={Trash2} onClick={neu ? verwerfen : loeschenFragen} gefahr>{neu ? "Verwerfen" : entwurf ? "Entwurf löschen" : "Angebot löschen"}</MenuePunkt>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const vorschauKnopf = (
    <Button variant={(breitGenug && seitenVorschau) || vollVorschau ? "secondary" : "outline"} className={pc ? "h-10" : "h-11 w-11 px-0"}
      aria-pressed={breitGenug ? seitenVorschau : vollVorschau} aria-label="Vorschau" title="So sieht das PDF für den Kunden aus — läuft beim Schreiben mit"
      onClick={() => (pc && breitGenug ? setSeitenVorschau(!seitenVorschau) : setVollVorschau(true))}>
      <Eye className={pc ? "h-4 w-4" : "h-5 w-5"} />{pc && " Vorschau"}
    </Button>
  );

  const aktionen = pc ? (
    <>
      {vorschauKnopf}
      <Button variant="outline" className="h-10" onClick={pdf} disabled={!!laeuft}>
        <FileText className="h-4 w-4" /> {laeuft === "pdf" ? "PDF …" : "PDF"}
      </Button>
      {bearbeitbar && (
        <Button variant={entwurf ? "outline" : "default"} className="h-10" onClick={speichern} disabled={!!laeuft || (!dirty && !neu)}>
          <Save className="h-4 w-4" /> {laeuft === "speichern" ? "Speichert …" : dirty || neu ? "Speichern" : "Gespeichert"}
        </Button>
      )}
      {entwurf && (
        <Button className="h-10" onClick={() => void fertigFragen()} disabled={!!laeuft}>
          <Check className="h-4 w-4" /> Fertigstellen
        </Button>
      )}
      {menue}
    </>
  ) : (
    <>
      {/* schmales Handy: die Vorschau steht im Menü — sonst bleibt für Nummer und Kunde im Kopf kaum Platz */}
      {!schmal && vorschauKnopf}
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={pdf} disabled={!!laeuft} aria-label="PDF">
        <FileText className="h-5 w-5" />
      </Button>
      {menue}
    </>
  );

  // ── Status-Karte (fertige Belege) ──
  const ueberfaelligTage = anzeigeStatus === "ueberfaellig" && beleg?.faellig_am
    ? Math.round((Date.parse(heute) - Date.parse(beleg.faellig_am)) / 86_400_000)
    : 0;
  const statusText = (() => {
    if (!beleg) return "";
    if (istAngebot) {
      if (status === "offen") {
        const abgelaufen = beleg.gueltig_bis && beleg.gueltig_bis < heute;
        return `Wartet auf Antwort${beleg.gueltig_bis ? ` · gültig bis ${datum(beleg.gueltig_bis)}${abgelaufen ? " (abgelaufen)" : ""}` : ""}`;
      }
      if (status === "angenommen") {
        if (schlussDa) return "";
        if (teilFolge.length) return `${teilFolge.length} ${teilFolge.length === 1 ? "Teilrechnung" : "Teilrechnungen"} gestellt — am Ende die Schlussrechnung, sie zieht sie ab.`;
        return "Jetzt in eine Rechnung umwandeln, eine Teilrechnung stellen — oder später „Rechnung aus dem Projekt“.";
      }
      if (status === "abgelehnt") return "Bleibt zur Ansicht erhalten. Für ein neues Angebot: Menü → Kopieren.";
      return "";
    }
    if (anzeigeStatus === "ueberfaellig") return `Seit ${ueberfaelligTage} ${ueberfaelligTage === 1 ? "Tag" : "Tagen"} überfällig (fällig am ${datum(beleg.faellig_am)})`;
    if (status === "offen") return beleg.faellig_am ? `Fällig am ${datum(beleg.faellig_am)}` : "Offen";
    if (status === "bezahlt") return beleg.bezahlt_am ? `Bezahlt am ${datum(beleg.bezahlt_am)}` : "Bezahlt";
    if (status === "storniert") {
      return korrekturBeleg
        ? "Storniert — die Korrektur ersetzt sie."
        : "Storniert — Stunden, Material und Regieberichte sind wieder frei. Für die neue Rechnung „Korrektur anlegen“.";
    }
    if (istStorno) return "Hebt die Rechnung in voller Höhe auf — schick sie dem Kunden.";
    return "";
  })();

  const statusKnoepfe: { text: string; icon: Icon; onClick: () => void; primaer?: boolean }[] = !beleg || entwurf ? [] : istAngebot
    ? status === "offen"
      ? [
        { text: "PDF", icon: FileText, onClick: pdf, primaer: true },
        { text: "Angenommen", icon: ThumbsUp, onClick: angenommen },
        { text: "Abgelehnt", icon: ThumbsDown, onClick: abgelehnt },
      ]
      : status === "angenommen"
        ? [
          ...(schlussDa ? [] : [
            { text: umwandelnText, icon: Receipt, onClick: umwandeln, primaer: true },
            { text: "Teilrechnung", icon: SplitSquareHorizontal, onClick: () => setDialog("teil") },
          ]),
          { text: "PDF", icon: FileText, onClick: pdf },
        ]
        : [{ text: "PDF", icon: FileText, onClick: pdf }, { text: "Wieder offen", icon: Undo2, onClick: wiederOffen }]
    : status === "offen"
      ? [{ text: pc ? "PDF" : "PDF teilen", icon: FileText, onClick: pdf, primaer: true }, { text: "Ändern", icon: LockOpen, onClick: () => setFrage("aendern") }]
      : status === "storniert"
        ? [
          { text: korrekturBeleg ? "Korrektur öffnen" : "Korrektur anlegen", icon: RotateCcw, onClick: korrekturOeffnen, primaer: true },
          ...(stornoBeleg ? [{ text: "Stornorechnung", icon: Receipt, onClick: () => navigate(`/belege/${stornoBeleg.id}`) }] : []),
          { text: "PDF", icon: FileText, onClick: pdf },
        ]
        : istStorno
          ? [{ text: pc ? "PDF" : "PDF teilen", icon: FileText, onClick: pdf, primaer: true }]
          : [{ text: "PDF", icon: FileText, onClick: pdf }];
  // „Per E-Mail“ gleich neben dem PDF — beim offenen Beleg die Hauptaktion
  if (mailMoeglich && !entsperrt) {
    const haupt = status === "offen" || istStorno;
    const pdfStelle = statusKnoepfe.findIndex((k) => k.onClick === pdf);
    const knopf = { text: "Per E-Mail", icon: Mail, onClick: () => setMailOffen(true), primaer: haupt };
    if (haupt) statusKnoepfe.forEach((k) => { if (k.onClick === pdf) k.primaer = false; });
    if (haupt) statusKnoepfe.unshift(knopf);
    else statusKnoepfe.splice(pdfStelle < 0 ? statusKnoepfe.length : pdfStelle + 1, 0, knopf);
  }
  const nebenAnzahl = statusKnoepfe.filter((k) => !k.primaer).length;

  const statusKarte = beleg && !entwurf && (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge status={anzeigeStatus} />
        <p className="min-w-0 text-sm text-muted-foreground">{statusText}</p>
      </div>
      {!istAngebot && mailDaten?.zuletzt && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>Per E-Mail an {mailDaten.zuletzt.name} am {new Date(mailDaten.zuletzt.created_at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </p>
      )}
      {folge.length > 0 && (
        <p className="mt-2 text-sm">
          In Rechnung übernommen:{" "}
          {folge.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ", "}
              {f.teil_nr != null && `${f.teil_nr}. Teilrechnung `}
              <Link to={`/belege/${f.id}`} className="font-medium text-primary hover:underline">{f.nummer ?? "Entwurf"}</Link>
              {f.status === "storniert" && " (storniert)"}
            </span>
          ))}
        </p>
      )}
      {stornoBeleg && (
        <p className="mt-2 text-sm">
          Aufgehoben durch{" "}
          <Link to={`/belege/${stornoBeleg.id}`} className="font-medium text-primary hover:underline">Stornorechnung {stornoBeleg.nummer}</Link>
        </p>
      )}
      {korrekturBeleg && (
        <p className="mt-2 text-sm">
          Ersetzt durch{" "}
          <Link to={`/belege/${korrekturBeleg.id}`} className="font-medium text-primary hover:underline">
            {korrekturBeleg.nummer ? `Rechnung ${korrekturBeleg.nummer}` : "den Korrektur-Entwurf"}
          </Link>
        </p>
      )}
      {istStorno && stornoQuelle.data && (
        <p className="mt-2 text-sm">
          Storno zu{" "}
          <Link to={`/belege/${stornoQuelle.data.id}`} className="font-medium text-primary hover:underline">Rechnung {stornoQuelle.data.nummer}</Link>
        </p>
      )}
      {entsperrt && (
        <p className={cn("mt-3 rounded-md px-3 py-2 text-sm", TON_KLASSE.gelb)}>
          Du änderst ein fertiges Angebot — die Nummer {beleg.nummer} bleibt. Wurde es schon verschickt, besser „Kopieren“ und neu schicken.
        </p>
      )}
      {statusKnoepfe.length > 0 && !entsperrt && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {statusKnoepfe.map((k, i) => (
            <Button
              key={k.text}
              variant={k.primaer ? "default" : "outline"}
              className={cn("h-11", (k.primaer || (nebenAnzahl % 2 === 1 && i === statusKnoepfe.length - 1)) && "col-span-2")}
              onClick={k.onClick}
              disabled={!!laeuft}
            >
              <k.icon className="h-4 w-4" /> {k.text}
            </Button>
          ))}
        </div>
      )}
    </section>
  );

  // ── Hinzufügen: „+ Artikel“, „+ Arbeitszeit“, „Diktieren“ — alles Seltene unter „Mehr“ ──
  const hauptKnoepfe: { key: string; text: string; icon: Icon; onClick: () => void }[] = [
    { key: "artikel", text: "Artikel", icon: Plus, onClick: () => setDialog("leistung") },
    { key: "arbeitszeit", text: "Arbeitszeit", icon: Clock, onClick: () => setDialog("arbeitszeit") },
    { key: "sprache", text: "Diktieren", icon: Mic, onClick: () => setDialog("sprache") },
  ];
  const ausProjekt = !istAngebot && !!kopf.projekt_id;
  const mehrMenue = (trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <MenuePunkt icon={Rows3} onClick={() => titelAnlegen("")}>Raum / Titel</MenuePunkt>
        <MenuePunkt icon={PenLine} onClick={() => setFreie(leerePosition("leistung"))}>Freie Position</MenuePunkt>
        <MenuePunkt icon={Type} onClick={() => (pc ? schnellText() : setFreie(leerePosition("text", { menge: "0" })))}>Hinweistext</MenuePunkt>
        <DropdownMenuSeparator />
        {!istAngebot && (
          <DropdownMenuItem className="h-11 gap-2" disabled={!kopf.projekt_id} onClick={() => setDialog("import")}>
            <FolderInput className="h-4 w-4" /> {kopf.projekt_id ? "Aus dem Projekt übernehmen" : "Aus dem Projekt (erst Projekt wählen)"}
          </DropdownMenuItem>
        )}
        {istAngebot && <MenuePunkt icon={LayoutTemplate} onClick={() => setDialog("vorlage")}>Aus Vorlage</MenuePunkt>}
        <MenuePunkt icon={LayoutGrid} onClick={() => setDialog("katalog")}>Artikel nach Kategorie</MenuePunkt>
        <MenuePunkt icon={Sparkles} onClick={() => setDialog("ki")}>Material per KI</MenuePunkt>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const hinzufuegenLeiste = bearbeitbar && !pc && (
    <div className="space-y-2">
      {ausProjekt && (
        <Button className="h-12 w-full text-base" onClick={() => setDialog("import")}>
          <FolderInput className="h-5 w-5" /> Aus dem Projekt übernehmen
        </Button>
      )}
      <div className="grid grid-cols-4 gap-2">
        {hauptKnoepfe.map((k, i) => (
          <button
            key={k.key}
            type="button"
            onClick={k.onClick}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-center text-xs font-medium leading-tight transition-colors active:scale-[0.98]",
              i === 0 && !ausProjekt ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
            )}
          >
            <k.icon className={cn("h-5 w-5", i === 0 && !ausProjekt ? "" : "text-primary")} />
            {i < 2 ? `+ ${k.text}` : k.text}
          </button>
        ))}
        {mehrMenue(
          <button type="button" className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-card px-1 text-xs font-medium hover:border-primary/50">
            <MoreHorizontal className="h-5 w-5 text-primary" /> Mehr
          </button>,
        )}
      </div>
      {titelName && <p className="px-1 text-xs text-muted-foreground">Neue Positionen landen unter „{titelName}“ — anderen Raum oben antippen.</p>}
    </div>
  );

  // ── Kalkulation (nur intern) ──
  const kalk = useMemo(() => {
    let minuten = 0;
    let ek = 0;
    positionen.forEach((p) => {
      if (ohneBetrag(p)) return;
      const m = mengeVon(p);
      if (p.minuten != null) minuten += Number(p.minuten) * m;
      else if (p.art === "arbeit" && p.einheit === "h") minuten += m * 60;
      if (p.ek_preis != null) ek += Number(p.ek_preis) * m;
    });
    return { stunden: minuten / 60, ek };
  }, [positionen]);

  const uebersicht = useMemo(
    () => titelUebersicht(positionen.filter((p) => p.art !== "abzug" && !istNachlass(p)).map((p) => ({ art: p.art, bezeichnung: p.bezeichnung, gesamt: positionGesamt(p) }))),
    [positionen],
  );

  const mitSeite = pc && breitGenug && seitenVorschau;
  const vorschauStand = JSON.stringify([kopf, positionen, firma?.id, beleg?.nummer, status]);
  const vorschauErzeugen = async () => (firma ? (await entwurfPdf(firma)).blob : null);

  return (
    <Seite titel={titel} untertitel={untertitel} aktionen={aktionen} breit={pc} className={mitSeite ? "max-w-none" : undefined}>
      <div className={cn(mitSeite && "grid grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] items-start gap-6")}>
      <div className="min-w-0 space-y-5">
      {statusKarte}
      {entwurf && !istAngebot && beleg?.nummer && (
        <p className={cn("rounded-lg px-4 py-3 text-sm font-medium", TON_KLASSE.gelb)}>
          Rechnung {beleg.nummer} wird geändert — danach „Fertigstellen“ und die neue Fassung an den Kunden schicken.
        </p>
      )}
      {istAngebot && beleg && !entwurf && firma && (
        <AngebotVersand beleg={beleg} positionen={positionen} katalog={katalog} pdfErzeugen={angebotPdf}
          mailOffen={mailOffen && mailMoeglich} onMailOffen={setMailOffen} />
      )}
      {!istAngebot && beleg && mailMoeglich && mailOffen && (
        <BelegMailDialog
          open={mailOffen}
          onOpenChange={setMailOffen}
          belegId={beleg.id}
          art={mailArt(beleg)}
          vorgabe={mailVorgabe({
            art: mailArt(beleg), nummer: beleg.nummer, betreff: beleg.betreff, an: beleg.empf_email ?? mailDaten?.kundeMail,
            firma: firma?.name, telefon: firma?.telefon, datum: datum(beleg.datum), betrag: euro(Number(beleg.brutto)),
            faellig: beleg.faellig_am ? datum(beleg.faellig_am) : null, bezahlt: status === "bezahlt", stornoZu: stornoQuelle.data?.nummer ?? null,
          })}
          anhangName={pdfDateiname(typText, beleg.nummer, beleg.empf_name)}
          vorbereiten={originalSichern}
        />
      )}
      {beleg && !istAngebot && !entwurf && !istStorno && <OpKarte rechnung={beleg} onGeaendert={() => void neuHolen()} />}

      {gefunden && bearbeitbar && (
        <section className={cn("rounded-lg border p-4", TON_KLASSE.gelb)}>
          <p className="font-semibold">Nicht gespeicherte Änderungen gefunden</p>
          <p className="mt-1 text-sm">
            {[
              `vom ${new Date(gefunden.s.zeit).toLocaleDateString("de-AT")} um ${new Date(gefunden.s.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`,
              gefunden.s.kopf.empf_name || gefunden.s.kopf.betreff || "ohne Empfänger",
              ((n) => `${n} ${n === 1 ? "Position" : "Positionen"}`)(gefunden.s.positionen.filter((p) => !ohneBetrag(p)).length),
            ].join(" · ")}
          </p>
          {!neu && gefunden.s.basis !== basis && (
            <p className="mt-1 text-xs">Der Beleg wurde seitdem anderswo gespeichert — Wiederherstellen ersetzt das beim nächsten Speichern.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-11" onClick={wiederherstellen}><RotateCcw className="h-4 w-4" /> Wiederherstellen</Button>
            <Button variant="outline" className="h-11 bg-card" onClick={sicherungVerwerfen}>Verwerfen</Button>
          </div>
        </section>
      )}

      <BelegKopf kopf={kopf} aendern={kopfAendern} bearbeitbar={bearbeitbar} firma={firma} pc={pc} startOffen={neu && !kopf.empf_name} />
      {(angebot || ersetztQuelle.data) && (
        <p className="-mt-2 px-1 text-sm text-muted-foreground">
          {angebot && <>Aus <Link to={`/belege/${angebot.id}`} className="font-medium text-primary hover:underline">Angebot {angebot.nummer ?? "(Entwurf)"}</Link></>}
          {angebot && ersetztQuelle.data && " · "}
          {ersetztQuelle.data && (
            <>Ersetzt <Link to={`/belege/${ersetztQuelle.data.id}`} className="font-medium text-primary hover:underline">Rechnung {ersetztQuelle.data.nummer}</Link></>
          )}
        </p>
      )}

      {!istAngebot && !istStorno && kopf.projekt_id && (
        <ProjektVerbrauch
          projektId={kopf.projekt_id}
          belegId={neu ? null : id}
          positionen={positionen.map((p) => ({ art: p.art, menge: mengeVon(p), einheit: p.einheit, minuten: p.minuten }))}
          onUebernehmen={bearbeitbar ? () => setDialog("import") : undefined}
        />
      )}

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-[0.9375rem] font-semibold">
            Positionen
            {anzahl > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{anzahl}</span>}
          </h2>
          {pc && (
            <div className="flex flex-wrap items-center gap-1.5">
              {bearbeitbar && ausProjekt && (
                <Button className="h-9 gap-1.5 px-3" onClick={() => setDialog("import")}><FolderInput className="h-4 w-4" /> Aus dem Projekt</Button>
              )}
              {bearbeitbar && hauptKnoepfe.map((k, i) => (
                <Button key={k.key} variant={i === 0 && !ausProjekt ? "default" : "outline"} className="h-9 gap-1.5 px-3" onClick={k.onClick}>
                  <k.icon className="h-4 w-4" /> {i < 2 ? `${k.text}` : k.text}
                </Button>
              ))}
              {bearbeitbar && mehrMenue(<Button variant="outline" className="h-9 gap-1.5 px-3"><MoreHorizontal className="h-4 w-4" /> Mehr</Button>)}
              <Button variant="ghost" className="hidden h-9 gap-1.5 px-3 text-muted-foreground xl:inline-flex" onClick={kalkUmschalten} aria-pressed={kalkSpalten}
                title="Einkaufspreis und Aufschlag je Position — nur intern, nie auf dem PDF">
                <Calculator className="h-4 w-4" /> {kalkSpalten ? "EK/Aufschlag ausblenden" : "EK/Aufschlag zeigen"}
              </Button>
            </div>
          )}
        </div>
        <PositionenEditor
          positionen={positionen}
          setPositionen={setPositionen}
          bearbeitbar={bearbeitbar}
          pc={pc}
          aktiverTitel={aktiverTitel}
          setAktiverTitel={setAktiverTitel}
          stundensatz={stundensatz}
          kalk={kalkSpalten}
          materialAufschlag={Number(firma?.material_aufschlag ?? 0)}
          lohnarten={lohnartenFuer(firma, stundensatz)}
        />
        {bearbeitbar && pc && (
          <Eingabezeile katalog={katalog} stundensatz={stundensatz} ziel={titelName}
            onLeistung={schnellLeistung} onArtikel={schnellArtikel} onFrei={schnellFrei} onTitel={titelAnlegen} onText={schnellText} />
        )}
        {hinzufuegenLeiste}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <BelegTexte kopf={kopf} aendern={kopfAendern} bearbeitbar={bearbeitbar} pc={pc} />
        <Summen netto={s.netto} ust={s.ust} brutto={s.brutto} ustSatz={kopf.ust_satz} ohneUst={ohneUst} firma={firma} kalk={kalk}
          uebersicht={uebersicht} nachlass={positionen.find(istNachlass) ?? null} summeVor={summeVorNachlass(positionen)}
          foerderung={{ text: kopf.foerderung_text ?? "", betrag: kopf.foerderung_betrag ?? null }}
          onNachlass={bearbeitbar && anzahl > 0 && !istStorno ? (w) => setPositionen((alt) => nachlassSetzen(alt, w)) : undefined}
          onFoerderung={bearbeitbar && !istStorno ? (w) => kopfAendern({ foerderung_text: w.text, foerderung_betrag: w.betrag }) : undefined}
          onAufschlaege={bearbeitbar && anzahl > 0 ? () => setDialog("aufschlaege") : undefined} />
      </div>

      {bearbeitbar && pc && anzahl > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-2.5 text-sm" data-summenleiste>
          <span>Netto <span className="zahl font-semibold">{euro(s.netto)}</span></span>
          {!ohneUst && <span>Brutto <span className="zahl font-bold">{euro(s.brutto)}</span></span>}
          {kalk.ek > 0 && (() => {
            const r = rohertrag(s.netto, kalk.ek, kalk.stunden);
            return (
              <span className="text-muted-foreground" title="Netto minus Material-Einkauf — nur für dich">
                Bleibt nach Material <span className="zahl font-semibold text-foreground">{euro(r.bleibt)}</span>
                {r.anteil != null && ` (${Math.round(r.anteil * 100)} %)`}
                {r.jeStunde != null && <> · je Stunde <span className="zahl font-semibold text-foreground">{euro(r.jeStunde)}</span></>}
              </span>
            );
          })()}
          <span className="ml-auto flex items-center gap-3">
            {dirty && <span className="text-xs font-medium text-muted-foreground">nicht gespeichert</span>}
            <Button className="h-9" onClick={speichern} disabled={!!laeuft || (!dirty && !neu)}>
              <Save className="h-4 w-4" /> {laeuft === "speichern" ? "Speichert …" : dirty || neu ? "Speichern" : "Gespeichert"}
            </Button>
          </span>
        </div>
      )}

      </div>
      {mitSeite && (
        <aside className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-muted/40 p-3" aria-label="PDF-Vorschau">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold">Vorschau</p>
            <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setSeitenVorschau(false)}>ausblenden</button>
          </div>
          <LiveVorschau stand={vorschauStand} erzeugen={vorschauErzeugen} />
        </aside>
      )}
      </div>

      {entwurf && !pc && (
        <Button variant="outline" className="h-12 w-full" onClick={() => void fertigFragen()} disabled={!!laeuft}>
          <Check className="h-4 w-4" /> Fertigstellen — Nummer vergeben
        </Button>
      )}

      {bearbeitbar && !pc && (
        <>
          <div className="h-16" aria-hidden />
          <div
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-3 pt-2.5 sm:px-4"
            style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="zahl text-lg font-bold leading-tight">{euro(s.brutto)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ohneUst ? "ohne USt" : `netto ${euro(s.netto)}`}
                  {dirty && <span className="font-medium text-foreground"> · nicht gespeichert</span>}
                </p>
              </div>
              <Button className="h-12 min-w-36" onClick={speichern} disabled={!!laeuft || (!dirty && !neu)}>
                <Save className="h-4 w-4" /> {laeuft === "speichern" ? "Speichert …" : dirty || neu ? "Speichern" : "Gespeichert"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Dialoge ── */}
      <LeistungDialog
        open={dialog === "leistung"}
        onOpenChange={(o) => setDialog(o ? "leistung" : null)}
        katalog={katalog}
        laedt={katalogLaedt}
        positionen={positionen}
        titelId={aktiverTitel}
        onTitelWahl={setAktiverTitel}
        onNeuerTitel={titelAnlegen}
        onPlus={leistungPlus}
        onMinus={leistungMinus}
        onArtikel={artikelPlus}
        onFrei={freiAusSuche}
        onKatalog={() => setDialog("katalog")}
        firma={firma}
        stundensatz={stundensatz}
      />
      <KatalogDialog open={dialog === "katalog"} onOpenChange={(o) => setDialog(o ? "katalog" : null)} ziel={titelName} onUebernehmen={katalogUebernehmen} />
      {istAngebot && (
        <>
          <VorlagenDialog open={dialog === "vorlage"} onOpenChange={(o) => setDialog(o ? "vorlage" : null)} ziel={titelName} stundensatz={stundensatz} onWahl={vorlageUebernehmen} />
          <VorlageSpeichernDialog open={dialog === "vorlageSpeichern"} onOpenChange={(o) => setDialog(o ? "vorlageSpeichern" : null)} kopf={kopf} positionen={positionen} />
        </>
      )}
      <KiMaterialDialog open={dialog === "ki"} onOpenChange={(o) => setDialog(o ? "ki" : null)} onUebernehmen={kiUebernehmen} />
      <AufschlaegeDialog open={dialog === "aufschlaege"} onOpenChange={(o) => setDialog(o ? "aufschlaege" : null)} positionen={positionen}
        stundensatz={stundensatz} materialStandard={Number(firma?.material_aufschlag ?? 0)} ustSatz={kopf.ust_satz} ohneUst={ohneUst}
        onAnwenden={(neu) => { setPositionen(neu); toast.success("Preise neu gerechnet"); }} />
      <ArbeitszeitDialog
        open={dialog === "arbeitszeit"}
        onOpenChange={(o) => setDialog(o ? "arbeitszeit" : null)}
        lohnarten={lohnartenFuer(firma, stundensatz)}
        onUebernehmen={arbeitszeitHinzufuegen}
      />
      <SpracheDialog
        open={dialog === "sprache"}
        onOpenChange={(o) => setDialog(o ? "sprache" : null)}
        katalog={katalog}
        autoStart
        onUebernehmen={spracheUebernehmen}
      />
      {kopf.projekt_id && (
        <ImportDialog
          open={dialog === "import"}
          onOpenChange={(o) => setDialog(o ? "import" : null)}
          projektId={kopf.projekt_id}
          belegId={neu ? null : id}
          belegt={belegt}
          angebotId={kopf.angebot_id}
          stundensatzStart={stundensatz}
          firma={firma}
          vorhandeneTitel={positionen.some((p) => p.art === "titel")}
          onUebernehmen={importUebernehmen}
        />
      )}
      {istAngebot && beleg && (
        <TeilrechnungDialog
          open={dialog === "teil"}
          onOpenChange={(o) => setDialog(o ? "teil" : null)}
          angebot={beleg}
          laeuft={laeuft === "kopieren"}
          onAnlegen={teilAnlegen}
        />
      )}
      <PositionDialog position={freie} neu stundensatz={stundensatz} onOpenChange={(o) => { if (!o) setFreie(null); }} onUebernehmen={freieHinzufuegen} />

      <AlertDialog open={frage === "fertig"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{typText} fertigstellen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-sm text-muted-foreground">
                <p>
                  {istAngebot
                    ? "Das Angebot bekommt die nächste Angebotsnummer. Danach als PDF schicken — ändern geht weiterhin."
                    : beleg?.nummer
                      ? `Die Rechnung behält ihre Nummer ${beleg.nummer}. Danach die neue Fassung an den Kunden schicken — die alte bleibt im Archiv.`
                      : "Die Rechnung bekommt die nächste Rechnungsnummer. Ändern geht danach mit „Rechnung ändern“, bis sie bezahlt, gemahnt oder an die Kanzlei übergeben ist."}
                </p>
                <p className="font-medium text-foreground">
                  <span className="zahl">{euro(ohneUst ? s.netto : s.brutto)}</span> {ohneUst ? "netto" : "brutto"} · {anzahl} {anzahl === 1 ? "Position" : "Positionen"} · an {kopf.empf_name}
                </p>
                {[
                  ...(konflikte > 0 && !dirty
                    ? [`${konflikte} ${konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — doppelt verrechnet?`]
                    : []),
                  ...(teilHinweis ? [teilHinweis] : []),
                  ...warnungen,
                ].map((w) => (
                  <p key={w} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium", TON_KLASSE.gelb)}>{w}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={fertigAusfuehren}>Fertigstellen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage === "storno"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung {beleg?.nummer} stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Es entsteht eine Stornorechnung mit eigener Nummer, die diese Rechnung in voller Höhe aufhebt — die
              schickst du dem Kunden{status === "bezahlt" ? "; der bezahlte Betrag steht darauf als Gutschrift" : ""}. Die Rechnung selbst bleibt
              unverändert erhalten. Stunden, Material und Regieberichte sind danach wieder frei — für die neue
              Rechnung „Korrektur anlegen“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={stornoAusfuehren}>Stornieren</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage === "aendern"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung {beleg?.nummer} ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              Sie wird wieder ein Entwurf und behält ihre Nummer. Das bisherige PDF bleibt im Archiv. Danach erneut
              fertigstellen und dem Kunden die neue Fassung schicken. Geht nur, solange nichts bezahlt, gemahnt oder
              an die Kanzlei übergeben ist — sonst stornieren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={aendernAusfuehren}>Ändern</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage === "entsperren"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fertiges Angebot ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Nummer {beleg?.nummer} bleibt. Wurde das Angebot schon verschickt, ist „Kopieren“ meist besser —
              dann hat der Kunde nicht zwei verschiedene Fassungen mit derselben Nummer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={() => { setEntsperrt(true); setFrage(null); }}>Ändern</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={!!loeschen} onOpenChange={(o) => { if (!o) setLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{entwurf ? "Entwurf" : typText} löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {!istAngebot
                ? "Der Entwurf wird gelöscht. Übernommene Stunden, Material und Regieberichte sind danach wieder frei."
                : folge.length
                  ? `Das Angebot wird endgültig gelöscht — der Rechnungsentwurf daraus verliert den Verweis.`
                  : "Das Angebot wird endgültig gelöscht."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {loeschen?.projektMoeglich && projekt && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={loeschen.projektAuch}
                onCheckedChange={(v) => setLoeschen((l) => (l ? { ...l, projektAuch: !!v } : l))}
                className="mt-0.5 h-5 w-5"
              />
              <span>
                Projekt <span className="zahl font-medium">{projekt.nummer}</span> „{projekt.name}“ auch löschen
                <span className="block text-xs text-muted-foreground">Wurde für dieses Angebot angelegt, sonst hängt nichts daran.</span>
              </span>
            </label>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschenAusfuehren}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VerlassenDialog
        offen={!!schutz.ziel}
        onAbbrechen={schutz.abbrechen}
        onVerwerfen={() => { sicherungLoeschen(schluessel); schutz.weiter(); }}
        onSpeichern={async () => {
          const ziel = schutz.ziel;
          const ok = await speichernIntern({ weiterleiten: false });
          if (ok) schutz.weiter(ziel);
          else schutz.abbrechen();
        }}
        speichertGerade={laeuft === "speichern"}
      />

      <FormularDialog open={vollVorschau} onOpenChange={setVollVorschau} titel="Vorschau" breite="breit"
        beschreibung="So bekommt es der Kunde — mit allen Änderungen, auch ungespeicherten."
        fuss={<Button className="h-12" onClick={() => setVollVorschau(false)}>Zurück zum Bearbeiten</Button>}>
        {vollVorschau && <LiveVorschau stand={vorschauStand} erzeugen={vorschauErzeugen} className="mx-auto w-full max-w-3xl" />}
      </FormularDialog>

      <FormularDialog
        open={!!vorschau}
        onOpenChange={(o) => { if (!o) vorschauSchliessen(); }}
        titel={vorschau?.dateiname ?? "PDF"}
        breite="breit"
        fuellend
        fuss={vorschau && (
          <>
            <Button variant="outline" className="h-12" onClick={vorschauSchliessen}>Schließen</Button>
            <Button className="h-12" onClick={() => void pdfTeilenOderLaden(vorschau.blob, vorschau.dateiname)}>
              <Download className="h-4 w-4" /> Herunterladen
            </Button>
          </>
        )}
      >
        {vorschau && <iframe src={vorschau.url} title="PDF-Vorschau" className="min-h-0 w-full flex-1 rounded-md border bg-muted" />}
      </FormularDialog>
    </Seite>
  );
}

function MenuePunkt({ icon: I, onClick, children, gefahr }: { icon: Icon; onClick: () => void; children: React.ReactNode; gefahr?: boolean }) {
  return (
    <DropdownMenuItem className={cn("h-11 gap-2", gefahr && "text-destructive focus:text-destructive")} onClick={onClick}>
      <I className="h-4 w-4" /> {children}
    </DropdownMenuItem>
  );
}

type NachlassWert = { text: string; prozent: number | null; betrag: number | null };

function Summen({
  netto, ust, brutto, ustSatz, ohneUst, firma, kalk, uebersicht, nachlass, summeVor, foerderung, onNachlass, onFoerderung, onAufschlaege,
}: {
  netto: number;
  ust: number;
  brutto: number;
  ustSatz: number;
  ohneUst: boolean;
  firma: Firma | null;
  kalk: { stunden: number; ek: number };
  /** Zusammenstellung: Titel mit Summe (ab zwei Titeln) */
  uebersicht: { nummer: string; name: string; summe: number }[];
  nachlass: EditorPosition | null;
  /** Summe der Positionen vor dem Nachlass */
  summeVor: number;
  foerderung: { text: string; betrag: number | null };
  /** nur bearbeitbar */
  onNachlass?: (w: NachlassWert | null) => void;
  onFoerderung?: (w: { text: string; betrag: number | null }) => void;
  /** Material-Aufschlag und Stundensatz für ausgewählte Positionen */
  onAufschlaege?: () => void;
}) {
  const [nachlassOffen, setNachlassOffen] = useState(false);
  const [foerderOffen, setFoerderOffen] = useState(false);
  const r = rohertrag(netto, kalk.ek, kalk.stunden);
  const mitKalk = kalk.stunden > 0 || kalk.ek > 0;
  const nachlassBetrag = nachlass ? positionGesamt(nachlass) : 0;
  const zahlen = ohneUst ? netto : brutto;
  const foerderBetrag = foerderung.betrag ?? 0;
  const Zeile = ({ text, betrag, klasse, onClick }: { text: string; betrag: number; klasse?: string; onClick?: () => void }) => (
    <div className={cn("flex justify-between gap-3", klasse)}>
      <dt className="min-w-0 text-muted-foreground">
        {onClick ? <button type="button" className="text-left underline-offset-2 hover:underline" onClick={onClick}>{text}</button> : text}
      </dt>
      <dd className="zahl shrink-0">{euro(betrag)}</dd>
    </div>
  );

  return (
    <section className="rounded-lg border bg-card p-4" data-summen>
      {uebersicht.length > 0 && (
        <div className="mb-3 border-b pb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zusammenstellung</p>
          <dl className="space-y-1 text-sm" data-zusammenstellung>
            {uebersicht.map((u) => (
              <div key={`${u.nummer}-${u.name}`} className="flex justify-between gap-3">
                <dt className="min-w-0 truncate"><span className="zahl mr-1.5 text-muted-foreground">{u.nummer}</span>{u.name}</dt>
                <dd className="zahl shrink-0">{euro(u.summe)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <dl className="space-y-1.5 text-sm">
        {nachlass && (
          <>
            <Zeile text="Summe Positionen" betrag={summeVor} />
            <Zeile text={`abzüglich ${nachlassText(nachlass)}`} betrag={nachlassBetrag} onClick={onNachlass ? () => setNachlassOffen(true) : undefined} />
          </>
        )}
        <Zeile text="Summe netto" betrag={netto} klasse={nachlass ? "border-t pt-1.5" : undefined} />
        <Zeile text={ohneUst ? (firma?.kleinunternehmer ? "Kleinunternehmer — keine USt" : "Reverse Charge — keine USt") : `USt ${zahl(ustSatz)} %`} betrag={ust} />
        <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold">
          <dt>Gesamt</dt>
          <dd className="zahl">{euro(brutto)}</dd>
        </div>
        {foerderBetrag > 0 && (
          <div className="mt-2 space-y-1 rounded-md bg-muted/60 px-3 py-2" data-foerderung>
            <Zeile text={`Mögliche Förderung${foerderung.text.trim() ? ` (${foerderung.text.trim()})` : ""}`} betrag={-foerderBetrag}
              onClick={onFoerderung ? () => setFoerderOffen(true) : undefined} />
            <div className="flex justify-between gap-3 font-semibold"><dt>Kosten nach Förderung</dt><dd className="zahl">{euro(runden2(zahlen - foerderBetrag))}</dd></div>
            <p className="text-[11px] text-muted-foreground">Nur zur Info im Dokument — wird nicht abgezogen.</p>
          </div>
        )}
      </dl>

      {(onNachlass || onFoerderung) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {onNachlass && (
            <Button variant="outline" className="h-11 gap-1.5" onClick={() => setNachlassOffen(true)}>
              <Percent className="h-4 w-4" /> {nachlass ? "Nachlass ändern" : "Nachlass"}
            </Button>
          )}
          {onFoerderung && (
            <Button variant="outline" className="h-11 gap-1.5" onClick={() => setFoerderOffen(true)}>
              <HandCoins className="h-4 w-4" /> {foerderBetrag > 0 ? "Förderung ändern" : "Förderung"}
            </Button>
          )}
        </div>
      )}

      {(mitKalk || onAufschlaege) && (
        <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" /> Kalkulation <span className="font-normal normal-case tracking-normal">— nur für dich, nicht auf dem PDF</span>
          </p>
          {mitKalk && (
            <dl className="space-y-1">
              {kalk.stunden > 0 && (
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Arbeitszeit</dt><dd className="zahl">{zahl(Math.round(kalk.stunden * 10) / 10)} h</dd></div>
              )}
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Material-Einkauf</dt><dd className="zahl">{euro(kalk.ek)}</dd></div>
              <div className="flex justify-between gap-3 font-medium">
                <dt>Bleibt nach Material</dt>
                <dd className="zahl">{euro(r.bleibt)}{r.anteil != null && <span className="ml-1 font-normal text-muted-foreground">({Math.round(r.anteil * 100)} %)</span>}</dd>
              </div>
              {r.jeStunde != null && (
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">je Arbeitsstunde</dt><dd className="zahl">{euro(r.jeStunde)}</dd></div>
              )}
            </dl>
          )}
          {onAufschlaege && (
            <Button variant="outline" className="mt-1 w-full gap-1.5" onClick={onAufschlaege}>
              <Calculator className="h-4 w-4" /> Aufschlag / Stundensatz für einzelne Positionen
            </Button>
          )}
        </div>
      )}

      {onNachlass && <NachlassDialog open={nachlassOffen} onOpenChange={setNachlassOffen} nachlass={nachlass} summeVor={summeVor} onSetzen={onNachlass} />}
      {onFoerderung && <FoerderungDialog open={foerderOffen} onOpenChange={setFoerderOffen} foerderung={foerderung} zahlen={zahlen} onSetzen={onFoerderung} />}
    </section>
  );
}

/** Nachlass in % oder als Betrag — steht als eigene Zeile im Dokument */
function NachlassDialog({ open, onOpenChange, nachlass, summeVor, onSetzen }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nachlass: EditorPosition | null;
  summeVor: number;
  onSetzen: (w: NachlassWert | null) => void;
}) {
  const [inProzent, setInProzent] = useState(true);
  const [wert, setWert] = useState("");
  const [text, setText] = useState("Nachlass");
  useEffect(() => {
    if (!open) return;
    setInProzent(nachlass ? nachlass.prozent != null : true);
    setWert(nachlass ? zahl(nachlass.prozent ?? Math.abs(preisVon(nachlass))) : "");
    setText(nachlass?.bezeichnung || "Nachlass");
  }, [open, nachlass]);
  const n = dezimalLesen(wert);
  const ok = n != null && n > 0 && (inProzent ? n <= 100 : n <= summeVor);
  const betrag = ok ? (inProzent ? runden2((summeVor * n!) / 100) : runden2(n!)) : 0;
  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Nachlass"
      beschreibung="Steht als eigene Zeile im Dokument: Summe der Positionen, abzüglich Nachlass. Die Einzelpreise bleiben."
      fuss={(
        <>
          {nachlass && <Button variant="outline" className="h-12 text-destructive" onClick={() => { onSetzen(null); onOpenChange(false); }}>Entfernen</Button>}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!ok} onClick={() => { onSetzen({ text, prozent: inProzent ? n : null, betrag: inProzent ? null : n }); onOpenChange(false); }}>Übernehmen</Button>
        </>
      )}>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={inProzent ? "default" : "outline"} className="h-11" onClick={() => setInProzent(true)}>in %</Button>
        <Button variant={!inProzent ? "default" : "outline"} className="h-11" onClick={() => setInProzent(false)}>in €</Button>
      </div>
      {inProzent && (
        <div className="flex flex-wrap gap-2">
          {[2, 3, 5, 10].map((x) => (
            <Button key={x} variant={n === x ? "default" : "outline"} className="min-w-16" onClick={() => setWert(String(x))}>{x} %</Button>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="nachlass-wert">{inProzent ? "Prozent" : "Betrag netto"}</Label>
        <Input id="nachlass-wert" inputMode="decimal" className="zahl h-12 text-right" value={wert} onChange={(e) => setWert(e.target.value)} placeholder={inProzent ? "z. B. 5" : "z. B. 200"} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nachlass-text">Bezeichnung im Dokument</Label>
        <Input id="nachlass-text" className="h-12" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachlass, Rabatt, Treuerabatt …" />
      </div>
      {ok && (
        <p className="text-sm text-muted-foreground">
          {euro(summeVor)} abzüglich <span className="zahl font-medium text-foreground">{euro(betrag)}</span> = <span className="zahl font-medium text-foreground">{euro(runden2(summeVor - betrag))}</span> netto
        </p>
      )}
    </FormularDialog>
  );
}

/** Mögliche Förderung — nur zur Info unter der Summe, wird nicht abgezogen */
function FoerderungDialog({ open, onOpenChange, foerderung, zahlen, onSetzen }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  foerderung: { text: string; betrag: number | null };
  zahlen: number;
  onSetzen: (w: { text: string; betrag: number | null }) => void;
}) {
  const [text, setText] = useState("");
  const [betrag, setBetrag] = useState("");
  useEffect(() => {
    if (!open) return;
    setText(foerderung.text);
    setBetrag(foerderung.betrag ? zahl(foerderung.betrag) : "");
  }, [open, foerderung]);
  const b = dezimalLesen(betrag);
  const ok = b != null && b > 0;
  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Mögliche Förderung"
      beschreibung="Steht unter der Summe mit „Kosten nach Förderung“ — als Info für den Kunden, der Betrag wird nicht abgezogen."
      fuss={(
        <>
          {!!foerderung.betrag && <Button variant="outline" className="h-12 text-destructive" onClick={() => { onSetzen({ text: "", betrag: null }); onOpenChange(false); }}>Entfernen</Button>}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!ok} onClick={() => { onSetzen({ text: text.trim(), betrag: b }); onOpenChange(false); }}>Übernehmen</Button>
        </>
      )}>
      <div className="space-y-1.5">
        <Label htmlFor="foerder-text">Förderung</Label>
        <Input id="foerder-text" className="h-12" value={text} onChange={(e) => setText(e.target.value)} list="foerder-vorschlaege" placeholder="z. B. Landesförderung PV, Klimafonds" />
        <datalist id="foerder-vorschlaege">
          {["Landesförderung Steiermark", "Klima- und Energiefonds", "EAG-Investitionszuschuss", "Bundesförderung Speicher", "Handwerkerbonus"].map((v) => <option key={v} value={v} />)}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="foerder-betrag">Betrag (ca.)</Label>
        <Input id="foerder-betrag" inputMode="decimal" className="zahl h-12 text-right" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="z. B. 1500" />
      </div>
      {ok && (
        <p className="text-sm text-muted-foreground">
          Kosten nach Förderung etwa <span className="zahl font-medium text-foreground">{euro(runden2(zahlen - b!))}</span>
        </p>
      )}
    </FormularDialog>
  );
}
