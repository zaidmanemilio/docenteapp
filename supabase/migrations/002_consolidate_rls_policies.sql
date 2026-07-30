-- 002_consolidate_rls_policies.sql
--
-- QUÉ RESUELVE
-- Convivían dos generaciones de políticas RLS sobre las mismas tablas: las
-- viejas, con nombre en español ("Ver cursos asignados", "Admin gestiona
-- cursos", ...), y las nuevas, basadas en funciones (can_see_course(),
-- can_edit_course(), is_admin(), ...). Como todas son PERMISSIVE, Postgres
-- evaluaba las dos generaciones y las combinaba con OR en cada consulta:
-- 125 avisos de multiple_permissive_policies en el linter.
--
-- Esta migración da de baja la generación vieja y deja la nueva, que además
-- contempla el rol 'guest' (lectura global) que la vieja no conocía.
--
-- ⚠️ CUIDADO IMPORTANTE QUE ESTA MIGRACIÓN CONTEMPLA
-- La política vieja "Admin elimina sesiones" permitía borrar encuentros SOLO
-- con permiso 'full'. La nueva sessions_write era FOR ALL, que incluye DELETE
-- y alcanza también a 'edit'. Eliminar la vieja sin más le habría dado
-- permiso de borrado a los usuarios con 'edit', contradiciendo lo que la
-- propia pantalla de configuración les promete:
--   "full permite eliminar encuentros, edit permite editar, read es solo
--    lectura"
-- Por eso sessions_write se parte en insert / update / delete, y el delete
-- conserva la regla "solo full (o admin)" vía has_full_course_access().
--
-- OTROS CAMBIOS
-- - Las políticas pasan de TO public a TO authenticated. public incluye anon,
--   un rol que nunca puede pasar ninguna de estas políticas (auth.uid() es
--   null), así que se evaluaban al pedo.
-- - auth.uid() se envuelve en (select auth.uid()) para que se evalúe una vez
--   por consulta y no una vez por fila (aviso auth_rls_initplan).
--
-- CÓMO APLICARLA
-- Supabase → SQL Editor → pegar este archivo y ejecutar. Corre entera en una
-- transacción: si algo falla, no queda a medias.

begin;

-- 1) Helper para la regla de borrado de encuentros. SECURITY DEFINER como el
--    resto de los helpers, para no recursar sobre la RLS de
--    user_course_permissions al consultarla desde una política.
create or replace function public.has_full_course_access(c_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.is_admin() or exists (
    select 1 from public.user_course_permissions p
    where p.user_id = (select auth.uid())
      and p.course_id = c_id
      and p.permission = 'full'
  )
$$;

-- 2) Baja de la generación vieja (duplicada)
drop policy if exists "Admin gestiona materias"                  on public.subjects;
drop policy if exists "Todos leen materias"                      on public.subjects;
drop policy if exists "Admin gestiona cursos"                    on public.courses;
drop policy if exists "Ver cursos asignados"                     on public.courses;
drop policy if exists "Admin gestiona comisiones"                on public.commissions;
drop policy if exists "Ver comisiones de cursos asignados"       on public.commissions;
drop policy if exists "Admin elimina sesiones"                   on public.sessions;
drop policy if exists "Insertar sesiones con permiso edit o full" on public.sessions;
drop policy if exists "Ver sesiones de cursos asignados"         on public.sessions;
drop policy if exists "Editar sesiones con permiso edit o full"  on public.sessions;
drop policy if exists "Gestionar todos con permiso edit o full"  on public.todos;
drop policy if exists "Ver todos de cursos asignados"            on public.todos;
drop policy if exists "Admin gestiona permisos"                  on public.user_course_permissions;
drop policy if exists "Usuario ve sus permisos"                  on public.user_course_permissions;
drop policy if exists "Leer perfiles"                            on public.profiles;

-- 3) Set canónico, recreado con TO authenticated y (select auth.uid())

-- profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_global_read());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) or public.is_admin());
-- el with_check impide que alguien se cambie su propio global_role
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (
    public.is_admin()
    or (id = (select auth.uid()) and global_role = public.role_of((select auth.uid())))
  );
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- subjects
drop policy if exists subjects_select on public.subjects;
drop policy if exists subjects_write  on public.subjects;
create policy subjects_select on public.subjects for select to authenticated
  using (true);
create policy subjects_write on public.subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- courses
drop policy if exists courses_select on public.courses;
drop policy if exists courses_insert on public.courses;
drop policy if exists courses_update on public.courses;
drop policy if exists courses_delete on public.courses;
create policy courses_select on public.courses for select to authenticated
  using (public.can_see_course(id));
create policy courses_insert on public.courses for insert to authenticated
  with check (public.is_admin());
create policy courses_update on public.courses for update to authenticated
  using (public.can_edit_course(id)) with check (public.can_edit_course(id));
create policy courses_delete on public.courses for delete to authenticated
  using (public.is_admin());

-- commissions
drop policy if exists commissions_select on public.commissions;
drop policy if exists commissions_write  on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
  using (public.can_see_course(course_id));
create policy commissions_write on public.commissions for all to authenticated
  using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

-- sessions: el write se parte para conservar "solo full elimina encuentros"
drop policy if exists sessions_select on public.sessions;
drop policy if exists sessions_write  on public.sessions;
drop policy if exists sessions_insert on public.sessions;
drop policy if exists sessions_update on public.sessions;
drop policy if exists sessions_delete on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (public.can_see_course(course_id));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (public.can_edit_course(course_id));
create policy sessions_update on public.sessions for update to authenticated
  using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.has_full_course_access(course_id));

-- todos
drop policy if exists todos_select on public.todos;
drop policy if exists todos_write  on public.todos;
create policy todos_select on public.todos for select to authenticated
  using (public.can_see_course(course_id));
create policy todos_write on public.todos for all to authenticated
  using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

-- user_course_permissions
drop policy if exists ucp_select on public.user_course_permissions;
drop policy if exists ucp_write  on public.user_course_permissions;
create policy ucp_select on public.user_course_permissions for select to authenticated
  using (user_id = (select auth.uid()) or public.has_global_read());
create policy ucp_write on public.user_course_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

commit;


-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POSTERIOR (opcional, solo lectura)
-- Corré esto DESPUÉS de aplicar y comparalo con la línea base de abajo:
-- cada usuario tiene que seguir viendo exactamente la misma cantidad de filas.
--
-- do $$
-- declare u record; a bigint; b bigint; c bigint; d bigint;
-- begin
--   for u in select id, global_role from public.profiles order by id loop
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
--     execute 'set local role authenticated';
--     select count(*) into a from public.courses;
--     select count(*) into b from public.sessions;
--     select count(*) into c from public.commissions;
--     select count(*) into d from public.profiles;
--     execute 'reset role';
--     raise notice '% (%): courses=% sessions=% commissions=% profiles=%',
--       u.id, u.global_role, a, b, c, d;
--   end loop;
-- end $$;
--
-- LÍNEA BASE medida antes de esta migración (tiene que dar igual después):
--   admin            → courses 8, sessions 46, commissions 10, todos 1, profiles 10, ucp 16, subjects 3
--   guest   (x2)     → courses 8, sessions 46, commissions 10, todos 1, profiles 10, ucp 16, subjects 3
--   teacher (x7, por uid asc):
--     courses     2,0,2,0,1,2,0
--     sessions    12,0,0,0,9,12,0
--     commissions 3,0,4,0,1,3,0
--     todos       0,0,1,0,0,1,0
--     profiles    1,1,1,1,1,1,1
--     ucp         2,0,2,0,1,2,0
--     subjects    3,3,3,3,3,3,3
-- ─────────────────────────────────────────────────────────────────────────
