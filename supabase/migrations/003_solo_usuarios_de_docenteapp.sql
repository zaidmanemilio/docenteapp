-- ✅ APLICADA EN PRODUCCIÓN el 2026-10-21.
-- Se conserva como referencia del cambio. NO hace falta volver a correrla.
--
-- EL PROBLEMA
-- Este proyecto de Supabase lo comparten seis aplicaciones (docenteapp,
-- coach-mun, proyectotisi, cdo-pps, termometro-mdm, muro-ideas) y, por lo
-- tanto, comparten un único auth.users.
--
-- handle_new_user() se disparaba en TODA alta de auth.users sin preguntar de
-- qué app venía, y creaba un perfil de DocenteApp con global_role 'teacher'
-- y, a falta de nombre, el email como full_name.
--
-- Estado al momento de aplicar esta migración:
--   · 53 perfiles, de los cuales 46 sin permiso en ningún curso.
--   · 34 con un email en el campo full_name.
--   · Solo 10 habían sido creados por DocenteApp (6 al 14 de junio). Los
--     otros 43 se crearon del 1 de agosto en adelante, el último el mismo día
--     de esta migración. 12 de ellos están además en mun_profiles.
--
-- LA SEÑAL QUE LOS DISTINGUE
-- Las altas que hace DocenteApp (la Edge Function users-create) siempre
-- escriben 'global_role' en raw_user_meta_data. Las de las otras apps nunca
-- lo hacen. La marca ya existía; esta migración simplemente la usa.
--
-- Como en esta app el alta es por invitación de un administrador y no por
-- registro público, no existe el caso de un usuario legítimo que deba
-- aparecer solo. Por eso la condición es segura.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.raw_user_meta_data ? 'global_role' then
    insert into public.profiles (id, full_name, global_role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.raw_user_meta_data->>'global_role'
    );
  end if;
  return new;
end;
$function$;

-- ── Limpieza de lo ya acumulado ──────────────────────────────────────────
-- Primero el trigger, después la limpieza: al revés se vuelve a llenar.
--
-- No se borra ninguna cuenta de auth.users. Esas personas siguen usando su
-- aplicación sin enterarse; lo único que se elimina es la fila de
-- public.profiles que las mostraba como docentes de DocenteApp.
--
-- Quedan EXCLUIDOS del borrado:
--   · los que tienen la marca (altas de DocenteApp);
--   · los que tienen permiso en algún curso. Esto rescató a
--     anibal@docenteapp.com, un usuario real dado de alta por otra vía, que
--     no tiene la marca pero sí un curso asignado;
--   · los que crearon alguna tarea (todos.created_by es NO ACTION y el
--     borrado fallaría).

create table public.profiles_respaldo_20261021 as
select p.*
from public.profiles p
join auth.users u on u.id = p.id
where not (u.raw_user_meta_data ? 'global_role')
  and not exists (select 1 from public.user_course_permissions x where x.user_id = p.id)
  and not exists (select 1 from public.todos t where t.created_by = p.id);

alter table public.profiles_respaldo_20261021 enable row level security;

delete from public.profiles p
using public.profiles_respaldo_20261021 r
where p.id = r.id;

-- Para deshacer:
--   insert into public.profiles select * from public.profiles_respaldo_20261021;

-- ── Verificación posterior (contra la base real) ─────────────────────────
--   · Perfiles: 53 → 11. Los 11 son personas con nombre propio; ya no queda
--     ninguno con un email en full_name (eran 34).
--   · Sin curso asignado: 46 → 4, y los 4 son docentes reales a la espera de
--     que se les asigne uno.
--   · auth.users sigue en 53, user_course_permissions en 19 y todos en 1:
--     no se perdió ni un acceso ni un dato.
--   · Ensayo del trigger dentro de una transacción revertida: un alta SIN
--     marca crea 0 perfiles; una CON marca crea 1 y respeta el rol que venga
--     ('guest' quedó 'guest', no forzado a 'teacher' como antes).
