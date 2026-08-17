-- ObraHub — RFIs y No Conformidades (Jugada D)
-- Pegar en: Supabase Dashboard → SQL Editor → Run
create table if not exists public.project_rfis (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  code        text not null,
  title       text not null,
  body        text not null default '',
  reference   text not null default '',
  assignee    text not null default '',
  due_date    date,
  status      text not null default 'abierta' check (status in ('abierta', 'respondida', 'cerrada')),
  response    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists project_rfis_project_idx on public.project_rfis (project_id, created_at desc);

alter table public.project_rfis enable row level security;

drop policy if exists "rfis_select_member" on public.project_rfis;
create policy "rfis_select_member" on public.project_rfis
  for select using (exists (select 1 from public.projects p where p.id = project_rfis.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_rfis.project_id, auth.uid()));

drop policy if exists "rfis_insert_member" on public.project_rfis;
create policy "rfis_insert_member" on public.project_rfis
  for insert with check (owner_id = auth.uid()
    and (exists (select 1 from public.projects p where p.id = project_rfis.project_id and p.user_id = auth.uid())
      or public.is_project_editor(project_rfis.project_id, auth.uid())
      or public.is_project_member(project_rfis.project_id, auth.uid())));

drop policy if exists "rfis_update_member" on public.project_rfis;
create policy "rfis_update_member" on public.project_rfis
  for update using (exists (select 1 from public.projects p where p.id = project_rfis.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_rfis.project_id, auth.uid()));
