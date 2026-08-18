-- ObraHub — project_health: permisos de escritura (pegar en SQL Editor)
drop policy if exists "health_write_member" on public.project_health;
create policy "health_write_member" on public.project_health
  for insert with check (exists (select 1 from public.projects p where p.id = project_health.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_health.project_id, auth.uid()));
drop policy if exists "health_update_member" on public.project_health;
create policy "health_update_member" on public.project_health
  for update using (exists (select 1 from public.projects p where p.id = project_health.project_id and p.user_id = auth.uid())
    or public.is_project_editor(project_health.project_id, auth.uid()));
