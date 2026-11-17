import {
  BarChart3, BookOpenCheck, MessageSquarePlus, Bus, CalendarDays, FileCheck2, FileText, HandCoins, ClipboardSignature, Clock, FolderKanban, Home, Inbox, Package,
  FolderArchive, ListTodo, PackageCheck, Receipt, ScanBarcode, Settings, ShieldCheck, ShoppingCart, Smartphone, UserCog, Users, Warehouse, type LucideIcon,
} from "lucide-react";

/**
 * Alle Ziele der App an einer Stelle — Seitenleiste (PC) und die großen
 * Menü-Karten der Startseite (Handy/Tablet) lesen von hier. `nurChef`
 * blendet für Monteure aus (sie sehen nur, was sie auf der Baustelle
 * brauchen); die Datenbank sperrt dieselben Dinge
 * zusätzlich per RLS.
 */
export type NavEintrag = {
  titel: string;
  /** Unterzeile auf der Menü-Karte der Startseite */
  text: string;
  /** Unterzeile für Monteure, wenn sie dort weniger sehen als der Chef */
  textMonteur?: string;
  pfad: string;
  icon: LucideIcon;
  gruppe: "haupt" | "baustelle" | "buero" | "system";
  nurChef?: boolean;
  /** Nur im Seitenmenü am PC */
  nurPc?: boolean;
  /** Startseite am Handy: unter „Mehr“, wenn die Gruppe lang ist */
  selten?: boolean;
  /** Weitere Wörter, unter denen die Suche (Strg+K) die Seite findet */
  stichworte?: string;
};

export const NAVIGATION: NavEintrag[] = [
  { titel: "Start", text: "Übersicht", pfad: "/", icon: Home, gruppe: "haupt" },
  { titel: "Projekte", text: "Baustellen mit Fotos, Stunden, Material", nurChef: true, pfad: "/projekte", icon: FolderKanban, gruppe: "haupt", stichworte: "Baustelle Förderung Planung" },
  { titel: "Kontakte", text: "Kunden, Lieferanten, Karte", nurChef: true, pfad: "/kunden", icon: Users, gruppe: "haupt", stichworte: "Kunde Lieferant Partner Telefon Adresse Karte PV-Anlage" },
  { titel: "Angebote", text: "Schreiben, vor Ort per Sprache, nachfassen", pfad: "/angebote", icon: FileText, gruppe: "haupt", nurChef: true, stichworte: "Vorlage Kostenvoranschlag Sprache" },
  { titel: "Rechnungen", text: "Aus dem Projekt, PDF mit Bezahl-QR", pfad: "/rechnungen", icon: Receipt, gruppe: "haupt", nurChef: true, stichworte: "Teilrechnung Schlussrechnung Storno Gutschrift" },
  { titel: "Kalender", text: "Einteilen: Leute, Geräte, Besichtigungen, Urlaub", textMonteur: "Wo bin ich wann — und wer ist abwesend", pfad: "/kalender", icon: CalendarDays, gruppe: "haupt", stichworte: "Plantafel Einteilung Wochenplan Terminplaner Termin Einsatz Montage Besichtigung Service Team Bus Steiger Gerät Urlaub Krank Abwesenheit" },

  { titel: "Stunden", text: "Meine Woche und mein Monat, Stunden buchen", pfad: "/zeiten", icon: Clock, gruppe: "baustelle", stichworte: "Zeiten Arbeitszeit Zeitkonto Urlaub Krank Abwesenheit Monat" },
  { titel: "Aufgaben", text: "Wer muss was bis wann erledigen", textMonteur: "Was ich erledigen soll — abhaken", nurChef: true, pfad: "/aufgaben", icon: ListTodo, gruppe: "baustelle", stichworte: "To-do erledigen Erinnerung" },
  { titel: "Scannen", text: "Material ausfassen und zurückgeben", pfad: "/scan", icon: ScanBarcode, gruppe: "baustelle", stichworte: "Material ausfassen Strichcode Barcode Rückgabe" },
  { titel: "Regieberichte", text: "Mit Unterschrift des Kunden", pfad: "/regie", icon: ClipboardSignature, gruppe: "baustelle", stichworte: "Regie Unterschrift Arbeitsbericht" },
  { titel: "Lieferscheine", text: "Fotografieren — die KI liest mit", pfad: "/lieferscheine", icon: FileCheck2, gruppe: "baustelle", stichworte: "Wareneingang Lieferung" },
  { titel: "Lager", selten: true, text: "Bestand, Busse, was nachbestellen", nurChef: true, pfad: "/lager", icon: Warehouse, gruppe: "baustelle", stichworte: "Bestand Material Nachbestellen Regal" },
  { titel: "Fuhrpark", selten: true, text: "Busse, Steiger, Maschinen — Pickerl, Service, Schäden", nurChef: true, pfad: "/fuhrpark", icon: Bus, gruppe: "baustelle", stichworte: "Auto Fahrzeug Pickerl Service Schaden" },
  { titel: "Anlagen & Prüfungen", selten: true, text: "E-Check, Verteiler, Blitzschutz — was fällig ist", nurChef: true, pfad: "/anlagen", icon: ShieldCheck, gruppe: "baustelle", stichworte: "E-Check Prüfprotokoll Prüfung PV-Anlage Wartung" },

  { titel: "Eingangsrechnungen", text: "Rechnungen vom Großhändler prüfen, zuordnen, zahlen", pfad: "/eingang", icon: Inbox, gruppe: "buero", nurChef: true, stichworte: "Lieferantenrechnung Großhändler Überweisen Skonto Freigabe" },
  { titel: "Kunden-Lieferscheine", text: "Material an Kunden ausgeben, Retour, Unterschrift", pfad: "/kunden-lieferscheine", icon: PackageCheck, gruppe: "buero", nurChef: true, stichworte: "Lieferschein Kunde Theke Verkauf Material Sonderbestellung Retour Rücknahme Unterschrift Ausgabe" },
  { titel: "Offene Posten", text: "Wer noch zahlen muss, mahnen mit einem Tipp", pfad: "/offene-posten", icon: HandCoins, gruppe: "buero", nurChef: true, stichworte: "Mahnung mahnen Zahlung bezahlt Zahlungseingang" },
  { titel: "Dokumente", text: "Vorlagen, Zertifikate, Lohnzettel, Krankenscheine", textMonteur: "Firmendokumente, meine Lohnzettel", nurChef: true, pfad: "/dokumente", icon: FolderArchive, gruppe: "buero", stichworte: "Lohnzettel Krankenschein Vorlage Zertifikat Anmeldung Versicherung" },
  { titel: "Buchhaltung", selten: true, text: "Ein- und Ausgang, Kategorien, der Monat für den Steuerberater", pfad: "/buchhaltung", icon: BookOpenCheck, gruppe: "buero", nurChef: true, stichworte: "Steuerberater Kanzlei BMD RZL Altrechnungen Kategorie Export" },
  { titel: "Bestellungen", selten: true, text: "Beim Großhändler bestellen, Lieferung einbuchen", pfad: "/bestellungen", icon: ShoppingCart, gruppe: "buero", nurChef: true, stichworte: "Bestellen Großhändler" },
  { titel: "Artikel & Leistungen", selten: true, text: "Material und Leistungen mit Montagezeit — ein Katalog", textMonteur: "Artikelstamm, Strichcodes", nurChef: true, pfad: "/artikel", icon: Package, gruppe: "buero", stichworte: "Material Preis Datanorm Datenblatt Strichcode Leistungskatalog Leistungen Pauschale Kalkulation Montagezeit" },
  { titel: "Auswertung", selten: true, text: "Stunden, Umsatz, Nachkalkulation", pfad: "/auswertung", icon: BarChart3, gruppe: "buero", nurChef: true, stichworte: "Nachkalkulation Umsatz Statistik Lohnkosten" },

  { titel: "Mitarbeiter & Zugänge", text: "Wer Zugang hat, Rollen, Sätze — neue einladen", pfad: "/mitarbeiter", icon: UserCog, gruppe: "system", nurChef: true, stichworte: "Admin Verwaltung Benutzer Mitarbeiter Zugang Rolle Chef Monteur sperren Passwort Einladen QR Aushang SMS Lohnkosten Team" },
  { titel: "Einstellungen", text: "Betrieb, mein Konto, App", textMonteur: "Mein Konto, Passwort, App aufs Handy", pfad: "/einstellungen", icon: Settings, gruppe: "system", stichworte: "Betrieb Firma Passwort Konto Bank Logo Stundensatz Kalkulation" },
  { titel: "Änderungswünsche", text: "Sagen, was anders sein soll — und was schon umgesetzt ist", textMonteur: "Was ich gemeldet habe und was umgesetzt ist", nurChef: true, pfad: "/wuensche", icon: MessageSquarePlus, gruppe: "system", stichworte: "Änderung melden Fehler Wunsch" },
  { titel: "Handyansicht", text: "So sieht die App am Handy aus", pfad: "/handyansicht", icon: Smartphone, gruppe: "system", nurPc: true },
];

export const GRUPPEN_TITEL: Record<NavEintrag["gruppe"], string> = {
  haupt: "Übersicht",
  baustelle: "Baustelle",
  buero: "Büro",
  system: "System",
};

/** Passt der Suchtext zur Seite? Titel und Stichworte, ohne Groß/klein. */
export const navPasst = (n: NavEintrag, q: string) =>
  !q || `${n.titel} ${n.stichworte ?? ""}`.toLowerCase().includes(q.toLowerCase());

export const sichtbareNavigation = (istChef: boolean, pc = false) =>
  NAVIGATION.filter((n) => (istChef || !n.nurChef) && (pc || !n.nurPc));

/** Ist dieser Menüpunkt für die aktuelle Adresse aktiv? */
export const istAktiv = (pfad: string, jetzt: string) =>
  pfad === "/" ? jetzt === "/" : jetzt === pfad || jetzt.startsWith(pfad + "/");
