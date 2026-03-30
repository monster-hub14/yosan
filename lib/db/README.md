# @workspace/db — API Server Database Package

This package contains the **Drizzle ORM + PostgreSQL** schema and client for the
`api-server` artifact (`artifacts/api-server`). It is **not used** by the budget
app (`artifacts/budget-app`).

## Isolation boundary

| Artifact | DB layer |
|---|---|
| `artifacts/api-server` | `@workspace/db` (Drizzle + PostgreSQL) |
| `artifacts/budget-app` | `artifacts/budget-app/src/lib/db.ts` (Prisma + SQLite) |

Do not import `@workspace/db` from the budget app. The budget app has its own
self-contained Prisma client and migration history in `artifacts/budget-app/prisma/`.
