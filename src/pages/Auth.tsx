import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSitzung } from "@/hooks/useSitzung";
import { authFehler, emailFehler, zuEmail } from "@/lib/konto";
import { KontoAnlegen } from "@/components/einladung/KontoAnlegen";
import { KUNDE } from "@/kunde.config";

type Modus = "login" | "reset" | "register";

/**
 * Anmelden, Registrieren, Passwort vergessen — erreichbar über /start (der
 * EINE Link) oder direkt. ?modus=registrieren bzw. ?modus=vergessen öffnet
 * gleich das passende Formular (z. B. „Neuen Link anfordern“ auf /passwort-neu).
 */
export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, laden: sitzungLaedt } = useSitzung();
  const [laden, setLaden] = useState(false);
  const [modus, setModus] = useState<Modus>(() =>
    params.get("modus") === "registrieren" ? "register" : params.get("modus") === "vergessen" ? "reset" : "login");
  // Adresse, an die der Link ging — dann zeigt das Formular „Schau in dein Postfach“
  const [gesendet, setGesendet] = useState<string | null>(null);

  if (!sitzungLaedt && session) return <Navigate to="/" replace />;

  const linkAnfordern = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    const falsch = emailFehler(email);
    if (falsch) return toast.error(falsch, { description: "Hast du dich mit einem Benutzernamen statt E-Mail registriert? Dann gibt dir der Chef ein vorläufiges Passwort." });
    setLaden(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/passwort-neu` });
    setLaden(false);
    // Ob es das Konto gibt, verrät die Antwort nicht — nur echte Fehler (Netz, zu oft) zeigen
    if (error && !/not found|no user/i.test(error.message)) {
      return toast.error("Hat nicht geklappt", { description: authFehler(error.message) });
    }
    setGesendet(email);
  };

  const anmelden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLaden(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: zuEmail(String(fd.get("benutzer")), KUNDE.loginDomain),
      password: String(fd.get("password")),
    });
    setLaden(false);
    if (error) {
      toast.error("Anmeldung fehlgeschlagen", { description: authFehler(error.message) });
      return;
    }
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Kopf in SETEC-Schwarz mit Querlogo wie auf setec-gmbh.at, das Schild groß und leise im Hintergrund */}
      <div className="relative overflow-hidden bg-marke-schwarz px-6 pb-20 pt-[calc(2.5rem+env(safe-area-inset-top))] text-white">
        <img src={KUNDE.logoZeichen} alt="" aria-hidden className="pointer-events-none absolute -right-20 -top-6 h-80 w-auto opacity-[0.07]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-marke-gold/60 to-transparent" aria-hidden />
        <div className="relative mx-auto max-w-sm">
          <img src={KUNDE.logoQuerHell} alt={KUNDE.firma} className="h-24 w-auto" />
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-marke-gold">Betriebs-App</p>
          <p className="mt-1 text-white/70">Projekte, Einsätze, Stunden, Material und Rechnungen — am Handy und im Büro.</p>
        </div>
      </div>

      <div className="relative -mt-10 flex-1 px-4 pb-10">
        <div className="mx-auto w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lg">
          {modus === "register" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Registrieren</h2>
              <KontoAnlegen zurAnmeldung={() => setModus("login")} />
            </div>
          )}

          {modus === "reset" && gesendet && (
            <div className="space-y-4" data-pruef="link-gesendet">
              <MailCheck className="h-10 w-10 text-primary" />
              <h2 className="text-lg font-semibold">Schau in dein Postfach</h2>
              <p className="text-sm text-muted-foreground">
                Gibt es ein Konto mit <b className="text-foreground">{gesendet}</b>, kommt gleich eine E-Mail mit einem Link.
                Antippen, neues Passwort festlegen — fertig. Nichts da? Auch im Spam-Ordner nachsehen.
              </p>
              <Button className="h-12 w-full" onClick={() => { setGesendet(null); setModus("login"); }}>Zurück zur Anmeldung</Button>
            </div>
          )}

          {modus === "reset" && !gesendet && (
            <form onSubmit={linkAnfordern} className="space-y-4" data-pruef="passwort-vergessen">
              <h2 className="text-lg font-semibold">Passwort vergessen</h2>
              <p className="text-sm text-muted-foreground">Trag deine E-Mail-Adresse ein — du bekommst einen Link, mit dem du ein neues Passwort festlegst.</p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">E-Mail-Adresse</Label>
                <Input id="reset-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required autoFocus
                  className="h-12 text-base md:text-base" />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={laden}>
                {laden && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Link schicken
              </Button>
              <p className="text-xs text-muted-foreground">Kein E-Mail-Konto in der App? Dann gibt dir der Chef ein vorläufiges Passwort.</p>
              <button type="button" onClick={() => setModus("login")} className="h-11 text-sm text-muted-foreground hover:text-foreground">Zurück zur Anmeldung</button>
            </form>
          )}

          {modus === "login" && (
            <form onSubmit={anmelden} className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" data-pruef="erstes-mal">
                <p><b>Zum ersten Mal hier?</b> Dann zuerst registrieren — anmelden geht erst danach.</p>
                <Button type="button" variant="outline" className="mt-2 h-11 w-full" onClick={() => setModus("register")}>Jetzt registrieren</Button>
              </div>
              <h2 className="text-lg font-semibold">Anmelden</h2>
              <div className="space-y-2">
                <Label htmlFor="benutzer">E-Mail (oder Benutzername)</Label>
                <Input id="benutzer" name="benutzer" type="text" autoComplete="username" autoCapitalize="none" required className="h-12 text-base md:text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} className="h-12 text-base md:text-base" />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={laden}>
                {laden && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Anmelden
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => setModus("reset")} className="h-11 text-muted-foreground hover:text-foreground">Passwort vergessen?</button>
                <button type="button" onClick={() => setModus("register")} className="h-11 font-medium text-primary hover:underline" data-pruef="registrieren">Registrieren</button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
