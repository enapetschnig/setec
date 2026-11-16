/**
 * Anmelden mit Benutzernamen statt E-Mail: „max“ → max@<loginDomain>.
 * Supabase verlangt eine gültige E-Mail-Adresse — Umlaute und Leerzeichen
 * gehen dort nicht. Deshalb wird aus „Jürgen Maier“ der Benutzername
 * „juergen.maier“; Anmelden und Registrieren rechnen gleich.
 */
export function benutzername(eingabe: string): string {
  return eingabe
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, ".");
}

/** Echte E-Mail-Adressen bleiben, wie sie sind (nur klein, ohne Leerzeichen) */
export function zuEmail(eingabe: string, domain: string): string {
  const e = eingabe.trim().toLowerCase();
  return e.includes("@") ? e : `${benutzername(e)}@${domain}`;
}

/** Fehlertext für einen Benutzernamen, der so nicht geht — sonst null */
export function benutzerFehler(eingabe: string): string | null {
  const e = eingabe.trim();
  if (!e) return "Bitte einen Benutzernamen eingeben.";
  if (e.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : "Diese E-Mail-Adresse stimmt nicht.";
  const b = benutzername(e);
  if (b.length < 2) return "Der Benutzername braucht mindestens 2 Zeichen.";
  if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(b) || b.includes("..")) {
    return "Im Benutzernamen gehen nur Buchstaben, Ziffern, Punkt und Bindestrich.";
  }
  return null;
}

/** Fehlertext für eine E-Mail-Adresse, die so nicht geht — sonst null */
export function emailFehler(eingabe: string): string | null {
  const e = eingabe.trim().toLowerCase();
  if (!e) return "Bitte deine E-Mail-Adresse eintragen.";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return "Diese E-Mail-Adresse stimmt so nicht — bitte noch einmal ansehen.";
  return null;
}

/** Häufige Tippfehler im Mail-Anbieter („gmial.com“) → Vorschlag, sonst null */
const ANBIETER = ["gmail.com", "gmx.at", "gmx.net", "gmx.de", "icloud.com", "outlook.com", "hotmail.com", "yahoo.com", "aon.at", "a1.net", "live.at", "web.de", "me.com"];
export function emailVorschlag(eingabe: string): string | null {
  const e = eingabe.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const domain = e.slice(at + 1);
  if (!domain || ANBIETER.includes(domain)) return null;
  const abstand = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  };
  const treffer = ANBIETER.find((a) => abstand(domain, a) <= (a.length > 7 ? 2 : 1));
  return treffer ? `${e.slice(0, at)}@${treffer}` : null;
}

/** Meldungen von Supabase Auth auf Deutsch — Unbekanntes bleibt, wie es ist */
export function authFehler(meldung: string): string {
  const m = meldung.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-Mail (bzw. Benutzername) oder Passwort falsch.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Mit dieser E-Mail-Adresse gibt es schon ein Konto.";
  if (m.includes("should be different from the old password")) return "Das neue Passwort muss sich vom alten unterscheiden.";
  if (m.includes("password should be at least")) return "Das Passwort braucht mindestens 6 Zeichen.";
  if (m.includes("unable to validate email") || m.includes("invalid format")) return "Benutzername oder E-Mail-Adresse ungültig.";
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("for security purposes")) {
    return "Zu viele Versuche — bitte kurz warten und dann noch einmal.";
  }
  if (m.includes("otp_expired") || m.includes("token has expired") || m.includes("invalid or has expired") || m.includes("email link is invalid")) {
    return "Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) return "Keine Verbindung — bitte Netz prüfen und noch einmal versuchen.";
  return meldung;
}

/** Vorläufiges Passwort zum Ansagen: gut zu sprechen, keine verwechselbaren Zeichen */
export function vorlaeufigesPasswort(zufall: () => number = Math.random): string {
  const woerter = ["Strom", "Kabel", "Leitung", "Schalter", "Dose", "Zaehler", "Sicherung", "Lampe"];
  const wort = woerter[Math.floor(zufall() * woerter.length)];
  return `${wort}-${String(1000 + Math.floor(zufall() * 9000))}`;
}
