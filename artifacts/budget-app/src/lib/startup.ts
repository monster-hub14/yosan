import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { db } from "@/lib/db";
import { encryptIfPlaintext } from "@/lib/encryption";

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM pragma_table_info('${table}') WHERE name = '${column}'`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (!(await columnExists(table, column))) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`
    );
    console.log(`[startup] Added missing column ${table}.${column}`);
  }
}

async function ensureDriftColumns(): Promise<void> {
  try {
    await addColumnIfMissing("ClarificationHistory", "context", "TEXT");
    await addColumnIfMissing("Expense", "currency", "TEXT NOT NULL DEFAULT 'USD'");
    await addColumnIfMissing("ItemMemory", "isAmbiguous", "BOOLEAN NOT NULL DEFAULT false");
    await addColumnIfMissing("ItemMemory", "ambiguousQuestion", "TEXT");
    await addColumnIfMissing("PendingImport", "expenseId", "TEXT");
    await addColumnIfMissing("PendingImport", "confirmedById", "TEXT");
    await addColumnIfMissing("PendingImport", "confirmedAt", "DATETIME");
  } catch (err) {
    // Non-fatal: tables may not exist yet on a brand-new DB.
    // prisma migrate deploy will create them correctly.
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[startup] ensureDriftColumns skipped (likely fresh DB): ${msg}`);
  }
}

export async function checkStartup(): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`[startup] Created upload directory: ${uploadDir}`);
    }

    const testFile = path.join(uploadDir, ".write-test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    console.log(`[startup] Upload directory is writable: ${uploadDir}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[startup] FATAL: Upload directory is not writable: ${uploadDir}`);
    console.error(`[startup] Error: ${message}`);
    console.error(`[startup] Please ensure UPLOAD_DIR is set to a writable path.`);
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error("[startup] FATAL: JWT_SECRET is missing or too short (must be >= 32 chars).");
    console.error("[startup] Generate one with: openssl rand -base64 48");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[startup] FATAL: DATABASE_URL is not set.");
    process.exit(1);
  }

  // Log resolved database path.
  // Only print the full URL for SQLite (file: protocol) — other datasource URLs may
  // contain credentials (user:password@host) and must be redacted.
  const isSqliteUrl = dbUrl.startsWith("file:");
  const safeDbUrl = isSqliteUrl ? dbUrl : "<redacted — non-SQLite datasource>";
  const resolvedDbPath = isSqliteUrl
    ? path.resolve(
        process.cwd(),
        "prisma",
        dbUrl.replace(/^file:(\/\/)?/, "")
      )
    : "(non-file datasource — see DATABASE_URL)";
  console.log(`[startup] DATABASE_URL: ${safeDbUrl}`);
  console.log(`[startup] Resolved SQLite path (approx): ${resolvedDbPath}`);

  // Pre-normalize columns needed by the schema drift patch migration.
  // The patch migration (20260402120000_schema_drift_patch) uses full
  // INSERT/SELECT lists that include manually-added columns.  On a fresh
  // install those columns do not yet exist after migrations 1–12, so we
  // add them here before migrate deploy runs.  On the live DB (or any DB
  // where the columns already exist) these calls are no-ops.
  await ensureDriftColumns();

  // Apply any pending Prisma migrations before the app starts serving requests.
  // In development this is a fast no-op when nothing is pending.
  // In Docker / TrueNAS this ensures new schema columns land on first boot after upgrade.
  try {
    console.log("[startup] Running prisma migrate deploy...");
    execSync("node_modules/.bin/prisma migrate deploy", {
      cwd: process.cwd(),
      stdio: "inherit",
      timeout: 30_000,
    });
    console.log("[startup] Migrations applied successfully.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[startup] FATAL: prisma migrate deploy failed:", msg);
    console.error("[startup] The database may be locked or the migration files may be corrupt.");
    process.exit(1);
  }

  // EmailConfig schema health check — confirms the critical migration landed correctly
  try {
    const emailCfg = await db.emailConfig.findFirst({ select: { id: true } });
    console.log(`[startup] EmailConfig schema OK (row: ${emailCfg?.id ?? "none"})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[startup] FATAL: EmailConfig schema check failed:", msg);
    console.error("[startup] The database schema is out of date. Run: pnpm db:migrate:deploy");
    process.exit(1);
  }

  // Re-encrypt any AI provider API key that was stored as plain text by the
  // setup wizard before this bug was fixed (the setup route used to skip
  // encryption). encryptIfPlaintext() detects and upgrades plain-text values
  // while leaving already-encrypted blobs untouched.
  try {
    const aiConfig = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
    if (aiConfig?.apiKey) {
      const safeKey = encryptIfPlaintext(aiConfig.apiKey);
      if (safeKey !== aiConfig.apiKey) {
        // Key was plain text — re-save in encrypted form.
        await db.aIProviderConfig.update({
          where: { id: "singleton" },
          data: { apiKey: safeKey },
        });
        console.log("[startup] Migrated plain-text AI API key to encrypted form.");
      }
    }
  } catch (err) {
    // Non-fatal — warn but don't block startup.
    console.warn("[startup] Could not check/migrate AI API key encryption:", err);
  }

  // Warn (non-fatal) if APP_BASE_URL is not set in production.
  // Without it, Gmail OAuth redirect URIs may resolve to an internal HTTP address
  // which will fail Google's HTTPS requirement and result in silent OAuth errors.
  if (process.env.NODE_ENV === "production" && !process.env.APP_BASE_URL) {
    console.warn(
      "[startup] WARNING: APP_BASE_URL is not set. " +
        "Gmail OAuth may fail because the redirect URI could resolve to an internal HTTP address. " +
        "Set APP_BASE_URL to your public HTTPS URL, e.g. APP_BASE_URL=https://yourdomain.com"
    );
  }

  console.log("[startup] Startup checks passed.");
}
