# Database Migrations — Yosan AI

## How migrations work

Yosan AI uses [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate)
with SQLite. The migration history lives in `prisma/migrations/`. The app automatically
runs `prisma migrate deploy` at startup before serving any requests, so most users never
need to run migrations manually.

If a migration fails at startup, the process exits with code 1 and logs:
```
[startup] FATAL: prisma migrate deploy failed: <reason>
```

---

## Local development

### Apply pending migrations

After pulling new code that adds migrations:

```sh
cd artifacts/budget-app     # or wherever package.json is
pnpm db:migrate:deploy
```

The dev server (`pnpm dev`) also runs migrations automatically on startup via the
`instrumentation.ts` → `startup.ts` hook.

### Create a new migration (after editing schema.prisma)

```sh
pnpm db:migrate:dev --name describe_what_changed
```

This creates a new migration file under `prisma/migrations/` and applies it to the dev
database at `prisma/data/budget.db`.

**Important:** Always run `prisma migrate dev` from the project root (the directory that
contains `package.json`), not from inside the `prisma/` sub-directory. Running it from
inside `prisma/` creates a ghost database at `prisma/prisma/data/budget.db`.

### Generate the Prisma client after schema changes

```sh
pnpm db:generate
```

This is done automatically by `prisma migrate dev` but can be run on its own after
manually editing `prisma/schema.prisma`.

### Dev database location

| Environment | Database file |
|-------------|---------------|
| Local dev   | `prisma/data/budget.db` (Prisma resolves `file:./data/budget.db` relative to the schema) |
| Docker      | `/app/data/budget.db` (absolute path via `DATABASE_URL=file:/app/data/budget.db`) |

---

## Docker / TrueNAS SCALE

Migrations run automatically when the container starts. The Dockerfile `CMD` is:

```sh
prisma migrate deploy && next start -p ${PORT:-3000}
```

### Check migration logs

```sh
docker logs yosan-ai | grep '\[startup\]\|Prisma'
```

Success looks like:
```
[startup] Running prisma migrate deploy...
4 migrations found in prisma/migrations
No pending migrations to apply.
[startup] Migrations applied successfully.
[startup] EmailConfig schema OK (row: none)
```

### Apply migrations manually on a running container

```sh
docker exec -it yosan-ai sh -c "node_modules/.bin/prisma migrate deploy"
```

### After pulling a new image with schema changes

The container will automatically run `prisma migrate deploy` on the next start. The
persistent volume at `/app/data/` is unchanged. The migration is safe: it only adds
columns (never drops or renames existing ones).

---

## Schema drift detection

If the app returns `"errorCode": "schema_out_of_date"` from any API route, it means
the runtime database is behind the application code. This will also appear in server logs
as `[email/settings] GET: Schema drift: The column ... does not exist`.

**Fix:**

1. Docker: restart the container (migrations run automatically at startup).
2. Dev: run `pnpm db:migrate:deploy` from the project root.

---

## Troubleshooting

### Ghost database at `prisma/prisma/data/budget.db`

This is created when a Prisma command is run from inside the `prisma/` sub-directory
instead of the project root. To fix:

```sh
rm -rf prisma/prisma/
```

The correct runtime database is always `prisma/data/budget.db` in development.

### `DATABASE_URL` mismatch

Prisma resolves `file:./data/budget.db` relative to the **schema.prisma location**
(`prisma/`), not the process working directory. So the actual file in development is
`prisma/data/budget.db`, even though the env value looks like it points elsewhere.

Docker uses `DATABASE_URL=file:/app/data/budget.db` (absolute path in the container),
which maps to the `yosan_data` Docker volume.
