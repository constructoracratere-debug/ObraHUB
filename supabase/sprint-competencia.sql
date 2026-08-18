-- ObraHub — Sprint competencia: Punch List, Change Orders, Submittals, API keys
-- Pegar en: Supabase Dashboard → SQL Editor → Run

-- 1) PUNCH LIST (defectos con pin de plano/modelo)
create table if not exists public.project_punch_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  code        text not null default '',
  title       text not null,
  location    text not null default '',        -- plano/nivel/sector (ref. humana)
  drawing     text not null default '',        -- nombre del plano/DWG/IFC
  assignee    text not null default '',
  due_date    date,
  status      text not null default 'abierta' check (status in ('abierta','verificada','cerrada')),
  photo       text,                            -- storage path evidencia
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists punch_project_idx on public.project_punch_items (project_id, status);
alter table public.project_punch_items enable row level security;
drop policy if exists "punch_member" on public.project_punch_items;
create policy "punch_member" on public.project_punch_items
  for select using (exists (select 1 from public.projects p where p.id = project_punch_items.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_punch_items.project_id, auth.uid()));
drop policy if exists "punch_write" on public.project_punch_items;
create policy "punch_write" on public.project_punch_items
  for insert with check (owner_id = auth.uid() and (exists (select 1 from public.projects p where p.id = project_punch_items.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_punch_items.project_id, auth.uid())));
drop policy if exists "punch_update" on public.project_punch_items;
create policy "punch_update" on public.project_punch_items
  for update using (exists (select 1 from public.projects p where p.id = project_punch_items.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_punch_items.project_id, auth.uid()));

-- 2) CHANGE ORDERS (órdenes de cambio con impacto presupuestal)
create table if not exists public.project_change_orders (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  code          text not null default 'OC-001',
  title         text not null,
  reason        text not null default '',      -- causal (alcance/interferencia/fuerza mayor…)
  impact_items  jsonb not null default '[]'::jsonb, -- [{descripcion, unidad, cantidad, precioUnitario, subtotal}]
  impact_total  numeric(14,2) not null default 0,
  schedule_days integer not null default 0,   -- impacto en plazo
  status        text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada')),
  decision_note text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists co_project_idx on public.project_change_orders (project_id, status);
alter table public.project_change_orders enable row level security;
drop policy if exists "co_member" on public.project_change_orders;
create policy "co_member" on public.project_change_orders
  for select using (exists (select 1 from public.projects p where p.id = project_change_orders.project_id and p.user_id = auth.uid())
    or public.is_project_member(project_change_orders.project_id, auth.uid()));
drop policy if exists "co_write" on public.project_change_orders;
create policy "co_write" on public.project_change_orders
  for insert with check (owner_id = auth.uid() and (exists (select 1 from public.projects p where p.id = project_change_orders.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_change_orders.project_id, auth.uid())));
drop policy if exists "co_update" on public.project_change_orders;
create policy "co_update" on public.project_change_orders
  for update using (exists (select 1 from public.projects p where p.id = project_change_orders.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_change_orders.project_id, auth.uid()));

-- 3) SUBMITTALS: la tabla de RFIs gana un tipo y estados de revisión
alter table public.project_rfis add column if not exists kind text not null default 'rfi'
  check (kind in ('rfi', 'submittal'));
alter table public.project_rfis drop constraint if exists rfis_status_chk;
alter table public.project_rfis drop constraint if exists project_rfis_status_check;
alter table public.project_rfis add constraint project_rfis_status_check
  check (status in ('abierta','respondida','cerrada','aprobada','rechazada','aprobada_con_observaciones'));

-- 4) API PÚBLICA: llaves por usuario
create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  key_hash    text not null unique,            -- sha256 de la llave
  label       text not null default 'default',
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash);
alter table public.api_keys enable row level security;
drop policy if exists "api_keys_own" on public.api_keys;
create policy "api_keys_own" on public.api_keys
  for select using (user_id = auth.uid());
drop policy if exists "api_keys_insert_own" on public.api_keys;
create policy "api_keys_insert_own" on public.api_keys
  for insert with check (user_id = auth.uid());
drop policy if exists "api_keys_delete_own" on public.api_keys;
create policy "api_keys_delete_own" on public.api_keys
  for delete using (user_id = auth.uid());
