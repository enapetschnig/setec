import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, FileText, FolderOpen, History, Loader2, PenLine, Receipt, Save, Trash2, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Karte, RegieStatusBadge } from "@/components/Bausteine";
import { AdresseFeld } from "@/components/AdresseFeld";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { KundeWahl } from "@/components/KundeWahl";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useLetzteProjekte } from "@/components/dialoge/ZeitDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKunden, useLagerorte, useMitarbeiter, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahlLesen } from "@/lib/format";
import { regieberichtLaden, regieKunde, zeitpunkt, type RegieVoll } from "@/lib/regiePdf";
import { name, type Profil } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KundenUnterschrift, type KundenSicht } from "./KundenUnterschrift";
import { MaterialListe } from "./MaterialListe";
import { RegieFotos } from "./RegieFotos";
import { baustelleText } from "./RegieAnsicht";
import { ZeitPartie } from "./ZeitPartie";
import {
  entwurfAus, fehlerText, neueZeile, neuerEntwurf, regieLoeschen, regieSpeichern, useLetzterUnterzeichner,
  useStundenVorschlaege,
} from "./regieDaten";
import {
  DIREKT, adresseText, hatInhalt, materialMenge, materialZusammenfassen, schnappschuss, textAnhaengen, unterschriftOrdner,
  zeileLeer, zeileStunden, zeitSpanne, zuordnungFehler, type Adresse, type Entwurf, type ZeitModus,
} from "./regieLogik";
import { sicherungLesen, sicherungLoeschen, sicherungSchreiben, type Sicherung } from "./sicherung";
import { useRegiePdf } from "./useRegiePdf";

/** Derselbe Schlüssel wie im Stunden-Dialog: Stunden oder Von–Bis merkt sich die App */
const MODUS_KEY = "elektro.zeitmodus";
/** Woher das Material kommt — nur gemerkt für alle ohne eigenen Bus */
const QUELLE_KEY = "elektro.regie.quelle";

/** Übergabe beim Wechsel /regie/neu → /regie/<id> (der Editor wird dabei neu aufgebaut) */
type Uebergabe = { entwurf?: Entwurf; unterschreiben?: boolean; fotos?: boolean } | null;
type Person = Pick<Profil, "vorname" | "nachname" | "farbe">;

function gemerkterModus(): ZeitModus {
  try {
    return localStorage.getItem(MODUS_KEY) === "vonbis" ? "vonbis" : "stunden";
  } catch {
    return "stunden";
  }
}

/** Leere Zeilen (noch nichts eingetippt) bleiben beim Abgleich mit der Datenbank stehen */
function mitLeerenZeilen(db: Entwurf, alt: Entwurf): Entwurf {
  const leer = alt.zeilen.filter(zeileLeer);
  return leer.length ? { ...db, zeilen: [...db.zeilen, ...leer] } : db;
}

/**
 * Regiebericht schreiben — auf der Baustelle, am Handy, mit einer Hand.
 * Alles bleibt im Editor, bis „Speichern“ oder „Unterschreiben lassen“
 * gedrückt wird; dann bucht regieSpeichern() Bericht, Stunden und Material.
 */
/**
 * Vorbelegen über die Adresse (Kalender: „Regiebericht“ am Service-Termin):
 *   /regie/neu?projekt=<id>                 mit Projekt
 *   /regie/neu?kunde=<id>[&termin=<id>]     ohne Projekt, Einsatzort = Adresse des Kunden
 *   /regie/neu?termin=<id>                  Projekt bzw. Kunde und Datum aus dem Termin
 *   /regie/neu?ohne=1                       ohne Projekt, Kunde noch offen
 */
export function RegieEditor({ voll }: { voll: RegieVoll | null }) {
  const { profil, istChef } = useSitzung();
  const ich = profil?.id ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const neuLaden = useNeuLaden();
  const pdf = useRegiePdf();
  const { data: projekte = [] } = useProjekte();
  const { data: kunden = [] } = useKunden();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: lagerorte = [], isSuccess: lagerorteDa } = useLagerorte();
  const { data: letzte = [] } = useLetzteProjekte(ich || undefined);
  const uebergabe = useRef((location.state ?? null) as Uebergabe).current;

  const [modusStandard, setModusStandard] = useState<ZeitModus>(gemerkterModus);
  const [entwurf, setEntwurf] = useState<Entwurf>(() => {
    if (!voll) {
      return neuerEntwurf(params.get("projekt") ?? "", ich, gemerkterModus(), {
        kundeId: params.get("kunde") ?? undefined, terminId: params.get("termin"),
        ohneProjekt: !params.get("projekt") && (!!params.get("kunde") || params.get("ohne") === "1"),
      });
    }
    if (uebergabe?.entwurf?.berichtId === voll.id) return uebergabe.entwurf;
    const db = entwurfAus(voll, ich, istChef);
    return db.zeilen.length ? db : { ...db, zeilen: [neueZeile(ich, gemerkterModus())] };
  });
  // Stand der Datenbank als Vergleichswert (nur gespeicherte Berichte)
  const [basis, setBasis] = useState<string | null>(() => (voll ? schnappschuss(entwurfAus(voll, ich, istChef)) : null));
  const [sicherung, setSicherung] = useState<Sicherung | null>(() => {
    if (uebergabe?.entwurf) return null;
    const s = sicherungLesen(voll?.id ?? null);
    if (!s) return null;
    const gleich = voll ? schnappschuss(s.entwurf) === schnappschuss(entwurfAus(voll, ich, istChef)) : !hatInhalt(s.entwurf);
    return gleich ? null : s;
  });
  const [speichert, setSpeichert] = useState(false);
  const [unterschreiben, setUnterschreiben] = useState(false);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [loescht, setLoescht] = useState(false);
  const [standardQuelle, setStandardQuelle] = useState("");

  const arbeitenFeld = useRef<HTMLTextAreaElement>(null);
  const basisRef = useRef(basis);
  basisRef.current = basis;
  const nachSpeichern = useRef(false);
  const speichertRef = useRef(false);
  const weg = useRef(false);
  const projektGewaehlt = useRef(!!params.get("projekt") || !!params.get("kunde") || !!params.get("termin") || params.get("ohne") === "1");
  const letzteVoll = useRef(voll);

  const gespeichert = !!entwurf.berichtId;
  const schnapp = useMemo(() => schnappschuss(entwurf), [entwurf]);
  const ungespeichert = gespeichert ? schnapp !== basis : hatInhalt(entwurf);

  const aendern = useCallback((f: (e: Entwurf) => Entwurf) => {
    nachSpeichern.current = false;
    setEntwurf(f);
  }, []);

  // Neuer Stand aus der Datenbank (nach dem Speichern oder von einem anderen Gerät):
  // übernehmen, solange hier nichts Ungespeichertes steht
  useEffect(() => {
    if (!voll || voll === letzteVoll.current) return;
    letzteVoll.current = voll;
    const db = entwurfAus(voll, ich, istChef);
    const alteBasis = basisRef.current;
    const nachEigenemSpeichern = nachSpeichern.current;
    nachSpeichern.current = false;
    setBasis(schnappschuss(db));
    setEntwurf((e) => (nachEigenemSpeichern || schnappschuss(e) === alteBasis ? mitLeerenZeilen(db, e) : e));
  }, [voll, ich, istChef]);

  // Vom neuen Bericht kommend: gleich weiter zur Unterschrift
  useEffect(() => {
    if (!uebergabe) return;
    if (uebergabe.unterschreiben) setUnterschreiben(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ohne Vorgabe: das zuletzt bebuchte, noch laufende Projekt
  useEffect(() => {
    if (gespeichert || entwurf.projektId || entwurf.ohneProjekt || projektGewaehlt.current) return;
    const p = letzte.map((id) => projekte.find((x) => x.id === id)).find((x) => x && x.status === "aktiv");
    if (p) setEntwurf((e) => (e.projektId ? e : { ...e, projektId: p.id }));
  }, [letzte, projekte, gespeichert, entwurf.projektId, entwurf.ohneProjekt]);

  // Vom Kalender: Projekt oder Kunde und Datum aus dem Termin (Felder je nach Stand des Kalenders)
  const terminParam = !voll ? params.get("termin") : null;
  const { data: termin } = useQuery({
    queryKey: ["termine", "fuer-regie", terminParam],
    enabled: !!terminParam,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*").eq("id", terminParam!).maybeSingle();
      if (error) throw error;
      return data as ({ datum: string; projekt_id: string | null; kunde_id?: string | null } | null);
    },
  });
  const terminUebernommen = useRef(false);
  useEffect(() => {
    if (!termin || terminUebernommen.current || gespeichert) return;
    terminUebernommen.current = true;
    setEntwurf((e) => {
      const projektId = e.projektId || (!e.kundeId ? termin.projekt_id ?? "" : "");
      const kundeId = e.kundeId || (!projektId ? termin.kunde_id ?? "" : "");
      return { ...e, projektId, kundeId, ohneProjekt: !projektId, datum: termin.datum || e.datum };
    });
  }, [termin, gespeichert]);

  // Ohne Projekt: Einsatzort = Adresse des Kunden, solange nichts eingetragen ist
  const kunde = useMemo(() => kunden.find((k) => k.id === entwurf.kundeId) ?? null, [kunden, entwurf.kundeId]);
  useEffect(() => {
    if (!entwurf.ohneProjekt || !kunde || gespeichert || adresseText(entwurf.adresse)) return;
    setEntwurf((e) => (e.kundeId === kunde.id && !adresseText(e.adresse)
      ? { ...e, adresse: { strasse: kunde.strasse ?? "", plz: kunde.plz ?? "", ort: kunde.ort ?? "" } }
      : e));
  }, [kunde, entwurf.ohneProjekt, entwurf.adresse, gespeichert]);

  // Material kommt standardmäßig aus dem eigenen Bus
  useEffect(() => {
    if (standardQuelle || !lagerorteDa) return;
    let gemerkt: string | null = null;
    try { gemerkt = localStorage.getItem(QUELLE_KEY); } catch { /* egal */ }
    const gueltig = gemerkt && (gemerkt === DIREKT || lagerorte.some((l) => l.id === gemerkt)) ? gemerkt : null;
    setStandardQuelle(
      lagerorte.find((l) => l.user_id === ich)?.id ?? gueltig ?? lagerorte.find((l) => l.art === "lager")?.id ?? lagerorte[0]?.id ?? DIREKT,
    );
  }, [lagerorteDa, lagerorte, ich, standardQuelle]);

  // Ungespeichertes im Gerät sichern
  useEffect(() => {
    if (sicherung || weg.current) return;
    const t = window.setTimeout(() => {
      if (ungespeichert) sicherungSchreiben(entwurf);
      else sicherungLoeschen(entwurf.berichtId);
    }, 500);
    return () => window.clearTimeout(t);
  }, [entwurf, ungespeichert, sicherung]);

  useEffect(() => {
    if (!ungespeichert) return;
    const warnen = (e: BeforeUnloadEvent) => {
      if (weg.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [ungespeichert]);

  // Schon gebuchte Stunden gibt es nur am Projekt — ohne Projekt nichts vorzuschlagen
  const { data: vorschlaege = [] } = useStundenVorschlaege(entwurf.projektId, entwurf.datum, !entwurf.ohneProjekt);

  const personen = useMemo(() => {
    const m = new Map<string, Person>();
    voll?.zeiten.forEach((z) => { if (z.profiles) m.set(z.user_id, z.profiles); });
    vorschlaege.forEach((v) => { if (v.profiles) m.set(v.user_id, v.profiles); });
    mitarbeiter.forEach((p) => m.set(p.id, p));
    return m;
  }, [voll, vorschlaege, mitarbeiter]);
  const person = useCallback((id: string) => personen.get(id) ?? null, [personen]);
  const namen = useCallback((id: string | null) => (id ? name(personen.get(id)) : "–"), [personen]);

  const kopf = useMemo(() => {
    if (entwurf.ohneProjekt) return null;
    const p = voll?.projekte ?? projekte.find((x) => x.id === entwurf.projektId) ?? null;
    if (!p) return null;
    return { id: p.id, nummer: p.nummer, name: p.name, kunde: p.kunden?.name ?? null, baustelle: baustelleText(p) || null };
  }, [voll, projekte, entwurf.projektId, entwurf.ohneProjekt]);
  const kundeName = entwurf.ohneProjekt ? kunde?.name ?? voll?.kunden?.name ?? null : kopf?.kunde ?? null;
  const einsatzort = entwurf.ohneProjekt ? adresseText(entwurf.adresse) || null : kopf?.baustelle ?? null;

  const { data: letzterName = "" } = useLetzterUnterzeichner(
    entwurf.ohneProjekt ? undefined : entwurf.projektId || undefined,
    entwurf.ohneProjekt ? entwurf.kundeId || undefined : undefined,
  );
  const nameVorschlag = letzterName || (voll ? regieKunde(voll)?.ansprechpartner : null) || kunde?.ansprechpartner || "";

  const darfLoeschen = !!voll && voll.status === "entwurf" && (istChef || voll.erstellt_von === ich);

  // ── Kopf ändern ──
  const projektWaehlen = (id: string) => {
    projektGewaehlt.current = true;
    aendern((e) => ({ ...e, projektId: id, zeilen: e.zeilen.filter((z) => z.herkunft !== "uebernehmen") }));
  };

  /** Neuer Bericht: mit Projekt oder als Service beim Kunden (gespeichert bleibt es dabei) */
  const artWaehlen = (ohneProjekt: boolean) => {
    projektGewaehlt.current = true;
    aendern((e) => ({ ...e, ohneProjekt, zeilen: ohneProjekt ? e.zeilen.filter((z) => z.herkunft !== "uebernehmen") : e.zeilen }));
  };

  const kundeWaehlen = (id: string | null) => {
    const k = kunden.find((x) => x.id === id) ?? null;
    aendern((e) => ({
      ...e,
      kundeId: id ?? "",
      // Neuer Kunde = seine Adresse als Einsatzort (änderbar)
      adresse: k ? { strasse: k.strasse ?? "", plz: k.plz ?? "", ort: k.ort ?? "" } : e.adresse,
    }));
  };

  const adresseSetzen = (teil: Partial<Adresse>) => aendern((e) => ({ ...e, adresse: { ...e.adresse, ...teil } }));

  const datumSetzen = (d: string) => {
    const hatteUebernommene = entwurf.zeilen.some((z) => z.herkunft === "uebernehmen");
    aendern((e) => ({ ...e, datum: d, zeilen: e.zeilen.filter((z) => z.herkunft !== "uebernehmen") }));
    if (hatteUebernommene) toast("Übernommene Stunden entfernt", { description: "Sie gehören zum vorigen Tag." });
  };

  const modusMerken = (m: ZeitModus) => {
    setModusStandard(m);
    try { localStorage.setItem(MODUS_KEY, m); } catch { /* egal */ }
  };

  const quelleWaehlen = (q: string) => {
    setStandardQuelle(q);
    try { localStorage.setItem(QUELLE_KEY, q); } catch { /* egal */ }
  };

  // ── Speichern ──
  /** true = gespeichert und Bericht bleibt in diesem Editor; neuer Bericht: Seitenwechsel → false */
  const speichern = async (danach?: "unterschreiben" | "fotos"): Promise<boolean> => {
    if (speichertRef.current) return false;
    if (!ich) {
      toast.error("Nicht angemeldet.");
      return false;
    }
    speichertRef.current = true;
    setSpeichert(true);
    try {
      const neu = !entwurf.berichtId;
      const r = await regieSpeichern(entwurf, { ich, namen: (id) => namen(id) });
      if (r.abbruch) {
        toast.error("Nicht gespeichert", { description: r.fehler[0] });
        return false;
      }
      const ok = r.fehler.length === 0;
      nachSpeichern.current = ok;
      setEntwurf(r.zustand);
      sicherungLoeschen(null);
      if (!ok) {
        toast.error(neu ? `${r.zustand.nummer ?? "Bericht"} angelegt — aber nicht alles gespeichert` : "Nicht alles gespeichert", {
          description: r.fehler.join("\n"),
        });
      } else if (!danach) {
        toast.success(neu ? `Regiebericht ${r.zustand.nummer ?? ""} angelegt` : "Gespeichert");
      }
      await neuLaden("regieberichte", "zeiten", "material", "projekt_zahlen", "lager");
      if (neu) {
        // Neue Adresse = neuer Editor: offenen Rest und den nächsten Schritt mitgeben
        navigate(`/regie/${r.zustand.berichtId}`, {
          replace: true,
          state: { entwurf: ok ? undefined : r.zustand, unterschreiben: ok && danach === "unterschreiben", fotos: ok && danach === "fotos" } satisfies Uebergabe,
        });
        return false;
      }
      return ok;
    } finally {
      speichertRef.current = false;
      setSpeichert(false);
    }
  };

  // ── Unterschreiben ──
  const unterschreibenStarten = async () => {
    const ohne = zuordnungFehler(entwurf);
    if (ohne) {
      toast.error(ohne);
      return;
    }
    if (!entwurf.arbeiten.trim()) {
      toast.error("Bitte zuerst die durchgeführten Arbeiten eintragen.");
      arbeitenFeld.current?.focus();
      return;
    }
    if (!entwurf.zeilen.some((z) => !zeileLeer(z)) && entwurf.material.length === 0) {
      toast.error("Bitte Arbeitszeit oder Material eintragen.");
      return;
    }
    if (!gespeichert || ungespeichert) {
      const ok = await speichern("unterschreiben");
      if (!ok) return;
    }
    setUnterschreiben(true);
  };

  const unterschreibenBestaetigen = async (unterzeichner: string, png: Blob): Promise<boolean> => {
    const id = entwurf.berichtId;
    if (!id) return false;
    const speicher = supabase.storage.from("projekt-dateien");
    const ordner = unterschriftOrdner(entwurf.ohneProjekt ? null : entwurf.projektId, id);
    let pfad = `${ordner}/${id}.png`;
    let { error } = await speicher.upload(pfad, png, { upsert: true, contentType: "image/png" });
    if (error) {
      // Liegt schon ein Bild da (abgebrochener Versuch): Überschreiben ist gesperrt
      pfad = `${ordner}/${id}-${Date.now()}.png`;
      ({ error } = await speicher.upload(pfad, png, { upsert: false, contentType: "image/png" }));
    }
    if (error) {
      toast.error("Unterschrift nicht gespeichert", { description: error.message });
      return false;
    }
    const { error: e2 } = await supabase.from("regieberichte")
      .update({ status: "unterschrieben", unterschrift_pfad: pfad, unterschrift_name: unterzeichner, unterschrieben_am: new Date().toISOString() })
      .eq("id", id).eq("status", "entwurf").select("id").single();
    if (e2) {
      toast.error("Nicht unterschrieben", { description: fehlerText(e2) });
      return false;
    }
    weg.current = true;
    sicherungLoeschen(id);
    setUnterschreiben(false);
    toast.success(`Regiebericht ${entwurf.nummer ?? ""} unterschrieben`, { description: "Festgeschrieben — als PDF teilen oder später verrechnen." });
    void neuLaden("regieberichte", "zeiten", "material", "projekt_zahlen");
    return true;
  };

  const sicht: KundenSicht = useMemo(() => ({
    nummer: entwurf.nummer,
    datum: entwurf.datum,
    kunde: kundeName,
    projekt: kopf ? `${kopf.nummer} ${kopf.name}` : "",
    baustelle: einsatzort,
    arbeiten: entwurf.arbeiten,
    zeiten: entwurf.zeilen.filter((z) => !zeileLeer(z)).map((z) => ({
      key: z.key,
      name: name(person(z.userId)),
      spanne: z.modus === "vonbis" ? zeitSpanne(z.von, z.bis, zahlLesen(z.pause)) : "",
      stunden: zeileStunden(z),
    })),
    material: materialZusammenfassen(entwurf.material.map((m) => ({
      artikelId: m.artikelId, bezeichnung: m.bezeichnung, einheit: m.einheit, menge: materialMenge(m),
    }))).map((m, i) => ({ key: `${i}`, menge: m.menge, einheit: m.einheit, bezeichnung: m.bezeichnung })),
  }), [entwurf, kopf, person, kundeName, einsatzort]);

  // ── PDF-Vorschau (gespeicherter Stand, ungespeichertes vorher speichern) ──
  const vorschauHolen = async () => {
    if (ungespeichert && !(await speichern())) return null;
    return entwurf.berichtId ? regieberichtLaden(entwurf.berichtId) : null;
  };

  // ── Löschen ──
  const loeschen = async (mitBuchungen: boolean) => {
    if (!voll) return;
    setLoescht(true);
    // Ohne Projekt gehen Stunden, Material und Fotos mit (Trigger) — die Bilddateien hier
    const fotoPfade = !voll.projekt_id
      ? ((await supabase.from("dateien").select("pfad").eq("regiebericht_id", voll.id)).data ?? []).map((d) => d.pfad)
      : [];
    const r = await regieLoeschen(voll, mitBuchungen);
    setLoescht(false);
    if (r.fehler) {
      toast.error("Nicht gelöscht", { description: r.fehler });
      return;
    }
    weg.current = true;
    setLoeschenFrage(false);
    sicherungLoeschen(voll.id);
    if (fotoPfade.length) void supabase.storage.from("projekt-dateien").remove(fotoPfade);
    toast.success(`${voll.nummer ?? "Regiebericht"} gelöscht`, r.uebrig ? {
      description: `${r.uebrig} Buchung(en) von Kollegen bleiben am Projekt — löschen kann sie nur, wer gebucht hat, oder der Chef.`,
    } : undefined);
    if (window.history.length > 1) navigate(-1);
    else navigate("/regie", { replace: true });
    void neuLaden("regieberichte", "zeiten", "material", "projekt_zahlen", "lager");
  };

  const wiederherstellen = () => {
    if (!sicherung) return;
    projektGewaehlt.current = true;
    // Kopf-Vergleich gegen den heutigen Stand der Datenbank, nicht den von damals
    aendern(() => ({
      ...sicherung.entwurf,
      nummer: voll?.nummer ?? null,
      kopfBasis: voll ? entwurfAus(voll, ich, istChef).kopfBasis : null,
    }));
    setSicherung(null);
    toast.success("Eingaben wiederhergestellt — noch nicht gespeichert.");
  };

  const verwerfen = () => {
    sicherungLoeschen(voll?.id ?? null);
    setSicherung(null);
  };

  const anzahlZeiten = voll?.zeiten.length ?? 0;
  // Ohne Projekt gibt es nichts, woran Stunden und Material hängen bleiben könnten
  const ohneProjektGespeichert = !!voll && !voll.projekt_id;
  const anzahlMaterial = voll?.material.length ?? 0;
  const projektChips = !gespeichert && !entwurf.ohneProjekt
    ? letzte.map((id) => projekte.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && p.status === "aktiv")
    : [];

  return (
    <Seite
      titel={entwurf.nummer ? `Regiebericht ${entwurf.nummer}` : "Neuer Regiebericht"}
      untertitel={kopf ? [kopf.name, kopf.kunde].filter(Boolean).join(" · ")
        : entwurf.ohneProjekt ? [kundeName ?? "Kunde wählen", "ohne Projekt"].join(" · ") : "Projekt wählen"}
      aktionen={gespeichert ? (
        pdf.pc ? (
          <Button variant="outline" className="h-11 gap-1.5" disabled={pdf.laeuft || speichert} onClick={() => pdf.los(vorschauHolen)}>
            {pdf.laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Vorschau
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-11 w-11" disabled={pdf.laeuft || speichert}
            onClick={() => pdf.los(vorschauHolen)} aria-label="PDF-Vorschau">
            {pdf.laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          </Button>
        )
      ) : undefined}
    >
      {sicherung && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">
          <History className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            Ungespeicherte Eingaben vom {zeitpunkt(new Date(sicherung.zeit).toISOString())} gefunden.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11" onClick={verwerfen}>Verwerfen</Button>
            <Button className="h-11" onClick={wiederherstellen}>Wiederherstellen</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <RegieStatusBadge status="entwurf" verrechnet={!!voll?.rechnung_id} />
        <span className="text-muted-foreground">
          {gespeichert ? `Aufgenommen von ${name(voll?.ersteller)}` : "Noch nicht gespeichert"}
          {gespeichert && ungespeichert && " · ungespeicherte Änderungen"}
        </span>
      </div>

      {voll?.rechnung_id && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-status-lila bg-status-lila p-3 text-sm text-status-lila-fg">
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Schon verrechnet{voll.rechnung?.nummer ? ` mit Rechnung ${voll.rechnung.nummer}` : ""}.</span>
          {istChef && <Link to={`/belege/${voll.rechnung_id}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">Rechnung öffnen</Link>}
        </div>
      )}

      <fieldset disabled={speichert || loescht} className="min-w-0 space-y-4">
        {/* grid-cols-1 = minmax(0, 1fr): lange, gekürzte Namen dürfen die Spalte nicht verbreitern */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <Karte titel={entwurf.ohneProjekt ? "Kunde, Einsatzort und Tag" : "Projekt und Tag"}>
              <div className="space-y-4">
                {!gespeichert && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1" role="group" aria-label="Woran hängt der Bericht?">
                    {[
                      { ohne: false, text: "Mit Projekt", icon: FolderOpen },
                      { ohne: true, text: "Service ohne Projekt", icon: Wrench },
                    ].map((o) => (
                      <button key={o.text} type="button" aria-pressed={entwurf.ohneProjekt === o.ohne} onClick={() => artWaehlen(o.ohne)}
                        className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors",
                          entwurf.ohneProjekt === o.ohne ? "bg-card text-primary shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground")}>
                        <o.icon className="h-4 w-4 shrink-0" /> <span className="truncate">{o.text}</span>
                      </button>
                    ))}
                  </div>
                )}
                {entwurf.ohneProjekt ? (
                  <>
                    <div className="space-y-2">
                      <Label>Kunde</Label>
                      <KundeWahl wert={entwurf.kundeId || null} onChange={(k) => kundeWaehlen(k?.id ?? null)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rb-strasse">Einsatzort</Label>
                      <AdresseFeld id="rb-strasse" className="h-12 text-base" wert={entwurf.adresse.strasse} placeholder="Straße – Vorschläge kommen"
                        onChange={(strasse) => adresseSetzen({ strasse })}
                        onWaehlen={(a) => adresseSetzen({ strasse: a.strasse, plz: a.plz, ort: a.ort })} />
                      <div className="grid grid-cols-[6rem_1fr] gap-2">
                        <Input aria-label="PLZ" className="h-12 text-base" inputMode="numeric" value={entwurf.adresse.plz}
                          onChange={(e) => adresseSetzen({ plz: e.target.value })} placeholder="PLZ" />
                        <Input aria-label="Ort" className="h-12 text-base" value={entwurf.adresse.ort}
                          onChange={(e) => adresseSetzen({ ort: e.target.value })} placeholder="Ort" />
                      </div>
                      <p className="text-xs text-muted-foreground">Vorbelegt mit der Adresse des Kunden — änderbar, wenn woanders gearbeitet wurde.</p>
                    </div>
                  </>
                ) : gespeichert ? (
                  <Link to={`/projekte/${entwurf.projektId}`}
                    className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:border-primary/50">
                    <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-muted-foreground">{kopf?.nummer}</span>
                      <span className="block truncate font-medium">{kopf?.name ?? "Projekt"}</span>
                      {(kopf?.kunde || kopf?.baustelle) && (
                        <span className="block truncate text-xs text-muted-foreground">{[kopf.kunde, kopf.baustelle].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </Link>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="rb-projekt">Projekt</Label>
                    {projektChips.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {projektChips.map((p) => (
                          <button key={p.id} type="button" onClick={() => projektWaehlen(p.id)}
                            className={cn("min-h-11 max-w-full truncate rounded-full border px-3.5 text-sm transition-colors",
                              entwurf.projektId === p.id ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-muted")}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <ProjektWahl id="rb-projekt" nurInArbeit wert={entwurf.projektId} onChange={(id) => projektWaehlen(id)} />
                    {(kopf?.kunde || kopf?.baustelle) && (
                      <p className="text-xs text-muted-foreground">{[kopf.kunde, kopf.baustelle].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="rb-datum">Datum</Label>
                  <Input id="rb-datum" type="date" className="h-12 text-base" value={entwurf.datum} onChange={(e) => datumSetzen(e.target.value)} />
                </div>
              </div>
            </Karte>

            <Karte
              titel="Durchgeführte Arbeiten"
              aktion={<DiktatKnopf onText={(t) => aendern((e) => ({ ...e, arbeiten: textAnhaengen(e.arbeiten, t) }))} />}
            >
              <Textarea
                ref={arbeitenFeld}
                rows={6}
                className="min-h-[9rem] text-base leading-relaxed"
                value={entwurf.arbeiten}
                onChange={(e) => {
                  const text = e.target.value;
                  aendern((x) => ({ ...x, arbeiten: text }));
                }}
                placeholder="Was wurde gemacht? z. B. Steckdosen im Gastraum getauscht, FI geprüft …"
                aria-label="Durchgeführte Arbeiten"
              />
            </Karte>
          </div>

          <div className="space-y-4">
            <Karte titel="Arbeitszeit der Partie">
              <ZeitPartie
                entwurf={entwurf}
                aendern={aendern}
                ich={ich}
                istChef={istChef}
                person={person}
                mitarbeiter={mitarbeiter}
                vorschlaege={vorschlaege}
                modusStandard={modusStandard}
                onModus={modusMerken}
                ohneProjekt={entwurf.ohneProjekt}
              />
            </Karte>

            <Karte titel="Material">
              <MaterialListe
                entwurf={entwurf}
                aendern={aendern}
                ich={ich}
                lagerorte={lagerorte}
                standardQuelle={standardQuelle || DIREKT}
                onStandardQuelle={quelleWaehlen}
                namen={namen}
              />
            </Karte>

            <Karte titel="Fotos">
              <RegieFotos
                berichtId={entwurf.berichtId}
                projektId={entwurf.ohneProjekt ? null : entwurf.projektId || null}
                bearbeitbar
                kameraStart={!!uebergabe?.fotos}
                vorSpeichern={async () => { await speichern("fotos"); }}
              />
            </Karte>
          </div>
        </div>

        {darfLoeschen && (
          <Button variant="ghost" className="h-11 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschenFrage(true)}>
            <Trash2 className="h-4 w-4" /> Entwurf löschen
          </Button>
        )}
      </fieldset>

      {/* Fester Fuß wie im Formulardialog — Speichern und Unterschrift immer mit dem Daumen erreichbar */}
      <div
        className="sticky bottom-0 z-20 -mx-3 -mb-6 border-t bg-background px-3 pt-2.5 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2 lg:justify-end">
          {/* Gespeichert ist ein Zustand, kein Knopf — schmal, damit „Unterschreiben lassen“ am Handy ganz Platz hat */}
          {gespeichert && !ungespeichert ? (
            <span className="flex h-12 shrink-0 items-center gap-1.5 pl-1 pr-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-status-gruen-fg" />
              Gespeichert
            </span>
          ) : (
            <Button
              variant="outline"
              className="h-12 shrink-0 gap-1.5 px-3.5 min-[375px]:px-4"
              disabled={speichert || loescht || !!zuordnungFehler(entwurf)}
              onClick={() => void speichern()}
            >
              {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {/* iPhone SE: nur das Symbol, sonst passt „Unterschreiben lassen“ nicht */}
              <span className="sr-only min-[375px]:not-sr-only">Speichern</span>
            </Button>
          )}
          <Button className="h-12 min-w-0 flex-1 gap-2 text-base lg:max-w-sm" disabled={speichert || loescht} onClick={() => void unterschreibenStarten()}>
            <PenLine className="h-5 w-5" />
            <span className="truncate">{pdf.pc ? "Vom Kunden unterschreiben lassen" : "Unterschreiben lassen"}</span>
          </Button>
        </div>
      </div>

      <KundenUnterschrift
        open={unterschreiben}
        onOpenChange={setUnterschreiben}
        sicht={sicht}
        nameVorschlag={nameVorschlag}
        onBestaetigen={unterschreibenBestaetigen}
      />

      <AlertDialog open={loeschenFrage} onOpenChange={(o) => !loescht && setLoeschenFrage(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entwurf {voll?.nummer ?? ""} löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {anzahlZeiten + anzahlMaterial === 0
                ? "Der Bericht ist noch leer."
                : ohneProjektGespeichert
                  ? `Im Bericht stecken ${anzahlZeiten} Stundenzeile${anzahlZeiten === 1 ? "" : "n"} und ${anzahlMaterial} Materialbuchung${anzahlMaterial === 1 ? "" : "en"}. Ohne Projekt gehen sie samt Fotos mit — Material aus dem Bus kommt dort wieder dazu.`
                  : `Im Bericht stecken ${anzahlZeiten} Stundenzeile${anzahlZeiten === 1 ? "" : "n"} und ${anzahlMaterial} Materialbuchung${anzahlMaterial === 1 ? "" : "en"}. Mitlöschen — oder als normale Buchungen am Projekt behalten?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-11" disabled={loescht}>Abbrechen</AlertDialogCancel>
            {anzahlZeiten + anzahlMaterial > 0 && !ohneProjektGespeichert ? (
              <>
                <Button variant="outline" className="h-11" disabled={loescht} onClick={() => void loeschen(false)}>Buchungen behalten</Button>
                <Button variant="destructive" className="h-11" disabled={loescht} onClick={() => void loeschen(true)}>
                  {loescht && <Loader2 className="h-4 w-4 animate-spin" />} Alles löschen
                </Button>
              </>
            ) : (
              <Button variant="destructive" className="h-11" disabled={loescht} onClick={() => void loeschen(false)}>
                {loescht && <Loader2 className="h-4 w-4 animate-spin" />} Löschen
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}
