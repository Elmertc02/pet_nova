-- PETnova - estructura inicial para controles visuales
-- Ejecutar en Supabase > SQL Editor.

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
  production_format_id text,
  molds text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bottle_formats enable row level security;

drop policy if exists "bottle formats select authenticated" on public.bottle_formats;
drop policy if exists "bottle formats insert authenticated" on public.bottle_formats;
drop policy if exists "bottle formats update authenticated" on public.bottle_formats;

create policy "bottle formats select authenticated"
on public.bottle_formats for select
to authenticated
using (true);

create policy "bottle formats update authenticated"
on public.bottle_formats for update
to authenticated
using (true)
with check (true);

create policy "bottle formats insert authenticated"
on public.bottle_formats for insert
to authenticated
with check (true);

create table if not exists public.production_formats (
  id text primary key,
  label text not null unique,
  image_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'bottle_formats'
      and constraint_name = 'bottle_formats_production_format_id_fkey'
  ) then
    alter table public.bottle_formats
    add constraint bottle_formats_production_format_id_fkey
    foreign key (production_format_id)
    references public.production_formats(id)
    on delete set null;
  end if;
end $$;

alter table public.production_formats
add column if not exists image_path text not null default '';

alter table public.production_formats enable row level security;

drop policy if exists "production formats select authenticated" on public.production_formats;
drop policy if exists "production formats insert authenticated" on public.production_formats;
drop policy if exists "production formats update authenticated" on public.production_formats;

create policy "production formats select authenticated"
on public.production_formats for select
to authenticated
using (true);

create policy "production formats insert authenticated"
on public.production_formats for insert
to authenticated
with check (true);

create policy "production formats update authenticated"
on public.production_formats for update
to authenticated
using (true)
with check (true);

create table if not exists public.active_user_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  username text not null default '',
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.active_user_sessions enable row level security;

drop policy if exists "active sessions select own" on public.active_user_sessions;
drop policy if exists "active sessions insert own" on public.active_user_sessions;
drop policy if exists "active sessions update own" on public.active_user_sessions;
drop policy if exists "active sessions delete own" on public.active_user_sessions;

create policy "active sessions select own"
on public.active_user_sessions for select
to authenticated
using (auth.uid() = user_id);

create policy "active sessions insert own"
on public.active_user_sessions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "active sessions update own"
on public.active_user_sessions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "active sessions delete own"
on public.active_user_sessions for delete
to authenticated
using (auth.uid() = user_id);

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

alter table public.visual_control_reports enable row level security;

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

create table if not exists public.visual_control_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  responsible text not null default '',
  machine text not null,
  product_format text not null default '',
  operator_name text not null default '',
  cycle_number integer not null default 1,
  session_status text not null default 'Controlado',
  skip_reason text not null default '',
  control_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visual_control_sessions
add column if not exists product_format text not null default '',
add column if not exists operator_name text not null default '',
add column if not exists cycle_number integer not null default 1,
add column if not exists session_status text not null default 'Controlado',
add column if not exists skip_reason text not null default '';

create table if not exists public.visual_control_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.visual_control_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null,
  defect_status text not null default 'Conforme',
  defect_comment text not null default '',
  defects text[] not null default '{}',
  other_defect text not null default '',
  photo_path text not null default '',
  defect_photo_paths text[] not null default '{}',
  distribution text not null default 'Pendiente',
  distribution_comment text not null default '',
  material_zones text[] not null default '{}',
  material_other_zone text not null default '',
  bag_status text not null default 'Pendiente',
  bag_comment text not null default '',
  bag_defects text[] not null default '{}',
  bag_other_defect text not null default '',
  bag_photo_path text not null default '',
  bag_photo_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visual_control_reviews
add column if not exists defect_comment text not null default '',
add column if not exists distribution_comment text not null default '',
add column if not exists bag_comment text not null default '',
add column if not exists defect_photo_paths text[] not null default '{}',
add column if not exists bag_photo_paths text[] not null default '{}';

alter table public.visual_control_sessions enable row level security;
alter table public.visual_control_reviews enable row level security;

drop policy if exists "visual sessions select own" on public.visual_control_sessions;
drop policy if exists "visual sessions select authenticated" on public.visual_control_sessions;
drop policy if exists "visual sessions insert own" on public.visual_control_sessions;
drop policy if exists "visual sessions update own" on public.visual_control_sessions;
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

create policy "visual sessions update own"
on public.visual_control_sessions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "visual sessions delete authenticated"
on public.visual_control_sessions for delete
to authenticated
using (true);

drop policy if exists "visual reviews select own" on public.visual_control_reviews;
drop policy if exists "visual reviews select authenticated" on public.visual_control_reviews;
drop policy if exists "visual reviews insert own" on public.visual_control_reviews;
drop policy if exists "visual reviews update own" on public.visual_control_reviews;
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

create policy "visual reviews update own"
on public.visual_control_reviews for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "visual reviews delete authenticated"
on public.visual_control_reviews for delete
to authenticated
using (true);

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
