# Self-Hosting Guide

This guide covers running the Budget App on your own infrastructure (TrueNAS SCALE, Unraid, bare-metal Linux, etc.).

## Prerequisites

- Node.js 20+ or Docker
- A writeable data directory for SQLite and file uploads

---

## Docker (recommended)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/budget-app run build

ENV DATABASE_URL=file:./data/budget.db
ENV PORT=24432
EXPOSE 24432
CMD ["pnpm", "--filter", "@workspace/budget-app", "run", "start"]
```

Mount persistent volumes:
```
/app/artifacts/budget-app/data    → SQLite database
/app/artifacts/budget-app/uploads → Receipt file uploads
```

Run migrations on first start (or after upgrades):
```bash
cd artifacts/budget-app && npx prisma migrate deploy
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | SQLite path, e.g. `file:./data/budget.db` |
| `JWT_SECRET` | Yes | — | Secret for session tokens (32+ random chars) |
| `PORT` | No | `3000` | HTTP port the app listens on |
| `UPLOAD_DIR` | No | `./uploads` | Directory for uploaded receipt files |
| `CRON_SECRET` | No* | — | Bearer token securing `/api/cron/alerts` |
| `ENCRYPTION_KEY` | No* | falls back to JWT_SECRET | AES key for encrypting SMTP/API passwords |

\* Required for production use.

---

## Cron Alert Scheduling

The app exposes `/api/cron/alerts` for sending email alerts (overspending, upcoming bills, payday reminders, cash flow deficit warnings, savings goal risks, and receipt reminders).

### Authentication

Every cron request **must** include the `CRON_SECRET` as a Bearer token:

```
Authorization: Bearer <CRON_SECRET>
```

Set `CRON_SECRET` to a long random string in your environment (e.g. `openssl rand -hex 32`).

### Alert types

| `type` value | What it sends |
|---|---|
| `all` | All alert types (default when type is omitted) |
| `overspending` | Per-category overspend alerts |
| `weekly` | Digest summary (honours per-user frequency: DAILY / WEEKLY / MONTHLY) |
| `bills` | Upcoming bill reminders (user-configurable lead days, default 3) |
| `payday` | Payday reminder (sent 1 day ahead) |
| `deficit_risk` | Cash flow deficit warning (balance approaching or below zero within 14 days) |
| `savings_goal_risk` | Savings goals less than 50% funded |
| `receipt_reminder` | No receipt uploaded in 7+ days |

### Schedule recommendations (system cron or TrueNAS Tasks)

Run **all** daily:
```cron
0 7 * * *   curl -sf -X POST https://budget.yourdomain.com/api/cron/alerts \
              -H "Authorization: Bearer $CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"all"}'
```

Or split by type for finer control:

```cron
# Overspending + bills check — daily at 08:00
0 8 * * *   curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"overspending"}'

# Bill reminders — daily at 08:05
5 8 * * *   curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"bills"}'

# Payday reminder — daily at 08:10
10 8 * * *  curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"payday"}'

# Deficit risk — daily at 08:15
15 8 * * *  curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"deficit_risk"}'

# Weekly digest — Sundays at 09:00 (also respects per-user DAILY/MONTHLY setting)
0 9 * * 0   curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"weekly"}'

# Receipt reminder — weekly on Mondays
0 9 * * 1   curl -sf -X POST https://budget.local:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"receipt_reminder"}'
```

### TrueNAS SCALE (System Settings → Advanced → Cron Jobs)

1. Go to **System Settings → Advanced → Cron Jobs → Add**.
2. Set **Command** to the `curl` command above (with your full URL and CRON_SECRET).
3. Set **Schedule** using the cron expression (e.g. `0 8 * * *`).
4. Enable **Run As User** = root (or a user with curl access).

### Manual trigger (testing)

```bash
curl -X POST http://localhost:24432/api/cron/alerts \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'
```

---

## First-Run Setup

1. Start the app and navigate to `http://<host>:<port>/setup`.
2. Complete the setup wizard: create admin account, configure AI provider, SMTP, and first budget.
3. Configure notification preferences per user under **Settings → Notifications**.
4. Add the cron job(s) above to your scheduler.

---

## Database Migrations

After upgrading, run:
```bash
cd artifacts/budget-app && DATABASE_URL="file:./data/budget.db" npx prisma migrate deploy
```

This applies any new migration files without resetting your data.

---

## Backup

Back up these paths regularly:
- `artifacts/budget-app/data/budget.db` — all budget data
- `artifacts/budget-app/uploads/` — receipt images

SQLite backup command:
```bash
sqlite3 data/budget.db ".backup data/budget.db.bak"
```
