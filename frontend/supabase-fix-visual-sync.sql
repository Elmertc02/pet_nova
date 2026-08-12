-- PETnova - reparacion para sincronizar rondas visuales locales con Supabase.
-- Ejecutar completo en Supabase > SQL Editor.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'lectura' check (role in ('admin', 'calidad', 'lectura')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_formats (
  id text primary key,
  label text not null unique,
  image_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.production_formats
add column if not exists image_path text not null default '';

alter table public.production_formats enable row level security;

drop policy if exists "production formats select authenticated" on public.production_formats;
drop policy if exists "production formats insert authenticated" on public.production_formats;
drop policy if exists "production formats update authenticated" on public.production_formats;
drop policy if exists "production formats delete authenticated" on public.production_formats;

create policy "production formats select authenticated"
on public.production_formats for select
to authenticated
using (true);

create policy "production formats insert authenticated"
on public.production_formats for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create policy "production formats update authenticated"
on public.production_formats for update
to authenticated
using (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
)
with check (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create policy "production formats delete authenticated"
on public.production_formats for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create table if not exists public.bottle_formats (
  id text primary key,
  sort_order integer not null default 0,
  name text not null,
  subtitle text not null default '',
  accent text not null default '#2457a6',
  height integer not null default 214,
  shoulder integer not null default 64,
  body integer not null default 82,
  image_path text not null default '',
  molds text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bottle_formats
add column if not exists specs jsonb not null default '{}'::jsonb,
add column if not exists molds text[] not null default '{}',
add column if not exists image_path text not null default '',
add column if not exists production_format_id text references public.production_formats(id) on delete set null;

update public.bottle_formats bottle
set production_format_id = production.id
from public.production_formats production
where bottle.production_format_id is null
  and lower(regexp_replace(bottle.name, '\s+', ' ', 'g')) = lower(regexp_replace(production.label, '\s+', ' ', 'g'));

alter table public.bottle_formats enable row level security;

drop policy if exists "bottle formats select authenticated" on public.bottle_formats;
drop policy if exists "bottle formats insert authenticated" on public.bottle_formats;
drop policy if exists "bottle formats update authenticated" on public.bottle_formats;
drop policy if exists "bottle formats delete authenticated" on public.bottle_formats;

create policy "bottle formats select authenticated"
on public.bottle_formats for select
to authenticated
using (true);

create policy "bottle formats insert authenticated"
on public.bottle_formats for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create policy "bottle formats update authenticated"
on public.bottle_formats for update
to authenticated
using (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
)
with check (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create policy "bottle formats delete authenticated"
on public.bottle_formats for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

alter table public.visual_control_sessions
add column if not exists product_format text not null default '',
add column if not exists operator_name text not null default '',
add column if not exists cycle_number integer not null default 1,
add column if not exists session_status text not null default 'Controlado',
add column if not exists skip_reason text not null default '';

alter table public.visual_control_reviews
add column if not exists defect_comment text not null default '',
add column if not exists distribution_comment text not null default '',
add column if not exists bag_comment text not null default '',
add column if not exists defect_photo_paths text[] not null default '{}',
add column if not exists bag_photo_paths text[] not null default '{}';

create table if not exists public.visual_control_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Reporte de controles visuales',
  report_date date not null,
  responsible text not null default '',
  generated_at timestamptz not null default now(),
  session_count integer not null default 0,
  review_count integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'lectura' check (role in ('admin', 'calidad', 'lectura')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (user_id, display_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data->>'display_name', users.raw_user_meta_data->>'name', split_part(users.email, '@', 1)),
  case
    when lower(users.email) like '%leonel%' then 'admin'
    when lower(users.email) like '%rafael%' then 'calidad'
    else 'lectura'
  end
from auth.users
on conflict (user_id) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  updated_at = now();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  username text not null default '',
  display_name text not null default '',
  role text not null default '',
  action text not null,
  area text not null,
  target text not null default '',
  detail text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.visual_control_sessions enable row level security;
alter table public.visual_control_reviews enable row level security;
alter table public.visual_control_reports enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "visual sessions select own" on public.visual_control_sessions;
drop policy if exists "visual sessions select authenticated" on public.visual_control_sessions;
drop policy if exists "visual sessions insert own" on public.visual_control_sessions;
drop policy if exists "visual sessions update own" on public.visual_control_sessions;
drop policy if exists "visual sessions update authenticated" on public.visual_control_sessions;
drop policy if exists "visual sessions delete own" on public.visual_control_sessions;
drop policy if exists "visual sessions delete authenticated" on public.visual_control_sessions;

create policy "visual sessions select authenticated"
on public.visual_control_sessions for select
to authenticated
using (true);

create policy "visual sessions insert own"
on public.visual_control_sessions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "visual sessions update authenticated"
on public.visual_control_sessions for update
to authenticated
using (true)
with check (true);

create policy "visual sessions delete authenticated"
on public.visual_control_sessions for delete
to authenticated
using (true);

drop policy if exists "visual reviews select own" on public.visual_control_reviews;
drop policy if exists "visual reviews select authenticated" on public.visual_control_reviews;
drop policy if exists "visual reviews insert own" on public.visual_control_reviews;
drop policy if exists "visual reviews update own" on public.visual_control_reviews;
drop policy if exists "visual reviews update authenticated" on public.visual_control_reviews;
drop policy if exists "visual reviews delete own" on public.visual_control_reviews;
drop policy if exists "visual reviews delete authenticated" on public.visual_control_reviews;

create policy "visual reviews select authenticated"
on public.visual_control_reviews for select
to authenticated
using (true);

create policy "visual reviews insert own"
on public.visual_control_reviews for insert
to authenticated
with check (auth.uid() = user_id);

create policy "visual reviews update authenticated"
on public.visual_control_reviews for update
to authenticated
using (true)
with check (true);

create policy "visual reviews delete authenticated"
on public.visual_control_reviews for delete
to authenticated
using (true);

drop policy if exists "visual reports select authenticated" on public.visual_control_reports;
drop policy if exists "visual reports insert own" on public.visual_control_reports;
drop policy if exists "visual reports update own" on public.visual_control_reports;
drop policy if exists "visual reports delete own" on public.visual_control_reports;

create policy "visual reports select authenticated"
on public.visual_control_reports for select
to authenticated
using (true);

create policy "visual reports insert own"
on public.visual_control_reports for insert
to authenticated
with check (auth.uid() = user_id);

create policy "visual reports update own"
on public.visual_control_reports for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "visual reports delete own"
on public.visual_control_reports for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user profiles select authenticated" on public.user_profiles;
drop policy if exists "user profiles insert authenticated" on public.user_profiles;
drop policy if exists "user profiles update authenticated" on public.user_profiles;

create policy "user profiles select authenticated"
on public.user_profiles for select
to authenticated
using (true);

revoke insert, update, delete on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;

drop policy if exists "audit logs select authenticated" on public.audit_logs;
drop policy if exists "audit logs insert authenticated" on public.audit_logs;

create policy "audit logs select authenticated"
on public.audit_logs for select
to authenticated
using (true);

create policy "audit logs insert authenticated"
on public.audit_logs for insert
to authenticated
with check (auth.uid() = user_id or user_id is null);

insert into storage.buckets (id, name, public)
values ('defect-photos', 'defect-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('bottle-format-assets', 'bottle-format-assets', false)
on conflict (id) do nothing;

drop policy if exists "defect photos select own folder" on storage.objects;
drop policy if exists "defect photos select authenticated" on storage.objects;
drop policy if exists "defect photos insert own folder" on storage.objects;
drop policy if exists "defect photos update own folder" on storage.objects;
drop policy if exists "defect photos delete own folder" on storage.objects;

create policy "defect photos select authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'defect-photos');

create policy "defect photos insert own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'defect-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "defect photos update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'defect-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'defect-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "defect photos delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'defect-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "bottle format assets select authenticated" on storage.objects;
drop policy if exists "bottle format assets insert authenticated" on storage.objects;
drop policy if exists "bottle format assets update authenticated" on storage.objects;

create policy "bottle format assets select authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'bottle-format-assets');

create policy "bottle format assets insert authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'bottle-format-assets');

create policy "bottle format assets update authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'bottle-format-assets')
with check (bucket_id = 'bottle-format-assets');

notify pgrst, 'reload schema';
