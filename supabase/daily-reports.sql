-- ======================================================================
-- ObraHub — Daily Reports (Bitácora de Obra)
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Stores daily construction logs per project (weather, workers, notes).
-- ======================================================================

create table if not exists public.project_daily_reports (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  owner_id             uuid not null references auth.users (id) on delete cascade,
  report_date          date not null,
  weather              text,
  workers_count        integer,
  equipment            text,
  activities_completed text[] default '{}',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_id, report_date)
);

create index if not exists daily_reports_project_idx
  on public.project_daily_reports (project_id, report_date desc);

alter table public.project_daily_reports enable row level security;

drop policy if exists "daily_reports_select_own" on public.project_daily_reports;
create policy "daily_reports_select_own"
  on public.project_daily_reports for select
  using (exists (select 1 from public.projects p where p.id = project_daily_reports.project_id and p.user_id = auth.uid()));

drop policy if exists "daily_reports_insert_own" on public.project_daily_reports;
create policy "daily_reports_insert_own"
  on public.project_daily_reports for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_daily_reports.project_id and p.user_id = auth.uid()));

drop policy if exists "daily_reports_update_own" on public.project_daily_reports;
create policy "daily_reports_update_own"
  on public.project_daily_reports for update
  using (exists (select 1 from public.projects p where p.id = project_daily_reports.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_daily_reports.project_id and p.user_id = auth.uid()));

drop policy if exists "daily_reports_delete_own" on public.project_daily_reports;
create policy "daily_reports_delete_own"
  on public.project_daily_reports for delete
  using (exists (select 1 from public.projects p where p.id = project_daily_reports.project_id and p.user_id = auth.uid()));
