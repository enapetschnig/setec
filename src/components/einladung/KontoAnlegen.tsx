import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFehler, benutzerFehler, benutzername, zuEmail } from "@/lib/konto";
import { offeneEinladungMerken, offeneEinladungVergessen } from "@/lib/einladung";
import { KUNDE } from "@/kunde.config";

/**
 * Das EINE Registrierungsformular — auf der Anmeldeseite („Registrieren“)
 * und hinter dem Firmen-Link/QR-Code (pages/Einladung.tsx). Mit Link ist
 * das Konto sofort freigeschaltet, ohne Link bestätigt es der Chef mit einem
 * Tipp (Startseite / Einstellungen → Mitarbeiter) — Trigger handle_new_user.
 */

function PasswortFeld({ id, autoComplete, autoFocus }: { id: string; autoComplete: string; autoFocus?: boolean }) {
  const [zeigen, setZeigen] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name="passwort" type={zeigen ? "text" : "password"} autoComplete={autoComplete} required minLength={6}
        autoFocus={autoFocus} className="h-12 pr-12 text-base md:text-base" placeholder="mindestens 6 Zeichen" />
      <button type="button" onClick={() => setZeigen((z) => !z)} aria-label={zeigen ? "Passwort verbergen" : "Passwort zeigen"}
        className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted-foreground">
        {zeigen ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

/** onStart(true) vor dem Anlegen, onStart(false) bei einem Fehler — mit der Sitzung leitet die Seite weiter */
export function KontoAnlegen({ token, onStart, zurAnmeldung }: {
  token: string | null; onStart?: (an: boolean) => void; zurAnmeldung?: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  // Benutzername folgt dem Vornamen, bis man ihn selbst ändert
  const [benutzer, setBenutzer] = useState<string | null>(null);
  const vorschlag = benutzername(vorname);

  const absenden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (laeuft) return;
    const fd = new FormData(e.currentTarget);
    const v = vorname.trim(), n = nachname.trim();
    if (!v || !n) return toast.error("Bitte Vor- und Nachnamen eintragen.");
    const benutzer = String(fd.get("benutzer") ?? "");
    const passwort = String(fd.get("passwort") ?? "");
    const falsch = benutzerFehler(benutzer);
    if (falsch) return toast.error("Benutzername geht so nicht", { description: falsch });
    if (passwort.length < 6) return toast.error("Das Passwort braucht mindestens 6 Zeichen.");
    const email = zuEmail(benutzer, KUNDE.loginDomain);
    setLaeuft(true);
    onStart?.(true);
    offeneEinladungVergessen();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: passwort,
      options: { data: { ...(token ? { einladung: token } : {}), vorname: v, nachname: n } },
    });
    if (error) {
      // Doppelt getippt oder Funkloch nach dem Anlegen: mit demselben Passwort klappt die Anmeldung
      if (/already (been )?registered/i.test(error.message)) {
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: passwort });
        if (!e2) return;
        setLaeuft(false);
        onStart?.(false);
        if (token) offeneEinladungMerken(token);
        return toast.error("Diesen Benutzernamen gibt es schon", { description: "Bitte einen anderen wählen, z. B. vorname.nachname. Hast du schon ein Konto? Dann unten „Anmelden“." });
      }
      setLaeuft(false);
      onStart?.(false);
      if (token) offeneEinladungMerken(token);
      return toast.error("Hat nicht geklappt", { description: authFehler(error.message) });
    }
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: passwort });
      if (e2) { setLaeuft(false); return toast.error("Konto angelegt — bitte jetzt anmelden", { description: authFehler(e2.message) }); }
    }
    toast.success(`Willkommen, ${v}!`);
  };

  return (
    <form onSubmit={absenden} className="space-y-4" data-pruef="konto-anlegen">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ein-vorname">Vorname</Label>
          <Input id="ein-vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} autoComplete="given-name"
            required maxLength={60} className="h-12 text-base md:text-base" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ein-nachname">Nachname</Label>
          <Input id="ein-nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} autoComplete="family-name"
            required maxLength={60} className="h-12 text-base md:text-base" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ein-benutzer">Dein Benutzername</Label>
        <Input id="ein-benutzer" name="benutzer" value={benutzer ?? vorschlag} onChange={(e) => setBenutzer(e.target.value)}
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="h-12 text-base md:text-base" />
        <p className="text-xs text-muted-foreground">Damit meldest du dich an. Du kannst ihn ändern oder deine E-Mail-Adresse nehmen.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ein-passwort">Dein Passwort</Label>
        <PasswortFeld id="ein-passwort" autoComplete="new-password" />
      </div>
      <Button type="submit" className="h-14 w-full text-base" disabled={laeuft} data-pruef="los">
        {laeuft ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Fertig — App starten
      </Button>
      {!token && <p className="text-center text-xs text-muted-foreground">Der Chef bestätigt neue Konten mit einem Tipp — danach geht es los.</p>}
      <p className="text-center text-sm text-muted-foreground">
        Schon ein Konto?{" "}
        {zurAnmeldung
          ? <button type="button" onClick={zurAnmeldung} className="font-medium text-primary">Anmelden</button>
          : <Link to="/auth" onClick={offeneEinladungVergessen} className="font-medium text-primary">Anmelden</Link>}
      </p>
    </form>
  );
}
