-- PETnova - aprobacion, correcciones e historial de registros de calidad.
-- Ejecutar completo en Supabase > SQL Editor antes de usar el nuevo flujo.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'lectura'
    check (role in ('admin', 'calidad', 'lectura')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists display_name text not null default '',
  add column if not exists role text not null default 'lectura',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

insert into public.user_profiles (user_id, display_name, role)
select
  users.id,
  coalesce(
    nullif(users.raw_user_meta_data->>'display_name', ''),
    nullif(users.raw_user_meta_data->>'name', ''),
    split_part(users.email, '@', 1),
    'Usuario'
  ),
  case
    when lower(coalesce(users.email, '')) like '%leonel%' then 'admin'
    when lower(coalesce(users.email, '')) like '%rafael%' then 'calidad'
    else 'lectura'
  end
from auth.users users
on conflict (user_id) do nothing;

alter table public.new_quality_records
  add column if not exists status text not null default 'pending',
  add column if not exists version integer not null default 1,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submitted_by_name text not null default '',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_name text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text not null default '';

create table if not exists public.new_quality_record_history (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.new_quality_records(id) on delete cascade,
  record_type text not null check (record_type in ('inspection', 'tests')),
  version integer not null,
  event_type text not null check (event_type in (
    'submitted', 'updated', 'approved', 'correction_requested', 'rejected', 'migrated'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  reason text not null default '',
  changed_fields jsonb not null default '[]'::jsonb,
  previous_snapshot jsonb,
  new_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'new_quality_records_status_check'
      and conrelid = 'public.new_quality_records'::regclass
  ) then
    alter table public.new_quality_records
      add constraint new_quality_records_status_check
      check (status in (
        'pending', 'approved', 'correction_requested', 'rejected', 'approved_migrated'
      ));
  end if;
end $$;

update public.new_quality_records
set status = 'approved_migrated',
    version = greatest(coalesce(version, 1), 1)
where not exists (
  select 1
  from public.new_quality_record_history history
  where history.record_id = new_quality_records.id
);

insert into public.new_quality_record_history (
  record_id,
  record_type,
  version,
  event_type,
  actor_id,
  actor_name,
  actor_role,
  reason,
  changed_fields,
  previous_snapshot,
  new_snapshot,
  created_at
)
select
  record.id,
  record.record_type,
  record.version,
  'migrated',
  record.user_id,
  record.created_by,
  '',
  'Registro existente migrado',
  '[]'::jsonb,
  null,
  record.payload,
  coalesce(record.updated_at, record.created_at, now())
from public.new_quality_records record
where not exists (
  select 1
  from public.new_quality_record_history history
  where history.record_id = record.id
);

alter table public.new_quality_records enable row level security;
alter table public.new_quality_record_history enable row level security;

drop policy if exists "new quality history select authenticated"
on public.new_quality_record_history;

create policy "new quality history select authenticated"
on public.new_quality_record_history for select
to authenticated
using (true);

revoke insert, update, delete on public.new_quality_records from authenticated;
revoke insert, update, delete on public.new_quality_record_history from authenticated;
grant select on public.new_quality_records to authenticated;
grant select on public.new_quality_record_history to authenticated;

alter table public.user_profiles
  alter column role set default 'lectura';

update public.user_profiles profile
set role = case
      when lower(coalesce(users.email, '')) like '%leonel%' then 'admin'
      when lower(coalesce(users.email, '')) like '%rafael%' then 'calidad'
      when lower(coalesce(users.email, '')) like '%guest%' then 'lectura'
      else profile.role
    end,
    updated_at = now()
from auth.users users
where users.id = profile.user_id;

drop policy if exists "user profiles insert authenticated" on public.user_profiles;
drop policy if exists "user profiles update authenticated" on public.user_profiles;
revoke insert, update, delete on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;

create or replace function public.get_current_quality_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where user_id = auth.uid()),
    'lectura'
  );
$$;

create or replace function public.can_review_new_quality_record()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_current_quality_role() in ('admin', 'calidad');
$$;

-- Mantiene los formatos y sus especificaciones bajo los mismos roles de revision.
alter table public.formats enable row level security;
alter table public.production_formats enable row level security;
alter table public.bottle_formats enable row level security;

drop policy if exists "formats insert authenticated" on public.formats;
drop policy if exists "formats update authenticated" on public.formats;
drop policy if exists "formats delete authenticated" on public.formats;

create policy "formats insert authenticated"
on public.formats for insert
to authenticated
with check (public.can_review_new_quality_record());

create policy "formats update authenticated"
on public.formats for update
to authenticated
using (public.can_review_new_quality_record())
with check (public.can_review_new_quality_record());

create policy "formats delete authenticated"
on public.formats for delete
to authenticated
using (public.can_review_new_quality_record());

drop policy if exists "production formats insert authenticated" on public.production_formats;
drop policy if exists "production formats update authenticated" on public.production_formats;
drop policy if exists "production formats delete authenticated" on public.production_formats;

create policy "production formats insert authenticated"
on public.production_formats for insert
to authenticated
with check (public.can_review_new_quality_record());

create policy "production formats update authenticated"
on public.production_formats for update
to authenticated
using (public.can_review_new_quality_record())
with check (public.can_review_new_quality_record());

create policy "production formats delete authenticated"
on public.production_formats for delete
to authenticated
using (public.can_review_new_quality_record());

drop policy if exists "bottle formats insert authenticated" on public.bottle_formats;
drop policy if exists "bottle formats update authenticated" on public.bottle_formats;
drop policy if exists "bottle formats delete authenticated" on public.bottle_formats;

create policy "bottle formats insert authenticated"
on public.bottle_formats for insert
to authenticated
with check (public.can_review_new_quality_record());

create policy "bottle formats update authenticated"
on public.bottle_formats for update
to authenticated
using (public.can_review_new_quality_record())
with check (public.can_review_new_quality_record());

create policy "bottle formats delete authenticated"
on public.bottle_formats for delete
to authenticated
using (public.can_review_new_quality_record());

create or replace function public.submit_new_quality_record(
  p_record_id uuid,
  p_record_type text,
  p_payload jsonb,
  p_expected_version integer,
  p_created_by text,
  p_reason text default '',
  p_changed_fields jsonb default '[]'::jsonb
)
returns public.new_quality_records
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_record public.new_quality_records%rowtype;
  saved_record public.new_quality_records%rowtype;
  actor_name text;
  actor_role text;
  event_name text;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_record_type not in ('inspection', 'tests') then
    raise exception 'Tipo de registro invalido';
  end if;

  select
    coalesce(
      nullif(profile.display_name, ''),
      users.raw_user_meta_data->>'display_name',
      users.raw_user_meta_data->>'name',
      split_part(users.email, '@', 1),
      'Usuario'
    ),
    coalesce(profile.role, 'lectura')
  into actor_name, actor_role
  from auth.users users
  left join public.user_profiles profile on profile.user_id = users.id
  where users.id = auth.uid();

  select *
  into previous_record
  from public.new_quality_records
  where id = p_record_id
  for update;

  if found then
    if previous_record.record_type <> p_record_type then
      raise exception 'El tipo de registro no coincide';
    end if;

    if previous_record.user_id <> auth.uid()
       and not public.can_review_new_quality_record() then
      raise exception 'No tiene permiso para modificar este registro';
    end if;

    if previous_record.version <> p_expected_version then
      raise exception 'El registro fue actualizado por otro usuario';
    end if;

    update public.new_quality_records
    set payload = p_payload,
        status = 'pending',
        version = previous_record.version + 1,
        submitted_by = auth.uid(),
        submitted_by_name = actor_name,
        submitted_at = now(),
        reviewed_by = null,
        reviewed_by_name = '',
        reviewed_at = null,
        review_comment = '',
        updated_at = now()
    where id = p_record_id
    returning * into saved_record;

    event_name := 'updated';
  else
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'Version inicial invalida';
    end if;

    insert into public.new_quality_records (
      id,
      record_type,
      user_id,
      created_by,
      payload,
      status,
      version,
      submitted_by,
      submitted_by_name,
      submitted_at,
      created_at,
      updated_at
    )
    values (
      p_record_id,
      p_record_type,
      auth.uid(),
      actor_name,
      p_payload,
      'pending',
      1,
      auth.uid(),
      actor_name,
      now(),
      now(),
      now()
    )
    returning * into saved_record;

    event_name := 'submitted';
  end if;

  insert into public.new_quality_record_history (
    record_id,
    record_type,
    version,
    event_type,
    actor_id,
    actor_name,
    actor_role,
    reason,
    changed_fields,
    previous_snapshot,
    new_snapshot
  )
  values (
    saved_record.id,
    saved_record.record_type,
    saved_record.version,
    event_name,
    auth.uid(),
    actor_name,
    coalesce(actor_role, 'lectura'),
    p_reason,
    '[]'::jsonb,
    case when previous_record.id is null then null else previous_record.payload end,
    saved_record.payload
  );

  return saved_record;
end;
$$;

create or replace function public.review_new_quality_record(
  p_record_id uuid,
  p_action text,
  p_comment text,
  p_expected_version integer
)
returns public.new_quality_records
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_record public.new_quality_records%rowtype;
  saved_record public.new_quality_records%rowtype;
  actor_name text;
  actor_role text;
begin
  if not public.can_review_new_quality_record() then
    raise exception 'No tiene permiso para revisar registros';
  end if;

  if p_action not in ('approved', 'correction_requested', 'rejected') then
    raise exception 'Accion de revision invalida';
  end if;

  if p_action in ('correction_requested', 'rejected')
     and trim(coalesce(p_comment, '')) = '' then
    raise exception 'Debe ingresar un comentario';
  end if;

  select display_name, role
  into actor_name, actor_role
  from public.user_profiles
  where user_id = auth.uid();

  select *
  into previous_record
  from public.new_quality_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'Registro no encontrado';
  end if;

  if previous_record.version <> p_expected_version then
    raise exception 'El registro fue actualizado por otro usuario';
  end if;

  if previous_record.status <> 'pending' then
    raise exception 'Solo se pueden revisar registros pendientes';
  end if;

  update public.new_quality_records
  set status = p_action,
      version = previous_record.version + 1,
      reviewed_by = auth.uid(),
      reviewed_by_name = coalesce(actor_name, ''),
      reviewed_at = now(),
      review_comment = coalesce(p_comment, ''),
      updated_at = now()
  where id = p_record_id
  returning * into saved_record;

  insert into public.new_quality_record_history (
    record_id,
    record_type,
    version,
    event_type,
    actor_id,
    actor_name,
    actor_role,
    reason,
    changed_fields,
    previous_snapshot,
    new_snapshot
  )
  values (
    saved_record.id,
    saved_record.record_type,
    saved_record.version,
    p_action,
    auth.uid(),
    coalesce(actor_name, ''),
    coalesce(actor_role, ''),
    coalesce(p_comment, ''),
    '[]'::jsonb,
    previous_record.payload,
    saved_record.payload
  );

  return saved_record;
end;
$$;

create or replace function public.get_quality_certificate_source(
  p_inspection_id uuid,
  p_tests_id uuid,
  p_expected_inspection_version integer,
  p_expected_tests_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inspection_record public.new_quality_records%rowtype;
  tests_record public.new_quality_records%rowtype;
  technical_format jsonb;
begin
  if not public.can_review_new_quality_record() then
    raise exception 'No tiene permiso para generar certificados';
  end if;

  select *
  into inspection_record
  from public.new_quality_records
  where id = p_inspection_id;

  select *
  into tests_record
  from public.new_quality_records
  where id = p_tests_id;

  if inspection_record.id is null or tests_record.id is null then
    raise exception 'No se encontraron ambos registros vinculados';
  end if;

  if inspection_record.record_type <> 'inspection'
     or tests_record.record_type <> 'tests' then
    raise exception 'Los tipos de registro no son validos para el certificado';
  end if;

  if inspection_record.version <> p_expected_inspection_version
     or tests_record.version <> p_expected_tests_version then
    raise exception 'Los registros fueron actualizados; vuelva a cargar la base de datos';
  end if;

  if inspection_record.status not in ('approved', 'approved_migrated')
     or tests_record.status not in ('approved', 'approved_migrated') then
    raise exception 'Ambos registros deben estar aprobados';
  end if;

  if coalesce(inspection_record.payload->>'productionDate', '')
       <> coalesce(tests_record.payload->>'productionDate', '')
     or coalesce(inspection_record.payload->>'machine', '')
       <> coalesce(tests_record.payload->>'machine', '')
     or regexp_replace(
          upper(coalesce(inspection_record.payload->>'saiCode', '')),
          '[^A-Z0-9]',
          '',
          'g'
        )
       <> regexp_replace(
          upper(coalesce(tests_record.payload->>'saiCode', '')),
          '[^A-Z0-9]',
          '',
          'g'
        ) then
    raise exception 'Los registros no corresponden a la misma produccion';
  end if;

  select to_jsonb(format_row)
  into technical_format
  from public.formats format_row
  where regexp_replace(upper(format_row.sai_code), '[^A-Z0-9]', '', 'g')
    = regexp_replace(
        upper(coalesce(inspection_record.payload->>'saiCode', '')),
        '[^A-Z0-9]',
        '',
        'g'
      )
  limit 1;

  if technical_format is null then
    raise exception 'El formato no tiene especificacion tecnica centralizada';
  end if;

  return jsonb_build_object(
    'inspection', to_jsonb(inspection_record),
    'tests', to_jsonb(tests_record),
    'technical_format', technical_format
  );
end;
$$;

revoke all on function public.can_review_new_quality_record() from public;
revoke all on function public.get_current_quality_role() from public;
revoke all on function public.submit_new_quality_record(
  uuid, text, jsonb, integer, text, text, jsonb
) from public;
revoke all on function public.review_new_quality_record(
  uuid, text, text, integer
) from public;
revoke all on function public.get_quality_certificate_source(
  uuid, uuid, integer, integer
) from public;

grant execute on function public.can_review_new_quality_record() to authenticated;
grant execute on function public.get_current_quality_role() to authenticated;
grant execute on function public.submit_new_quality_record(
  uuid, text, jsonb, integer, text, text, jsonb
) to authenticated;
grant execute on function public.review_new_quality_record(
  uuid, text, text, integer
) to authenticated;
grant execute on function public.get_quality_certificate_source(
  uuid, uuid, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
