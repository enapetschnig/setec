-- Gegenprobe 22.11.2026: angebot_material (Vorschlagsliste beim Ausfassen, auch für Monteure)
-- lieferte optionale/alternative Positionen mit — deren Material zählte als Soll-Bedarf.
-- Jetzt nur Positionen ohne variante (gilt so auch für ältere App-Fassungen); das Material
-- der Leistungen nur für die verbleibenden Positionen. 'variante' steht zusätzlich im JSON (immer null).
create or replace function public.angebot_material(p_projekt uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with a as (
    select b.id, b.nummer, b.status from public.belege b
     where b.projekt_id = p_projekt and b.typ = 'angebot' and b.status in ('angenommen', 'offen')
     order by case b.status when 'angenommen' then 0 else 1 end, b.created_at desc
     limit 1
  ), pos as (
    select p.art, p.menge, p.artikel_id, p.leistung_id, p.variante from public.beleg_positionen p
     where p.beleg_id = (select a.id from a) and p.variante is null
  )
  select case when not public.ist_aktiv() or not exists (select 1 from a) then null else jsonb_build_object(
    'angebot', (select coalesce(a.nummer, 'Entwurf') from a),
    'status', (select a.status from a),
    'positionen', coalesce((
      select jsonb_agg(jsonb_build_object('art', p.art, 'menge', p.menge, 'artikel_id', p.artikel_id, 'leistung_id', p.leistung_id, 'variante', p.variante))
        from pos p), '[]'::jsonb),
    'leistung_material', coalesce((
      select jsonb_agg(jsonb_build_object('leistung_id', lm.leistung_id, 'artikel_id', lm.artikel_id, 'menge', lm.menge))
        from public.leistung_material lm
       where lm.leistung_id in (select p.leistung_id from pos p)), '[]'::jsonb)
  ) end
$$;
revoke all on function public.angebot_material(uuid) from public, anon;
grant execute on function public.angebot_material(uuid) to authenticated;
