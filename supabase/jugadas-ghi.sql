-- ObraHub — Jugadas G/H/I: fotos bitácora + timeline actividad
-- Pegar en: Supabase Dashboard → SQL Editor → Run

-- G: fotos de evidencia por día de bitácora (paths en Storage)
alter table public.bitacora_entries add column if not exists photos jsonb not null default '[]'::jsonb;

-- I: timeline de actividad del proyecto (auditoría ligera)
create table if not exists public.project_activity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('file','budget','task','bitacora','rfi','member','baseline','link')),
  description text not null,
  created_at  timestamptz not null default now()
);

create index if not exists project_activity_project_idx on public.project_activity (project_id, created_at desc);

alter table public.project_activity enable row level security;

drop policy if exists "activity_select_member" on public.project_activity;
create policy "activity_select_member" on public.project_activity
  for select using (exists (select 1 from public.projects p where p.id = project_activity.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_activity.project_id, auth.uid()));

drop policy if exists "activity_insert_member" on public.project_activity;
create policy "activity_insert_member" on public.project_activity
  for insert with check (exists (select 1 from public.projects p where p.id = project_activity.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_activity.project_id, auth.uid()));
