-- PETnova - cerrar sesiones activas de Rafael.
-- Ejecutar en Supabase > SQL Editor.

delete from public.active_user_sessions
where lower(username) like '%rafael%'
   or user_id in (
    select id
    from auth.users
    where lower(email) = 'rafael@petnova.local'
       or lower(coalesce(raw_user_meta_data->>'display_name', '')) like '%rafael%'
       or lower(coalesce(raw_user_meta_data->>'name', '')) like '%rafael%'
  );
