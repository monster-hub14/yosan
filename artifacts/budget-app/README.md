# Yosan AI — Self-Hosted Budget Tracker

A self-hosted, AI-powered personal and household budget tracker. Track expenses, upload receipts for automatic AI extraction, set savings goals, configure alerts, and analyse spending patterns — all on infrastructure you control.

---

<a href="https://buymeacoffee.com/monsterreview" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
       alt="Buy Me A Coffee" 
       style="height: 60px !important;width: 217px !important;">
</a>

---

## Features

- **AI receipt extraction** — upload photos or PDFs; merchant, date, and total are extracted automatically
- **Gmail auto-sync** — import receipts directly from Gmail labels on a configurable schedule
- **Budget sharing** — invite household members or create read-only share links
- **Recurring expenses** — track subscriptions and bills, get payday and overspend alerts
- **Savings goals** — per-paycheck and monthly goal tracking
- **Spending insights and forecasts** — AI-generated analysis of spending patterns
- **Email notifications** — overspending, upcoming bills, payday reminders, weekly digests
- **Multi-provider AI** — OpenAI, Anthropic, Google Gemini, Ollama, or any OpenAI-compatible endpoint

---

## Quick Start (Docker)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/yosan-ai.git
cd yosan-ai
```

### 2. Create a `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in the three required secrets:

```env
JWT_SECRET=<generate with: openssl rand -base64 48>
ENCRYPTION_KEY=<generate with: openssl rand -base64 48>
CRON_SECRET=<generate with: openssl rand -base64 48>
```

### 3. Start the app

```bash
docker compose up -d
```

The first start creates the database and runs all migrations automatically.

### 4. Complete setup

Open `http://localhost:3000/setup` and follow the wizard to create your admin account, configure AI, and set up your first budget.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | — | Signs session tokens — generate with `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | **Yes** | — | AES-256 key for stored SMTP/AI credentials — generate separately from `JWT_SECRET` |
| `CRON_SECRET` | **Yes** | — | Bearer token for cron endpoints — generate with `openssl rand -base64 48` |
| `DATABASE_URL` | Yes (set by Compose) | `file:/app/data/budget.db` | SQLite path inside the container — do not change |
| `PORT` | No | `3000` | HTTP port |
| `UPLOAD_DIR` | No | `/app/uploads` | Receipt upload directory inside the container |
| `APP_BASE_URL` | Required for Gmail OAuth | auto-detected | Public HTTPS URL of your app, e.g. `https://budget.yourdomain.com` |
| `EMAIL_LOGO_URL` | No | *(no logo)* | Public HTTPS URL for the logo shown in outgoing emails |
| `INBOUND_EMAIL_DOMAIN` | No | from SMTP `fromAddress` | Domain for receipt-forwarding addresses, e.g. `receipts.yourdomain.com` |
| `WEBHOOK_EMAIL_SECRET` | No (recommended) | — | Bearer token for authenticating inbound email webhook requests |

See `.env.example` for the full list with comments.

---

## Volume Mounts

The app writes to two directories inside the container. Mount these from your host so data persists across restarts and upgrades:

| Container path | Purpose |
|---|---|
| `/app/data` | SQLite database |
| `/app/uploads` | Uploaded receipt images |

**The app defines the right side. You choose the left side.**

```yaml
volumes:
  - /your/host/path/data:/app/data
  - /your/host/path/uploads:/app/uploads
```

Mounted directories must be writable by the container user (uid 1001). The app exits with a clear error on startup if they are not.

The default `docker-compose.yml` uses named Docker volumes. For TrueNAS, Unraid, or any host where you want data at a specific path, switch to bind mounts — see [SELF_HOSTING.md](SELF_HOSTING.md) for examples.

---

## Full Self-Hosting Guide

For TrueNAS SCALE setup, bind-mount configuration, cron scheduling, Gmail sync, upgrade instructions, and database backup, see **[SELF_HOSTING.md](SELF_HOSTING.md)**.

---

## Pre-Release Verification

A full Phase 1–7 hardening audit was completed before this project was published. Results are documented in **[RELEASE_NOTES.md](RELEASE_NOTES.md)**, covering Prisma migration integrity, build-without-secrets, fresh-install behavior, and portability checks.

---

## Before Pushing to GitHub

If you are distributing this app or pushing it to a public repository, run through this checklist first:

- [ ] **No secrets in tracked files** — run `grep -R "ENCRYPTION_KEY\|JWT_SECRET\|CRON_SECRET" .` and confirm only `process.env.*` references appear in source code
- [ ] **`.env` is gitignored** — confirm `.env` and `.env.*` are listed in `.gitignore`
- [ ] **Generate fresh secrets per deployment** — never copy secrets from one install to another
- [ ] **Never reuse `ENCRYPTION_KEY`** — each installation must have its own key; reusing it allows cross-install decryption of stored credentials
- [ ] **`docker-compose.yml` has no hardcoded secrets** — all sensitive values must use `${VAR}` substitution
- [ ] **Dockerfile has no `ARG` or `ENV` lines that bake secrets** — secrets are supplied at runtime only
- [ ] **`.env.example` has only placeholders** — no real values committed

---

## Local Development

Install dependencies and start the dev server:

```bash
pnpm install
cd artifacts/budget-app
pnpm dev
```

The dev server starts on port `3000` by default (override with `PORT=`). On first start, it runs Prisma migrations automatically and creates the dev database at `prisma/data/budget.db`.

See [MIGRATIONS.md](MIGRATIONS.md) for Prisma migration workflows.

---

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Radix UI
- **Backend**: Next.js Route Handlers, Prisma ORM, SQLite
- **AI**: OpenAI / Anthropic / Google Gemini / Ollama / custom OpenAI-compatible endpoints
- **Auth**: JWT sessions (jose), bcryptjs password hashing
- **Email**: Nodemailer (SMTP), IMAP forwarding
