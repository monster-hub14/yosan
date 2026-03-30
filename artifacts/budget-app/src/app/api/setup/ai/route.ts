import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { provider, model, apiKey, baseUrl } = await request.json();

    if (!provider || !model || !apiKey) {
      return NextResponse.json(
        { error: "Provider, model, and API key are required" },
        { status: 400 }
      );
    }

    await db.aIProviderConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        provider,
        model,
        apiKey,
        baseUrl: baseUrl || null,
        isEnabled: true,
      },
      update: {
        provider,
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
