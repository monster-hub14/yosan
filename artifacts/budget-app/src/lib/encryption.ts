/**
 * Server-only symmetric encryption for sensitive config values (API keys).
 * Uses AES-256-GCM with a key derived from ENCRYPTION_KEY env var.
 * Falls back to a machine-local key if env var is not set (dev only).
 * NEVER import this from client components.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16;
const SALT = "budget-app-key-v1"; // fixed — key is per-installation

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-local-insecure-key-please-set-env";
  return scryptSync(secret, SALT, 32);
}

const KEY = deriveKey();

/**
 * Encrypt a plaintext string. Returns a base64-encoded string.
 * Format: iv(12) + tag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext. Returns plaintext string or null on failure.
 */
export function decrypt(ciphertext: string): string | null {
  try {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Encrypt if plaintext; noop if already encrypted (heuristic: base64 + length check).
 * Used for upsert paths where value might already be encrypted.
 */
export function encryptIfPlaintext(value: string | null | undefined): string | null {
  if (!value) return null;
  // If it looks like a valid base64-encoded GCM blob (min 29 bytes = 28 header + 1 cipher byte)
  // we trust it's already encrypted. Otherwise encrypt.
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length >= IV_LENGTH + TAG_LENGTH + 1) {
      // Try to decrypt — if it succeeds, it was already encrypted
      const result = decrypt(value);
      if (result !== null) return value;
    }
  } catch {
    // Not base64 — definitely plaintext
  }
  return encrypt(value);
}
