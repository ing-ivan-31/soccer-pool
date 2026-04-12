# Spec: Docker — PostgreSQL + MailDev Local Infrastructure

- **Status:** Done
- **Date:** 2026-04-11
- **Author:** Ivan Sanchez
- **Complexity:** S (Small)

---

## 1. Overview

Proveer infraestructura local de desarrollo mediante Docker:

1. **PostgreSQL** — base de datos con persistencia en volume nombrado.
2. **MailDev** — servidor SMTP local para capturar emails de verificación sin enviarlos a internet.
3. **Dockerfile multi-stage** para la API NestJS — pensado para Railway/producción, no para desarrollo local.

La API NestJS y el frontend Next.js corren **fuera de Docker** con `npm run start:dev` / `npm run dev`.

---

## 2. Archivos a crear

```
soccer-pool/
├── docker-compose.yml                    ← servicios locales (postgres + maildev)
├── src/
│   └── soccer-pool-api/
│       ├── Dockerfile                    ← multi-stage build para producción
│       └── .dockerignore
```

---

## 3. Variables de entorno

### 3.1 Variables nuevas a documentar en `.env.example`

```bash
# ── Database (Docker) ──────────────────────────────────────────
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
POSTGRES_USER=""
POSTGRES_PASSWORD=""
POSTGRES_DB=""
POSTGRES_PORT=5432

# ── MailDev (local email capture) ─────────────────────────────
MAILDEV_SMTP_PORT=1025
MAILDEV_WEB_PORT=1080
```

> El desarrollador define los valores. Nunca se commitean los valores reales.

### 3.2 Nota de integración con el spec de Auth

En desarrollo local, el `AuthModule` debe enviar emails al SMTP de MailDev en lugar de llamar la API de Resend. Esto se maneja con una variable:

```bash
# src/soccer-pool-api/.env
EMAIL_PROVIDER="maildev"   # "maildev" | "resend"
MAILDEV_HOST="localhost"
MAILDEV_SMTP_PORT=1025
```

La lógica de bifurcación (`EMAIL_PROVIDER`) queda fuera de este spec — se implementa en el spec de Auth o en un spec de `NotificationsModule` dedicado.

---

## 4. docker-compose.yml

**Ubicación:** raíz del repo (`soccer-pool/docker-compose.yml`)

### Servicios

#### postgres

| Campo | Valor |
|-------|-------|
| Image | `postgres:16-alpine` |
| Container name | `soccer_pool_postgres` |
| Ports | `${POSTGRES_PORT:-5432}:5432` |
| Env vars | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` leídos del `.env` raíz |
| Volume | named volume `postgres_data` montado en `/var/lib/postgresql/data` |
| Health check | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` cada 10s, 5 reintentos, start_period 30s |
| Restart policy | `unless-stopped` |

#### maildev

| Campo | Valor |
|-------|-------|
| Image | `maildev/maildev:latest` |
| Container name | `soccer_pool_maildev` |
| Ports | `${MAILDEV_SMTP_PORT:-1025}:1025` (SMTP), `${MAILDEV_WEB_PORT:-1080}:1080` (UI) |
| Environment | `MAILDEV_SMTP_PORT=1025`, `MAILDEV_WEB_PORT=1080` |
| Restart policy | `unless-stopped` |
| Depends on | — (independiente de postgres) |

### Volume nombrado

```yaml
volumes:
  postgres_data:
    driver: local
```

El volume `postgres_data` persiste los datos entre `docker compose down` / `docker compose up`. Solo se eliminan con `docker compose down -v`.

---

## 5. Dockerfile (API NestJS — producción)

**Ubicación:** `src/soccer-pool-api/Dockerfile`

### Etapas (multi-stage build)

```
Stage 1: deps
  - FROM node:20-alpine AS deps
  - Copia package.json y package-lock.json
  - RUN npm ci --only=production

Stage 2: build
  - FROM node:20-alpine AS build
  - Copia todo el source
  - RUN npm ci
  - RUN npm run build
  (genera /dist)

Stage 3: runner
  - FROM node:20-alpine AS runner
  - Crea usuario no-root: node
  - Copia /dist desde build
  - Copia node_modules desde deps
  - EXPOSE 3001
  - USER node
  - CMD ["node", "dist/main"]
```

### Restricciones de seguridad

- Proceso corre como usuario `node` (no root)
- No instala devDependencies en la imagen final
- No copia archivos `.env` (se inyectan como variables de entorno en Railway)

---

## 6. .dockerignore

**Ubicación:** `src/soccer-pool-api/.dockerignore`

```
node_modules
dist
.env
.env.*
!.env.example
*.log
coverage
.git
```

---

## 7. Comandos de uso local

```bash
# Levantar solo la DB y MailDev
docker compose up -d

# Ver logs de postgres
docker compose logs -f postgres

# Parar sin eliminar datos
docker compose down

# Parar Y eliminar datos (reset completo)
docker compose down -v

# Acceder a psql dentro del contenedor
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB

# UI de MailDev
open http://localhost:1080
```

---

## 8. Acceptance Criteria

### AC-1: PostgreSQL arranca

**Given** un `.env` con `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` definidos  
**When** `docker compose up -d postgres`  
**Then** contenedor `soccer_pool_postgres` está `healthy` en menos de 60s

---

### AC-2: Persistencia de datos

**Given** datos insertados en la DB  
**When** `docker compose down` seguido de `docker compose up -d`  
**Then** los datos persisten — el volume `postgres_data` no fue eliminado

---

### AC-3: Reset limpio

**Given** necesidad de reiniciar desde cero  
**When** `docker compose down -v`  
**Then** el volume `postgres_data` es eliminado — próximo `up` parte con DB vacía

---

### AC-4: MailDev captura emails

**Given** MailDev corriendo  
**When** cualquier proceso envía un email al SMTP `localhost:1025`  
**Then** el email es visible en `http://localhost:1080` sin salir a internet

---

### AC-5: Prisma conecta desde el host

**Given** postgres corriendo y `DATABASE_URL` configurada en `.env` de la API  
**When** `npx prisma migrate dev` desde `src/soccer-pool-api/`  
**Then** migración aplicada exitosamente

---

### AC-6: Dockerfile produce imagen funcional

**Given** el Dockerfile multi-stage  
**When** `docker build -t soccer-pool-api .` desde `src/soccer-pool-api/`  
**Then** imagen construida sin errores, proceso corre como usuario `node`, no contiene `.env` ni `node_modules` de dev

---

## 9. Definition of Done

### docker-compose.yml
- [x] `docker-compose.yml` exists at the repo root
- [x] `postgres` service uses `postgres:16-alpine` image
- [x] `postgres` service reads credentials from env vars — no hardcoded values in the file
- [x] `postgres` service has a `healthcheck` configured with `pg_isready`
- [x] `postgres` service has `restart: unless-stopped`
- [x] `maildev` service uses `maildev/maildev:latest` image
- [x] `maildev` exposes port 1025 (SMTP) and 1080 (Web UI)
- [x] Both ports are configurable via env vars with sensible defaults
- [x] Named volume `postgres_data` declared and mounted on the postgres service
- [ ] Running `docker compose down` does NOT delete the volume — verify manually
- [ ] Running `docker compose down -v` DOES delete the volume — verify manually

### .env.example
- [x] All new env vars from §3.1 are documented in `.env.example`
- [x] No actual credentials or values committed
- [x] `EMAIL_PROVIDER`, `MAILDEV_HOST`, `MAILDEV_SMTP_PORT` documented

### Dockerfile (API)
- [x] `Dockerfile` exists at `src/soccer-pool-api/Dockerfile`
- [x] Uses multi-stage build with at least 3 stages: `deps`, `build`, `runner`
- [x] Final image is based on `node:20-alpine`
- [x] Final image does NOT include devDependencies
- [x] Process runs as non-root user `node`
- [x] `EXPOSE 3001` declared
- [x] No `.env` files copied into the image

### .dockerignore
- [x] `.dockerignore` exists at `src/soccer-pool-api/.dockerignore`
- [x] `node_modules`, `dist`, `.env`, `*.env.*`, `coverage`, `.git` are all excluded
- [x] `.env.example` is NOT excluded (safe to include as documentation)

### Connectivity
- [ ] `npx prisma migrate dev` succeeds from host when postgres container is healthy — verify after Auth spec
- [ ] MailDev web UI accessible at `http://localhost:1080` — verify manually
- [ ] SMTP on port 1025 accepts connections from the host — verify manually

---

## 10. Orden de implementación

Este spec no requiere sub-agentes — son archivos de infraestructura puros:

1. `docker-compose.yml` en la raíz
2. `src/soccer-pool-api/.dockerignore`
3. `src/soccer-pool-api/Dockerfile`
4. Actualizar `.env.example` con vars nuevas

**No hay dependencias con otros specs.** Puede implementarse antes o en paralelo con el spec de Auth.

---

## 11. Relación con otros specs

| Spec | Relación |
|------|----------|
| `2026-04-11-jwt-auth-swagger-standard-response.md` | El spec de Auth requiere PostgreSQL corriendo — este spec lo provee |
| `NotificationsModule` (futuro) | Usará `EMAIL_PROVIDER=maildev` para dev y `resend` para prod |
