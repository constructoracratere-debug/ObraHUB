-- ======================================================================
-- ObraHub — Price Items database (Costos y Presupuestos)
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Creates the price_items table + seeds ~50 essential Colombian prices.
-- ======================================================================

create table if not exists public.price_items (
  id          uuid primary key default gen_random_uuid(),
  country     text not null default 'colombia' check (country in ('colombia','mexico')),
  category    text not null check (category in ('material','labor','equipment')),
  code        text,
  name        text not null,
  unit        text not null,
  price_cop   numeric(12,2) not null default 0,
  source      text default 'curated',
  updated_at  timestamptz not null default now()
);

create index if not exists price_items_country_idx on public.price_items (country);
create index if not exists price_items_category_idx on public.price_items (category);

alter table public.price_items enable row level security;

-- All authenticated users can read prices; only admins can modify.
drop policy if exists "prices_select" on public.price_items;
create policy "prices_select"
  on public.price_items for select
  using (true);

drop policy if exists "prices_insert_admin" on public.price_items;
create policy "prices_insert_admin"
  on public.price_items for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "prices_update_admin" on public.price_items;
create policy "prices_update_admin"
  on public.price_items for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "prices_delete_admin" on public.price_items;
create policy "prices_delete_admin"
  on public.price_items for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ======================================================================
-- Seed data: essential Colombian construction prices (2024-2025 reference)
-- ======================================================================
insert into public.price_items (country, category, code, name, unit, price_cop, source) values
-- MATERIALES — Cemento y conglomerantes
('colombia','material','MAT-001','Cemento gris structural (bulto 50kg)','bulto',32500,'curated'),
('colombia','material','MAT-002','Cemento blanco (bulto 50kg)','bulto',52000,'curated'),
('colombia','material','MAT-003','Mortero premezclado (bulto 50kg)','bulto',38000,'curated'),
-- MATERIALES — Agregados
('colombia','material','MAT-004','Arena triturada limpia','m³',65000,'curated'),
('colombia','material','MAT-005','Arena de río lavada','m³',58000,'curated'),
('colombia','material','MAT-006','Gravilla de río ½"','m³',72000,'curated'),
('colombia','material','MAT-007','Recebo / tierra de relleno','m³',35000,'curated'),
-- MATERIALES — Acero
('colombia','material','MAT-008','Acero de refuerzo ASTM A615 Gr.60 (varilla)','kg',4900,'curated'),
('colombia','material','MAT-009','Malla electrosoldada 6x6-10/10','m²',24500,'curated'),
('colombia','material','MAT-010','Alambre negro recocido cal. 18','kg',9500,'curated'),
-- MATERIALES — Mampostería
('colombia','material','MAT-011','Ladrillo tolete hueco','unidad',950,'curated'),
('colombia','material','MAT-012','Ladrillo de esmaltado / fachada','unidad',1850,'curated'),
('colombia','material','MAT-013','Bloque de arcilla 10x20x40 cm','unidad',1950,'curated'),
('colombia','material','MAT-014','Bloque de concreto 15x20x40 cm','unidad',3200,'curated'),
-- MATERIALES — Acabados / Pintura
('colombia','material','MAT-015','Pintura vinílica interior blanco (galón)','galón',48000,'curated'),
('colombia','material','MAT-016','Pintura exterior impermeabilizante blanco (galón)','galón',68000,'curated'),
('colombia','material','MAT-017','Pintura esmalte sintético (galón)','galón',72000,'curated'),
('colombia','material','MAT-018','Masilla para pared (bulto 25kg)','bulto',55000,'curated'),
('colombia','material','MAT-019','Cinta de papel para juntas (rollo)','rollo',8500,'curated'),
-- MATERIALES — Pisos y cerámicos
('colombia','material','MAT-020','Baldosa cerámica 60x60 cm','m²',42000,'curated'),
('colombia','material','MAT-021','Porcelanato pulido 60x60 cm','m²',78000,'curated'),
('colombia','material','MAT-022','Adhesivo cerámico Sika (bulto 25kg)','bulto',62000,'curated'),
('colombia','material','MAT-023','Boquilla / lechada cementicia (bulto 5kg)','bulto',28000,'curated'),
-- MATERIALES — Techo / Cubiertas
('colombia','material','MAT-024','Teja de barro cocido (unidad)','unidad',6500,'curated'),
('colombia','material','MAT-025','Teja metálica galvanizada (m²)','m²',35000,'curated'),
('colombia','material','MAT-026','Lámina de fibrocemento (2.44x1.10m)','lamina',58000,'curated'),
-- MATERIALES — Madera
('colombia','material','MAT-027','Madera pino tratado (tabla 2"x4"x3m)','tabla',45000,'curated'),
('colombia','material','MAT-028','Plywood / tablero contrachapado (lámina 1.22x2.44m)','lamina',89000,'curated'),
('colombia','material','MAT-029','Formaletía madera (m² uso)','m²',18000,'curated'),
-- MATERIALES — Instalaciones eléctricas / hidrosanitarias
('colombia','material','MAT-030','Tubo PVC hidráulico ½" (6m)','tubo',22000,'curated'),
('colombia','material','MAT-031','Tubo PVC sanitario 4" (6m)','tubo',85000,'curated'),
('colombia','material','MAT-032','Cable THW cal. 12 AWG (m)','m',3800,'curated'),
('colombia','material','MAT-033','Cable THW cal. 10 AWG (m)','m',5200,'curated'),
('colombia','material','MAT-034','Tomacorriente doble con placa','unidad',28000,'curated'),
('colombia','material','MAT-035','Interruptor simple con placa','unidad',22000,'curated'),
('colombia','material','MAT-036','Panel de breaker 4 circuitos','unidad',125000,'curated'),
-- MATERIALES — Impermeabilización
('colombia','material','MAT-037','Membrana asfáltica Sika (galón)','galón',95000,'curated'),
('colombia','material','MAT-038','Malla de fibra de vidrio para impermeabilización (m²)','m²',12500,'curated'),
-- MANO DE OBRA
('colombia','labor','LAB-001','Oficial de obra civil','día',95000,'curated'),
('colombia','labor','LAB-002','Ayudante de obra civil','día',65000,'curated'),
('colombia','labor','LAB-003','Maestro de obra / Capataz','día',135000,'curated'),
('colombia','labor','LAB-004','Pintor profesional','día',85000,'curated'),
('colombia','labor','LAB-005','Albañil / constructor de muros','día',90000,'curated'),
('colombia','labor','LAB-006','Ferrajista (armado de acero de refuerzo)','día',105000,'curated'),
('colombia','labor','LAB-007','Carpintero de obra','día',110000,'curated'),
('colombia','labor','LAB-008','Electricista profesional','día',115000,'curated'),
('colombia','labor','LAB-009','Fontanero / Plomero','día',110000,'curated'),
('colombia','labor','LAB-010','Soldador estructural','día',135000,'curated'),
('colombia','labor','LAB-011','Topógrafo','día',160000,'curated'),
('colombia','labor','LAB-012','Operador de maquinaria pesada','día',180000,'curated'),
-- EQUIPOS / HERRAMIENTAS
('colombia','equipment','EQ-001','Mezcladora de concreto (andando)','hora',28000,'curated'),
('colombia','equipment','EQ-002','Andamio tubular (m² mes)','m²-mes',15000,'curated'),
('colombia','equipment','EQ-003','Retroexcavadora con operador','hora',185000,'curated'),
('colombia','equipment','EQ-004','Vibrador de concreto','hora',22000,'curated'),
('colombia','equipment','EQ-005','Grúa de construcción (hora)','hora',350000,'curated'),
('colombia','equipment','EQ-006','Compactor de placa / canguro','hora',35000,'curated'),
('colombia','equipment','EQ-007','Hidrolavadora industrial','hora',45000,'curated')
on conflict do nothing;
