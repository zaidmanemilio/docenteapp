# DocenteApp — Guía de instalación y despliegue

## ¿Qué es esto?

DocenteApp es una plataforma web interna para gestión docente universitaria.
Te permite planificar el semestre, gestionar encuentros, cargar links y notas,
y coordinar con tu equipo docente.

---

## PARTE 1: Configuración técnica (una sola vez)

### Paso 1: Crear una cuenta en GitHub

GitHub es donde va a vivir el código de tu app.

1. Andá a https://github.com
2. Hacé clic en "Sign up"
3. Elegí un nombre de usuario, poné tu email y creá una contraseña
4. Verificá tu email cuando llegue el mensaje de confirmación

### Paso 2: Subir el código a GitHub

1. Entrá a https://github.com
2. Hacé clic en el botón verde **"New"** (o el símbolo "+" arriba a la derecha → New repository)
3. Nombre del repositorio: `docenteapp`
4. Seleccioná **Private** (para que el código no sea público)
5. Hacé clic en **"Create repository"**

Ahora necesitás subir los archivos. La forma más simple sin terminal:

1. En la pantalla del repositorio vacío, hacé clic en **"uploading an existing file"**
2. Arrastrá **todos los archivos y carpetas** de este proyecto a esa ventana
3. Escribí un mensaje como "Primera versión de DocenteApp"
4. Hacé clic en **"Commit changes"**

> Si querés hacerlo con la terminal (más rápido):
> ```
> cd docenteapp
> git init
> git add .
> git commit -m "Primera versión"
> git branch -M main
> git remote add origin https://github.com/TU_USUARIO/docenteapp.git
> git push -u origin main
> ```

### Paso 3: Crear una cuenta en Supabase

Supabase es la base de datos y el sistema de login de la app.

1. Andá a https://supabase.com
2. Hacé clic en **"Start your project"**
3. Iniciá sesión con tu cuenta de GitHub (es la forma más fácil)
4. Hacé clic en **"New project"**
5. Elegí un nombre: `docenteapp`
6. Elegí una contraseña para la base de datos (guardala, la vas a necesitar)
7. Región: **South America (São Paulo)** — es la más cercana a Argentina
8. Hacé clic en **"Create new project"**
9. Esperá 1-2 minutos a que se cree

### Paso 4: Ejecutar la migración SQL (crear tablas y datos demo)

1. En tu proyecto de Supabase, andá al menú **"SQL Editor"** (ícono de código en la barra izquierda)
2. Hacé clic en **"New query"**
3. Abrí el archivo `supabase/migrations/001_schema_and_seed.sql` de este proyecto
4. Copiá **todo** el contenido y pegalo en el editor
5. Hacé clic en el botón **"Run"** (arriba a la derecha)
6. Deberías ver "Success" en verde

### Paso 5: Crear los usuarios en Supabase

1. En el menú de Supabase, andá a **"Authentication"** → **"Users"**
2. Hacé clic en **"Add user"** → **"Create new user"**
3. Creá cada uno de estos usuarios:

| Email | Contraseña | Nombre completo | Rol |
|-------|-----------|----------------|-----|
| emilio@docenteapp.com | (elegí una) | Emilio | admin |
| ezequiel@docenteapp.com | (elegí una) | Ezequiel | teacher |
| pilar@docenteapp.com | (elegí una) | Pilar | teacher |
| docente1@docenteapp.com | (elegí una) | Docente Comisión 1 | teacher |
| docente2@docenteapp.com | (elegí una) | Docente Comisión 2 | teacher |
| secretario@docenteapp.com | (elegí una) | Secretario Académico | guest |

Para cada usuario:
- En "Email", poné el email de la tabla
- En "Password", elegí una contraseña segura
- En **"User Metadata"**, agregá esto (reemplazando los valores):
  ```json
  {"full_name": "Emilio", "global_role": "admin"}
  ```
  (para Emilio; para los demás cambiá full_name y global_role)

### Paso 6: Asignar permisos a los usuarios

Una vez creados los usuarios, necesitás asignarles permisos a los cursos.

1. En Supabase, andá a **"Table Editor"** → tabla `user_course_permissions`
2. Hacé clic en **"Insert row"** para cada permiso:

Copiá los UUIDs de los usuarios desde Authentication → Users.
Copiá los IDs de los cursos desde Table Editor → tabla `courses`.

Permisos a crear:

| Usuario | Curso | Comisión | Permiso |
|---------|-------|----------|---------|
| Emilio | TISI 2026 | (vacío = todas) | full |
| Emilio | CDO-Tecnología 2026 | Única | full |
| Emilio | MDM 2026 | Única | full |
| Ezequiel | CDO-Tecnología 2026 | Única | edit |
| Pilar | MDM 2026 | Única | full |
| Docente Com. 1 | TISI 2026 | Comisión 1 | edit |
| Docente Com. 2 | TISI 2026 | Comisión 2 | edit |
| Secretario | TISI 2026 | (vacío = todas) | read |
| Secretario | CDO-Tecnología 2026 | (vacío = todas) | read |
| Secretario | MDM 2026 | (vacío = todas) | read |

> **Alternativa más fácil**: Una vez que la app esté desplegada,
> podés asignar permisos desde el panel de Admin dentro de la propia app
> (menú "Usuarios y permisos").

### Paso 7: Obtener las claves de Supabase

1. En Supabase, andá a **"Settings"** (ícono de engranaje) → **"API"**
2. Copiá estos dos valores (los vas a necesitar en el Paso 9):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon / public key**: `eyJhbGci...`

### Paso 8: Crear una cuenta en Vercel

Vercel es quien va a publicar tu app en internet.

1. Andá a https://vercel.com
2. Hacé clic en **"Sign Up"**
3. Elegí **"Continue with GitHub"** — es la opción más simple
4. Autorizá a Vercel a acceder a tu GitHub

### Paso 9: Desplegar la app en Vercel

1. En Vercel, hacé clic en **"New Project"**
2. Buscá tu repositorio `docenteapp` y hacé clic en **"Import"**
3. En "Framework Preset", seleccioná **"Next.js"**
4. Antes de hacer clic en "Deploy", expandí la sección **"Environment Variables"**
5. Agregá estas variables (una por una):

   | Nombre | Valor |
   |--------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | La URL de tu proyecto Supabase (Paso 7) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La clave anon de Supabase (Paso 7) |

6. Hacé clic en **"Deploy"**
7. Esperá 2-3 minutos a que termine el proceso
8. Vercel te va a dar una URL como `https://docenteapp-xxx.vercel.app`

**¡Tu app está en el aire!**

---

## PARTE 2: Usar la app

### Primer ingreso

1. Andá a tu URL de Vercel
2. Ingresá con el email y contraseña de Emilio (el Admin)
3. Deberías ver el dashboard con los datos demo

### Compartir acceso con otros docentes

Simplemente compartiles la URL y sus credenciales (email y contraseña que creaste en el Paso 5).

### Para añadir cursos nuevos

1. Ingresá como Admin (Emilio)
2. Por ahora, los cursos nuevos se crean directamente en la base de datos:
   - En Supabase → Table Editor → tabla `courses` → Insert row
3. En la próxima versión habrá una pantalla de administración de cursos

---

## PARTE 3: Errores comunes y soluciones

### Error: "Invalid API key"
- Verificá que las variables de entorno en Vercel estén bien escritas
- Asegurate de que no haya espacios antes o después de la clave
- En Vercel: Settings → Environment Variables → verificar

### Error: "Cannot read properties of undefined"
- Probablemente la migración SQL no se ejecutó correctamente
- Volvé al SQL Editor de Supabase y volvé a ejecutar el script

### Error: página en blanco al ingresar
- Verificá que el usuario existe en Supabase Authentication
- Verificá que el perfil se creó en la tabla `profiles`
- Si no está, crealo manualmente en Table Editor → profiles

### No veo los cursos al entrar
- El usuario no tiene permisos asignados
- Andá a Table Editor → user_course_permissions y verificá que existan entradas para ese usuario

### El login dice "Invalid credentials"
- La contraseña es incorrecta
- En Supabase → Authentication → Users → buscá el usuario → "Send password reset"

### Quiero cambiar el dominio de la app
- En Vercel → Settings → Domains → Add domain
- Necesitás comprar un dominio (.com, .ar, etc.) en un proveedor como Namecheap o Cloudflare
- Precios: desde USD 10/año

---

## PARTE 4: Mantenimiento

### Hacer cambios al código

Si modificás algo en el código y lo subís a GitHub, Vercel lo va a re-desplegar automáticamente.

### Límites del tier gratuito

**Supabase Free:**
- 500MB de base de datos — suficiente para años de uso de este sistema
- 50,000 requests/mes — más que suficiente
- 50MB de storage de archivos (no lo usamos por ahora)

**Vercel Free:**
- 100GB de bandwidth/mes
- Deploys ilimitados
- Funciones serverless incluidas

Para el uso de esta plataforma (5-10 usuarios), ambos tiers gratuitos son más que suficientes por mucho tiempo.

### Backups de la base de datos

Supabase hace backups automáticos diarios en el tier gratuito.
Para más control, podés exportar manualmente desde Table Editor → cualquier tabla → "Export CSV".

---

## PARTE 5: Próxima versión

Features recomendadas para la v2:

1. **Pantalla de creación de cursos** desde la app (sin tocar Supabase)
2. **Historial de cambios** por encuentro
3. **Invitación de usuarios por email** desde la app
4. **Recupero de contraseña** con email personalizado
5. **Vista de calendario** para el cronograma
6. **Exportar cronograma** a CSV/Excel
7. **Notificaciones** por email para pendientes con fecha vencida

---

## Estructura del proyecto

```
docenteapp/
├── src/
│   ├── app/
│   │   ├── (app)/                  # Rutas protegidas por auth
│   │   │   ├── layout.tsx          # Layout con sidebar
│   │   │   ├── page.tsx            # Redirect al primer curso
│   │   │   └── courses/
│   │   │       └── [courseId]/
│   │   │           ├── layout.tsx  # Verificación de acceso
│   │   │           ├── dashboard/  # Dashboard con métricas
│   │   │           ├── schedule/   # Cronograma de encuentros
│   │   │           ├── import/     # Importar CSV/Excel
│   │   │           ├── todos/      # Pendientes
│   │   │           ├── config/     # Configuración del curso
│   │   │           └── users/      # Usuarios y permisos (admin)
│   │   ├── api/auth/callback/      # Callback de autenticación
│   │   ├── login/                  # Pantalla de login
│   │   └── layout.tsx             # Layout raíz
│   ├── components/
│   │   └── layout/Sidebar.tsx      # Barra lateral de navegación
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts           # Cliente para el navegador
│   │       └── server.ts           # Cliente para el servidor
│   ├── middleware.ts               # Protección de rutas
│   ├── styles/globals.css          # Estilos globales
│   └── types/index.ts              # Tipos TypeScript
├── supabase/migrations/
│   └── 001_schema_and_seed.sql     # Esquema completo + datos demo
├── public/
│   └── cronograma_ejemplo.csv      # CSV de ejemplo para importar
├── .env.local.example              # Template de variables de entorno
├── .gitignore
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

*DocenteApp MVP v1.0 — Documentación de despliegue*
