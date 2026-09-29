# Publicación y deploy

## 1. Publicar en GitHub

El repositorio ya está inicializado por `create-next-app`. Si es la primera
publicación:

```bash
git add -A
git status                    # confirmar que .env.local NO aparece
git commit -m "feat: bandeja de reseñas con auditoría y manejo de datos sucios"
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

### Verificación obligatoria antes de commitear

`.env.local` está ignorado, pero conviene comprobarlo cada vez:

```bash
git check-ignore -v .env.local     # debe imprimir la regla que lo ignora
git status --short                 # no debe listar .env*
```

Nunca commitear a la fuerza un `.env*` con `git add -f`. Si ya se commiteó por
error, borrarlo del índice no alcanza: la clave queda en el historial y hay que
rotarla en el dashboard de Supabase.

---

## 2. Preparar la base de datos

Antes de desplegar, el schema tiene que estar aplicado en Supabase:

1. Dashboard de Supabase → **SQL Editor**
2. Pegar el contenido de `supabase/schema.sql`
3. Ejecutar

Comprobación:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
-- restaurants, locations, reviews, audit_logs

select policyname, cmd from pg_policies
where tablename in ('reviews', 'audit_logs') order by policyname;
-- reviews: SELECT, SELECT, SELECT  (ninguna de escritura)
```

Si aparece alguna política `UPDATE` o `INSERT` sobre `reviews` o `audit_logs`,
el schema no se aplico completo. Volve a aplicarlo.

---

## 3. Deploy en Vercel

```bash
pnpm add -g vercel
vercel
```

Vercel detecta Next.js solo. En el prompt:

- **Framework Preset:** Next.js (dejar el que aparece)
- **Root Directory:** `.`
- **Build Command:** `pnpm build` (o dejar `next build`)
- **Output Directory:** dejar vacío

### Variables de entorno en Vercel

Dashboard del proyecto → **Settings** → **Environment Variables**:

| Variable | Entornos | Visible en el cliente |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | **Production**, Preview | **No** |
| `IMPORT_TOKEN` | **Production**, Preview | **No** |
| `SESSION_TTL_HOURS` (opcional) | Production, Preview | **No** |
| `APP_ORIGIN` (opcional) | **Production** | **No** |

Las del bloque de escritura (`SUPABASE_SERVICE_ROLE_KEY` e `IMPORT_TOKEN`) se marcan
como **Sensitive** para que Vercel las enmascare en los logs. No hay ningún token
de sesión que configurar: cada login emite el suyo y lo manda en una cookie
`HttpOnly` que el navegador adjunta solo.

> El usuario, la contraseña y la sesión **no** son variables de entorno: viven en
> las tablas `auth_users` (hash scrypt) y `auth_sessions` (solo el SHA-256 del
> token) de Supabase. Antes de desplegar, asegurate de que las dos tablas existen y
> que `auth_users` tiene la fila del usuario. Tablas y seed demo están en
> `supabase/schema.sql` (aplicar desde el SQL Editor del dashboard).
>
> `APP_ORIGIN` es opcional: si falta, el chequeo de CSRF compara contra el origin
> de la propia request, que en Vercel ya es el público. Conviene fijarlo si el
> sitio va a vivir detrás de un proxy.

Después de agregarlas: **Deployments** → redeploy. Vercel no reinyecta variables
en un build ya hecho.

### La trampa de `NEXT_PUBLIC_*`

Las variables `NEXT_PUBLIC_*` se **inlinean en el bundle durante el build**, no
se leen en runtime. Si cambiás el valor en el dashboard, tenés que rebuildear;
redeployar sin `--build` puede no alcanzar.

Y como implica "público", la anon key va expuesta en el bundle del navegador
por diseño. No es un error: es la razón por la que RLS tiene que impedir que
escriba. Ver la sección de Seguridad del README.

---

## 4. Verificación post-deploy

```bash
# La app carga
curl -I https://<tu-dominio>.vercel.app

# El import está cerrado sin token (503, no 401: es que ni siquiera se configura)
curl -X POST https://<tu-dominio>.vercel.app/api/import

# Con token, responde 200 con success: "ok"
curl -X POST https://<tu-dominio>.vercel.app/api/import \
  -H "x-import-token: $IMPORT_TOKEN"

# La sesión de escritura vive en una cookie HttpOnly: hay que usar un cookie jar,
# porque curl no la adjunta sola.
# Las credenciales viven en auth_users (ver arriba): usuario demo "gerente",
# contraseña demo "Password123". En producción, usar la fila real de la tabla.
# → 200 + Set-Cookie: reviews_session=...; HttpOnly; SameSite=Lax; Secure
curl -c /tmp/jar.txt -X POST https://<tu-dominio>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"gerente","password":"<PASSWORD_DE_AUTH_USERS>"}'

# La cookie resuelve la sesión: 200 con { user, expiresAt }
curl -b /tmp/jar.txt -X POST https://<tu-dominio>.vercel.app/api/auth/verify

# Escritura sin sesión ni cookie: 401
curl -X POST https://<tu-dominio>.vercel.app/api/generate-draft \
  -d '{"reviewId":"rv-101"}'
# → 401 { success: "fail", message: "Sesión no válida o vencida: iniciá sesión de nuevo." }

# CSRF: cookie válida pero Origin ajeno: 403 (403, no 401: la sesión existe,
# lo que falla es de dónde viene la request)
curl -b /tmp/jar.txt -X POST https://<tu-dominio>.vercel.app/api/save-reply \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.example" \
  -d '{"reviewId":"rv-101","replyText":"hola"}'
# → 403 { success: "fail", message: "Origen de la solicitud no permitido." }

# Logout: 200, revoca en la base y borra la cookie
curl -b /tmp/jar.txt -c /tmp/jar.txt -X POST https://<tu-dominio>.vercel.app/api/auth/logout

# Verify después del logout: 401 (la revocación es real, no solo borrar la cookie)
curl -b /tmp/jar.txt -X POST https://<tu-dominio>.vercel.app/api/auth/verify
```

### La anon key no puede escribir

Desde la **consola del navegador** en el sitio desplegado:

```js
// Debe fallar con 42501 permission denied
await supabase.from('reviews').update({ reply_text: 'hack' }).eq('id', 'rv-101')

// Debe fallar con 42501
await supabase.from('audit_logs').insert({
  action: 'SAVE_REPLY', method: 'POST', response_status: 'ok',
})
```

Si alguno de los dos **funciona**, el schema no se aplicó bien. Es el test de
seguridad más importante de la lista y toma 30 segundos.

La variable `supabase` no está definida en la consola por defecto. Pegar esto
primero, con la anon key del sitio desplegado:

```js
const supabase = createClient(
  'https://<project-ref>.supabase.co',
  '<ANON_KEY>'
)
```

---

## 5. Checklist de deploy

- [ ] `git check-ignore -v .env.local` devuelve una regla
- [ ] `git status` no lista ningún `.env*`
- [ ] `supabase/schema.sql` aplicado (6 tablas, incluidas `auth_users` y `auth_sessions`)
- [ ] `auth_users` tiene la fila del usuario de producción (hash scrypt de una contraseña fuerte, **no** `Password123`)
- [ ] `auth_sessions` vacía: `delete from auth_sessions;` (las sesiones de demo caducan solas, pero no hay razón para dejarlas)
- [ ] `pg_policies` no muestra políticas de escritura sobre `reviews`, `audit_logs`, `auth_users` ni `auth_sessions`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` e `IMPORT_TOKEN` marcadas como Sensitive
- [ ] `IMPORT_TOKEN` generado con `crypto.randomBytes(32)`, no con una palabra
- [ ] Deploy triggered tras agregar las variables
- [ ] `POST /api/import` responde 200 con el token
- [ ] `POST /api/auth/login` responde 200 y manda `Set-Cookie: reviews_session=...` con `HttpOnly` y `Secure`
- [ ] `POST /api/auth/verify` con esa cookie responde 200; sin ella, 401
- [ ] `POST /api/generate-draft` con un `Origin:` ajeno responde 403
- [ ] El UPDATE con anon key falla con 42501
- [ ] `pnpm verify:metrics` verde antes de subir
