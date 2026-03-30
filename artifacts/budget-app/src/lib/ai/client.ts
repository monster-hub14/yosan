/**
 * Server-only AI client factory.
 * Returns a provider-appropriate fetch wrapper for completions.
 * NEVER import this from client components.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | AIMessageContent[];
}

export interface AIMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
  isEnabled: boolean;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const config = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.isEnabled) return null;

  // Decrypt API key at retrieval time — never store or return plaintext
  const decryptedKey = config.apiKey ? decrypt(config.apiKey) : null;

  return {
    provider: config.provider,
    model: config.model,
    apiKey: decryptedKey,
    baseUrl: config.baseUrl,
    isEnabled: config.isEnabled,
  };
}

function getBaseUrl(config: AIConfig): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, "");
  switch (config.provider) {
    case "OPENAI": return "https://api.openai.com/v1";
    case "ANTHROPIC": return "https://api.anthropic.com";
    case "GOOGLE": return "https://generativelanguage.googleapis.com/v1beta";
    case "OLLAMA": return "http://localhost:11434/v1";
    case "CUSTOM": return "";
    default: return "https://api.openai.com/v1";
  }
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export class AIClientError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "AIClientError";
  }
}

/**
 * Call the configured AI provider with a chat completion request.
 * Returns structured text content.
 */
export async function chatCompletion(
  config: AIConfig,
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<ChatCompletionResponse> {
  const { maxTokens = 2048, temperature = 0.1, jsonMode = false } = options ?? {};
  const baseUrl = getBaseUrl(config);

  if (config.provider === "ANTHROPIC") {
    return callAnthropic(config, baseUrl, messages, { maxTokens, temperature });
  }
  if (config.provider === "GOOGLE") {
    return callGoogle(config, baseUrl, messages, { maxTokens, temperature });
  }
  // OpenAI-compatible: OpenAI, Ollama, Custom
  return callOpenAICompat(config, baseUrl, messages, { maxTokens, temperature, jsonMode });
}

async function callOpenAICompat(
  config: AIConfig,
  baseUrl: string,
  messages: AIMessage[],
  opts: { maxTokens: number; temperature: number; jsonMode: boolean }
): Promise<ChatCompletionResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  };
  if (opts.jsonMode) body["response_format"] = { type: "json_object" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new AIClientError(`OpenAI-compat error ${res.status}: ${err}`, res.status);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, model: data.model ?? config.model };
}

async function callAnthropic(
  config: AIConfig,
  baseUrl: string,
  messages: AIMessage[],
  opts: { maxTokens: number; temperature: number }
): Promise<ChatCompletionResponse> {
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (config.apiKey) headers["x-api-key"] = config.apiKey;

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: userMessages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    })),
  };
  if (systemMsg) body["system"] = typeof systemMsg.content === "string" ? systemMsg.content : "";

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new AIClientError(`Anthropic error ${res.status}: ${err}`, res.status);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text ?? "";
  return { content, model: data.model ?? config.model };
}

async function callGoogle(
  config: AIConfig,
  baseUrl: string,
  messages: AIMessage[],
  opts: { maxTokens: number; temperature: number }
): Promise<ChatCompletionResponse> {
  const parts = messages
    .filter((m) => m.role !== "system")
    .flatMap((m) => {
      if (typeof m.content === "string") return [{ text: m.content }];
      return m.content.map((c) =>
        c.type === "image_url" && c.image_url
          ? { inlineData: { mimeType: "image/jpeg", data: c.image_url.url.split(",")[1] ?? "" } }
          : { text: c.text ?? "" }
      );
    });

  const systemInstruction = messages.find((m) => m.role === "system");
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature },
  };
  if (systemInstruction) {
    body["systemInstruction"] = {
      parts: [{ text: typeof systemInstruction.content === "string" ? systemInstruction.content : "" }],
    };
  }

  const url = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey ?? ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new AIClientError(`Google error ${res.status}: ${err}`, res.status);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { content, model: config.model };
}
