import { describe, expect, it } from "vitest";
import { dezimalLesen, zahlLesen, zahlUngueltig } from "./format";

describe("Zahlen aus Eingabefeldern", () => {
  it("Komma und Punkt wie in Österreich", () => {
    expect(zahlLesen("1,5")).toBe(1.5);
    expect(zahlLesen("1.5")).toBe(1.5);
    expect(zahlLesen("1.250")).toBe(1250);
    expect(zahlLesen("1.250,00")).toBe(1250);
    expect(zahlLesen("12.500,50 €")).toBe(12500.5);
    expect(zahlLesen("0.250")).toBe(0.25);
    expect(zahlLesen("-1.250")).toBe(-1250);
    expect(zahlLesen(" 7,5 h")).toBe(7.5);
  });

  it("mehrere Trenner nur als Tausender", () => {
    expect(zahlLesen("1.234.567")).toBe(1234567);
    expect(zahlLesen("1,234,567")).toBe(1234567);
    expect(zahlLesen("1.234.567,89")).toBe(1234567.89);
    expect(dezimalLesen("1,2,3")).toBeNull();
    expect(dezimalLesen("1.2.3")).toBeNull();
    expect(zahlLesen("1,250")).toBe(1.25);
  });

  it("leer oder unlesbar ist 0", () => {
    expect(zahlLesen("")).toBe(0);
    expect(zahlLesen("abc")).toBe(0);
    expect(zahlLesen(null)).toBe(0);
    expect(zahlLesen(Number.NaN)).toBe(0);
    expect(zahlLesen(3.5)).toBe(3.5);
  });
});

describe("Fremdzeichen", () => {
  it("lehnt Tippfehler ab", () => {
    expect(dezimalLesen("9,8x")).toBeNull();
    expect(dezimalLesen("1o")).toBeNull();
    expect(dezimalLesen("x5")).toBeNull();
    expect(dezimalLesen("5 6a")).toBeNull();
    expect(dezimalLesen("9,8a")).toBeNull();
    expect(dezimalLesen("9,8n")).toBeNull();
    expect(dezimalLesen("9,8t")).toBeNull();
    expect(zahlUngueltig("9,8x")).toBe(true);
    expect(zahlUngueltig(" ")).toBe(false);
    expect(zahlUngueltig("9,8")).toBe(false);
    expect(dezimalLesen("1-2")).toBeNull();
    expect(dezimalLesen("12#")).toBeNull();
    expect(dezimalLesen("1,2.3.4")).toBeNull();
    expect(dezimalLesen("ca. 5")).toBeNull();
  });
  it("nimmt Zahlen mit Leerzeichen und Einheiten", () => {
    expect(dezimalLesen("1.234,5")).toBe(1234.5);
    expect(dezimalLesen("1,5")).toBe(1.5);
    expect(dezimalLesen("1.5")).toBe(1.5);
    expect(dezimalLesen("  2,5  ")).toBe(2.5);
    expect(dezimalLesen("1 234,5")).toBe(1234.5);
    expect(dezimalLesen("1 234,50 €")).toBe(1234.5);
    expect(dezimalLesen("€ 12,90")).toBe(12.9);
    expect(dezimalLesen("12,-")).toBe(12);
    expect(dezimalLesen("+3")).toBe(3);
    expect(dezimalLesen("20 %")).toBe(20);
    expect(dezimalLesen("12,5 lfm")).toBe(12.5);
    expect(dezimalLesen("12,5 m")).toBe(12.5);
    expect(dezimalLesen("3 Stk.")).toBe(3);
    expect(dezimalLesen("-")).toBeNull();
    expect(dezimalLesen("€")).toBeNull();
  });
});
