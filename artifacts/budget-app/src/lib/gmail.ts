/**
 * Gmail API helpers for receipt import.
 * Uses https://www.googleapis.com/auth/gmail.readonly scope only.
 * NEVER import this from client components.
 */

import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class GmailRevokedError extends Error {
  constructor(userId: string) {
    super(`Gmail token revoked for user ${userId}. Reconnect required.`);
    this.name = "GmailRevokedError";
  }
}

/**
 * Thrown when a stored token cannot be used.
 * reason="null"  — decrypt() returned null (ciphertext is corrupt or key mismatch).
 * reason="empty" — decrypt succeeded but produced an empty string.
 */
export class GmailDecryptError extends Error {
  constructor(
    public readonly which: "access" | "refresh" | "oauth_config",
    public readonly reason: "null" | "empty"
  ) {
    super(`Gmail ${which} token ${reason === "null" ? "could not be decrypted" : "is empty"}. Reconnect required.`);
    this.name = "GmailDecryptError";
  }
}

/** Thrown when token refresh fails for a non-revocation reason. */
export class GmailRefreshError extends Error {
  constructor(
    public readonly detail: string,
    public readonly googleError?: string
  ) {
    super(`Gmail token refresh failed: ${detail}`);
    this.name = "GmailRefreshError";
  }
}

/** Thrown when the Gmail API returns a non-2xx response. */
export class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly googleMessage: string,
    public readonly googleBody?: unknown
  ) {
    super(`Gmail API error ${status}: ${googleMessage}`);
    this.name = "GmailApiError";
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_REFRESH_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

async function getOAuthConfig() {
  const cfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg?.clientId || !cfg?.clientSecret) {
    throw new Error("Gmail OAuth is not configured. Ask your admin to set Client ID and Secret.");
  }
  const clientId = decrypt(cfg.clientId);
  const clientSecret = decrypt(cfg.clientSecret);
  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth credentials could not be decrypted. Re-enter your credentials in Gmail OAuth settings.");
  }
  return { clientId, clientSecret };
}

/**
 * Returns a valid access token for the given user.
 * Refreshes if expired.
 * Throws GmailRevokedError if the refresh token is revoked.
 * Throws GmailDecryptError if a stored token cannot be decrypted.
 * Throws GmailRefreshError if refresh fails for a non-revocation reason.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const LOG = "[gmail-token]";

  const conn = await db.gmailConnection.findUnique({ where: { userId } });
  if (!conn) {
    console.log(`${LOG} userId=${userId} connection=not_found`);
    throw new GmailRevokedError(userId);
  }
  if (conn.isRevoked) {
    console.log(`${LOG} userId=${userId} connection=found isRevoked=true`);
    throw new GmailRevokedError(userId);
  }
  console.log(`${LOG} userId=${userId} connection=found isRevoked=false`);

  const decryptedAccess = decrypt(conn.accessToken);
  const decryptedRefresh = decrypt(conn.refreshToken);
  console.log(
    `${LOG} access_token_present=${decryptedAccess !== null && decryptedAccess !== "" ? "yes" : "no"} ` +
    `refresh_token_present=${decryptedRefresh !== null && decryptedRefresh !== "" ? "yes" : "no"}`
  );

  if (decryptedAccess === null) throw new GmailDecryptError("access", "null");
  if (decryptedAccess === "") throw new GmailDecryptError("access", "empty");
  if (decryptedRefresh === null) throw new GmailDecryptError("refresh", "null");
  if (decryptedRefresh === "") throw new GmailDecryptError("refresh", "empty");

  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (conn.expiresAt > fiveMinutesFromNow) {
    console.log(`${LOG} token_expiry=valid expiresAt=${conn.expiresAt.toISOString()}`);
    return decryptedAccess;
  }
  console.log(`${LOG} token_expiry=needs_refresh expiresAt=${conn.expiresAt.toISOString()}`);

  console.log(`${LOG} refresh_attempt=start`);
  const { clientId, clientSecret } = await getOAuthConfig();
  const res = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedRefresh,
      grant_type: "refresh_token",
    }),
  });

  console.log(`${LOG} refresh_http_status=${res.status}`);
  const data = (await res.json()) as TokenResponse;

  if (data.error || !data.access_token) {
    console.error(`${LOG} refresh_error="${data.error}" description="${data.error_description ?? ""}"`);

    const isRevoked =
      data.error === "invalid_grant" ||
      data.error === "token_revoked" ||
      data.error_description?.includes("Token has been expired or revoked");

    if (isRevoked) {
      await db.gmailConnection.update({ where: { userId }, data: { isRevoked: true } });
      console.log(`${LOG} marked_revoked=true`);
      throw new GmailRevokedError(userId);
    }
    throw new GmailRefreshError(
      data.error_description ?? data.error ?? "unknown",
      data.error
    );
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in - 30) * 1000);
  await db.gmailConnection.update({
    where: { userId },
    data: {
      accessToken: encrypt(data.access_token),
      expiresAt: newExpiresAt,
    },
  });
  console.log(`${LOG} refresh_success=true newExpiresAt=${newExpiresAt.toISOString()}`);

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------

interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

export async function fetchGmailLabels(
  userId: string
): Promise<{ id: string; name: string }[]> {
  const LOG = "[gmail-labels]";

  const token = await getValidAccessToken(userId);
  console.log(`${LOG} token_acquired=yes`);

  const url = `${GMAIL_API_BASE}/labels`;
  console.log(`${LOG} api_request=start url=${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`${LOG} api_response_status=${res.status}`);

  if (!res.ok) {
    let googleBody: unknown;
    let googleMessage = res.statusText;
    try {
      googleBody = await res.json();
      const body = googleBody as { error?: { message?: string } };
      if (body?.error?.message) googleMessage = body.error.message;
    } catch {
      // Non-JSON error body — keep statusText
    }
    console.error(`${LOG} api_error status=${res.status} message="${googleMessage}"`, googleBody ?? "");
    throw new GmailApiError(res.status, googleMessage, googleBody);
  }

  const data = (await res.json()) as { labels?: GmailLabel[] };
  const labels = data.labels ?? [];
  console.log(`${LOG} labels_received=${labels.length}`);

  return labels
    .filter((l) => l.type !== "SYSTEM" || isUsefulSystemLabel(l.id))
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isUsefulSystemLabel(id: string): boolean {
  return ["INBOX", "STARRED", "IMPORTANT"].includes(id);
}

interface MessageListItem {
  id: string;
  threadId: string;
}

interface MessageListItemWithDate {
  id: string;
  internalDate: number;
}

interface MessageListResponse {
  messages?: MessageListItem[];
  nextPageToken?: string;
}

interface MessageMetadataResponse {
  id: string;
  internalDate?: string;
}

export interface FetchMessageIdsOptions {
  maxResults?: number;
  cutoffDate?: Date | null;
}

/**
 * Fetches message IDs for all given label IDs, deduplicates globally,
 * sorts newest-first by internalDate, then caps at maxResults.
 */
export async function fetchMessageIds(
  userId: string,
  labelIds: string[],
  options: FetchMessageIdsOptions = {}
): Promise<string[]> {
  const { maxResults = 50, cutoffDate } = options;

  const token = await getValidAccessToken(userId);
  const seen = new Set<string>();
  const allIds: string[] = [];

  let query = "";
  if (cutoffDate) {
    const epochSeconds = Math.floor(cutoffDate.getTime() / 1000);
    query = `after:${epochSeconds}`;
  }

  // Step 1: collect candidate IDs from all labels (deduplicated)
  // Fetch enough candidates to have a good global pool before capping
  const candidateLimit = Math.min(maxResults * 4, 500);

  for (const labelId of labelIds) {
    const params = new URLSearchParams({
      labelIds: labelId,
      maxResults: String(candidateLimit),
    });
    if (query) params.set("q", query);

    const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error(`[gmail] fetchMessageIds label=${labelId} failed: ${res.status}`);
      continue;
    }

    const data = (await res.json()) as MessageListResponse;
    for (const msg of data.messages ?? []) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        allIds.push(msg.id);
      }
    }
  }

  if (allIds.length === 0) return [];

  // Step 2: fetch internalDate for each candidate in parallel batches
  // to enable global newest-first sorting
  const BATCH_SIZE = 20;
  const withDates: MessageListItemWithDate[] = [];

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (msgId) => {
        const r = await fetch(
          `${GMAIL_API_BASE}/messages/${msgId}?format=metadata&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return null;
        const meta = (await r.json()) as MessageMetadataResponse;
        return {
          id: msgId,
          internalDate: parseInt(meta.internalDate ?? "0", 10),
        };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        withDates.push(r.value);
      }
    }
  }

  // Step 3: sort newest-first, cap at maxResults
  withDates.sort((a, b) => b.internalDate - a.internalDate);
  return withDates.slice(0, maxResults).map((m) => m.id);
}

export interface MessageAttachmentInfo {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export interface ParsedGmailMessage {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  textBody: string;
  htmlBody: string;
  attachments: MessageAttachmentInfo[];
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: GmailMessageHeader[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export async function fetchMessageDetail(
  userId: string,
  messageId: string
): Promise<ParsedGmailMessage> {
  const token = await getValidAccessToken(userId);
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch message ${messageId}: ${res.status}`);
  }

  const msg = (await res.json()) as GmailMessage;
  const payload = msg.payload;

  const headers: Record<string, string> = {};
  for (const h of payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const receivedAt = msg.internalDate
    ? new Date(parseInt(msg.internalDate, 10))
    : new Date();

  let textBody = "";
  let htmlBody = "";
  const attachments: MessageAttachmentInfo[] = [];

  function walk(part: GmailMessagePart) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      textBody += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      htmlBody += decodeBase64Url(part.body.data);
    } else if (
      part.filename &&
      part.body?.attachmentId &&
      isReceiptAttachment(part.mimeType, part.filename)
    ) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size ?? 0,
      });
    }
    for (const subpart of part.parts ?? []) {
      walk(subpart);
    }
  }

  if (payload) walk(payload);

  return {
    messageId,
    sender: headers["from"] ?? "",
    subject: headers["subject"] ?? "(no subject)",
    receivedAt,
    textBody,
    htmlBody,
    attachments,
  };
}

function isReceiptAttachment(mimeType: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  const allowedMimes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
  ]);
  return (
    allowedMimes.has(mimeType) ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}

function decodeBase64Url(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export async function downloadAttachment(
  userId: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const token = await getValidAccessToken(userId);
  const res = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Failed to download attachment ${attachmentId}: ${res.status}`);
  }
  const data = (await res.json()) as { data?: string };
  if (!data.data) throw new Error("Empty attachment data");
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

// ---------------------------------------------------------------------------
// OAuth URL builder
// ---------------------------------------------------------------------------

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "select_account consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}> {
  const res = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as TokenResponse & { refresh_token?: string };
  if (data.error || !data.access_token) {
    throw new Error(
      `Token exchange failed: ${data.error_description ?? data.error ?? "unknown"}`
    );
  }
  if (!data.refresh_token) {
    throw new Error("No refresh token returned. Ensure offline access and consent prompt.");
  }

  const expiresAt = new Date(Date.now() + (data.expires_in - 30) * 1000);

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const userInfo = (await userRes.json()) as { email?: string };
  const email = userInfo.email ?? "";

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    email,
  };
}
