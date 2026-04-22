import { describe, expect, it } from "vitest";
import {
  buildTsFromJson,
  createBcryptHash,
  decodeBase64Unicode,
  decryptAesText,
  decodeJwt,
  encryptAesText,
  encodeBase64Unicode,
  formatSql,
  hashText,
  obfuscateJavaScript,
  verifyBcryptHash,
} from "./dev-tools";

describe("dev tools", () => {
  it("generates valid root interface without duplicate alias", () => {
    const input = `{"id":1,"name":"Yusuf","active":true}`;
    const result = buildTsFromJson(input, "ApiResponse");

    expect(result.error).toBeNull();
    expect(result.output).toContain("export interface ApiResponse");
    expect(result.output).not.toContain("export type ApiResponse = ApiResponse;");
  });

  it("round-trips unicode base64", () => {
    const input = "Merhaba dünya 👋";
    const encoded = encodeBase64Unicode(input);
    const decoded = decodeBase64Unicode(encoded);

    expect(decoded).toBe(input);
  });

  it("decodes a valid jwt", () => {
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiWXVzdWYiLCJpYXQiOjE1MTYyMzkwMjJ9.signature";
    const result = decodeJwt(token);

    expect(result.error).toBeNull();
    expect(result.header).toContain('"alg": "HS256"');
    expect(result.payload).toContain('"name": "Yusuf"');
    expect(result.signature).toBe("signature");
  });

  it("rejects malformed jwt", () => {
    const result = decodeJwt("not-a-jwt");
    expect(result.error).toBeTruthy();
  });

  it("formats sql into multiple readable lines", () => {
    const sql = "select id,name from users where is_active = 1 and city = 'Istanbul' order by created_at desc";
    const result = formatSql(sql);

    expect(result).toContain("\nFROM");
    expect(result).toContain("\nWHERE");
    expect(result).toContain("\n  AND");
    expect(result).toContain("\nORDER BY");
  });

  it("hashes text with sha-256", async () => {
    const result = await hashText("abc", "SHA-256");
    expect(result.hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("encrypts and decrypts text with aes", async () => {
    const encrypted = await encryptAesText("gizli metin", "super-secret");
    const decrypted = await decryptAesText(encrypted, "super-secret");

    expect(encrypted.split(".")).toHaveLength(3);
    expect(decrypted).toBe("gizli metin");
  });

  it("creates and verifies bcrypt hashes", async () => {
    const hash = await createBcryptHash("parola123", 6);

    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyBcryptHash("parola123", hash)).resolves.toBe(true);
    await expect(verifyBcryptHash("yanlis", hash)).resolves.toBe(false);
  });

  it("obfuscates javascript source", () => {
    const source = "const answer = 42; console.log(answer);";
    const result = obfuscateJavaScript(source);

    expect(result).not.toBe(source);
    expect(result.length).toBeGreaterThan(0);
  });
});
