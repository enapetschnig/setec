-- ══════════════════════════════════════════════════════════════════════
--  Eingangsrechnungen: bar bezahlt (oder mit eigener Karte ausgelegt,
--  im Büro bar zurückgegeben) — die Buchhaltung bucht das gesondert
--  (GF-Verrechnungskonto). Reiter „Bezahlt“ filtert nach Zahlweg.
--  Nur ergänzt: die alte App liest die Spalte nicht.
-- ══════════════════════════════════════════════════════════════════════

alter table public.eingangsrechnungen
  add column if not exists bar_bezahlt boolean not null default false;

comment on column public.eingangsrechnungen.bar_bezahlt is 'Bar oder mit eigener Karte bezahlt (ausgelegt) — nicht überwiesen';
