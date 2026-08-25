-- ObraHub — Noticias LATAM (scraper RSS)
create table if not exists public.news_items (
  id          uuid primary key default gen_random_uuid(),
  link        text not null unique,
  title       text not null,
  summary     text not null default '',
  source      text not null,
  source_url  text not null default '',
  category    text not null default 'general' check (category in ('general','precios','normativa','empresas','gobierno','premios','innovacion','oportunidades')),
  country     text not null default 'colombia',
  image_url   text,
  published_at timestamptz,
  fetched_at  timestamptz not null default now()
);
create index if not exists news_published_idx on public.news_items (published_at desc);
alter table public.news_items enable row level security;
drop policy if exists "news_public_read" on public.news_items;
create policy "news_public_read" on public.news_items for select using (true);
