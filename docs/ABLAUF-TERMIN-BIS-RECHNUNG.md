# Ablauf: Termin → Erstaufnahme → Angebot → Projekt → Einteilung → Regie/Rechnung

Stand 17.11.2026, aus der Besprechung mit Stefan Sattler (`docs/SETEC-BESPRECHUNG-2026-11-17.md`)
und Christophs Vorgaben. Grundsatz: **ein Projekt entsteht erst, wenn wirklich gearbeitet wird**
(„sonst müllt man sich mit Projekten zu“), und **alles, was vorher erfasst wurde, ist dann schon drin**.

## Überblick

```
Anfrage (Telefon/Mail)
  └─ Kalender: Termin „Besichtigung“  (Kunde zuerst → Adresse; kein Projekt)
        └─ vor Ort: Erstaufnahme  (Notizen, Kundenwunsch, Fotos mit Beschriftung/Skizze, Messwerte)
              ├─ „Angebot erstellen“  → Angebot hängt an der Erstaufnahme, NICHT an einem Projekt
              │     └─ Annahme (online oder Chef „angenommen“)
              │           └─ Projekt wird angelegt (Nummer 2026-00xx, „In Arbeit“)
              │                 + Fotos/Skizzen/Notizen/Messwerte der Erstaufnahme im Projekt
              ├─ „Gleich Projekt“ (Kleinauftrag ohne Angebot) → wie oben, nur ohne Angebot
              └─ „Kein Auftrag“ → Erstaufnahme abgelegt
  └─ Kalender: Termin „Montage“  (Kunde → dessen laufende Projekte; Leute, Team, Geräte)
        └─ Monteur sieht am Handy „wo bin ich heute/morgen“ → Stunden, Material, Fotos, Regie
  └─ Kalender: Termin „Service“  (Kunde → Adresse; kein Projekt)
        └─ Regiebericht ohne Projekt (Arbeiten, Stunden, Material, Fotos, Unterschrift)
  └─ Rechnungen: oben „Noch nicht verrechnet“ (Regieberichte, erledigte Einsätze) → Rechnung
```

## 1. Kalender (einziger Ort zum Einteilen)

- Der bestehende **Wochenplan** (Spalten = Leute nach Gruppen, Zeilen = Tage mit Stundenleiste,
  wie Stefans „Terminplaner“) wird **der Kalender**. Gantt, Monatsblatt und der Umschalter fallen
  weg; Menüpunkt „Kalender“ (Suche findet auch „Plantafel“, „Einteilung“). `/plantafel` leitet auf `/kalender`.
- **Geräte & Fahrzeuge** als zuklappbare Spaltengruppe rechts (Steiger, Kernbohrgerät = Maschine,
  Anhänger, Autos/Busse). Ein Gerät steckt in `termine.fahrzeuge[]`; in seiner Spalte erscheinen
  alle Termine, die es nutzen. Doppelt belegt = rot markiert.
- **Termin-Art** (neu `termine.art`): `montage` (orange/Projektfarbe), `besichtigung` (weiß mit
  Rand), `service` (blau), `buero` (grau, eigene Termine). Abwesenheiten bleiben eigene Einträge
  (Urlaub/ZA grün, Krank rot) und stehen im selben Raster.
- **Neuer Termin: zuerst der Kunde** (Suche; „+ Neuer Kunde“ mit Adress-Vorschlägen), dann
  - Montage: nur **dessen** Projekte „In Arbeit“ zur Wahl, Ort = Projektadresse;
  - Besichtigung/Service: Adresse des Kunden oder eine seiner Projektadressen oder frei — **kein Projekt**;
  - Büro: ohne Kunde.
  Neu `termine.kunde_id`. Danach wie bisher Team, Leute, Geräte, Zeit.
- **Mitarbeiter**: sehen ihre Einteilung aus dem Kalender — am Handy „Heute / Morgen / Woche“
  (Startseite + Menüpunkt Kalender, nur lesen, Abwesenheiten anderer nur „abwesend“). Push bei
  Änderung bleibt; auch ein Gerätewechsel ist eine Änderung, die gemeldet wird.
- Rechte unverändert: Termine legt nur der Chef an; Monteur setzt nur den Status.
- Auf einem Termin „Besichtigung“: Knopf **„Erstaufnahme“** (öffnet die zugehörige oder legt sie an).
  Auf „Service“: Knopf **„Regiebericht“** (Kunde/Adresse/Termin vorbelegt, ohne Projekt).

## 2. Erstaufnahme (vor dem Angebot, ohne Projekt)

- Tabelle `erstaufnahmen`: Nummer `EA-2026-001`, kunde_id, Adresse (Schnappschuss), termin_id,
  Kundenwunsch (Text, z. B. „PV 10 kW mit Speicher“), Notizen, **Messwerte** (Liste Bezeichnung/
  Wert/Einheit mit Vorschlägen: Jahresverbrauch kWh, gewünschte Leistung kWp, Speicher kWh,
  Dachneigung °, Dachfläche m², Ausrichtung, Hausanschluss A, Leitungslänge m, Zählernummer …),
  Status `offen | angebot | auftrag | kein_auftrag`, projekt_id (nach Annahme), erstellt_von.
- Fotos: Tabelle `erstaufnahme_fotos` (Beschriftung, Skizze ja/nein, Reihenfolge). Gespeichert
  **gleich im Bucket `projekt-dateien` unter `ea/<erstaufnahme_id>/…`** — so müssen sie bei der
  Annahme nicht kopiert werden, nur als `dateien`-Zeilen ins Projekt eingetragen.
- **Beschriftung und Skizze**: Foto aufnehmen → mit dem Finger/Stift darauf zeichnen und
  beschriften (Vorbild `BildMarkieren`); „Skizze“ = leeres Blatt zum Zeichnen. Das Ergebnis wird
  als Bild gespeichert (Original bleibt).
- Sprache überall per `DiktatKnopf`. Am Tablet quer zweispaltig, am Handy knapp.
- Wer: Chef (meist Stefan am Tablet); Monteure dürfen Erstaufnahmen anlegen und ergänzen, wenn sie
  eine Besichtigung haben. Löschen nur der Chef.

## 3. Angebot aus der Erstaufnahme

- „Angebot erstellen“ öffnet den Beleg-Editor mit Kunde und Adresse vorbelegt, `belege.erstaufnahme_id`
  gesetzt, **ohne Projekt**. Im Editor eine aufklappbare Seitenleiste/Reiter „Erstaufnahme“ mit
  Kundenwunsch, Messwerten, Fotos (groß ansehbar) — damit man beim Kalkulieren alles sieht.
- Mehrere Angebote (Varianten) je Erstaufnahme möglich.
- **Neu für alle Angebote: kein Projekt mehr beim Speichern** (`belegSpeichern` legt keins an).
  Alte Angebote mit Projekt im Status „Angebot“ laufen weiter wie bisher.

## 4. Annahme → Projekt

- Eine Datenbank-Funktion `projekt_aus_angebot(beleg_id)` — aufgerufen vom Chef („Angebot
  angenommen“) **und** von `angebot_annehmen` (Kunde bestätigt online):
  - hat das Angebot schon ein Projekt (alte Fälle): wie bisher auf „In Arbeit“;
  - sonst: Projekt anlegen (Nummer, Name = Angebotstitel, Kunde, Adresse aus Erstaufnahme bzw.
    Angebotsanschrift, Status „In Arbeit“), `belege.projekt_id` setzen, Erstaufnahme `auftrag` +
    `projekt_id`, deren Fotos als `dateien` (Ordner „Erstaufnahme“) ins Projekt, Kundenwunsch/
    Notizen/Messwerte in die Projektbeschreibung bzw. einen Block „Erstaufnahme“ im Projekt;
    Termine der Besichtigung bekommen die projekt_id. Alles in einer Transaktion, doppelt aufrufen
    schadet nicht.
- Die anderen Angebots-Varianten derselben Erstaufnahme werden „abgelehnt“/erledigt.
- Monteure sehen im Projekt unter Fotos/Dokumente den Ordner „Erstaufnahme“ (Fotos mit Beschriftung,
  Skizzen, Messwerte) — keine Preise.

## 5. Durchführung

- Montage-Termine im Kalender (Kunde → Projekt). Monteur: Startseite „Heute/Morgen“, Navigation,
  Material laut Angebot, Stunden, Fotos, Regiebericht — wie bisher.

## 6. Regiebericht (auch ohne Projekt)

- `regieberichte.projekt_id` wird optional; dafür `kunde_id` + Adresse (Schnappschuss) +
  `termin_id`. Pflicht: Projekt **oder** Kunde.
- Am Handy vollständig: Arbeiten (Text/Sprache), Stunden je Person, **Material direkt im Bericht**
  — aus dem **Artikelkatalog suchen/scannen**, Menge, **oder reinreden** („3 Steckdosen, 20 m NYM
  3x1,5“ → KI schlägt Artikel aus dem eigenen Stamm vor, man bestätigt), freie Position ohne Artikel
  möglich; **Fotos**; **Kundenunterschrift** am Handy; danach festgeschrieben, PDF.
- Material ohne Projekt: Buchung hängt am Regiebericht (Regel „projekt_id oder regiebericht_id“),
  Lager (Bus) wird trotzdem abgebucht.
- **Verrechnen**: unter **Rechnungen** ganz oben „Noch nicht verrechnet“ — unterschriebene
  Regieberichte (mit/ohne Projekt) und erledigte, nicht verrechnete Einsätze. „Rechnung daraus“
  macht eine Rechnung mit Stunden und Material aus dem Bericht (bei mehreren Berichten desselben
  Kunden wahlweise zusammen) und setzt `rechnung_id` → festgeschrieben.

## Stolpersteine beim Bau (aus der Bestandsaufnahme)

- Kalender: Die Seitenliste **„Noch nicht eingeplant“** hing am Gantt — in den Kalender übernehmen
  (Projekte „In Arbeit“ ohne Einsatz ab heute), nicht verlieren. Migration `termine.kunde_id`
  aus `projekte.kunde_id` nachtragen, `art` für Bestand: `montage` mit Projekt, sonst `buero`.
  `termine_push` auch bei Änderung von `fahrzeuge` auslösen.
- Regie ohne Projekt: `regieberichte.projekt_id not null`, CHECK `buchung_passt` (Material verlangt
  projekt_id), Trigger `regie_nur_in_arbeit` (bei projekt_id null durchlassen), RPC
  `regie_zeiten_zuordnen` (filtert aufs Projekt), Unterschrift-Pfad `<projekt_id>/unterschriften/`
  (Alternative für Berichte ohne Projekt), `importDatenLaden(projektId)` (Variante je Regiebericht),
  `projekt_zahlen`, Nachkalkulation, Storno/Teilrechnung geben `rechnung_id` frei — alles prüfen.
  Material per Sprache: `DiktatKnopf` → `ki`/`material_vorschlag` → bestätigen (vorhanden).
- Annahme online: `angebot_annehmen` läuft als anon → `projekt_aus_angebot` security definer, nur
  über gültigen Token, `naechste_nummer('projekt')` muss dort funktionieren.
- Fotos der Erstaufnahme unter `projekt-dateien/ea/<id>/`: prüfen, ob Storage-Policies den ersten
  Pfadteil als uuid lesen — sonst eigener Präfix/Bucket.
- Messwerte hat Stefan nicht einzeln genannt → freie Liste mit Vorschlägen, kein festes Formular.

## Reihenfolge der Umsetzung

1. Kalender (Termin-Art, Kunde zuerst, Geräte-Spalten, nur noch Wochenplan, Mitarbeiter-Sicht).
2. Regiebericht ohne Projekt + Material am Handy (Katalog/Sprache) + „Noch nicht verrechnet“ unter Rechnungen.
3. Erstaufnahme + Angebot ohne Projekt + Annahme → Projekt mit allen Daten.

Jede Stufe: Migration nur ergänzend (keine Daten löschen — Echtbetrieb), Prüfungen in
`tests/rls-test.mjs` nur gegen die Testumgebung, KONZEPT.md nachziehen.
