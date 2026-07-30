-- ======================================================================
-- ObraHub — project files (Storage tool / DMS)
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- PREREQUISITE: create a PRIVATE Storage bucket named "project-files"
--   Dashboard → Storage → New bucket → name: project-files → Private → Create
-- ======================================================================

-- 1. files table — metadata for uploaded project files (binary lives in Storage)
create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid not null references public.folders (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint not null default 0,
  created_at    timestamptz not null default now()
);

comment on table public.files is
  'Project file metadata. The binary object lives in the project-files Storage bucket.';

create index if not exists files_folder_id_idx  on public.files (folder_id, created_at);
create index if not exists files_project_id_idx on public.files (project_id);

alter table public.files enable row level security;

-- A user manages only files within folders/projects they own.
drop policy if exists "files_select_own" on public.files;
create policy "files_select_own"
  on public.files for select
  using (exists (
    select 1 from public.projects p
    where p.id = files.project_id and p.user_id = auth.uid()
  ));

drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own"
  on public.files for insert
  with check (owner_id = auth.uid() and exists (
    select 1 from public.projects p
    where p.id = files.project_id and p.user_id = auth.uid()
  ));

drop policy if exists "files_delete_own" on public.files;
create policy "files_delete_own"
  on public.files for delete
  using (exists (
    select 1 from public.projects p
    where p.id = files.project_id and p.user_id = auth.uid()
  ));

-- 2. Storage policies — let a user read/write their own objects in the bucket.
--    Paths are structured as {userId}/{projectId}/{folderId}/{filename}.
create policy if not exists "project_files_read_own"
  on storage.objects for select
  using (bucket_id = 'project-files');

create policy if not exists "project_files_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'project-files');

create policy if not exists "project_files_update_own"
  on storage.objects for update
  using (bucket_id = 'project-files');

create policy if not exists "project_files_delete_own"
  on storage.objects for delete
  using (bucket_id = 'project-files');
