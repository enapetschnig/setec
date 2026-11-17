-- =====================================================================
--  E-Mail-Postfächer des Betriebs (Google Workspace, Gmail-API)
-- =====================================================================
--
-- Zugang über EIN Dienstkonto mit domänenweiter Delegierung (Supabase-Secret
-- GOOGLE_MAIL_DIENSTKONTO, base64 des JSON). Die Freigabe in der Google
-- Admin-Konsole gilt für die ganze Domain — weitere Adressen derselben Firma
-- brauchen keine neue Freigabe. Darum eine Liste statt eines Felds:
--
--  - postfaecher: je Adresse „Rechnungen einlesen“, „Senden“ und höchstens
--    ein Standard-Absender. Nur der Chef (RLS). Die Edge Functions lesen mit
--    der Dienstrolle.
--  - postfach_mails: jede angesehene Mail (je Postfach und Gmail-Message-ID
--    einmal). Die Zeile wird VOR dem Lesen durch die KI angelegt
--    (ergebnis 'in_arbeit') — so verarbeiten Knopf und Cron dieselbe Mail
--    nie doppelt. Ergebnis: rechnung / doppelt / keine_rechnung /
--    ohne_anhang / fehler (höchstens 3 Versuche).
--  - eingangsrechnungen.postfach_mail_id: aus dem Postfach angelegt
--    (Pille „aus E-Mail“).
--  - postfach_verbindung: Adresse und Geheimnis der Edge Function
--    postfach-abruf für pg_cron. Steht nicht im Repo (öffentlich) — die
--    Zeile wird einmal per SQL eingetragen. Leer = Cron still. Wie
--    push_verbindung.
--  - pg_cron: alle 15 Minuten postfach_abruf_anstossen() — ruft die Function
--    nur, wenn ein Postfach „Rechnungen einlesen“ an hat.
-- =====================================================================

create table public.postfaecher (
  id uuid primary key default gen_random_uuid(),
  adresse text not null unique check (adresse = lower(btrim(adresse)) and adresse ~ '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  rechnungen_einlesen boolean not null default false,
  senden boolean not null default false,
  -- Absender, wenn im Mail-Dialog nichts anderes gewählt ist (höchstens einer)
  standard_absender boolean not null default false,
  aktiv boolean not null default true,
  geprueft_am timestamptz,
  zuletzt_abgerufen timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index postfaecher_ein_standard on public.postfaecher (standard_absender) where standard_absender;
create trigger postfaecher_updated before update on public.postfaecher
  for each row execute function public.updated_at_setzen();

alter table public.postfaecher enable row level security;
create policy postfaecher_chef on public.postfaecher for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

create table public.postfach_mails (
  id uuid primary key default gen_random_uuid(),
  postfach_id uuid references public.postfaecher(id) on delete set null,
  postfach text not null,
  message_id text not null,
  von text,
  betreff text,
  datum timestamptz,
  ergebnis text not null default 'in_arbeit'
    check (ergebnis in ('in_arbeit', 'rechnung', 'doppelt', 'keine_rechnung', 'ohne_anhang', 'fehler')),
  eingangsrechnung_id uuid references public.eingangsrechnungen(id) on delete set null,
  fehler text,
  versuche int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (postfach, message_id)
);
create index on public.postfach_mails (created_at desc);
create index on public.postfach_mails (eingangsrechnung_id);
create trigger postfach_mails_updated before update on public.postfach_mails
  for each row execute function public.updated_at_setzen();

alter table public.postfach_mails enable row level security;
-- Lesen nur der Chef; schreiben nur die Edge Function (Dienstrolle)
create policy postfach_mails_chef on public.postfach_mails for select to authenticated
  using (public.ist_chef());

alter table public.eingangsrechnungen
  add column postfach_mail_id uuid references public.postfach_mails(id) on delete set null;
create index on public.eingangsrechnungen (postfach_mail_id) where postfach_mail_id is not null;

-- ── Cron ─────────────────────────────────────────────────────────────────
create table if not exists public.postfach_verbindung (
  einzig boolean primary key default true check (einzig),
  url text not null,
  secret text not null
);
-- Keine Policies: nur Dienstrolle und die Funktion unten (security definer)
alter table public.postfach_verbindung enable row level security;
revoke all on public.postfach_verbindung from anon, authenticated;

create or replace function public.postfach_abruf_anstossen() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.postfach_verbindung%rowtype;
begin
  if not exists (select 1 from public.postfaecher where aktiv and rechnungen_einlesen) then return; end if;
  select * into v from public.postfach_verbindung limit 1;
  if not found then return; end if;       -- nicht eingerichtet: still
  perform net.http_post(
    url := v.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-postfach-secret', v.secret),
    body := jsonb_build_object('aktion', 'abrufen', 'cron', true),
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function public.postfach_abruf_anstossen() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('postfach-abruf', '*/15 * * * *', $$ select public.postfach_abruf_anstossen() $$);
