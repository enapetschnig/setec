-- Räumt weg, was tests/rls-test.mjs anlegt: Testdaten, die Testkonten
-- rlstest-…@setec-test.at und die verbrauchten Nummern. Als postgres ausführen
-- (sql.sh -f oder Supabase-MCP). Dateien im Storage löscht der Test selbst.
--
-- Die Schutz-Trigger (festgeschriebene Rechnungen, unterschriebene
-- Regieberichte) werden dafür kurz abgeschaltet — alles in einer Transaktion.
do $$
declare
  v_user uuid[] := array(select id from auth.users where email like 'rlstest-%@setec-test.at');
  v_projekte uuid[] := array(select id from public.projekte where name like 'RLS-Test%');
begin
  alter table public.zeiten disable trigger user;
  alter table public.material_buchungen disable trigger user;
  alter table public.regieberichte disable trigger user;
  alter table public.dateien disable trigger user;
  alter table public.belege disable trigger user;
  alter table public.beleg_positionen disable trigger user;
  alter table public.eingang_anteile disable trigger user;
  alter table public.pruefungen disable trigger user;
  alter table public.bestellungen disable trigger user;
  alter table public.bestell_positionen disable trigger user;

  delete from public.pruefungen where anlage_id in (select id from public.anlagen where bezeichnung like 'RLS-Test%') or erstellt_von = any(v_user);
  delete from public.anlagen where bezeichnung like 'RLS-Test%' or erstellt_von = any(v_user);
  delete from public.lieferscheine where lieferant like 'RLS-Test%' or erstellt_von = any(v_user);
  delete from public.fahrzeuge where name like 'RLS-Test%';
  delete from public.teams where name like 'RLS-Test%';
  delete from public.rabatte where lieferant like 'RLS-Test%';
  delete from public.rechnung_kategorien where name like 'RLS-Test%';
  delete from public.eingangsrechnungen where lieferant like 'RLS-Test%' or erstellt_von = any(v_user);
  delete from public.eingang_anteile where projekt_id = any(v_projekte);
  delete from public.zahlungen where beleg_id in (select id from public.belege where projekt_id = any(v_projekte) or erstellt_von = any(v_user));
  delete from public.belege where projekt_id = any(v_projekte) or erstellt_von = any(v_user);
  -- Erstaufnahmen samt Fotos (Dateien im Speicher löscht der Test selbst)
  delete from public.erstaufnahmen where erstellt_von = any(v_user)
     or kunde_id in (select id from public.kunden where name like 'RLS-Test%');
  delete from public.zeiten where projekt_id = any(v_projekte) or user_id = any(v_user) or erstellt_von = any(v_user);
  delete from public.material_buchungen where projekt_id = any(v_projekte) or user_id = any(v_user);
  delete from public.bestellungen where lieferant like 'RLS-Test%' or erstellt_von = any(v_user);
  -- Fotos und Material von Regieberichten ohne Projekt zuerst — sonst ließe on delete set null sie ohne Projekt und Bericht
  delete from public.dateien where regiebericht_id in (select id from public.regieberichte where projekt_id = any(v_projekte) or erstellt_von = any(v_user));
  delete from public.material_buchungen where regiebericht_id in (select id from public.regieberichte where projekt_id is null and erstellt_von = any(v_user));
  delete from public.regieberichte where projekt_id = any(v_projekte) or erstellt_von = any(v_user);
  delete from public.termine where projekt_id = any(v_projekte) or user_id = any(v_user);
  delete from public.dateien where projekt_id = any(v_projekte) or user_id = any(v_user);
  -- SETEC-Pakete (Aufgaben samt Verlauf, Firmendokumente, Vorlagen, Kontakte, Artikel und Lager)
  delete from public.aufgaben where titel like 'RLS-Test%' or erstellt_von = any(v_user);
  delete from public.firmen_dokumente where ordner = 'RLS-Test' or titel like 'RLS-Test%';
  delete from public.angebot_vorlagen where name like 'RLS-Test%';
  delete from public.kunden where name like 'RLS-Test%';
  delete from public.lagerorte where name like 'RLS-Test%';
  delete from public.artikel where bezeichnung like 'RLS-Test%';
  delete from public.projekte where id = any(v_projekte);
  delete from public.abwesenheiten where user_id = any(v_user);
  delete from public.konto_buchungen where user_id = any(v_user);
  delete from auth.users where id = any(v_user);

  alter table public.zeiten enable trigger user;
  alter table public.material_buchungen enable trigger user;
  alter table public.regieberichte enable trigger user;
  alter table public.dateien enable trigger user;
  alter table public.belege enable trigger user;
  alter table public.beleg_positionen enable trigger user;
  alter table public.eingang_anteile enable trigger user;
  alter table public.pruefungen enable trigger user;
  alter table public.bestellungen enable trigger user;
  alter table public.bestell_positionen enable trigger user;

  -- Nummernkreise zurück auf die höchste Nummer, die es noch gibt
  update public.nummernkreise n set letzte = coalesce((
    select max(substring(x.nummer from '(\d+)$')::int) from (
      select nummer from public.projekte where n.typ = 'projekt' and nummer like n.jahr || '-%'
      union all select nummer from public.belege where n.typ = 'angebot' and nummer like 'AN-' || n.jahr || '-%'
      union all select nummer from public.belege where n.typ = 'rechnung' and nummer like 'RE-' || n.jahr || '-%'
      union all select nummer from public.regieberichte where n.typ = 'regie' and nummer like 'RB-' || n.jahr || '-%'
      union all select nummer from public.pruefungen where n.typ = 'pruefung' and nummer like 'PR-' || n.jahr || '-%'
      union all select nummer from public.bestellungen where n.typ = 'bestellung' and nummer like 'BE-' || n.jahr || '-%'
      union all select nummer from public.kunden_lieferscheine where n.typ = 'kundenlieferschein' and nummer like 'LS-' || n.jahr || '-%'
      union all select nummer from public.erstaufnahmen where n.typ = 'erstaufnahme' and nummer like 'EA-' || n.jahr || '-%'
    ) x), 0)
  -- nur Kreise, die hier oben gezählt werden — sonst fiele ein fremder Kreis auf 0 (doppelte Nummern)
  where n.typ in ('projekt', 'angebot', 'rechnung', 'regie', 'pruefung', 'bestellung', 'kundenlieferschein', 'erstaufnahme');
end $$;
