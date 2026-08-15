-- ObraHub — perfil: foto de perfil
-- Pegar en: Supabase Dashboard → SQL Editor → Run
alter table public.profiles add column if not exists avatar_url text;
