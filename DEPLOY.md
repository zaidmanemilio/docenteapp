# Publicar en Hostinger

La app se compila a archivos estáticos (HTML, CSS, JS). No necesita Node ni
ningún servidor: alcanza con subir una carpeta. La base de datos, el login y
la gestión de usuarios siguen en Supabase.

## Compilar

```bash
npm install
NEXT_PUBLIC_SUPABASE_URL="https://uuwsitwkdsxgtpforbgx.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>" \
npm run build
```

La `anon key` está en Supabase → Project Settings → API Keys → `anon` /
`publishable`. Es pública por diseño: viaja igual dentro del JavaScript que
recibe cada visitante, y lo que protege los datos es la RLS de la base, no
ocultarla.

**Importante:** esas variables se hornean en el build. Si cambian, hay que
recompilar; no alcanza con editar un archivo del servidor.

El resultado queda en **`out/`**.

## Subir

Subir **el contenido** de `out/` (no la carpeta) a la carpeta del subdominio en
Hostinger, normalmente `public_html/appdocente/`.

Incluye un archivo **`.htaccess`** (empieza con punto, así que puede estar
oculto: en el File Manager de hPanel hay que activar "mostrar archivos
ocultos"). Sin él la app funciona igual, pero se pierden:

- la redirección de las URLs viejas `/courses/<id>/dashboard`,
- el cacheo de los archivos con hash,
- la compresión.

Al actualizar conviene **borrar el contenido anterior** antes de subir el
nuevo, para no dejar archivos viejos sueltos.

## Configuración en Supabase

Una sola vez, y solo cuando el dominio esté publicado:

1. **Edge Functions → Secrets**: `ALLOWED_ORIGINS` = `https://appdocente.ednunlp.com.ar`
   Sin esto, el alta y la importación de usuarios fallan con error de CORS.
2. **Authentication → URL Configuration**: agregar el dominio en *Site URL* y
   en *Redirect URLs*.

## Cómo quedó armado

| Parte | Dónde vive |
|---|---|
| Pantallas (HTML/CSS/JS) | Hostinger, archivos estáticos |
| Datos y permisos | Supabase (Postgres + RLS) |
| Login | Supabase Auth |
| Alta/edición/importación de usuarios | Supabase Edge Functions |

Las operaciones de usuarios necesitan la `service_role` key, que da acceso
total a la base. Por eso no están en el front: viven en Edge Functions, dentro
de Supabase, donde esa clave sigue siendo de servidor.

## Direcciones

El curso activo viaja como parámetro, no en la ruta:

```
antes:  /courses/<uuid>/dashboard
ahora:  /courses/dashboard/?c=<uuid>
```

Es lo que permite tener una sola página por sección en vez de una por curso
(los cursos se crean y archivan en runtime, así que no se pueden pre-generar).
El `.htaccess` redirige las direcciones viejas, así que los favoritos siguen
funcionando.

## Verificar después de subir

1. Abrir `https://appdocente.ednunlp.com.ar` → tiene que aparecer el login.
2. Entrar → tiene que abrir el panel del curso fijado.
3. Navegar entre secciones y cambiar de curso.
4. Con un usuario **admin**, probar el alta de un usuario: eso ejercita las
   Edge Functions y el CORS.
5. Abrir en el celular y comprobar el botón **Menú**.
