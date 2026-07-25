-- ======================================================================
-- ObraHub — Knowledge Base schema (documents + vector search)
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- PREREQUISITE: enable the vector extension first:
--   Dashboard → Database → Extensions → search "vector" → enable it.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ======================================================================

-- ----------------------------------------------------------------------
-- 0. pgvector extension (idempotent)
-- ----------------------------------------------------------------------
create extension if not exists vector;

-- ----------------------------------------------------------------------
-- 1. is_admin flag on profiles (admin manages the global library)
-- ----------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Mark the ObraHub owner as admin. Add more emails here as needed.
-- (Run once; safe to re-run.)
update public.profiles
  set is_admin = true
  where id in (
    select id from auth.users
    where email in ('constructoracratere@gmail.com')
  );

-- ----------------------------------------------------------------------
-- 2. documents — the KB library (global regulations + project uploads)
-- ----------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null check (scope in ('global', 'project')),
  project_id      uuid references public.projects (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  title           text not null,
  slug            text not null,
  source_filename text,
  mime_type       text,
  page_count      integer not null default 0,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  created_at      timestamptz not null default now(),
  -- global docs have no project; project docs must have one.
  check (
    (scope = 'global' and project_id is null) or
    (scope = 'project' and project_id is not null)
  )
);

comment on table public.documents is
  'KB documents. Global scope = shared regulations (admin-managed). Project scope = user uploads.';

create index if not exists documents_scope_idx        on public.documents (scope);
create index if not exists documents_project_id_idx   on public.documents (project_id);
create index if not exists documents_owner_id_idx     on public.documents (owner_id);

alter table public.documents enable row level security;

-- A document's slug is unique within its scope (per project for project docs).
drop index if exists documents_global_slug_idx;
drop index if exists documents_project_slug_idx;
create unique index if not exists documents_global_slug_idx
  on public.documents (slug) where scope = 'global';
create unique index if not exists documents_project_slug_idx
  on public.documents (project_id, slug) where scope = 'project';

-- Global docs are readable by ANY authenticated user; project docs by the owner.
-- (RLS cannot reference is_admin in a subquery cheaply, so we rely on auth.uid().)
drop policy if exists "documents_select" on public.documents;
create policy "documents_select"
  on public.documents for select
  using (
    scope = 'global'
    or exists (
      select 1 from public.projects p
      where p.id = documents.project_id and p.user_id = auth.uid()
    )
  );

-- Only admins can insert global docs; any user can insert project docs they own.
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert"
  on public.documents for insert
  with check (
    owner_id = auth.uid()
    and (
      (scope = 'global' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
      or
      (scope = 'project' and project_id is not null and exists (
        select 1 from public.projects p
        where p.id = documents.project_id and p.user_id = auth.uid()
      ))
    )
  );

-- Owners (and admins for global) can update status/metadata of their docs.
drop policy if exists "documents_update" on public.documents;
create policy "documents_update"
  on public.documents for update
  using (
    owner_id = auth.uid()
    or (scope = 'global' and exists (
      select 1 from public.profiles where id = auth.uid() and is_admin = true
    ))
  )
  with check (
    owner_id = auth.uid()
    or (scope = 'global' and exists (
      select 1 from public.profiles where id = auth.uid() and is_admin = true
    ))
  );

-- Owners (and admins for global) can delete their docs.
drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete"
  on public.documents for delete
  using (
    owner_id = auth.uid()
    or (scope = 'global' and exists (
      select 1 from public.profiles where id = auth.uid() and is_admin = true
    ))
  );

-- ----------------------------------------------------------------------
-- 3. document_chunks — embedded text chunks (the searchable unit)
--    text-embedding-3-small produces 1536-dim vectors.
-- ----------------------------------------------------------------------
create table if not exists public.document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  page_number   integer not null,
  chunk_index   integer not null default 0,
  text          text not null,
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);

comment on table public.document_chunks is
  'Embedded text chunks. Vector column for semantic search. Cascades with document deletion.';

create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);

-- HNSW index for fast cosine-similarity search (pgvector >= 0.5.0).
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

alter table public.document_chunks enable row level security;

-- Chunk visibility mirrors its document's visibility (global or owned project).
drop policy if exists "document_chunks_select" on public.document_chunks;
create policy "document_chunks_select"
  on public.document_chunks for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
      and (
        d.scope = 'global'
        or exists (
          select 1 from public.projects p
          where p.id = d.project_id and p.user_id = auth.uid()
        )
      )
    )
  );

-- Only the document owner (or admin for global) can insert chunks.
drop policy if exists "document_chunks_insert" on public.document_chunks;
create policy "document_chunks_insert"
  on public.document_chunks for insert
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
      and d.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------
-- 4. match_document_chunks — the vector similarity search function.
--    Called via supabase.rpc('match_document_chunks', {...}).
--    Filters by an array of document_ids AND enforces ownership via RLS
--    (the function runs as the caller, so RLS applies to the table reads).
-- ----------------------------------------------------------------------
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count     integer default 8,
  document_ids    uuid[] default null
)
returns table (
  id            uuid,
  document_id   uuid,
  page_number   integer,
  chunk_index   integer,
  text          text,
  similarity    float
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.page_number,
    dc.chunk_index,
    dc.text,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where
    dc.embedding is not null
    and (document_ids is null or dc.document_id = any(document_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- SECURITY DEFINER is intentionally NOT used: we want RLS to apply so the
-- caller only ever matches chunks from documents they can read.
