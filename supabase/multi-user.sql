-- ======================================================================
-- ObraHub — Multi-user collaboration foundation (ADDITIVE — safe to run)
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
--
-- Adds project_members + a SECURITY DEFINER helper + ADDITIVE RLS policies
-- so several ObraHub accounts can view/edit the same project. Nothing is
-- dropped: existing owner policies keep working; member access is OR-ed in.
-- Roles: 'viewer' (read-only), 'editor' (default, full project work),
-- 'admin' (same as editor today; reserved for invite management).
-- ======================================================================

create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'editor' check (role in ('viewer', 'editor', 'admin')),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_project_idx on public.project_members (project_id);
create index if not exists project_members_user_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

-- Members can see who else belongs to their projects.
drop policy if exists "members_select_own" on public.project_members;
create policy "members_select_own" on public.project_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.projects p
               where p.id = project_members.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.project_members m2
               where m2.project_id = project_members.project_id
                 and m2.user_id = auth.uid()
                 and m2.role in ('editor', 'admin'))
  );

-- Only the project OWNER (or an admin) can add/remove members for now.
drop policy if exists "members_insert_owner" on public.project_members;
create policy "members_insert_owner" on public.project_members
  for insert with check (
    exists (select 1 from public.projects p
            where p.id = project_members.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.project_members m2
               where m2.project_id = project_members.project_id
                 and m2.user_id = auth.uid()
                 and m2.role = 'admin')
  );

drop policy if exists "members_delete_owner" on public.project_members;
create policy "members_delete_owner" on public.project_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.projects p
               where p.id = project_members.project_id and p.user_id = auth.uid())
    or exists (select 1 from public.project_members m2
               where m2.project_id = project_members.project_id
                 and m2.user_id = auth.uid()
                 and m2.role = 'admin')
  );

-- Helper: is `usr` a member (viewer/editor/admin) of project `proj`?
-- SECURITY DEFINER + fixed search_path avoids recursive RLS lookups.
create or replace function public.is_project_member(proj uuid, usr uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = proj and m.user_id = usr
  );
$$;

-- Helper: is `usr` an EDITOR/admin of the project (write access)?
create or replace function public.is_project_editor(proj uuid, usr uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = proj and m.user_id = usr and m.role in ('editor', 'admin')
  );
$$;

-- ----------------------------------------------------------------------
-- ADDITIVE member policies (OR-ed with the existing owner policies)
-- ----------------------------------------------------------------------

-- Projects appear in members' project lists.
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member" on public.projects
  for select using (public.is_project_editor(id, auth.uid()) or public.is_project_member(id, auth.uid()));

-- Gantt tasks
drop policy if exists "tasks_select_member" on public.project_tasks;
create policy "tasks_select_member" on public.project_tasks
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "tasks_insert_member" on public.project_tasks;
create policy "tasks_insert_member" on public.project_tasks
  for insert with check (
    owner_id = auth.uid()
    and (public.is_project_editor(project_id, auth.uid()) or public.is_project_member(project_id, auth.uid()))
  );

drop policy if exists "tasks_update_member" on public.project_tasks;
create policy "tasks_update_member" on public.project_tasks
  for update using (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "tasks_delete_member" on public.project_tasks;
create policy "tasks_delete_member" on public.project_tasks
  for delete using (public.is_project_editor(project_id, auth.uid()));

-- Folders
drop policy if exists "folders_select_member" on public.folders;
create policy "folders_select_member" on public.folders
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "folders_insert_member" on public.folders;
create policy "folders_insert_member" on public.folders
  for insert with check (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "folders_update_member" on public.folders;
create policy "folders_update_member" on public.folders
  for update using (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "folders_delete_member" on public.folders;
create policy "folders_delete_member" on public.folders
  for delete using (public.is_project_editor(project_id, auth.uid()));

-- Files metadata (storage bucket is already open at bucket level)
drop policy if exists "files_select_member" on public.files;
create policy "files_select_member" on public.files
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "files_insert_member" on public.files;
create policy "files_insert_member" on public.files
  for insert with check (
    owner_id = auth.uid()
    and (public.is_project_editor(project_id, auth.uid()) or public.is_project_member(project_id, auth.uid()))
  );

drop policy if exists "files_delete_member" on public.files;
create policy "files_delete_member" on public.files
  for delete using (public.is_project_editor(project_id, auth.uid()));

-- Budgets + items
drop policy if exists "budgets_select_member" on public.budgets;
create policy "budgets_select_member" on public.budgets
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "budgets_insert_member" on public.budgets;
create policy "budgets_insert_member" on public.budgets
  for insert with check (
    owner_id = auth.uid()
    and (public.is_project_editor(project_id, auth.uid()) or public.is_project_member(project_id, auth.uid()))
  );

drop policy if exists "budgets_delete_member" on public.budgets;
create policy "budgets_delete_member" on public.budgets
  for delete using (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "budget_items_select_member" on public.budget_items;
create policy "budget_items_select_member" on public.budget_items
  for select using (
    exists (select 1 from public.budgets b
            where b.id = budget_items.budget_id
              and (public.is_project_member(b.project_id, auth.uid())))
  );

drop policy if exists "budget_items_write_member" on public.budget_items;
create policy "budget_items_write_member" on public.budget_items
  for update using (
    exists (select 1 from public.budgets b
            where b.id = budget_items.budget_id
              and (public.is_project_editor(b.project_id, auth.uid())))
  );

-- Bitácora
drop policy if exists "bitacora_select_member" on public.bitacora_entries;
create policy "bitacora_select_member" on public.bitacora_entries
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "bitacora_write_member" on public.bitacora_entries;
create policy "bitacora_write_member" on public.bitacora_entries
  for insert with check (
    owner_id = auth.uid()
    and (public.is_project_editor(project_id, auth.uid()) or public.is_project_member(project_id, auth.uid()))
  );

drop policy if exists "bitacora_update_member" on public.bitacora_entries;
create policy "bitacora_update_member" on public.bitacora_entries
  for update using (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "bitacora_progress_select_member" on public.bitacora_task_progress;
create policy "bitacora_progress_select_member" on public.bitacora_task_progress
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "bitacora_progress_write_member" on public.bitacora_task_progress;
create policy "bitacora_progress_write_member" on public.bitacora_task_progress
  for insert with check (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "bitacora_progress_delete_member" on public.bitacora_task_progress;
create policy "bitacora_progress_delete_member" on public.bitacora_task_progress
  for delete using (public.is_project_editor(project_id, auth.uid()));

-- IFC links (4D)
drop policy if exists "ifc_links_member" on public.project_ifc_links;
create policy "ifc_links_member" on public.project_ifc_links
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "ifc_links_write_member" on public.project_ifc_links;
create policy "ifc_links_write_member" on public.project_ifc_links
  for insert with check (public.is_project_editor(project_id, auth.uid()));

drop policy if exists "ifc_links_delete_member" on public.project_ifc_links;
create policy "ifc_links_delete_member" on public.project_ifc_links
  for delete using (public.is_project_editor(project_id, auth.uid()));

-- ----------------------------------------------------------------------
-- 2026-08-28: conversaciones y memorias para MIEMBROS (faltaban).
-- Sin estas políticas, el chat de un proyecto compartido fallaba con
-- "Failed to save message" para cualquier miembro no dueño.
-- ⚠️ Ejecutar este bloque en el SQL Editor de Supabase (Dashboard).
-- ----------------------------------------------------------------------

drop policy if exists "messages_select_member" on public.conversation_messages;
create policy "messages_select_member"
  on public.conversation_messages for select
  using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "messages_insert_member" on public.conversation_messages;
create policy "messages_insert_member"
  on public.conversation_messages for insert
  with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists "memories_select_member" on public.memories;
create policy "memories_select_member"
  on public.memories for select
  using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "memories_insert_member" on public.memories;
create policy "memories_insert_member"
  on public.memories for insert
  with check (public.is_project_member(project_id, auth.uid()));
