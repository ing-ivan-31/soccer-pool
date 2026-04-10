---
description: Implement a feature from an approved spec file using sub-agents. Each task runs in its own context window and commits when complete. Usage: /implement <path-to-spec>
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Implement from Spec: $ARGUMENTS

You are the orchestrator. Your job is to coordinate sub-agents — you do NOT write implementation code yourself.

## Step 1 — Validate the spec
Read: `$ARGUMENTS`

Check:
- [ ] Status is "Draft" or "Approved" (not "In Progress" or "Done")
- [ ] Acceptance criteria are clear and testable
- [ ] API contract has request/response schemas
- [ ] Repository methods are listed
- [ ] Business rules are explicit

If the spec is incomplete, stop and ask the developer to complete it.

## Step 2 — Mark as In Progress
Edit the spec: `**Status:** Draft` → `**Status:** In Progress`

## Step 3 — Delegate tasks using the Task tool

Follow dependency order. Run parallel tasks simultaneously where safe.

### If DB changes are needed → run FIRST (blocks everything else)
```
Task: @db-designer
Read spec at $ARGUMENTS.
Apply the schema changes described in "Database Changes".
Run migration and confirm success.
```

### Then in parallel (if no inter-dependencies)
```
Task: @backend-dev
Read spec at $ARGUMENTS.
Implement all endpoints listed in the API Contract.
Follow Repository Pattern: controller → service → repository.
Commit after each module: git add -A && git commit -m "feat(...): ..."

Task: @frontend-dev
Read spec at $ARGUMENTS.
Implement all pages and components listed in "Frontend Changes".
Update Zustand stores if listed in "State Management".
Add TanStack Query hooks for new endpoints.
Commit after each page: git add -A && git commit -m "feat(frontend/...): ..."
```

### After backend is complete
```
Task: @api-tester
Read spec at $ARGUMENTS.
Test every endpoint in the API Contract against the running dev server.
Verify all acceptance criteria pass.
Write e2e test file to src/soccer-pool-api/test/
```

## Step 4 — Final validation
Once all tasks complete:
1. `cd src/soccer-pool-api && npm run test:e2e` — all tests pass
2. `cd src/soccer-pool && npm run type-check` — zero TypeScript errors
3. Review git log to confirm commits from each agent

## Step 5 — Mark as Done
Edit the spec: `**Status:** In Progress` → `**Status:** Done`

Output a summary:
- What was implemented
- Commits made (with hashes)
- Any known issues or follow-up tasks
