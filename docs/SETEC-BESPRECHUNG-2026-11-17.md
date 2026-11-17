# SETEC – Besprechung vor Ort am 17.11.2026 (Kalender, Erstaufnahme, Regie ohne Projekt)

Quelle: Plaud-Aufnahme, rund 70 Minuten, Christoph Napetschnig bei Stefan Sattler. Abschrift und
Plaud-Zusammenfassung stehen im CRM (`crm.besprechungen`, Kunde SETEC, `beginn` = 17.11.2026).
Für den Umbau „zentraler Kalender statt Plantafel/Gantt, Erstaufnahme vor dem Angebot, Regiebericht ohne
Projekt“ ist hier alles gesammelt, was Stefan dazu gesagt und geschickt hat.

**So ist die Abschrift zu lesen:**
- Speaker 1 = Christoph, Speaker 2 = Stefan, Speaker 3 = eine dritte Stimme, kommt selten vor. Plaud
  ordnet die Sprecher oft falsch zu. Ein Satz steht manchmal bei Speaker 1, obwohl er inhaltlich von
  Stefan kommt, und umgekehrt (z. B. Z. 476).
- Die Abschrift ist stellenweise sinnentstellt (Dialekt, Nebengeräusche). Die Zitate unten sind wörtlich
  übernommen, eckige Klammern sind meine Ergänzungen. Die Zahlen „Z. …“ verweisen auf die Zeile in der
  Abschrift.
- Zwei Programme kommen vor. Mit **Odoo** arbeitet SETEC heute. Den alten **Terminplaner** (nach der
  Besprechung vom 11.11. ist das Taifun) hat SETEC gekauft und nutzt ihn weiter nur für die Planung.
- Ein Großteil der Besprechung ging um Mail, Datenübernahme, Hersteller (Solax, Fronius …), Wärmepumpen
  und die neue Halle. Das kommt hier nur vor, wo es die drei Umbau-Themen berührt.
- Früheres zum Kalender: `docs/besprechungen/2026-11-11-stefan-sattler.md` Abschnitt 3 und
  `docs/SETEC-WUNSCHLISTE.md` Zeile B.

---

## Kalender-Vorlage (das Bild, das Stefan geschickt hat)

**Fundort:** Stefan hat das Bild am **12.11.2026, 18:41** per Mail an hallo@ geschickt, Betreff
„Re: Demo Zugang und Angebot“, zusammen mit „Wishlist ePower App.docx“.
- CRM `crm.app_wuensche` (app_key `setec`, zwei Einträge vom 12.11.2026, 17:45 UTC, Status „abgelehnt“,
  weil sie nur als Unterlage dienen). Text: *„Siehe angehängtes Bild des aktuellen Kalenders, der als
  Vorlage/Orientierung für die Kalenderdarstellung in der App dienen soll, da dieser aktuell sehr
  übersichtlich ist. Kunde ist aber auch offen für neue Ideen und Vorschläge zur Kalenderdarstellung.“*
- Datei im Speicher des CRM-Projekts (`xyhgckqxowqnzjtoblfs`), Bucket **`cockpit-wuensche`**, Pfad
  **`mail/1a1d0da872197041/Screenshot_2026-11-12_184040.png`** (113 KB). Daneben liegt `Wishlist_ePower_App.docx`,
  die auch unter `~/Downloads/Wishlist ePower App.docx` gespeichert ist.
- Nicht in SETECs Tabelle `aenderungswuensche`: Dort stehen nur sechs Wünsche vom 16.11.
  (Lieferschein, Eingangsrechnungen, Lieferanten, Google Places), keiner zum Kalender. Auch nicht in
  `~/Downloads` (dort liegt nur die docx), nicht in `_baukasten/transkripte/setec` und nicht in der
  Sicherung `2026-11-13-setec-probedaten` (dort nur `termine.json` mit zwei App-Terminen).
- Zum Wiederholen: Mit dem Service-Schlüssel des CRM über die Storage-API holen
  (`/storage/v1/object/cockpit-wuensche/<Pfad>`).

**Was auf dem Bild zu sehen ist** (Windows-Programm „Terminplaner“, Bildschirmfoto):

| | |
|---|---|
| Fenster | Titel „Terminplaner“. Menü „Drucken · Einstellungen · Extras“. Leiste: **Tag · Woche · Monat · Zeitleiste**, Auswahl „&lt;Alle Mitarbeiter&gt;“, Pfeile zurück/vor, Anzeige „44. Woche 2026“. Aktiv ist **Woche** |
| Spalten | **Je Mitarbeiter eine Spalte, darüber die Gruppe.** Gruppen von links: **Geschäftsführung** (1: Stefan) · **Büro** (2) · **Team 1** (2) · **Team 2** (5) · **&lt;unbekannt&gt;** (1). Zusammen 11 Spalten, alle gleich breit, Namen in Großbuchstaben „NACHNAME VORNAME“ |
| Zeilen | **Die Tage untereinander** (Mo 26.10. bis Fr 30.10.2026, links Wochentag und Datum). **Jeder Tag hat eine Stundenleiste von etwa 6 bis 17 Uhr** mit einer Zeile je Stunde. Zwischen zwei Tagen liegt ein hellblauer Trennbalken. Der Montag (26.10., Nationalfeiertag) ist ganz hellgelb hinterlegt und leer |
| Einträge | Rechtecke mit einem dünnen blauen Streifen links. Text = **Kundenname, darunter eine Kurzbeschreibung**, z. B. „&lt;Kunde&gt; / PV Erweiterung“, „&lt;Kunde&gt; – PV Anlagenmontage“, „&lt;Kunde&gt; Notstromumschaltung einbauen und Batterien“, „&lt;Kunde&gt; PV Montage &lt;Ort&gt;“. Mehrtägige Einsätze laufen als **ein durchgehender Block über die Tagesgrenzen** (z. B. Di–Do in Team 1). Kurze Termine sind nur ein bis zwei Stunden hoch |
| Farben | **Orange** = Montage/Baustelle (ganztägig, mehrtägig). **Hellgrün (gelbgrün)** = „Abwesend“, auch über die ganze Woche in einer Spalte (mit kleinem Einklapp-Pfeil), außerdem einzelne kürzere Arbeiten (halber Tag „PV Erweiterung“, im Chef-Feld „Rechnungen und …“). **Rot** = „Krank“ (Di–Do eines Monteurs). **Weiß** = Termine des Chefs und des Büros (Besichtigungen, z. B. „Besichtigung Verteiler &lt;Kunde&gt;“, „&lt;Kunde&gt; Sprechanlage“) |
| Gleicher Einsatz für mehrere | Ein Einsatz steht in jeder beteiligten Spalte als eigener Block mit gleichem Text (z. B. dieselbe PV-Montage bei zwei Leuten aus Team 2 und dem Mann aus „&lt;unbekannt&gt;“) |
| Rechts | Spalte mit **Monatskalendern untereinander** (Oktober 2026 bis März 2027) samt KW-Nummern. Die gezeigte Woche und „heute“ sind markiert. Unten „Heute: 12.11.2026“ |

Lesart: Das ist genau „oben meine Mitarbeiter, die Kalendertage in Stunden unterteilt“ (11.11.) und
entspricht dem heutigen Terminplaner der App (`src/components/plantafel/Terminplaner.tsx`). Abweichend
davon: Gruppen-Kopfzeile über den Namen, Tage untereinander in **einer** langen Spalte (nicht 7 Tage
nebeneinander) und mehrtägige Einsätze als durchgehender Block. Die Wishlist sagt dazu nur
„Kalender – X und Y Achse ändern – Schreiben in der Projektauswahl (Projektsuche)“.

*Datenschutz: Dieses Repo ist öffentlich. Mitarbeiter- und Kundennamen vom Bild sind hier absichtlich
weggelassen.*

---

## a) Stefans bisheriger Kalender – Aussehen, Funktion, wer was sieht

**Odoo-Kalender und Odoo-Plantafel: das Gegenbeispiel**
- „Und mein größtes Problem war immer bei dem Programm, das ist unser Kalender, mit dem wir arbeiten. Den
  haben wir eh schon abgespeckt …“ (Z. 81)
- „Kalendermäßig ist das Behindertste, was ich jemals gesehen habe in meinem Leben.“ (Z. 82)
- „Der Kalender ist nett. Da kann ich aber keine Termine eintragen. Also ich kann nur meine eigenen Termine
  eintragen. Ich kann es aber mit keinen Kunden verknüpfen. Ich kann wirklich nur benennen.“ (Z. 84–85)
- „Wenn ich dann meine Mitarbeiter einteilen will, gibt es eine Plantafel, wo der gleiche Scheiß ist, wo du
  überhaupt nicht klarkommst.“ (Z. 86–87)
- „Veröffentlichen“ in Odoo: „… wenn ich es veröffentliche, sollte der Kunde eine Termininfo bekommen. Der
  bekommt auch ein Kunde, aber nicht der Kunde, der was mit dem verknüpft ist.“ (Z. 89–90) → „Seitdem nutzen
  wir es nicht mehr, weil es natürlich datenschutztechnisch ein kompletter Horror ist“ (Z. 92), und noch
  einmal: „Wenn dann irgendein Kunde eine E-Mail miteinander, seine Kundendaten und seinen Termin kriegt, ist
  ja krank, das kannst du nicht machen“ (Z. 498).
  → **Für den Umbau:** Eine Terminmitteilung an Kunden darf nur an den verknüpften Kunden gehen. Sonst lieber
  gar keine.
- „Überladen, sinnlos. Macht Sachen, die du nicht verstehst. Du kannst nichts ändern. Also terminplantechnisch
  der komplette Supergau“ (Z. 93)

**Der alte Terminplaner (gekauft): damit plant SETEC heute**
- „… deswegen sind wir da bei der Planung einfach drin geblieben. Derweil. Und haben halt die Software noch
  laufen, die kostet nichts, die haben wir damals gekauft und ist ok.“ (Z. 93)
- Christoph: „Das ist der Kalender, im Endeffekt einfach für deine Grobplanung.“ Stefan: „Genau.“ Auf die
  Frage, ob es nicht um die Einteilung geht: „**Da ist die Einteilung auch.** … Ein aktuelles Problem ist,
  **die Mitarbeiter haben keinen Zugriff mehr darauf.**“ (Z. 94–97)
- Wer sieht ihn: „Genau, **für uns im Büro**, da sind auch die Mitarbeitertermine drinnen, also
  **Besichtigungen** etc. Das klopfe ich immer alles da rein, weil ich es mit nichts großartig verknüpfen muss
  … **Krankenstände** etc.“ (Z. 99)
- Aussehen: siehe „Kalender-Vorlage“ oben. Spalten = Mitarbeiter nach Gruppen, Zeilen = Tage in Stunden,
  orange/grün/rot/weiß.

**Was Stefan heute an der App-Ansicht gefallen hat (Christoph zeigt Plantafel/Gantt und Kalender)**
- Gantt: Stefan sucht noch den Kalender („Den habe ich nämlich auch noch nicht gefunden“, Z. 382).
  Christoph: „normal ist es immer so, du hast so eine normale Einteilung, also so die Plantafel und dann …
  das ist jetzt so einfach ein Kalender.“ Er fragt: „Wenn du ihn im Kalender einträgst oder wenn du ihn auf
  der Plantafel hast?“ Stefan: „Ist das ein Unterschied?“ (Z. 386–389)
- **Woche, nicht Monat:** „Warte mal, geht das wohl im Monat auch. Aber dann wird es natürlich
  unübersichtlich. **Vergiss es, gefällt mir schon gar nicht mehr.** Wir sind ja meistens da, dass wir dann
  **in der Wochenansicht** sind und dann da eben durch. Okay, passt, haben wir Zeit, haben wir keine Zeit“
  (Z. 392). „… in der Ansicht finde ich halt vom Text her und alles deutlich übersichtlicher, weil ich viel
  mehr Platz habe.“ (Z. 393)
- **Ein zentraler Ort:** Christoph: „dann hast du einen zentralen Ort.“ Stefan: „Kalender, da habe ich auch
  meine Termine.“ (Z. 396–397)
- **Gantt weg:** Gantt-Ansichten bei anderen Kunden findet Stefan „Furchtbar“. „Ich komm mit sowas nicht klar.
  Ich seh zu wenig. Ich tu mir bei der Einteilung schwer und wenn der dann drei Baustellen an einem Tag hätte
  … zwei Baustellen, drei Baustellen, vier Baustellen. Ja, vergiss das. Du kommst gar nicht mehr klar. …
  du kannst ja nie sagen, am ersten Blick ist noch was frei.“ (Z. 421–424). Über den Kalender: „finde ich
  brutal übersichtlich.“ (Z. 425). Christoph: „**Weil das Gantt tun wir ja weg.** Genau.“ (Z. 431)
- **Breite der Spalten:** „wenn mehr Mitarbeiter sind, wird es eh schmäler werden, oder?“ Christoph: „jetzt
  haben wir nur zwei“ (Z. 385–386, 409–410). Das muss also mit rund 11 Spalten noch lesbar bleiben.
- **Teams:** „da haben wir dann immer die Teams. … es sind immer die zwei Jungs beieinander, es sind immer noch
  die drei Jungs beieinander und die anderen schieben wir halt ein bisschen umeinander, wo wir es gebrauchen“
  (Z. 426). Stefan: „Ja, nein, **wir lassen es drin**, oder?“ (Z. 428). Gemeint sind die Teams, vermutlich
  auch die Geräte, siehe nächster Punkt.
- **Geräte und Fahrzeuge in den Kalender:** „Ich finde es auch lässig, dass … du eben gerade **Steiger** so was
  dazuziehen kannst. Das ist lässig, weil das haben wir nämlich öfter mit den größeren Maschinen.“ (Z. 428).
  Christoph: „die Frage ist, ob man das dann im Kalender einbauen kann.“ Stefan: „Ja, hätte ich gesagt …
  **wenn da [etwas] herum oder irgendwo im Kalender oder zum Aufklappen ist**, ist das viel lässiger, [z. B.]
  der kriegt einen Steiger dazu, der kriegt ein **Kernbohrgerät** dazu und so weiter.“ (Z. 429–433). Weiter:
  „**Messgeräte** haben wir nicht einmal eingepflegt, macht aber natürlich Sinn. **Maschinen**, gerade die,
  die unterwegs sind, **Anhänger, Autos, Steiger**, optimal.“ (Z. 441)
- Christoph am Ende: „Der Wochenplan ist eh schon relativ cool … und oben noch, dass du halt die Geräte und
  die Steiger halt noch einteilen kannst“ (Z. 506). Und: „das baue ich jetzt auch noch ein bisschen um. Dass
  … du da oben gar nicht umschalten kannst, oder brauchst.“ Stefan: „Brauch ich denn nicht, aber gar nicht.“
  (Z. 502–505). Also kein Umschalter Tafel/Kalender mehr.

**Abwesenheit, Krankenstand**
- Stehen heute im Terminplaner („Krankenstände etc.“, Z. 99; auf dem Bild „Abwesend“ grün, „Krank“ rot).
- Für die App: „Und da klopfe ich nämlich auch meine Termine hin, wenn ich sage, ich habe da jetzt einen
  Besichtigungstermin, **Abwesenheit ist klar**.“ (Z. 400–401). Abwesenheiten gehören also selbstverständlich
  in denselben Kalender.

**Google-Kalender**
- Christoph: „Ich weiß nicht, ob du es brauchst, dass du es mit Google irgendwie verknüpfst?“ Stefan: „**Weiß
  ich noch nicht.** Habe ich derweil nicht gehabt. Ich habe es einmal probiert, dass ich es zusammenbringe,
  habe es aber nicht geschafft. … Was natürlich voll lässig ist.“ (Z. 404–407) → **offen**, kein Muss.
  (SETEC nutzt Google Workspace/Gmail, Z. 5–20.)

---

## b) Termine anlegen, Einteilung der Mitarbeiter

**Termin anlegen: Kunde zuerst, dann Projekt oder Adresse**
- „Da wäre es vielleicht cool, … mit Adressvorschlägen super, **wenn man Kunden auswählen kann**. Ich habe mir
  nämlich jetzt auch bei mir, wenn ich so, okay, ich [mache] meine Termine für Besichtigung. So wie [jetzt]
  **kann [ich] nur Projekte auswählen** … vielleicht, **wenn ich den Kunden auswähle, dass ich dann auch nur
  seine Projekte sehe**, dann tun wir doch super vielleicht.“ (Z. 508–510)
- „Ja, und dann auch so, okay, jetzt fahr ich zum Huber Sepp und **der ist nur eine Besichtigung**, wähle den
  Huber Sepp aus und **habe da unten zwei Adressen drinnen** und dann bin ich eigentlich schon fertig mit
  Termin.“ (Z. 511)
  → Ablauf: **Kunde wählen → (optional) eines seiner Projekte → Adresse aus seinen Adressen wählen (oder per
  Google Places) → fertig.** Eine Besichtigung braucht **kein Projekt**.
- Termine im selben Kalender: Besichtigungen, eigene Termine, Abwesenheit (Z. 397–403): „dass ich meine
  Termine selbst auch [eintrage].“

**Wie die Mitarbeiter ihre Einteilung sehen**
- Christoph: „**Nach der Kalendereinteilung** werden auch die Mitarbeiter … Also nach der Einteilung sehen die
  das dann auch. So wie wir dann gesehen haben auf der Startseite“. Stefan: „Genau so.“ (Z. 398–400)
- Bei der Anmeldung als Mitarbeiter (Stunden, Regieberichte, Lieferscheine, Einstellungen) sagt Stefan:
  „Das ist eben das Gute. Sicher, **wo bin ich heute, wo bin ich morgen?** Fertig.“ (Z. 374–378)
- Heute können die Monteure den Terminplaner nicht sehen (Z. 97). Die App soll das ersetzen.
- Die Teams bleiben (feste Paare und Dreier, dazu ein paar „Springer“, Z. 426).

---

## c) Erstaufnahme (Besichtigung vor dem Angebot)

**Wann und wer**
- Vor dem Angebot, beim Kunden vor Ort: „weil ich muss ja trotzdem **vor der Angebotslegung** noch mal [hin],
  bin ich beim Kunden.“ (Z. 524). Stefan fährt selbst hin, als Chef und Verkäufer („Jetzt fahre ich dort zur
  Familie Leitner zum Beispiel, das anschauen“, Z. 523). Manchmal fährt ein Vertriebler oder Klaus hin
  (Z. 113, im Zusammenhang mit der Karte).
- Der Termin dazu ist die „Besichtigung“ im Kalender (siehe b).

**Was erfasst wird**
- „Genau, dass ich sag, **die Fotos, die Fotos vielleicht beschriften**, da gehört das hin, da gehört das hin,
  **der Kunde hätte gerne 10 kW** …“ (Z. 525)
- „… dass ich sag, okay, ich hab da dann eben **einen Sheet, wo ich mitschreibe**, okay, 10 kW …, das und das,
  ist vielleicht **eine kleine Skizze zeichnen**. Genau. **Die Fotos dazu rein und fertig.**“ (Z. 527–528)
- Christoph: „du brauchst einfach so was wie eine **Erstaufnahme**.“ Stefan: „Genau, Erstaufnahme ist richtig.“
  (Z. 529–530)
- Am Tablet direkt aufs Foto schreiben oder zeichnen: „wenn du das jetzt über das Tablet machst, dass du gleich
  was dazu schreiben könntest.“ Christoph: „Oder zeichnen?“ Stefan: „Genau. Weil ich hab das ganz oft, dass
  ich da ein Foto hintue und dann muss ich mir das aber rausholen und dann muss ich heraußen schreiben und
  zeichnen, das dann wieder neu hochladen.“ (Z. 144–146). Christoph: „das geht eh schon.“ Danach zeigt Stefan
  einen Stift am Tablet („Da ist ein Stift draußen. Ah, siehst du? Ja, perfekt.“, Z. 154). „Am Handy ist es
  mühsam“, beide sind sich einig (Z. 155–157).
- **Messwerte:** In der Abschrift nennt Stefan zur Erstaufnahme **keine bestimmten Messwerte**. Konkret ist
  nur die Kundenwunsch-Größe („10 kW“). Die Plaud-Zusammenfassung schreibt „Messwerte, Kundenwünsche und
  Fotodokumentationen“, das ist aus der Abschrift nicht belegt. → **offen** (nahe liegend für PV:
  gewünschte kWp/Speicher, Dachart und -fläche, Zählerplatz/Verteiler, Netzanschluss, Einspeisebegrenzung).
  Messwerte nennt er nur bei der Prüfung: „Meistens holen wir uns die Werte vom Wechselrichter aus. Der hat
  diese Isolationsmessung [?] drin, Strom, Spannung“ (Z. 452), das gehört aber zum Prüfprotokoll.

**Wie es zum Angebot und zum Projekt wird**
- Der Monteur soll später sehen, was besprochen wurde: „dass ich dann rüberschreiben kann, **was dann der
  Mitarbeiter irgendwo sieht**, … was ist denn da ausgeredet worden“ (Z. 532)
- Christoph: „der weitere Prozess ist dann, du machst das Angebot, im besten Fall wird es angenommen, dann wird
  es ein Projekt. Und bei uns sieht man die ganzen Dokumente drin, was du auch schon bei der Erstaufnahme
  erstellt hast.“ Stefan: „Genau, mit den Sachen“ (Z. 533–535)
- **Projekt erst nach Annahme:** Stefan: „wann würdest du ein Projekt anlegen?“ Christoph: „Wenn das Angebot
  angenommen ist.“ Stefan: „**Passt, weil sonst [müllt] man sich ja mit Projekten zu.**“ (Z. 514–516; nochmal
  Z. 519–520: „Das passt ja, weil sonst hast du so viele Projekte.“). Christoph verweist auf die Projekt-Status
  „Angebot“ und „In Arbeit“ (Z. 517–519).
  → **Widerspruch zum heutigen Stand der App:** Dort wird ein Angebot als Projekt mit Status „Angebot“
  angelegt. Stefan will, dass vor der Annahme kein „Projekt“ in der Liste steht. Die Erstaufnahme hängt
  also am **Kunden** (und an der Besichtigung), nicht an einem Projekt.

**Dokumentenordner für Monteure**
- In Odoo musste SETEC den Ordner je Projekt selbst bauen: „wenn du ein Projekt anlegst, hast du wieder einen
  Dokumentenordner erstellen müssen. Das haben wir jetzt eh selber … automatisiert gehabt … Für die
  Mitarbeiter draußen im Feld ein Horror.“ (Z. 134–135). „Pro Kunden, pro Projekt haben wir vielleicht gerade
  unterteilt, dass man einfach die Fotos irgendwo gesammelt hat.“ (Z. 138)
- Christoph: „wenn du jetzt ein Projekt … mit deinem Kunden machst, dass in dem Dokumentenordner einfach schon
  deine Fotos von dem Kunden … drinnen sind, dass das der Mitarbeiter dann sieht … gehe ins Projekt rein und
  … sehe automatisch …“. Stefan: „Genau, sicher, **was ist besichtigt worden**“ (Z. 141–143)
  → Fotos und Notizen der Erstaufnahme wandern bei Annahme automatisch in die Dateien des neuen Projekts und
  sind für die Monteure dort sichtbar.

**Angebot daraus**
- Angebote künftig in **Leistungsblöcken mit verdeckter Kalkulation**, z. B. „Unterkonstruktion Ziegeldach“
  aus Dachhaken, Schiene und Klemmen samt Montagezeit, „wir werden beim Angebot wieder zurückgehen“. Die
  Stückliste läuft im Hintergrund weiter: „für die Stücklistenführung im System … dass das richtig ausgefasst
  ist und zurückgeht“ (Z. 538–554). Bei der Batterie macht er es schon so, sinngemäß wegen der Diskussion mit dem
  Kunden: „ja, aber beim Solavi[e] kriege ich die Batterie um das“ (Z. 553–554).
- Idee: Unterkonstruktionsmaterial per KI aus Montageanleitung und Bild berechnen lassen (Z. 540–541),
  vorerst händisch.

---

## d) Regiebericht ohne Projekt (Service, Reparatur)

- Anlass: eine Wärmepumpe/Heizstab-Reparatur bei einem Kunden (Wartungsfall) am Vortag: „das wäre die perfekte
  Aktion gewesen zum Probieren, dass du sagst, passt, schreib ich mal was rein, **Regiebericht** so und so, da
  schau, undicht, alles [kaputt]. Ich hab darauf hingewiesen, der gehört unbedingt [ge]tauscht, lass ihn mal
  bitte schreiben [vermutlich: unterschreiben].“ (Z. 475)
- Darauf (laut Plaud Speaker 1, inhaltlich eher Stefan oder Zustimmung): „dass man bei dem Regiebericht einfach
  **die Fotos dazu machen kann** und dass man **nicht unbedingt jetzt ein Projekt braucht** für Regiegeschichten.“
  Stefan: „Genau, genau. So ist es.“ (Z. 476–477)
- Christoph: „da macht es wahrscheinlich mehr Sinn, wenn der dann einfach so Regiegeschichte macht“. Stefan:
  „Es gibt ja Sachen. Also die Funktion wäre sicher, dass er einfach einen Regiebericht macht und Regiebericht
  ohne [Projekt]. Wenn wirklich einmal die Notwendigkeit ist, ja“ (Z. 478–480)
- Christoph: „wenn du jetzt sagst, ja, wenn jetzt irgendein Regie oder … Ja, das wäre einfach einen
  Regiebericht erstellen.“ (Z. 506–507)
- Weitere Servicefälle: ein Kunde mit Balkon-Batterie eines anderen Händlers (Z. 186–191), Notlicht-Prüfung
  (Z. 459), Service-Anfragen per Mail mit Fotos/Video vom Kunden (Z. 495).
- **Wie verrechnet wird, wurde nicht besprochen.** → **offen.** Nahe liegend: Regiebericht hängt am Kunden
  (Adresse wählbar), Rechnung direkt aus dem Regiebericht oder Sammelrechnung je Kunde. Das ist eine Annahme,
  keine Aussage von Stefan.

---

## e) Gesamtablauf, wie Stefan ihn beschreibt

Zusammengesetzt aus Z. 508–535 und dem Rest der Besprechung:

1. **Anfrage** – Kunde ruft an, schreibt oder kommt über einen Nachbarn. Die **Karte mit Filtern** (PV,
   Speicher, kW, Einspeisebegrenzung) nutzt er vor dem Termin, um Nachbar-Referenzen zu zeigen: „Papa, deinem
   Nachbarn haben wir schon gebaut vor zwei Jahren, ist ein ganz anderes Geschäft“ (Z. 101–114).
2. **Termin** – im zentralen Kalender: Kunde wählen, eine seiner Adressen, Art „Besichtigung“, kein Projekt
   nötig (Z. 508–511).
3. **Erstaufnahme** vor Ort, am Tablet: Notizen („Sheet“), Kundenwunsch (z. B. 10 kW), beschriftete Fotos,
   kleine Skizze (Z. 524–532).
4. **Angebot** – mit Leistungsblöcken, verdeckt kalkuliert (Z. 538–554). Es baut auf der Erstaufnahme auf.
5. **Annahme** – online bestätigen ist schon in der Wunschliste. Erst jetzt: **Projekt** („wenn das Angebot
   angenommen ist“, Z. 515).
6. **Projekt** – Dokumentenordner mit allem aus der Erstaufnahme, für die Monteure sichtbar (Z. 141–143,
   532–535).
7. **Einteilung** – im selben Kalender (Woche, Spalten = Mitarbeiter/Teams), dazu Geräte/Fahrzeuge zum
   Aufklappen. Der Monteur sieht am Handy „wo bin ich heute, wo bin ich morgen“ (Z. 377, 398, 428–433).
8. **Regie / Rechnung** – Stunden, Material, Regieberichte mit Fotos und Unterschrift. Regie geht auch ohne
   Projekt (Z. 475–480). Danach Rechnung. Wie die Rechnung bei Regie ohne Projekt entsteht, ist offen.

Rahmen: Testdatenbank vor dem Jahreswechsel, ein **Testprojekt mit den Jungs durchspielen** („da werden wir
jetzt einmal ein Testprojekt mit den Jungs durchspielen. Das muss aber super sein.“, Z. 522; Z. 311). Voller
Umstieg zum Jahreswechsel mit Inventur, Bestände vorher auf null (Z. 299–311).

---

## f) Sonstiges, Widersprüche, Offenes

**Grundsätzliches, das für den Umbau gilt**
- So einfach wie möglich: „sobald ich drei Knöpfe drücken muss, dass ich meine Stunden endlich schreiben kann,
  die Fehlerquelle steigt einfach.“ (Z. 321–322). Über die App: „Voll geil. Nie wieder was anderes.“ (Z. 325)
- Handy schnell und knapp, Tablet quer für „die große [Ansicht], wenn ich sag, okay, möcht wirklich was arbeiten
  damit“ (Z. 362–364)
- Kein Benachrichtigungs-Spam wie in Odoo („so viel sinnlose Scheiße aufploppt“, Z. 73–77). Bei
  Kalender-Mitteilungen sparsam sein.
- Fuhrpark: Schaden am Auto per App mit Fotos protokollieren, „super“ (Z. 437–440).
- Anlagen-QR-Aufkleber am Wechselrichter/Verteiler statt Papier/USB-Stick: „ein Traum“ (Z. 454–455).

**Widersprüche und Unklares**
1. **Projekt erst nach Annahme** (Z. 515–520), die App legt Angebote heute aber als Projekt mit Status
   „Angebot“ an. Christoph spricht selbst vom Status „Angebot“ (Z. 517–519). Klären: Soll ein Angebot ohne
   Projekt am Kunden hängen, oder bleibt das Projekt mit Status „Angebot“ und wird nur in der Projektliste
   ausgeblendet?
2. **„Gantt weg“ und „wir lassen es drin“** (Z. 428, 431): „drin lassen“ meint Teams und Geräte/Steiger,
   nicht die Gantt-Ansicht. Gantt fällt weg, die Teams und die Geräteplanung wandern in den Kalender
   („irgendwo im Kalender oder zum Aufklappen“).
3. **Grobplanung:** Christoph nannte den alten Terminplaner „Grobplanung“, Stefan sagt „da ist die Einteilung
   auch“ (Z. 94–97). Eine eigene Grobplanungs-Ansicht hat er nicht verlangt. Monatsansicht ausdrücklich
   „gefällt mir schon gar nicht mehr“ (Z. 392).
4. **X/Y-Achse tauschen** (Wishlist 12.11.) und die heutige Aussage: Stefan nimmt die App-Wochenansicht so an,
   die Vorlage zeigt Spalten = Mitarbeiter, Zeilen = Tage mit Stunden. Ob er beides braucht, wurde nicht
   besprochen.
5. **Messwerte bei der Erstaufnahme**: nicht genannt (siehe c).
6. **Verrechnung von Regie ohne Projekt**: nicht besprochen (siehe d).
7. **Google-Kalender**: „Weiß ich noch nicht“ (Z. 406).
8. **Wer legt Termine an?** Gesagt hat er nur, dass er selbst (Büro) Besichtigungen und eigene Termine einträgt.
   Ob Monteure selbst Termine anlegen dürfen, ist offen.
9. **Mitteilungen an Kunden** (Termininfo): nach dem Odoo-Erlebnis heikel. Wenn überhaupt, dann nur an den
   verknüpften Kunden und nur auf Knopfdruck (Wishlist: WhatsApp-Termininfo).
10. **Ganztags und Stunden:** Auf der Vorlage sind Montagen ganztägige Blöcke, Besichtigungen 1–2 Stunden.
    Beides muss im selben Raster gehen, mehrtägig als durchgehender Block.

**Weitere Aufgaben aus der Plaud-Zusammenfassung (für Christoph)**
- Erstaufnahme mit Foto-Upload, Beschriftung und Skizze einrichten.
- Plantafel/Kalender für Mitarbeiter und Maschinen (Steiger, Geräte) anpassen, Gantt vereinfachen bzw. entfernen.
- Kurzanleitung Gmail-Anbindung an Stefan.
- Stefan: Altrechnungen per WeTransfer, Kunden und Artikel aus Odoo als CSV, Testprojekt mit den Mitarbeitern,
  Inventur zum Jahreswechsel.
