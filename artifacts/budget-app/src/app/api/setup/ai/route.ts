import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";

const VALID_PROVIDERS = ["OPENAI", "ANTHROPIC", "GOOGLE", "OLLAMA", "CUSTOM"] as const;

export async function POST(request: NextRequest) {
  try {
    const denied = await guardSetupRoute(request);
    if (denied) return denied;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { provider, model, apiKey, baseUrl } = body as {
      provider?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    };

    if (!provider || !model || !apiKey) {
      return NextResponse.json(
        { error: "Provider, model, and API key are required" },
        { status: 400 }
      );
    }

    const normalizedProvider = provider.toUpperCase() as (typeof VALID_PROVIDERS)[number];
    if (!VALID_PROVIDERS.includes(normalizedProvider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    await db.aIProviderConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        provider: normalizedProvider,
        model,
        apiKey,
        baseUrl: baseUrl || null,
        isEnabled: true,
      },
      update: {
        provider: normalizedProvider,
        model,
        apiKey,
        baseUrl: baseUrl || null,
        isEnabled: true,
      },
    });

    await db.setupProgress.update({
      where: { id: "singleton" },
      data: { aiConfigured: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[setup/ai]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
