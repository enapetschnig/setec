-- =====================================================================
--  Postfach-Abruf härten (Prüfung 18.11.2026: H1, H2, M1, L2–L5)
-- =====================================================================
--
--  1. postfaecher.als_gelesen — eingelesene Rechnungen in Gmail als gelesen
--     markieren (Standard wie bisher: ja). Für ein persönliches Postfach
--     (s.sattler@) aus: die App ändert dort den Gelesen-Status nicht, das
--     Label „App: verarbeitet“ kommt trotzdem.
--  2. postfach_mails.ungelesen — was die App an einer Mail NICHT lesen konnte
--     (Anhang zu groß, mehr als 4 Anhänge, nach 3 Versuchen aufgegeben).
--     Gesetzt = endgültig, kein neuer Versuch; Einstellungen → E-Mail und
--     /eingang zeigen diese Mails (nur Absender, Betreff, Datum, Grund).
--  3. eingangsrechnungen.lieferant_gelesen / lieferant_uid — Name und UID,
--     wie die KI sie auf einer Rechnung aus einer Mail gelesen hat. Daraus
--     lernt die Zuordnung (gleiche Schreibweise → Lieferant, unter dem die
--     Rechnung heute steht, auch nach einer Korrektur; gleiche UID → derselbe
--     Lieferant) — ohne unscharfe Vergleiche.
--  4. eingang_doppelt_kandidaten() — Kandidaten für „doppelt“ unabhängig vom
--     Lieferanten-Namen: gleiche Rechnungsnummer (nur Buchstaben und Ziffern,
--     klein geschrieben) ODER gleiches Datum + gleicher Brutto-Betrag. Mit den
--     Absendern der Mails, die schon auf die Rechnung zeigen. Nur die
--     Dienstrolle (Edge Function postfach-abruf).
--  5. postfach_domains — Domains, in deren Postfächer die App über das
--     (mit anderen Kunden geteilte) ePower-Dienstkonto greifen darf, solange
--     das Secret POSTFACH_DOMAINS fehlt. Ist das Secret gesetzt, gilt nur das
--     Secret. Keine Policies: nur per SQL (ePower) — kein App-Benutzer kann
--     die Liste erweitern, auch nicht über die Firmen-Mail oder ein neues
--     Postfach. Einmal gefüllt aus der Firmen-Mail und den Postfächern, die
--     beim Einspielen schon eingetragen sind (ohne Freemail-Domains).
-- =====================================================================

alter table public.postfaecher
  add column if not exists als_gelesen boolean not null default true;

alter table public.postfach_mails
  add column if not exists ungelesen text;
create index if not exists postfach_mails_ungelesen_idx
  on public.postfach_mails (created_at desc) where ungelesen is not null;

alter table public.eingangsrechnungen
  add column if not exists lieferant_gelesen text,
  add column if not exists lieferant_uid text;

-- ── Doppelt-Suche ─────────────────────────────────────────────────────────
-- Nummern-Kern wie nummerKern() in _shared/postfach.ts
create index if not exists eingangsrechnungen_nummer_kern_idx
  on public.eingangsrechnungen ((regexp_replace(lower(coalesce(nummer, '')), '[^a-z0-9]', '', 'g')));
create index if not exists eingangsrechnungen_datum_brutto_idx
  on public.eingangsrechnungen (datum, brutto);

create or replace function public.eingang_doppelt_kandidaten(p_kern text, p_brutto numeric, p_datum date)
returns table (id uuid, lieferant text, nummer text, datum date, brutto numeric, absender text[])
language sql stable set search_path = public as $$
  select e.id, e.lieferant, e.nummer, e.datum, e.brutto,
         (select array_agg(distinct m.von) from public.postfach_mails m
           where m.von is not null and (m.id = e.postfach_mail_id or m.eingangsrechnung_id = e.id))
    from public.eingangsrechnungen e
   where (coalesce(p_kern, '') <> '' and regexp_replace(lower(coalesce(e.nummer, '')), '[^a-z0-9]', '', 'g') = p_kern)
      or (p_brutto is not null and p_datum is not null and e.brutto = p_brutto and e.datum = p_datum)
   order by e.datum desc, e.id
   limit 200
$$;
revoke all on function public.eingang_doppelt_kandidaten(text, numeric, date) from public, anon, authenticated;
grant execute on function public.eingang_doppelt_kandidaten(text, numeric, date) to service_role;

-- ── Erlaubte Domains (Rückfall ohne Secret POSTFACH_DOMAINS) ──────────────
create table if not exists public.postfach_domains (
  domain text primary key check (domain = lower(btrim(domain)) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);
alter table public.postfach_domains enable row level security;
revoke all on public.postfach_domains from anon, authenticated;

insert into public.postfach_domains (domain)
select distinct d
  from (select lower(btrim(split_part(adresse, '@', 2))) as d from public.postfaecher
        union
        select lower(btrim(split_part(email, '@', 2))) from public.firma where email like '%_@_%') x
 where d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
   and d !~ '^(gmail|googlemail|gmx|web|yahoo|outlook|hotmail|live|icloud|me|aon|a1|chello|kabsi|utanet|t-online)\.'
on conflict do nothing;
