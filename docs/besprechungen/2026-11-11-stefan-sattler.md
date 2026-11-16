# Besprechung 11.11.2026 – Software-Vorstellung bei Stefan Sattler (SETEC GmbH)

Google Meet, 11.11.2026, 07:55 CET, Dauer 1:42. Dabei: Christoph Napetschnig (ePower) und Stefan Sattler (SETEC, Elektrik + PV, Kindberg-Mürzhofen).
Quelle: `~/Downloads/Software Vorstellung - 2026_11_11 07_55 CET – Recording.mp4`. Abschrift mit `meet2prompt`
(`~/Developer/_baukasten/transkripte/setec/software-vorstellung-2026-11-11/`). Die Stellen 08:25–20:00 und die
Kernzitate wurden mit gpt-4o-transcribe neu abgeschrieben, weil whisper-1 dort nur Füllsätze geliefert hat.
Arbeitsdateien und Standbilder: `/tmp/claude-1000/-home-devbox-Developer-mayr/d4c85aee-2962-468c-88d7-28f3bf0cab24/scratchpad/meeting-1111/`.

**Lesehilfe**
- Die Abschrift kennt keine Sprecher. Wer was sagt, ist aus dem Zusammenhang erschlossen: Christoph führt die
  Demo „Elektro Muster GmbH“ (mayr.vercel.app) vor, Stefan fragt nach und vergleicht mit „bei uns“. Zitate sind
  wörtlich aus der Abschrift (Dialekt geglättet, Hörfehler in eckigen Klammern berichtigt).
- **Geteilt hat nur Christoph.** Stefan hat keinen Bildschirm gezeigt, auch nicht seinen Kalender. Den Kalender
  beschreibt er nur mündlich (1:26:59–1:28:20). Das Bild seines Terminplaners kam erst mit der Mail vom 12.11.
  (siehe `docs/SETEC-WUNSCHLISTE.md`, Kopf).
- „O2“, „Odu“, „Modul“ in der Abschrift = **Odoo** (sein jetziges Programm; Datenblätter mit drei
  Sichtbarkeitsstufen, „Planning-Modul“ und Preise je Nutzer passen dazu). „Typhoon“, „Daifun“, „Taifunk“,
  „bei Foon“, „Daystone“ = **Taifun** (das alte Programm, gekauft; davon nutzt er nur noch den Kalender).
- Die Wunschliste („Wishlist ePower App.docx“) kam am **12.11.**, also nach diesem Termin. Wo ein Punkt schon
  in der Wunschliste steht, ist das in der Tabelle vermerkt. Was nur die Aufnahme liefert, ist mit **neu** markiert.

---

## 1. Kurzfassung

- Stefan hat am Ende zugesagt: „Ja, gefällt mir, gefällt mir gut“ (1:21:52), „gefällt mir wirklich gut“ (1:41:37).
  Er wollte einen Demo-Zugang zum Durchklicken und will dort den „klassischen PV-Prozess von uns nachbilden“
  (1:40:00, 1:40:26). Für die Woche darauf war ein Termin vor Ort ausgemacht.
- Heute arbeitet er mit **Odoo**. Für Planung und Einteilung nutzt er weiter den **Kalender aus Taifun**, weil
  „mit dem bescheuerten Planning-Modul [in Odoo] komme ich nicht voran, es ist unübersichtlich“ (1:27:18).
  In Taifun hat er „oben meine Mitarbeiter, die Kalendertage in Stunden unterteilt … wer ist wann wo, ich weiß
  am ersten Blick“ (1:27:29). Die Monteure sehen diesen Kalender nicht, deshalb jeden Morgen das Gespräch
  „wo fahren wir hin?“ (1:27:50).
- Was er am meisten will: Der Monteur sieht morgens am Handy, **wohin, mit wem und mit welchem Material**
  (20:48), und die Partie muss nicht ins Büro, um nach den Einzelheiten zu fragen (1:28:00). Die Startseite der
  Demo am Handy (oben heute, darunter morgen, Foto, Material, Navi, Anrufen, Erledigt, Kurzwege zu Projekt und
  Regie) hat ihm „wirklich gefallen“ (1:34:20).
- Die Mitarbeiter-App muss „idiotensicher“ sein: Stunden, Projekt mit Fotos, PV-Planung, Material ausfassen,
  „der Vierte überfordert wahrscheinlich eh schon“ (1:33:28). **Jeder** bekommt einen Zugang, auch die
  Lehrlinge. Bei Odoo hat er das wegen der Kosten je Nutzer nicht gemacht (1:25:57).
- Weitere Wünsche: Rechnung ändern, bis sie beim Steuerberater ist, das darf nur er (1:19:24, umgesetzt);
  Datenblätter am Artikel mit drei Sichtbarkeitsstufen (30:03); ein Artikel bei mehreren Händlern mit Preisen
  und EAN (39:04); **nie einen Überstundenzuschlag an Kunden verrechnen** (1:06:38). Das widerspricht dem
  heutigen Rechnungsimport.
- **Stand der App:** Die meisten Punkte sind seit den Paketen vom 13.–16.11. da. Es fehlen vor allem:
  - die Kalender-Ansicht „Mitarbeiter“ als Standard (heute öffnet die Gantt-Tafel, und genau so eine Ansicht
    lehnt er bei Odoo ab);
  - Abwesenheiten direkt in der Tafel eintragen;
  - die Materialliste im Einsatz;
  - der Schalter „kein Überstundenzuschlag“;
  - eine Push-Mitteilung, wenn sich ein Termin ändert;
  - eine Schriftgröße-Wahl;
  - Beratungsgespräche aufzeichnen.

---

## 2. Anforderungen und Wünsche mit Stand in der App

Legende: ✓ vorhanden · **teilweise** · **fehlt** · „WL“ = steht auch in der Wunschliste vom 12.11. · **neu** = nur aus der Aufnahme.
Pfade relativ zu `/home/devbox/Developer/setec/`.

| Zeit | Wunsch | Kernzitat | Stand | Beleg |
|---|---|---|---|---|
| 15:55 | Material vom Hauptlager in den Bus umbuchen, dann vom Bus zum Kunden (**neu**) | „wir haben es auch so gemacht, dass wir im Prinzip vom Hauptlager in den Bus umlagern und dann vom Bus zum Kunden“ | ✓ | `src/pages/Scan.tsx` (Modus `umbuchung`), `src/pages/Lager.tsx:290` „Bus auffüllen“ |
| 16:00 | Strichcode der Originalverpackung (gleicher Code für jedes Gerät in der Schachtel) (**neu**) | „Wir haben immer [die] Barcodes genommen, die auf den ursprünglichen Verpackungseinheiten sind“ | ✓ | Scannen über EAN/Strichcode am Artikel, KONZEPT „Strichcodes und Artikel-Import“ |
| 17:31 | Regiebericht am Tablet unterschreiben lassen, das wirkt professioneller (Christoph schlägt vor, Stefan stimmt zu) | „Das ist echt ein guter Punkt … da hast du absolut recht“ | ✓ | `src/components/regie/RegieEditor.tsx` (Unterschrift), läuft am Tablet |
| 20:48 | Morgens am Handy sehen: wohin, wer fährt mit, welches Material (**neu**, Kern seines Ablaufs) | „dass halt einfach in der Früh [man] nachsieht: okay, da fahre ich hin, der fährt mit, das Material brauche ich“ · „da sind wir jetzt halt blind aktuell, weil es über Odoo einfach zu umständlich ist“ | **teilweise**: Ort und Kollegen ✓, Material nur beim Ausfassen | `src/components/einsatz/EinsatzBereich.tsx`, `EinsatzDetails.tsx` (Adresse, wer dabei, Bus); Angebotsmaterial nur in `src/pages/Scan.tsx:266` (`useAngebotMaterial`), nicht im Einsatz |
| 22:38 | Schäden an den Fahrzeugen dokumentieren (**neu**) | „das passiert leider in letzter Zeit relativ häufig, dass die Jungs irgendwo [anfahren]“ | ✓ | `/fuhrpark`, `fahrzeug_eintraege` (Schaden mit Foto) |
| 23:17 | Buchhaltung schlank: grobe Kategorien, keine Konten (WL H) | „wir haben nur grobe Kategorien … aber ich buche auf keine Konten“ | ✓ | `src/lib/fibu.ts`, `src/components/buchhaltung/` (Kategorien) |
| 23:41 | Großhändler schicken monatliche Sammelrechnungen, die nicht je Projekt zugeordnet werden (**neu**) | „bei unseren Großhändlern meistens Sammelrechnungen, einmal im Monat eine große Rechnung“ | ✓ (zuordnen ist freiwillig) | `src/components/eingang/`, KONZEPT „Eingangsrechnungen“ |
| 24:17 | PV als Pauschale; Nachkalkulation nur, um die Richtung zu prüfen | „Da brauch ich jetzt keine großartige Nachkalkulation“ | ✓ (vorhanden, nicht aufdringlich) | `src/lib/nachkalkulation.ts`, Projekt → Nachkalkulation |
| 26:20 | Mehrere Kunden/Projekte am selben Tag in den Stunden | „Das heißt, man kann auch einen anderen Kunden auswählen?“ | ✓ | `src/components/zeiten/ZeitDialog`, `src/lib/zeitBloecke.ts` („Weiterer Block“) |
| 27:19 | Monteur legt kleine Baustellen selbst an (z. B. Genossenschaft: „Licht geht nicht“), scannt Material darauf (**neu**) | „so kleine Projekte, also kleine Aufgaben, ist natürlich eine [praktische] Geschichte“ · große Projekte „braucht er eigentlich nicht“ | ✓ | KONZEPT „Rollen“ (Projekte anlegen: Monteur ✓), `src/components/dialoge/ProjektDialog.tsx` |
| 29:14 | Datenblätter am Artikel gehen automatisch mit dem Angebot mit (WL E/F) | „wenn ich jetzt das Angebot [verschicke] … haut mir nachher das Dokument als Link oder als PDF ins Angebot dazu rein“ | ✓ | `src/components/belege/AngebotVersand.tsx`, `artikel_dateien` (Migration `20261113116000_artikel_lager.sql`), KONZEPT „Datenblätter“ |
| 30:03 | Je Datenblatt **drei Sichtbarkeitsstufen**: nur intern, mit dem Angebot, erst nach Auftrag (wie in Odoo) (**neu**) | „das soll verborgen bleiben, das ist nur für unsere interne Info, oder das möchte ich beim Angebot verschicken, oder das soll er erst dann kriegen, wenn er einen Auftrag unterschreibt“ | **teilweise**: heute je Angebot ankreuzen, keine Stufe am Artikel | `artikel_dateien.art` kennt nur `bild`/`datenblatt` (`20261113116000_artikel_lager.sql:48`) |
| 33:56 | Angebot diktieren statt tippen (in Odoo geht das nicht) | „was mich da noch ein bisschen stört, dass du [dort] nicht diktieren kannst … das ist ein Traum“ | ✓ | `src/components/belege/BelegEditor.tsx:1018` „Diktieren“, `src/lib/sprachParser.ts`, Startseite „Angebot vor Ort“ |
| 34:23 | EK und Aufschlag ausblenden, wenn der Kunde daneben sitzt (**neu**, gefällt ihm in der Demo) | „Aufschlag einblenden, ausblenden, wenn er gerade neben dir sitzt, das ist auch geil“ | ✓ | `src/components/belege/BelegEditor.tsx` („EK/Aufschlag ausblenden“) |
| 35:48 | Kosten je Mitarbeiter und Stunde; Techniker teurer als Elektriker (WL D) | „der Mitarbeiter kostet mir das in der Stunde, der kostet mir das …“ · „will ich jetzt die Qualifikation Techniker hinschicken oder einen normalen Elektriker“ | ✓ | `/mitarbeiter` „€“, `satzAm`, KONZEPT „Lohnkosten und Stundensatz je Mitarbeiter“ |
| 37:10 | Artikelbilder, wenn der Monteur im Katalog sucht (WL F) | „wenn jetzt der Monteur irgendwas sucht im Produktkatalog: Artikelbilder … das war für die Jungs super leicht“ | ✓ | `src/pages/Scan.tsx` (`useHauptbilder`), `src/components/material/ArtikelVorschau.tsx` |
| 37:28 | Kein Datanorm-Vollkatalog, eigener schlanker Artikelstamm (**neu**, am 15.11. umgesetzt) | „wir haben unseren Artikelstamm einmal manuell gepflegt … fahren eigentlich fast besser als mit der Datanorm“ | ✓ | `docs/SETEC-WUNSCHLISTE.md` „Sonepar-Artikelliste entfernt“, Artikel → Importieren |
| 39:04 | Einkaufsreiter: derselbe Artikel bei vier Händlern mit Preis, Händler-Artikelnummer und EAN (WL F) | „den kriegen wir ja bei vier verschiedenen Händlern zu vier verschiedenen Preisen … und welche Artikelnummer vor allem hat der?“ | ✓ | `artikel_lieferanten` (`20261113116000_artikel_lager.sql`), Artikel-Seite |
| 1:04:27 | Stunden am Monatsende abgleichen: Iststunden kürzen, ohne die Projektstunden anzufassen (Christoph bietet an, Stefan: „Okay, das passt“) (**neu**) | Christoph: „am Ende des Monats einfach die Sollstunden oder die Iststunden verändern … dass die Projektstunden nicht abgekürzt werden“ | **teilweise**: Korrekturen am Konto ja, ein eigener Monatsabgleich nein | `konto_buchungen` (Korrekturen Anfangsbestand/Auszahlung/Übertrag), `src/lib/zeitkonto.ts`. Hinweis: Aufzeichnungspflichten sind Sache des Betriebs, vor dem Bau klären |
| 1:06:38 | **Nie einen Überstundenzuschlag an den Kunden verrechnen**, außer bei Notfällen in der Nacht (**neu**) | „wir verrechnen zum Beispiel auch nie einen Überstundenaufschlag an einen Kunden … Ich bin froh, wenn die Jungs dann bis 6 oder 7 auf der Baustelle bleiben“ | **fehlt / Widerspruch**: der Import rechnet ×1,5 bzw. ×2 automatisch | `src/components/belege/importieren.ts:332` `ZUSCHLAG = { ue50: 1.5, ue100: 2 }`, KONZEPT Z. 327 |
| 1:09:08 | Beratungsgespräch beim Kunden aufzeichnen und zusammenfassen lassen, dazu eine Skizze am Tablet (Christoph bietet an, Stefan ist interessiert) (**neu**) | „Habe ich mir schon ganz oft gedacht. Ich bin da selber ein bisschen faul beim Mitschreiben … Ich habe dann meistens alles im Kopf.“ | **fehlt** (gibt es in anderen ePower-Apps als „Erstaufnahme“) | kein Treffer für Erstaufnahme/Skizze in `src/` |
| 1:10:32 | Alte Daten übernehmen (Kunden, Material, Angebote, Rechnungen), um bei einer Erweiterung die alte Rechnung nachzuschauen (WL H teilweise) | „Dann schaust du [in] die alte Rechnung, was hat der bei der ersten gehabt. Okay, da können wir so weiterbauen“ | **teilweise**: Altrechnungen nur zum Ausbuchen, Artikel-Import da; kein Archiv mit alten Positionen je Kunde | Buchhaltung → Altrechnungen, Artikel → Importieren; offen laut WL: Export aus dem alten Programm |
| 1:11:45 | Am Kunden ein Link zur Anlagenüberwachung (Fronius …) und ein Link zur Planung im SolarEdge Designer (WL C) | „an jedem Kundenkontakt auch einen Link zu seiner Fernüberwachung von Fronius … und einen Link zur SolarEdge Planung“ | ✓ | `src/components/kontakte/`, KONZEPT „Kontakte, PV-Anlagendaten und Karte“ |
| 1:12:43 | Kundenzugang/Kundenportal: **nicht nötig** | „Das finde ich jetzt in unserem Gewerk nicht ganz [passend]“ | – (nichts zu tun) | – |
| 1:13:28 | Wartungsverträge, PV-Reinigung alle drei Jahre (vermittelt, gegen Provision); Kunden mit PV anschreiben (Speicher-Förderung) (**neu**) | „Aktuell mit den Wartungsverträgen … drei Jahre Wartungsvertrag oder einmalige Anlagenüberprüfung, Anlagenreinigung“ | **teilweise**: Anlagen mit Prüf-Fälligkeit ja; Wartungsvertrag und Serienmail nein | `src/components/anlagen/`, `/anlagen` |
| 1:19:24 | Fertige Rechnung ändern, solange sie nicht beim Steuerberater ist; nur er darf das (WL-Punkt „Besprechung 11.11.“) | „solange ich es dem nicht geschickt habe … Rechnungstext ändern, Preis ändern“ · „es reicht, wenn ich ändern kann, es muss kein anderer können“ | ✓ | `rechnung_aendern`, Migration `20261115100000`, KONZEPT „Rechnung ändern“ |
| 1:25:57 | Jeder Mitarbeiter, auch die Lehrlinge, bekommt die App und bucht selbst; keine Kosten je Nutzer (**neu**) | „ich habe aus Kostengründen nicht an jeden Monteur eine App gegeben … Ich will, dass der das selbstständig macht“ | ✓ | Ein Link `/start`, sofort aktiv (`src/pages/Start.tsx`, KONZEPT „Konten“) |
| 1:27:18 | Kalender wie in Taifun: Mitarbeiter oben, Tage in Stunden unterteilt (WL B) | siehe Abschnitt 3 | **teilweise** | `src/components/plantafel/Terminplaner.tsx`; Standard ist aber die Tafel |
| 1:28:00 | Die ganze Partie sieht die Einzelheiten selbst, keiner muss ins Büro fragen (**neu**) | „wenn bei der klassischen Partie … einer zu mir ins Büro kommt und die Details [holt], können die anderen zwei schon herrichten … die warten sonst blöd umeinander“ | ✓ (Material siehe 20:48) | `src/components/einsatz/EinsatzDetails.tsx` (Notiz, Projektbeschreibung, wer dabei, Bus, Hinweise) |
| 1:32:58 | Material ausfassen per Scanner, ganz einfach | „dass er das Klump, was er aus dem Lager herausnimmt, mit dem Scanner anschießt“ | ✓ | `src/pages/Scan.tsx` |
| 1:33:28 | Mitarbeiter-App „idiotensicher“: Stunden, Projekt mit Fotos, PV-Planung, Material ausfassen (**neu**) | „die Mitarbeiter-App muss wirklich idiotensicher sein … und der Vierte überfordert wahrscheinlich eh schon“ | ✓ | `src/pages/Index.tsx:75` `START_MONTEUR`, `components/projekt/PlanungBereich` |
| 1:34:20 | Startseite am Handy: oben heute, darunter morgen, Foto, Material, Navi, Anrufen, Erledigt, Kurzwege zu Projekt und Regie (**neu**, gefällt ihm) | „ganz oben gleich: okay, wo bin ich heute eingeteilt, klar drunter, wo bin ich morgen eingeteilt … Shortlink ins Projekt und Regie“ | ✓ | `src/components/einsatz/EinsatzBereich.tsx:163–177` |
| 1:36:24 | Große Knöpfe für „Wurstfinger“, Tablet gut, Odoo am Handy unbrauchbar; Christoph zeigt die Schriftgröße-Wahl einer anderen App (**neu**) | „da soll ich die Wurstfinger gar nicht haben, dass er daneben drückt“ | **teilweise**: große Knöpfe und 16 px ✓; Schriftgröße-Wahl fehlt | Vorbild: Steinbrecher-App „Aa → Normal/Groß/Sehr groß/Extra groß“ (Standbild `bilder/0019.jpg`); in `src/pages/Einstellungen.tsx` nichts dergleichen |
| 1:40:00 | Demo-Zugang zum Durchklicken, PV-Ablauf nachspielen (**neu**) | „Hast du irgend so was … wo ich mich mal … durchklicken und probieren kann?“ | ✓ (Mail „Demo Zugang“ 12.11.) | `docs/SETEC-WUNSCHLISTE.md` Z. 6 |
| 14:17 | (Christoph sagt zu) Mitteilung, wenn sich ein Termin ändert | „Da muss man es jetzt so einbauen, dass du dann Mitteilungen bekommst, wenn Termine geändert werden“ | **teilweise**: Hinweis erst beim nächsten Öffnen, kein Push | `src/components/einsatz/EinsatzBereich.tsx:126` „Termin geändert“; keine Push-Funktion in `src/` oder `supabase/functions/` |
| 19:29 | (Christoph) Monteur sieht das Material aus dem Angebot ohne Preise | „dass der Mitarbeiter darauf zugreift, ohne die Preise … was muss er da jetzt mitnehmen“ | ✓ beim Ausfassen | `src/pages/Scan.tsx:266` (`angebot_material`) |
| 28:30 | (Christoph) Angebote und Rechnungen per E-Mail mit einem Klick verschicken | „mit einem Klick per E-Mail weggeschickt“ | **teilweise**: nur `mailto:` mit Link, kein Versand mit PDF-Anhang | `src/components/belege/AngebotVersand.tsx:216` |

---

## 3. Kalender, wie Stefan ihn will

### 3.1 Was er sagt (1:26:59–1:28:20, gpt-4o-Abschrift)

> „Und den Kalender zum Beispiel haben wir heute noch. Wir haben das [Taifun] damals gekauft … Und das Einzige,
> was ich von dem Programm noch verwende … ist der Kalender. Nur der Kalender. Weil mit dem bescheuerten
> Planning-Modul [in Odoo] komme ich nicht voran. Es ist unübersichtlich, ich komme mit der Einteilung nicht
> zusammen. Der [Taifun]-Kalender ist da, ich sage es mal so, ähnlich wie Gantt: Da habe ich im Prinzip oben
> meine Mitarbeiter, die Kalendertage in Stunden unterteilt, und habe super sauber drinnen, wer ist wann wo,
> und ich weiß am ersten Blick.“ (1:27:29)

> „Problem: … die Mitarbeiter haben das alle nicht … da musst du pro Mitarbeiter einen Zwanziger zahlen. …
> Jeden Tag in der Früh das Gespräch: wo fahren wir hin? Sonst schaut der in der Früh drauf. Und wenn bei der
> klassischen Partie, die aus drei Leuten besteht, einer zu mir ins Büro kommt und die Details [holt], können
> die anderen zwei schon herrichten und vorbereiten, Auto laden, Material einziehen. Die warten sonst blöd
> umeinander.“ (1:27:50–1:28:20)

Dazu passt 20:48: „in der Früh nachsehen: okay, da fahre ich hin, der fährt mit, das Material brauche ich“.
Und Christoph zeigt um 25:00 die Gantt-Tafel: „Du hast deine Partien dort, kannst die Partien tagesaktuell
umwerfen … und anhand dieser Einteilung kriegt der Mitarbeiter das dann aufs Handy“. Darauf sagt Stefan
nichts. Erst eine Stunde später sagt er, dass ihm genau das bei Odoo nicht taugt.

Ergänzend aus der Mail vom 12.11. (Bild seines Terminplaners, `docs/SETEC-WUNSCHLISTE.md` Z. 7–9): Spalten =
Mitarbeiter nach Gruppen (Geschäftsführung, Büro, Team 1, Team 2), Zeilen = Tage mit Stunden, Abwesend grün,
Krank rot, Einsätze orange.

### 3.2 Anforderungen, auf den Punkt gebracht

| Thema | Was Stefan will | Quelle |
|---|---|---|
| Achsen | **Spalten = Mitarbeiter** (oben), **Zeilen = Tage, je Tag in Stunden unterteilt**. Nicht als Gantt mit Leuten als Zeilen und Tagen als Spalten. Das ist Odoos Planning-Ansicht, die ihn stört | 1:27:18–1:27:35, Mail-Bild |
| Gruppen | Mitarbeiter gruppiert: Geschäftsführung, Büro, Team 1, Team 2 | Mail-Bild |
| Übersicht | „wer ist wann wo, am ersten Blick“: eine Woche aller Leute auf einem Bildschirm, ohne Klicken | 1:27:35 |
| Einteilung ändern | Partien „tagesaktuell umwerfen“, also schnell umhängen (Christoph, keine Widerrede) | 25:12 |
| Mehrere Baustellen am Tag | Einsätze mit Uhrzeit, mehrere je Tag und Person | 25:55, 26:20 |
| Wer sieht was | Chef/Büro planen. **Die Monteure sehen ihre Einteilung morgens selbst** („Sonst schaut der in der Früh drauf“), samt Kollegen und Material, ohne ins Büro zu kommen | 1:27:50, 20:48 |
| Abwesenheiten | Abwesend grün, Krank rot, im selben Bild | Mail-Bild |
| Gerät | Planen am PC im Büro. Lesen am Handy/Tablet. Odoo ist „nicht fürs Handy gemacht, sogar am Tablet grenzwertig“ | 1:35:54 |
| Mitteilung | Bei einer Änderung bekommt der Monteur eine Mitteilung (Christoph sagt zu) | 14:17 |
| Kosten | Keine Gebühren je Mitarbeiter. Jeder, auch der Lehrling, hat Zugriff | 1:27:45, 1:25:57 |

**Vorbilder und genannte Software**

| Software | Wie er sie sieht |
|---|---|
| Taifun-Kalender | **Vorbild**: gekauft, keine laufenden Kosten; Mitarbeiter oben, Tage in Stunden |
| Odoo Planning | Gegenbeispiel: Gantt, „unübersichtlich“, „ich komme mit der Einteilung nicht zusammen“ |
| Hero | teuer, „Oberfläche dermaßen veraltet und hässlich“ (1:24:37) |
| „Plantraft“ (vermutlich Plancraft, von Christoph genannt) | Abrechnung je Nutzer, abschreckend |

### 3.3 Was die heutige Plantafel davon schon kann

`src/pages/Plantafel.tsx`, `src/components/plantafel/Terminplaner.tsx`, `src/lib/terminplaner.ts`, KONZEPT
„Plantafel, Teams und Fuhrpark“ (Z. 655–720):

- ✓ **Terminplaner-Ansicht** (Umschalter „Tafel | Mitarbeiter“, am Handy „Liste | Leute“): Spalten = Leute nach
  Gruppen (Geschäftsführung, eigene Gruppen wie „Büro“ über `profiles.gruppe`, Teams, „Ohne Team“), Zeilen =
  Tage der Woche mit den Stunden 6–18. Sa/So nur, wenn dort etwas steht. Feiertage sind markiert, eine
  Jetzt-Linie läuft mit, rechts ein Monatskalender zum Springen.
- ✓ Einsätze als Blöcke mit Kunde, Titel und Zeit; Überlappendes steht nebeneinander. Leere Zelle antippen =
  neuer Einsatz für diese Person zu dieser Uhrzeit. Ziehen = andere Zeit, anderer Tag, andere Person
  (15-Minuten-Raster). Unterer Rand = Ende verschieben. „Rückgängig“ bleibt 8 s stehen. Konflikte (doppelt
  eingeteilt, abwesend) erscheinen rot.
- ✓ Abwesenheiten als Fläche (Urlaub/ZA grün, Krank rot, Schule/Arzt gelb). Kollegen sehen nur „abwesend“
  (View `abwesenheit_kalender`).
- ✓ Filter: Alle, eine Gruppe oder eine Person. Gruppen pflegt man im Teams-Dialog.
- ✓ Handy: „Tag“ (Leute untereinander, Zeit quer) oder „Person“ (Mo–Fr, Stunden nach unten), wischen = weiter.
- ✓ Monteur-Startseite: heute und der nächste Arbeitstag mit Adresse, Navi, Telefon, wer dabei ist, Bus,
  Notiz, Erledigt, Kurzwege zu Stunden, Material, Regie und Projekt (`EinsatzBereich.tsx`,
  `EinsatzDetails.tsx`). Echtzeit über einen Supabase-Kanal in der Plantafel.
- ✓ Die Gantt-Tafel bleibt für die Grobplanung (2 Wochen bis 3 Monate, Teams, Busse, Geräte, „Noch nicht
  eingeplant“).

### 3.4 Was fehlt, konkret zum Bauen

1. **Mitarbeiter-Ansicht als Standard.** `Plantafel.tsx:66` setzt den Standard auf `"tafel"` (die Gantt, die
   Odoos Planning gleicht). Für SETEC soll `"leute"` der Standard sein, am PC und am Handy. Eine gemerkte
   Wahl in `elektro.plantafel.sicht` bleibt gültig. Den Umschalter eventuell umbenennen in „Terminplaner |
   Grobplanung“, weil Stefan „Terminplaner/Kalender“ sagt. Am Handy beim Chef zuerst „Tag“.
2. **Abwesenheit direkt in der Tafel eintragen.** Heute geht das nur über `/zeiten` → `AbwesenheitDialog`
   (`src/components/zeiten/AbwesenheitDialog.tsx`, eingebunden nur in `src/pages/Zeiten.tsx:212`). Der
   Terminplaner zeigt Abwesenheiten nur an. `zelleDown` (`Terminplaner.tsx:308`) öffnet immer einen
   `TerminDialog`. Bauen:
   - Leere Zelle antippen öffnet eine kleine Wahl „Einsatz | Abwesenheit“, nur für den Chef.
   - Abwesenheit öffnet den `AbwesenheitDialog` mit `userId` und Tag, der Chef-Eintrag gilt sofort (Trigger
     `abwesenheit_regeln`).
   - Am PC zusätzlich: über mehrere Tage aufziehen = Zeitraum.
   - Die Abwesenheitsfläche antippen = bearbeiten oder löschen.
   - Den Platzhalter „z. B. Abnahme, Baubesprechung, Urlaub“ in `TerminDialog.tsx:254` ohne „Urlaub“
     schreiben: Urlaub ist kein Termin (KONZEPT Z. 329).
3. **Material im Einsatz.** Stefans Satz „das Material brauche ich“ verlangt eine Materialliste vor dem
   Ausfassen.
   - In `EinsatzDetails.tsx` eine Zeile „Material laut Angebot (n Positionen)“ einbauen, aufklappbar, ohne
     Preise.
   - Quelle ist `useAngebotMaterial(projektId)` aus `src/components/material/artikelDaten.ts` (heute nur in
     `Scan.tsx:266`). Dazu „schon ausgefasst“ gegenrechnen wie `ausfassVorschlag`.
   - Ein Knopf „Jetzt ausfassen“ springt zu `/scan?projekt=…`.
   - Optional: ein Notizfeld „Mitnehmen“ am Einsatz für Dinge ohne Angebot (Leiter, Steiger …).
4. **Push-Mitteilung bei Terminänderung** (Christoph hat sie zugesagt). Heute sieht der Monteur „Termin
   geändert“ erst beim nächsten Öffnen (`EinsatzBereich.tsx:126`, gemerkt in `elektro.termine.gesehen`).
   Bauen:
   - Web Push: Service Worker gibt es durch die PWA schon; neu sind eine Tabelle `push_abos` und eine Edge
     Function mit VAPID-Schlüsseln.
   - Ein Trigger auf `termine` (Insert, Update von `datum`/`von`/`bis`/`mitarbeiter`/`ort`, Delete) ruft die
     Funktion per pg_net, wie der Cockpit-Trigger bei den Änderungswünschen.
   - Empfänger sind alle alten und neuen `mitarbeiter`, nicht die Person, die geändert hat. Für „Erledigt“
     keine Mitteilung (gilt laut KONZEPT nicht als Änderung).
   - Text etwa „Morgen 7:00 Huber, Kindberg – jetzt mit Max“.
   - Hinweis: Web Push braucht am iPhone die installierte Home-App.
5. **Monteure und der Terminplaner.** Stefan: „Sonst schaut der in der Früh drauf“. Heute ist die Plantafel
   `nurChef` im Menü (`src/lib/navigation.ts:37`, seit Commit `3a432f1` vom 16.11. auch nicht mehr auf der
   Monteur-Startseite). Die Seite selbst ist für Monteure offen und nur lesbar (`darf = istChef`).
   Entscheidung bei Stefan einholen (siehe offene Fragen). Wenn ja:
   - einen Menüpunkt „Wochenplan“ für Monteure einbauen, nur lesend, Ansicht „Leute → Tag“;
   - Gruppe vorbelegt auf das eigene Team, Abwesenheiten anderer nur als „abwesend“ (ist schon so).
6. **Datenbank-Rechte zu Terminen.** `termine_aendern` erlaubt jedem aktiven Konto, jeden Termin zu ändern
   (`20261025100000_elektriker_grundschema.sql:906`). Nur die Oberfläche hindert Monteure am Verschieben.
   Wenn Monteure den Plan sehen sollen, das per RLS/Trigger enger fassen:
   - Monteur darf nur `status` (Erledigt) und nur bei eigenen Einsätzen ändern;
   - Monteur darf nur eigene Termine anlegen und löschen;
   - verschieben darf nur der Chef.
7. **Farbe der Einsätze.** In seinem alten Planer sind Einsätze **orange**, in der App haben sie die
   Projektfarbe (`projektFarbe`), ohne Projekt blau (`Terminplaner.tsx:161`). Er hat in der Aufnahme nichts
   dazu gesagt; die Frage steht seit dem 13.11. offen. Wenn orange gewünscht ist: Betriebs-Schalter
   „Einsätze einfarbig“ mit `--status-orange`. Die Projektfarbe dann nur als linker Streifen.
8. **Mehr als eine Woche im Terminplaner?** Heute zeigt er genau eine Woche (Mo–So). Ob Stefan in Taifun weiter
   vorausschaut, ist unklar. Falls ja, am PC „2 Wochen“ als zweite Stufe anbieten (Zeilen = 10 Arbeitstage,
   Stundenraster enger).
9. **Klein:**
   - Im Block steht heute Kunde → Titel → Zeit. Den Ort oder die Projektnummer hat Stefan nicht verlangt;
     erst am Bild seines Planers prüfen, was dort je Zelle steht.
   - `stundenBereich` beginnt bei 6:00. Wenn SETEC um 6:30 oder 7:00 anfängt, die Stunden von–bis in den
     Betriebs-Einstellungen festlegen.

---

## 4. Monteure am Handy: was sie sehen sollen und was nicht

**Sollen sehen und können** (Stefan 1:33:28, 1:34:20, 20:48, 1:28:00, 27:19, 37:10):
- Ganz oben „wo bin ich heute eingeteilt“, klar darunter „wo bin ich morgen eingeteilt“. Weiter runter muss er
  nie. ✓ `EinsatzBereich.tsx`
- Navigation zur Baustelle, Kunde anrufen, Kollegen der Partie sehen und anrufen. ✓ `EinsatzDetails.tsx`
- Foto direkt aufs Projekt. ✓ Schnell festhalten „Foto“
- Material ausfassen per Scanner, mit Artikelbildern und dem Angebotsmaterial ohne Preise als Vorschlag. ✓
  `Scan.tsx`. Die Liste „was muss ich mitnehmen“ schon im Einsatz fehlt (3.4 Punkt 3).
- Stunden schreiben, mehrere Baustellen am Tag. ✓ `ZeitDialog`
- Kurzwege ins Projekt und zur Regie („Kunde sagt: hängen wir noch eine Lampe auf → Regie drücken, Lampe,
  Stunde, aus“). ✓ `EinsatzBereich.tsx:175–177`
- Erledigt drücken, wenn die Baustelle fertig ist. ✓
- Projekt als Vorschau: Fotos und die PV-Planung (PDF). ✓ `PlanungBereich` im Projekt. Im Einsatz gibt es den
  Plan nicht direkt (über „Projekt“). Einen Knopf „Plan“ in `EinsatzDetails`, sobald `dateien.planung`
  existiert, prüfen.
- Kleine Baustellen selbst anlegen (Genossenschaft: „Licht geht nicht“) und Material darauf buchen. ✓
- Auch Lehrlinge buchen selbst. ✓ Jeder registriert sich über `/start`.
- Große Knöpfe, „idiotensicher“, nur das Nötige. ✓ `START_MONTEUR` mit 8 Zielen. Fehlt: Schriftgröße
  einstellbar (Vorbild Steinbrecher-App).
- Mitteilung, wenn sich der Termin ändert: **teilweise**, siehe 3.4 Punkt 4.

**Sollen nicht sehen** (Christoph nennt es als Grundeinstellung, Stefan widerspricht nicht):
- Rechnungen, Angebote und Preise: „standardmäßig eingestellt, dass der Mitarbeiter keine Rechnungen, keine
  Angebote sieht, aber das ist eh klar“ (19:19). ✓ Per RLS gesperrt (KONZEPT „Rollen“).
- Einkaufspreise im Material aus dem Angebot (19:29: „ohne die Preise“). ✓ `angebot_material` ohne Preise.
  Ob der Monteur EK-Preise sehen darf, steht noch als Frage in der Wunschliste (Z. 84–86). Stefan hat dazu
  nichts gesagt.
- Mehr als vier Funktionen, sonst ist er überfordert (1:33:28). Das spricht dagegen, Monteuren weitere Menüs
  freizuschalten. Kalender nur lesend und nur, wenn Stefan das will.

---

## 5. Offene Fragen und Unklares

1. **Sollen Monteure den ganzen Wochenplan sehen** (nur lesend) oder nur heute/morgen auf der Startseite?
   Stefans „Sonst schaut der in der Früh drauf“ spricht für den Plan. Seit dem 16.11. ist die Plantafel für
   Monteure aus dem Menü genommen.
2. **Einsätze orange oder in Projektfarbe?** In der Aufnahme nicht besprochen, offen seit dem 13.11.
3. **Wer gehört zu „Büro“, und was darf das Büro?** Christoph erwähnt „eine Bürorolle oder mehrere Bürorollen“
   (19:06). Stefan sagt nichts dazu. Offen laut Wunschliste.
4. **Wie weit plant er voraus?** Eine Woche oder mehr in der Stundenansicht? Und ab welcher Uhrzeit beginnt
   der Tag bei SETEC?
5. **Monatsabgleich der Stunden** (1:03:49–1:05:36): Will er eine Funktion „Iststunden am Monatsende
   festlegen, Projektstunden bleiben“? Er sagte nur „Okay, das passt“, die Idee kam von Christoph. Vor dem Bau
   mit ihm klären, was er genau braucht und was Arbeitszeitaufzeichnung und Lohnverrechnung verlangen.
6. **Überstundenzuschlag**: Soll er nie auf die Rechnung kommen? Oder nur ausnahmsweise (Notfall in der
   Nacht), also standardmäßig aus und je Rechnung zuschaltbar?
7. **Datenblätter mit drei Stufen** (intern, mit Angebot, nach Auftrag): Will er das genau wie in Odoo, oder
   reicht das Ankreuzen je Angebot?
8. **„Das schaut mir zu nach Tabelle aus“** (35:04): Gesagt beim Vergleich der Angebotsansichten; wer es sagt
   und welche Ansicht gemeint ist, ist unklar. Darauf Christoph: „wir haben auch die Möglichkeit, dass du rechts
   im PDF arbeitest“. Am 17.11. zeigen lassen, wie er Angebote schreiben will.
9. **Alte Daten**: Welche Daten kommen aus Odoo, welche aus Taifun? (Kunden, Artikel, Angebote, Rechnungen mit
   Positionen für „was hatte der Kunde beim ersten Mal?“) Der Export fehlt noch, so steht es auch in der
   Wunschliste.
10. **Wartungsverträge, PV-Reinigung, Serienmail an PV-Kunden** (Speicher-Förderung): Erzählt als
    Geschäftsidee. Gewünscht als Funktion?
11. **Beratungsgespräch aufzeichnen und Skizze am Tablet**: Stefan war interessiert („habe ich mir schon ganz
    oft gedacht“), bestellt hat er es nicht ausdrücklich.
12. **Erste 8 Minuten** der Aufnahme sind still bzw. Mikrofonprobleme. Inhaltlich fehlt nichts: ab 08:25 Begrüßung
    und Bildschirmfreigabe, ab etwa 10:30 stellt Christoph sich und ePower vor, ab 13:50 läuft die Demo.
13. **Wer spricht?** Die Zuordnung ist erschlossen. Bei 33:10–35:10 (Diktieren, EK ausblenden, „Tabelle“) ist
    sie am unsichersten.
