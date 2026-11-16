/**
 * Schriftgröße je Gerät (Wunsch SETEC 16.11.2026: Monteure mit großen Fingern).
 * Vorbild Steinbrecher („Normal / Groß / Sehr groß / Extra groß“).
 *
 * Wirkt über `data-schrift` am <html>: index.css setzt damit die
 * Grundschrift (1rem). Weil Schrift, Knöpfe und Abstände in rem gerechnet sind,
 * wächst alles mit. Gemerkt wird die Wahl im Gerät (localStorage) — ein kleines
 * Skript in index.html setzt sie, bevor die App startet (kein Springen).
 * Werte hier und in index.css/index.html gleich halten (Test prüft das).
 */
export type Schriftgroesse = "normal" | "gross" | "sehr_gross" | "extra_gross";

export const SCHRIFT_KEY = "setec.schrift";

export const SCHRIFTGROESSEN: readonly { wert: Schriftgroesse; name: string; px: number }[] = [
  { wert: "normal", name: "Normal", px: 16 },
  { wert: "gross", name: "Groß", px: 17 },
  { wert: "sehr_gross", name: "Sehr groß", px: 18.5 },
  { wert: "extra_gross", name: "Extra groß", px: 20 },
];

export const istSchriftgroesse = (w: unknown): w is Schriftgroesse => SCHRIFTGROESSEN.some((s) => s.wert === w);

export function schriftLesen(): Schriftgroesse {
  try {
    const w = localStorage.getItem(SCHRIFT_KEY);
    return istSchriftgroesse(w) ? w : "normal";
  } catch {
    return "normal";
  }
}

/** Sofort anwenden und im Gerät merken (privates Fenster: wirkt bis zum Neuladen) */
export function schriftSetzen(w: Schriftgroesse): void {
  if (w === "normal") delete document.documentElement.dataset.schrift;
  else document.documentElement.dataset.schrift = w;
  try {
    if (w === "normal") localStorage.removeItem(SCHRIFT_KEY);
    else localStorage.setItem(SCHRIFT_KEY, w);
  } catch { /* gesperrter Speicher: nur für jetzt */ }
}
