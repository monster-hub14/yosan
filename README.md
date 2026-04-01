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
          dashboard/   # DashboardStagger/DashboardItem animation wrappers
          expenses/
          income/
          receipts/
          reports/
          savings/     # SavingsPage with circular SVG progress rings
          settings/    # Settings with admin/user/budget sections
        (auth)/        # Auth pages (login, setup wizard)
      components/
        layout/        # AppShell (client, mobile state), AppSidebar (Framer Motion active pill),
                       # AppHeader (hamburger for mobile), MobileNav (fixed bottom bar on <lg)
        receipts/      # UploadReceiptModal (scan line animation during AI processing)
        expenses/      # CategoryTotalsPanel (staggered entry + status CSS var colors)
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

### UI Design System (Task #9 — Premium UI/UX)
- **Status CSS tokens**: `--status-healthy-hsl`, `--status-caution-hsl`, `--status-risk-hsl` + `-bg/-border/-glow` variants in `:root` and `.dark`; used via inline `style` props
- **Mobile layout**: `AppShell.tsx` manages `mobileSidebarOpen` state; sidebar is hidden on `<lg` and shown as fixed slide-over drawer; `MobileNav` fixed at bottom with 5 key items; main content has `pb-24 lg:pb-6`
- **Sidebar**: `AppSidebar.tsx` — "Yosan AI" brand + logo image, Framer Motion `layoutId="sidebar-active-pill"` animated active highlight, `onClose` prop for mobile drawer
- **Safe-to-spend widget**: SVG arc ring (r=42, circumference=263.9) with `motion.circle` animating `strokeDashoffset`; health fraction mapped from status; supportive copy ("Looking good", "Worth watching", "Let's look at this")
- **Pay-period card**: gradient progress bar + milestone tick marks at 25/50/75%
- **Dashboard**: Wrapped in `DashboardStagger` + `DashboardItem` for staggered fade-in entry (0.09s stagger)
- **Savings goals**: Circular SVG rings (r=36, circ=226.2) with animated stroke-dashoffset; color changes at 50% (caution) and 80% (healthy)
- **Receipt upload modal**: AI processing state replaced with animated scan-line effect (sweep over receipt silhouette + pulsing dots) instead of plain spinner
- **Category totals panel**: Status badge/bar colors now use CSS var tokens; staggered row entry animations

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
| `DATABASE_URL` | SQLite database URL | `file:/app/data/budget.db` |
| `ENCRYPTION_KEY` | Encryption key for sensitive data (generate with `openssl rand -base64 48`) | Required in production |
| `JWT_SECRET` | JWT signing secret (≥32 chars, generate with `openssl rand -base64 48`) | Required in production |
| `UPLOAD_DIR` | Directory for uploaded receipts/files | `/app/uploads` |
| `PORT` | Server port | `3000` |
| `APP_BASE_URL` | Public HTTPS URL of the app (required for OAuth features like Gmail) | Optional |

The artifact environment sets `DATABASE_URL=file:./data/budget.db` to avoid conflicts with Replit's global `DATABASE_URL` (PostgreSQL).

### Generating Secrets

Generate secure values for `ENCRYPTION_KEY` and `JWT_SECRET` with:

```bash
openssl rand -base64 48
```

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
# Edit .env with your JWT_SECRET, ENCRYPTION_KEY, CRON_SECRET, and other settings
docker compose up -d
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

### Task #2 — Budget Model, Income & Pay-Period Engine ✅ COMPLETE
- Schema: `BudgetType` (SHARED/SOLO), `CUSTOM` pay frequency, `customDays`, `perPaycheckAmount`, `isMonthlyGoal`, `userId` on `BudgetSoloShare`
- Pay-period engine: `computePayPeriod()`, `monthlyToPerPeriod()`, `getPeriodsPerMonth()` in `src/lib/pay-period.ts`
- Safe-to-spend engine: `computeSafeToSpend()` returns status: `on-track | caution | at-risk` in `src/lib/safe-to-spend.ts`
- Active budget helper: cookie-based budget switcher in `src/lib/active-budget.ts`
- API routes: `/api/budgets`, `/api/budgets/[id]`, `/api/budgets/[id]/members`, `/api/budgets/[id]/income-sources`, `/api/budgets/[id]/income-entries`, `/api/budgets/[id]/savings-goals`, `/api/budgets/[id]/recurring`, `/api/budgets/switch`, `/api/dashboard`
- UI pages: Dashboard (SafeToSpendWidget + PayPeriodCard with Framer Motion animations), Income, Savings Goals, Recurring Bills, Budget Members management, New Budget creation
- AppHeader: Budget switcher dropdown with user menu

### Task #3 — Receipt Capture, AI Processing & Pending Queue ✅ COMPLETE
- File upload + email ingest → async AI extraction → PendingImport inbox/review flow
- AI extraction/categorization with confidence, ItemMemory/MerchantMemory persistence
- Duplicate detection with user resolution (keep_new/keep_existing/merge)
- Email inbound webhook (multipart + JSON) with budget-scoped forwarding addresses
- Per-user AI feature toggles (extraction, categorization, recurringCategorization, insights, forecasting)
- Encrypted API key storage (AES-256-GCM); key never returned to client after save
- PDF text extraction via pdfjs-dist; inline upload → review navigation
- Security: path traversal guard, webhook secret required in production, terminal status protection

### Task #4 — Expenses Management & Category System ✅ COMPLETE
- Hierarchical category system: 11 top-level + 40+ subcategories seeded (Groceries, Utilities, Recreation > Fishing & Boating, etc.)
- CategoryTarget model for per-category spend targets with period-based tracking
- Full expense CRUD API: GET/POST/PATCH/DELETE /api/budgets/[id]/expenses/[expenseId]
- Category CRUD API: GET/POST/PATCH/DELETE /api/categories/[id] with 2-level nesting guard
- Category totals API: /api/categories/totals with actuals vs. targets, status per category
- Category targets API: /api/budgets/[id]/category-targets
- Expenses list page (/expenses): grouped by date, search, category filter, date range filter
- Expense form modal with hierarchical category picker (searchable tree), Framer Motion safe-to-spend animation
- Category totals panel: progress bars, color-coded status (on-track/approaching/over), click-to-set-target
- Categories page (/categories): spending breakdown + management side by side
- Settings categories page (/settings/budget/categories): full CRUD with expand/collapse hierarchy
- AppSidebar: Categories nav item added

### Task #5 — AI Analysis, Cash Flow Forecasting & Notifications ✅ COMPLETE
- AI analysis service: `src/lib/ai/insights.ts` — collects period spending, computes category overspend/pace, generates AI narrative + recommendations (graceful fallback if AI disabled)
- Cash flow projection engine: `src/lib/forecast.ts` — day-by-day balance projection from income sources + recurring bills, AI summary, danger zone detection
- Email service: `src/lib/email.ts` — Nodemailer SMTP, HTML email templates (overspending alert, weekly summary, upcoming bill, payday reminder)
- API routes:
  - `GET/POST/PATCH /api/analysis/insights` — generate and store spending insights, mark read
  - `GET /api/analysis/forecast` — build cash flow forecast for 14–90 days
  - `GET/PUT /api/notifications` — read/save user notification preferences
  - `POST /api/cron/alerts` — cron-callable endpoint for scheduled email alerts (CRON_SECRET env var)
  - `POST /api/settings/email/test` — admin test email sender
- Analysis page (`/analysis`): Live analysis dashboard with status badge, stat cards, category progress bars, AI narrative + numbered recommendations, history view for stored insights
- Forecast page (`/forecast`): Recharts AreaChart balance projection, stat cards, danger zone banner, upcoming events (paydays + bills), AI cash flow summary, period selector (14/30/42/60 days)
- Notifications page (`/settings/notifications`): Grid toggle matrix (In-App vs Email per event), persists to DB, cron setup docs
- CRON_SECRET env var secures the cron alerts endpoint for self-hosted scheduling

### Task #30 — Gmail Receipt Import ✅ COMPLETE
- Prisma models: `GmailOAuthConfig` (singleton, admin credentials), `GmailConnection` (per-user tokens), `GmailLabelConfig` (per-user label selection + sync settings); `gmailMessageId` on `PendingImport` for dedup
- `src/lib/gmail.ts`: `getValidAccessToken` (auto-refresh with revoked detection), `fetchGmailLabels`, `fetchMessageIds` (multi-label, dedup, cutoff date), `fetchMessageDetail` (full MIME parse), `downloadAttachment`, `buildAuthUrl`, `exchangeCodeForTokens`, `GmailRevokedError`
- All tokens stored AES-256 encrypted via `src/lib/encryption.ts`
- API routes:
  - `GET/PUT /api/settings/gmail-oauth` — admin: read/save Google OAuth Client ID + Secret
  - `GET /api/settings/gmail/status` — user: connection status, labels, sync timestamps
  - `GET /api/settings/gmail/auth` — initiates OAuth redirect to Google (CSRF state cookie)
  - `GET /api/settings/gmail/callback` — exchanges code for tokens, stores encrypted
  - `DELETE /api/settings/gmail/disconnect` — removes GmailConnection + GmailLabelConfig
  - `GET /api/settings/gmail/labels` — fetches Gmail labels from API
  - `POST /api/settings/gmail/labels` — saves selected labels + sync settings
  - `POST /api/budgets/[id]/gmail/sync` — syncs emails, dedupes by gmailMessageId, downloads PDF/image attachments, stores all as NEEDS_REVIEW PendingImports
- Settings pages:
  - `/settings/gmail-oauth` — admin-only, Instance nav; Client ID/Secret form with setup instructions
  - `/settings/gmail` — Account nav; connect/disconnect/label picker/sync now with budget selector
- Receipt landing (`/receipts`): added "Import from Gmail" button alongside Upload
- Inbox (`/receipts/inbox`): Gmail badge (blue), sender line, subject as title for Gmail imports
