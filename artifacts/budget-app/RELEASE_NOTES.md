# Yosan AI — Pre-Release Verification Report

This document records the results of the final hardening audit performed before
public GitHub distribution. All checks were run in the Replit build environment.

---

## Phase 1 — Config Audit

| Check | Result |
|---|---|
| Hardcoded secrets in source | None found |
| Hardcoded machine-specific host paths | None found |
| Personal domains or usernames | None found |
| Fixed non-configurable ports | None found |
| Secrets read only from env vars | Confirmed — all via `process.env.*` |
| Secrets required at build time | None — all runtime-only |
| `.env` gitignored | Confirmed — `.env` and `.env.*` are ignored; `.env.example` is tracked |
| `.env.example` contains only placeholders | Confirmed — no real values |

**Issues fixed:** `next.config.ts` contained Replit-specific `allowedDevOrigins`
(`*.replit.dev`, `*.kirk.replit.dev`, `*.repl.co`). These were removed and
replaced with a comment explaining the field. `.env.example` was missing two
optional vars (`INBOUND_EMAIL_DOMAIN`, `WEBHOOK_EMAIL_SECRET`) that are used in
source code — both added with documentation.

---

## Phase 2 — Prisma Integrity

| Check | Result |
|---|---|
| `prisma validate` | ✅ Schema valid |
| Migrations vs schema match | ✅ No drift |
| Fresh SQLite `prisma migrate deploy` | ✅ All 7 migrations applied cleanly |
| Runtime P2022 / column-missing errors | None — schema matches migrations |

**Fresh DB test output:**

```
SQLite database created at file:/tmp/fresh-test-*.db
Applying migration `20260330162942_init`
Applying migration `20260330190033_add_budget_type_custom_pay_freq_savings_fields`
Applying migration `20260330200000_add_smtp_encryption_user_notif_config`
Applying migration `20260331000000_add_email_test_status`
Applying migration `20260331010000_add_additional_notification_emails`
Applying migration `20260331120000_add_gmail_integration`
Applying migration `20260331200000_add_gmail_sync_interval`
All migrations have been successfully applied.
```

---

## Phase 3 — First-Run Behavior

| Check | Result |
|---|---|
| App starts against empty database | ✅ `[startup] Startup checks passed.` |
| Migrations auto-run on boot | ✅ `prisma migrate deploy` in startup.ts and Dockerfile CMD |
| Upload directory auto-created if missing | ✅ `startup.ts` calls `fs.mkdirSync(uploadDir, { recursive: true })` |
| Upload directory writable check | ✅ Write-test performed; exits with clear error if not writable |
| Signup flow | ✅ Startup wizard served at `/setup` |
| AI settings page with no config row | ✅ API returns `{ config: null }`; form uses `if (data.config)` guard — no crash |

---

## Phase 4 — Build & Runtime Separation

| Check | Result |
|---|---|
| `pnpm build` with `JWT_SECRET` unset | ✅ Succeeded |
| `pnpm build` with `ENCRYPTION_KEY` unset | ✅ Succeeded |
| `pnpm build` with `APP_BASE_URL` unset | ✅ Succeeded |
| Pages generated | 73 / 73 |
| Compile time | ~47 s |
| `encryption.ts` key derivation | Lazy — `getKey()` called at runtime only |

> **Note:** Two pages emit a `prisma: Error code 14` during static generation
> because Next.js attempts to pre-render against `file:/app/data/budget.db`
> which does not exist in the build environment. Both pages fall back to
> dynamic rendering at runtime. This is expected and does not indicate a
> code defect — the build exits successfully.

---

## Phase 5 — Portability

| Check | Result |
|---|---|
| Container data path | `/app/data` (only path assumed) |
| Container uploads path | `/app/uploads` (only path assumed) |
| Host filesystem assumptions | None — user chooses host-side path |
| Fixed hostname / IP assumptions | None |
| Dockerfile `VOLUME` declarations | `["/app/data", "/app/uploads"]` |
| User (uid 1001) owns both dirs | ✅ `chown -R nextjs:nodejs /app` in Dockerfile |

---

## Phase 6 — Documentation

| Check | Result |
|---|---|
| README: no personal URLs | ✅ |
| README: no machine-specific paths | ✅ |
| README: env vars table complete | ✅ — all 9 env vars documented |
| `.env.example`: all required vars present | ✅ |
| `.env.example`: no real values | ✅ |
| SELF_HOSTING.md: no hardcoded host paths | ✅ — all replaced with generic placeholders |
| SELF_HOSTING.md: port consistent (3000) | ✅ |
| Deployment section: required mounts documented | ✅ — left/right rule explained |

---

## Phase 7 — Final Verdict

**✅ Ready for public GitHub distribution.**

The app:

- Builds without any secrets set
- Runs with environment variables only
- Creates its own database at `/app/data` on first boot
- Uses `/app/uploads` for receipts (auto-creates if missing)
- Contains no machine-specific paths, personal domains, or hardcoded secrets
- Has consistent Prisma schema + 7 verified migrations
- Handles fresh-install state correctly (empty DB, no AI config, no email config)
