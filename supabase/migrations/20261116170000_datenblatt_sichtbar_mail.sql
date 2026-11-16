-- Wünsche SETEC 16.11.2026:
--  1. Datenblätter am Artikel mit drei Sichtbarkeitsstufen je Datei:
--     intern (nie nach außen) · angebot (mit dem Angebot, Standard) ·
--     auftrag (erst wenn das Angebot angenommen ist).
--     Gilt für die Liste auf der Bestätigungsseite (angebot_datenblaetter →
--     angebot_oeffentlich), für das Laden durch den Kunden (Storage-Policy über
--     datenblatt_oeffentlich) und für den Mailversand (Edge Function beleg-mail).
--  2. Angebot/Rechnung per E-Mail: der Versand steht im Verlauf (art 'gesendet',
--     name = Empfänger, text = Betreff). Für Rechnungen genauso — der Verlauf
--     hängt am Beleg, nicht an der Belegart.

alter table public.artikel_dateien
  add column if not exists sichtbar text not null default 'angebot'
  check (sichtbar in ('intern', 'angebot', 'auftrag'));
comment on column public.artikel_dateien.sichtbar is
  'Nur für Datenblätter: intern = nie nach außen, angebot = mit dem Angebot, auftrag = erst nach Annahme';

/** Datenblätter, die der Kunde zu diesem Angebot sehen darf */
create or replace function public.angebot_datenblaetter(p_beleg uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_angenommen boolean;
begin
  select b.status = 'angenommen' into v_angenommen from public.belege b where b.id = p_beleg;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'pfad', x.pfad, 'artikel', x.artikel, 'sichtbar', x.sichtbar)
           order by x.artikel, x.name), '[]'::jsonb)
    into v
    from (
      select distinct on (d.pfad) d.name, d.pfad, d.sichtbar, a.bezeichnung as artikel
        from public.artikel_dateien d
        join public.artikel a on a.id = d.artikel_id
       where d.art = 'datenblatt'
         and (d.sichtbar = 'angebot' or (d.sichtbar = 'auftrag' and coalesce(v_angenommen, false)))
         and d.artikel_id in (
           select p.artikel_id from public.beleg_positionen p where p.beleg_id = p_beleg and p.artikel_id is not null
           union
           select m.artikel_id from public.beleg_positionen p
             join public.leistung_material m on m.leistung_id = p.leistung_id
            where p.beleg_id = p_beleg
         )
    ) x;
  return v;
end $$;
revoke execute on function public.angebot_datenblaetter(uuid) from public, anon, authenticated;
grant execute on function public.angebot_datenblaetter(uuid) to service_role;

/** Darf ein Datenblatt öffentlich geladen werden? Nie „intern“, „auftrag“ erst nach Annahme. */
create or replace function public.datenblatt_oeffentlich(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_name not like 'artikel/%' then return false; end if;
  return exists (
    select 1 from public.artikel_dateien d
     where d.pfad = p_name and d.art = 'datenblatt' and d.sichtbar <> 'intern'
       and exists (
         select 1 from public.angebot_links l
           join public.belege b on b.id = l.beleg_id and b.status in ('offen', 'angenommen')
           join public.beleg_positionen p on p.beleg_id = b.id
           left join public.leistung_material m on m.leistung_id = p.leistung_id
          where l.gesperrt_am is null
            and (d.sichtbar = 'angebot' or b.status = 'angenommen')
            and (p.artikel_id = d.artikel_id or m.artikel_id = d.artikel_id)));
end $$;
revoke execute on function public.datenblatt_oeffentlich(text) from public;
grant execute on function public.datenblatt_oeffentlich(text) to anon, authenticated;

-- Versand per E-Mail im Verlauf
alter table public.angebot_verlauf drop constraint if exists angebot_verlauf_art_check;
alter table public.angebot_verlauf add constraint angebot_verlauf_art_check
  check (art in ('link', 'geoeffnet', 'angenommen', 'rueckfrage', 'gesperrt', 'gesendet'));
