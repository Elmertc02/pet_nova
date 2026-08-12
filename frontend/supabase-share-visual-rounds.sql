-- PETnova - compartir rondas visuales entre usuarios autenticados.
-- Ejecutar en Supabase > SQL Editor si Leonel no ve rondas hechas por Rafael, o viceversa.

drop policy if exists "visual sessions select own" on public.visual_control_sessions;
drop policy if exists "visual sessions select authenticated" on public.visual_control_sessions;

create policy "visual sessions select authenticated"
on public.visual_control_sessions for select
to authenticated
using (true);

drop policy if exists "visual reviews select own" on public.visual_control_reviews;
drop policy if exists "visual reviews select authenticated" on public.visual_control_reviews;

create policy "visual reviews select authenticated"
on public.visual_control_reviews for select
to authenticated
using (true);

drop policy if exists "defect photos select own folder" on storage.objects;
drop policy if exists "defect photos select authenticated" on storage.objects;

create policy "defect photos select authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'defect-photos');
