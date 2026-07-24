-- ======================================================================
-- ObraHub — folders schema (3-level hierarchy: project → folder → chats/memories)
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE). Additive — no data loss.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. folders — sub-areas within a project (Foundation, Legal, Costs, etc.)
-- ----------------------------------------------------------------------
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  slug        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, slug)
);

comment on table public.folders is
  'Sub-areas within a project. Slug is unique per project. Each folder has its own chats + memories.';

create index if not exists folders_project_id_idx on public.folders (project_id);

alter table public.folders enable row level security;

-- A user manages only folders within their own projects.
drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own"
  on public.folders for select
  using (exists (
    select 1 from public.projects p
    where p.id = folders.project_id and p.user_id = auth.uid()
  ));

drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own"
  on public.folders for insert
  with check (exists (
    select 1 from public.projects p
    where p.id = folders.project_id and p.user_id = auth.uid()
  ));

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own"
  on public.folders for delete
  using (exists (
    select 1 from public.projects p
    where p.id = folders.project_id and p.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------
-- 2. Add folder_id to conversation_messages + memories (nullable: additive)
--    New chats/memories are scoped to a folder; legacy rows keep folder_id NULL.
-- ----------------------------------------------------------------------
alter table public.conversation_messages add column if not exists folder_id uuid references public.folders (id) on delete cascade;
alter table public.memories              add column if not exists folder_id uuid references public.folders (id) on delete cascade;

create index if not exists conversation_messages_folder_id_idx on public.conversation_messages (folder_id, created_at);
create index if not exists memories_folder_id_idx              on public.memories (folder_id);

-- RLS: folder-scoped rows inherit ownership via folders → projects → auth.uid().
drop policy if exists "messages_select_folder_own" on public.conversation_messages;
create policy "messages_select_folder_own"
  on public.conversation_messages for select
  using (folder_id is not null and exists (
    select 1 from public.folders f
    join public.projects p on p.id = f.project_id
    where f.id = conversation_messages.folder_id and p.user_id = auth.uid()
  ));

drop policy if exists "messages_insert_folder_own" on public.conversation_messages;
create policy "messages_insert_folder_own"
  on public.conversation_messages for insert
  with check (folder_id is not null and exists (
    select 1 from public.folders f
    join public.projects p on p.id = f.project_id
    where f.id = conversation_messages.folder_id and p.user_id = auth.uid()
  ));

drop policy if exists "memories_select_folder_own" on public.memories;
create policy "memories_select_folder_own"
  on public.memories for select
  using (folder_id is not null and exists (
    select 1 from public.folders f
    join public.projects p on p.id = f.project_id
    where f.id = memories.folder_id and p.user_id = auth.uid()
  ));

drop policy if exists "memories_insert_folder_own" on public.memories;
create policy "memories_insert_folder_own"
  on public.memories for insert
  with check (folder_id is not null and exists (
    select 1 from public.folders f
    join public.projects p on p.id = f.project_id
    where f.id = memories.folder_id and p.user_id = auth.uid()
  ));

drop policy if exists "memories_delete_folder_own" on public.memories;
create policy "memories_delete_folder_own"
  on public.memories for delete
  using (folder_id is not null and exists (
    select 1 from public.folders f
    join public.projects p on p.id = f.project_id
    where f.id = memories.folder_id and p.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------
-- 3. Trigger: bump folders.updated_at whenever a folder message is added
-- ----------------------------------------------------------------------
create or replace function public.touch_folder_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.folder_id is not null then
    update public.folders set updated_at = now() where id = new.folder_id;
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_message_insert_touch_folder
  on public.conversation_messages;
create trigger conversation_message_insert_touch_folder
  after insert on public.conversation_messages
  for each row execute function public.touch_folder_updated_at();
