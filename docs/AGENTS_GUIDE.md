# Agents & Spec-Driven Development Guide
## Soccer Pool

---

## What are sub-agents in Claude Code?

Sub-agents are specialized Claude instances that run in their **own context window**, separate from your main session. Each has:
- A specific role and system prompt
- Access only to the tools it needs
- A fresh context (no pollution from your main conversation)

This solves the biggest problem with AI coding agents: **context fills up and Claude starts making mistakes**. With sub-agents, the orchestrator (you or the main agent) stays lightweight and delegates heavy work to specialists.

---

## Available Sub-agents

| Agent | When to use | How to invoke |
|-------|-------------|---------------|
| `@architect` | Design a new module, review architectural decisions | `@architect design the rankings module` |
| `@spec-writer` | Write a spec before implementing anything | `/spec pool invite system` |
| `@backend-dev` | Implement NestJS modules with Repository Pattern | `@backend-dev implement the groups module` |
| `@frontend-dev` | Create Next.js pages, shadcn components, Zustand stores | `@frontend-dev create the leaderboard page` |
| `@db-designer` | Add Prisma models, indexes, migrations | `@db-designer add whatsappOptIn to User` |
| `@api-tester` | Test endpoints, write e2e tests | `@api-tester test all auth endpoints` |
| `@whatsapp-dev` | WhatsApp Cloud API integration | `@whatsapp-dev implement the opt-in webhook` |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/spec <feature>` | Start spec-driven development — writes the spec first |
| `/implement <spec-file>` | Implement a feature from its spec using sub-agents |
| `/new-module <name>` | Scaffold a NestJS module with Repository Pattern files |
| `/sync-matches [code] [date]` | Manual trigger for football API sync |

---

## Spec-Driven Development (SDD) Workflow

This is the correct flow. **Never skip the spec step.**

```
1. /spec <feature description>
   └─ @spec-writer reads the codebase and writes docs/specs/YYYY-MM-DD-feature.md

2. You review the spec
   └─ Does it make sense? Any missing edge cases? Is the schema correct?
   └─ Approve by changing: Status: Draft → Status: Approved

3. /implement docs/specs/YYYY-MM-DD-feature.md
   └─ Orchestrator reads the spec
   └─ Delegates in parallel using the Task tool:
       ├─ @db-designer → schema migration (runs first if needed)
       ├─ @backend-dev → API endpoints + repository methods
       └─ @frontend-dev → pages + shadcn components + Zustand stores
   └─ @api-tester → validates everything at the end

4. Review diffs and merge
```

### Step-by-step example

```bash
# 1. Start with a feature request
/spec user authentication with JWT and Google OAuth

# Claude Code writes docs/specs/2025-XX-XX-authentication.md
# Open it in your editor and review it

# 2. Approve the spec (edit the file or tell Claude)
# Status: Approved

# 3. Implement
/implement docs/specs/2025-XX-XX-authentication.md

# Claude orchestrates:
# → @db-designer adds OAuth fields to User model
# → @backend-dev implements AuthModule (controller/service/repository)
# → @frontend-dev creates login page + useAuthStore
# → @api-tester tests POST /auth/login, /auth/register, /auth/google
```

---

## Repository Pattern Quick Reference

Every NestJS module has 4 layers — this is mandatory:

```
Controller  →  receives HTTP request, validates DTO, calls Service
Service     →  enforces business rules, calls Repository
Repository  →  executes ALL Prisma queries for this module
Prisma      →  database
```

**Never call Prisma from a Controller or directly from a Service.**

---

## State Management Quick Reference

| State type | Where it lives | Examples |
|------------|----------------|---------|
| Auth state | Zustand (`stores/auth.store.ts`) | user, accessToken |
| UI state | Zustand (`stores/ui.store.ts`) | sidebar open, active tab |
| Server data | TanStack Query hooks | matches, predictions, leaderboard |
| Form state | react-hook-form | prediction form inputs |
| Component state | useState | modal open/closed |

---

## Effective Agent Prompts

### Designing something new
```
@architect I need to design the points calculation system. Currently 3 pts for exact
score and 1 pt for correct result. I want each pool to be configurable. How do we
structure this without breaking existing pools?
```

### Implementing a module
```
@backend-dev implement the GroupsModule following the spec at
docs/specs/2025-01-15-groups.md. Start with the repository layer, then service,
then controller. Commit after each layer. Make sure the invite code generation
uses nanoid and is 8 characters.
```

### Debugging
```
@api-tester POST /predictions is returning 403 when match status is SCHEDULED
(not IN_PLAY). Check PredictionsService.create() and find why it is rejecting
valid predictions for upcoming matches.
```

### Frontend state
```
@frontend-dev create the pool detail page at app/pools/[poolId]/page.tsx.
It should display the leaderboard using useLeaderboard() hook from TanStack Query,
and update in real-time via socket 'ranking:updated' event. Store the active
poolId in usePoolStore.
```

---

## Project Folder Structure

```
soccer-pool/
├── CLAUDE.md
├── src/
│   ├── soccer-pool-api/       ← NestJS backend
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.repository.ts   ← Repository Pattern
│   │   │   │   └── dto/
│   │   │   ├── users/
│   │   │   ├── groups/
│   │   │   ├── matches/
│   │   │   ├── predictions/
│   │   │   ├── rankings/
│   │   │   ├── notifications/
│   │   │   └── football-api/
│   │   └── prisma/
│   │       └── schema.prisma
│   └── soccer-pool/           ← Next.js frontend
│       ├── app/
│       │   ├── (auth)/
│       │   ├── dashboard/
│       │   ├── pools/
│       │   └── ranking/
│       ├── components/
│       │   └── ui/            ← shadcn/ui components
│       ├── stores/            ← Zustand stores
│       │   ├── auth.store.ts
│       │   ├── pool.store.ts
│       │   └── socket.store.ts
│       ├── hooks/             ← TanStack Query hooks
│       │   ├── use-matches.ts
│       │   ├── use-predictions.ts
│       │   └── use-leaderboard.ts
│       └── lib/
│           ├── api.ts         ← centralized API client
│           └── socket.ts      ← Socket.io singleton
├── .claude/
│   ├── agents/                ← sub-agent definitions
│   └── commands/              ← slash commands
└── docs/
    ├── AGENTS_GUIDE.md        ← this file
    └── specs/                 ← generated specs (spec-first!)
```

---

## Tips for Effective Claude Code Sessions

1. **Plan mode first** — run `claude --plan` before implementing something large
2. **Fresh context** — if a session is long, open a new one and reference files with `@`
3. **One agent per task** — don't ask `@backend-dev` to also do the frontend
4. **Read commits** — each sub-agent commits when done: `git log --oneline`
5. **Specs are documentation** — `docs/specs/` with `Status: Done` is your decision history
6. **Background agents** — press `Ctrl+B` to send a long-running agent to background while you continue working
