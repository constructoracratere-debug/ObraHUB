-- ======================================================================
-- ObraHub — Project Controls spine (presupuestos persistentes + bitácora)
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Fase 0: budgets/budget_items → los APU generados por IA se persisten
--         y cada ítem puede vincularse a una tarea del cronograma (5D↔4D).
-- Fase 1: bitacora_entries/bitacora_task_progress → la realidad diaria de
--         obra (clima, personal, equipo, novedades) y el avance físico por
--         tarea y día, insumo de la Curva S / Valor Ganado / alertas.
-- ======================================================================

-- ---------------------------------------------------------------------
-- PRESUPUESTOS (persistencia de APUBudget)
-- ---------------------------------------------------------------------

create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  prompt        text,
  country       text not null default 'colombia',
  costos_directos numeric(14,2) not null default 0,
  aiu_total     numeric(14,2) not null default 0,
  valor_aiu     numeric(14,2) not null default 0,
  subtotal_con_aiu numeric(14,2) not null default 0,
  valor_iva     numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  source        text not null default 'ai' check (source in ('ai', 'ifc', 'manual')),
  created_at    timestamptz not null default now()
);

create index if not exists budgets_project_id_idx on public.budgets (project_id, created_at desc);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select using (exists (select 1 from public.projects p where p.id = budgets.project_id and p.user_id = auth.uid()));

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = budgets.project_id and p.user_id = auth.uid()));

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete using (exists (select 1 from public.projects p where p.id = budgets.project_id and p.user_id = auth.uid()));

-- Ítems APU: un capítulo agrupa ítems; cada ítem puede vincularse a una
-- tarea del cronograma (task_id) — la unión 5D↔4D que alimenta la Curva S.
create table if not exists public.budget_items (
  id              uuid primary key default gen_random_uuid(),
  budget_id       uuid not null references public.budgets (id) on delete cascade,
  task_id         uuid references public.project_tasks (id) on delete set null,
  chapter         text not null default '',
  codigo          text not null default '',
  descripcion     text not null,
  unidad          text not null default '',
  cantidad        numeric(12,2) not null default 0,
  costo_directo   numeric(12,2) not null default 0,
  precio_unitario_total numeric(12,2) not null default 0,
  subtotal        numeric(12,2) not null default 0,
  -- Cantidad realmente ejecutada en obra (se actualiza desde bitácora/
  -- liquidación): habilita ejecutado vs presupuestado sin otra tabla.
  cantidad_ejecutada numeric(12,2) not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists budget_items_budget_id_idx on public.budget_items (budget_id, sort_order);
create index if not exists budget_items_task_id_idx on public.budget_items (task_id);

alter table public.budget_items enable row level security;

drop policy if exists "budget_items_select_own" on public.budget_items;
create policy "budget_items_select_own" on public.budget_items
  for select using (exists (
    select 1 from public.budgets b
    join public.projects p on p.id = b.project_id
    where b.id = budget_items.budget_id and p.user_id = auth.uid()));

drop policy if exists "budget_items_insert_own" on public.budget_items;
create policy "budget_items_insert_own" on public.budget_items
  for insert with check (exists (
    select 1 from public.budgets b
    join public.projects p on p.id = b.project_id
    where b.id = budget_items.budget_id and p.user_id = auth.uid()));

drop policy if exists "budget_items_update_own" on public.budget_items;
create policy "budget_items_update_own" on public.budget_items
  for update using (exists (
    select 1 from public.budgets b
    join public.projects p on p.id = b.project_id
    where b.id = budget_items.budget_id and p.user_id = auth.uid()));

drop policy if exists "budget_items_delete_own" on public.budget_items;
create policy "budget_items_delete_own" on public.budget_items
  for delete using (exists (
    select 1 from public.budgets b
    join public.projects p on p.id = b.project_id
    where b.id = budget_items.budget_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- BITÁCORA DIARIA (obligatoria en obra — Ley 20257 / control curaduría)
-- ---------------------------------------------------------------------

create table if not exists public.bitacora_entries (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  entry_date    date not null,
  -- Clima: afecta reclamaciones de plazo (lluvias) en asambleas.
  weather       text not null default 'soleado'
    check (weather in ('soleado', 'nublado', 'lluvia', 'lluvia_fuerte', 'otro')),
  rain_hours    numeric(4,1) not null default 0,
  -- Recursos del día.
  workers_total integer not null default 0,
  workers_detail jsonb not null default '{}'::jsonb,  -- {oficio: cantidad}
  equipment     jsonb not null default '{}'::jsonb,   -- {equipo: cantidad}
  -- Narrativa del día.
  observations  text not null default '',
  incidents     text not null default '',
  delays        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, entry_date)
);

create index if not exists bitacora_project_date_idx on public.bitacora_entries (project_id, entry_date desc);

alter table public.bitacora_entries enable row level security;

drop policy if exists "bitacora_select_own" on public.bitacora_entries;
create policy "bitacora_select_own" on public.bitacora_entries
  for select using (exists (select 1 from public.projects p where p.id = bitacora_entries.project_id and p.user_id = auth.uid()));

drop policy if exists "bitacora_insert_own" on public.bitacora_entries;
create policy "bitacora_insert_own" on public.bitacora_entries
  for insert with check (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = bitacora_entries.project_id and p.user_id = auth.uid()));

drop policy if exists "bitacora_update_own" on public.bitacora_entries;
create policy "bitacora_update_own" on public.bitacora_entries
  for update using (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = bitacora_entries.project_id and p.user_id = auth.uid()));

drop policy if exists "bitacora_delete_own" on public.bitacora_entries;
create policy "bitacora_delete_own" on public.bitacora_entries
  for delete using (owner_id = auth.uid() and exists (select 1 from public.projects p where p.id = bitacora_entries.project_id and p.user_id = auth.uid()));

-- Avance físico por tarea y día (progreso acumulado %): la serie temporal
-- que alimenta Curva S real, Valor Ganado y detección de estancamiento.
create table if not exists public.bitacora_task_progress (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.bitacora_entries (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  task_id     uuid not null references public.project_tasks (id) on delete cascade,
  progress    numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  note        text not null default '',
  unique (entry_id, task_id)
);

create index if not exists bitacora_progress_project_idx on public.bitacora_task_progress (project_id);
create index if not exists bitacora_progress_task_idx on public.bitacora_task_progress (task_id);

alter table public.bitacora_task_progress enable row level security;

drop policy if exists "bitacora_progress_select_own" on public.bitacora_task_progress;
create policy "bitacora_progress_select_own" on public.bitacora_task_progress
  for select using (exists (select 1 from public.projects p where p.id = bitacora_task_progress.project_id and p.user_id = auth.uid()));

drop policy if exists "bitacora_progress_insert_own" on public.bitacora_task_progress;
create policy "bitacora_progress_insert_own" on public.bitacora_task_progress
  for insert with check (exists (select 1 from public.projects p where p.id = bitacora_task_progress.project_id and p.user_id = auth.uid()));

drop policy if exists "bitacora_progress_delete_own" on public.bitacora_task_progress;
create policy "bitacora_progress_delete_own" on public.bitacora_task_progress
  for delete using (exists (select 1 from public.projects p where p.id = bitacora_task_progress.project_id and p.user_id = auth.uid()));
