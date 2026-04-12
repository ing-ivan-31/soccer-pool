# Spec: JWT Auth + Swagger + Standard Response

- **Status:** Done
- **Date:** 2026-04-11
- **Author:** Ivan Sanchez
- **Complexity:** L (Large)

---

## 1. Overview

Implementar la infraestructura base del backend:

1. **Autenticación JWT** — registro con email/password, verificación de email, login, refresh de token, logout y endpoint `me`.
2. **Formato de respuesta estándar** — un interceptor global que envuelve todas las respuestas en un envelope consistente con soporte de paginación.
3. **Documentación Swagger** — todos los endpoints documentados con `@nestjs/swagger`.

Google OAuth2 queda fuera de este spec (spec separado).

---

## 2. Packages a instalar

### Dependencies
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt \
  @nestjs/config @prisma/client \
  bcrypt class-validator class-transformer \
  @nestjs/swagger swagger-ui-express \
  resend cookie-parser
```

### DevDependencies
```bash
npm install -D prisma @types/bcrypt @types/passport-jwt @types/cookie-parser
```

---

## 3. Variables de entorno

Añadir a `src/soccer-pool-api/.env` y documentar en `.env.example`:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/soccer_pool"
JWT_SECRET="super-secret-access-jwt-key"
JWT_REFRESH_SECRET="super-secret-refresh-jwt-key"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
RESEND_API_KEY="re_xxxxxxxxxxxx"
FRONTEND_URL="http://localhost:3000"
PORT=3001
```

---

## 4. Prisma Schema

Archivo: `src/soccer-pool-api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  password            String
  name                String
  phone               String?
  isEmailVerified     Boolean   @default(false)
  emailVerifyToken    String?   @unique
  emailVerifyExpiry   DateTime?
  hashedRefreshToken  String?
  whatsappOptIn       Boolean   @default(false)
  whatsappOptOut      Boolean   @default(false)
  whatsappVerified    Boolean   @default(false)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@map("users")
}
```

Migración inicial: `npx prisma migrate dev --name init-users`

---

## 5. Formato de Respuesta Estándar

### 5.1 Success Response Envelope

```typescript
// Respuesta exitosa (sin paginación)
{
  "success": true,
  "statusCode": 200,
  "message": "Login exitoso",
  "data": { ... }
}

// Respuesta exitosa (con paginación)
{
  "success": true,
  "statusCode": 200,
  "message": "Usuarios obtenidos",
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 5.2 Error Response Envelope

```typescript
{
  "success": false,
  "statusCode": 401,
  "message": "Credenciales inválidas",
  "error": "Unauthorized"
}
```

### 5.3 Interfaces TypeScript

```typescript
// src/common/interfaces/api-response.interface.ts

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error: string;
}
```

### 5.4 ResponseInterceptor

Archivo: `src/common/interceptors/response.interceptor.ts`

- Implementa `NestInterceptor`
- Envuelve `data` retornado por cualquier handler en `ApiSuccessResponse`
- Si el handler retorna un objeto con propiedad `meta`, lo extrae al nivel raíz
- Usa el `statusCode` del `HttpContext` como `statusCode` en el envelope
- Se registra globalmente en `main.ts` con `app.useGlobalInterceptors()`

### 5.5 AllExceptionsFilter

Archivo: `src/common/filters/all-exceptions.filter.ts`

- Implementa `ExceptionFilter`
- Captura `HttpException` y cualquier otro `Error`
- Retorna siempre `ApiErrorResponse`
- Para errores no-HTTP usa `500` como statusCode y mensaje genérico
- Se registra globalmente en `main.ts` con `app.useGlobalFilters()`

---

## 6. Módulo de Autenticación

### Estructura de archivos

```
src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.repository.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── jwt-refresh.strategy.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   └── jwt-refresh.guard.ts
├── decorators/
│   └── current-user.decorator.ts
└── dto/
    ├── register.dto.ts
    ├── login.dto.ts
    └── verify-email.dto.ts
```

### 6.1 DTOs

#### RegisterDto
```typescript
{
  name: string;       // @IsString, @MinLength(2), @MaxLength(80)
  email: string;      // @IsEmail
  password: string;   // @IsString, @MinLength(8), @Matches(/(?=.*[A-Z])(?=.*[0-9])/)
}
```

#### LoginDto
```typescript
{
  email: string;      // @IsEmail
  password: string;   // @IsString
}
```

#### VerifyEmailDto
```typescript
{
  token: string;      // @IsString, @IsNotEmpty
}
```

---

## 7. API Contract

### Base path: `/auth`

---

### POST /auth/register

**Descripción:** Registra un nuevo usuario y envía email de verificación.

**Request Body:**
```json
{
  "name": "Ivan Sanchez",
  "email": "ivan@example.com",
  "password": "MyPass123"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Usuario registrado. Revisa tu email para verificar tu cuenta.",
  "data": {
    "id": "clx123...",
    "email": "ivan@example.com",
    "name": "Ivan Sanchez",
    "isEmailVerified": false,
    "createdAt": "2026-04-11T00:00:00Z"
  }
}
```

**Error Responses:**
- `409 Conflict` — email ya registrado
- `400 Bad Request` — validación de DTO falla

**Lógica:**
1. Verificar que el email no exista → `409` si existe
2. Hashear password con `bcrypt` (rounds: 12)
3. Generar `emailVerifyToken` con `crypto.randomBytes(32).toString('hex')`
4. Setear `emailVerifyExpiry = now + 24h`
5. Guardar usuario en DB
6. Enviar email de verificación via Resend con el link `{FRONTEND_URL}/verify-email?token={token}`
7. Retornar usuario (sin password ni tokens)

---

### POST /auth/verify-email

**Descripción:** Verifica el email del usuario con el token enviado por correo.

**Request Body:**
```json
{
  "token": "abc123def456..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verificado exitosamente.",
  "data": {
    "id": "clx123...",
    "email": "ivan@example.com",
    "isEmailVerified": true
  }
}
```

**Error Responses:**
- `400 Bad Request` — token inválido o expirado

**Lógica:**
1. Buscar usuario por `emailVerifyToken`
2. Verificar que `emailVerifyExpiry > now` → `400` si expirado
3. Setear `isEmailVerified = true`, limpiar `emailVerifyToken` y `emailVerifyExpiry`
4. Retornar usuario actualizado

---

### POST /auth/login

**Descripción:** Autentica usuario y retorna access token. Setea refresh token en cookie httpOnly.

**Request Body:**
```json
{
  "email": "ivan@example.com",
  "password": "MyPass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login exitoso.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clx123...",
      "email": "ivan@example.com",
      "name": "Ivan Sanchez",
      "isEmailVerified": true
    }
  }
}
```

**Cookie seteada:**
```
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

**Error Responses:**
- `401 Unauthorized` — credenciales incorrectas
- `403 Forbidden` — email no verificado

**Lógica:**
1. Buscar usuario por email → `401` si no existe
2. Comparar password con bcrypt → `401` si no coincide
3. Verificar `isEmailVerified === true` → `403` si no
4. Generar `accessToken` (JWT, 15min, payload: `{ sub: userId, email }`)
5. Generar `refreshToken` (JWT, 7d, payload: `{ sub: userId }`)
6. Hashear el refreshToken con bcrypt y guardar en `hashedRefreshToken`
7. Setear cookie `refresh_token` httpOnly
8. Retornar `accessToken` + datos del usuario

---

### POST /auth/refresh

**Descripción:** Usa el refresh token de la cookie para emitir un nuevo access token (token rotation).

**Headers:** Cookie con `refresh_token`

**Request Body:** vacío

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token renovado.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Cookie actualizada:**
```
Set-Cookie: refresh_token=<new_jwt>; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

**Error Responses:**
- `401 Unauthorized` — cookie ausente, token inválido o revocado

**Lógica (Refresh Token Rotation):**
1. Extraer `refresh_token` de la cookie via `JwtRefreshStrategy`
2. Buscar usuario por `sub` del JWT
3. Verificar que `hashedRefreshToken` no sea null → `401` si es null (logout previo)
4. Comparar el token de la cookie con `hashedRefreshToken` via bcrypt → `401` si no coincide
5. Generar nuevo `accessToken` y nuevo `refreshToken`
6. Actualizar `hashedRefreshToken` en DB
7. Setear nueva cookie `refresh_token`
8. Retornar nuevo `accessToken`

---

### POST /auth/logout

**Descripción:** Invalida el refresh token del usuario y limpia la cookie.

**Guards:** `JwtAuthGuard` (requiere access token válido)

**Request Body:** vacío

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Sesión cerrada.",
  "data": null
}
```

**Lógica:**
1. Obtener `userId` del JWT via `@CurrentUser()`
2. Setear `hashedRefreshToken = null` en DB
3. Limpiar cookie `refresh_token` (Max-Age: 0)

---

### GET /auth/me

**Descripción:** Retorna los datos del usuario autenticado.

**Guards:** `JwtAuthGuard`

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Perfil obtenido.",
  "data": {
    "id": "clx123...",
    "email": "ivan@example.com",
    "name": "Ivan Sanchez",
    "isEmailVerified": true,
    "whatsappOptIn": false,
    "createdAt": "2026-04-11T00:00:00Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized` — access token ausente o expirado

---

## 8. Repository Methods

Archivo: `src/auth/auth.repository.ts`

```typescript
findByEmail(email: string): Promise<User | null>
findById(id: string): Promise<User | null>
findByEmailVerifyToken(token: string): Promise<User | null>

create(data: {
  email: string;
  password: string;
  name: string;
  emailVerifyToken: string;
  emailVerifyExpiry: Date;
}): Promise<User>

verifyEmail(id: string): Promise<User>
// Sets isEmailVerified=true, clears emailVerifyToken and emailVerifyExpiry

updateHashedRefreshToken(id: string, hashedToken: string | null): Promise<void>
```

---

## 9. JWT Strategies

### JwtStrategy (access token)

- `ExtractJwt.fromAuthHeaderAsBearerToken()`
- Secret: `JWT_SECRET`
- `ignoreExpiration: false`
- `validate(payload)` → retorna `{ userId: payload.sub, email: payload.email }`

### JwtRefreshStrategy (refresh token desde cookie)

- `ExtractJwt.fromExtractors([(req) => req?.cookies?.refresh_token])`
- Secret: `JWT_REFRESH_SECRET`
- `ignoreExpiration: false`
- `validate(payload, req)` → retorna `{ userId: payload.sub, refreshToken: req.cookies.refresh_token }`
- Requiere `passReqToCallback: true`

---

## 10. Decorator @CurrentUser

Archivo: `src/auth/decorators/current-user.decorator.ts`

```typescript
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user[data] : request.user;
  },
);
```

---

## 11. Swagger Setup

Archivo: `src/main.ts` — configurar antes de `app.listen()`:

```typescript
const config = new DocumentBuilder()
  .setTitle('Soccer Pool API')
  .setDescription('API para el sistema de quinielas de fútbol')
  .setVersion('1.0')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'access-token',
  )
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

**Acceso:** `http://localhost:3001/api/docs`

### Decoradores requeridos por endpoint

Todos los endpoints del `AuthController` deben tener:
- `@ApiTags('auth')`
- `@ApiOperation({ summary: '...' })`
- `@ApiResponse({ status: 201, description: '...', type: ... })`
- `@ApiResponse({ status: 4xx, description: '...' })`
- Endpoints protegidos: `@ApiBearerAuth('access-token')`

### ApiResponseDto

Crear `src/common/dto/api-response.dto.ts` con clases decoradas con `@ApiProperty` para que Swagger genere los schemas correctos del envelope.

---

## 12. Configuración global en main.ts

```typescript
// Pipes
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));

// Interceptor
app.useGlobalInterceptors(new ResponseInterceptor());

// Filter
app.useGlobalFilters(new AllExceptionsFilter());

// Cookie parser
app.use(cookieParser());

// CORS
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

---

## 13. Acceptance Criteria

### AC-1: Registro

**Given** un email no registrado y password válido  
**When** POST /auth/register  
**Then** usuario creado con `isEmailVerified=false`, email enviado, `201` con envelope estándar

**Given** un email ya registrado  
**When** POST /auth/register  
**Then** `409` con envelope de error estándar

**Given** password sin mayúscula o sin número  
**When** POST /auth/register  
**Then** `400` con errores de validación

---

### AC-2: Verificación de email

**Given** token válido y no expirado  
**When** POST /auth/verify-email  
**Then** `isEmailVerified=true`, token limpiado, `200` con envelope estándar

**Given** token expirado (más de 24h)  
**When** POST /auth/verify-email  
**Then** `400` con mensaje "Token expirado o inválido"

---

### AC-3: Login

**Given** email verificado y credenciales correctas  
**When** POST /auth/login  
**Then** `200`, `accessToken` en body, `refresh_token` en cookie httpOnly

**Given** email no verificado  
**When** POST /auth/login  
**Then** `403` con mensaje "Verifica tu email antes de iniciar sesión"

**Given** password incorrecto  
**When** POST /auth/login  
**Then** `401` — mismo mensaje que "usuario no encontrado" (no revelar cuál falló)

---

### AC-4: Refresh

**Given** cookie `refresh_token` válida y no revocada  
**When** POST /auth/refresh  
**Then** nuevo `accessToken` en body, nueva cookie `refresh_token` (rotation)

**Given** cookie ausente o token inválido  
**When** POST /auth/refresh  
**Then** `401`

---

### AC-5: Logout

**Given** access token válido  
**When** POST /auth/logout  
**Then** `hashedRefreshToken=null` en DB, cookie limpiada, `200`

---

### AC-6: Response Envelope

**Given** cualquier endpoint exitoso  
**When** responde con datos  
**Then** el body siempre tiene `{ success: true, statusCode, message, data }`

**Given** cualquier error HTTP  
**When** se lanza excepción  
**Then** el body siempre tiene `{ success: false, statusCode, message, error }`

---

### AC-7: Swagger

**Given** servidor corriendo  
**When** GET /api/docs  
**Then** UI de Swagger accesible con todos los endpoints documentados y autenticación Bearer funcional

---

## 14. Módulos NestJS afectados

| Módulo | Archivo | Acción |
|--------|---------|--------|
| `PrismaModule` | `src/prisma/` | Crear nuevo |
| `CommonModule` | `src/common/` | Crear nuevo (interceptor, filter, interfaces) |
| `AuthModule` | `src/auth/` | Crear nuevo |
| `AppModule` | `src/app.module.ts` | Registrar PrismaModule, ConfigModule, AuthModule |
| `main.ts` | `src/main.ts` | Pipes globales, Swagger, CORS, cookie-parser |

---

## 15. Definition of Done

All items must be checked before this spec is considered complete.

### Infrastructure
- [x] `prisma/schema.prisma` exists with `User` model and all fields defined in §4
- [ ] Initial migration applied successfully (`npx prisma migrate dev --name init-users`) — **run manually**
- [x] `PrismaModule` is global and injected into `AuthModule`
- [x] `ConfigModule` is global and loads all env vars from §3
- [x] All env vars from §3 are documented in `.env.example`

### Standard Response
- [x] `ResponseInterceptor` wraps every successful response in `{ success, statusCode, message, data, meta? }`
- [x] `AllExceptionsFilter` returns `{ success: false, statusCode, message, error }` for all thrown exceptions
- [x] Both are registered globally in `main.ts`
- [ ] A raw 404 (route not found) is also caught by `AllExceptionsFilter` — **verify manually**
- [x] Paginated responses include `meta.page`, `meta.limit`, `meta.total`, `meta.totalPages`

### Auth — Register
- [x] `POST /auth/register` returns `201` with standard envelope
- [x] Password is hashed with bcrypt rounds=12 before storing
- [x] `emailVerifyToken` is generated with `crypto.randomBytes(32).toString('hex')`
- [x] `emailVerifyExpiry` is set to `now + 24h`
- [x] Verification email is sent via Resend with link `{FRONTEND_URL}/verify-email?token={token}`
- [x] Duplicate email returns `409` with standard error envelope
- [x] Password without uppercase or digit returns `400` with validation errors
- [x] Response never exposes `password`, `hashedRefreshToken`, `emailVerifyToken`

### Auth — Verify Email
- [x] `POST /auth/verify-email` returns `200` and sets `isEmailVerified=true`
- [x] `emailVerifyToken` and `emailVerifyExpiry` are cleared after successful verification
- [x] Expired token (>24h) returns `400`
- [x] Unknown token returns `400` — same message as expired (no token enumeration)

### Auth — Login
- [x] `POST /auth/login` returns `200` with `accessToken` in body
- [x] `refresh_token` cookie is `HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh`
- [x] Cookie `Max-Age` is 604800 (7 days)
- [x] Unverified email returns `403`
- [x] Wrong password returns `401` — same message as "user not found" (no user enumeration)
- [x] `hashedRefreshToken` stored in DB is a bcrypt hash, not the raw JWT

### Auth — Refresh (Token Rotation)
- [x] `POST /auth/refresh` issues a new `accessToken` and a new `refresh_token` cookie
- [x] Old `hashedRefreshToken` is replaced in DB on every refresh (rotation)
- [x] Missing or invalid cookie returns `401`
- [ ] Token that was already rotated (replayed) returns `401` — **verify manually**

### Auth — Logout
- [x] `POST /auth/logout` sets `hashedRefreshToken=null` in DB
- [x] `refresh_token` cookie is cleared (`Max-Age=0`)
- [x] Requires valid `JwtAuthGuard` — missing access token returns `401`

### Auth — Me
- [x] `GET /auth/me` returns current user data with `200`
- [x] Response never includes `password` or `hashedRefreshToken`
- [x] Missing or expired access token returns `401`

### Validation
- [x] `ValidationPipe` is global with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- [x] Extra fields in any request body are stripped/rejected
- [x] `RegisterDto` enforces `@MinLength(8)` and password regex
- [x] `LoginDto` enforces `@IsEmail`

### Swagger
- [x] Swagger UI configured at `GET /api/docs`
- [x] All 6 endpoints documented under `auth` tag
- [x] Bearer auth (`access-token`) configured in Swagger
- [x] Each endpoint has `@ApiOperation` and `@ApiResponse` for success and error cases
- [x] Request body schemas rendered from DTOs
- [ ] Swagger UI accessible — **verify manually after `npm run start:dev`**

### Security
- [x] `CORS` only allows origin from `FRONTEND_URL` env var
- [x] `cookie-parser` middleware registered before any route handler
- [x] No `any` types anywhere in the auth module
- [x] No Prisma calls in `AuthController` or `AuthService` — only in `AuthRepository`

---

## 17. Orden de implementación

1. **@db-designer** — Crear `prisma/schema.prisma` con modelo `User` + migración inicial
2. **@backend-dev** — `PrismaModule` + `CommonModule` (interceptor, filter, interfaces, DTOs de respuesta)
3. **@backend-dev** — `AuthModule` completo (repository, service, controller, strategies, guards, decorators)
4. **@backend-dev** — Actualizar `main.ts` con Swagger, pipes globales, CORS, cookie-parser

---

## 18. Dependencias / Blockers

- Requiere PostgreSQL corriendo localmente (Docker recomendado) para ejecutar la migración
- Requiere cuenta en Resend y `RESEND_API_KEY` válida para enviar emails de verificación
- Template de email de verificación es plain HTML en línea (no React Email en este spec — queda para spec futuro)
