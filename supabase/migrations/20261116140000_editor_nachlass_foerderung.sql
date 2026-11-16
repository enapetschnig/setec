-- Angebots-/Rechnungseditor einfacher (Wunsch Christoph 16.11.2026):
--  * Nachlass steht als eigene Zeile im Dokument (art 'nachlass', am Ende vor
--    den Abzügen) statt alle Einzelpreise umzuschreiben. Mit „prozent“ rechnet
--    der Editor den Betrag aus der Summe davor; ohne ist es ein fester Betrag.
--    Netto = Summe aller „gesamt“ — Fertigstellen, Storno und Nachkalkulation
--    rechnen dadurch ohne Änderung richtig.
--  * Mögliche Förderung: Text und Betrag am Beleg, nur zur Information unter
--    der Summe (wird nicht abgezogen).

alter table public.beleg_positionen
  add column prozent numeric(6,2) check (prozent is null or (prozent > 0 and prozent <= 100));
alter table public.beleg_positionen drop constraint beleg_positionen_art_check;
alter table public.beleg_positionen add constraint beleg_positionen_art_check
  check (art in ('titel','leistung','artikel','arbeit','material','pauschale','text','abzug','nachlass'));

alter table public.belege
  add column foerderung_text text,
  add column foerderung_betrag numeric(12,2) check (foerderung_betrag is null or foerderung_betrag >= 0);

-- Kunde sieht Förderung und Nachlass auch auf der Bestätigungsseite
CREATE OR REPLACE FUNCTION public.angebot_oeffentlich(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.angebot_links;
  v_zustand text;
  b public.belege;
  f public.firma;
  v_annahme jsonb;
  v_projekt jsonb;
begin
  select * into f from public.firma limit 1;
  v_link := public.angebot_link_zu(p_token);
  v_zustand := public.angebot_link_zustand(v_link);
  -- Briefkopf wie auf dem PDF — keine Kalkulationswerte des Betriebs
  if v_zustand in ('unbekannt', 'gesperrt') then
    return jsonb_build_object('zustand',
      case when v_link.id is null and not exists (select 1 from public.angebot_links x where x.token = p_token)
        then 'unbekannt' else 'gesperrt' end,
      'firma', jsonb_build_object('name', f.name, 'logo_pfad', f.logo_pfad, 'telefon', f.telefon, 'email', f.email));
  end if;
  select * into b from public.belege where id = v_link.beleg_id;

  if v_link.geoeffnet_am is null and not public.ist_chef() then
    update public.angebot_links set geoeffnet_am = now() where id = v_link.id;
    insert into public.angebot_verlauf (beleg_id, art, text) values (b.id, 'geoeffnet', 'Kunde hat den Link geöffnet');
  end if;

  select jsonb_build_object('name', v.name, 'zeit', v.created_at) into v_annahme
    from public.angebot_verlauf v where v.beleg_id = b.id and v.art = 'angenommen' order by v.created_at desc limit 1;
  select jsonb_build_object('nummer', p.nummer, 'name', p.name, 'strasse', p.strasse, 'plz', p.plz, 'ort', p.ort) into v_projekt
    from public.projekte p where p.id = b.projekt_id;

  return jsonb_build_object(
    'zustand', v_zustand,
    'stand', b.updated_at,
    'gilt_bis', coalesce(b.gueltig_bis, v_link.ablauf),
    'annahme', v_annahme,
    'projekt', v_projekt,
    'firma', jsonb_build_object(
      'name', f.name, 'zusatz', f.zusatz, 'inhaber', f.inhaber, 'strasse', f.strasse, 'plz', f.plz, 'ort', f.ort,
      'land', f.land, 'telefon', f.telefon, 'email', f.email, 'website', f.website, 'uid', f.uid,
      'firmenbuch', f.firmenbuch, 'bank_name', f.bank_name, 'iban', f.iban, 'bic', f.bic, 'logo_pfad', f.logo_pfad,
      'farbe', f.farbe, 'angebot_gueltig_tage', f.angebot_gueltig_tage, 'zahlungsziel_tage', f.zahlungsziel_tage,
      'kleinunternehmer', f.kleinunternehmer, 'fusszeile', f.fusszeile),
    'beleg', jsonb_build_object(
      'typ', b.typ, 'nummer', b.nummer, 'status', b.status, 'datum', b.datum, 'gueltig_bis', b.gueltig_bis,
      'leistung_von', b.leistung_von, 'leistung_bis', b.leistung_bis, 'faellig_am', b.faellig_am,
      'betreff', b.betreff, 'einleitung', b.einleitung, 'schlusstext', b.schlusstext,
      'ust_satz', b.ust_satz, 'reverse_charge', b.reverse_charge, 'kv_verbindlich', b.kv_verbindlich,
      'netto', b.netto, 'ust', b.ust, 'brutto', b.brutto,
      'empf_name', b.empf_name, 'empf_zusatz', b.empf_zusatz, 'empf_strasse', b.empf_strasse,
      'empf_plz', b.empf_plz, 'empf_ort', b.empf_ort, 'empf_uid', b.empf_uid,
      'foerderung_text', b.foerderung_text, 'foerderung_betrag', b.foerderung_betrag),
    'positionen', coalesce((
      select jsonb_agg(jsonb_build_object('art', p.art, 'bezeichnung', p.bezeichnung, 'langtext', p.langtext,
               'menge', p.menge, 'einheit', p.einheit, 'einzelpreis', p.einzelpreis, 'prozent', p.prozent) order by p.pos)
        from public.beleg_positionen p where p.beleg_id = b.id), '[]'::jsonb),
    'datenblaetter', public.angebot_datenblaetter(b.id)
  );
end $function$;
