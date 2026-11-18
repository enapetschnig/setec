-- Nachtrag Rollen & Rechte (18.11.2026, Durchsicht):
--  - Profile löschen nur der volle Chef (bisher reichte ist_chef() — eine Büro-Rolle
--    hätte sonst den Chef löschen können)
--  - Erstaufnahme → Projekt braucht „Projekte anlegen“ (security definer, an der Regel vorbei)
create policy profile_loeschen_voller_chef on public.profiles as restrictive for delete to authenticated
  using ((select public.ist_voller_chef()));

CREATE OR REPLACE FUNCTION public.projekt_aus_erstaufnahme(p_ea uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.erstaufnahmen;
  v_projekt uuid;
  v_name text;
begin
  if not public.hat_recht('projekte_anlegen') then raise exception 'Projekte anlegen ist für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then raise exception 'Nur der Chef macht aus einer Erstaufnahme ein Projekt.'; end if;
  select * into e from public.erstaufnahmen where id = p_ea for update;
  if e.id is null then raise exception 'Erstaufnahme nicht gefunden.'; end if;
  if e.projekt_id is not null then return e.projekt_id; end if;
  select left(coalesce(
           nullif(btrim(split_part(btrim(coalesce(e.kundenwunsch, '')), E'\n', 1)), ''),
           (select k.name from public.kunden k where k.id = e.kunde_id),
           'Auftrag ' || e.nummer), 120)
    into v_name;
  insert into public.projekte (name, kunde_id, status, strasse, plz, ort)
  values (v_name, e.kunde_id, 'aktiv', nullif(btrim(e.strasse), ''), nullif(btrim(e.plz), ''), nullif(btrim(e.ort), ''))
  returning id into v_projekt;
  perform public.erstaufnahme_ins_projekt(e.id, v_projekt);
  return v_projekt;
end $function$;
