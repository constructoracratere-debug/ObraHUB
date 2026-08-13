-- ======================================================================
-- ObraHub — IFC ↔ Task links (BIM 4D)
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
--
-- Stores relationships between Gantt tasks and IFC model elements.
-- Each row links one task to one or more IFC element GlobalIds, enabling
-- BIM 4D: click a task → highlight its elements in the model, and
-- click an element → see which task it belongs to.
-- ======================================================================

create table if not exists public.project_ifc_links (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  task_id         uuid not null references public.project_tasks (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  ifc_file_id     uuid references public.files (id) on delete set null,
  ifc_global_ids  text[] not null default '{}',
  ifc_class       text,
  label           text,
  created_at      timestamptz not null default now()
);

create index if not exists project_ifc_links_project_idx on public.project_ifc_links (project_id);
create index if not exists project_ifc_links_task_idx on public.project_ifc_links (task_id);
create index if not exists project_ifc_links_file_idx on public.project_ifc_links (ifc_file_id);

alter table public.project_ifc_links enable row level security;

drop policy if exists "ifc_links_select_own" on public.project_ifc_links;
create policy "ifc_links_select_own"
  on public.project_ifc_links for select
  using (exists (select 1 from public.projects p where p.id = project_ifc_links.project_id and p.user_id = auth.uid()));

drop policy if exists "ifc_links_insert_own" on public.project_ifc_links;
create policy "ifc_links_insert_own"
  on public.project_ifc_links for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_ifc_links.project_id and p.user_id = auth.uid()));

drop policy if exists "ifc_links_update_own" on public.project_ifc_links;
create policy "ifc_links_update_own"
  on public.project_ifc_links for update
  using (exists (select 1 from public.projects p where p.id = project_ifc_links.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_ifc_links.project_id and p.user_id = auth.uid()));

drop policy if exists "ifc_links_delete_own" on public.project_ifc_links;
create policy "ifc_links_delete_own"
  on public.project_ifc_links for delete
  using (exists (select 1 from public.projects p where p.id = project_ifc_links.project_id and p.user_id = auth.uid()));
