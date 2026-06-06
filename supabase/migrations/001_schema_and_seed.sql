-- =============================================================
-- DocenteApp — Migración completa
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =============================================================

-- ─────────────────────────────────────────
-- 1. EXTENSIONES
-- ─────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- 2. TABLA PROFILES (extiende auth.users)
-- ─────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  global_role text not null default 'teacher'
                   check (global_role in ('admin', 'teacher', 'guest')),
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

-- Cada usuario ve su propio perfil; admin ve todos
create policy "Perfil propio" on public.profiles
  for select using (auth.uid() = id);

create policy "Admin ve todos los perfiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.global_role = 'admin'
    )
  );

create policy "Admin actualiza perfiles" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.global_role = 'admin'
    )
  );

-- Auto-crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, global_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'global_role', 'teacher')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- 3. MATERIAS (subjects)
-- ─────────────────────────────────────────
create table if not exists public.subjects (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

alter table public.subjects enable row level security;

create policy "Todos leen materias" on public.subjects
  for select using (true);

create policy "Admin gestiona materias" on public.subjects
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and global_role = 'admin')
  );

-- ─────────────────────────────────────────
-- 4. CURSOS (courses)
-- ─────────────────────────────────────────
create table if not exists public.courses (
  id                uuid primary key default uuid_generate_v4(),
  subject_id        uuid references public.subjects(id) on delete set null,
  name              text not null,
  year              int  not null default extract(year from now())::int,
  description       text,
  status            text not null default 'active'
                         check (status in ('draft', 'active', 'closed')),
  expected_sessions int  not null default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.courses enable row level security;

-- El usuario ve el curso si tiene algún permiso sobre él (o es admin)
create policy "Ver cursos asignados" on public.courses
  for select using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid() and ucp.course_id = courses.id
    )
  );

create policy "Admin gestiona cursos" on public.courses
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and global_role = 'admin')
  );

-- ─────────────────────────────────────────
-- 5. COMISIONES (commissions)
-- ─────────────────────────────────────────
create table if not exists public.commissions (
  id          uuid primary key default uuid_generate_v4(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

alter table public.commissions enable row level security;

create policy "Ver comisiones de cursos asignados" on public.commissions
  for select using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid() and ucp.course_id = commissions.course_id
    )
  );

create policy "Admin gestiona comisiones" on public.commissions
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and global_role = 'admin')
  );

-- ─────────────────────────────────────────
-- 6. PERMISOS DE USUARIO POR CURSO
-- ─────────────────────────────────────────
create table if not exists public.user_course_permissions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  commission_id   uuid references public.commissions(id) on delete cascade,
  permission      text not null check (permission in ('full', 'edit', 'read')),
  created_at      timestamptz default now(),
  unique (user_id, course_id, commission_id)
);

alter table public.user_course_permissions enable row level security;

create policy "Admin gestiona permisos" on public.user_course_permissions
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and global_role = 'admin')
  );

create policy "Usuario ve sus permisos" on public.user_course_permissions
  for select using (user_id = auth.uid());

-- ─────────────────────────────────────────
-- 7. ENCUENTROS / SESIONES (sessions)
-- ─────────────────────────────────────────
create table if not exists public.sessions (
  id                  uuid primary key default uuid_generate_v4(),
  course_id           uuid not null references public.courses(id) on delete cascade,
  class_number        int,
  date                date not null,
  title               text not null,
  type                text not null default 'teorica'
                           check (type in ('teorica','practica','taller','invitado','parcial','recuperatorio','exposicion','proyecto')),
  responsible         text not null default '',
  modality            text not null default 'presencial'
                           check (modality in ('presencial','virtual')),
  status              text not null default 'pendiente'
                           check (status in ('pendiente','dada','reprogramada','cancelada')),
  -- 'all' o uuid de comisión
  commission_scope    text not null default 'all',
  canva_url           text default '',
  partial_file_url    text default '',
  additional_links    jsonb default '[]'::jsonb,
  guest_bio_url       text default '',
  workshop_brief_url  text default '',
  shared_notes        text default '',
  private_notes       text default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Ver sesiones de cursos asignados" on public.sessions
  for select using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid() and ucp.course_id = sessions.course_id
    )
  );

create policy "Editar sesiones con permiso edit o full" on public.sessions
  for update using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid()
        and ucp.course_id = sessions.course_id
        and ucp.permission in ('edit', 'full')
    )
  );

create policy "Insertar sesiones con permiso edit o full" on public.sessions
  for insert with check (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid()
        and ucp.course_id = course_id
        and ucp.permission in ('edit', 'full')
    )
  );

create policy "Admin elimina sesiones" on public.sessions
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and global_role = 'admin')
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid()
        and ucp.course_id = sessions.course_id
        and ucp.permission = 'full'
    )
  );

-- ─────────────────────────────────────────
-- 8. PENDIENTES (todos)
-- ─────────────────────────────────────────
create table if not exists public.todos (
  id          uuid primary key default uuid_generate_v4(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete set null,
  title       text not null,
  description text default '',
  responsible text default '',
  due_date    date,
  status      text not null default 'open' check (status in ('open', 'closed')),
  priority    text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.todos enable row level security;

create policy "Ver todos de cursos asignados" on public.todos
  for select using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid() and ucp.course_id = todos.course_id
    )
  );

create policy "Gestionar todos con permiso edit o full" on public.todos
  for all using (
    exists (
      select 1 from public.profiles where id = auth.uid() and global_role = 'admin'
    )
    or
    exists (
      select 1 from public.user_course_permissions ucp
      where ucp.user_id = auth.uid()
        and ucp.course_id = todos.course_id
        and ucp.permission in ('edit', 'full')
    )
  );

-- ─────────────────────────────────────────
-- 9. TRIGGER updated_at automático
-- ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_courses_updated_at
  before update on public.courses
  for each row execute procedure public.set_updated_at();

create trigger set_sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.set_updated_at();

create trigger set_todos_updated_at
  before update on public.todos
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────
-- 10. DATOS DEMO
-- Ejecutar DESPUÉS de crear los usuarios en Auth
-- y reemplazar los UUIDs con los reales.
-- ─────────────────────────────────────────

-- Materias
insert into public.subjects (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'TISI'),
  ('00000000-0000-0000-0000-000000000002', 'CDO'),
  ('00000000-0000-0000-0000-000000000003', 'Innovación Tecnológica');

-- Cursos
insert into public.courses (id, subject_id, name, year, description, status, expected_sessions) values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'TISI 2026', 2026,
   'Tecnología de la Información y Sistemas Integrados. Dos comisiones.',
   'active', 32),
  ('10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002',
   'CDO-Tecnología 2026', 2026,
   'Creatividad, Diseño y Organización con foco en Tecnología.',
   'active', 24),
  ('10000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000003',
   'Innovación Tecnológica MDM 2026', 2026,
   'Curso corto de 8 encuentros. Posgrado MDM.',
   'active', 8);

-- Comisiones
insert into public.commissions (id, course_id, name, description) values
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Comisión 1', 'Comisión a cargo de Docente Com. 1'),
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Comisión 2', 'Comisión a cargo de Docente Com. 2'),
  ('20000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002',
   'Única', ''),
  ('20000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   'Única', '');

-- Sesiones demo — TISI
insert into public.sessions
  (course_id, class_number, date, title, type, responsible, modality, status, commission_scope, canva_url, shared_notes)
values
  ('10000000-0000-0000-0000-000000000001', 1, '2026-03-10',
   'Presentación de la materia', 'teorica', 'Emilio', 'presencial', 'dada', 'all',
   'https://canva.com/demo1', 'Primera clase del semestre. Muy buena participación.'),
  ('10000000-0000-0000-0000-000000000001', 2, '2026-03-12',
   'Introducción al pensamiento sistémico', 'teorica', 'Docente Com. 1', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000001', 'https://canva.com/demo2', ''),
  ('10000000-0000-0000-0000-000000000001', 3, '2026-03-12',
   'Introducción al pensamiento sistémico', 'teorica', 'Docente Com. 2', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000002', 'https://canva.com/demo3', ''),
  ('10000000-0000-0000-0000-000000000001', 4, '2026-03-17',
   'Taller de mapeo de sistemas', 'taller', 'Emilio', 'presencial', 'dada', 'all',
   '', 'Muy buena dinámica. Grupos de 4.'),
  ('10000000-0000-0000-0000-000000000001', 7, '2026-03-24',
   'Invitado: Transformación digital en PyMEs', 'invitado', 'Emilio', 'presencial', 'dada', 'all',
   'https://canva.com/inv', 'Invitada: Lucía Fernández, CTO de StartupX.'),
  ('10000000-0000-0000-0000-000000000001', 8, '2026-03-31',
   'Primer Parcial', 'parcial', 'Emilio', 'presencial', 'dada', 'all',
   '', 'Parcial sin inconvenientes.'),
  ('10000000-0000-0000-0000-000000000001', 11, '2026-04-28',
   'Recuperatorio Primer Parcial', 'recuperatorio', 'Emilio', 'presencial', 'pendiente', 'all',
   '', ''),
  ('10000000-0000-0000-0000-000000000001', 12, '2026-05-05',
   'Arquitecturas de plataformas', 'teorica', 'Emilio', 'presencial', 'pendiente', 'all',
   '', ''),
  ('10000000-0000-0000-0000-000000000001', 14, '2026-05-26',
   'Segundo Parcial', 'parcial', 'Emilio', 'presencial', 'pendiente', 'all',
   '', ''),
  ('10000000-0000-0000-0000-000000000001', 15, '2026-06-02',
   'Exposición final de proyectos', 'proyecto', 'Emilio', 'presencial', 'pendiente', 'all',
   '', '');

-- Sesiones demo — CDO
insert into public.sessions
  (course_id, class_number, date, title, type, responsible, modality, status, commission_scope, canva_url, shared_notes)
values
  ('10000000-0000-0000-0000-000000000002', 1, '2026-03-11',
   'Introducción a CDO-Tech', 'teorica', 'Emilio', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000003', 'https://canva.com/cdo1', 'Buen comienzo del curso.'),
  ('10000000-0000-0000-0000-000000000002', 2, '2026-03-13',
   'Diseño centrado en el usuario', 'teorica', 'Ezequiel', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000003', 'https://canva.com/cdo2', ''),
  ('10000000-0000-0000-0000-000000000002', 5, '2026-04-08',
   'Estrategia digital', 'teorica', 'Emilio', 'presencial', 'reprogramada',
   '20000000-0000-0000-0000-000000000003', '', 'Reprogramada por feriado.'),
  ('10000000-0000-0000-0000-000000000002', 6, '2026-04-22',
   'Parcial CDO', 'parcial', 'Emilio', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000003', '', ''),
  ('10000000-0000-0000-0000-000000000002', 7, '2026-05-06',
   'Invitado industria creativa', 'invitado', 'Ezequiel', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000003', '', '');

-- Sesiones demo — MDM
insert into public.sessions
  (course_id, class_number, date, title, type, responsible, modality, status, commission_scope, canva_url, shared_notes)
values
  ('10000000-0000-0000-0000-000000000003', 1, '2026-04-05',
   'Innovación y tecnología: marcos conceptuales', 'teorica', 'Emilio', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000004', 'https://canva.com/mdm1',
   'Clase inaugural del MDM. Excelente nivel de participantes.'),
  ('10000000-0000-0000-0000-000000000003', 2, '2026-04-12',
   'IA aplicada a negocios', 'teorica', 'Pilar', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000004', 'https://canva.com/mdm2', ''),
  ('10000000-0000-0000-0000-000000000003', 3, '2026-04-19',
   'Taller: Mapa de innovación', 'taller', 'Emilio', 'presencial', 'dada',
   '20000000-0000-0000-0000-000000000004', '', ''),
  ('10000000-0000-0000-0000-000000000003', 4, '2026-04-26',
   'Casos de transformación digital', 'practica', 'Pilar', 'virtual', 'dada',
   '20000000-0000-0000-0000-000000000004', 'https://canva.com/mdm4',
   'Clase muy enriquecedora. Casos reales de la industria.'),
  ('10000000-0000-0000-0000-000000000003', 5, '2026-05-03',
   'Plataformas y ecosistemas', 'teorica', 'Emilio', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000004', '', ''),
  ('10000000-0000-0000-0000-000000000003', 6, '2026-05-10',
   'Invitado: Startups de deeptech', 'invitado', 'Pilar', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000004', '', ''),
  ('10000000-0000-0000-0000-000000000003', 7, '2026-05-17',
   'Proyecto final: pitch de innovación', 'exposicion', 'Emilio', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000004', '', ''),
  ('10000000-0000-0000-0000-000000000003', 8, '2026-05-24',
   'Cierre y conclusiones', 'proyecto', 'Emilio', 'presencial', 'pendiente',
   '20000000-0000-0000-0000-000000000004', '', '');

-- ─────────────────────────────────────────
-- FIN DE LA MIGRACIÓN
-- Acordate de crear los usuarios en Auth
-- y luego asignar sus permisos desde el
-- panel Admin de la app.
-- ─────────────────────────────────────────
