# Eingangsrechnungen

- 2026-11-16 · SEPA-Mandat (Stefan): Händler mit Einzugsermächtigung buchen am Tag X jeden Monats **abzüglich Skonto** selbst ab → Schalter „Händler bucht per Lastschrift ab“ in der Rechnung, Reiter „Lastschrift“ auf `/eingang`, nicht in „Zu überweisen“/SEPA-Datei, nie „Überfällig“, Startseiten-Hinweise (überweisen, Skonto läuft ab) ohne Lastschriften. Skonto zählt hier unabhängig vom Skonto-Datum.
  Gespeichert an der Rechnung (nicht am Kontakt, weil der Lieferant der Rechnung Freitext ist); „je Händler“ entsteht durch Übertragen auf seine offenen Rechnungen und Vorbelegen aus seiner letzten Rechnung (`lieferantSchluessel`). Die KI erkennt „wird eingezogen“ auf dem Beleg noch nicht.
