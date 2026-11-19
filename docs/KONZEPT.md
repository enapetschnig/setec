# Elektriker-App — Konzept

Demo-App für einen Elektrobetrieb: **Chef** (Büro, Angebote, Rechnungen) und
**Monteure** (Stunden, Material, Regieberichte, Fotos). Alles hängt am
**Projekt** mit fortlaufender Nummer `2026-0001` — das Projekt entsteht aber erst
mit dem Auftrag; davor gibt es Termin, Erstaufnahme (`EA-2026-001`) und Angebot
ohne Projekt (seit 17.11.2026, Abschnitt „Erstaufnahme“). Ziel: die einfachste
Software für Elektriker — am Handy auf der Baustelle bedienbar.

> Leitlinien
> 1. **Jeder Klick ist Aufwand.** Große Knöpfe, wenige Felder, kluge Vorbelegung
>    (heute, letztes Projekt, eigener Bus). Lieber eine Funktion weniger als eine,
>    die niemand versteht.
> 2. **Nichts doppelt erfassen.** Eine Stunde aus dem Regiebericht IST die Stunde
>    in der Zeiterfassung. Ein ausgefasster Artikel landet automatisch im
>    Projektmaterial und am Ende in der Rechnung.
> 3. **Ein Mensch bestätigt.** Spracheingabe und Vorschläge füllen aus — gespeichert
>    wird erst, wenn jemand auf „Übernehmen“ tippt.
> 4. **Nichts erfinden.** Firmendaten kommen vom Betrieb (Einstellungen). Demo-Daten
>    sind als Demo erkennbar.

## Rollen

| | Chef | Monteur |
|---|---|---|
| Projekte sehen / anlegen | ✓ | ✓ |
| Projekt löschen, Projekt-Stundensatz | ✓ | – |
| Stunden | alle, auch für mehrere auf einmal | sieht alle, bucht und ändert eigene; für Kollegen als Teamleitung (`leitet_team_von`) oder als Partie im Regiebericht |
| Aufgaben | alle, anlegen für jeden | zugewiesene und selbst angelegte; Status und Kommentar |
| Mitarbeiter-Dokumente (Lohnzettel …) | alle | nur eigene; selbst hochladen: Krankenschein, Zeugnis, Führerschein, Sonstiges |
| Material ausfassen / zurückgeben / direkt aufs Projekt | ✓ | ✓ |
| Regieberichte schreiben + unterschreiben lassen | ✓ | ✓ |
| Angebote, Rechnungen, verrechnen | ✓ | – (Tabelle per RLS gesperrt) |
| Eingangsrechnungen erfassen, zuordnen, weiterverrechnen | ✓ | – (Einkaufspreise; Tabellen und Speicher per RLS gesperrt) |
| Artikelstamm pflegen, Datanorm-Import, Leistungskatalog | ✓ | nur neuen Artikel anlegen (unbekannter Strichcode) |
| Lager: Wareneingang, Inventur, Lagerorte | ✓ | Bestand sehen |
| Einstellungen Betrieb, Mitarbeiter einladen (Link/QR/SMS) / sperren, vorläufiges Passwort | ✓ | – |

`useSitzung().istChef` im Frontend, `public.ist_chef()` in der Datenbank.

**Rollen & Rechte** (18.11.2026, Stefan: „Büro, Lehrling — Rechte selbst festlegen“; Migration
`20261118120000_rollen_rechte.sql`, `lib/rechte.ts`, `components/rollen/RollenRechte.tsx`):
`profiles.rolle` bleibt die Grundstufe (chef = Büro-Zugang, monteur = Baustelle) — alle Regeln mit
`ist_chef()` gelten weiter. Darüber `rollen` (eingebaut: Chef, Büro, Monteur, Lehrling; eigene dazu)
mit `rechte[]`: rechnungen, eingang, buchhaltung, personal, mitarbeiter, einstellungen (nur Büro-Zugang)
und projekte_anlegen, stunden_andere, regie, material. `profiles.rolle_id` leer = eingebaute Rolle der
Grundstufe (bestehende Konten unverändert). Datenbank: `hat_recht(x)` in RESTRICTIVE-Regeln je
Bereich (nur `authenticated`), in den Beleg-RPCs, `passwort_setzen`, Trigger `firma_recht`
(Arbeitsfelder frei, Fibu-Felder = buchhaltung, Rest = einstellungen) und in den Edge Functions
(`hat_recht_von`). Rollen vergibt/ändert nur der volle Chef (`ist_voller_chef()`, `profil_schutz`);
„mindestens ein aktiver Chef“ zählt nur volle Chefs. Frontend: `useSitzung().darf(recht)`,
`istVollerChef`; `NavEintrag.recht`, `ProtectedRoute recht=…`.
Was die Oberfläche einem Monteur nicht zeigt, verbietet auch die Datenbank —
direkte API-Aufrufe kommen nicht weiter (Migration `20261025190000_rechte_monteur.sql`):
`rechnung_id` setzen oder lösen nur der Chef; `erstellt_von` setzt der Server,
Stunden auf einen Kollegen umbuchen nur der Chef; Projektnummer fest,
Projekt-Stundensatz nur der Chef und über 0 €; Zugang, Abgang und Inventur
(`korrektur`) nur der Chef; wer gebucht hat, bleibt; Pause nie negativ;
Gruppe im Terminplaner (`profiles.gruppe`) nur der Chef.
`tests/rls-test.mjs` prüft jede dieser Regeln mit echten Konten — auch die der
SETEC-Pakete (Lohnkosten, Angebot online als anon, Lager, Aufgaben, Dokumente).

**Konten** (`lib/konto.ts`, Migration `20261025150000_konten.sql`):
- **Anmelden mit E-Mail** (Neue registrieren sich mit E-Mail). Alte Konten
  mit Benutzername gehen weiter: „Jürgen Maier“ → `juergen.maier@<loginDomain>`
  (`zuEmail`). Meldungen von Supabase Auth übersetzt `authFehler`.
- **Der EINE Link `/start`** (16.11.2026, Christoph: „nur einen Link zur
  Anmeldung bzw. Registrierung … nicht zu kompliziert … am Anfang soll jeder
  sich registrieren können“; Migration `20261116120000_ein_link_alle_aktiv.sql`,
  `pages/Start.tsx`). Ziel des QR-Codes, der WhatsApp-/Mail-/SMS-Einladung
  UND `start_url` im Manifest (`id` bleibt `/`). Handy im Browser → „1. App
  auf den Startbildschirm“ (Anleitung je Gerät/Browser aus
  `lib/installieren.ts`, Bedienzeichen als Bild, iOS 26 über `Version/NN`;
  Android/PC-Chrome/Edge ein Knopf „App installieren“, `beforeinstallprompt`
  schon in `index.html`; Samsung/Firefox/In-App-Browser → „In Chrome
  öffnen“), „2. App öffnen und registrieren“, klein „Ohne Installation im
  Browser weiter“ / „Anmelden“. In der installierten App und am PC groß
  „Registrieren“ (`/auth?modus=registrieren`), darunter „Anmelden“; mit
  Sitzung gleich weiter auf `/`. Alte Links `/einladung/<token>` → `/start`.
- **Ein Registrierungsformular** (`components/einladung/KontoAnlegen.tsx`,
  auf `/auth`): Vorname, Nachname, E-Mail (`emailFehler`, Tippfehler-Vorschlag
  `emailVorschlag` „Meintest du …@gmail.com?“), Passwort mit Augen-Knopf.
  `signUp` (`mailer_autoconfirm`), sofort angemeldet; schon registriert →
  mit demselben Passwort anmelden (Doppeltipp). **Jedes neue Konto ist sofort
  aktiver Monteur** (`handle_new_user`, ohne Ausnahme — Chef-Adressen im Trigger wären ein Loch, weil E-Mails nicht bestätigt werden; Migration `20261116130000`) —
  die Freischaltung kommt später wieder. Chef-Rolle, Team, Farbe danach unter
  Menü „Mitarbeiter & Zugänge“ (`/mitarbeiter`). **Sperren** setzt `gesperrt = true` (der
  Trigger nimmt `aktiv` weg); „Freischalten“ hebt die Sperre auf.
- **Passwort vergessen** (`/auth?modus=vergessen`): E-Mail eintragen →
  `resetPasswordForEmail` mit `redirectTo = <origin>/passwort-neu`. Gleiche
  Antwort, ob es das Konto gibt oder nicht. Versand über Resend-SMTP
  (Absender `noreply@handwerkapp.at`, Name „SETEC GmbH“, deutsche Vorlage
  in Supabase Auth: Link `{{ .RedirectTo }}?token_hash=…&type=recovery`).
  `pages/PasswortNeu.tsx` löst den Link erst beim Speichern ein
  (`verifyOtp`, dann `updateUser`) — Link-Scanner im Postfach verbrauchen ihn
  nicht; scheitert nur das Speichern, gilt der eingelöste Link für den nächsten Versuch;
  benutzt/abgelaufen → „Neuen Link anfordern“; am Handy im Browser zum Schluss „App öffnen
  und anmelden“ (die iPhone-Home-App hat eigenen Speicher). `main.tsx` leitet einen nackten
  `?token_hash=…&type=recovery` (Ersatz-`site_url`) auf `/passwort-neu` um. Konten ohne echte
  E-Mail (Benutzername): der Chef vergibt ein vorläufiges Passwort
  (`passwort_setzen()`), `passwort_neu` verlangt beim nächsten Anmelden ein
  eigenes (`ProtectedRoute` → `ChangePasswordDialog forced`).
- **Einladen** (Menü „Mitarbeiter & Zugänge“ (`/mitarbeiter`), `components/einladung/Einladungen.tsx`):
  Link `KUNDE.appAdresse + /start` mit QR-Code, „Aushang drucken“
  (`/aushang`, eine A4-Seite), WhatsApp, E-Mail, Kopieren, Teilen und
  **per SMS**: Edge Function `einladung-sms` (nur Chef, fester Text ohne
  Umlaute + Link, Twilio von der Nummer `TWILIO_FROM` — Absendername
  „SETEC“ lehnt Twilio für das Konto ab; nur Handynummern AT + Nachbar-/Herkunftsländer
  (`HANDY` in `lib/einladung.ts` und in der Funktion), Drossel 3 je Nummer/40 je Tag
  atomar über `sms_platz()`, Protokoll `sms_einladungen`; Secrets `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `APP_URL`). Abgelöst: Firmen-Link
  mit Token, persönliche Einladungen, Freischaltung.

## Datenmodell (supabase/migrations/20261025100000_elektriker_grundschema.sql)

| Tabelle | Zweck |
|---|---|
| `firma` | genau eine Zeile: Briefkopf, Bank, Stundensatz, Materialaufschlag, Texte |
| `profiles` | Mitarbeiter: Vorname, Nachname, `rolle` chef/monteur, `aktiv`, Farbe |
| `kunden` | Kontakte, `nummer` ab 1001; `art` kunde/lieferant/partner, Lage `lat`/`lng` (siehe „Kontakte“) |
| `projekte` | `nummer` 2026-0001 (Trigger), `status` angebot/aktiv/verrechnen/abgeschlossen (Pille auf Kachel, Liste und im Projekt antippen = umstellen, `ProjektStatusWahl`), Baustellenadresse, optional eigener Stundensatz. Gebucht (Stunden, Ausfassen/direkt, Regie) wird nur bei „aktiv“ = In Arbeit — Trigger `nur_in_arbeit_buchen`; Garantiestunden gehen auch danach, Rückgaben immer |
| `zeiten` | Stunden je Mitarbeiter, Projekt optional; `regiebericht_id`, `rechnung_id` |
| `artikel` | Artikelstamm; Preise **je Einheit**; `ean`; `lagerartikel`, `mindestbestand`; `aufschlag` (eigener Aufschlag %, sonst der des Betriebs) |
| `artikel_dateien` | Bilder und Datenblätter je Artikel (`art` bild/datenblatt/sonstiges), Bucket `projekt-dateien`, Pfad `artikel/<id>/…`; Hauptbild = ältestes Bild |
| `artikel_lieferanten` | weitere Lieferanten je Artikel (Name als Text wie `artikel.lieferant`, Nr., Liste, Rabatt, EK, Lieferzeit, `bevorzugt`); nur Chef |
| `artikel_lagerplaetze` | Lagerplatz („Regal 3, Fach B“) je Artikel und Lagerort; Monteur nur im eigenen Bus |
| `artikel_codes` | weitere Strichcodes (Karton = `menge` Stück, gelernte Codes) |
| `leistungen` + `leistung_material` | Leistungskatalog: „Steckdose UP komplett“ = Material + `minuten` |
| `lagerorte` | Hauptlager, Fahrzeuge (`art` = fahrzeug, `user_id` = wessen Bus) |
| `material_buchungen` | **eine** Tabelle für Lager und Projekt (siehe unten) |
| `regieberichte` | Datum, Arbeiten, Unterschrift (Bild im Storage), `rechnung_id` |
| `belege` + `beleg_positionen` | Angebot/Rechnung; Positionen mit `art` titel/leistung/artikel/arbeit/material/pauschale/text |
| `dateien` | Fotos/Dokumente je Projekt (Bucket `projekt-dateien`); `planung` = steht oben unter „Planung“ |
| `projekt_verlauf` | je Projekt: WhatsApp an den Kunden (Text, Nummer), Förderschritte (Trigger), Notizen |
| `mitarbeiter_saetze` | Lohnkosten und Verrechnungssatz je Person mit `gueltig_ab` — nur der Chef (RLS) |
| `termine` | Kalender und Einsätze; `mitarbeiter uuid[]`, `status` geplant/begonnen/erledigt, `dringend`, `geaendert_am` (Trigger, nur bei Zeit, Ort, Personen) |
| `abwesenheiten` | Urlaub, Krank, Arzt, Berufsschule, Zeitausgleich, Sonstiges je Person; `status` beantragt/genehmigt/abgelehnt |
| `fibu_uebergaben` + `fibu_uebergabe_belege` | Was an die Kanzlei ging, je Beleg einmal; zurücknehmen löscht die Übergabe |
| `rechnung_kategorien` | Kategorien für Ausgangs- und Eingangsrechnungen (`belege.kategorie_id`, `eingangsrechnungen.kategorie_id`); `belege.altbestand` = Altrechnung |
| `kreditor_konten` | Kreditorennummer je Lieferant (ab 30001), einmal vergeben; an den Belegen bleibt der Lieferant freier Text, der Lieferanten-Kontakt findet sie über den Namen |
| `konto_buchungen` | Korrekturen am Überstunden- und Urlaubskonto (Anfangsbestand, Auszahlung, Übertrag); nur der Chef schreibt |
| `nummernkreise` | nur über `naechste_nummer()` |

### Materialbuchungen

| art | Lager | Projekt | Pflicht |
|---|---|---|---|
| `zugang` | + | | artikel, lagerort |
| `abgang` | − | | artikel, lagerort |
| `korrektur` | ± (menge mit Vorzeichen) | | artikel, lagerort |
| `ausfassung` | − | + | projekt; lagerort wenn Artikel |
| `rueckgabe` | + | − | projekt; lagerort wenn Artikel |
| `direkt` | | + | projekt, **kein** lagerort |

`menge` ist positiv (außer `korrektur`), höchstens 99 999. Freie Positionen ohne Artikel tragen
`bezeichnung` + `einheit`. `vorgang` (uuid) gruppiert einen Scan-Durchgang.
`ek_preis` = Momentaufnahme je Einheit.

- **Rückgabe** höchstens, was am Projekt ausgefasst ist — beim Buchen frisch
  geladen, sonst sperrt die App mit Artikel und Menge. Sonst würde der Verbrauch
  negativ und die Rechnung bekäme eine Minus-Position.
- **Inventur** bucht nur Gezähltes: „Bestand laden“ füllt die Liste, gebucht
  wird erst, was gezählt oder mit „Stimmt“ bestätigt ist; die Vorschau nennt
  die ungezählten Artikel. Sonst überschriebe sie still Entnahmen, die
  während des Zählens passiert sind.
- Verkaufswert einer Buchung überall über `buchungVk` (Projekt, Nachkalkulation,
  Rechnungsimport) — sonst zeigten Projekt und Rechnung nach einer
  Preisänderung verschiedene Beträge.

Views (laufen mit den Rechten des Abfragenden):
- `lagerbestand` — Bestand je `artikel_id` + `lagerort_id`
- `projekt_material` — je Projekt und Artikel: `ausgefasst`, `zurueck`, `direkt`,
  `verbraucht` (= ausgefasst − zurück + direkt), `offen` (noch nicht verrechnet).
  Material aus Regieberichten zählt beim Regiebericht, nicht hier.
- `projekt_zahlen` — je Projekt: Stunden, offene Stunden, Regieberichte (Entwurf/offen), offenes Material zum EK

### Verrechnung — die eine Regel

Verrechnet wird **an der Quelle**: `zeiten.rechnung_id`,
`material_buchungen.rechnung_id`, `regieberichte.rechnung_id`. Beim Übernehmen in
eine Rechnung setzt die App diese Spalte und schreibt die IDs in
`beleg_positionen.quelle` = `{"zeiten":[…],"material":[…],"regie":[…]}`.
Weiterverrechnete Eingangsrechnungen genauso: `eingang_anteile.rechnung_id`,
`quelle.eingang` (Storno und gelöschte Positionen geben per Trigger frei).

- Rechnung nach Angebot: Schalter „mit dem Angebot abgegolten“ — was nicht
  angehakt ist (Stunden, Material; Regieberichte nie, die sind Zusatzarbeit),
  hängt an einer Textzeile ohne Betrag (`ABGEGOLTEN_TEXT`) und gilt als
  verrechnet. Sonst stünde es im Projekt für immer als „offen“.
- Position im Entwurf gelöscht → Trigger gibt die Quellen frei
- Entwurf gelöscht → FK `on delete set null` gibt frei
- Rechnung storniert → `beleg_stornieren(id)` gibt frei (und legt die
  Stornorechnung an, siehe unten)
- Verrechnete Stunden/Buchungen und alles aus einem unterschriebenen
  Regiebericht sind **festgeschrieben** (Trigger `buchung_schutz`): nur
  `rechnung_id` darf sich noch ändern
- Fertige Rechnungen sind festgeschrieben (`beleg_schutz`, `positionen_schutz`) —
  alles, was auf dem PDF steht, auch Betreff, Texte und Fälligkeit. Danach
  ändern sich nur Status und Zahldatum (bezahlt) und die E-Mail des
  Empfängers; Projekt, Kunde und Angebot nur auf leer (wenn eines davon
  gelöscht wird). Storniert bleibt storniert, eine Stornorechnung bleibt eine
  Stornorechnung. Migrationen `20261025140000`, `20261025180000`.

### Eingangsrechnungen (`components/eingang/`, Seite `/eingang`)

Rechnungen von Großhändlern und Subunternehmern, nur der Chef
(Migration `20261027100000_eingangsrechnungen.sql`):
- `eingangsrechnungen`: Lieferant, Nummer, Datum, fällig, netto/USt/brutto,
  Art (Material, Fremdleistung, Werkzeug, Fahrzeug, Büro, Sonstiges),
  `bezahlt_am`, Foto/PDF im privaten Bucket `eingangsrechnungen`.
- **Beleg gleich sichtbar** (`components/DateiVorschau.tsx`): öffnet man eine
  Rechnung mit Foto/PDF, steht der Beleg eingebettet da — am PC links groß
  neben dem Formular, am Handy oben (⤢ = Vollbild). PDF über pdf.js (auch am
  iPhone), auch für eine gerade gewählte, noch nicht gespeicherte Datei.
  „Ansehen“ öffnet ihn weiter im neuen Tab.
- **Zuordnen** = `eingang_anteile` (Projekt, Betrag netto, Text). Eine
  Rechnung ganz auf ein Projekt oder aufgeteilt; `betrieb = true` heißt: der
  Rest gehört dem Betrieb (Lager, Werkzeug). „Zuzuordnen“ ist, was weder
  verteilt noch Betrieb ist (`eingangLogik.zuordnung`) — steht auf der
  Startseite unter „Zu erledigen“.
- Im Projekt → Belege und in der Nachkalkulation als Einkauf.
- **Ablauf** (Migration `20261110110000_eingang_freigabe_lieferscheine.sql`):
  `freigabe` offen → freigegeben (wer, wann) oder abgelehnt (mit Grund) →
  `bezahlt_am`. Überweisen geht erst nach der Freigabe (Trigger
  `eingang_freigabe`); wer Lieferant, Betrag, IBAN oder Nummer nach der
  Freigabe ändert, schickt sie zurück auf „zu prüfen“. Schon bezahlt erfasst
  (Karte, bar) gilt als geprüft. Seite `/eingang`: Zu prüfen → Zu überweisen
  (Häkchen, Skonto bis zum Skonto-Tag, `sepa.ts` erzeugt pain.001 fürs
  Banking) → Überwiesen.
- **Lastschrift** (SEPA-Mandat beim Händler, `lastschrift`/`lastschrift_tag`,
  Migration `20261116190000`): freigegeben → Reiter „Lastschrift“ statt „Zu
  überweisen“, Betrag immer abzüglich Skonto, Abbuchung ca. am Tag X ab
  Rechnungsdatum (`abbuchungAm`), „Als abgebucht markieren“ setzt `bezahlt_am`.
  Nie überfällig. Gilt je Händler: Umschalten überträgt auf seine offenen
  Rechnungen, neue Rechnungen werden wie seine letzte vorbelegt.
- **Bezahlt** (Reiter, früher „Überwiesen“): Unterfilter Überwiesen /
  Lastschrift / Bar bezahlt (`bar_bezahlt`, ausgelegt und im Büro zurück —
  Hinweis in der Belegliste für die Buchhaltung). Im gewählten Jahr **nach dem
  Zahltag** (`bezahlt_am`, Monatsbänder ebenso) — Liste, Zahl und Summe gleich.
- **Skonto läuft ab** (`?filter=skonto`, `skontoLaeuftAb`): nicht bezahlt, nicht
  abgelehnt, keine Lastschrift, Skonto in den nächsten 3 Tagen — dieselbe Regel
  wie der Punkt auf der Startseite. Summen (Fuß, Monatsbänder, Lieferant,
  Buchhaltung) zählen **abgelehnte Rechnungen nie** mit.
- **Positionen** (`eingang_positionen`): die Zeilen der Rechnung, je Zeile ein
  Projekt; „Aufteilung aus den Positionen übernehmen“ macht daraus die
  Anteile (`anteileAusPositionen`, in Cent). „Mit KI ausfüllen“ liest Kopf,
  IBAN, Skonto, Lieferscheinnummern und Positionen aus Foto oder PDF.
- **Lieferscheine** (Seite `/lieferscheine`): Monteur fotografiert am Handy,
  die KI liest Nummer und Zeilen; der Monteur sieht nur die eigenen. In der
  Eingangsrechnung schlägt die App passende Lieferscheine vor (Nummer,
  Lieferant) und gleicht Zeile für Zeile ab (`eingangLogik.abgleich`: passt /
  andere Menge / nicht geliefert / nicht verrechnet; Fracht und Zuschläge
  zählen nicht). Zugeordnet kann der Monteur ihn nicht mehr löschen.
- **Weiterverrechnen**: „Aus dem Projekt übernehmen“ zeigt freie Anteile,
  nie vorgewählt (Material daraus ist oft schon ausgefasst). Je Anteil eine
  Zeile: Einkauf + Aufschlag (Vorgabe Materialaufschlag), Material als
  Material, sonst Pauschale. Verrechnete Anteile sind fest
  (`eingang_anteil_schutz`), die Rechnung dazu lässt sich nicht löschen.

### Offene Posten und Mahnen (`components/op/`, Seite `/offene-posten`)

Nur der Chef (Migration `20261103100000_offene_posten.sql`):
- **Zahlungen** (`zahlungen`): je Rechnung beliebig viele — Zahlung, Skonto,
  Ausbuchen. „Bezahlt“ setzt nur die Datenbank: Trigger `zahlungen_status`
  rechnet die Summe; erreicht sie den Bruttobetrag, wird die Rechnung
  `bezahlt` (Zahldatum = letzte Zahlung), sonst bleibt/wird sie `offen`.
  Zahlung löschen macht sie wieder offen. Mehr als offen geht im Dialog
  nicht (Überzahlung = Gutschrift). Ältere „als bezahlt markierte“
  Rechnungen bekamen beim Umstieg eine Zahlung über den ganzen Betrag.
- **Mahnen** (`mahnungen`, je Rechnung und Stufe eine): 1 Zahlungserinnerung
  (ohne Zinsen) → 2 1. Mahnung → 3 letzte Mahnung (kündigt Eintreibung an).
  Die nächste Stufe gibt es erst, wenn die Frist der letzten vorbei ist.
  Spesen je Stufe, neue Frist und Verzugszinsen p. a. in Einstellungen →
  Mahnen (`firma.mahn_*`, `verzugszinsen`); Zinsen ab Fälligkeit tageweise
  (`opLogik.verzugszinsen`). Die Mahnung hält fest, was draufstand; das PDF
  (`lib/mahnPdf.ts`, Bezahl-QR über den Gesamtbetrag) entsteht daraus
  jederzeit gleich neu. Nur die höchste Stufe lässt sich zurücknehmen.
- Startseite: „… zu mahnen“, „… überfällig“ führen auf `/offene-posten`.

### Teil- und Schlussrechnung (`components/belege/teilrechnung.ts`)

Migration `20261103110000_teilrechnungen.sql`:
- **Teilrechnung** = Rechnung mit `teil_nr` zum Angebot (`angebot_id`).
  Angebot → Menü/Knopf „Teilrechnung“: Prozent oder Betrag netto, angelegt
  wird ein Entwurf mit einer Pauschale („1. Teilrechnung laut Angebot … 30 %
  von …“). Das Angebot wird angenommen, bleibt aber umwandelbar.
- **Schlussrechnung**: „Schlussrechnung erstellen“ (oder „Aus dem Projekt
  übernehmen“) übernimmt das ganze Angebot und je fertiger Teilrechnung eine
  Position `art = 'abzug'` (negativ, `quelle.teil`). Verrechnet an der Quelle:
  `belege.abgezogen_in` an der Teilrechnung; Trigger `teil_abzug_pruefen`
  (nur fertige, nur einmal), Position gelöscht oder Schlussrechnung storniert
  → wieder frei. Entwürfe von Teilrechnungen werden nicht abgezogen.
- **PDF**: Abzüge nicht in der Tabelle, sondern im Summenblock —
  Gesamtleistung netto/USt/brutto, je Teilrechnung brutto mit netto + USt
  darunter, Restbetrag netto, USt, „Zu zahlen“ (§ 11 Abs. 1 Z 4 UStG).
  Haftrücklass/Deckungsrücklass gibt es (noch) nicht.

### Anlagen und Prüfprotokolle (`components/anlagen/`, Seiten `/anlagen`, `/pruefungen/:id`)

Migration `20261103120000_anlagen.sql`:
- **Anlage** beim Kunden (`anlagen`, Nummer `A1`, `A2` …): Art (Elektroanlage,
  Verteiler, Blitzschutz, Notlicht, PV, Ladestation, Gerät, sonstige),
  Standort, Prüfintervall in Monaten (Vorschlag je Art), `naechste_pruefung`,
  Preis je Prüfung (nur Chef sieht ihn). Anlegen auf `/anlagen` oder in der
  Kundenkarte. Löschen nur Chef und nur ohne Protokolle.
- **QR-Aufkleber** (70 × 40 mm PDF, `lib/pruefPdf.ts`): Code = Adresse
  `/anlagen/<id>`. Scannen auf `/anlagen` oder `/scan` öffnet die Anlage.
- **Prüfprotokoll** (`pruefungen`, `PR-2026-001`): Besichtigung als Liste je
  Art (OK/Mangel/–, eigene Punkte dazu), Messungen je Stromkreis (Schutz,
  Leitung, RISO, Zs, IΔn, IΔ, tA), Erder. Netz, Messgerät und Stromkreise
  kommen aus dem letzten Protokoll der Anlage. Grenzwerte in
  `pruefLogik.ts` (RISO ≥ 1 MΩ, Zs ≤ 230 V / (k·In) mit k = 5/10/20 für
  B/C/D, FI 50–100 % von IΔn und ≤ 300 ms, Erder ≤ 50 V / IΔn) — Verstöße
  stehen sofort beim Feld, „Aus der Prüfung übernehmen“ schreibt den
  Mängeltext, das Ergebnis wird vorgeschlagen.
- **Unterschrift** wie beim Regiebericht (`KundenUnterschrift`, Bild unter
  `anlagen/unterschriften/`). Trigger `pruefung_schutz`: danach
  festgeschrieben, nur Entwürfe löschbar, Mängel brauchen Text.
  `pruefung_termin` setzt an der Anlage letzte und nächste Prüfung.
- **Verrechnen** (nur Chef): „Rechnung erstellen“ an der Anlage nimmt alle
  unterschriebenen, offenen Protokolle als Pauschale zum Anlagenpreis,
  `quelle.pruefung` → `pruefungen.rechnung_id`. Position gelöscht oder
  Rechnung storniert → wieder frei.
- Startseite (Chef): „X Anlagen zu prüfen · Y überfällig“ (fällig = in den
  nächsten 30 Tagen).

### Kontakte, PV-Anlagendaten und Karte (`components/kontakte/`, Seite `/kunden`)

Migration `20261113113000_kontakte_anlagen_karte.sql`, Logik in `kontaktLogik.ts` (getestet):
- **Kontakte** = Tabelle `kunden` mit `art` Kunde / Lieferant / Partner (Subunternehmer, Planer).
  Seite „Kontakte“: Filter je Art (`?art=`), Liste oder Karte (`?ansicht=karte`). Kundenauswahl
  (`KundeWahl`) zeigt keine Lieferanten.
- **Lieferanten** bleiben an Eingangsrechnung, Lieferschein, Bestellung, Rabatt, Artikel freier Text —
  nichts davon wurde umgebaut. Der Kontakt findet seine Belege über Name + `namen` (weitere
  Schreibweisen, „Sonepar Österreich GmbH“) per `kontakt_belege(id)`: Vergleich über
  `lieferant_schluessel` (klein, Leerzeichen zusammengezogen), läuft mit RLS des Aufrufers.
  Im Kontakt Summen (Rechnungen, nicht überwiesen, bestellt) und Öffnen (`/eingang?offen=`,
  `/lieferscheine?offen=`, `/bestellungen/:id`); dazu `kundennummer_extern` und die Kreditorennummer.
  Lieferanten-Kontakte erscheinen als Vorschlag in Eingangsrechnung und Bestellung.
  Am **Artikel** (Lieferant am Artikel und „+ Lieferant“) wird der Lieferant aus den
  Lieferanten-Kontakten gewählt (`components/LieferantWahl.tsx`, „Neuer Lieferant“ gleich dort);
  gespeichert bleibt der Name als Text, ein alter Name ohne Kontakt bleibt wählbar.
- **Ansprechpersonen** je Kontakt (Lieferant, Partner): Tabelle `kontakt_personen` (Name, Aufgabe
  wie Außendienst/Innendienst, Telefon, E-Mail, Notiz; Migration `20261116180000`), Rechte wie
  `kunden`. Karte im Kontakt (`kontakte/KontaktPersonen.tsx`), Suche in Kontakte und Strg+K findet sie.
  Das Textfeld `kunden.ansprechpartner` bleibt (Rechnung, Regiebericht).
- **Adress-Vorschläge** beim Tippen der Straße (Kunde, Projekt-Baustelle, Anlage, Termin-Ort):
  `components/AdresseFeld.tsx` + `lib/adresse.ts` (getestet), Quelle Photon (OpenStreetMap, ohne
  Schlüssel, nur AT, Mürztal zuerst). Google Places bräuchte ein Google-Konto mit Abrechnung.
- **PV-Anlagendaten** an der vorhandenen Anlage (`anlagen`, Art PV — ein Kunde kann mehrere haben):
  kWp, Module, Wechselrichter, Speicher kWh + Typ, Einspeisebegrenzung % und/oder kW, Wallbox,
  Überschussregelung (ja/nein + wie), Inbetriebnahme, Zählpunkt, Überwachung (Fronius Solar.web,
  SolaX Cloud, Huawei FusionSolar, SMA, sonstige) + Link, Link PV-Planung. Links nur http(s)
  (`linkSauber`). Zu sehen in der Anlage, im Kontakt (Eckdaten + Knöpfe) und im **Projekt**
  („Anlage des Kunden“ in der Übersicht — auch für den Monteur).
- **Karte** (Leaflet + OpenStreetMap-Kacheln, erst beim Öffnen geladen): Punkt je Kontakt mit
  Lage; Farbe Projekt läuft / Kunde mit PV / Kunde / Lieferant / Partner (Status-Tokens);
  Filter PV, Speicher, Wallbox, Projekt läuft; Tippen → Eckdaten + „Öffnen“.
  Koordinaten aus Nominatim, höchstens 1 Anfrage/s (`kontaktDaten.ts`), gespeichert samt der
  gesuchten Adresse (`geo_adresse`) — neu gesucht wird nur bei geänderter Adresse: automatisch
  beim Speichern des Kontakts, für Altbestand per Knopf „Lage suchen“ auf der Karte.
  Demo: `supabase/demo/04-kontakte.sql` trägt Koordinaten direkt ein.

### Zeit und Personal (`lib/zeitkonto.ts`, `components/zeiten/`, Seite `/zeiten`)

- **Stunden buchen** (`ZeitDialog`): Dauer oder Von–Bis mit Pause; „Weiterer Block“ bucht mehrere Blöcke
  am selben Tag, je Block ein eigenes Projekt möglich (`lib/zeitBloecke.ts`: Vorschlag 30 min nach dem
  letzten Ende, Überschneidungen werden abgelehnt — auch gegen schon gebuchte Zeiten). Jeder Block wird
  eine eigene Zeile in `zeiten`. Kilometer fragt der Dialog nicht mehr ab (`zeiten.km` bleibt für Altbestand).
- **Art je Stunde** in `zeiten.art`: arbeit, fahrt, ue50, ue100, garantie. Auf der Rechnung
  bekommen Fahrzeit und Überstunden eine eigene Zeile, Überstunden kosten ×1,5 und ×2 (Preis bleibt änderbar).
  Garantie zählt fürs Konto, aber nie als offen und nie auf der Rechnung.
- **Abwesenheiten sind keine Zeitbuchungen.** Das Konto rechnet genehmigte Tage mit der Sollzeit des Tages,
  so landet Urlaub nie auf einer Rechnung. Zeitausgleich zählt nicht als Ist, er baut das Konto ab.
- **Antrag:** Monteur beantragt, Chef entscheidet (Trigger `abwesenheit_regeln`). Krankmeldung und Einträge
  vom Chef gelten sofort. Kollegen sehen über die View `abwesenheit_kalender` nur „abwesend“, nie den Grund.
- **Konto** (`kontoRechnen`): Wochenstunden gleichmäßig auf Mo–Fr, österreichische Feiertage frei, Saldo bis
  gestern, ab `profiles.konto_ab`. Urlaub je Kalenderjahr aus `urlaub_tage` plus Korrekturen.
  Wird berechnet, nicht gespeichert — nur Korrekturen stehen in `konto_buchungen`.
- **Lohnliste** (`lohnSumme`, Auswertung): CSV und Stundennachweis-PDF je Person mit Soll, Ist, Arten,
  Abwesenheit, Taggeld und Kilometergeld. Taggeld ist ein Vorschlag: über 3 h ein Zwölftel je angefangene
  Stunde von `firma.taggeld_satz`; die Sätze müssen zum Kollektivvertrag passen.
- **Interne Stunden** (`zeiten.intern`, Migration `20261113117000_personal.sql`): im Dialog „Projekt | Intern“,
  Arten aus `firma.intern_arten` (Einstellungen → Betrieb, `InterneArten.tsx`). Ein Check verbietet Projekt und
  intern zugleich; `nur_in_arbeit_buchen` lässt Stunden ohne Projekt ohnehin durch. Auswertung, Lohnliste-CSV und
  Stundennachweis zeigen „Unproduktiv“ mit Prozent (`lohnSumme` → `produktiv`/`unproduktiv`/`jeIntern`,
  `produktivProzent`).
- **Für andere buchen**: Chef und Teamleitung wählen im Dialog mehrere Personen oder ein ganzes Team
  (`PersonenWahl`); je Person und Block eine Zeile, `erstellt_von` merkt, wer gebucht hat („gebucht von …“ in der
  Liste). Der Trigger `zeit_person_schutz` erlaubt Fremdbuchungen nur Chef, Teamleitung (`teams.leiter_id` →
  `mitglieder`) und der Regie-Partie.
- **Monatsansicht** (`lib/monatsKalender.ts`, `MonatsAnsicht.tsx`): Umschalter Woche/Monat auf `/zeiten`
  (gemerkt in `localStorage`). Kalender mit Farbe je Tag (Soll erreicht / weniger / nichts / abwesend), Σ je
  Kalenderwoche, Kennzahlen Ist/Soll, Stand bis gestern, Unproduktiv; Tag antippen zeigt die Buchungen.
  Der Chef sieht unter „Alle“ eine Zeile je Person (`MonatAlle`) und öffnet daraus das Monatsblatt.

### Aufgaben (`lib/aufgaben.ts`, `components/aufgaben/`, Seite `/aufgaben`)

- Tabelle `aufgaben`: Titel, Beschreibung, `zustaendig uuid[]` (mehrere oder niemand), fällig, Priorität
  (niedrig/normal/hoch = „Dringend“), optional Projekt und Kunde, Status offen → in_arbeit → erledigt
  (`erledigt_am`/`erledigt_von` setzt der Server), Wiederholung täglich … jährlich.
- **Wiederkehrend**: beim Erledigen legt der Trigger `aufgabe_regeln` die nächste Runde an (nie in der
  Vergangenheit) und nimmt die Wiederholung vom alten Datensatz.
- **Verlauf** (`aufgabe_verlauf`): Anlegen, Statuswechsel und Änderungen schreibt `aufgabe_protokoll` lesbar
  mit; Kommentare mit Foto (Bucket `aufgaben`) schreibt jeder Beteiligte selbst.
- **Rechte**: Chef alles; Monteur sieht zugewiesene und selbst angelegte, ändert nur den Status (der Trigger
  verwirft andere Felder), bearbeitet und löscht nur, was er selbst angelegt hat.
- Startseite: „Meine Aufgaben“ zum Abhaken; Chef: „Aufgaben überfällig“ unter „Zu erledigen“. Die
  Projekt-Übersicht zeigt seine Aufgaben (`ProjektAufgaben`). Filter: Kacheln Offen/Überfällig/Erledigt/Alle,
  Person (auch „Niemand zugeteilt“), Projekt.

### Dokumente (`lib/dokumente.ts`, `components/dokumente/`, Seite `/dokumente`)

- **Firma** (`firmen_dokumente`, Bucket `firmen-dokumente`): Ordner (Vorschläge: Vorlagen, Zertifikate,
  Versicherungen, Prüfberichte, Sicherheit …), Suche ohne Umlaute, „gültig bis“ mit Hinweis „läuft ab“ /
  „abgelaufen“, Schalter „Nur für den Chef“ (Polizzen) — auch der Speicher liest nur über die Tabelle.
- **Mitarbeiter** (`personal_dokumente`, Bucket `personal`, Pfad `<user_id>/…`): Lohnzettel (mit Monat),
  An-/Abmeldung, Krankenschein, Vertrag, Zeugnis, Führerschein, Sonstiges. Chef sieht alles, jeder nur seine.
  Neuer, ungelesener Lohnzettel → Hinweis „Neu für dich“ auf der Startseite; Öffnen setzt `gelesen_am`
  (`personal_dokument_gelesen`).
- Demo: `supabase/demo/04-personal.sql` (Aufgaben, interne Stunden, Dokument-Zeilen) und
  `personal-dokumente.mjs` (DEMO-PDFs), beide am Ende von `demo-zuruecksetzen.sh`.

### Einsätze am Handy (`components/einsatz/EinsatzBereich.tsx`)

Ein Einsatz ist ein Termin mit Status. Die Startseite zeigt heute und den nächsten Arbeitstag mit Adresse, Navi,
Telefon und den Schnellwegen zu Stunden, Material und Regie. Einen Knopf „Beginnen“ gibt es nicht mehr (die
Zeit kommt aus den Stunden); „Erledigt“ setzt den Status per Trigger `termin_einsatz` und gilt nicht als
Terminänderung. Verschiebt das Büro einen Termin, sieht der Monteur beim
nächsten Öffnen „Termin geändert“; was schon gesehen wurde, merkt sich das Gerät (`elektro.termine.gesehen`).
**Mitteilungen aufs Handy** (Web-Push, Migration `20261116163000_termin_push.sql`): Jeder schaltet sie in
„Einstellungen → Mein Konto“ ein (`components/Mitteilungen.tsx`, `lib/push.ts`; iPhone nur in der installierten
Home-App, die Karte erklärt das); solange aus, zeigt die Monteur-Startseite einen dezenten Hinweis (× = 30 Tage weg).
Abo je Gerät in `push_abos` (nur eigene Zeilen, Anmelden über `push_abo_registrieren`, Abmelden löscht das Abo
des Geräts). Trigger `termine_push` (AFTER insert/update/delete) ruft per pg_net die Edge Function `termin-push`
(ohne JWT; Adresse + Geheimnis in `push_verbindung`, nur in der DB, wie `cockpit_verbindung`) — nur wenn sich Tag,
Zeit, Ort, Titel oder Personen ändern (reiner Status: nichts), an alte und neue Mitarbeiter außer dem, der
geändert hat (`auth.uid()`), und nur wenn einer davon ein Abo hat; Fehler beim Senden halten das Speichern nie
auf. Texte: „Neuer Einsatz“, „Einsatz geändert — Morgen 7:00 Huber, Kindberg – jetzt mit Max (statt …)“,
„Nicht mehr eingeteilt“, „Einsatz gestrichen“; Vergangenes schickt nichts. 404/410 löscht das Abo.
`termin-push` GET liefert den öffentlichen VAPID-Schlüssel (Secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`),
POST `{aktion:"test"}` mit JWT schickt eine Testmitteilung an die eigenen Geräte. Im Service Worker:
`public/push-sw.js` per `workbox.importScripts` (Modus prompt bleibt); Antippen holt die App nach vorne und
wechselt zur Startseite (`PushKlick`, nicht wenn etwas ungespeichert ist). Der
Chef sieht auf der Startseite Anträge und „erledigter Einsatz, noch nicht verrechnet“.
Jeder Einsatz (heute und morgen) klappt auf (`EinsatzDetails.tsx`): Projekt, Adresse mit Karte und Navigation,
Kunde mit Telefon/Mail, Notiz und Projektbeschreibung, wer noch dabei ist (mit Anruf-Knopf), Bus und Geräte,
offene Hinweise (dringend, Regieberichte ohne Unterschrift, Projekt noch im Angebot), „Ins Projekt“.

### Buchhaltung (`lib/fibu.ts`, `components/buchhaltung/`, Seite `/buchhaltung`)

Vier Reiter (`?reiter=`): **Ausgang** (unsere fertigen Rechnungen), **Eingang** (Lieferanten), **Altrechnungen**,
**Kanzlei** (die Monatsübergabe unten). Ausgang und Eingang je Monat oder Jahr: Netto, USt/Vorsteuer, Brutto,
noch offen; Balken je Kategorie (antippen = Filter), Offen/Bezahlt, Suche, CSV. Zeile antippen öffnet die
Rechnung (`/belege/:id`) bzw. die Eingangsrechnung, das Symbol daneben das Original (Archiv-PDF bzw. Foto/PDF).

- **Kategorien** (`rechnung_kategorien`, Migration `20261113118000`): pflegbar getrennt für Ausgang und Eingang
  (Kopf → „Kategorien“), mit Stichworten und optional eigenem Konto. Eine Eingangs-Kategorie trägt die Art
  (Material, Fremdleistung … = `eingangsrechnungen.kategorie`) — im Eingangsformular ersetzt die Kategorie
  das Feld „Art“. Vorschlag (`buchhaltungLogik.ts`, getestet): Eingang zuerst die letzte Kategorie desselben
  Lieferanten, sonst Stichworte in Lieferant und (KI-)Positionen; Ausgang Stichworte in Betreff, Projekt und
  Positionen. Vorschläge stehen grau mit „?“ da, „… Vorschläge übernehmen“ setzt sie. `kategorie_id` ist auch
  an fertigen Rechnungen änderbar (`beleg_schutz` lässt sie frei, steht auf keinem PDF). Trigger
  `kategorie_richtung_pruefen`: Ausgangs-Kategorie nur an `belege`, Eingangs-Kategorie nur an Eingangsrechnungen.
  Konto der Kategorie im Export: Eingang immer vor dem der Art, Ausgang nur bei 20 % (13/10 %, Reverse Charge
  behalten ihre Konten).
- **Altrechnungen** (`belege.altbestand`): Rechnungen aus dem bisherigen Programm, damit Offene Posten, Mahnen
  und Kundenhistorie stimmen. Nummer frei (nicht aus dem Nummernkreis, eindeutig wie jede Belegnummer),
  keine Positionen, offen angelegt; schon Bezahltes wird eine Zahlung. Erfassen als Tabelle zum Durchtippen
  (Enter in „Bezahlt“ der letzten Zeile = neue Zeile; Netto oder Brutto genügt) oder CSV mit wählbaren
  Spalten (UTF-8 oder Windows-1252); je Zeile optional das Original-PDF (ins Rechnungsarchiv). Unbekannte
  Kunden legt das Speichern an. `/belege/:id` zeigt statt des Editors `AltrechnungAnsicht`: Daten,
  Kategorie, Original (gleich eingebettet), Zahlungen/Ausbuchen/Mahnen (`OpKarte`), Bearbeiten, Löschen. Regeln in der Datenbank
  (`altrechnung_anlegen`, `beleg_schutz`): Nummer, Kunde, Netto + USt = Brutto > 0; nicht festgeschrieben,
  aber nie storniert, nie zurück zur normalen Rechnung; Betrag geändert → Status aus den Zahlungen neu (nicht
  unter das Bezahlte); löschen geht (samt Zahlungen und Mahnungen). **Nie in der Übergabe**: der Export
  filtert sie, `fibu_uebergeben` lehnt sie ab, der Reiter Kanzlei nennt ihre Zahl.
- **Eingangsrechnungen in der Übergabe** (seit 18.11.2026, `eingangAufteilen` in `lib/fibu.ts`): nur
  **freigegebene** (bezahlte sind es immer). Zu prüfende warten — rote Warnung „x Eingangsrechnungen im
  Zeitraum sind noch zu prüfen“; abgelehnte gehen nie (Hinweis). Aus Odoo übernommene (`odoo_import`, keine
  eigene Spalte) sind wie Altrechnungen im alten Programm verbucht: nie im Export, Zeile „… aus Odoo gehen
  nicht mit“ unter der Übergabe und im LIESMICH. `fibu_uebergeben` (security definer, prüft Chef-Zugang +
  Recht „Buchhaltung“) lehnt Odoo- und nicht freigegebene Eingangsrechnungen ab (Migration `20261118160000`).
  Offen: wird eine Rechnung erst nach der Übergabe ihres Monats freigegeben, steht sie nur in jenem Monat
  wieder als „nicht übergeben“ — dort ein zweites Mal übergeben.
- „Ausbuchen“ = `ZahlungDialog`: Zahlung (auch Teilzahlung), Skonto oder Ausbuchen (uneinbringlich). In den
  Listen heißt eine erledigte Rechnung mit Ausbuchung „Ausgebucht“ (`zahlStatus`).

Ein ZIP je Monat: Buchungen, Personenkonten, Belegliste für Excel, Original-PDFs und ein LIESMICH für die Kanzlei.
Das Format wählt der Betrieb (`firma.fibu_format`), die Konten stehen in `firma.fibu_konten` und sind nur ein
Vorschlag. Kundenkonto = 20000 + Kundennummer.

- **Quellen:** RZL „Handbuch Datenimport“ (Stand August 2026, Euro-Version, Kapitel 2 und 4); BMD „PR08/PR08A
  Verbuchen Erfassungsfile“ (Version 5.B4, variabler Satzaufbau). Die Tests in `fibu.test.ts` prüfen gegen die
  Beispiele der Hersteller. In ein echtes BMD oder RZL eingelesen wurde noch nichts: beim ersten Betrieb
  einen Probelauf mit der Kanzlei machen.
- **Steuerfälle:** normal (BMD Steuercode 03 / RZL Schlüssel = Satz), Bauleistung an Kunden (17 / Sondercode 14),
  Kleinunternehmer (00 / Sondercode 22), Eingang normal (00), Eingang Bauleistung (29 / Sondercode 15).
  Stornorechnungen haben negative Beträge und gehen als Gutschrift hinaus.
- **Teil- und Schlussrechnungen** gehen als normale Rechnungen mit ihren eigenen Beträgen hinaus (die
  Schlussrechnung ist schon gekürzt). Die Teilrechnungsautomatik von BMD und RZL nutzen wir nicht; die Belegliste
  nennt die Fälle, die Kanzlei bucht bei Bedarf um.
- **Einmal übergeben:** „Als übergeben merken“ nimmt die Belege aus dem nächsten Export. Eingangsrechnungen sind
  dann gesperrt (Trigger `eingang_uebergeben_schutz`), bis die Übergabe zurückgenommen ist.
- **Kontrollliste** (`kontrolle`): warnt vor fehlendem Kunden, UID, Original, Rechnungsnummer und falschen Summen,
  vor noch zu prüfenden Eingangsrechnungen im Monat. Sie sperrt nichts, der Mensch entscheidet.

### Bestellungen beim Großhändler (`components/bestellung/`, Seite `/bestellungen`, nur Chef)

Migration `20261103130000_bestellungen.sql`:
- **Bestellung** (`bestellungen`, `BE-2026-001`) an einen Lieferanten (freier
  Text, Vorschläge aus `artikel.lieferant`), Ziel genau eines: Lagerort
  (Zugang ins Lager) oder Projekt (direkt auf die Baustelle). Positionen
  (`bestell_positionen`) sind immer Artikel aus dem Stamm, EK aus dem Stamm
  vorbelegt.
- **Neue Bestellung** — drei Wege, angelegt werden Entwürfe, je Lieferant einer:
  „Lager auffüllen“ (Mindestbestand − Bestand − schon bestellt, aufgerundet),
  „Material fürs Projekt“ (Angebot des Projekts: angenommen vor offen vor
  Entwurf; Artikel-Positionen direkt, Leistungen über `leistung_material`;
  schon für das Projekt Bestelltes zählt ab), „Leere Bestellung“. Logik in
  `bestellLogik.ts` (Tests daneben). Lager → Nachbestellen hat den Knopf
  „Bestellung anlegen“; die Pille zeigt „… bestellt“.
- **Bestellen**: PDF (Lieferadresse Betrieb oder Baustelle), CSV für den
  Webshop (Artikelnummer;Menge vorne), Text kopieren — verschickt wird
  außerhalb der App. „Als bestellt markieren“ → `bestellt_am` vom Server,
  Positionen, Lieferant und Ziel stehen fest (Trigger `bestellung_schutz`,
  `bestellpos_schutz`).
- **Wareneingang** („Lieferung einbuchen“): Menge je Position, „Alles wie
  bestellt“ oder Scannen (`artikelZuCode`, Karton-Code zählt den
  Packungsinhalt, fremde Codes: „Nicht in dieser Bestellung“). Gebucht wird
  `material_buchungen` `zugang` bzw. `direkt` mit `bestellposition_id`, ein
  Vorgang je Lieferschein. `geliefert` und der Status (bestellt →
  teilgeliefert → geliefert) rechnet der Trigger `bestellung_nachrechnen`
  aus den Buchungen — Buchung gelöscht, Stand stimmt wieder. Nur der Chef,
  nur offene Bestellungen, Artikel und Ziel müssen passen.
- **Abschließen**: „Rest kommt nicht mehr“ (`erledigt`) bei Teillieferung,
  „Stornieren“ nur, solange nichts geliefert ist. Löschen nur Entwürfe.
- Startseite (Chef): „X Bestellungen unterwegs · Y Liefertermin vorbei“.

### Kalkulieren im Angebot (`lib/kalkulation.ts`)

Bewusst einfach, kein eigenes Kalkulationsblatt:
- **Mehrere Stundensätze**: `firma.stundensaetze` (jsonb-Liste
  `{name, satz}`, Migration `20261027120000_stundensaetze.sql`), in
  Einstellungen → Kalkulation; „Standard“ ist immer der Projekt- bzw.
  Betriebssatz.
- **Arbeitszeit** (`ArbeitszeitDialog`): Stunden je Satz eintragen, jeder
  Satz wird eine Position „Arbeitszeit Meister“ usw.
- **Preis kalkulieren** in der Position: Einkauf + Aufschlag % + Minuten ×
  Stundensatz → „Als Einzelpreis übernehmen“. EK und Minuten bleiben an der
  Position (`ek_preis`, `minuten`), nie auf dem PDF.
- **Kalkulationskasten** unter den Summen (nur am Bildschirm): Stunden,
  Material-Einkauf, was nach Material bleibt und je Arbeitsstunde
  (`rohertrag`).
- **Knöpfe im Editor** nur drei: „+ Artikel“ (ein Dialog sucht Leistungen
  und Artikel zugleich, sonst freie Position), „+ Arbeitszeit“, „Diktieren“;
  Seltenes unter „Mehr“ (Titel/Raum, Hinweistext, aus Projekt/Vorlage,
  Artikel nach Kategorie, Material per KI). Jede Zeile hat vorne einen
  Griff zum Ziehen (@dnd-kit; ein Titel nimmt seinen Block mit, `ziehen`).
- **Arbeitszeit**: Satz je Rolle im Dialog änderbar, neue Rolle gleich dort
  (auf Wunsch in `firma.stundensaetze` gemerkt); im Zeilenmenü „Stundensatz
  tauschen“.
- **Nachlass** (Summenblock): eine Position `art = 'nachlass'` (% oder €,
  `prozent`), immer am Ende, Betrag rechnet `nachlassRechnen` neu; das PDF
  zeigt „Summe Positionen“ → „abzüglich Nachlass 5 %“ → Netto.
- **Zusammenstellung**: ab zwei Titeln/Räumen je Titel die Summe am Ende
  (Editor, PDF, Online-Angebot; `titelUebersicht`).
- **Mögliche Förderung** (`belege.foerderung_text/_betrag`): nur Hinweis
  im grauen Kasten „Ihre Kosten nach Förderung“, nie abgezogen.
- **Im Projekt verbraucht** (Rechnung mit Projekt, `ProjektVerbrauch`):
  Stunden je Mitarbeiter und Material je Artikel — hier, auf anderer
  Rechnung, noch offen; „Offenes übernehmen“.
- **Aufschlag je Position direkt in der Tabelle** (PC ab 1280 px): Spalten
  EK | Aufschlag % | EP netto hängen zusammen (`mitEinkauf`, `mitAufschlag`,
  `aufschlagVon` in `components/belege/editor.ts`): Aufschlag ändern →
  Preis neu; EK ändern → Aufschlag bleibt, Preis rechnet mit; freier Preis
  ohne EK → EK eintragen zeigt den Aufschlag. Arbeitsminuten bleiben im Preis.
  Spalten ausblendbar („EK/Aufschlag ausblenden“, `elektro.beleg.kalk`), kleiner
  sonst als „EK 12,34 · +35 %“ unter dem Preis; im Positionsdialog Aufschlag
  ±5 und der Preis rechnet live mit (und umgekehrt).
  „Aufschläge“ im Summenblock setzt Material-Aufschlag und Stundensatz nur
  für die angehakten Positionen (`aufschlaegeSetzen`; Arbeit nur, wo noch der alte Satz steht).
- **Material per KI** (`KiMaterialDialog`): „PV-Anlage 9 kW mit Speicher“
  sagen oder tippen → die KI schlägt Komponenten mit Menge vor, je Zeile ein
  Artikel aus dem eigenen Stamm samt Alternativen oder „Ohne Artikel“; nichts
  ist übernommen, bevor man es abhakt. Erfindet keine Artikelnummern.
- **Artikel nach Kategorie** (`KatalogDialog`, unter „Mehr“ — eine
  Option, das Angebot geht weiter ganz normal): Kacheln je Kategorie mit
  Anzahl → Hersteller und Programm (Warengruppe des Lieferanten) als Filter →
  Artikelliste mit Preis und ＋/−/Menge; gesammelt wird im Korb, „n übernehmen“
  setzt alles unter den aktiven Titel. Suche im ganzen Katalog oder in der
  Kategorie. Datanorm-Artikel ordnet `artikel_einordnen(warengruppe)` in die
  15 Kategorien der Demo-Artikel ein, `artikel_unterkategorie` macht aus
  „Euro Unitech (PG 08) Jung LS990“ „Jung LS990“; der Trigger
  `artikel_kategorie` tut das bei jedem Import. Baum: RPC `artikel_katalog()`
  (Migrationen `20261111130000`/`…131000`).
- **PDF-Vorschau live** (`LiveVorschau.tsx`, pdf.js auf Canvas): am breiten PC
  (≥ 1536 px) rechts neben dem Editor, ausblendbar (`elektro.beleg.vorschau`);
  sonst „Vorschau“ im Kopf als Vollbild — auch am Handy. Zeigt genau das PDF,
  das der Kunde bekommt, ohne zu speichern; neu gezeichnet 0,7 s nach der
  letzten Eingabe.
- **Rabatte beim Großhandel** (`rabatte`, Artikel → Rabatte, nur Chef): je
  Lieferant, optional Hersteller oder Rabattgruppe; das genaueste gewinnt.
  `rabatte_anwenden` rechnet EK = Liste − Rabatt neu (in Häppchen wegen des
  Timeouts). Artikelsuche filtert nach Hersteller (serverseitig).

### Angebote und Rechnungen (`components/belege/`)

- **Eigene Menüpunkte** `/angebote` und `/rechnungen` (`pages/Belege.tsx`,
  direkt unter Projekte; `/belege?…` leitet weiter). Kennzahlen oben sind
  zugleich Filter. Angebote: Ohne Antwort, Nachfassen (offen und gültig bis
  in ≤ 7 Tagen oder abgelaufen), Angenommen, Entwurf, In Rechnung, Abgelehnt.
  Rechnungen: Offen, Überfällig, Entwurf, Bezahlt, Storniert. Die Startseite
  verlinkt „nachfassen“ und Entwürfe direkt in den Filter.
- **Jahresansicht** (seit 17.11.2026, nach der Odoo-Übernahme 2020–2026; ein
  Bauteil `components/JahrWahl.tsx`, Logik `lib/jahre.ts`): Rechnungen,
  Angebote, Eingangsrechnungen und die Belege im Kontakt zeigen nur das
  gewählte Jahr — Standard das laufende, ältere unter „Archiv ▾“ (oder „Alle
  Jahre“), gemerkt je Seite im Browser (`setec.jahr.<seite>`). **Suche und
  Noch-zu-Tun gehen über alle Jahre** (Offen, Überfällig, Entwürfe, Ohne
  Antwort, Nachfassen, Angenommen; im Eingang Zu prüfen/überweisen,
  Lastschrift, Skonto läuft ab, Zuzuordnen; „Nicht bezahlt“/„Offen“ im Kontakt) mit Hinweis „Suche in allen
  Jahren“/„Offenes aus allen Jahren“ — so stimmt die Zahl auf der Startseite mit der Liste; Storniertes,
  Abgelehntes und „Alle“ gelten fürs gewählte Jahr nach Rechnungsdatum. **„Bezahlt“ und die Kennzahl
  „Bezahlt <Jahr>“ zählen nach dem Zahltag** (`bezahlt_am`, ohne Zahltag das Rechnungsdatum;
  `bezahltImJahr`/`zahlDatum`/`nachZahlDatum` in `lib/jahre.ts`, wieder wie vor 17.11.): eine
  Dezember-Rechnung, im Jänner bezahlt, ist Jänner-Geld — Liste, Zahl am Filter, Kennzahl und Monatsbänder
  (nach Zahlmonat) stimmen überein. Rechnungen, Kontakt (Kennzahl), Eingangsrechnungen.
  Offene Posten haben bewusst keinen Jahresfilter. Liste überall gleich
  (`MonatsListe`/`BelegZeile`): eine Karte, je Monat ein Band mit Anzahl und
  Monatssumme (ohne Entwurf/Storno/Abgelehnt), Zeile Name | Betrag, Nummer ·
  Datum, Pille rechts; am PC Spalten. Aus Odoo Übernommenes trägt ein kleines
  graues Etikett „Odoo“ (`belege.altbestand`, bei Eingangsrechnungen über
  `odoo_import`, `hooks/useOdooZeilen.ts`). Auswertung: Umsatz enthält die
  Odoo-Rechnungen, „davon … aus Odoo“ steht darunter.
- Ein Editor für beide (`BelegEditor`): Titel als Räume/Abschnitte, Positionen
  aus Leistungskatalog, Artikelstamm, frei oder diktiert (`lib/sprachParser.ts`).
- **Eingabezeile am PC** (`Eingabezeile.tsx`) unter der Tabelle: tippen,
  ↑↓, Enter. Sucht Leistungen und Artikel (auch Datanorm); ohne Treffer eine
  freie Position (Fokus springt in deren Preis). „3 Steckdose“ = Menge 3,
  „#Küche“ = Titel (`schnellLesen`). Knöpfe „+ Titel“ und „Text“.
- **Titel ohne Dialog**: direkt in der Zeile benennen (Vorschläge Küche, Bad …
  als Liste bzw. am Handy als Chips); „Titel darüber einfügen“ im Zeilenmenü.
  Neue Positionen landen unter dem zuletzt angetippten Titel.
- Langtext klein und grau (2 Zeilen), antippen zum Bearbeiten. Am PC unten
  eine feste Summenleiste mit Netto, Brutto, „bleibt nach Material“, je
  Stunde und Speichern.
- „Aus dem Projekt übernehmen“ (`ImportDialog`, `importieren.ts`): angenommenes
  Angebot, unterschriebene Regieberichte (je Bericht ein Titel mit Stunden und
  Material samt Zwischensumme), Stunden und Material ohne Bericht. Nicht
  unterschriebene Berichte zeigt er als Hinweis, übernimmt sie aber nicht.
  Schon das **Speichern des Entwurfs** setzt `rechnung_id` an den Quellen —
  so kann niemand dieselbe Stunde ein zweites Mal verrechnen.
- **„Noch nicht verrechnet“** ganz oben unter Rechnungen
  (`NochNichtVerrechnet.tsx`, Gruppen aus `verrechnenGruppen` in
  `regieLogik.ts`): unterschriebene Regieberichte ohne `rechnung_id` je Projekt
  bzw. je Kunde (Service) plus erledigte Einsätze mit offenen Stunden. „Rechnung
  daraus“: mit Projekt der Projekt-Import (`?projekt=…&import=1`), ohne Projekt
  `/belege/neu?typ=rechnung&kunde=…&regie=<id,id>` — mehrere Berichte desselben
  Kunden per Haken zusammen (`regieImportLaden` in `importieren.ts`). Leer =
  ausgeblendet. Im Rechnungs-Editor ohne Projekt: „Regieberichte des Kunden
  übernehmen“.
- Fertigstellen (`beleg_fertigstellen`) vergibt die Nummer und rechnet die
  Summen. Vorher warnt der Editor (blockiert nicht): kein Leistungszeitraum,
  eigene UID fehlt (ab 400 € brutto), Empfänger-UID ab 10.000 € brutto und
  bei Reverse Charge, Anschrift unvollständig, Positionen ohne Betrag.
- PDF (`lib/belegPdf.ts`): offene Rechnungen mit Bankverbindung und
  Bezahl-QR (EPC); am Handy teilen, sonst herunterladen.
- **Rechnungsarchiv** (`lib/belegArchiv.ts`, Speicher `beleg-archiv`): beim
  Fertigstellen legt die App das PDF ab (`<beleg-id>.pdf`, aus dem Stand in
  der Datenbank) und zeigt danach immer dieses Original — spätere Änderungen
  am Betrieb (Bank, Logo, Anschrift) oder am Projekt ändern alte Rechnungen
  nicht. Überschreiben geht nicht, löschen erst, wenn die Rechnung weg ist.
  Fehlt das Original (ältere Rechnung, Ablegen gescheitert), legt der
  PDF-Knopf es nach. Stornierte erscheinen neu erzeugt mit Stempel;
  Stornorechnungen kommen beim Stornieren ins Archiv wie fertige Rechnungen.
  Auch die **Vorschau** im Editor (daneben und Vollbild) zeigt bei fertigen
  Rechnungen das Original; fehlt es, die neu erzeugte Fassung mit Hinweis —
  ablegen tut nur der PDF-Knopf, nie die Vorschau. Im Entwurf (auch nach
  „Rechnung ändern“) läuft die Vorschau beim Schreiben mit.
- Angebote sind Kostenvoranschläge. Bei Verbrauchern gilt einer als
  verbindlich, wenn nicht ausdrücklich anders erklärt (§ 5 Abs. 2 KSchG) —
  deshalb steht im PDF immer, was gilt (`kvHinweis`). Schalter im Kopf
  (`belege.kv_verbindlich`), ohne Wahl unverbindlich.
- **Storno = eigener Beleg.** `beleg_stornieren` legt eine **Stornorechnung**
  an (Status `storno`, `storno_von` = die Rechnung): nächste Nummer aus dem
  Rechnungskreis, alle Positionen mit negativer Menge, Beträge negativ, sofort
  festgeschrieben, PDF „Stornorechnung … Storno zu RE-…“ ohne Zahlungsteil.
  Die stornierte Rechnung bleibt unverändert (lückenlose Nummern, Original im
  Archiv). Beide zählen nicht zum Umsatz; in der Liste stehen sie unter
  „Storniert“. Ein Firmenkunde braucht die Stornorechnung, um die Vorsteuer
  zu berichtigen. Je Rechnung höchstens eine (eindeutiger Index).
- Storno gibt Stunden, Material und Berichte frei; „Korrektur anlegen“ kopiert
  die stornierte Rechnung in einen neuen Entwurf (`korrektur_von`, je Rechnung
  höchstens einer — Index `belege_korrektur_von_einmal`) und hängt die Quellen
  dort an. Ihr PDF nennt „Ersetzt Rechnung RE-…“.
- **Rechnung ändern** (`rechnung_aendern`, Migration `20261115100000`): eine
  fertige, offene Rechnung wird wieder Entwurf und behält ihre Nummer —
  solange keine Zahlung, keine Mahnung, keine Übergabe an die Kanzlei und kein
  Abzug in einer Schlussrechnung darauf aufbaut (sonst Storno). Erneut
  fertigstellen rechnet neu, die Nummer bleibt. Das verschickte PDF bleibt im
  Archiv, jede neue Fassung kommt daneben (`<id>-1.pdf`, `belege.archiv_stand`);
  der PDF-Knopf zeigt die aktuelle. Wunsch aus der Besprechung vom 11.11.2026.
- Löschen: Rechnungen nur als Entwurf ohne Nummer (nach „Rechnung ändern“ nie). Angebote in jedem Status — außer eine
  Rechnung bezieht sich darauf (`angebot_verrechnet`), sonst verlöre sie den
  Bezug (Policy `belege_nicht_loeschen`).
- Liste: Summe je Belegart (Rechnungen offen/bezahlt, Angebote
  offen/angenommen), ohne Entwürfe, Stornos und abgelehnte Angebote — die
  Fußzeile sagt, was fehlt. Am PC: Zeilen mit Tab/Enter, im Editor Strg+S.
- Cent-Rundung (`runden2`) wie Postgres `round()`: halber Cent weg von null —
  sonst wiche die Stornorechnung um einen Cent ab.
- Ungespeichertes schützt zweierlei: Links, Zurück-Knopf und Neuladen fragen
  nach (`useVerlassenSchutz`); was das nicht abfängt — Wischgeste „zurück“
  am Handy, abgestürzter Browser, leerer Akku — sichert der Editor laufend im
  Gerät (`sicherung.ts`, localStorage) und bietet es beim nächsten Öffnen an.
  Abmelden löscht die Sicherungen.
- Bekannte Grenze: eine einzeln gelöschte Materialzeile eines übernommenen
  Berichts kommt nur über einen neuen Import zurück.

### Angebotsvorlagen, Online-Bestätigung, Datenblätter (Migrationen `20261113115000…003`)

- **Vorlagen** (`angebot_vorlagen`, nur Chef; `vorlagen.ts` rein, `vorlagenDaten.ts`,
  `VorlagenDialog`, `VorlageSpeichernDialog`): ganzes Angebot mit Titeln als jsonb,
  Name eindeutig (gleicher Name = ersetzen), Kategorie frei mit Vorschlägen. Ohne Kunde,
  Datum, Abzüge und Herkunft (Stunden/Material). Getrennt vom Leistungskatalog.
  „Aus Vorlage“ in der Angebotsliste (→ `/belege/neu?typ=angebot&vorlage=<id>`, Preise
  von heute; `&preise=vorlage` = wie gespeichert) und im Editor (fügt unter dem aktiven
  Titel ein, gleichnamige Titel werden „X 2“). Beim Einfügen werden Artikel- und
  Leistungspreise aus Stamm/Katalog neu gerechnet; der Dialog zeigt, was sich seit dem
  Speichern geändert hat, und lässt die alten Preise wählen. Inaktive/gelöschte Artikel
  behalten den Vorlagenpreis und werden gemeldet. Gelöschte Artikel/Leistungen verlieren
  dabei nur den Verweis (`ausVorlage`, Text und Preis bleiben) — sonst scheiterte das
  Speichern am Fremdschlüssel. Dasselbe heilt `belegSpeichern`/`belegKopieren` beim
  Speichern selbst (Fehler 23503 auf `…artikel_id_fkey`/`…leistung_id_fkey` → Verweis weg,
  einmal neu schreiben; `verweiseBereinigen` in `editor.ts`).
- **Kunde bestätigt online** (`AngebotVersand.tsx`, öffentliche Seite `/angebot/:token`
  = `AngebotBestaetigen.tsx`, außerhalb der Anmeldung): Chef erzeugt im offenen Angebot
  einen Link (`angebot_links`, 32 Zeichen Zufall, gilt bis Gültig-bis, einer je Angebot,
  neu erzeugen sperrt den alten), teilt per Kopieren, WhatsApp, E-Mail oder Teilen.
  Der Kunde sieht Angebot und PDF, schickt eine Rückfrage oder nimmt mit Name, Haken und
  Fingerunterschrift an. Anon kommt nur über Security-Definer-RPCs dran
  (`angebot_oeffentlich`, `angebot_annehmen`, `angebot_rueckfrage`) — nie an Tabellen,
  keine EK/Minuten. Annehmen prüft: Link gültig, Angebot offen und nicht abgelaufen,
  Stand (`updated_at`) unverändert, Haken, Unterschrift-PNG liegt unter
  `angebot-bestaetigung/<token>/` (Upload nur mit gültigem Link, PNG ≤ 512 KB, ≤ 5 je
  Link). Dann wie von Hand: Angebot `angenommen`, Projekt per `projekt_aus_angebot_intern`
  (angelegt, falls das Angebot noch keines hat; sonst `angebot` → `aktiv`). Gespeichert
  werden Name, Zeit, Betrag, Unterschrift — keine IP. Alles landet in `angebot_verlauf`;
  Annahmen und Rückfragen sind ungelesen → Startseite „Zu erledigen“, bis der Chef das
  Angebot öffnet.
- **Datenblätter**: aus `artikel_dateien` (art `datenblatt`, Speicher `projekt-dateien/artikel/…`)
  zu allen Artikeln des Angebots inkl. Material der Leistungen. **Sichtbarkeit je Datei**
  am Artikel (`artikel_dateien.sichtbar`, Migration `20261116170000`, Wunsch SETEC
  16.11.2026): „Nur intern“ (nie nach außen), „Mit dem Angebot“ (Standard, auch für alle
  alten), „Erst nach Auftrag“ (erst wenn das Angebot angenommen ist). Gleiche Regel an drei
  Stellen: App (`fuerKunden` in `datenblattLogik.ts`), Datenbank (`angebot_datenblaetter` →
  Liste auf der Bestätigungsseite; `datenblatt_oeffentlich` → Storage-Lesen für anon) und
  Edge Function `beleg-mail`. Im Angebot sind die erlaubten vorab angekreuzt — Abhaken =
  Überschreibung → „Angebot + n Datenblätter“ (Handy: Teilen, PC: ZIP) bzw. Mailanhang.
- **Per E-Mail mit PDF** (`BelegMailDialog`, `mail.ts`, Edge Function `beleg-mail`, Resend,
  Secrets `RESEND_API_KEY`/`RESEND_FROM`): Knopf „Per E-Mail“ in der Status-Karte (beim offenen
  Angebot/Rechnung die Hauptaktion) und im Menü, beim Angebot auch „E-Mail“ neben dem Link.
  Empfänger (aus `empf_email`, sonst Kunde; bis 3), Betreff und Text vorbelegt und änderbar —
  beim Angebot mit Bestätigungslink und Gültigkeit. Absender „SETEC GmbH
  <noreply@handwerkapp.at>“, Antwort an `firma.email`. Nur der Chef (Function prüft Rolle),
  nur fertige Belege. Rechnung: die Function hängt **immer das abgelegte Original** aus
  `beleg-archiv` an (fehlt es, legt die App es vorher ab); Angebot: das PDF wie beim
  Herunterladen (≤ 8 MB) plus Datenblätter, die die Function gegen `angebot_datenblaetter`
  prüft. Vermerk in `angebot_verlauf` (art `gesendet`, name = Empfänger, text = Betreff) —
  beim Angebot im Verlauf, bei der Rechnung als Zeile in der Status-Karte. Drossel 30/Stunde.
  `nur_pruefen: true` baut alles zusammen, sendet aber nicht (für Tests). „Mail-App öffnen
  (ohne Anhang)“ = `mailto:` bleibt als Ausweichweg.
- Demo: `supabase/demo/04-angebote.sql` (6 PV-Vorlagen, AN „Brunner“ offen mit Link
  `/angebot/DEMO-pv-brunner-angebot-bestaetigen-2026`, AN „Reisinger“ online angenommen);
  die Demo-Unterschrift lädt `unterschriften.py` hoch.

### Erstaufnahme, Angebot ohne Projekt, Annahme (Stufe 3, seit 17.11.2026)

Migration `20261117120000_erstaufnahme.sql`, Logik `lib/erstaufnahme.ts` (getestet),
Seiten `/erstaufnahmen`, `/erstaufnahmen/neu`, `/erstaufnahmen/:id`, Bausteine
`components/erstaufnahme/`. Ablauf: `docs/ABLAUF-TERMIN-BIS-RECHNUNG.md`.
- **Erstaufnahme** (`erstaufnahmen`, Nummer `EA-2026-001` per Trigger): Kunde, Adresse,
  Termin (höchstens eine je Termin), Wunsch (Diktat), Notiz, Messwerte (`messwerte`
  jsonb: Bezeichnung/Wert/Einheit, Vorschläge wie Zählerplatz, Hauptsicherung,
  Schleifenimpedanz …), Skizze. Status-Pille `offen` → `angebot` (Trigger, sobald ein
  Angebot daran hängt) → `auftrag` oder `kein_auftrag`. Menü „Erstaufnahmen“ und „+ Neu“
  für alle; Handy einspaltig, Tablet/PC zweispaltig; speichert von selbst.
- **Fotos** (`erstaufnahme_fotos`, Speicher `projekt-dateien/ea/<id>/…`): mit Beschriftung,
  „Zeichnen“ (Pfeile/Kreise/Text in Farben, Stift mit Handballen-Schutz) legt ein neues Bild
  ab und **behält das Original** (`original_pfad`). Eine Datei, auf die noch ein
  Erstaufnahme-Foto zeigt, löscht niemand aus dem Speicher (restriktive Policy
  `erstaufnahme_dateien_bleiben`; „Foto löschen“ im Projekt entfernt nur die Zeile).
- **Rechte**: alle Aktiven lesen, anlegen, ändern; Status/Projekt setzen und löschen nur
  der Chef (Trigger `erstaufnahme_schutz`, RLS).
- **Angebot ohne Projekt**: „Angebot erstellen“ (Chef) öffnet den Editor mit Kunde, Betreff
  aus dem Wunsch und `belege.erstaufnahme_id`; der Editor zeigt oben den Block
  „Erstaufnahme“ (Wunsch, Messwerte, Fotos). Mehrere Angebote je Erstaufnahme gehen
  (Varianten, „Kopieren“ behält den Bezug). `belegSpeichern` legt **kein** Projekt mehr an;
  alte Angebote mit Projekt laufen weiter wie bisher.
- **Annahme → Projekt**: `projekt_aus_angebot(p_beleg)` (security definer, nur Chef,
  idempotent) legt das Projekt an (Kunde, Name = Betreff, Adresse aus Erstaufnahme/Kunde,
  Status `aktiv`) bzw. aktiviert das vorhandene, hängt Angebot, Erstaufnahme (Status
  `auftrag`), Termin und alle Fotos (als `dateien`, Feld `erstaufnahme_foto_id`) dran.
  Aufgerufen vom Chef („Angenommen“, auch vor Rechnung/Teilrechnung) und online von
  `angebot_annehmen` über die interne `projekt_aus_angebot_intern` (anon hat keinen
  direkten Zugriff). „Gleich Projekt“ (`projekt_aus_erstaufnahme`) überspringt das
  Angebot; „Kein Auftrag“ schließt ab. Das Projekt zeigt seine Erstaufnahmen.

### Kalender, Teams und Fuhrpark (Seiten `/kalender`, `/fuhrpark`)

Migrationen `20261110100000_fuhrpark_teams_plantafel.sql` und
`20261117100000_kalender_art_kunde.sql`, Logik in `lib/kalender.ts`,
`lib/terminplaner.ts`, `lib/plantafel.ts` (Konflikte, Projektfarben) und
`lib/fuhrpark.ts` (alle getestet). Ablauf und Hintergrund:
`docs/ABLAUF-TERMIN-BIS-RECHNUNG.md` (Abschnitt 1), Besprechung 17.11.2026.
- `fahrzeuge`: Busse, PKW, Steiger, Anhänger, Maschinen (Kernbohrgerät),
  Messgeräte — Kennzeichen, Pickerl/Service/Prüfung bis, gemietet, stillgelegt.
  `fahrzeug_eintraege` = Bordbuch (Service, Reparatur, Prüfung, Schaden,
  Tanken); Monteure melden Schäden und Tanken, alles andere der Chef.
- `teams`: Name, Farbe, Leitung, Mitglieder, Stamm-Bus (Teams-Dialog im Kalender).
  Ein Termin (`termine`) hat `team_id`, `mitarbeiter[]` und `fahrzeuge[]`.
- **Der Kalender ist der einzige Ort zum Einteilen** (seit 17.11.2026; Gantt,
  Monatsblatt und der Umschalter „Gantt | Wochenplan“ sind weg — Stefan: „Ich seh
  zu wenig“). Menüpunkt „Kalender“ für alle (Suche findet auch „Plantafel“,
  „Einteilung“, „Wochenplan“), `/plantafel` leitet auf `/kalender`
  (`pages/Kalender.tsx`, `components/plantafel/Terminplaner.tsx`). Immer eine Woche.
- **Termin-Art** `termine.art`: `montage` (Farbe des Projekts, ohne Projekt orange),
  `besichtigung` (weiß mit Rand), `service` (blau), `buero` (grau) — `terminFarbe`.
  `termine.kunde_id` (Bestand nachgetragen aus dem Projekt; Art des Bestands:
  mit Projekt `montage`, sonst `buero`). Legende unter der Liste bzw. in der Leiste.
- **Neuer Termin** (`TerminDialog`): zuerst die Art, dann der Kunde (`KundeWahl`:
  suchen oder „+ Neuer Kunde“ mit Adress-Vorschlägen), dann
  - Montage: nur Projekte **dieses** Kunden „In Arbeit“ (`kundenProjekte`; hat er
    genau eines, ist es gewählt), Ort = Projektadresse; Pflicht: Projekt;
  - Besichtigung/Service: „Wo?“ = Adresse des Kunden oder eines seiner Projekte
    (`ortVorschlaege`) oder frei — **kein Projekt**; Pflicht: Kunde;
  - Büro: ohne Kunde.
  Titel wird vorgeschlagen („Service Huber“), solange keiner getippt ist. Danach
  Team, Leute, Geräte, Zeit wie bisher. Aus dem Projekt geöffnet sind Kunde und
  Projekt vorbelegt. Am Termin (Info-Fenster, Termin-Dialog, Einsatz auf der
  Startseite; für Chef und eingeteilte Monteure, `terminWeiter` in `lib/kalender.ts`):
  „Besichtigung“ → Knopf „Erstaufnahme“ (`/erstaufnahmen/neu?termin=…`, gibt es zum
  Termin schon eine, öffnet sie), „Service“ → „Regiebericht“
  (`/regie/neu?kunde=…&termin=…`, mit Projekt `?projekt=…&termin=…`).
- **Aufbau** (wie SETECs alter Taifun-Terminplaner): Spalten = Leute nach Gruppen,
  Zeilen = Tage der Woche mit den Stunden laut Betrieb (Einstellungen → „Kalender“,
  `firma.plan_von/plan_bis`, Standard 6–18, `planStunden`; weiter, wenn ein Termin
  früher/später liegt), Sa/So nur mit Einträgen. Gruppen (`gruppenBilden`):
  Geschäftsführung, eigene Gruppen (`profiles.gruppe`, im Teams-Dialog pflegbar),
  Teams in ihrer Reihenfolge, „Ohne Team“ (Migration `20261113112000_profil_gruppe.sql`).
  Termine als Blöcke (Kunde, Titel, Zeit), Überlappendes nebeneinander
  (`nebeneinander`), Abwesenheit als Fläche: Urlaub/ZA grün, Krank rot, Schule/Arzt
  gelb. Filter Alle/Gruppe/Person, „Gehe zu“ Datum. Rechts am PC **immer der
  Monatskalender** zum Springen (`MiniKalender`, 6 Monate mit KW, wie in Stefans
  altem Terminplaner — bis 18.11.2026 erst ab 1536 px, daher „weg“).
  Versteckte Konten (`profiles.versteckt`, ePower-Zugang) stehen nirgends: weder in
  der Geschäftsführung noch in Listen, Auswertungen, Einstellungen (`useMitarbeiter`
  und die eigenen Abfragen filtern `versteckt = false`).
- **Geräte & Fahrzeuge** (seit 18.11.2026 keine eigenen Spalten mehr) in der
  Tageszeile neben dem Datum (`FahrzeugTag`): je an dem Tag belegtem Gerät ein
  Kärtchen (doppelt belegt = rot mit ⚠, `konflikte` → `geraetDoppelt`), dahinter
  **„+ Fahrzeug“** (Chef) = kleines Fenster mit allen aktiven (Reihenfolge
  `geraeteSpalten`, je „frei“ / „bei …“ / „doppelt“) → Gerät wählen → „Mitnehmen zu“
  einem Einsatz des Tages (mit Leuten), „Dabei bei“ mit ✕ abnehmen oder „Eigenen
  Termin für …“. Kärtchen antippen = dasselbe Fenster für dieses Gerät. Im
  `BalkenInfo` weiter an-/abhaken.
- **Chef**: leere Zelle antippen oder am PC aufziehen = kleines Fenster `ZellWahl`
  zum **schnell Einplanen** (kein großes Formular): Suche, ohne Suche zuerst die
  noch nicht eingeplanten Projekte; Projekt antippen = Montage (angetippt: der Tag
  7:00–15:30, aufgezogen: genau der Zeitraum), Kunde = Besichtigung im angetippten
  2-h-Fenster mit Kundenadresse als Ort; Enter nimmt den ersten Treffer. Gibt es zum
  selben Projekt und Zeitraum schon einen Termin, kommt die Person dazu.
  „Rückgängig“ im Hinweis. Unten „Abwesenheit“ und „Mit Details …“ (Formular, Titel
  aus der Suche vorbelegt). Auf einer Abwesenheit: bearbeiten, löschen oder trotzdem einplanen.
  Aufziehen (`zeitraumAus`): im Tag = genau diese Uhrzeit, über mehrere Tage =
  Zeitraum, gestrichelte Vorschau. Block antippen = `BalkenInfo`
  (Art, Kunde, Projekt, Zeit, Ort, Leute herausnehmen, Geräte an/ab, Erledigt,
  Löschen; „Bearbeiten“ = Formular). Ziehen = andere Zeit/Tag/Person
  (`planVerschieben`, 15-Min.-Raster), unterer Rand = Ende; „Rückgängig“ im Hinweis.
  Konflikte (doppelt, abwesend, Gerät doppelt) als roter Knopf in der Leiste.
- **„Nicht eingeplant (n)“** (PC, Chef) als Knopf in der Leiste — zeigt rechts statt
  des Monatskalenders die Liste (`components/plantafel/NichtEingeplant.tsx`, ✕ = wieder
  Monatskalender): Projekte „In Arbeit“ ohne Termin ab heute (`nichtEingeplant`; Suche
  findet alle laufenden, auch im Angebot). Auf eine Person an einem Tag ziehen =
  Montage bis Freitag 7:00–15:30 mit Kunde (`einsatzAusProjekt`, Rückgängig im
  Hinweis), antippen = Formular mit dem Projekt.
- **Monteur**: Menüpunkt Kalender nur lesend (`darf` = Chef): eigene Spalte und
  eigene Termine hervorgehoben, Abwesenheit anderer nur „abwesend“ (Sicht
  `abwesenheit_kalender`), Termin antippen → „Öffnen“ (Formular nur lesen, „Erledigt“,
  wenn er dabei ist). Dazu die Startseite „Heute/Morgen“ (`EinsatzBereich`).
- **Handy**: „Tag“ (Leute untereinander, Zeit quer), „Person“ (Mo–Fr, Stunden nach
  unten; wischen = nächster Tag bzw. nächste Person) oder „Woche“ (Liste je Tag,
  Meine/Alle; Monteur startet mit Woche/Meine) — gemerkt in `elektro.kalender.handy`.
- **Rechte** (Migration `20261116150000_termine_nur_chef.sql`): Termine legt nur der
  Chef an, verschiebt und löscht sie (RLS `termine_anlegen/_aendern/_loeschen`). Ein
  Monteur darf bei Terminen, in denen er eingeteilt ist, nur den Status setzen
  (Trigger `termin_nur_status`). „+ Neu → Termin“, „Termin eintragen“ nur Chef.
- **Mitteilungen**: `termin_push` meldet Tag, Zeit, Ort, Titel, Leute **und
  Geräte** (`fahrzeuge`, seit `20261117100000`) — eine reine Status-Änderung nicht.
- **Material im Einsatz** (`EinsatzDetails`, aufklappbar): „Material laut Angebot (n)“
  ohne Preise aus `useAngebotMaterial`, schon Ausgefasstes abgezogen
  (`ausfassVorschlag` + `verbrauchtKarte`, wie beim Ausfassen), Knopf „Jetzt ausfassen“
  → `/scan?projekt=…&modus=ausfassung` (nicht, solange das Projekt im Angebot ist).
- Fuhrpark: oben je Art eine Kachel zum Filtern (Anzahl, wie viele unterwegs)
  plus „Fällig & Schäden“, darunter je Art ein Block mit Kacheln (im Einsatz
  oder frei, Team, heute, Fälligkeiten).
- Fällig (Pickerl, Service, Prüfung in 30 Tagen) und offene Schäden stehen
  im Fuhrpark und auf der Startseite.

### Stundenauswertung (Auswertung → Stunden)

`lib/stundenAuswertung.ts`: Zeitraum (Woche, Monat, Jahr, frei), Filter nach
Mitarbeiter oder Team, Projekt (auch „ohne“), Art und verrechnet; gruppiert
nach Mitarbeiter, Projekt, Woche, Tag oder Art, jede Gruppe aufklappbar bis
zur einzelnen Buchung. CSV und Stundennachweis-PDF der Auswahl.
„Von–Bis je Tag“ (`tagesnachweis`, `components/auswertung/VonBis.tsx`): je
Person und Tag Beginn, Ende, Pause, Stunden und eine Zeitleiste 6–19 Uhr mit
den einzelnen Blöcken; je Person Ø Beginn/Ende; auffällig sind Beginn vor 6,
Ende nach 19, über 10 h, Überschneidung, Lücke über 1 h. Auch als CSV.

### Startseite und Menü

Monteur am Handy: nur Täglich (Stunden, Scannen, Regieberichte), Baustelle
(Lieferscheine), Sonstiges (Mein Konto); „Meine Aufgaben“ nur, wenn ihm eine
zugeteilt ist, ohne „+ Aufgabe“; Projekte, Aufgaben, Änderungswünsche sind `nurChef`
— `START_MONTEUR` in `pages/Index.tsx`. Kontakte, Lager, Fuhrpark,
Anlagen, Dokumente, Artikel sind `nurChef` im Menü. Das Büro hat eigene Punkte
„Artikel & Leistungen“ (ein Katalog, Reiter) und „Mitarbeiter & Zugänge“.
Den Kalender sehen auch Monteure (nur lesen).

PC: unter dem Gruß die Schnellaktionen Neues Projekt, Neue Rechnung, Termin
eintragen; dann „Zu erledigen“ (nur am PC — am Handy ist die Startseite nur das Menü) (online angenommen, Rückfragen, überfällig,
mahnen, Rechnungen prüfen/überweisen, Skonto läuft ab, Fuhrpark fällig,
Schäden, zuzuordnen …), darunter „Laufende Projekte“ (ohne abgeschlossene),
dann Einsatz und Schnell festhalten. „Zu erledigen“ ordnet `lib/zuErledigen.ts`:
erst `oben` (Angebot online angenommen), dann Rotes (`warn`), dann der Rest;
sichtbar sind am Handy 5, am PC 9 Punkte, der Rest hinter „Alle N anzeigen“.
Jede Zahl dort = die Zahl der Einträge in der verlinkten Liste (gleiche Regel,
gleiche Daten, seit 18.11.2026): offene/überfällige Rechnungen aus den Offenen
Posten (offener Rest nach Teilzahlungen), Angebote ohne die schon verrechneten,
erledigte Einsätze wie „Noch nicht verrechnet“ (`erledigtNochOffen`, mehrere →
`/rechnungen`), Skonto → `/eingang?filter=skonto`, Bestellungen →
`?filter=unterwegs`, Förderfristen → `/projekte?filter=foerderung&frist=30`,
wartende Mitarbeiter ohne versteckte Konten. Noch nicht gleich: Fuhrpark (zählt
Termine/Schäden, die Seite Fahrzeuge) und „online angenommen“ (ungelesene
Ereignisse statt der Liste „Angenommen“).

Menü nach dem Vorbild Lengauer Stockner (`components/rahmen/`), alle Ziele in
`lib/navigation.ts` (Gruppen haupt/baustelle/buero/system, `selten`, `stichworte`):
- **Seitenleiste** (`Seitenleiste.tsx`): SETEC-Schwarz, 240 px, ab 1024 px einklappbar auf
  56 px (gemerkt in `localStorage` `setec.seitenleiste`); Tablet 768–1023 px immer
  schmal. Oben Querlogo, „Suchen … Strg K“ und das goldene „+ Neu“.
  Gruppe ohne Etikett (Start, Projekte, Kontakte, Angebote, Rechnungen, Kalender), dann
  beim Chef BÜRO vor BAUSTELLE (am Laptop sieht er Eingangsrechnungen & Co. ohne
  Scrollen), beim Monteur BAUSTELLE vor BÜRO; einzeln zuklappbar (`menue.zu`; die
  Gruppe der offenen Seite ist offen, zugeklappt nur bis zum Seitenwechsel). Aktiv:
  hellere Fläche und goldener Strich links. „+“ beim Überfahren an Projekte, Kontakte,
  Angebote, Rechnungen, Kalender, Stunden, Aufgaben, Regieberichte legt gleich an.
  Im Fuß Einstellungen, Änderungswünsche, Handyansicht und das Konto (`KontoMenue leiste`).
- **„+ Neu“** (`NeuMenue.tsx`, `NeuRahmen` einmal im Rahmen): Projekt, Angebot,
  Angebot vor Ort, Rechnung, Termin, Aufgabe, Kontakt, Stunden, Regiebericht, Foto
  (Monteur ohne Angebot/Rechnung) — jeder Eintrag öffnet den vorhandenen Dialog oder
  die Seite. `neuStarten(art)` startet eine Aktion von überall.
- **Suche** (`Suchpalette.tsx`): Strg+K, am Handy die Lupe im Kopf der Startseite
  (Vollbild). Projekte, Kontakte, Belege (nur Chef), Seiten, Neu anlegen; Pfeile +
  Enter. Seiten werden über Titel und `stichworte` gefunden („Plantafel“ → Kalender,
  „Lohnzettel“ → Dokumente, „Mitarbeiter“ → Einstellungen).
- **Startseite am Handy/Tablet** (`StartListe.tsx`): Kopf mit Logo, Datum und
  Gruß, Lupe, Melden, Konto. Menü als große Karten mit „… öffnen“ und leichtem
  Schatten in den Gruppen Täglich, Baustelle, Büro, Sonstiges; ab 7 Einträgen
  wandern die seltenen (`selten`) unter „Mehr in …“ (aufgeklappt gemerkt: `start.mehr`).
- **App-Hülle**: Seitenkopf (`PageHeader`) bricht um, wenn Titel und Knöpfe nicht in
  eine Zeile passen (iPhone SE) — die Knöpfe rutschen darunter statt aus dem Bild.
  Funkloch: gelbe Pille „Kein Netz“ (`rahmen/OfflineHinweis.tsx`); Profil und Betrieb
  sind am Gerät gemerkt (`setec.sitzung`, beim Abmelden gelöscht), damit die App ohne
  Netz normal öffnet statt „Wartet auf Freischaltung“; ohne gemerktes Profil „Keine
  Verbindung — Nochmal versuchen“. Jede `toast.error`-Meldung läuft durch
  `lib/fehlerDeutsch.ts` („Failed to fetch“/„Load failed“ → „Keine Verbindung …“) und
  bleibt 6 s stehen (`components/ui/sonner.tsx`). Der 1-MB-PDF-Chunk lädt erst bei
  Bedarf (`vite.config.ts`: Nachlade-Helfer und fflate im Chunk `basis`).

Projekte (`pages/Projekte.tsx`) als Kacheln: Nummer, Name, Status, Förderung, Kunde,
Adresse, Stunden und was noch nicht verrechnet ist; Filter „Förderung“ mit Unterfilter je Schritt; am Handy eine Spalte,
ab 480 px zwei, PC drei bis vier. Am PC umschaltbar auf die Liste
(`elektro.projekte.ansicht`).

### Projektseite: Planung, Fotos, Förderung, WhatsApp, Nachkalkulation

Migration `20261113114000_projekte_foerderung_planung_saetze.sql`, Bausteine in `components/projekt/`:
- **Fotos** (`BildBetrachter`, ohne Bibliothek): Vollbild, zwei Finger zoomen, Doppeltipp/-klick 2,5×,
  gezoomt verschieben, sonst wischen = nächstes Bild; PC Mausrad zur Maus, Pfeiltasten, + − 0, Esc.
- **Planung** (`PlanungBereich`, oben in der Übersicht): Dokumente mit `dateien.planung` (PV-Plan,
  Stringplan, Dachbelegung) — „Plan ablegen“ oder im Ordner Dokumente „Als Planung oben zeigen“.
  PDFs zeichnet `PdfAnsicht` mit pdf.js (lazy geladen): am PC eingebettet, am Handy Vollbild; Seiten
  blättern, Zoom, Herunterladen bzw. am Handy Teilen. Bilder öffnen im Betrachter.
- **Förderung** (`projekte.foerder_*`): keine / Antrag vorbereitet / eingereicht / zugesagt /
  Fertigstellung gemeldet / ausbezahlt / abgelehnt, mit Förderstelle (Vorschläge OeMAG, Klimafonds,
  Land, Gemeinde), Betrag, Datum, Frist, Notiz. Pille im Kopf und auf der Kachel (`foerderPille`).
  Jede Änderung schreibt der Trigger `foerderung_verlauf` in den Verlauf. Startseite (Chef): Frist
  offener Schritte in ≤ 30 Tagen oder vorbei (`lib/foerderung.ts`).
- **WhatsApp an Kunde** (`WhatsAppDialog`, ohne API): Vorlage wählen (Termin = nächster Einsatz mit
  Datum, Uhrzeit, Team; Montage fertig; Förderung; frei), Text prüfen, „In WhatsApp öffnen“ →
  `wa.me/<nummer>?text=…` (`waNummer`: 0664… → 43664…). Gesendet wird in WhatsApp; vermerkt wird die
  Absicht mit Text und Nummer im Verlauf. Vorlagen mit Platzhaltern `{kunde}` … in Einstellungen →
  Betrieb (`firma.whatsapp_vorlagen`, leer = Vorgaben in `lib/whatsapp.ts`).
- **Nachkalkulation** (`NachkalkulationKarte`, `lib/nachkalkulation.ts`, nur Chef): zählendes Angebot =
  die angenommenen, sonst die offenen. **Angebotene Stunden** = Arbeitszeit-Positionen in h + Menge ×
  Montageminuten jeder Position; gegen die gebuchten Stunden **ohne Regie**, Ampel bis 85 % grün, bis
  100 % gelb, darüber rot. **Regie getrennt**: Stunden und Material mit `regiebericht_id` sind ein
  eigener Block (Wert, Material-EK, Lohnkosten, Ertrag) und zählen nie gegen das Angebot; die
  Pauschale rechnet Angebot − Lohnkosten − Material-EK − Fremdleistung. Garantie kostet, bringt nichts;
  Überstunden ×1,5/×2 auf beiden Seiten. Auswertung → Nachkalkulation zeigt dieselbe Rechnung je Projekt
  (Spalte „davon Regie“, Stunden „ohne Regie / angeboten“).
- **Lohnkosten und Stundensatz je Mitarbeiter** (Menü „Mitarbeiter & Zugänge“ (`/mitarbeiter`), Knopf „€“): Zeilen mit
  „gültig ab“; jede Stunde rechnet mit dem Satz ihres Tages (`satzAm`). Lohnkosten: Person, sonst
  `firma.kostensatz`. Verrechnungssatz: Person, sonst Lohnart, sonst Projekt-/Betriebssatz — so auch in
  „Aus dem Projekt übernehmen“ (Rechnung, Regie); wer einen eigenen Satz hat, bekommt eine eigene Zeile
  „Arbeitszeit <Name>“. Monteure lesen die Tabelle nicht (RLS `saetze_chef`).

### Schriftgröße (Einstellungen → Mein Konto, `lib/schrift.ts`)

- Wunsch SETEC 16.11.2026 („Wurstfinger“), Vorbild Steinbrecher: Normal 16 px, Groß 17,
  Sehr groß 18,5, Extra groß 20 — als Grundschrift (`data-schrift` am `<html>`, Regeln in
  `index.css`), alles in rem wächst mit. Je Gerät in localStorage (`setec.schrift`, mit
  try/catch); `index.html` setzt sie vor dem Start. Eingaben `max(16px, 1rem)`. Kleine
  Pixel-Schriften auf den Handy-Seiten (Start, Stunden, Scanner, Regie, Pillen) sind in rem
  umgestellt. Geprüft auf 390 px mit „Extra groß“: kein waagrechtes Scrollen.

### Betrieb (Einstellungen)

- Stundensatz über 0 €, weitere Stundensätze mit Namen (ohne doppelte),
  Aufschlag 0–1000 %, Zahlungsziel und Angebotsfrist in
  ganzen Tagen — leer oder unlesbar wird abgewiesen, nicht still 0.
- Bankdaten (`lib/bank.ts`): IBAN mit Prüfziffer und Länge je Land, BIC, UID
  (Österreich `ATU` + 8 Ziffern); gespeichert einheitlich (IBAN in
  Vierergruppen). Was schon so gespeichert ist, sperrt nicht — die Demo-IBAN
  zeigt nur den Hinweis, dass der Bezahl-QR damit nicht funktioniert.
- Logo: auf 1200 px verkleinert, PNG bleibt PNG (Transparenz); das alte wird
  erst gelöscht, wenn das neue eingetragen ist.

### Regiebericht = keine doppelte Erfassung

- Arbeitszeit im Regiebericht = Zeilen in `zeiten` mit `regiebericht_id`
  (für jeden Mitarbeiter der Partie — Monteure dürfen Stunden für Kollegen eintragen)
- Material im Regiebericht = `material_buchungen` mit `regiebericht_id`
  (art `ausfassung` aus dem Bus/Lager oder `direkt`)
- Schon gebuchte Stunden desselben Projekts und Tages schlägt der Editor vor
  („übernehmen“) — `regie_zeiten_zuordnen(regie, dazu[], weg[])` setzt nur
  `regiebericht_id`, auch bei Stunden eines Kollegen (die Partie schreibt den
  Bericht meist auf EINEM Handy). Migration `20261025122000`.
- **Ohne Projekt (Service, Reparatur — Migration `20261117110000`)**: der
  Bericht hängt dann am Kunden (`kunde_id`, `on delete restrict`) mit eigenem
  Einsatzort (`strasse`/`plz`/`ort`, vorbelegt aus der Kundenadresse) und
  optional am Termin (`termin_id`). Check: Projekt ODER Kunde. Stunden und
  Material haben dann `projekt_id` null und hängen nur über `regiebericht_id`
  (`buchung_passt` verlangt Projekt oder Bericht); der Bus-Bestand stimmt,
  weil `lagerbestand` nicht am Projekt hängt. Service-Stunden zählen in
  Auswertung und Lohn als produktiv. Einen Entwurf ohne Projekt löschen räumt
  seine Stunden, Buchungen und Fotos mit ab (Trigger). Aufruf:
  `/regie/neu?kunde=<id>[&termin=<id>]`, `?termin=<id>` (Projekt oder Kunde
  aus dem Termin), `?ohne=1`; im Editor Umschalter „Mit Projekt“ / „Service
  ohne Projekt“, solange ungespeichert (Logik `regieLogik.ts`: `kopfWerte`,
  `zuordnungFehler`, `unterschriftOrdner`, `fotoOrdner`).
- **Fotos** (`RegieFotos.tsx`): `dateien.regiebericht_id`, Ablage unter
  `<projekt_id>/…` bzw. `regie/<regie_id>/…`; im PDF zwei je Zeile (höchstens
  12). Nach der Unterschrift sind die Fotos fest (Trigger `dateien_regie_schutz`).
- **Material am Handy** (`MaterialListe.tsx`): Katalog, Reinreden, Scannen,
  Frei. „Reinreden“ (`RegieMaterialSprache.tsx`) diktiert, schickt den Text an
  `ki`/`material_vorschlag` im Modus `verbraucht` (für alle aktiven Nutzer,
  nur das Gesagte, Artikel aus dem eigenen Stamm) und zeigt Vorschläge zum
  Antippen; ohne Treffer als freie Position.
- Unterschreiben: Bild nach `projekt-dateien/<projekt_id>/unterschriften/<regie_id>.png`
  (ohne Projekt `regie/<regie_id>/unterschriften/<regie_id>.png`), dann `status = 'unterschrieben'` + `unterschrift_name`. Ohne Bild und Namen
  lehnt der Trigger `regieberichte_unterschrift` ab; `unterschrieben_am` setzt
  der Server (eine falsch gehende Handyuhr landet nicht im Beleg).
- Danach ist der Bericht fest (Trigger `regie_schutz`); die Unterschriftsdatei
  kann niemand löschen (Storage-Policy `unterschriften_bleiben`, restriktiv)
- Ungespeicherte Eingaben sichert der Editor im Gerät (`regie/sicherung.ts`) —
  eine Wischgeste „zurück“ am Handy verliert nichts
- PDF (`lib/regiePdf.ts`): Material **ohne Preise** — der Kunde unterschreibt
  auf der Baustelle, die Preise stehen auf der Rechnung

### Strichcodes und Artikel-Import

- Kamera: `components/scanner/leser.ts` — BarcodeDetector des Browsers, wo er
  die Formate kann, sonst @zxing; eintippen geht immer.
- `lib/strichcode.ts` macht aus einem Code alle Schreibweisen (UPC-A/EAN-13
  mit führender 0, GS1-128 mit „(01)“, Leerzeichen); `artikel_zu_code()` sucht
  in `artikel.ean` und `artikel_codes` (Karton = `menge` Stück). Jede Stelle,
  die scannt (Scan-Seite, Artikelliste, Regiebericht), geht über
  `artikelZuCode` — alle Schreibweisen. Ein Code führt immer zum selben
  Artikel: gelernter Code vor Lagerartikel vor dem älteren; stillgelegte
  Artikel sind nicht buchbar (Migration `20261025200000_material_suche.sql`).
  Die Suche zeigt die exakte EAN zuerst, dann Lagerartikel; „%“ und „_“ sind
  Zeichen, keine Platzhalter.
- Unbekannter Code → `CodeUnbekanntDialog`: vorhandenen Artikel wählen (der
  Code wird gelernt) oder neuen Artikel anlegen.
- Import (Artikelstamm → „Import“, Chef): **DATANORM 4/5** (eine oder mehrere
  Dateien eines Lieferanten) oder **CSV** (Trennzeichen, Kopfzeile, Spalten
  und Zahlenformat automatisch, Spalten von Hand korrigierbar).
  EK = Listenpreis − Rabatt, Preise immer **je 1 Einheit**. Vorhandene Artikel
  erkennt der Import an Lieferant + Artikelnummer (`unique`, Upsert) — ein
  zweiter Import aktualisiert die Preise, statt doppelt anzulegen.
  Eine Sonepar-Lieferung (Datanorm oder CSV aus dem Webshop) geht über
  denselben Import.
- Was der Import nicht lesen kann, steht in einer Problemliste (Datei, Zeile,
  Grund, Auszug; höchstens 200 plus Gesamtzahl); eine Datanorm-Datei mit
  einzelnen fremden Zeilen bleibt Datanorm. Bild, PDF oder Excel statt einer
  Artikelliste → ein verständlicher Satz. EANs werden einheitlich gespeichert,
  eine EAN, die schon ein anderer Artikel hat, meldet der Import.
- Die Demo hat nur die 158 Demo-Artikel (`quelle = 'demo'`); der
  Sonepar-Datanorm-Katalog ist entfernt, SETEC spielt seine eigene
  Artikelliste über den Import ein.

### Artikel und Lager (`components/material/artikel*`, Seite `/artikel/:id`)

- **Artikel-Detail**: Bilder (Foto am Handy), Datenblätter (PDF), Preis,
  Lieferanten, Bestand und Lagerplatz je Lagerort, alle Bewegungen mit Filter
  (Zugänge, Abgänge, Umbuchungen, Projekte, Inventur, Lagerort) und „danach X“.
  Monteur sieht keine Preise und Lieferanten.
- **VK je Artikel**: Standard (Aufschlag des Betriebs), eigener Aufschlag oder
  fester VK; die Pille sagt, woher der VK kommt (`vkHerkunft`). Viele auf
  einmal: Artikelstamm → „Aufschläge“ (je Kategorie/Lieferant/Hersteller,
  RPC `artikel_aufschlag_setzen` in Häppchen, leer = zurück auf Standard).
- **Mehrere Lieferanten**: der Hauptlieferant bleibt am Artikel (EK für die
  Kalkulation); Bestellvorschläge nehmen den bevorzugten, sonst den
  günstigsten (`besterLieferant`).
- **Lieferschein einbuchen** (Lieferscheine, Chef): PDF vom Großhändler
  hochladen oder fotografieren → KI liest → „Einbuchen“ ordnet die Zeilen zu
  (Lieferanten-Nr., EAN, Hersteller-Nr., Artikelnummer; unsicher = „prüfen“),
  bucht ins Lager (mit Lagerplatz) oder direkt aufs Projekt und hakt offene
  Bestellpositionen ab. RPC `lieferschein_einbuchen` bucht einmal —
  `eingebucht_am` und `material_buchungen.lieferschein_id` verhindern die
  Doppelbuchung; eingebuchte Lieferscheine kann nur noch der Chef ändern oder
  löschen (Trigger `lieferschein_eingebucht_schutz`).
- **Ausfassen laut Angebot**: beim Ausfassen zeigt die Scan-Seite das Material
  aus dem angenommenen (sonst offenen) Angebot des Projekts mit „noch X von Y“
  (RPC `angebot_material`, auch für Monteure, die keine Belege lesen) —
  antippen legt die offene Menge in die Liste; Lagerplatz steht an jeder Zeile.

### Nummern

`naechste_nummer(typ, datum)` (nur intern): Projekt `2026-0001`, Angebot
`AN-2026-001`, Rechnung `RE-2026-001`, Regiebericht `RB-2026-001`,
Erstaufnahme `EA-2026-001`.
Projekt-, Regie- und Erstaufnahmenummer vergibt ein Trigger beim Anlegen, Belegnummern
`beleg_fertigstellen(id)` (rechnet dabei auch Netto/USt/Brutto aus den Positionen).

### Preise — nur über `src/lib/preise.ts`

- `artikelVk(artikel, firma)` = fester VK, sonst EK × (1 + Aufschlag des Artikels, sonst des Betriebs), sonst Listenpreis; `vkHerkunft` sagt, welcher
- `buchungVk(buchung, firma)` = Verkaufswert einer Materialbuchung (Artikelpreis, bei freiem Text EK + Aufschlag)
- `leistungPreis(leistung, material, firma, stundensatz)` = fester Preis, sonst Material-VK + Minuten/60 × Stundensatz
- `stundensatzFuer(projekt, firma)`
- `belegSummen(positionen, ustSatz, ohneUst)` — Reverse Charge / Kleinunternehmer = ohne USt

## Hauptabläufe

1. **Stunden (Monteur)**: Start → „Stunden“ → Projekt (zuletzt benutzte oben) →
   Schnellwahl 4/6/8/8,5/9/10 h, „andere“ tippen oder Von–Bis (22 bis 6 Uhr
   geht über Mitternacht) → fertig. Nicht für morgen — gebucht wird, was
   gearbeitet ist.
2. **Material ausfassen**: Projekt → „Material“ → Kamera scannt laufend →
   jeder Treffer landet in der Liste (Menge ±, bei Metern Zahlenfeld) →
   „Buchen“. Unbekannter Code → Artikel suchen und Code zuordnen ODER neuen
   Artikel anlegen. Rückgabe genauso, Modus „Zurück“. Verbrauch rechnet die View.
3. **Regiebericht**: Projekt → „Regiebericht“ (oder Kunde/Termin → Service
   ohne Projekt) → Arbeiten (diktieren) → Stunden der Partie (vorbelegt mit
   heutigen Stunden am Projekt) → Material (Katalog, reinreden, scannen, frei)
   → Fotos → Kunde unterschreibt am Handy → PDF teilen. Danach steht er unter
   Rechnungen → „Noch nicht verrechnet“.
4. **Angebot vor Ort (Chef)**: Besichtigung → „Erstaufnahme“ (Wunsch diktieren,
   Messwerte, Fotos mit Zeichnung, Skizze) → „Angebot erstellen“ — oder direkt
   „Angebot“ → Kunde (neu anlegen geht direkt) → **kein Projekt**, das entsteht
   erst bei Annahme (Chef „Angenommen“ oder Kunde online) → Räume als Titel →
   Leistungen antippen (+/−) oder **diktieren** („Küche: 6 Steckdosen, 2
   Wechselschalter, 1 Herdanschluss“) → Vorschläge bestätigen → PDF.
5. **Rechnung aus dem Projekt (Chef)**: Projekt → „Rechnung“ → Assistent zeigt
   alles Offene: unterschriebene Regieberichte, Stunden ohne Regiebericht,
   verbrauchtes Material, angenommenes Angebot → anhaken → Editor → Fertigstellen → PDF.
6. **Auswertung (Chef)**: Monat/Jahr → Umsatz je Monat, Stunden je Mitarbeiter
   und Projekt. **„Monat herunterladen“** = Stundennachweis als PDF mit einem
   Klick (`lib/stundenPdf.ts`: Summen je Mitarbeiter, dann je Mitarbeiter eine
   Seite mit allen Tagen und Unterschriftszeilen) für die Lohnverrechnung,
   daneben dieselben Zeilen als CSV. Nachkalkulation
   je Projekt: geleistet (Stunden × Satz der Person + Material-VK, Regie getrennt) gegen Angebot und
   Verrechnetes, sortiert nach „noch nicht verrechnet“.
7. **Neuer Mitarbeiter**: scannt den QR-Code am Aushang (oder öffnet den
   Link `/start` aus WhatsApp, Mail oder SMS) → legt die App auf den
   Startbildschirm → registriert sich darin mit E-Mail und ist sofort drin.
   Chef-Rolle, Team und Farbe gibt der Chef danach.

## Code-Konventionen

- React 18 + TS + Vite, shadcn/ui, Tailwind, @tanstack/react-query, Supabase JS
- Deutsche Bezeichner wie im Bestand (`laden`, `speichern`, `neuLaden`)
- Daten-Hooks in `src/hooks/useDaten.ts` (`useProjekte`, `useProjekt`, `useKunden`,
  `useMitarbeiter`, `useLagerorte`, `useProjektZahlen`, `useNeuLaden`)
- Nach dem Speichern `neuLaden("projekte", …)` mit den betroffenen Query-Keys
- Gemeinsame Bausteine — **benutzen statt nachbauen**:
  - `components/material/ArtikelSuche.tsx` (`<ArtikelSuche onWahl={…} />`, `useArtikelSuche`)
  - `components/scanner/ScanDialog.tsx` (`<ScanDialog open onOpenChange onCode dauerhaft titel />`;
    gibt `onCode` einen Text zurück, zeigt der Scanner ihn als Rückmeldung — sonst nichts zurückgeben)
  - `components/material/MengeFeld.tsx`, `CodeUnbekanntDialog.tsx`, `FreiePositionDialog.tsx`
  - `components/DiktatKnopf.tsx` (`<DiktatKnopf onText={…} />`, `useDiktat`)
  - `components/KundeWahl.tsx`, `components/ProjektWahl.tsx` (Projekt per Tippen: Nummer, Name, Kunde,
    Ort — `lib/projektSuche.ts`; Liste klappt im Formular auf, Pfeile/Enter/Esc)
  - `components/FormularDialog.tsx` (Vollbild-Formular mit festem Fuß)
  - `components/Bausteine.tsx` (`Kennzahl`, `Leer`, `StatusBadge`, …)
  - `lib/format.ts` (`euro`, `zahl`, `datum`, `isoTag`, `zahlLesen`, …), `lib/preise.ts`
  - `lib/abfrage.ts`: `alleZeilen()` — Supabase liefert je Abfrage höchstens
    1000 Zeilen und schneidet still ab; für Auswertungen immer seitenweise holen.
    `csvHerunterladen()` — Strichpunkt, Dezimalkomma, BOM (Excel in Österreich);
    Text, der mit = + - @ beginnt, bekommt ein `'` davor (sonst führte Excel ihn
    als Formel aus — Monteure legen Artikel an, Tätigkeiten tippt jeder)
- PostgREST-Sammel-Inserts: **jede Zeile mit denselben Feldern** (sonst NULL statt Default)
- Zahlen aus Eingaben nur über `dezimalLesen`/`zahlLesen` (Komma oder Punkt,
  Tausenderpunkte; „1,2,3“ ist ein Tippfehler und ergibt `null`)
- Server-Daten in einem Formular: Neues nur übernehmen, wenn nichts getippt
  ist. Supabase meldet bei jeder Rückkehr in den Tab `SIGNED_IN`; `useSitzung`
  lädt dann neu, behält aber unveränderte Objekte (sonst liefe jeder
  `useEffect(…, [firma])` an)
- Diktat (`DiktatKnopf`): ohne Netz oder Mikrofon eine klare Meldung und Ende —
  kein Neustart in Schleife
- Handy zuerst: Ziel 360 px Breite, Knöpfe ≥ 44 px, Eingaben `h-11`/`h-12`

## Kunden-Lieferscheine (16.11.2026)

Material an Kunden ohne Projekt (Theke, Sonderbestellung) samt Retour:
`/kunden-lieferscheine`, aus dem Kontakt „Lieferschein“. Entwurf → Abschließen
(RPC `kunden_lieferschein_abschliessen`: Nummer LS-, Lagerbuchung) → Kunde
unterschreibt → PDF/Druck/Mail (`beleg-mail`) → „Rechnung schreiben“. Details
`.claude/rules/kunden-lieferscheine.md`.

## E-Mail-Postfach (Google Workspace) (17.11.2026)

Postfächer des Betriebs über die **Gmail-API** — ein Dienstkonto mit
domänenweiter Delegierung (Supabase-Secret `GOOGLE_MAIL_DIENSTKONTO` = base64
des JSON, nie im Browser). Die Freigabe macht der Admin der Firma **einmal** in
der Google Admin-Konsole (Sicherheit → API-Steuerung → Domainweite
Delegierung: Client-ID `110267341647112633213`, Bereiche
`gmail.modify,gmail.send`); weitere Adressen derselben Domain brauchen keine
neue Freigabe. Migrationen `20261117140000_postfach.sql`,
`20261118161500_postfach_haerten.sql` (Prüfung 18.11.2026: Doppelte, große
Anhänge, Domains, als gelesen, Zeitzone).

- **Erlaubte Domains** (18.11.2026): Das Dienstkonto gehört ePower und gilt für
  mehrere Kunden — ohne Sperre könnte ein Benutzer jedes freigegebene Postfach
  einer anderen Firma eintragen. Gelesen, getestet und gesendet wird nur über
  Postfächer der Domains im Secret `POSTFACH_DOMAINS` (mit Komma getrennt, z. B.
  `setec-gmbh.at`). Fehlt das Secret, gilt die Tabelle `postfach_domains` (nur
  per SQL, keine Policies — beim Einspielen aus Firmen-Mail und eingetragenen
  Postfächern gefüllt, ohne Freemail). Beides leer → keines (fail closed).
  Firmen-Mail und `postfaecher` zählen zur Laufzeit nie, die kann jeder Chef
  ändern. Fremde Domain: „Verbindung testen“ fragt Google gar nicht erst
  (Grund „domain“), der Abruf überspringt das Postfach (`letzter_fehler`),
  `beleg-mail` sendet nicht (403). Logik `domainsLesen/domainErlaubt/
  erlaubteDomains` in `_shared/postfach.ts`.
- **Einstellungen → E-Mail** (nur Chef, `components/postfach/Postfach.tsx`):
  Liste `postfaecher` (Adresse, „Rechnungen einlesen“, „Senden“, höchstens ein
  „Standard-Absender“, Haken „Eingelesene Rechnungen als gelesen markieren“ =
  `als_gelesen`, Standard an; RLS nur Chef). „Verbindung testen“ ruft
  `postfach-abruf {aktion:"testen"}` (Recht „Einstellungen“): Token + 3 neueste
  Betreffzeilen; Fehler
  verständlich (`fehlerDeuten`: unauthorized_client → Freigabe fehlt, mit den
  3 Schritten, Client-ID und Bereichen zum Kopieren; invalid_grant → Adresse
  prüfen; Gmail API aus; Domain nicht freigegeben). Karte **„Nicht gelesene
  Mails“** (Recht „Eingangsrechnungen“, letzte 30 Tage): Mails mit
  `postfach_mails.ungelesen` — nur Absender, Betreff, Datum (Wien), Grund und
  „In Gmail öffnen“, nie Inhalt. Dieselbe Liste als aufklappbarer Hinweis auf
  `/eingang` (14 Tage, ✕ bis eine neue dazukommt, localStorage).
  Startseite (Chef): Karte „E-Mail verbinden“, solange
  kein Postfach erfolgreich getestet ist („Später“ = 3 Tage, localStorage).
- **Senden** (`beleg-mail`): gibt es ein aktives Postfach mit „Senden“, geht die
  Mail über Gmail (`messages/send`, Upload als message/rfc822, bis 24 MB
  Anhang) von `von` aus dem Mail-Dialog (Auswahl „Senden von“ bei mehreren),
  sonst Standard-Absender, sonst das einzige — liegt danach in Gmail unter
  „Gesendet“. Fehler → Meldung, **kein** stiller Rückfall auf Resend; Postfach
  einer nicht erlaubten Domain → 403, nichts gesendet. Ohne
  Postfach wie bisher Resend (noreply@handwerkapp.at, Antwort an Firmen-Mail).
  MIME in `_shared/mime.ts` (multipart/mixed + alternative, Betreff und
  Dateinamen RFC 2047/2231, vitest `src/lib/postfach.test.ts`).
- **Einlesen** (`postfach-abruf {aktion:"abrufen"}`, Kern `_shared/abruf.ts`):
  je Postfach mit „Rechnungen einlesen“ Mails `has:attachment newer_than:14d
  -in:sent …` (gelesen oder nicht — die Tabelle merkt, was schon dran war).
  Je Mail zuerst eine Zeile in `postfach_mails` (unique Postfach + Message-ID,
  `in_arbeit`) → Knopf und Cron nie doppelt. PDF- und
  Bild-Anhänge (keine Logos < 30 KB) liest Claude (`_shared/beleg.ts`, dieselbe
  Logik wie `ki` → beleg_lesen, Modus „email“: nur Rechnungen AN den Betrieb,
  eigene Rechnungen zählen nicht; liest auch die UID des Ausstellers).
  Rechnung → Eingangsrechnung „zu prüfen“ mit Datei im Bucket
  `eingangsrechnungen`, Positionen, Lastschrift/IBAN wie zuletzt beim Händler,
  `postfach_mail_id` (Pille „aus E-Mail“ auf `/eingang`), dazu
  `lieferant_gelesen`/`lieferant_uid` (wie die KI sie las — daraus lernt die
  Zuordnung). Gmail: Label „App: verarbeitet“ (wird angelegt), als gelesen nur
  bei Rechnungen und nur mit `als_gelesen`, nichts gelöscht/verschoben.
  - **Lieferant zuordnen** (`lieferantFinden`, nur eindeutige Merkmale —
    mehrdeutig = nicht zuordnen): UID (Kontakt oder frühere Rechnungen, nie die
    eigene) → Name/Schreibweise am Kontakt → IBAN wie frühere Rechnungen oder
    in der Kontakt-Notiz (nie die eigene) → dieselbe KI-Schreibweise wie früher
    (→ Name, unter dem die Rechnung heute steht, lernt aus Korrekturen) → ohne
    Rechtsform → Absender-Domain an Kontakt/Ansprechperson → Absender-Domain
    früherer Mails, nur wenn ein Wort der Domain zum Namen passt (keine
    Rechnungsplattformen; nie Freemail, nie die eigene Domain) → bisherige
    Schreibweise → wie gelesen. Kein unscharfer Vergleich. Wie zugeordnet,
    steht in der Notiz.
  - **Doppelt** (`doppeltFinden`, Kandidaten per RPC `eingang_doppelt_kandidaten`,
    nur Dienstrolle, unabhängig vom Namen): Nummern-Kern (nur Buchstaben und
    Ziffern, klein: „RE-2026/0815“ = „re 2026 0815“) gleich und gleicher
    Lieferant — oder gleiches Brutto und (las die KI ein Datum) gleiches Datum;
    kurze Nummern (< 4 Zeichen) ohne Datum nur bei gleichem Absender. Ohne
    Nummer: gleiches Datum + Brutto (≠ 0) + gleicher Lieferant oder Absender.
    Suche und Anlegen nehmen dasselbe Datum (gelesen, sonst Tag der Mail **in
    Wien**, `wienerTag` — die Function läuft in UTC).
  - **Grenzen** (Prüfung H2): PDF bis 10 MB, Bild bis 3,5 MB, 4 Anhänge je
    Mail (PDFs vor Fotos) — der Rest wird nie geladen, steht aber mit Grund in
    `postfach_mails.ungelesen`; nur Übergroßes → `fehler`, endgültig. Je Lauf
    6 KI-Lesungen, 30 MB, 110 s, gerecht auf die Postfächer verteilt (`anteil`;
    Reihenfolge: am längsten nicht abgerufen zuerst, dann Adresse). Neue Mails
    vor Wiederholungen. Base64 ohne Rückruf je Byte (`bytesBase64`,
    `base64Standard` — der Anhang geht als base64 an Claude, Bytes erst fürs
    Ablegen). 3 Versuche; hängt eine Mail nach dem 3. Versuch 10 Minuten in
    `in_arbeit` (Absturz) oder scheitert sie 3×, wird sie `fehler` mit Text
    in `ungelesen`. KI überlastet / Gmail 429/5xx / Netz (`voruebergehend`):
    Versuch zählt nicht, der Lauf hört auf.
- **Auslösen**: Knopf „Postfach abrufen“ auf `/eingang` (wenn ein Postfach
  einliest) und **pg_cron** alle 15 Minuten (`postfach_abruf_anstossen()` →
  pg_net mit Kopf `x-postfach-secret`; Adresse und Geheimnis in
  `postfach_verbindung`, nur per SQL eingetragen, nicht im Repo). Die Function
  prüft sonst JWT + Chef + Recht (`hat_recht_von`: testen = „Einstellungen“,
  abrufen = „Eingangsrechnungen“; `verify_jwt = false` in `config.toml`).
- **Tests**: `node tests/postfach-echttest.mjs <dienstkonto.json> <postfach> [an]`
  (Token, Lesen, Testmail — nur ePower-Postfach, ohne Datenbank);
  `tests/postfach-abruf-test.mjs` (Abruf gegen die Docker-Testumgebung des
  Roboters, ZZTEST-Mails, räumt sie in den Papierkorb; `POSTFACH_DOMAINS`,
  Standard `epowergmbh.at`); `tests/roboter/2026-11-18-postfach-haerten.mjs`
  (Gmail und KI nachgebaut, kein Netz: Doppelte, Zuordnung, Grenzen,
  Versuche, Domains, Rechte, mit `APP_URL` auch die Oberfläche); vitest
  `src/lib/postfach.test.ts`, `src/lib/postfachZuordnung.test.ts`.
