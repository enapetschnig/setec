import { describe, expect, it } from "vitest";
import { anleitungFuer, chromeLink, geraetErkennen, inAppBrowser, safariVersion } from "./installieren";
import { einladungsText, handyNummer, mailAdresse, startAdresse, whatsAppAdresse } from "./einladung";

const UA = {
  iphone26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphone18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  whatsappAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 WhatsApp/2.24",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
};

describe("geraetErkennen", () => {
  it("unterscheidet Geräte und Browser", () => {
    expect(geraetErkennen(UA.iphone26, 5)).toBe("ios-safari");
    expect(geraetErkennen(UA.iphoneChrome, 5)).toBe("ios-chrome");
    expect(geraetErkennen(UA.ipad, 5)).toBe("ios-safari");
    expect(geraetErkennen(UA.macSafari, 0)).toBe("mac-safari");
    expect(geraetErkennen(UA.android, 5)).toBe("android-chrome");
    expect(geraetErkennen(UA.samsung, 5)).toBe("android-samsung");
    expect(geraetErkennen(UA.win, 0)).toBe("pc-chrome");
    expect(geraetErkennen(UA.edge, 0)).toBe("pc-edge");
    expect(geraetErkennen(UA.firefox, 0)).toBe("pc-firefox");
  });
  it("erkennt In-App-Browser", () => {
    expect(inAppBrowser(UA.whatsappAndroid)).toBe("WhatsApp");
    expect(inAppBrowser(UA.instagram)).toBe("Instagram");
    expect(inAppBrowser(UA.iphone26)).toBeNull();
    expect(geraetErkennen(UA.instagram, 5)).toBe("inapp");
  });
});

describe("anleitungFuer", () => {
  it("iOS-Version aus Version/NN, nicht aus „iPhone OS 18_6“", () => {
    expect(safariVersion(UA.iphone26)).toBe(26);
    expect(anleitungFuer("ios-safari", false, UA.iphone26).schritte.join(" ")).toMatch(/Mehr anzeigen/);
    expect(anleitungFuer("ios-safari", false, UA.iphone18).schritte[0]).toMatch(/Unten in der Mitte/);
  });
  it("Android mit Angebot: ein Knopf; Samsung: nach Chrome", () => {
    expect(anleitungFuer("android-chrome", true).direkt).toBe(true);
    expect(anleitungFuer("android-samsung", true)).toMatchObject({ direkt: false, chromeKnopf: true });
  });
  it("Firefox am PC sagt ehrlich, dass es keine App wird", () => {
    expect(anleitungFuer("pc-firefox", false).schritte[0]).toMatch(/kann die App nicht installieren/);
  });
  it("Chrome-Link behält die Adresse", () => {
    expect(chromeLink("https://setec.handwerkapp.at/start"))
      .toBe("intent://setec.handwerkapp.at/start#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fsetec.handwerkapp.at%2Fstart;end");
  });
});

describe("einladung", () => {
  const link = startAdresse("https://setec.handwerkapp.at/");
  it("der eine Link", () => {
    expect(link).toBe("https://setec.handwerkapp.at/start");
  });
  it("Handynummer in jeder Schreibweise", () => {
    for (const n of ["0664 1234567", "0664/123 45 67", "+43 664 1234567", "0043 664 1234567", "+43 (0) 664 123-45-67", "664 1234567"]) {
      expect(handyNummer(n)).toBe("+436641234567");
    }
    expect(handyNummer("+49 151 12345678")).toBe("+4915112345678");
    expect(handyNummer("0664")).toBeNull();
    expect(handyNummer("0900 123456")).toBeNull(); // Mehrwertnummer
    expect(handyNummer("0316 123456")).toBeNull(); // Festnetz Graz
    expect(handyNummer("+1 202 5550123")).toBeNull(); // nicht freigegebenes Land
    expect(handyNummer("+386 41 123456")).toBe("+38641123456");
    expect(handyNummer("abc")).toBeNull();
  });
  it("Text, WhatsApp und Mail", () => {
    const t = einladungsText({ firma: "SETEC", link });
    expect(t).toMatch(/^Unsere SETEC-App: .*registrieren/);
    expect(t.endsWith(link)).toBe(true);
    expect(decodeURIComponent(whatsAppAdresse("A & B"))).toBe("https://wa.me/?text=A & B");
    expect(mailAdresse("Betreff", "x&y")).toBe("mailto:?subject=Betreff&body=x%26y");
  });
});
