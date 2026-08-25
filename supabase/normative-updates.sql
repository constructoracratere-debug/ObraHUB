-- ObraHub — Vigilancia Normativa (legal update tracker)
-- Pegar en: Supabase Dashboard → SQL Editor → Run

create table if not exists public.normative_updates (
  id            uuid primary key default gen_random_uuid(),
  norm_type     text not null check (norm_type in ('ley','decreto','resolucion','circular','ntc','otro')),
  number        text not null,
  year          integer not null,
  title         text not null,
  summary       text not null default '',
  url           text,
  source        text not null default 'Diario Oficial',
  -- Qué modifica / deroga / adiciona
  affects       jsonb not null default '[]'::jsonb,   -- [{nsr_title:"C.14", change:"modifica", description:""}]
  status        text not null default 'vigente' check (status in ('vigente','derogada','modificada','en_estudio')),
  relevance     text not null default 'media' check (relevance in ('alta','media','baja')),
  published_at  timestamptz,
  discovered_at timestamptz not null default now(),
  ai_analysis   text,
  unique(number, year)
);

create index if not exists norm_updates_relevance_idx on public.normative_updates (relevance, published_at desc);
create index if not exists norm_updates_type_idx on public.normative_updates (norm_type, year desc);

alter table public.normative_updates enable row level security;

drop policy if exists "norm_updates_read" on public.normative_updates;
create policy "norm_updates_read" on public.normative_updates
  for select using (true);

drop policy if exists "norm_updates_write" on public.normative_updates
  for insert with check (true);

drop policy if exists "norm_updates_update" on public.normative_updates
  for update using (true);
