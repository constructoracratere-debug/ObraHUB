-- ======================================================================
-- ObraHub — nested subfolders (hierarchical folders)
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Additive: adds a nullable parent_folder_id. Existing folders stay at root.
-- ======================================================================

-- 1. Add parent_folder_id (nullable self-reference). NULL = root-level folder.
alter table public.folders
  add column if not exists parent_folder_id uuid references public.folders (id) on delete cascade;

-- 2. Index for fast "list children of folder X" queries.
create index if not exists folders_parent_id_idx
  on public.folders (parent_folder_id);

-- 3. Widen slug uniqueness so the same slug can exist under different parents.
--    Drop the original inline unique(project_id, slug) constraint.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.folders'::regclass
    and contype = 'u'
    and array_to_string(conkey, ',') = (
      select array_to_string(array_agg(attnum order by attnum), ',')
      from pg_attribute
      where attrelid = 'public.folders'::regclass
        and attname in ('project_id', 'slug')
    )
  limit 1;
  if cname is not null then
    execute format('alter table public.folders drop constraint %I', cname);
  end if;
end $$;

-- 4. New partial unique indexes: slug unique within the same parent group.
drop index if exists folders_unique_root_slug;
create unique index folders_unique_root_slug
  on public.folders (project_id, slug)
  where parent_folder_id is null;

drop index if exists folders_unique_child_slug;
create unique index folders_unique_child_slug
  on public.folders (project_id, parent_folder_id, slug)
  where parent_folder_id is not null;
