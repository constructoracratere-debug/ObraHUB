-- ObraHub — project_health: salud denormalizada por proyecto (escala 200+)
-- Pegar en: Supabase Dashboard → SQL Editor → Run
create table if not exists public.project_health (
  project_id          uuid primary key references public.projects (id) on delete cascade,
  name                text not null default '',
  progress            numeric(6,2) not null default 0,
  spi                 numeric(5,2),
  alerts              integer not null default 0,
  critical            integer not null default 0,
  tasks_total         integer not null default 0,
  total_budget        numeric(16,2),
  next_milestone_name text,
  next_milestone_date date,
  last_bitacora_date  date,
  updated_at          timestamptz not null default now()
);

create index if not exists project_health_spi_idx on public.project_health (spi);

alter table public.project_health enable row level security;

drop policy if exists "health_select_member" on public.project_health;
create policy "health_select_member" on public.project_health
  for select using (exists (select 1 from public.projects p where p.id = project_health.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_health.project_id, auth.uid()));
