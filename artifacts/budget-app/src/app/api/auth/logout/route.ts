import { NextResponse } from "next/server";
import { makeClearSessionCookie } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", makeClearSessionCookie());
  return response;
}
