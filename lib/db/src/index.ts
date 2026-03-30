/**
 * @workspace/db — API Server database client (Drizzle ORM + PostgreSQL).
 *
 * THIS PACKAGE IS FOR artifacts/api-server ONLY.
 * It is NOT used by artifacts/budget-app.
 *
 * The budget app has its own self-contained database layer:
 *   artifacts/budget-app/src/lib/db.ts  (Prisma + SQLite)
 *   artifacts/budget-app/prisma/schema.prisma
 *
 * Do NOT import @workspace/db from the budget app.
 * See lib/db/README.md for the full isolation boundary documentation.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
