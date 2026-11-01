import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalSecretBox, isLocalSecret } from "./local-secret-box";

describe("LocalSecretBox", () => {
  it("加密后可在同一目录解密，且不保存明文", () => {
    const dir = mkdtempSync(join(tmpdir(), "vas-secret-"));
    const box = new LocalSecretBox(dir);
    const ciphertext = box.encrypt("fal-test-key-1234567890");
    expect(isLocalSecret(ciphertext)).toBe(true);
    expect(ciphertext).not.toContain("fal-test-key");
    expect(new LocalSecretBox(dir).decrypt(ciphertext)).toBe("fal-test-key-1234567890");
    expect(statSync(join(dir, "credentials.key")).mode & 0o777).toBe(0o600);
  });

  it("拒绝旧版钥匙串密文并提示重新保存", () => {
    const box = new LocalSecretBox(mkdtempSync(join(tmpdir(), "vas-secret-")));
    expect(() => box.decrypt("old-safe-storage-ciphertext")).toThrow("重新保存");
  });

  it("密钥文件固定复用，不会重复生成", () => {
    const dir = mkdtempSync(join(tmpdir(), "vas-secret-"));
    const box = new LocalSecretBox(dir);
    const first = box.encrypt("one");
    const key = readFileSync(join(dir, "credentials.key"));
    expect(new LocalSecretBox(dir).decrypt(first)).toBe("one");
    expect(readFileSync(join(dir, "credentials.key"))).toEqual(key);
  });
});
