---
description: Manually trigger a football API sync for a specific competition or date. Useful for debugging sync issues. Usage: /sync-matches [competition-code] [date YYYY-MM-DD]
allowed-tools: Read, Bash
---

# Manual Match Sync: $ARGUMENTS

Trigger a manual sync of match data from football-data.org.

## Parse arguments
Arguments: `$ARGUMENTS`
- Competition code (WC, CL, PL, PD, BL1, SA, FL1) → sync that competition
- Date (YYYY-MM-DD) → sync matches for that date
- Both → filter by competition and date

## Check backend is running
```bash
curl -s http://localhost:3001/health \
  || echo "Backend not running. Start it: cd src/soccer-pool-api && npm run start:dev"
```

## Trigger sync
```bash
# Sync all currently live matches
curl -X POST http://localhost:3001/admin/sync/live \
  -H "Content-Type: application/json"

# Sync specific competition
curl -X POST http://localhost:3001/admin/sync/competition \
  -H "Content-Type: application/json" \
  -d '{"code": "CL"}'

# Sync by date
curl -X POST http://localhost:3001/admin/sync/date \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-06-15"}'
```

## Inspect results
```bash
cd src/soccer-pool-api
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.match.findMany({
  where: { utcDate: { gte: new Date(Date.now() - 86400000) } },
  orderBy: { utcDate: 'asc' },
  take: 20,
  select: { externalId: true, homeTeam: true, awayTeam: true, status: true, homeScore: true, awayScore: true, utcDate: true }
}).then(ms => { console.table(ms); process.exit(); });
"
```

## Rate limit note
football-data.org free tier: **10 requests/minute**.
If you get 429 errors, wait 60 seconds before retrying.

## Competition IDs reference
| Code | Competition | ID |
|------|-------------|----|
| WC | FIFA World Cup | 2000 |
| CL | Champions League | 2001 |
| PL | Premier League | 2021 |
| PD | La Liga | 2014 |
| BL1 | Bundesliga | 2002 |
| SA | Serie A | 2019 |
| FL1 | Ligue 1 | 2015 |
