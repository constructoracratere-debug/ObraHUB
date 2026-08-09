-- ======================================================================
-- ObraHub — Project tasks (Seguimiento de Obra / Gantt)
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Stores tasks for the interactive Gantt chart, per project.
-- ======================================================================

create table if not exists public.project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  description   text,
  start_date    date not null,
  end_date      date not null,
  progress      numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  dependencies  text[] default '{}',
  task_type     text not null default 'task' check (task_type in ('task', 'milestone', 'summary')),
  color         text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_tasks_project_id_idx on public.project_tasks (project_id, sort_order);

alter table public.project_tasks enable row level security;

drop policy if exists "tasks_select_own" on public.project_tasks;
create policy "tasks_select_own"
  on public.project_tasks for select
  using (exists (select 1 from public.projects p where p.id = project_tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_insert_own" on public.project_tasks;
create policy "tasks_insert_own"
  on public.project_tasks for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_update_own" on public.project_tasks;
create policy "tasks_update_own"
  on public.project_tasks for update
  using (exists (select 1 from public.projects p where p.id = project_tasks.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_delete_own" on public.project_tasks;
create policy "tasks_delete_own"
  on public.project_tasks for delete
  using (exists (select 1 from public.projects p where p.id = project_tasks.project_id and p.user_id = auth.uid()));
