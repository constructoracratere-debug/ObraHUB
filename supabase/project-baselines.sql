-- ObraHub — Línea base del cronograma (Jugada E)
-- Pegar en: Supabase Dashboard → SQL Editor → Run
create table if not exists public.project_baselines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  label       text not null default 'Línea base',
  snapshot    jsonb not null default '[]'::jsonb, -- [{taskId,name,start,end}]
  created_at  timestamptz not null default now()
);

create index if not exists project_baselines_project_idx on public.project_baselines (project_id, created_at desc);

alter table public.project_baselines enable row level security;

drop policy if exists "baselines_select_member" on public.project_baselines;
create policy "baselines_select_member" on public.project_baselines
  for select using (exists (select 1 from public.projects p where p.id = project_baselines.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_baselines.project_id, auth.uid()));

drop policy if exists "baselines_insert_member" on public.project_baselines;
create policy "baselines_insert_member" on public.project_baselines
  for insert with check (owner_id = auth.uid()
    and (exists (select 1 from public.projects p where p.id = project_baselines.project_id and p.user_id = auth.uid())
      or public.is_project_editor(project_baselines.project_id, auth.uid())
      or public.is_project_member(project_baselines.project_id, auth.uid())));

drop policy if exists "baselines_delete_member" on public.project_baselines;
create policy "baselines_delete_member" on public.project_baselines
  for delete using (exists (select 1 from public.projects p where p.id = project_baselines.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_baselines.project_id, auth.uid()));
