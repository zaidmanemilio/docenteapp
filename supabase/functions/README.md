# Edge Functions — gestión de usuarios

Estas funciones reemplazan a las rutas `/api/users/*` de Next.

## Por qué existen

Las altas, ediciones e importaciones de usuarios necesitan la `service_role`
key de Supabase, que **saltea toda la RLS**: es acceso total a la base. Hoy esa
clave vive en el servidor de Next. Cuando el front pase a ser estático (subido
a Hostinger) ya no va a haber servidor propio donde esconderla.

La solución no es mandar la clave al navegador —eso le daría control total de
la base a cualquiera que abra las DevTools—, sino mover esas tres operaciones a
funciones que corren **dentro de Supabase**, donde la clave sigue estando del
lado servidor.

| Función | Reemplaza a | Qué hace |
|---|---|---|
| `users-create` | `POST /api/users/create` | Alta manual de un usuario |
| `users-update` | `POST /api/users/update` | Edición (perfil + email/password) |
| `users-import` | `POST /api/users/import` | Importación masiva desde CSV |

El contrato de entrada y salida es **el mismo** que el de las rutas de Next, así
que al migrar el front solo hay que cambiar la URL.

## Seguridad

Dos capas:

1. **`verify_jwt: true`** — Supabase rechaza el pedido si no trae un JWT válido.
2. **`assertIsAdmin()`** — la función verifica que el token corresponda a un
   usuario real y que su `global_role` en la tabla `profiles` sea `admin`.

El rol se lee **siempre de la base**, nunca de los metadatos del JWT. Los
metadatos los puede editar el propio usuario (la app los usa para el curso
fijado), así que confiar en ellos permitiría que cualquiera se declarase admin.

## Configuración pendiente

Antes de publicar en el dominio propio, definir el secreto **`ALLOWED_ORIGINS`**
(Supabase → Edge Functions → Secrets):

```
https://docenteapp.ednunlp.com.ar
```

Se pueden listar varios separados por coma (por ejemplo agregando
`http://localhost:3000` para desarrollo). Si no se define, se acepta cualquier
origen — cómodo durante la transición, pero conviene cerrarlo antes de salir a
producción.

Las variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase
automáticamente: no hay que cargarlas.

## Probar

```bash
# Debe devolver 401: sin sesión no se puede
curl -i -X POST https://uuwsitwkdsxgtpforbgx.supabase.co/functions/v1/users-create \
  -H "Content-Type: application/json" -d '{}'
```

Para probar el camino feliz hace falta el access token de una sesión de admin.
Se obtiene desde la consola del navegador, con la app abierta y la sesión
iniciada:

```js
const { data } = await window.supabase.auth.getSession()
console.log(data.session.access_token)
```

## Volver a desplegar

```bash
supabase functions deploy users-create --project-ref uuwsitwkdsxgtpforbgx
```

Las tres comparten el código de `_shared/`, que se sube junto con cada una.
