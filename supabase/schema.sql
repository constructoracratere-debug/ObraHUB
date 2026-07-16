-- ======================================================================
-- ObraHub — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. profiles  — extends Supabase auth.users with ObraHub-specific fields
-- ----------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text,
  profession_type text,
  company         text,
  phone           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'ObraHub user profile — one row per auth user. Auto-created on signup.';

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------
-- 2. projects — a user's engineering/architecture projects
-- ----------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  slug        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

comment on table public.projects is
  'A user''s project. Slug is unique per user (not globally).';

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ----------------------------------------------------------------------
-- 3. conversation_messages — chat history per project
-- ----------------------------------------------------------------------
create table if not exists public.conversation_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

comment on table public.conversation_messages is
  'Chat messages exchanged within a project conversation.';

create index if not exists conversation_messages_project_id_idx
  on public.conversation_messages (project_id, created_at);

-- Bump projects.updated_at whenever a message is added.
create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists conversation_message_insert_touch_project
  on public.conversation_messages;
create trigger conversation_message_insert_touch_project
  after insert on public.conversation_messages
  for each row execute function public.touch_project_updated_at();

-- ----------------------------------------------------------------------
-- 4. memories — AI project memory (facts/notes the assistant remembers)
-- ----------------------------------------------------------------------
create table if not exists public.memories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  content     text not null,
  source      text not null default 'manual' check (source in ('manual', 'auto')),
  created_at  timestamptz not null default now()
);

comment on table public.memories is
  'Facts/notes the AI assistant remembers about each project.';

create index if not exists memories_project_id_idx on public.memories (project_id);

-- ----------------------------------------------------------------------
-- 5. Row Level Security — a user can ONLY access their own data
-- ----------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.projects              enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.memories              enable row level security;

-- profiles: a user reads/updates only their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- projects: a user manages only their own projects
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- conversation_messages: only accessible via a project the user owns
drop policy if exists "messages_select_own" on public.conversation_messages;
create policy "messages_select_own"
  on public.conversation_messages for select
  using (exists (
    select 1 from public.projects p
    where p.id = conversation_messages.project_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "messages_insert_own" on public.conversation_messages;
create policy "messages_insert_own"
  on public.conversation_messages for insert
  with check (exists (
    select 1 from public.projects p
    where p.id = conversation_messages.project_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "messages_delete_own" on public.conversation_messages;
create policy "messages_delete_own"
  on public.conversation_messages for delete
  using (exists (
    select 1 from public.projects p
    where p.id = conversation_messages.project_id
      and p.user_id = auth.uid()
  ));

-- memories: only accessible via a project the user owns
drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own"
  on public.memories for select
  using (exists (
    select 1 from public.projects p
    where p.id = memories.project_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own"
  on public.memories for insert
  with check (exists (
    select 1 from public.projects p
    where p.id = memories.project_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own"
  on public.memories for delete
  using (exists (
    select 1 from public.projects p
    where p.id = memories.project_id
      and p.user_id = auth.uid()
  ));
