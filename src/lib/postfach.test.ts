import { describe, expect, it } from "vitest";
import { adresseKopf, base64Bytes, base64url, kopfKodieren, mailBauen } from "../../supabase/functions/_shared/mime.ts";
import {
  anhaengeFinden, eigeneRechnung, fehlerDeuten, lieferantZuordnen, nummerSchluessel, type GmailTeil,
} from "../../supabase/functions/_shared/postfach.ts";

const dekodiert = (kopf: string) => kopf.split(/\r\n /).map((w) => {
  const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/);
  return m ? new TextDecoder().decode(base64Bytes(m[1])) : w;
}).join("");

describe("Betreff nach RFC 2047", () => {
  it("lässt ASCII, wie es ist", () => {
    expect(kopfKodieren("Rechnung 2026-0001")).toBe("Rechnung 2026-0001");
  });
  it("kodiert Umlaute und kommt verlustfrei zurück", () => {
    const t = "Angebot 2026-0012 – Photovoltaik Größe 9 kWp · SETEC GmbH Kindberg-Mürzhofen €";
    const k = kopfKodieren(t);
    expect(k).toMatch(/^=\?UTF-8\?B\?/);
    for (const w of k.split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
    expect(dekodiert(k)).toBe(t);
  });
  it("schneidet kein UTF-8-Zeichen durch und entfernt Zeilenumbrüche", () => {
    const t = "€".repeat(40) + "\r\nBcc: x@y.at";
    expect(dekodiert(kopfKodieren(t))).toBe("€".repeat(40) + " Bcc: x@y.at");
  });
  it("Absender mit Namen", () => {
    expect(adresseKopf("office@setec.at", "SETEC GmbH")).toBe('"SETEC GmbH" <office@setec.at>');
    expect(adresseKopf("a@b.at", 'Böse"<x>')).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.at>$/);
    expect(adresseKopf("a@b.at", "")).toBe("a@b.at");
  });
});

describe("MIME-Nachricht", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 Test");
  const m = mailBauen({
    von: "office@setec.at", vonName: "SETEC GmbH", an: ["kunde@a.at", "zwei@b.at"], betreff: "Rechnung – Müller",
    text: "Grüß Gott,\nanbei.", html: "<p>Grüß Gott</p>", grenze: "X",
    anhaenge: [{ dateiname: "Rechnung Müller.pdf", inhalt: pdf }, { dateiname: "plan.png", inhalt: new Uint8Array([1, 2, 3]) }],
    datum: new Date("2026-11-17T10:00:00Z"),
  });
  it("Kopf und Aufbau", () => {
    expect(m).toContain('From: "SETEC GmbH" <office@setec.at>\r\n');
    expect(m).toContain("To: kunde@a.at, zwei@b.at\r\n");
    expect(m).toContain('Content-Type: multipart/mixed; boundary="mix-X"');
    expect(m).toContain('Content-Type: multipart/alternative; boundary="alt-X"');
    expect(m).not.toContain("Reply-To");
    expect(m.split("\r\n\r\n")[0]).not.toMatch(/[^\x00-\x7f]/); // Kopf rein ASCII
    expect(m.trimEnd().endsWith("--mix-X--")).toBe(true);
  });
  it("Text und Anhänge base64, Dateinamen mit Umlaut", () => {
    expect(m).toContain(btoa(String.fromCharCode(...new TextEncoder().encode("Grüß Gott,\nanbei."))));
    expect(m).toContain("filename*=UTF-8''Rechnung%20M%C3%BCller.pdf");
    expect(m).toContain('Content-Type: application/pdf\r\nContent-Disposition: attachment;');
    expect(m).toContain("Content-Type: image/png");
    expect(m).toContain(btoa("%PDF-1.4 Test"));
  });
  it("lange Anhänge in Zeilen zu 76 Zeichen", () => {
    const gross = mailBauen({ von: "a@b.at", an: ["c@d.at"], betreff: "x", text: "y", anhaenge: [{ dateiname: "a.pdf", inhalt: new Uint8Array(5000) }] });
    for (const z of gross.split("\r\n")) expect(z.length).toBeLessThanOrEqual(998);
    expect(gross.split("\r\n").filter((z) => /^[A-Za-z0-9+/=]{76}$/.test(z)).length).toBeGreaterThan(50);
  });
  it("Antwort-an nur, wenn es eine andere Adresse ist", () => {
    expect(mailBauen({ von: "a@b.at", antwortAn: "chef@b.at", an: ["c@d.at"], betreff: "x", text: "y" })).toContain("Reply-To: chef@b.at\r\n");
    expect(mailBauen({ von: "a@b.at", antwortAn: "A@b.at", an: ["c@d.at"], betreff: "x", text: "y" })).not.toContain("Reply-To");
  });
  it("base64url ohne Füllzeichen", () => {
    expect(base64url("??>")).toBe("Pz8-");
  });
});

describe("Fehler von Google verständlich", () => {
  it("Freigabe fehlt", () => {
    expect(fehlerDeuten("unauthorized_client", "Client is unauthorized to retrieve access tokens using this method").grund).toBe("freigabe_fehlt");
  });
  it("falsche Adresse", () => {
    const f = fehlerDeuten("invalid_grant", "Invalid email or User ID", "x@setec.at");
    expect(f.grund).toBe("adresse");
    expect(f.text).toContain("x@setec.at");
  });
  it("Gmail API aus", () => {
    expect(fehlerDeuten("PERMISSION_DENIED", "Gmail API has not been used in project 123 before or it is disabled").grund).toBe("api_aus");
  });
});

describe("Anhänge finden", () => {
  const teil: GmailTeil = {
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "multipart/related", parts: [
        { mimeType: "text/html", body: { size: 100 } },
        { mimeType: "image/png", filename: "logo.png", headers: [{ name: "Content-ID", value: "<logo>" }], body: { attachmentId: "L", size: 12_000 } },
      ] },
      { mimeType: "application/pdf", filename: "RE-4711.pdf", body: { attachmentId: "A", size: 80_000 } },
      { mimeType: "application/octet-stream", filename: "Beleg.PDF", body: { attachmentId: "B", size: 50_000 } },
      { mimeType: "image/jpeg", filename: "foto.jpg", body: { attachmentId: "C", size: 900_000 } },
      { mimeType: "image/jpeg", filename: "klein.jpg", body: { attachmentId: "D", size: 9_000 } },
      { mimeType: "application/zip", filename: "x.zip", body: { attachmentId: "E", size: 90_000 } },
    ],
  };
  it("PDF und große Fotos, keine Logos, kein ZIP", () => {
    expect(anhaengeFinden(teil).map((a) => [a.attachmentId, a.mime])).toEqual([
      ["A", "application/pdf"], ["B", "application/pdf"], ["C", "image/jpeg"],
    ]);
  });
});

describe("Lieferant zuordnen", () => {
  const kontakte = [
    { name: "Sonepar", namen: ["Sonepar Österreich GmbH"], email: "bestellung@sonepar.at" },
    { name: "Elektro Huber", namen: [], email: "office@huber-elektro.at" },
    { name: "Rexel", namen: [], email: null },
  ];
  it("gleiche Schreibweise am Kontakt", () => {
    expect(lieferantZuordnen("sonepar  österreich gmbh", kontakte, [])).toBe("Sonepar");
  });
  it("ohne Rechtsform / beginnt damit", () => {
    expect(lieferantZuordnen("Rexel Austria GmbH", kontakte, [])).toBe("Rexel");
    expect(lieferantZuordnen("Elektro Huber GmbH & Co KG", kontakte, [])).toBe("Elektro Huber");
  });
  it("über die Absender-Domain", () => {
    expect(lieferantZuordnen("Huber Elektrotechnik", kontakte, [], "Buchhaltung <rechnung@huber-elektro.at>")).toBe("Elektro Huber");
    expect(lieferantZuordnen(null, kontakte, [], "x@gmail.com")).toBeNull();
  });
  it("bisherige Schreibweise, sonst wie gelesen", () => {
    expect(lieferantZuordnen("HORNBACH", kontakte, ["Hornbach"])).toBe("Hornbach");
    expect(lieferantZuordnen("Neuer  Händler", kontakte, [])).toBe("Neuer Händler");
  });
  it("eigene Rechnung erkennen", () => {
    expect(eigeneRechnung("SETEC GmbH", "SETEC GmbH")).toBe(true);
    expect(eigeneRechnung("Setec", "SETEC GmbH")).toBe(true);
    expect(eigeneRechnung("Sonepar", "SETEC GmbH")).toBe(false);
  });
  it("Rechnungsnummer vergleichen", () => {
    expect(nummerSchluessel(" RE 2026 / 0815 ")).toBe("re2026/0815");
  });
});
