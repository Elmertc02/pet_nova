-- PETnova - registros compartidos de Nuevo registro y Pruebas.
-- Ejecutar completo en Supabase > SQL Editor.
-- Luego ejecutar supabase-quality-record-approval.sql para habilitar envios por RPC.

create table if not exists public.new_quality_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('inspection', 'tests')),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.new_quality_records enable row level security;

grant usage on schema public to authenticated;
revoke insert, update, delete on public.new_quality_records from authenticated;
grant select on public.new_quality_records to authenticated;

drop policy if exists "new quality records select authenticated" on public.new_quality_records;
drop policy if exists "new quality records insert own" on public.new_quality_records;
drop policy if exists "new quality records update authenticated" on public.new_quality_records;
drop policy if exists "new quality records delete authenticated" on public.new_quality_records;

create policy "new quality records select authenticated"
on public.new_quality_records for select
to authenticated
using (true);

notify pgrst, 'reload schema';
