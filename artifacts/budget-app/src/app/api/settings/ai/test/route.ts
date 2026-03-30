import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { chatCompletion } from "@/lib/ai/client";
import type { AIConfig } from "@/lib/ai/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

/**
 * POST /api/settings/ai/test
 * Admin-only endpoint to test the AI provider connection.
 * Accepts the same config shape as the settings form.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();

  // If apiKey is masked ("••••••••") or absent, fall back to stored encrypted key
  let resolvedApiKey: string | null = body.apiKey ?? null;
  if (!resolvedApiKey || resolvedApiKey === "••••••••") {
    const stored = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
    resolvedApiKey = stored?.apiKey ? (decrypt(stored.apiKey) ?? null) : null;
  }

  const config: AIConfig = {
    provider: body.provider ?? "OPENAI",
    model: body.model ?? "gpt-4o-mini",
    apiKey: resolvedApiKey,
    baseUrl: body.baseUrl ?? null,
    isEnabled: true,
  };

  if (!config.apiKey && config.provider !== "OLLAMA") {
    return NextResponse.json(
      { success: false, error: "API key is required for this provider. Save your settings first." },
      { status: 400 }
    );
  }

  const start = Date.now();
  try {
    const response = await chatCompletion(
      config,
      [
        { role: "system", content: "You are a helpful assistant. Reply concisely." },
        { role: "user", content: "Say 'Connection successful' and nothing else." },
      ],
      { maxTokens: 20, temperature: 0 }
    );

    const latencyMs = Date.now() - start;
    const success = response.content.toLowerCase().includes("success") || response.content.length > 0;

    return NextResponse.json({
      success,
      content: response.content,
      model: response.model,
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message, latencyMs }, { status: 502 });
  }
}
