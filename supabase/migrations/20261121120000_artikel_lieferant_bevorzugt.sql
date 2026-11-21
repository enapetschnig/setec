-- Stefan 21.11.2026: auch den Lieferanten „am Artikel“ als bevorzugt markieren
-- (z. B. GBC, obwohl ein weiterer Lieferant ein paar Cent günstiger ist).
-- Höchstens EIN bevorzugter je Artikel: am Artikel ODER in artikel_lieferanten.
alter table public.artikel add column if not exists lieferant_bevorzugt boolean not null default false;

create or replace function public.artikel_bevorzugt_einer()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'artikel' then
    if new.lieferant_bevorzugt and not coalesce(old.lieferant_bevorzugt, false) then
      update public.artikel_lieferanten set bevorzugt = false where artikel_id = new.id and bevorzugt;
    end if;
  else
    if new.bevorzugt then
      update public.artikel set lieferant_bevorzugt = false where id = new.artikel_id and lieferant_bevorzugt;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists artikel_bevorzugt_einer on public.artikel;
create trigger artikel_bevorzugt_einer after update of lieferant_bevorzugt on public.artikel
  for each row execute function public.artikel_bevorzugt_einer();
drop trigger if exists artikel_lieferanten_bevorzugt_einer on public.artikel_lieferanten;
create trigger artikel_lieferanten_bevorzugt_einer after insert or update of bevorzugt on public.artikel_lieferanten
  for each row execute function public.artikel_bevorzugt_einer();
