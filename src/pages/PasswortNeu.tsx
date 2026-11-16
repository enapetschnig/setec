import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswortFeld } from "@/components/einladung/KontoAnlegen";
import { authFehler } from "@/lib/konto";
import { Rahmen } from "@/components/einladung/Rahmen";
import { useSitzung } from "@/hooks/useSitzung";
import { istMobil, laeuftAlsApp } from "@/lib/installieren";

/**
 * /passwort-neu?token_hash=…&type=recovery — Ziel des Links aus der Mail
 * „Passwort vergessen“ (Vorlage in Supabase Auth, Versand über Resend).
 * Der Link wird erst beim Speichern eingelöst (verifyOtp), nicht beim Öffnen —
 * so verbraucht ihn kein Link-Scanner im Postfach. Danach ist man angemeldet.
 * Scheitert nur das Speichern (Netz), gilt der eingelöste Link weiter für
 * den nächsten Versuch. Am Handy öffnet der Mail-Link den Browser, nicht die
 * installierte App (eigener Speicher am iPhone) — dort heißt es darum am Ende
 * „App öffnen und mit dem neuen Passwort anmelden“.
 */
export default function PasswortNeu() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const [laeuft, setLaeuft] = useState(false);
  const [abgelaufen, setAbgelaufen] = useState(!tokenHash || params.get("type") !== "recovery");
  // Link schon eingelöst (verifyOtp), nur das Speichern fehlt noch
  const [eingeloest, setEingeloest] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const { neuLaden } = useSitzung();

  const speichern = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (laeuft || !tokenHash) return;
    const passwort = String(new FormData(e.currentTarget).get("passwort") ?? "");
    if (passwort.length < 6) return toast.error("Das Passwort braucht mindestens 6 Zeichen.");
    setLaeuft(true);
    let userId = eingeloest;
    if (!userId) {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error || !data.user) {
        setLaeuft(false);
        if (/expired|invalid|not found/i.test(error?.message ?? "")) return setAbgelaufen(true);
        return toast.error("Hat nicht geklappt", { description: authFehler(error?.message ?? "") });
      }
      userId = data.user.id;
      setEingeloest(userId);
    }
    const { error: e2 } = await supabase.auth.updateUser({ password: passwort });
    if (e2 && !/different from the old/i.test(e2.message)) {
      setLaeuft(false);
      return toast.error("Passwort nicht gespeichert", { description: authFehler(e2.message) });
    }
    // Ein vom Chef vergebenes vorläufiges Passwort ist damit erledigt
    await supabase.from("profiles").update({ passwort_neu: false }).eq("id", userId).eq("passwort_neu", true);
    await neuLaden();
    if (istMobil() && !laeuftAlsApp()) {
      setLaeuft(false);
      return setFertig(true);
    }
    toast.success("Neues Passwort gespeichert — du bist angemeldet.");
    navigate("/", { replace: true });
  };

  if (fertig) {
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold" data-pruef="passwort-gespeichert">Neues Passwort gespeichert</h1>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">
          Hast du die App auf dem Startbildschirm? Dann jetzt dort öffnen und mit deiner E-Mail und dem neuen Passwort anmelden.
        </p>
        <Button className="mt-5 h-12 w-full" onClick={() => navigate("/", { replace: true })}>Hier im Browser weiter</Button>
      </Rahmen>
    );
  }

  if (abgelaufen) {
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold" data-pruef="link-abgelaufen">Der Link gilt nicht mehr</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Er ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an — es geht in einer Minute.
        </p>
        <Button asChild className="mt-5 h-12 w-full"><Link to="/auth?modus=vergessen" replace>Neuen Link anfordern</Link></Button>
        <Button asChild variant="ghost" className="mt-2 h-12 w-full"><Link to="/auth" replace>Zur Anmeldung</Link></Button>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      <form onSubmit={speichern} className="space-y-4" data-pruef="passwort-neu">
        <KeyRound className="h-9 w-9 text-primary" />
        <h1 className="text-xl font-semibold">Neues Passwort festlegen</h1>
        <div className="space-y-2">
          <Label htmlFor="neu-passwort">Neues Passwort</Label>
          <PasswortFeld id="neu-passwort" autoComplete="new-password" autoFocus />
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={laeuft}>
          {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Speichern und anmelden
        </Button>
      </form>
    </Rahmen>
  );
}
