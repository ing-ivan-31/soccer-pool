# Soccer Pool — Project Constitution

## Project Overview

Fullstack app for football prediction pools. Users predict match results for World Cup, Champions League, Liga MX, and other competitions. Groups compete on a live leaderboard. Real-time updates via WebSocket. Notifications via email (Resend) and WhatsApp (Meta Cloud API).

## Repository Structure

```
soccer-pool/
├── CLAUDE.md                        ← you are here
├── src/
│   ├── soccer-pool-api/             ← NestJS backend
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── competitions/
│   │   │   ├── matches/
│   │   │   ├── predictions/
│   │   │   ├── groups/
│   │   │   ├── rankings/
│   │   │   ├── notifications/
│   │   │   └── football-api/
│   │   └── prisma/
│   │       └── schema.prisma
│   └── soccer-pool/                 ← Next.js frontend
│       └── app/
│           ├── (auth)/
│           ├── dashboard/
│           ├── pools/
│           └── ranking/
├── .claude/
│   ├── agents/
│   └── commands/
└── docs/
    ├── AGENTS_GUIDE.md
    └── specs/
```

## Stack (do not change without discussion)

- **Backend:** NestJS 10 + TypeScript strict mode
- **Pattern:** Repository Pattern — every module has a repository layer between service and Prisma
- **ORM:** Prisma + PostgreSQL (Railway in prod, Docker locally)
- **Frontend:** Next.js 14 App Router + shadcn/ui + Tailwind CSS
- **State Management:** Zustand (global state) + TanStack Query (server state / cache)
- **Real-time:** Socket.io (NestJS Gateway + client)
- **Auth:** JWT (access 15min + refresh 7d httpOnly cookie) + Google OAuth2
- **Email:** Resend + React Email templates
- **WhatsApp:** Meta WhatsApp Cloud API (no SDK — native fetch to Graph API v19.0)
- **Football data:** api-football.com (api-sports.io) — free tier 100 req/day, paid from $10/mo
- **Deploy:** Railway (backend + postgres + frontend as separate services)
- **CI/CD:** GitHub Actions

## Backend — Repository Pattern (mandatory)

Every module follows this 4-layer structure:

```
src/groups/
├── groups.module.ts
├── groups.controller.ts      ← HTTP layer: routes, guards, DTOs
├── groups.service.ts         ← Business logic: rules, orchestration
├── groups.repository.ts      ← Data access: all Prisma calls live here
└── dto/
    ├── create-group.dto.ts
    └── update-group.dto.ts
```

**Rules:**

- Controllers never call Prisma directly — only the service
- Services never call Prisma directly — only the repository
- Repositories contain ALL database queries for that module
- Repositories are injected into services via constructor
- Cross-module data access: import the other module's repository or service, never Prisma directly

**Repository interface pattern:**

```typescript
// groups.repository.ts
@Injectable()
export class GroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { id } });
  }

  async findByInviteCode(code: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { inviteCode: code } });
  }

  async create(data: Prisma.GroupCreateInput): Promise<Group> {
    return this.prisma.group.create({ data });
  }

  async addMember(groupId: string, userId: string): Promise<GroupMember> {
    return this.prisma.groupMember.create({
      data: { groupId, userId, totalPoints: 0 },
    });
  }
}

// groups.service.ts
@Injectable()
export class GroupsService {
  constructor(private readonly groupsRepository: GroupsRepository) {}

  async joinGroup(userId: string, inviteCode: string): Promise<GroupMember> {
    const group = await this.groupsRepository.findByInviteCode(inviteCode);
    if (!group) throw new NotFoundException("Group not found");
    // business rule: check if already a member
    return this.groupsRepository.addMember(group.id, userId);
  }
}
```

## Frontend — Component & State Architecture

### shadcn/ui (mandatory, not NextUI)

- All UI built with shadcn/ui components (`npx shadcn-ui@latest add <component>`)
- Custom components extend shadcn primitives — never build from scratch what shadcn provides
- Tailwind CSS for styling — dark green theme with lime accent

### Zustand — Global State

```typescript
// stores/auth.store.ts
interface AuthState {
  user: User | null;
  accessToken: string | null;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ accessToken: token }),
  logout: () => set({ user: null, accessToken: null }),
}));
```

**What goes in Zustand (global client state):**

- Auth state (user, accessToken)
- Active pool/group selection
- WebSocket connection status
- UI preferences (sidebar open, theme)

**What goes in TanStack Query (server state):**

- Match lists, predictions, leaderboard data
- Anything fetched from the API with caching

### TanStack Query — Server State

```typescript
// hooks/use-matches.ts
export function useMatches(date: string) {
  return useQuery({
    queryKey: ["matches", date],
    queryFn: () => api.matches.getByDate(date),
    staleTime: 30_000,
  });
}
```

## Coding Conventions

### Backend (NestJS)

- Strict TypeScript — no `any` types anywhere
- DTOs use `class-validator` decorators — always validate inputs
- Constructor injection only — never property injection
- Use `@UseGuards(JwtAuthGuard)` on all protected routes
- Throw `HttpException` subclasses (`NotFoundException`, `ForbiddenException`, etc.), never raw `Error`
- Async everywhere — no sync blocking in request handlers
- Cron jobs live in the service they relate to, decorated with `@Cron()`
- Repositories use Prisma-generated types for all parameters
- No `any` types — use proper interfaces or Prisma-generated types

### Frontend (Next.js)

- Server Components by default — `'use client'` only when needed
- Server Components fetch data directly (no useEffect for initial load)
- Client mutations via `useMutation` from TanStack Query
- Socket.io connection managed in a single Context provider
- Never hardcode API URLs — always `process.env.NEXT_PUBLIC_API_URL`
- shadcn components for all UI — never mix libraries

### General

- Never commit `.env` files
- All environment variables documented in `.env.example`
- Never hardcoded api keys

## Environment Variables

```bash
# src/soccer-pool-api/.env
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
FOOTBALL_API_KEY="..."          # api-football.com (api-sports.io) key — free: 100 req/day, paid from $10/mo
RESEND_API_KEY="re_..."         # resend.com free tier
WA_TOKEN="EAAxxxxx..."          # Meta WhatsApp Cloud API token
WA_PHONE_ID="..."               # WhatsApp Phone Number ID
WA_VERIFY_TOKEN="..."           # custom string for webhook verification
FRONTEND_URL="http://localhost:3000"
PORT=3001

# src/soccer-pool/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_WS_URL="http://localhost:3001"
```

## Key Business Rules (enforce in code)

1. **Predictions lock** when match status becomes `IN_PLAY` or `PAUSED` — validate in `PredictionsService`
2. **Points:** 3 pts exact score, 1 pt correct result — configurable per group in `Group` model
3. **WhatsApp opt-in required** — never send WA messages if `whatsappOptIn = false` or `whatsappOptOut = true`
4. **One prediction per user per match per group** — DB unique constraint `@@unique([userId, matchId, groupId])`
5. **Group invite codes** — 8-character alphanumeric, unique, generated with `nanoid`
6. **Football API rate limit:** free tier 100 req/day, paid plans by minute — throttle all calls in `FootballApiService`. Cache aggressively: fixtures estáticos TTL largo, live scores TTL 15s.
7. **Match sync frequency:** every 60s when `IN_PLAY`, every 5min otherwise

## Prisma Schema Key Models

`User`, `Competition`, `Match`, `Group`, `GroupMember`, `Prediction`

- `Match.status`: `SCHEDULED | IN_PLAY | PAUSED | FINISHED | POSTPONED | CANCELLED`
- `User` fields: `phone?`, `whatsappOptIn`, `whatsappOptOut`, `whatsappVerified`
- Run `npx prisma migrate dev` after schema changes — never edit migrations manually

## Football API Quick Reference

Provider: **api-football.com** (api-sports.io)
Base URL: `https://v3.football.api-sports.io`
Header: `x-apisports-key: {FOOTBALL_API_KEY}`

Free tier: 100 req/day · Updates every 15s · All endpoints included · No credit card required
Paid: from $10/mo → thousands of req/day

World Cup 2026 IDs:

- League ID: `1` (World Cup) · Season: `2026`

Key endpoints:

- `GET /fixtures?league=1&season=2026&live=all` — partidos en vivo
- `GET /fixtures?league=1&season=2026&date=YYYY-MM-DD` — por fecha
- `GET /fixtures?id={id}` — partido específico
- `GET /fixtures/events?fixture={id}` — goles, tarjetas, sustituciones en tiempo real
- `GET /fixtures/lineups?fixture={id}` — alineaciones
- `GET /fixtures/statistics?fixture={id}` — posesión, tiros, corners
- `GET /standings?league=1&season=2026` — tabla de grupos
- `GET /players/squads?team={id}` — jugadores por selección
- `GET /teams?league=1&season=2026` — equipos participantes

## WhatsApp Integration Notes

- Webhook verification: `GET /webhooks/whatsapp` — return `hub.challenge` if token matches
- Incoming messages: `POST /webhooks/whatsapp` — handle `ACTIVAR` (opt-in) and `STOP` (opt-out)
- Only use pre-approved templates for business-initiated messages
- Approved templates: `match_reminder`, `match_result`, `ranking_leader`

## Common Commands

```bash
# Backend
cd src/soccer-pool-api
npm run start:dev
npx prisma studio
npx prisma migrate dev --name <description>
npm run test
npm run test:e2e

# Frontend
cd src/soccer-pool
npm run dev
npm run build
npm run type-check

# shadcn components
npx shadcn-ui@latest add button card badge input table

# Root
npm run lint               # eslint all packages
```

## Sub-agents Available (see .claude/agents/)

- `@architect` — system design, module planning, API contracts
- `@backend-dev` — NestJS + Repository Pattern implementation
- `@frontend-dev` — Next.js, shadcn/ui, Zustand, TanStack Query
- `@db-designer` — Prisma schema, migrations, index optimization
- `@api-tester` — endpoint testing, contract validation, e2e tests
- `@spec-writer` — writes specs before implementation begins
- `@whatsapp-dev` — WhatsApp Cloud API integration

## Spec-Driven Workflow

1. `/spec <feature>` → generates `docs/specs/YYYY-MM-DD-feature.md`
2. Review and approve the spec (change Status: Draft → Approved)
3. `/implement <spec-file>` → delegates to sub-agents with Task tool
4. Sub-agents commit after each task — review diffs before merging

## Rules (never break):

- Never implement a non-trivial feature without a spec. "Non-trivial" = anything touching auth, payments, data schema, or cross-module logic.
- Never run builds/tests yourself
- Never print full terminal output
- When build needed: "Please build and paste ONLY error section (max 50 lines)"
- When run test needed: "Please run test and confirm and paste ONLY error section (max 50 lines)"
- Never run git commands (status, diff, commit, push, etc.)
- I handle all version control manually
- Respond with minimal diffs only unless I ask for explanation
- Focus on one small task at a time
- Never drop database or empty a table alway ask first

<!-- autoskills:start -->

Summary generated by `autoskills`. Check the full files inside `.claude/skills`.

## Accessibility (a11y)

Audit and improve web accessibility following WCAG 2.2 guidelines. Use when asked to "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", or "make accessible".

- `.claude/skills/accessibility/SKILL.md`
- `.claude/skills/accessibility/references/A11Y-PATTERNS.md`: Practical, copy-paste-ready patterns for common accessibility requirements. Each pattern is self-contained and linked from the main [SKILL.md](../SKILL.md).
- `.claude/skills/accessibility/references/WCAG.md`

## Design Thinking

Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beaut...

- `.claude/skills/frontend-design/SKILL.md`

## SEO optimization

Optimize for search engine visibility and ranking. Use when asked to "improve SEO", "optimize for search", "fix meta tags", "add structured data", "sitemap optimization", or "search engine optimization".

- `.claude/skills/seo/SKILL.md`

<!-- autoskills:end -->
