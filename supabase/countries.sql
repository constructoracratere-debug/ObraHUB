-- ======================================================================
-- ObraHub — add country dimension to documents (Colombia + México)
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Additive + idempotent. Existing documents default to 'colombia'.
-- ======================================================================

-- 1. Add the country column (defaults to Colombia — all current docs are CO).
alter table public.documents
  add column if not exists country text not null default 'colombia'
  check (country in ('colombia', 'mexico'));

-- 2. Backfill any pre-existing rows (the NOT NULL default handles new inserts).
update public.documents set country = 'colombia' where country is null;

-- 3. Widen the global slug uniqueness to be per-country, so México can reuse
--    a slug (e.g. a "cementos" document in both countries).
drop index if exists documents_global_slug_idx;
create unique index if not exists documents_global_slug_idx
  on public.documents (slug, country) where scope = 'global';

-- 4. Index for filtering by country (used by the library + selector).
create index if not exists documents_country_idx
  on public.documents (country) where scope = 'global';
