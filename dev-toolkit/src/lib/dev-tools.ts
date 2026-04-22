import bcrypt from "bcryptjs";
import JavaScriptObfuscator from "javascript-obfuscator";

export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

const PBKDF2_ITERATIONS = 200_000;

type BufferLike = {
  from(value: string | Uint8Array, encoding?: string): { toString(encoding: string): string } | Uint8Array;
};

function getBuffer(): BufferLike | null {
  const candidate = (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer;
  return candidate ?? null;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto bu ortamda desteklenmiyor.");
  }
  return globalThis.crypto;
}

function bytesToBase64(bytes: Uint8Array): string {
  const runtimeBuffer = getBuffer();
  if (runtimeBuffer) {
    return (runtimeBuffer.from(bytes) as { toString(encoding: string): string }).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const runtimeBuffer = getBuffer();
  if (runtimeBuffer) {
    return Uint8Array.from(runtimeBuffer.from(value, "base64") as Uint8Array);
  }

  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function toPascalCase(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") || "GeneratedType"
  );
}

export function toPropertyName(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

export function decodeBase64Unicode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4 || 4)) % 4), "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Unicode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function readJwtDate(value: unknown): string | null {
  if (typeof value !== "number") return null;
  return new Date(value * 1000).toLocaleString("tr-TR");
}

export function decodeJwt(token: string): {
  header: string;
  payload: string;
  signature: string;
  meta: string[];
  error: string | null;
} {
  const parts = token.trim().split(".");

  if (parts.length !== 3) {
    return {
      header: "",
      payload: "",
      signature: "",
      meta: [],
      error: "JWT üç parçadan oluşmalı: header.payload.signature",
    };
  }

  try {
    const headerValue = JSON.parse(decodeBase64Unicode(parts[0]));
    const payloadValue = JSON.parse(decodeBase64Unicode(parts[1]));
    const meta: string[] = [];
    const issuedAt = readJwtDate((payloadValue as Record<string, unknown>).iat);
    const expiresAt = readJwtDate((payloadValue as Record<string, unknown>).exp);
    const notBefore = readJwtDate((payloadValue as Record<string, unknown>).nbf);

    if (issuedAt) meta.push(`Issued at: ${issuedAt}`);
    if (notBefore) meta.push(`Not before: ${notBefore}`);
    if (expiresAt) meta.push(`Expires: ${expiresAt}`);

    return {
      header: formatJson(headerValue),
      payload: formatJson(payloadValue),
      signature: parts[2],
      meta,
      error: null,
    };
  } catch (error) {
    return {
      header: "",
      payload: "",
      signature: parts[2] ?? "",
      meta: [],
      error: error instanceof Error ? error.message : "JWT çözümlenemedi.",
    };
  }
}

export function buildTsFromJson(input: string, rootName: string): { output: string; error: string | null } {
  const parsed = JSON.parse(input);
  const interfaceBodies = new Map<string, string>();
  const nameCounts = new Map<string, number>();

  function reserveName(baseName: string): string {
    const cleaned = toPascalCase(baseName);
    const count = nameCounts.get(cleaned) ?? 0;
    nameCounts.set(cleaned, count + 1);
    return count === 0 ? cleaned : `${cleaned}${count + 1}`;
  }

  function getObjectTypeName(baseName: string, body: string): string {
    const existing = Array.from(interfaceBodies.entries()).find(([, candidate]) => candidate === body);
    if (existing) return existing[0];

    const finalName = reserveName(baseName);
    interfaceBodies.set(finalName, body);
    return finalName;
  }

  function renderType(value: unknown, hint: string): string {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      if (value.length === 0) return "unknown[]";
      const itemTypes = Array.from(new Set(value.map((item) => renderType(item, `${hint}Item`))));
      return `(${itemTypes.join(" | ")})[]`;
    }

    switch (typeof value) {
      case "string":
        return "string";
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "object": {
        const objectValue = value as Record<string, unknown>;
        const body = Object.entries(objectValue)
          .map(([key, nestedValue]) => `  ${toPropertyName(key)}: ${renderType(nestedValue, `${hint}${toPascalCase(key)}`)};`)
          .join("\n");
        return getObjectTypeName(hint, body || "  [key: string]: unknown;");
      }
      default:
        return "unknown";
    }
  }

  const rootTypeName = toPascalCase(rootName);
  const rootType = renderType(parsed, rootTypeName);
  const definitions = Array.from(interfaceBodies.entries()).map(([name, body]) => `export interface ${name} {\n${body}\n}`);
  const rootIsNamedInterface = interfaceBodies.has(rootTypeName) && rootType === rootTypeName;

  const output = rootIsNamedInterface
    ? definitions.join("\n\n")
    : definitions.length > 0
      ? `${definitions.join("\n\n")}\n\nexport type ${rootTypeName} = ${rootType};`
      : `export type ${rootTypeName} = ${rootType};`;

  return { output, error: null };
}

export function formatSql(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  const keywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "FULL JOIN",
    "JOIN",
    "ON",
    "UNION",
    "INSERT INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE FROM",
  ];

  let formatted = compact;

  keywords.forEach((keyword) => {
    const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "gi");
    formatted = formatted.replace(pattern, keyword);
  });

  formatted = formatted.replace(/\bAND\b/gi, "AND").replace(/\bOR\b/gi, "OR");

  [
    "SELECT",
    "FROM",
    "WHERE",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "FULL JOIN",
    "JOIN",
    "UNION",
    "INSERT INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE FROM",
  ].forEach((keyword) => {
    const pattern = new RegExp(`\\s*\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "g");
    formatted = formatted.replace(pattern, `\n${keyword}`);
  });

  formatted = formatted
    .replace(/\nON\b/g, "\n  ON")
    .replace(/\s*,\s*/g, ",\n  ")
    .replace(/\s+AND\s+/g, "\n  AND ")
    .replace(/\s+OR\s+/g, "\n  OR ")
    .replace(/^\n+/, "")
    .trim();

  return formatted;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptAesText(plainText: string, passphrase: string): Promise<string> {
  if (!passphrase.trim()) {
    throw new Error("Şifre alanı boş bırakılamaz.");
  }

  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(plainText),
  );

  return [bytesToBase64(salt), bytesToBase64(iv), bytesToBase64(new Uint8Array(encrypted))].join(".");
}

export async function decryptAesText(payload: string, passphrase: string): Promise<string> {
  if (!passphrase.trim()) {
    throw new Error("Şifre alanı boş bırakılamaz.");
  }

  const [saltPart, ivPart, cipherPart] = payload.trim().split(".");
  if (!saltPart || !ivPart || !cipherPart) {
    throw new Error("Payload biçimi geçersiz. Beklenen biçim: salt.iv.ciphertext");
  }

  try {
    const crypto = getCrypto();
    const salt = base64ToBytes(saltPart);
    const iv = base64ToBytes(ivPart);
    const cipher = base64ToBytes(cipherPart);
    const key = await deriveAesKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Şifre yanlış ya da payload bozuk.");
  }
}

export async function createBcryptHash(value: string, rounds = 10): Promise<string> {
  const safeRounds = Math.min(14, Math.max(4, Math.trunc(rounds) || 10));
  return bcrypt.hash(value, safeRounds);
}

export async function verifyBcryptHash(value: string, hashedValue: string): Promise<boolean> {
  if (!hashedValue.trim()) return false;
  return bcrypt.compare(value, hashedValue);
}

export function obfuscateJavaScript(input: string): string {
  if (!input.trim()) return "";

  return JavaScriptObfuscator.obfuscate(input, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    target: "browser",
  }).getObfuscatedCode();
}

export async function hashText(value: string, algorithm: HashAlgorithm): Promise<{ hex: string; base64: string }> {
  const crypto = getCrypto();
  const bytes = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest(algorithm, bytes);
  const digest = new Uint8Array(buffer);
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hex, base64: bytesToBase64(digest) };
}
