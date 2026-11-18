import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { alleSicherungenLoeschen } from "@/components/belege/sicherung";
import { supabase } from "@/integrations/supabase/client";
import { darfRecht, istVollerChef, type Recht, type RollenZeile } from "@/lib/rechte";
import type { Firma, Profil } from "@/lib/types";

/**
 * Wer ist angemeldet, welche Rolle hat er, wie heißt der Betrieb.
 *
 * Einmal geladen, überall verfügbar — fast jede Seite fragt „Chef oder
 * Monteur?“ und braucht Stundensatz, Aufschlag oder den Briefkopf.
 */

interface Sitzung {
  laden: boolean;
  session: Session | null;
  profil: Profil | null;
  firma: Firma | null;
  /** Grundstufe Büro (Chef oder eine Büro-Rolle) */
  istChef: boolean;
  /** Der Chef selbst (eingebaute Rolle „Chef“) — vergibt Rollen und Rechte */
  istVollerChef: boolean;
  /** Recht der Rolle (Rollen & Rechte auf „Mitarbeiter & Zugänge“) */
  darf: (recht: Recht) => boolean;
  rollen: RollenZeile[];
  /** Profil ließ sich nicht laden (Funkloch) und am Gerät ist keins gemerkt */
  ohneVerbindung: boolean;
  neuLaden: () => Promise<void>;
}

const Ctx = createContext<Sitzung | null>(null);

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/*
  Zuletzt geladenes Profil und Betrieb am Gerät: im Funkloch öffnet die App
  damit normal, statt „Wartet auf Freischaltung“ zu zeigen. Rechte prüft
  ohnehin die Datenbank. Beim Abmelden gelöscht.
*/
const MERK = "setec.sitzung";
type Gemerkt = { id: string; profil: Profil; firma: Firma | null; rollen?: RollenZeile[] };
function gemerkt(id: string): Gemerkt | null {
  try {
    const g = JSON.parse(localStorage.getItem(MERK) || "null") as Gemerkt | null;
    return g?.id === id ? g : null;
  } catch { return null; }
}
function merken(g: Gemerkt | null) {
  try {
    if (g) localStorage.setItem(MERK, JSON.stringify(g));
    else localStorage.removeItem(MERK);
  } catch { /* privat: dann eben ohne */ }
}

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [laden, setLaden] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [rollen, setRollen] = useState<RollenZeile[]>([]);
  const [ohneVerbindung, setOhneVerbindung] = useState(false);
  // Für wen ist das Profil geladen? Neue Anmeldung → bis dahin „lädt“, sonst
  // stünde kurz (oder nach einem späten Nachladen dauerhaft) „Zugang nicht aktiv“ da
  const profilFuer = useRef<string | null>(null);

  const datenLaden = useCallback(async (s: Session | null) => {
    if (!s) {
      profilFuer.current = null;
      setProfil(null);
      setFirma(null);
      setLaden(false);
      return;
    }
    const [{ data: p, error: pFehler }, { data: f, error: fFehler }, { data: r, error: rFehler }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("firma").select("*").eq("id", 1).maybeSingle(),
      supabase.from("rollen").select("*").order("reihenfolge").order("name"),
    ]);
    if (pFehler || fFehler) {
      // Funkloch o. Ä.: Bekanntes behalten (sonst stünde mitten in der Arbeit
      // „Wartet auf Freischaltung“ da und offene Formulare wären weg)
      const g = gemerkt(s.user.id);
      profilFuer.current = s.user.id;
      setProfil((alt) => (alt?.id === s.user.id ? alt : g?.profil ?? null));
      setFirma((alt) => alt ?? g?.firma ?? null);
      setRollen((alt) => (alt.length ? alt : g?.rollen ?? []));
      setOhneVerbindung(!g);
      setLaden(false);
      return;
    }
    setOhneVerbindung(false);
    profilFuer.current = s.user.id;
    // Rollen nicht geladen (z. B. kurz weg): die gemerkten behalten
    const rl = rFehler ? gemerkt(s.user.id)?.rollen ?? [] : ((r ?? []) as RollenZeile[]);
    merken(p ? { id: s.user.id, profil: p, firma: f ?? null, rollen: rl } : null);
    setRollen((alt) => (gleich(alt, rl) ? alt : rl));
    // Unveränderte Daten behalten ihr Objekt — Supabase meldet sich bei jeder
    // Rückkehr in den Tab neu an, und ein neues Objekt setzt offene Formulare zurück
    setProfil((alt) => (gleich(alt, p ?? null) ? alt : p ?? null));
    setFirma((alt) => (gleich(alt, f ?? null) ? alt : f ?? null));
    setLaden(false);
  }, []);

  useEffect(() => {
    // Erst den Listener, dann die bestehende Sitzung — und nie await im
    // Listener selbst (Supabase-Eigenheit, sonst hängt die Anmeldung).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      // Gesicherte Beleg-Entwürfe enthalten Kundendaten — nicht fürs nächste Konto am Gerät
      if (e === "SIGNED_OUT") { alleSicherungenLoeschen(); merken(null); }
      setSession(s);
      if (s && profilFuer.current !== s.user.id) setLaden(true);
      window.setTimeout(() => void datenLaden(s), 0);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      void datenLaden(s);
    });
    return () => subscription.unsubscribe();
  }, [datenLaden]);

  const wert: Sitzung = {
    laden,
    session,
    profil,
    firma,
    istChef: !!profil?.aktiv && profil.rolle === "chef",
    istVollerChef: istVollerChef(profil, rollen),
    darf: (recht) => darfRecht(profil, rollen, recht),
    rollen,
    ohneVerbindung,
    // immer mit der aktuellen Sitzung — die im Render festgehaltene kann veraltet
    // sein (z. B. /passwort-neu: gerendert ohne, gespeichert mit Anmeldung)
    neuLaden: async () => datenLaden((await supabase.auth.getSession()).data.session),
  };

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useSitzung(): Sitzung {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSitzung außerhalb von SitzungProvider");
  return s;
}
