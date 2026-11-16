import { describe, expect, it } from "vitest";
import { adressAnfrage, hausnummerAus, photonLesen, photonUrl } from "./adresse";

const f = (p: Record<string, unknown>, c: [number, number] = [15.4, 47.5]) => ({ properties: p, geometry: { coordinates: c } });

describe("Adress-Vorschläge", () => {
  it("Hausnummer aus der Eingabe", () => {
    expect(hausnummerAus("Hauptstraße 10a")).toBe("10a");
    expect(hausnummerAus("Wiener Straße 3 / 5")).toBe("3/5");
    expect(hausnummerAus("Hauptstraße")).toBe("");
  });
  it("Antwort lesen: nur Österreich, mit PLZ und Ort, ohne Doppelte", () => {
    const antwort = {
      features: [
        f({ countrycode: "AT", type: "house", street: "Wiener Straße", housenumber: "5", postcode: "8644", city: "Kindberg", district: "Mürzhofen" }),
        f({ countrycode: "AT", type: "house", street: "Wiener Straße", housenumber: "5", postcode: "8644", city: "Kindberg" }),
        f({ countrycode: "DE", type: "house", street: "Wiener Straße", housenumber: "5", postcode: "10999", city: "Berlin" }),
        f({ countrycode: "AT", type: "house", street: "Hauptstraße", housenumber: "1", city: "Kindberg" }),
        f({ countrycode: "AT", type: "house", street: "Grazer Straße", housenumber: "2", postcode: "8605", city: "Kapfenberg", district: "Katastralgemeinde Kapfenberg" }),
      ],
    };
    expect(photonLesen(antwort)).toEqual([
      { strasse: "Wiener Straße 5", plz: "8644", ort: "Kindberg", zusatz: "Mürzhofen", lat: 47.5, lng: 15.4 },
      { strasse: "Grazer Straße 2", plz: "8605", ort: "Kapfenberg", zusatz: "", lat: 47.5, lng: 15.4 },
    ]);
  });
  it("Straße ohne Hausnummer behält die getippte", () => {
    const antwort = { features: [f({ countrycode: "AT", type: "street", name: "Bahnhofstraße", postcode: "8650", city: "Kindberg" })] };
    expect(photonLesen(antwort, "Bahnhofstr 12")[0].strasse).toBe("Bahnhofstraße 12");
  });
  it("getippter Ort muss passen — keine gleichnamige Straße im Nachbarort", () => {
    const antwort = { features: [
      f({ countrycode: "AT", type: "house", street: "Schulgasse", housenumber: "2", postcode: "8650", city: "Kindberg" }),
      f({ countrycode: "AT", type: "house", street: "Wiener Straße", housenumber: "5", postcode: "8680", city: "Mürzzuschlag" }),
    ] };
    expect(photonLesen(antwort, "Schulgasse 2 Mürzzuschlag")).toEqual([]);
    expect(photonLesen(antwort, "Wiener Str 5 Mürzzu").map((a) => a.ort)).toEqual(["Mürzzuschlag"]);
    expect(photonLesen(antwort, "Schulgase 2 Kindbreg").map((a) => a.ort)).toEqual(["Kindberg"]);
    expect(photonLesen(antwort, "Schulgasse 2 8650").map((a) => a.ort)).toEqual(["Kindberg"]);
  });
  it("Unsinn ergibt nichts", () => {
    expect(photonLesen(null)).toEqual([]);
    expect(photonLesen({ features: "x" })).toEqual([]);
  });
  it("Anfrage erst ab 4 Zeichen", () => {
    expect(adressAnfrage(" Ha ")).toBe("");
    expect(adressAnfrage("Hauptstraße  10")).toBe("Hauptstraße 10");
    expect(photonUrl("a b")).toContain("q=a%20b");
  });
});
