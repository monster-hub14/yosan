import fs from "fs";
import path from "path";

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

  console.log("[startup] Startup checks passed.");
}
