import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Loader2, Mail, Plus, Trash2, X, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSitzung } from "@/hooks/useSitzung";
import { useNeuLaden } from "@/hooks/useDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { datum } from "@/lib/format";
import {
  ADMIN_KONSOLE, GOOGLE_BEREICHE, GOOGLE_CLIENT_ID, postfachTesten, usePostfaecher, type Postfach, type TestErgebnis,
} from "@/lib/postfach";

const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

async function kopieren(text: string, was: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${was} kopiert`);
  } catch {
    toast.error("Kopieren ging nicht — bitte markieren und kopieren.");
  }
}

function KopierZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-md border bg-muted/40 px-2.5 py-2 text-xs">{wert}</code>
        <Button type="button" variant="outline" className="h-auto min-h-11 shrink-0 gap-1.5" onClick={() => void kopieren(wert, label)}>
          <Copy className="h-4 w-4" /> Kopieren
        </Button>
      </div>
    </div>
  );
}

/** Die drei Schritte in der Google Admin-Konsole (einmal je Firma) */
export function AdminAnleitung() {
  return (
    <div className="space-y-3 text-sm">
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <a href={ADMIN_KONSOLE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
            admin.google.com öffnen <ExternalLink className="h-3.5 w-3.5" />
          </a>{" "}
          — als Administrator: Sicherheit → Zugriffs- und Datenverwaltung → API-Steuerung → Domainweite Delegierung.
        </li>
        <li>„Neu hinzufügen“ und die Client-ID einfügen.</li>
        <li>Die Bereiche (OAuth-Bereiche) einfügen und „Autorisieren“. Wirkt meist sofort, manchmal erst nach einigen Stunden.</li>
      </ol>
      <KopierZeile label="Client-ID" wert={GOOGLE_CLIENT_ID} />
      <KopierZeile label="Bereiche" wert={GOOGLE_BEREICHE} />
      <p className="text-xs text-muted-foreground">Weitere Adressen derselben Firma brauchen keine neue Freigabe.</p>
    </div>
  );
}

function TestAnzeige({ t: ergebnis }: { t: TestErgebnis }) {
  if (ergebnis.ok) {
    const t = ergebnis as Extract<TestErgebnis, { ok: true }>;
    return (
      <div className="rounded-md border border-status-gruen-fg/30 bg-status-gruen-bg/40 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-status-gruen-fg"><CheckCircle2 className="h-4 w-4" /> Verbindung steht</p>
        {t.betreffe.length > 0 && (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground">Die 3 neuesten Mails im Posteingang:</p>
            <ul className="mt-1 space-y-0.5 text-xs">{t.betreffe.map((b, i) => <li key={i} className="truncate">· {b}</li>)}</ul>
          </>
        )}
      </div>
    );
  }
  const t = ergebnis as Extract<TestErgebnis, { ok: false }>;
  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="flex items-start gap-1.5 font-medium text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t.fehler}</p>
      {t.grund === "freigabe_fehlt" && <AdminAnleitung />}
      {t.grund === "api_aus" && <p className="text-xs">Bitte ePower Bescheid geben — das wird im Google-Cloud-Projekt eingeschaltet.</p>}
      {t.grund === "dienstkonto" && <p className="text-xs">Bitte ePower Bescheid geben — der Zugang muss neu hinterlegt werden.</p>}
    </div>
  );
}

type Zeile = { schluessel: string; id: string | null; adresse: string; rechnungen_einlesen: boolean; senden: boolean; standard_absender: boolean };
const zeileAus = (p: Postfach): Zeile => ({
  schluessel: p.id, id: p.id, adresse: p.adresse, rechnungen_einlesen: p.rechnungen_einlesen, senden: p.senden, standard_absender: p.standard_absender,
});

/** Einstellungen → E-Mail (nur Chef): Postfächer, Verbindung testen, Einlesen/Senden, Standard-Absender */
export function PostfachEinstellungen() {
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: gespeichert = [], isLoading } = usePostfaecher();
  const [entwurf, setEntwurf] = useState<Zeile[] | null>(null);
  const [tests, setTests] = useState<Record<string, TestErgebnis | "laeuft">>({});
  const [speichert, setSpeichert] = useState(false);
  const zeilen = entwurf ?? gespeichert.map(zeileAus);
  const geaendert = entwurf !== null;

  const setze = (k: string, teil: Partial<Zeile>) => setEntwurf(zeilen.map((z) => {
    if (z.schluessel === k) {
      const neu = { ...z, ...teil };
      if (teil.senden === false) neu.standard_absender = false;
      if (teil.standard_absender) neu.senden = true;
      return neu;
    }
    return teil.standard_absender ? { ...z, standard_absender: false } : z;
  }));
  const dazu = () => setEntwurf([...zeilen, {
    schluessel: crypto.randomUUID(), id: null, adresse: "", rechnungen_einlesen: true, senden: true,
    standard_absender: !zeilen.some((z) => z.standard_absender),
  }]);

  const testen = async (z: Zeile) => {
    const adresse = z.adresse.trim().toLowerCase();
    if (!MAIL.test(adresse)) return toast.error("Bitte eine gültige Adresse eintragen, z. B. office@firma.at");
    setTests((t) => ({ ...t, [z.schluessel]: "laeuft" }));
    try {
      const r = await postfachTesten(adresse);
      setTests((t) => ({ ...t, [z.schluessel]: r }));
      if (z.id) await neuLaden("postfaecher");
    } catch (e) {
      setTests((t) => { const n = { ...t }; delete n[z.schluessel]; return n; });
      toast.error("Test ging nicht", { description: (e as Error).message });
    }
  };

  const speichern = async () => {
    const liste = zeilen.map((z) => ({ ...z, adresse: z.adresse.trim().toLowerCase() })).filter((z) => z.adresse || z.id);
    const falsch = liste.find((z) => !MAIL.test(z.adresse));
    if (falsch) return toast.error(`„${falsch.adresse || "leer"}“ ist keine gültige Adresse.`);
    if (new Set(liste.map((z) => z.adresse)).size < liste.length) return toast.error("Eine Adresse steht zweimal da.");
    const domains = new Set(liste.map((z) => z.adresse.split("@")[1]));
    setSpeichert(true);
    try {
      const weg = gespeichert.filter((p) => !liste.some((z) => z.id === p.id)).map((p) => p.id);
      if (weg.length) {
        const { error } = await supabase.from("postfaecher").delete().in("id", weg);
        if (error) throw error;
      }
      // Standard-Absender zuerst überall aus — höchstens einer (eindeutiger Index)
      const { error: e0 } = await supabase.from("postfaecher").update({ standard_absender: false }).eq("standard_absender", true);
      if (e0) throw e0;
      for (const z of liste) {
        // vor dem Speichern erfolgreich getestet (neue Zeile) → gilt als geprüft (Startseiten-Karte verschwindet)
        const t = tests[z.schluessel];
        const getestet = t && t !== "laeuft" && t.ok && t.adresse === z.adresse;
        const werte = {
          adresse: z.adresse, rechnungen_einlesen: z.rechnungen_einlesen, senden: z.senden, standard_absender: false,
          ...(getestet ? { geprueft_am: new Date().toISOString(), letzter_fehler: null } : {}),
        };
        const { error } = z.id
          ? await supabase.from("postfaecher").update(werte).eq("id", z.id)
          : await supabase.from("postfaecher").insert(werte);
        if (error) throw error;
      }
      const standard = liste.find((z) => z.standard_absender && z.senden);
      if (standard) {
        const { error } = await supabase.from("postfaecher").update({ standard_absender: true }).eq("adresse", standard.adresse);
        if (error) throw error;
      }
      setEntwurf(null);
      await neuLaden("postfaecher");
      toast.success("Postfächer gespeichert", domains.size > 1 ? { description: "Mehrere Domains: jede braucht die Freigabe in ihrer eigenen Admin-Konsole." } : undefined);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <div className="space-y-4">
      <Karte titel="E-Mail-Postfächer (Google Workspace)">
        <p className="text-sm text-muted-foreground">
          Rechnungen von Lieferanten kommen automatisch als Eingangsrechnung „zu prüfen“ (alle 15 Minuten, Label
          „App: verarbeitet“ in Gmail, nichts wird gelöscht). Angebote und Rechnungen gehen von eurer Adresse hinaus und
          liegen danach in Gmail unter „Gesendet“. Weitere Adressen derselben Firma brauchen keine neue Freigabe.
        </p>
        {isLoading ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="mt-4 space-y-3">
            {zeilen.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Noch kein Postfach — Angebote gehen bisher über noreply@handwerkapp.at{firma?.email ? `, Antworten an ${firma.email}` : ""}.</p>}
            {zeilen.map((z) => {
              const p = gespeichert.find((x) => x.id === z.id);
              const t = tests[z.schluessel];
              return (
                <div key={z.schluessel} className="space-y-3 rounded-lg border p-3" data-pruef="postfach-zeile">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input className="h-11 flex-1" type="email" inputMode="email" autoComplete="off" placeholder="office@firma.at" aria-label="Postfach-Adresse"
                      value={z.adresse} onChange={(e) => { setze(z.schluessel, { adresse: e.target.value }); setTests((x) => { const n = { ...x }; delete n[z.schluessel]; return n; }); }} />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="h-11 flex-1 gap-1.5 sm:flex-none" disabled={t === "laeuft"} onClick={() => void testen(z)}>
                        {t === "laeuft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Verbindung testen
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Postfach ${z.adresse} entfernen`}
                        onClick={() => setEntwurf(zeilen.filter((x) => x.schluessel !== z.schluessel))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      ["rechnungen_einlesen", "Rechnungen einlesen", "aus diesem Postfach"],
                      ["senden", "Senden", "Angebote/Rechnungen von dieser Adresse"],
                      ["standard_absender", "Standard-Absender", "wenn nichts anderes gewählt"],
                    ] as const).map(([k, titel, unter]) => (
                      <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2">
                        <Switch checked={z[k]} onCheckedChange={(v) => setze(z.schluessel, { [k]: v })} />
                        <span className="text-sm leading-tight">{titel}<span className="block text-xs text-muted-foreground">{unter}</span></span>
                      </label>
                    ))}
                  </div>
                  {t && t !== "laeuft" && <TestAnzeige t={t} />}
                  {!t && p && (
                    <p className="text-xs text-muted-foreground">
                      {p.letzter_fehler ? <span className="font-medium text-destructive">Fehler: {p.letzter_fehler}</span>
                        : p.geprueft_am ? <>Verbindung geprüft am {datum(p.geprueft_am.slice(0, 10))}</> : "Noch nicht getestet."}
                      {p.zuletzt_abgerufen && <> · zuletzt abgerufen {new Date(p.zuletzt_abgerufen).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</>}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={dazu}><Plus className="h-4 w-4" /> Postfach</Button>
              {geaendert && (
                <>
                  <Button type="button" className="h-11 gap-1.5" disabled={speichert} onClick={() => void speichern()}>
                    {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Postfächer speichern
                  </Button>
                  <Button type="button" variant="ghost" className="h-11" disabled={speichert} onClick={() => setEntwurf(null)}>Verwerfen</Button>
                </>
              )}
            </div>
          </div>
        )}
      </Karte>
      <Karte titel="Freigabe in Google (einmal je Firma)">
        <AdminAnleitung />
      </Karte>
    </div>
  );
}

const HINWEIS_WEG = "postfach-hinweis-weg";

/** Startseite (Chef): „E-Mail verbinden“, solange kein Postfach erfolgreich getestet ist. „Später“ = 3 Tage weg. */
export function PostfachHinweis() {
  const { istChef } = useSitzung();
  const { data: liste, isLoading } = usePostfaecher(istChef);
  const [weg, setWeg] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(HINWEIS_WEG) || 0) < 3 * 86_400_000; } catch { return false; }
  });
  if (!istChef || weg || isLoading || !liste || liste.some((p) => p.geprueft_am && !p.letzter_fehler)) return null;
  const spaeter = () => {
    try { localStorage.setItem(HINWEIS_WEG, String(Date.now())); } catch { /* egal */ }
    setWeg(true);
  };
  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4" data-pruef="postfach-hinweis">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Mail className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">E-Mail verbinden</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Rechnungen von Lieferanten kommen automatisch in die App, Angebote und Rechnungen gehen von eurer eigenen Adresse hinaus.</p>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-10 w-10 shrink-0" aria-label="Später erinnern" onClick={spaeter}><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3"><AdminAnleitung /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild className="h-11"><Link to="/einstellungen?bereich=email">Postfach eintragen</Link></Button>
        <Button variant="ghost" className="h-11" onClick={spaeter}>Später</Button>
      </div>
    </section>
  );
}
