/**
 * Adressen und Schlüssel der Testumgebung für die Playwright-Grundtests (tests/roboter/*.spec.ts).
 * Kein Test selbst. Läuft NUR gegen die lokale Testumgebung (testumgebung.mjs start + daten) —
 * nie gegen SETECs echte Datenbank: alles, was nicht 127.0.0.1/localhost ist, bricht ab.
 *
 * Reihenfolge: TEST_API_URL / TEST_ANON_KEY / TEST_SERVICE_KEY / TEST_APP_URL aus der Umgebung,
 * sonst `testumgebung.mjs status` (Platz N → API 55N00, App 55N10). Schlüssel stehen nie im Repo.
 */
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WERKZEUG = path.join(os.homedir(), "Developer", "_baukasten", "werkzeuge", "roboter", "testumgebung.mjs");

export type Umgebung = { api: string; anon: string; service: string; app: string; port: number };

function ausStatus(): Partial<Record<string, string>> {
  try {
    const aus = execFileSync("node", [WERKZEUG, "status"], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const werte: Record<string, string> = {};
    for (const m of aus.matchAll(/^\s+(API_URL|ANON_KEY|SERVICE_ROLE_KEY|App-Port)\s+(\S+)/gm)) werte[m[1]] = m[2];
    return werte;
  } catch {
    return {};
  }
}

export function umgebung(): Umgebung {
  let { TEST_API_URL: api, TEST_ANON_KEY: anon, TEST_SERVICE_KEY: service, TEST_APP_URL: app } = process.env;
  if (!api || !anon || !service) {
    const s = ausStatus();
    api ||= s.API_URL;
    anon ||= s.ANON_KEY;
    service ||= s.SERVICE_ROLE_KEY;
    if (!app && s["App-Port"]) app = `http://127.0.0.1:${s["App-Port"]}`;
  }
  if (!api || !anon || !service) {
    throw new Error("Keine Testumgebung: erst `node ~/Developer/_baukasten/werkzeuge/roboter/testumgebung.mjs start` (und `daten`) im Projektordner.");
  }
  const lokal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/;
  if (!lokal.test(api)) throw new Error("Grundtests laufen nur gegen die lokale Testumgebung, nie gegen die echte Datenbank.");
  if (!app) {
    const port = Number(new URL(api).port || 0) + 10;
    app = `http://127.0.0.1:${port}`;
  }
  if (!lokal.test(app)) throw new Error("Die App für die Grundtests muss lokal laufen.");
  // An die Arbeiter-Prozesse weiterreichen (die Konfiguration läuft in jedem Prozess neu).
  Object.assign(process.env, { TEST_API_URL: api, TEST_ANON_KEY: anon, TEST_SERVICE_KEY: service, TEST_APP_URL: app });
  return { api, anon, service, app, port: Number(new URL(app).port) };
}
