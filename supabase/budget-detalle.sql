-- ObraHub — presupuesto: persistir desglose completo por ítem
-- Pegar en: Supabase Dashboard → SQL Editor → Run
alter table public.budget_items add column if not exists detalle jsonb;
