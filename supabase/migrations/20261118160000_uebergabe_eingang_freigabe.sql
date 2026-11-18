-- =====================================================================
--  Übergabe an die Kanzlei: nur freigegebene Eingangsrechnungen, keine aus Odoo
-- =====================================================================
--
-- Bisher gingen alle Eingangsrechnungen des Monats an die Kanzlei — auch
-- zu prüfende, abgelehnte (kein Aufwand, keine Vorsteuer) und die aus Odoo
-- übernommenen (dort schon verbucht, wie Altrechnungen mit `altbestand`).
-- Die App nimmt sie nicht mehr mit (lib/fibu.ts `eingangAufteilen`); die
-- Datenbank prüft dasselbe, damit auch eine alte App-Fassung oder ein
-- direkter Aufruf nichts Falsches als übergeben merkt.
--
-- Ob aus Odoo, sagt `odoo_import` (tabelle = 'eingangsrechnungen') — keine
-- neue Spalte: die Übernahme schreibt nur dorthin, die App liest es dort.
--
-- security definer: die Prüfungen müssen alles sehen. Mit den Rechten des
-- Aufrufers liefe eine Büro-Rolle ohne „Eingang“ (sieht keine
-- Eingangsrechnungen, keine Odoo-Zeilen) still durch. Darum die Rechte hier
-- selbst prüfen: Chef-Zugang und das Recht „Buchhaltung“ — wie die Regeln
-- auf fibu_uebergaben / fibu_uebergabe_belege.
--
-- Abwärtsverträglich: gleiche Signatur, gleiche Meldungen wie bisher, dazu
-- zwei neue Ablehnungen. Neue App ohne diese Migration: filtert selbst.
-- =====================================================================

create or replace function public.fibu_uebergeben(p_von date, p_bis date, p_format text, p_belege uuid[], p_eingaenge uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.ist_chef() then
    raise exception 'Nur der Chef.';
  end if;
  if not public.hat_recht('buchhaltung') then
    raise exception 'Die Buchhaltung ist für deine Rolle nicht freigegeben.';
  end if;
  if coalesce(cardinality(p_belege), 0) + coalesce(cardinality(p_eingaenge), 0) = 0 then
    raise exception 'In diesem Zeitraum gibt es nichts zu übergeben.';
  end if;
  if exists (select 1 from public.belege where id = any(coalesce(p_belege, '{}')) and altbestand) then
    raise exception 'Altrechnungen sind im alten Programm schon verbucht und gehen nicht an die Kanzlei.';
  end if;
  if exists (select 1 from public.odoo_import where tabelle = 'eingangsrechnungen' and zeile_id = any(coalesce(p_eingaenge, '{}'))) then
    raise exception 'Eingangsrechnungen aus Odoo sind im alten Programm schon verbucht und gehen nicht an die Kanzlei.';
  end if;
  if exists (select 1 from public.eingangsrechnungen where id = any(coalesce(p_eingaenge, '{}')) and freigabe <> 'freigegeben') then
    raise exception 'Nur freigegebene Eingangsrechnungen gehen an die Kanzlei — erst prüfen und freigeben.';
  end if;
  insert into public.fibu_uebergaben (von, bis, format) values (p_von, p_bis, p_format) returning id into v_id;
  insert into public.fibu_uebergabe_belege (uebergabe_id, beleg_id) select v_id, unnest(coalesce(p_belege, '{}'));
  insert into public.fibu_uebergabe_belege (uebergabe_id, eingang_id) select v_id, unnest(coalesce(p_eingaenge, '{}'));
  return v_id;
end $$;

revoke execute on function public.fibu_uebergeben(date, date, text, uuid[], uuid[]) from public, anon;
grant execute on function public.fibu_uebergeben(date, date, text, uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
