import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFehler, emailFehler, emailVorschlag } from "@/lib/konto";

/**
 * Das EINE Registrierungsformular — auf /start und auf der Anmeldeseite
 * („Registrieren“). Vorname, Nachname, E-Mail (damit meldet man sich an und
 * bekommt „Passwort vergessen“), Passwort. Am Anfang ist jedes Konto sofort
 * freigeschaltet (Trigger handle_new_user); Chef-Rechte gibt der
 * Chef unter Einstellungen → Mitarbeiter, das Team in der Plantafel → Teams.
 */

export function PasswortFeld({ id, autoComplete, autoFocus }: { id: string; autoComplete: string; autoFocus?: boolean }) {
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

/** Mit der neuen Sitzung leitet die Seite selbst weiter */
export function KontoAnlegen({ zurAnmeldung }: { zurAnmeldung: () => void }) {
  const [laeuft, setLaeuft] = useState(false);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const vorschlag = emailVorschlag(email);

  const absenden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (laeuft) return;
    const passwort = String(new FormData(e.currentTarget).get("passwort") ?? "");
    const v = vorname.trim(), n = nachname.trim();
    if (!v || !n) return toast.error("Bitte Vor- und Nachnamen eintragen.");
    const falsch = emailFehler(email);
    if (falsch) return toast.error(falsch);
    if (passwort.length < 6) return toast.error("Das Passwort braucht mindestens 6 Zeichen.");
    const adresse = email.trim().toLowerCase();
    setLaeuft(true);
    const { data, error } = await supabase.auth.signUp({
      email: adresse,
      password: passwort,
      options: { data: { vorname: v, nachname: n } },
    });
    if (error) {
      // Doppelt getippt oder Funkloch nach dem Anlegen: mit demselben Passwort klappt die Anmeldung
      if (/already (been )?registered/i.test(error.message)) {
        const { error: e2 } = await supabase.auth.signInWithPassword({ email: adresse, password: passwort });
        if (!e2) return;
        setLaeuft(false);
        return toast.error("Mit dieser E-Mail gibt es schon ein Konto", { description: "Dann unten „Anmelden“ — oder dort „Passwort vergessen?“." });
      }
      setLaeuft(false);
      return toast.error("Hat nicht geklappt", { description: authFehler(error.message) });
    }
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: adresse, password: passwort });
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
        <Label htmlFor="ein-email">Deine E-Mail-Adresse</Label>
        <Input id="ein-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="h-12 text-base md:text-base" />
        {vorschlag ? (
          <button type="button" onClick={() => setEmail(vorschlag)} className="text-left text-sm text-primary" data-pruef="email-vorschlag">
            Meintest du <b>{vorschlag}</b>? Antippen zum Übernehmen.
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Damit meldest du dich an — und bekommst einen Link, falls du das Passwort vergisst.</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="ein-passwort">Dein Passwort</Label>
        <PasswortFeld id="ein-passwort" autoComplete="new-password" />
      </div>
      <Button type="submit" className="h-14 w-full text-base" disabled={laeuft} data-pruef="los">
        {laeuft ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Fertig — App starten
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Schon ein Konto?{" "}
        <button type="button" onClick={zurAnmeldung} className="font-medium text-primary">Anmelden</button>
      </p>
    </form>
  );
}
