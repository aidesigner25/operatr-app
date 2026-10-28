import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { assertCredentialVaultConfiguration, getServerEnvironment } from "@/lib/server/env";

export const CREDENTIAL_PROVIDERS = ["openai", "anthropic", "google", "xai", "tavily", "apify"] as const;
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

const ENCRYPTION_VERSION = 1;
const ALGORITHM = "aes-256-gcm";

export type EncryptedCredential = {
  ciphertext: string;
  encryptionVersion: number;
  keyId: string;
  lastFour: string;
};

function encryptionKey(): Buffer {
  assertCredentialVaultConfiguration();
  const secret = getServerEnvironment().encryptionSecret!;
  const key = Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length !== 32) {
    throw new Error("OPERATR_KEY_ENCRYPTION_SECRET must decode to exactly 32 bytes.");
  }
  return key;
}

function keyId(): string {
  return process.env.OPERATR_KEY_ENCRYPTION_KEY_ID?.trim() || "primary-v1";
}

function aad(userId: string, provider: CredentialProvider): Buffer {
  return Buffer.from(`operatr:v${ENCRYPTION_VERSION}:${userId}:${provider}`, "utf8");
}

export function isCredentialProvider(value: string): value is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

export function validateCredential(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const credential = value.trim();
  if (credential.length < 8 || credential.length > 4096 || /[\u0000-\u001f\u007f]/.test(credential)) return null;
  return credential;
}

/** Encrypts a credential with AES-256-GCM and binds it to its owner and provider. */
export function encryptCredential(
  credential: string,
  userId: string,
  provider: CredentialProvider,
): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(aad(userId, provider));
  const encrypted = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encoded = (part: Buffer) => part.toString("base64url");

  return {
    ciphertext: `v${ENCRYPTION_VERSION}.${keyId()}.${encoded(iv)}.${encoded(authTag)}.${encoded(encrypted)}`,
    encryptionVersion: ENCRYPTION_VERSION,
    keyId: keyId(),
    lastFour: credential.slice(-4),
  };
}

/** Reserved for the future provider-runtime path; never return its result to an API response. */
export function decryptCredential(
  ciphertext: string,
  userId: string,
  provider: CredentialProvider,
): string {
  const [version, storedKeyId, ivPart, tagPart, encryptedPart] = ciphertext.split(".");
  if (version !== `v${ENCRYPTION_VERSION}` || storedKeyId !== keyId() || !ivPart || !tagPart || !encryptedPart) {
    throw new Error("Credential uses an unavailable encryption key version.");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(aad(userId, provider));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}
