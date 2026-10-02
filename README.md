# HealthPass 🩺
*Tu información médica cuando más la necesites.*

Plataforma web para guardar y consultar información médica personal (tipo de sangre, alergias, medicamentos,
antecedentes, cirugías, seguro y contactos de emergencia), con **vista de emergencia** y **enlace compartido** con
privacidad controlada.

## Tecnologías
- **Frontend:** HTML + CSS + JavaScript (carpeta `frontend/`)
- **Backend:** Node.js + Express (carpeta `backend/`)
- **Base de datos:** PostgreSQL (SQL, triggers, procedimientos y funciones en `database/init.sql`)
- **Despliegue:** Docker (local) y Railway (producción)

## Estructura
```
healthpass/
├── frontend/                 Páginas, CSS, imágenes y js/ (conexión con la API)
├── backend/src/              Servidor Express (rutas, autenticación, validaciones)
├── database/
│   ├── init.sql              Tablas, triggers, procedimientos y funciones (idempotente)
│   └── seed_demo.sql         Usuario de demostración
├── BASE_DE_DATOS_DOCKER.md   Guía para copiar y pegar en Docker
├── Dockerfile / docker-compose.yml
└── .env.example
```

## Usuario de demostración
`carlosherrera` / `Demo1234!` (se crea solo si `SEED_DEMO=true`).

---

## 1. Ejecutar en tu computador

### Opción A · Todo con Docker (la más simple)
```bash
docker compose up -d --build
```
Abre http://localhost:3000. Para apagar: `docker compose down` (los datos se conservan).

### Opción B · Base en Docker + backend con Node
Sigue **`BASE_DE_DATOS_DOCKER.md`** (crea el contenedor y pega el SQL) y luego:
```bash
cd backend
cp ../.env.example .env      # Windows: copy ..\.env.example .env
npm install
npm start
```

---

## 2. Subir el proyecto a GitHub

1. Instala Git (git-scm.com) y crea una cuenta en github.com.
2. En GitHub: **New repository** → nombre `healthpass` → déjalo vacío (sin README) → **Create**.
3. En una terminal, dentro de la carpeta del proyecto:
```bash
git init
git add .
git commit -m "HealthPass: frontend, backend y base de datos"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/healthpass.git
git push -u origin main
```
4. Si pide contraseña, usa un **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) o inicia sesión desde el navegador.
5. Para tu equipo: repo → **Settings → Collaborators** → agrega a Andrea y María José.

> El archivo `.gitignore` ya evita subir `node_modules/` y `.env` (tus secretos).

---

## 3. Publicar en Railway (con base de datos siempre encendida)

Railway te da un enlace público gratis tipo `healthpass-production.up.railway.app`; no necesitas dominio.

1. Entra a **railway.com** e inicia sesión con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** → elige `healthpass`. Railway detecta el `Dockerfile` y construye solo.
3. En el mismo proyecto: **+ New → Database → Add PostgreSQL**. Esa base queda **encendida 24/7**; ya no dependes de tu Docker.
4. Abre el servicio de tu app (`healthpass`) → pestaña **Variables** → agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base; si tu servicio se llama distinto, usa ese nombre) |
| `JWT_SECRET` | un texto largo aleatorio (genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `NODE_ENV` | `production` |
| `SEED_DEMO` | `true` (crea el usuario demo; ponlo en `false` o bórralo después de tu exposición) |

5. Pestaña **Settings → Networking → Generate Domain**. Ese es tu enlace público.
6. (Recomendado) **Settings → Healthcheck Path:** `/api/health`.
7. Cada `git push` a `main` vuelve a desplegar automáticamente.

Al arrancar, la app ejecuta `database/init.sql` sobre la base de Railway: **crea las tablas, triggers y
procedimientos sola**. No hay que pegar SQL a mano.

**Para que otras personas administren el proyecto:** Railway → Project Settings → Members. Las credenciales viven
en las variables de Railway, no en el código.

> Railway funciona con crédito de prueba y luego cobra por uso. Revisa los precios vigentes en railway.com/pricing.
> Alternativa gratuita para la base de datos: Neon o Supabase (PostgreSQL); usa su cadena de conexión como `DATABASE_URL`
> y agrega `PGSSL=true`.

---

## 4. Qué hace la base de datos

| Elemento | Función |
|---|---|
| **Triggers** | actualizan fechas, crean perfil y privacidad al registrarse, limitan a 5 contactos y 50 ítems por lista, garantizan un único contacto principal (y promueven otro si se borra), validan la fecha de nacimiento y registran auditoría |
| **Procedimientos** | `sp_reemplazar_items` (guarda listas), `sp_eliminar_informacion_medica` (botón "Eliminar mi información") |
| **Funciones** | `fn_generar_enlace`, `fn_revocar_enlace`, `fn_vista_emergencia` (aplica los interruptores de privacidad), `fn_vista_emergencia_por_token`, `fn_resumen_dashboard` |
| **Vista** | `v_perfil_completo` |

## 5. Seguridad aplicada
- Contraseñas cifradas con bcrypt; sesión en cookie `httpOnly` (JWT, 7 días).
- Consultas parametrizadas (sin inyección SQL) y escape de HTML en pantalla (sin XSS).
- Encabezado anti-CSRF, cabeceras de seguridad (Helmet/CSP) y límite de intentos en login y enlaces públicos.
- Cada usuario solo accede a sus propios datos.
- La auditoría guarda solo *qué* y *cuándo*, nunca el contenido médico.
- Los enlaces compartidos vencen a las 72 h, se pueden revocar y respetan los interruptores de privacidad.

## 6. Pendiente / ideas futuras
- "Olvidé mi contraseña" (requiere envío de correos).
- Sección para subir documentos médicos (archivos) del alcance original.
- Cifrado de campos sensibles en la base de datos y cumplimiento normativo (p. ej. Ley 1581 de 2012 en Colombia) si se usara con datos reales.

> ⚠️ Para pruebas y exposición usa **datos ficticios**.
