-- Ein Link für alle (16.11.2026, Christoph): `/start` erkennt Gerät und
-- Browser, zeigt die Anleitung für den Startbildschirm und führt zum
-- Registrieren oder Anmelden. Am Anfang darf JEDER sich registrieren und ist
-- sofort freigeschaltet — die Freischaltung kommt später wieder dazu.
-- Der geheime Firmen-Link (20261116110000) ist damit überflüssig.

drop function if exists public.firmen_link(boolean);
drop function if exists public.einladung_lesen(text);
update public.einladungen set zurueckgezogen_am = now() where zurueckgezogen_am is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bootstrap boolean := lower(new.email) in ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');
begin
  insert into public.profiles (id, vorname, nachname, email, rolle, aktiv)
  values (new.id,
          left(btrim(coalesce(new.raw_user_meta_data->>'vorname', '')), 60),
          left(btrim(coalesce(new.raw_user_meta_data->>'nachname', '')), 60),
          new.email,
          case when v_bootstrap then 'chef' else 'monteur' end,
          true)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Einladungen per SMS (Edge Function einladung-sms): Protokoll und Drossel
create table public.sms_einladungen (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  status text not null default 'gesendet',
  twilio_sid text,
  fehler text,
  gesendet_von uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.sms_einladungen is 'SMS mit dem Link zur App — nur die Edge Function einladung-sms schreibt';
alter table public.sms_einladungen enable row level security;
create policy sms_einladungen_chef on public.sms_einladungen for select to authenticated using (public.ist_chef());
