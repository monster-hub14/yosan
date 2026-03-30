import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/**
 * Guard for /api/setup/* mutation endpoints.
 *
 * During first-run (SetupProgress.completedAt is null):
 *   - Allows any request through; returns { denied: null }.
 *
 * After setup is complete (completedAt is set):
 *   - Requires an authenticated ADMIN session.
 *   - Returns { denied: NextResponse } if the caller is not an admin.
 *
 * Usage in a route handler:
 *   const denied = await guardSetupRoute(request);
 *   if (denied) return denied;
 */
export async function guardSetupRoute(
  request: NextRequest
): Promise<NextResponse | null> {
  const progress = await db.setupProgress.findUnique({
    where: { id: "singleton" },
    select: { completedAt: true },
  });

  if (!progress?.completedAt) {
    return null;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
