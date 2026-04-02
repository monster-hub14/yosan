# Yosan AI — Replit Agent Guide

## Overview

Yosan AI is a self-hosted, AI-powered, receipt-driven personal and household budget tracker. It is **not** a bank-linked budgeting app — it is built entirely around paycheck-based budgeting, manual income entry, receipt photo uploads, and AI-assisted extraction and categorization.

The project is a monorepo with multiple artifacts. The primary deliverable is `artifacts/budget-app`, a full Next.js 15 App Router application. There are also supporting packages: an Express API server (`artifacts/api-server`), a mockup sandbox (`artifacts/mockup-sandbox`), and shared library packages under `lib/`.

**Key goals:**
- Fully self-hostable (Docker, TrueNAS SCALE, bare-metal Linux)
- No cloud lock-in, no bank linking, no third-party data providers
- AI receipt scanning via pluggable providers (OpenAI, Anthropic, Gemini, Ollama)
- Portable: all config via environment variables, no hardcoded paths or secrets

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Monorepo Structure

The workspace is managed with **pnpm** (enforced via preinstall script). Package manager must be `pnpm` — `npm` and `yarn` are rejected.

```
artifacts/
  budget-app/        ← Main Next.js 15 app (PRIMARY deliverable)
  api-server/        ← Lightweight Express 5 API (secondary, health checks only currently)
  mockup-sandbox/    ← Vite/React UI prototyping sandbox (dev only)
lib/
  db/                ← Drizzle ORM + PostgreSQL schema (for api-server ONLY)
  api-zod/           ← Zod schemas generated from OpenAPI spec
  api-client-react/  ← React Query client generated from OpenAPI spec
  api-spec/          ← OpenAPI spec + Orval codegen config
scripts/             ← Utility scripts (tsx)
```

**Critical isolation boundary:** `artifacts/budget-app` uses **Prisma + SQLite**. `artifacts/api-server` uses **Drizzle + PostgreSQL** via `@workspace/db`. These must never be mixed.

### Budget App (`artifacts/budget-app`)

**Framework:** Next.js 15 App Router with TypeScript. All AI calls and sensitive operations happen server-side (API routes or Server Actions only).

**Route Groups:**
- `(app)/` — Authenticated shell with layout (sidebar, header, mobile nav)
- `(auth)/` — Login and setup wizard pages

**Key pages/sections:**
- `/dashboard` — Overview, safe-to-spend, forecast
- `/expenses` — Expense list, category totals panel
- `/income` — Income sources and entries
- `/receipts` — Receipt upload and AI extraction
- `/reports` — Custom date range reporting, charts (bar, pie, grouped bar)
- `/savings` — Savings goals with circular SVG progress rings
- `/settings` — Admin/user/budget/SMTP/AI provider/Gmail integration settings

**Authentication:**
- Custom JWT auth using `jose` (signing/verifying) and `bcryptjs` (password hashing)
- Sessions stored in `httpOnly` cookies (`budget_session`)
- Middleware at `middleware.ts` handles route protection and setup redirect
- Setup wizard creates the first admin account; app redirects to `/setup` until complete
- Role-based: `ADMIN` and regular users

**Database (budget-app):**
- **ORM:** Prisma 6
- **Default DB:** SQLite at `file:/app/data/budget.db` (production) or `prisma/data/budget.db` (dev)
- **Migrations:** Prisma Migrate — 7 migrations applied sequentially
- **Auto-migration on startup:** `instrumentation.ts` → `startup.ts` runs `prisma migrate deploy` before serving requests
- **Schema:** 20+ models including User, Budget, BudgetMembership, Expense, Category, IncomeSource, IncomeEntry, Receipt, SavingsGoal, RecurringExpense, AIProviderConfig, EmailConfig, GmailIntegration, etc.
- **Seed:** `prisma/seed.ts` — dev only, guarded against production

**Startup checks (`src/lib/startup.ts`):**
1. Upload directory exists and is writable
2. `JWT_SECRET` is set and ≥32 chars
3. `DATABASE_URL` is set
4. Runs `prisma migrate deploy`
5. Logs resolved DB path (redacted for non-SQLite)

**Encryption:**
- AES-256-GCM via Node.js `crypto`
- Key derived lazily from `ENCRYPTION_KEY` env var (falls back to `JWT_SECRET`, then insecure dev fallback)
- Used for encrypting sensitive config (SMTP passwords, Gmail OAuth tokens, AI API keys)

**AI Integration:**
- Multi-provider: OpenAI, Anthropic, Google Gemini, Ollama, any OpenAI-compatible endpoint
- Provider config stored in DB (encrypted API keys)
- AI usage tracked and gated via `isFeatureEnabled` / `checkAndRecordUsage`
- Receipt extraction, categorization, spending insights, forecasting

**Gmail Integration:**
- OAuth 2.0 (Gmail readonly scope)
- Tokens stored encrypted in DB
- Sync on schedule (configurable interval) or manually triggered
- Attachments (images/PDFs) → Receipt records → AI extraction
- Text-only emails → AI extraction from body

**Email (SMTP):**
- Nodemailer-based, config stored in DB (encrypted password)
- Sender address resolved: `fromAddress` override → SMTP username → `noreply@localhost`
- Supports: overspending alerts, bill reminders, payday reminders, weekly digest, test email

**File Uploads:**
- Upload directory controlled by `UPLOAD_DIR` env var (default `/app/uploads`)
- Receipt images and PDFs stored server-side

**Frontend UI:**
- **Tailwind CSS v4** + **shadcn/ui** (Radix UI primitives)
- **Framer Motion** for animations (sidebar active pill, staggered dashboard items, receipt scan line)
- **Recharts** for data visualization (bar charts, pie charts, grouped bar charts in Reports)
- Mobile-first: `AppShell` manages sidebar state; `MobileNav` is a fixed bottom bar on `<lg` screens
- Dark/light theme via `next-themes`
- Hydration note: theme toggle must use `mounted` state guard to avoid SSR mismatch

**Proxy/URL handling:**
- `APP_BASE_URL` env var takes priority for redirect URLs
- Falls back to `x-forwarded-proto` + `x-forwarded-host` headers
- Falls back to `request.url`

### API Server (`artifacts/api-server`)

- Express 5 with TypeScript, built with esbuild
- Currently minimal: health check endpoint only (`GET /api/healthz`)
- Uses Drizzle + PostgreSQL via `@workspace/db`
- Pino structured logging with pino-pretty in dev
- `PORT` env var required (throws if missing)

### Mockup Sandbox (`artifacts/mockup-sandbox`)

- Vite + React (no SSR) for UI prototyping
- Auto-discovers mockup components via `mockupPreviewPlugin`
- Requires `PORT` and `BASE_PATH` env vars
- Not part of the production deployment

### Shared Libraries

| Package | Purpose |
|---|---|
| `lib/db` | Drizzle + PostgreSQL schema for api-server |
| `lib/api-zod` | Zod validators generated from OpenAPI spec via Orval |
| `lib/api-client-react` | React Query hooks generated from OpenAPI spec via Orval |
| `lib/api-spec` | OpenAPI YAML + Orval codegen config |

---

## External Dependencies

### Required Environment Variables (budget-app production)

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | Session signing (≥32 chars, required) | None — fatal if missing |
| `ENCRYPTION_KEY` | AES-256-GCM key for sensitive config | Falls back to `JWT_SECRET`, then insecure dev key |
| `CRON_SECRET` | Protects cron endpoints | Required for cron features |
| `DATABASE_URL` | Prisma DB connection string | `file:/app/data/budget.db` |
| `UPLOAD_DIR` | Writable directory for receipt files | `/app/uploads` |
| `PORT` | HTTP port | `3000` |
| `APP_BASE_URL` | Public-facing base URL (for OAuth redirects) | Optional |

### Docker / Self-Hosting

- Multi-stage Dockerfile in `artifacts/budget-app/`
- `docker-compose.yml` for orchestration
- Two persistent volumes: one for DB (`/app/data`), one for uploads (`/app/uploads`)
- First startup runs migrations automatically then starts Next.js

### Third-Party Services (all optional, configured via UI)

| Service | Purpose | Config location |
|---|---|---|
| OpenAI / Anthropic / Gemini / Ollama | AI receipt extraction, categorization, insights | DB (`AIProviderConfig`) |
| Gmail OAuth (Google Cloud) | Auto-import receipts from Gmail | DB (`GmailIntegration`), requires Gmail API enabled in GCP |
| SMTP server | Email notifications and alerts | DB (`EmailConfig`) |

### Key npm Dependencies (budget-app)

- `@prisma/client` + `prisma` — ORM and migrations
- `jose` — JWT signing/verification
- `bcryptjs` — Password hashing
- `nodemailer` — SMTP email
- `framer-motion` — Animations
- `recharts` — Charts and data visualization
- `next-themes` — Dark/light theme
- `date-fns` — Date utilities
- `sonner` — Toast notifications
- Full shadcn/ui component suite via Radix UI primitives

### Development Tooling

- `pnpm` workspaces (enforced)
- TypeScript 5.9 across all packages
- Prettier for formatting
- `tsx` for running TypeScript scripts directly
- Orval for OpenAPI → TypeScript/Zod/React Query codegen