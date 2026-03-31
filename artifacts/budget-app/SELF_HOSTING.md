# Self-Hosting Guide — Yosan AI

This guide covers running Yosan AI on your own infrastructure (TrueNAS SCALE, Unraid, bare-metal Linux, etc.).

---

## Prerequisites

- Docker 24+ and Docker Compose v2 (for the recommended path)
- **Or** Node.js 22+ and pnpm 9+ (for the bare-metal path)
- A writable directory for persistent data and uploads

---

## Quick Start — Docker Compose (recommended)

### 1. Create a project folder

```bash
mkdir yosan-ai && cd yosan-ai
```

### 2. Copy the app files

Clone or download the `artifacts/budget-app/` directory into this folder, or copy only these files:

```
Dockerfile
docker-compose.yml
package.json
pnpm-lock.yaml
prisma/
src/
public/
next.config.ts
tsconfig.json
```

### 3. Create a `.env` file

```bash
# Required
JWT_SECRET=<at-least-32-random-characters>
ENCRYPTION_KEY=<at-least-32-random-characters>
CRON_SECRET=<at-least-32-random-characters>

# Optional
PORT=24432
```

Generate secure values:
```bash
openssl rand -hex 32   # run once per variable
```

### 4. Build and start

```bash
docker compose up -d --build
```

The first start automatically runs database migrations before the app comes up.

### 5. Open the setup wizard

Navigate to `http://<your-host>:24432/setup` and complete the wizard (admin account → AI provider → SMTP → first budget).

---

## TrueNAS SCALE — Custom Apps

TrueNAS SCALE uses Docker Compose under the hood for Custom Apps.

1. Go to **Apps → Discover Apps → Custom App**.
2. Paste or upload your `docker-compose.yml`.
3. Add environment variable entries for `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, and optionally `PORT`.
4. Map persistent host paths (or let TrueNAS manage named volumes) for `/app/data` and `/app/uploads`.
5. Click **Install** and wait for the container health check to pass.
6. Open `http://<truenas-ip>:24432/setup` to complete setup.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes (set by Compose) | `file:/app/data/budget.db` | SQLite path — do not change unless you know what you're doing |
| `JWT_SECRET` | **Yes** | — | Signs session tokens — use 32+ random characters |
| `ENCRYPTION_KEY` | **Yes** | falls back to `JWT_SECRET` | AES-256 key for encrypting stored SMTP passwords and AI API keys |
| `CRON_SECRET` | **Yes** | — | Bearer token that authenticates `/api/cron/alerts` requests |
| `PORT` | No | `24432` | HTTP port the app listens on |
| `UPLOAD_DIR` | No | `/app/uploads` | Directory for uploaded receipt images |
| `NODE_ENV` | No | `production` | Set by the Dockerfile — do not override |

> **Security note:** `ENCRYPTION_KEY` and `CRON_SECRET` are critical for production use.
> Losing `ENCRYPTION_KEY` means stored SMTP/AI passwords can no longer be decrypted.

---

## Persistent Volumes

The app writes to two directories inside the container. Mount these as persistent volumes:

| Container path | Contents |
|---|---|
| `/app/data` | SQLite database (`budget.db`) |
| `/app/uploads` | Uploaded receipt images |

The `docker-compose.yml` creates named Docker volumes (`yosan_data`, `yosan_uploads`) automatically.
For TrueNAS or other hosts where you want bind mounts to a specific host path, replace the volume entries:

```yaml
volumes:
  - /mnt/tank/yosan/data:/app/data
  - /mnt/tank/yosan/uploads:/app/uploads
```

---

## Cron Alert Scheduling

The app exposes `/api/cron/alerts` for sending email alerts (overspending, upcoming bills, payday reminders, cash flow deficit warnings, savings goal risks, and receipt reminders).

### Authentication

Every cron request **must** include the `CRON_SECRET` as a Bearer token:

```
Authorization: Bearer <CRON_SECRET>
```

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

### Recommended cron schedule (system cron or TrueNAS Tasks)

Run all alert types once daily:
```cron
0 8 * * *  curl -sf -X POST http://localhost:24432/api/cron/alerts \
             -H "Authorization: Bearer YOUR_CRON_SECRET" \
             -H "Content-Type: application/json" \
             -d '{"type":"all"}'
```

Or use finer-grained timing:
```cron
# Overspending + bills — daily at 08:00
0 8 * * *   curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"overspending"}'

# Bill reminders — daily at 08:05
5 8 * * *   curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"bills"}'

# Payday reminder — daily at 08:10
10 8 * * *  curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"payday"}'

# Cash flow deficit risk — daily at 08:15
15 8 * * *  curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"deficit_risk"}'

# Weekly digest — Sundays at 09:00
0 9 * * 0   curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"weekly"}'

# Receipt reminder — Mondays at 09:00
0 9 * * 1   curl -sf -X POST http://localhost:24432/api/cron/alerts \
              -H "Authorization: Bearer YOUR_CRON_SECRET" \
              -H "Content-Type: application/json" \
              -d '{"type":"receipt_reminder"}'
```

### TrueNAS SCALE (System Settings → Advanced → Cron Jobs)

1. Go to **System Settings → Advanced → Cron Jobs → Add**.
2. Set **Command** to the `curl` command above (with your full URL and CRON_SECRET).
3. Set **Schedule** using the cron expression (e.g. `0 8 * * *`).
4. Set **Run As User** to `root` or a user with `curl` access.

### Manual trigger (testing)

```bash
curl -X POST http://localhost:24432/api/cron/alerts \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'
```

---

## Upgrading

1. Pull or copy the new app files into your project folder.
2. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```
3. The container entrypoint runs `prisma migrate deploy` automatically on startup, applying any new migrations without touching your data.

---

## Database Backup

Back up these paths regularly:

| Path | Contents |
|---|---|
| `/app/data/budget.db` | All budget, expense, and settings data |
| `/app/uploads/` | Uploaded receipt images |

SQLite hot backup (safe while the app is running):
```bash
docker exec <container_name> sqlite3 /app/data/budget.db ".backup /app/data/budget.db.bak"
```

Or copy the volume directory directly with the container running — SQLite WAL mode makes this safe.

---

## Bare-Metal (Node.js)

If you prefer not to use Docker:

1. Install Node.js 22+ and pnpm 9+.
2. Copy the app files into a directory.
3. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
4. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```
5. Create a `.env` file with the environment variables listed above.
6. Run migrations:
   ```bash
   DATABASE_URL="file:./data/budget.db" npx prisma migrate deploy
   ```
7. Build:
   ```bash
   pnpm run build
   ```
8. Start:
   ```bash
   PORT=24432 pnpm run start
   ```
