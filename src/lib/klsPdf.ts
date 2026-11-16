import { supabase } from "@/integrations/supabase/client";
import {
  FUSS_PLATZ, RAND, bildAlsDataUri, briefkopf, datenBlock, empfaengerBlock, fmtDatum, fmtMenge, fusszeilen,
  pdfDateiname, pdfLaden, pdfTeilenOderLaden, platzPruefen, titelZeile,
} from "@/lib/pdfBasis";
import type { Firma } from "@/lib/types";
import { pdfText } from "@/components/regie/regieLogik";
import { KLS_BUCKET, type KlsVoll } from "@/components/kundenlieferschein/klsDaten";
import { zeitpunkt } from "@/lib/regiePdf";

/**
 * Kunden-Lieferschein als PDF: Briefkopf, Kunde, Ausgabe und Retour je als
 * Tabelle OHNE Preise (die stehen auf der Rechnung), Unterschrift des Kunden.
 */

const letztesY = (pdf: unknown) => (pdf as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function klsPdfErstellen(l: KlsVoll, firma: Firma): Promise<Blob> {
  const { pdf, autoTable } = await pdfLaden();
  const bw = pdf.internal.pageSize.getWidth();
  const entwurf = l.status !== "fertig";

  const bildLaden = (async () => {
    if (!l.unterschrift_pfad) return null;
    const { data } = await supabase.storage.from(KLS_BUCKET).createSignedUrl(l.unterschrift_pfad, 300);
    return data?.signedUrl ? bildAlsDataUri(data.signedUrl) : null;
  })();

  let y = await briefkopf(pdf, firma);
  const yKopf = y + 3;
  const yLinks = empfaengerBlock(pdf, {
    name: pdfText(l.empf_name || "–"),
    strasse: pdfText(l.empf_strasse),
    plz: l.empf_plz,
    ort: pdfText(l.empf_ort),
  }, yKopf);
  const yRechts = datenBlock(pdf, [
    ["Lieferschein", l.nummer ?? "Entwurf"],
    ["Datum", fmtDatum(l.datum)],
  ], yKopf);
  y = Math.max(yLinks, yRechts) + 8;
  y = titelZeile(pdf, `Lieferschein ${l.nummer ?? "(Entwurf)"}`, firma, y);

  const tabelle = {
    theme: "plain" as const,
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    styles: { font: "helvetica", fontSize: 9.5, textColor: [0, 0, 0] as [number, number, number], cellPadding: { top: 1.7, bottom: 1.7, left: 1.5, right: 1.5 } },
    headStyles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [215, 215, 215] as [number, number, number] },
  };
  const abschnitt = (titel: string) => {
    y = platzPruefen(pdf, y, 22);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(0, 0, 0);
    pdf.text(titel, RAND, y);
    y += 5.5;
  };
  const zeilen = [...l.kunden_lieferschein_positionen].sort((a, b) => a.pos - b.pos);
  for (const [titel, liste] of [
    ["Geliefert", zeilen.filter((z) => !z.retour)],
    ["Retour (zurückgenommen)", zeilen.filter((z) => z.retour)],
  ] as const) {
    if (!liste.length) continue;
    abschnitt(titel);
    autoTable(pdf, {
      ...tabelle,
      startY: y - 1,
      head: [["Menge", "Einheit", "Bezeichnung", "Art.-Nr."]],
      body: liste.map((z) => [fmtMenge(Number(z.menge)), pdfText(z.einheit), pdfText(z.bezeichnung), pdfText(z.artikelnummer ?? "")]),
      columnStyles: { 0: { cellWidth: 20, halign: "right" }, 1: { cellWidth: 18 }, 3: { cellWidth: 34 } },
      didParseCell: (d) => { if (d.section === "head" && d.column.index === 0) d.cell.styles.halign = "right"; },
    });
    y = letztesY(pdf) + 7;
  }

  if (l.notiz?.trim()) {
    abschnitt("Hinweis");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    for (const z of pdf.splitTextToSize(pdfText(l.notiz.trim()), bw - 2 * RAND) as string[]) {
      y = platzPruefen(pdf, y, 6);
      pdf.text(z, RAND, y);
      y += 4.6;
    }
    y += 4;
  }

  // Übernahme durch den Kunden — als Block, nie über den Seitenumbruch
  y = platzPruefen(pdf, y, 46);
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text("Ware übernommen", RAND, y);
  y += 4.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 90, 90);
  pdf.text("Die angeführte Ware wurde vollständig und in einwandfreiem Zustand übernommen bzw. zurückgegeben.", RAND, y);
  pdf.setTextColor(0, 0, 0);
  y += 3;
  const feldB = 75;
  const feldH = 25;
  const bild = await bildLaden;
  if (bild) {
    const f = Math.min(feldB / bild.w, feldH / bild.h);
    try { pdf.addImage(bild.uri, "PNG", RAND, y + (feldH - bild.h * f), bild.w * f, bild.h * f, undefined, "FAST"); } catch { /* ohne Bild weiter */ }
  }
  y += feldH + 1.5;
  pdf.setDrawColor(90, 90, 90);
  pdf.setLineWidth(0.3);
  pdf.line(RAND, y, RAND + feldB + 5, y);
  y += 4;
  pdf.setFontSize(8.5);
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    l.unterschrift_pfad ? pdfText(`${l.unterschrift_name || "Kunde"} · unterschrieben am ${zeitpunkt(l.unterschrieben_am)}`) : entwurf ? "Entwurf — noch nicht abgeschlossen" : "Unterschrift Kunde",
    RAND, y, { maxWidth: feldB + 25 },
  );
  pdf.text(pdfText(firma.name), bw - RAND, y, { align: "right" });
  pdf.setTextColor(0, 0, 0);

  fusszeilen(pdf, firma);
  return pdf.output("blob");
}

export const klsPdfDateiname = (l: Pick<KlsVoll, "nummer" | "empf_name" | "status">) =>
  pdfDateiname("Lieferschein", l.nummer, l.empf_name, l.status === "fertig" ? null : "Entwurf");

/** Am Handy über das Teilen-Menü, am PC herunterladen */
export async function klsPdfTeilen(l: KlsVoll, firma: Firma) {
  await pdfTeilenOderLaden(await klsPdfErstellen(l, firma), klsPdfDateiname(l));
}

/**
 * Zum Drucken im Browser öffnen. Das Fenster muss VOR dem Erzeugen geöffnet
 * werden (`window.open` direkt im Klick), sonst blockt der Popup-Blocker.
 */
export async function klsPdfAnsehen(l: KlsVoll, firma: Firma, fenster: Window | null) {
  const blob = await klsPdfErstellen(l, firma);
  if (!fenster || fenster.closed) {
    await pdfTeilenOderLaden(blob, klsPdfDateiname(l));
    return;
  }
  const url = URL.createObjectURL(blob);
  fenster.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
