-- =====================================================================
--  Karte: was der Server (Photon) nicht findet, fragt die App noch Nominatim
-- =====================================================================
-- Photon nimmt nur Treffer mit gleicher PLZ und schrieb bei „nicht gefunden“
-- geo_adresse = Anfrage → die App (Kontakt öffnen, „Jetzt suchen“) hielt den
-- Kontakt für erledigt und fragte Nominatim nie (Gegenprobe 19.11.2026).
-- Jetzt merkt sich der Server „?“ + Anfrage (supabase/functions/_shared/geo.ts):
-- er selbst sucht das nicht wieder, die App schon.
-- Bestehende Fehlschläge (lat leer, geo_adresse = Anfrage; 46 bei SETEC,
-- Sicherung ~/roboter/sicherungen/setec-2026-11-19-geo-nicht-gefunden-vorher.json)
-- bekommen den Vermerk, damit die App sie einmal mit Nominatim versucht.
-- =====================================================================

create or replace function public.geo_suchen_anstossen() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.geo_verbindung%rowtype;
begin
  select * into v from public.geo_verbindung limit 1;
  if not found then return; end if;       -- nicht eingerichtet: still
  if not exists (
    select 1 from public.kunden k
     where public.geo_anfrage(k.strasse, k.plz, k.ort) is not null
       and public.geo_anfrage(k.strasse, k.plz, k.ort) is distinct from k.geo_adresse
       and '?' || public.geo_anfrage(k.strasse, k.plz, k.ort) is distinct from k.geo_adresse
  ) then return; end if;
  perform net.http_post(
    url := v.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-geo-secret', v.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function public.geo_suchen_anstossen() from public, anon, authenticated;

update public.kunden k
   set geo_adresse = '?' || k.geo_adresse
 where k.lat is null
   and k.geo_adresse is not null
   and k.geo_adresse = public.geo_anfrage(k.strasse, k.plz, k.ort);
