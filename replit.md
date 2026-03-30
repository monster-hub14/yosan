# Budget App — Self-Hosted AI-Powered Budget Tracker

## Project Overview
A self-hosted, AI-powered, receipt-driven budget tracking application built with Next.js 15 App Router. Designed for deployment on TrueNAS SCALE and other self-hosting environments. No cloud dependencies, no SaaS lock-in.

## Architecture

### Tech Stack
- **Framework**: Next.js 15 App Router (TypeScript)
- **Styling**: Tailwind CSS v4 + shadcn/ui + Framer Motion
- **Database**: Prisma ORM + SQLite (development) / PostgreSQL (production option)
- **Auth**: Custom JWT (jose) + bcryptjs, httpOnly cookies
- **Deployment**: Docker + Docker Compose, TrueNAS SCALE-ready

### Monorepo Structure
```
artifacts/
  budget-app/          # Main Next.js 15 application
    src/
      app/
        (app)/         # Authenticated app shell
          dashboard/
          expenses/
          income/
          receipts/
          reports/
          savings/
          settings/    # Settings with admin/user/budget sections
        (auth)/        # Auth pages (login, setup wizard)
      components/
        layout/        # AppSidebar, AppHeader
        setup/         # SetupWizard (multi-step, Framer Motion)
        ui/            # shadcn/ui components
      lib/
        auth/          # session.ts, permissions.ts, types.ts
        db.ts          # Prisma client singleton
        startup.ts     # Server startup checks
    prisma/
      schema.prisma    # Full schema (20+ models)
      seed.ts          # Development seed data
    middleware.ts      # Route protection + setup redirect
    next.config.ts
    Dockerfile         # Multi-stage Docker build
    docker-compose.yml
    SELF_HOSTING.md    # TrueNAS SCALE deployment guide
  api-server/          # Hono.js API server (separate artifact)
  mockup-sandbox/      # Component preview server for canvas
```

### Settings URL Structure
- `/settings/account` — User account settings
- `/settings/notifications` — User notification preferences
- `/settings/budget` — Budget configuration
- `/settings/budget/categories` — Expense categories
- `/settings/budget/members` — Budget members
- `/settings/ai` — AI provider config (admin only)
- `/settings/email` — Email/SMTP config (admin only)
- `/settings/users` — User management (admin only)

## Key Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite URL | `file:./data/budget.db` |
| `JWT_SECRET` | JWT signing secret (≥32 chars) | Set in artifact env |
| `UPLOAD_DIR` | Receipt upload directory | `./uploads` |
| `PORT` | Server port | `24432` (dev) |

The artifact environment sets `DATABASE_URL=file:./data/budget.db` to avoid conflicts with Replit's global `DATABASE_URL` (PostgreSQL).

### Auth
- Cookie name: `budget_session`
- JWT expiry: 7 days
- Password hashing: bcryptjs (12 rounds)
- Roles: `USER`, `ADMIN`

### Dev Credentials (after seed)
- Admin: `admin@budget.local` / `admin1234`
- User: `user@budget.local` / `user1234`

## Setup (Development)

```bash
# Install dependencies
pnpm install

# Generate Prisma client
cd artifacts/budget-app && DATABASE_URL=file:./data/budget.db npx prisma generate

# Push schema & seed
DATABASE_URL=file:./data/budget.db npx prisma db push
DATABASE_URL=file:./data/budget.db NODE_ENV=development npx tsx prisma/seed.ts

# Start dev server (via workflow)
pnpm --filter @workspace/budget-app run dev
```

## Setup (Self-Hosted Production)

See `artifacts/budget-app/SELF_HOSTING.md` for full Docker/TrueNAS SCALE instructions.

```bash
cp .env.example .env
# Edit .env with your JWT_SECRET and settings
docker-compose up -d
```

## Status

### Task #1 — Foundation, Auth & Self-Hosting Setup ✅ COMPLETE
- Next.js 15 App Router project with full TypeScript
- Prisma schema with 20+ models (users, budgets, expenses, receipts, AI config, etc.)
- JWT auth with httpOnly cookies, bcryptjs password hashing
- Multi-step setup wizard (Framer Motion) for first-run configuration
- Full settings hierarchy (user, budget, admin/instance)
- Docker multi-stage build + docker-compose with named volumes
- TrueNAS SCALE self-hosting guide

### Tasks #2–#5 — PENDING
- Receipt scanning with AI (OCR + LLM extraction)
- Dashboard with charts and analytics
- Budget tracking with categories and limits
- Reports and CSV export
