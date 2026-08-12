-- PETnova - tabla unica de formatos.
-- Objetivo: dejar una sola fuente de verdad para formatos de botella.
-- Ejecutar completo en Supabase > SQL Editor.
-- Importante: este script NO borra production_formats ni bottle_formats.
-- Primero migra/centraliza datos en public.formats para validar antes de retirar tablas antiguas.

create table if not exists public.formats (
  id text primary key, -- codigo SAI cuando existe
  sai_code text not null unique,
  label text not null,
  volume text not null default '',
  gramaje text not null default '',
  color text not null default '',
  package_quantity text not null default '',
  client text not null default '',
  resin text not null default '',
  image_path text not null default '',
  subtitle text not null default '',
  accent text not null default '#2457a6',
  height integer not null default 214,
  shoulder integer not null default 64,
  body integer not null default 82,
  molds text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,
  legacy_production_format_id text not null default '',
  legacy_bottle_format_id text not null default '',
  needs_sai_code boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.petnova_format_key(value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(upper(coalesce(value, '')), '\b(BOTELLA|BOT)\b', ' ', 'g'), 
      '[^A-Z0-9]+',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

-- Compatibilidad con bases donde bottle_formats fue creada antes de enlazarla con production_formats.
alter table if exists public.bottle_formats
add column if not exists production_format_id text;

create temporary table petnova_sai_format_seed (
  sai_code text primary key,
  label text not null,
  volume text not null default '',
  gramaje text not null default '',
  color text not null default '',
  package_quantity text not null default '',
  client text not null default '',
  resin text not null default ''
) on commit drop;

insert into petnova_sai_format_seed (sai_code, label, volume, gramaje, color, package_quantity, client, resin)
values
  ('27113', 'BOT. CR DE 330 ML DE 17,5 GR', '330', '17.5', 'CRISTAL', '294', 'Varios', 'JADE CZ 328A'),
  ('32805', 'BOT-CR-250 CC-MISTER', '250', '17.5', 'CRISTAL', '345', 'Mister', 'JADE CZ 328A'),
  ('36309', 'BOT-CR-300 CC LEONEL', '300', '17.5', 'CRISTAL', '297', 'Leonel', 'JADE CZ 328A'),
  ('10346', 'BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL', '500', '20.6', 'CRISTAL', '340', 'Leonel', 'JADE CZ 328A'),
  ('7097-100', 'BOT-CR-1/2 LT-22 GR-MISIL', '500', '22', 'CRISTAL', '350', 'Misil', 'ECOPET'),
  ('7097-3', 'BOT-CR-1/2 LT-22 GR-MISIL', '500', '22', 'CRISTAL', '350', 'Misil', 'JADE CZ 328A'),
  ('13734', 'BOT-CR-600 CC-22 GR-ESTRIADAS', '600', '22', 'CRISTAL', '304', 'Varios', 'JADE CZ 328A'),
  ('14590', 'BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', '600', '22', 'CRISTAL', '295', 'Varios', 'JADE CZ 328A'),
  ('14590-100', 'BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', '600', '22', 'CRISTAL', '295', 'Bebidas', 'ECOPET'),
  ('14591', 'BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A', '660', '22', 'CRISTAL', '330', 'Bebidas', 'JADE CZ 328A'),
  ('15649', 'BOT-VE-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', '600', '22', 'VERDE', '295', 'Bebidas', 'JADE CZ 328A'),
  ('32573', 'BOT-CR-600 CC - 22 GR - SWIRL', '600', '22', 'CRISTAL', '330', 'Varios', 'JADE CZ 328A'),
  ('32692-100', 'BOT-CR-500 CC- MISTER', '500', '22', 'CRISTAL', '340', 'Mister', 'ECOPET'),
  ('38226', 'BOT-CR-360 CC- ACTIVA', '360', '23.1', 'CRISTAL', '213', 'Activa', 'JADE CZ 328A'),
  ('39326', 'BOT-CR-900 CC- 28 GR - GENERICO', '900', '28', 'CRISTAL', '238', 'Varios', 'JADE CZ 328A'),
  ('37568', 'BOT-CR-1000 CC-31.5 GR-LEONEL', '1000', '31.5', 'CRISTAL', '208', 'Leonel', 'JADE CZ 328A'),
  ('38339', 'BOT-CR-600 CC-31.5 GR-ACTIVA', '600', '31.5', 'CRISTAL', '364', 'Activa', 'JADE CZ 328A'),
  ('43826', 'BOT-CR-3000 CC-54.6 GR SF-LEONEL', '3000', '54.6', 'CRISTAL', '80', 'Leonel', 'JADE CZ 328A'),
  ('47269', 'BOT-CR-3000 CC-56 GR-LIMONERO', '3000', '56', 'CRISTAL', '80', 'Varios', 'JADE CZ 328A'),
  ('38481', 'BOT-CR-2000 CC 48 GR-VAJILLERO', '2000', '60', 'CRISTAL', '120', 'Varios', 'JADE CZ 328A'),
  ('13736-100', 'BOT-CR-1.5 LTS -37-GR-ONDA GENERICO', '1500', '37', 'CRISTAL', '161', 'Varios', 'ECOPET'),
  ('31306', 'BOT-CR- 5 LT-SAP;68414057-UNILEVER 93 GR', '5000', '93', 'CRISTAL', '42', 'Gr', 'JADE CZ 328A'),
  ('20244-3', 'BOT.CR 5.0 LT-93 GR GENERICO', '5000', '93', 'CRISTAL', '49', '', 'JADE CZ 328A'),
  ('46493', 'BOT-CR-200 CC-20.66 GR-GENERICO LICOR', '200', '20.66', 'CRISTAL', '5000', 'Varios', 'JADE CZ 328A'),
  ('40998-3', 'BOT-CR-3000 CC-54.6 GR SF-MASIVOS', '3000', '54.6', 'CRISTAL', '80', 'Masivos', 'JADE CZ 328A'),
  ('13737', 'BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.', '2000', '48', 'CRISTAL', '126', 'Seasa', 'JADE CZ 328A'),
  ('13737-100', 'BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.', '2000', '48', 'CRISTAL', '126', 'Seasa', 'ECOPET'),
  ('7200-3', 'BOT-CR-3000 CC-56 GR-GENERICO', '3000', '56', 'CRISTAL', '80', 'Varios', 'JADE CZ 328A'),
  ('7200-100', 'BOT-CR-3000 CC-56 GR-GENERICO', '3000', '56', 'CRISTAL', '80', 'Varios', 'ECOPET')
on conflict (sai_code) do update
set label = excluded.label,
    volume = excluded.volume,
    gramaje = excluded.gramaje,
    color = excluded.color,
    package_quantity = excluded.package_quantity,
    client = excluded.client,
    resin = excluded.resin;

insert into public.formats (
  id,
  sai_code,
  label,
  volume,
  gramaje,
  color,
  package_quantity,
  client,
  resin,
  updated_at
)
select
  seed.sai_code,
  seed.sai_code,
  seed.label,
  seed.volume,
  seed.gramaje,
  seed.color,
  seed.package_quantity,
  seed.client,
  seed.resin,
  now()
from petnova_sai_format_seed seed
on conflict (id) do update
set sai_code = excluded.sai_code,
    label = excluded.label,
    volume = excluded.volume,
    gramaje = excluded.gramaje,
    color = excluded.color,
    package_quantity = excluded.package_quantity,
    client = excluded.client,
    resin = excluded.resin,
    updated_at = now();

-- Trae imagenes/nombres de production_formats cuando coinciden con un codigo SAI.
update public.formats target
set image_path = coalesce(nullif(production.image_path, ''), target.image_path),
    legacy_production_format_id = production.id,
    updated_at = now()
from public.production_formats production
join petnova_sai_format_seed seed
  on public.petnova_format_key(production.label) = public.petnova_format_key(seed.label)
where target.id = seed.sai_code;

-- Trae especificaciones tecnicas de bottle_formats cuando coinciden por nombre o por production_format_id.
update public.formats target
set image_path = coalesce(nullif(bottle.image_path, ''), target.image_path),
    subtitle = coalesce(nullif(bottle.subtitle, ''), target.subtitle),
    accent = coalesce(nullif(bottle.accent, ''), target.accent),
    height = coalesce(bottle.height, target.height),
    shoulder = coalesce(bottle.shoulder, target.shoulder),
    body = coalesce(bottle.body, target.body),
    molds = case when coalesce(array_length(bottle.molds, 1), 0) > 0 then bottle.molds else target.molds end,
    specs = case when bottle.specs <> '{}'::jsonb then bottle.specs else target.specs end,
    legacy_bottle_format_id = bottle.id,
    updated_at = now()
from public.bottle_formats bottle
left join public.production_formats production
  on production.id = bottle.production_format_id
join petnova_sai_format_seed seed
  on public.petnova_format_key(coalesce(production.label, bottle.name)) = public.petnova_format_key(seed.label)
where target.id = seed.sai_code;

-- Conserva formatos antiguos que aun no tienen codigo SAI identificado.
insert into public.formats (
  id,
  sai_code,
  label,
  image_path,
  legacy_production_format_id,
  needs_sai_code,
  updated_at
)
select
  'SIN-SAI-' || production.id,
  'SIN-SAI-' || production.id,
  production.label,
  production.image_path,
  production.id,
  true,
  now()
from public.production_formats production
where not exists (
  select 1
  from petnova_sai_format_seed seed
  where public.petnova_format_key(seed.label) = public.petnova_format_key(production.label)
)
on conflict (id) do update
set label = excluded.label,
    image_path = coalesce(nullif(excluded.image_path, ''), public.formats.image_path),
    legacy_production_format_id = excluded.legacy_production_format_id,
    needs_sai_code = true,
    updated_at = now();

insert into public.formats (
  id,
  sai_code,
  label,
  image_path,
  subtitle,
  accent,
  height,
  shoulder,
  body,
  molds,
  specs,
  legacy_bottle_format_id,
  needs_sai_code,
  updated_at
)
select
  'SIN-SAI-' || bottle.id,
  'SIN-SAI-' || bottle.id,
  bottle.name,
  bottle.image_path,
  bottle.subtitle,
  bottle.accent,
  bottle.height,
  bottle.shoulder,
  bottle.body,
  bottle.molds,
  bottle.specs,
  bottle.id,
  true,
  now()
from public.bottle_formats bottle
where not exists (
  select 1
  from petnova_sai_format_seed seed
  where public.petnova_format_key(seed.label) = public.petnova_format_key(bottle.name)
)
on conflict (id) do update
set label = excluded.label,
    image_path = coalesce(nullif(excluded.image_path, ''), public.formats.image_path),
    subtitle = excluded.subtitle,
    accent = excluded.accent,
    height = excluded.height,
    shoulder = excluded.shoulder,
    body = excluded.body,
    molds = excluded.molds,
    specs = excluded.specs,
    legacy_bottle_format_id = excluded.legacy_bottle_format_id,
    needs_sai_code = true,
    updated_at = now();

alter table public.formats enable row level security;

drop policy if exists "formats select authenticated" on public.formats;
drop policy if exists "formats insert authenticated" on public.formats;
drop policy if exists "formats update authenticated" on public.formats;
drop policy if exists "formats delete authenticated" on public.formats;

create policy "formats select authenticated"
on public.formats for select
to authenticated
using (true);

create policy "formats insert authenticated"
on public.formats for insert
to authenticated
with check (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

create policy "formats update authenticated"
on public.formats for update
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

create policy "formats delete authenticated"
on public.formats for delete
to authenticated
using (
  exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'calidad')
  )
);

grant select, insert, update, delete on public.formats to authenticated;

create or replace view public.formats_pending_sai_code as
select id, label, legacy_production_format_id, legacy_bottle_format_id, image_path, specs, updated_at
from public.formats
where needs_sai_code = true
order by label;

notify pgrst, 'reload schema';
