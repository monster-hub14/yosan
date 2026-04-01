# Self-Hosting Guide — Yosan AI

This guide covers running Yosan AI on your own infrastructure (TrueNAS SCALE, Unraid, bare-metal Linux, Docker on any host, etc.).

---

## Prerequisites

- Docker 24+ and Docker Compose v2 (for the recommended path)
- **Or** Node.js 22+ and pnpm 9+ (for the bare-metal path)
- Two writable directories on your host for persistent data and uploads

---

## Quick Start — Docker Compose (recommended)

### 1. Get the app files

Clone the repository or download and extract the release archive:

```bash
git clone https://github.com/your-org/yosan-ai.git
cd yosan-ai
```

### 2. Create a `.env` file

```bash
# Required — generate each with: openssl rand -base64 48
JWT_SECRET=replace_me
ENCRYPTION_KEY=replace_me
CRON_SECRET=replace_me

# Optional — defaults shown
PORT=3000
```

### 3. Build and start

```bash
docker compose up -d --build
```

The first start automatically runs database migrations before the app comes up.

### 4. Open the setup wizard

Navigate to `http://<your-host>:3000/setup` and complete the wizard (admin account → AI provider → SMTP → first budget).

---

## Required Volume Mounts

The app writes to two directories inside the container. **You must mount these from your host** so data persists across container restarts and upgrades.

| Container path | Purpose |
|---|---|
| `/app/data` | SQLite database (`budget.db`) |
| `/app/uploads` | Uploaded receipt images |

> **The app defines the right side. You choose the left side.**
> Pick any host directory that suits your storage layout — the container paths (`/app/data`, `/app/uploads`) are fixed and must not change.

### Docker CLI example

```bash
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET=your_secret \
  -e ENCRYPTION_KEY=your_secret \
  -e CRON_SECRET=your_secret \
  -v /your/host/path/data:/app/data \
  -v /your/host/path/uploads:/app/uploads \
  yosan-ai
```

### docker-compose.yml — named volumes (default)

The default `docker-compose.yml` creates named Docker volumes automatically. Named volumes are managed by Docker and stored under `/var/lib/docker/volumes/`.

```yaml
volumes:
  - yosan_data:/app/data
  - yosan_uploads:/app/uploads
```

### docker-compose.yml — bind mounts (recommended for NAS / homelab)

For TrueNAS SCALE, Unraid, or any host where you want data on a specific path, replace the volume entries with bind mounts:

```yaml
services:
  yosan-ai:
    volumes:
      - /your/host/path/data:/app/data
      - /your/host/path/uploads:/app/uploads
```

Create the host directories before first start so Docker does not create them as root-owned:

```bash
mkdir -p /your/host/path/data /your/host/path/uploads
```

> **Mounted directories must be writable by the container user (uid 1001).**
> If the app cannot write to `/app/data` or `/app/uploads`, it will exit immediately with an error on startup.

With bind mounts, your data is just ordinary files on your storage — you can snapshot them with ZFS, back them up with Restic/Borg, or browse them with a file manager.

---

## TrueNAS SCALE — Custom Apps

TrueNAS SCALE uses Docker Compose under the hood for Custom Apps.

1. Go to **Apps → Discover Apps → Custom App**.
2. Paste or upload your `docker-compose.yml`.
3. Add environment variable entries for `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, and optionally `PORT`.
4. Under **Storage**, add two host path volumes:

   | Host path | Mount path in container | Read only |
   |---|---|---|
   | *(any writable path you choose)* | `/app/data` | No |
   | *(any writable path you choose)* | `/app/uploads` | No |

   Choose any host path that suits your storage layout — the container paths (`/app/data`, `/app/uploads`) are fixed; the host-side path is entirely up to you.

5. Click **Install** and wait for the container health check to pass.
6. Open `http://<truenas-ip>:3000/setup` to complete setup.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes (set by Compose) | `file:/app/data/budget.db` | SQLite path — do not change unless you know what you're doing |
| `JWT_SECRET` | **Yes** | — | Signs session tokens — use 32+ random characters |
| `ENCRYPTION_KEY` | **Yes** | falls back to `JWT_SECRET` | AES-256 key for encrypting stored SMTP passwords and AI API keys |
| `CRON_SECRET` | **Yes** | — | Bearer token that authenticates `/api/cron/alerts` and `/api/cron/gmail-sync` requests |
| `APP_BASE_URL` | Required for Gmail OAuth | auto-detected | Public HTTPS origin of your app — **must be HTTPS** (e.g. `https://yourdomain.com`). No path, no trailing slash. |
| `PORT` | No | `3000` | HTTP port the app listens on |
| `UPLOAD_DIR` | No | `/app/uploads` | Directory for uploaded receipt images |
| `EMAIL_LOGO_URL` | No | *(no logo)* | Public HTTPS URL for the logo image in outgoing emails |
| `NODE_ENV` | No | `production` | Set by the Dockerfile — do not override |

> **Security note:** `ENCRYPTION_KEY` and `CRON_SECRET` are critical for production use.
> Losing `ENCRYPTION_KEY` means stored SMTP/AI passwords can no longer be decrypted.
> Generate a fresh value per deployment — never share or reuse across installs.

> **Gmail OAuth note:** Without `APP_BASE_URL`, the app tries to detect its public URL from reverse-proxy headers.
> On Docker setups without a proxy, this typically resolves to an internal `http://` address — Google requires HTTPS and will reject the OAuth redirect.
> Always set `APP_BASE_URL=https://yourdomain.com` when using Gmail integration.

---

## Data Persistence Across Updates

**Your data is safe when you update the app.** Nothing in the upgrade process touches your database or uploaded files.

### What lives where

| Container path | Contents |
|---|---|
| `/app/data/budget.db` | All user accounts, budgets, transactions, categories, rules, and alert settings |
| `/app/uploads/` | Uploaded receipt images (JPEG/PNG) |

Both paths are outside the container's image layer — they are mounted from the host at runtime and are never modified or deleted when the container image is rebuilt or replaced.

### Migrations are additive-only

On every startup, the container entrypoint runs:

```bash
prisma migrate deploy
```

`prisma migrate deploy` only **adds** new tables and columns — it never drops or truncates existing data. If a migration has already been applied (tracked in the `_prisma_migrations` table), it is skipped entirely. Downgrading to an older image leaves any newer columns in place and harmless.

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

### Recommended cron schedule (system cron)

Replace `<host>`, `<port>`, and `<CRON_SECRET>` with your values. `<port>` matches your `PORT` setting (default `3000`).

Run all alert types once daily:
```cron
0 8 * * *  curl -sf -X POST http://<host>:<port>/api/cron/alerts \
             -H "Authorization: Bearer <CRON_SECRET>" \
             -H "Content-Type: application/json" \
             -d '{"type":"all"}'
```

Or use finer-grained timing:
```cron
# Overspending + bills — daily at 08:00
0 8 * * *   curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"overspending"}'

# Bill reminders — daily at 08:05
5 8 * * *   curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"bills"}'

# Payday reminder — daily at 08:10
10 8 * * *  curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"payday"}'

# Cash flow deficit risk — daily at 08:15
15 8 * * *  curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"deficit_risk"}'

# Weekly digest — Sundays at 09:00
0 9 * * 0   curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"weekly"}'

# Receipt reminder — Mondays at 09:00
0 9 * * 1   curl -sf -X POST http://<host>:<port>/api/cron/alerts \
              -H "Authorization: Bearer <CRON_SECRET>" \
              -H "Content-Type: application/json" \
              -d '{"type":"receipt_reminder"}'
```

### TrueNAS SCALE (System Settings → Advanced → Cron Jobs)

1. Go to **System Settings → Advanced → Cron Jobs → Add**.
2. Set **Command** to the `curl` command above (substituting your host, port, and CRON_SECRET).
3. Set **Schedule** using the cron expression (e.g. `0 8 * * *`).
4. Set **Run As User** to `root` or a user with `curl` access.

### Manual trigger (testing)

```bash
curl -X POST http://<host>:<port>/api/cron/alerts \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'
```

---

## Gmail Auto-Sync Scheduling

If you enable Gmail integration, the app can automatically import receipts from your Gmail labels on a configurable schedule.

### How it works

- The `/api/cron/gmail-sync` endpoint checks all users with active Gmail connections.
- Each user configures their **sync frequency** (30 min, 1 h, 6 h, 12 h, or 24 h) in **Settings → Gmail**.
- The cron endpoint should be called frequently (every 15 minutes recommended); it skips users whose chosen interval hasn't elapsed yet.
- AI extraction runs on every imported email: image/PDF attachments are processed for merchant, date, and total; text-only emails have their body analysed directly.
- **Budget target**: receipts are imported into the user's earliest-created **owned** budget. If the user owns no budgets, the earliest budget they belong to as a member is used.

### Authentication

Same `CRON_SECRET` bearer token as alert cron:

```
Authorization: Bearer <CRON_SECRET>
```

### Recommended cron schedule

Run every 15 minutes — the endpoint is lightweight and handles interval enforcement per user:

```cron
*/15 * * * *  curl -sf -X POST http://<host>:<port>/api/cron/gmail-sync \
                -H "Authorization: Bearer <CRON_SECRET>"
```

### TrueNAS SCALE (System Settings → Advanced → Cron Jobs)

1. Go to **System Settings → Advanced → Cron Jobs → Add**.
2. Set **Command** to:
   ```
   curl -sf -X POST http://<host>:<port>/api/cron/gmail-sync -H "Authorization: Bearer <CRON_SECRET>"
   ```
3. Set **Schedule** to `*/15 * * * *` (every 15 minutes).
4. Set **Run As User** to `root` or a user with `curl` access.

### Docker Compose — sidecar cron container (optional)

Add this service to your `docker-compose.yml` to run the sync automatically without a host cron:

```yaml
  gmail-sync-cron:
    image: alpine:3
    restart: unless-stopped
    entrypoint: >
      sh -c "while true; do
        sleep 900 &&
        wget -qO- --post-data='' --header='Authorization: Bearer ${CRON_SECRET}'
          http://yosan-ai:${PORT:-3000}/api/cron/gmail-sync;
      done"
    environment:
      - CRON_SECRET=${CRON_SECRET}
      - PORT=${PORT:-3000}
    depends_on:
      - yosan-ai
```

### Manual trigger (testing)

```bash
curl -X POST http://<host>:<port>/api/cron/gmail-sync \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Response example:
```json
{"ok":true,"synced":1,"skipped":0,"failed":0,"imported":3,"usersProcessed":["u_abc"],"usersSkipped":[],"usersFailed":[]}
```

---

## Upgrading

1. Pull the latest app files.
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

Or copy the mounted host directory directly — SQLite WAL mode makes online copies safe.

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
5. Create a `.env` file based on `.env.example` with all required variables filled in.
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
   PORT=3000 pnpm run start
   ```
