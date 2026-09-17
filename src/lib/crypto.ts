import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "@/llm/config";

const LOCAL_KEY_FILE = path.join(process.cwd(), ".data", "encryption.key");

/**
 * The key that encrypts connection secrets. Production must set BUDERA_ENCRYPTION_KEY; local development without
 * DATABASE_URL gets a random key stored next to the embedded database (both are gitignored).
 */
function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = env.BUDERA_ENCRYPTION_KEY?.trim();
  if (configured) return createHash("sha256").update(configured).digest();
  if (env.DATABASE_URL) {
    throw new ConfigError("Saving secrets needs BUDERA_ENCRYPTION_KEY on the server. Set it to a long random string and restart.");
  }
  try {
    return Buffer.from(readFileSync(LOCAL_KEY_FILE, "utf8").trim(), "hex");
  } catch {
    const key = randomBytes(32);
    mkdirSync(path.dirname(LOCAL_KEY_FILE), { recursive: true });
    writeFileSync(LOCAL_KEY_FILE, key.toString("hex"), { mode: 0o600 });
    return key;
  }
}

/** AES-256-GCM. The result is "v1.<iv>.<tag>.<ciphertext>", base64url encoded. */
export function encryptJson(value: Record<string, string>, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptJson(sealed: string, env?: NodeJS.ProcessEnv): Record<string, string> {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new ConfigError("A stored secret is unreadable. Reconnect this service.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as Record<string, string>;
  } catch {
    throw new ConfigError("A stored secret can't be decrypted. The encryption key may have changed; reconnect this service.");
  }
}

/** The last few characters of a secret, so owners can tell which key is saved. */
export function secretHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.startsWith("{")) {
    try {
      const email = (JSON.parse(trimmed) as { client_email?: string }).client_email;
      if (email) return email;
    } catch {
      // fall through to the generic hint
    }
  }
  return trimmed.length <= 8 ? "••••" : `••••${trimmed.slice(-4)}`;
}
