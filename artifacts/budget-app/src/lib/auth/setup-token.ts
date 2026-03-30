import { SignJWT, jwtVerify } from "jose";

const SETUP_COOKIE = "budget_setup";
const SETUP_MAX_AGE = 60 * 60 * 24 * 365 * 10;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }
  return new TextEncoder().encode(secret);
}

export { SETUP_COOKIE, SETUP_MAX_AGE };

export async function createSetupToken(): Promise<string> {
  return new SignJWT({ setupDone: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifySetupToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.setupDone === true;
  } catch {
    return false;
  }
}
