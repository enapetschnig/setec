# Kontakte, Lieferanten, Adressen

- 2026-11-16 · Adress-Vervollständigung: Stefan wollte „Google Places“ — gebaut mit Photon (OpenStreetMap, kostenlos, kein Schlüssel), weil Google ein eigenes Konto mit Abrechnung braucht. Trifft für das Mürztal Hausnummer + PLZ gut. Will er doch Google: API-Schlüssel (Places API New) als Supabase-Secret, Abfrage über eine Edge Function, `photonUrl/photonLesen` in `lib/adresse.ts` tauschen.
- 2026-11-16 · Lieferant am Artikel wird aus den Lieferanten-Kontakten gewählt (`LieferantWahl`), gespeichert bleibt der Name als Text. Import (Datanorm), Bestellung, Aufschlag-Filter bleiben bewusst Freitext/alte Liste (Import-Schlüssel `lieferant,artikelnummer`, Filter muss alte Namen finden).
- 2026-11-16 · Ansprechpersonen (Außendienst/Innendienst) in `kontakt_personen`, nur bei Lieferant/Partner angezeigt; beim Kunden bleibt das eine Feld „Ansprechpartner“.
