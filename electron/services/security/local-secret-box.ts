import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PREFIX = "local:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export const isLocalSecret = (value: string | undefined): boolean =>
  Boolean(value?.startsWith(PREFIX));

/**
 * 本机加密存储：密钥文件只落在当前用户目录，权限 0600。
 * 不使用 macOS 钥匙串，因此重新打包不会触发系统授权；
 * 代价是同一登录用户可读取密钥文件，适合本地单机创作工具。
 */
export class LocalSecretBox {
  private readonly keyPath: string;
  private cachedKey?: Buffer;

  constructor(userDataDirectory: string) {
    this.keyPath = join(userDataDirectory, "credentials.key");
  }

  isAvailable(): boolean {
    return true;
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
  }

  decrypt(value: string): string {
    if (!isLocalSecret(value)) {
      throw new Error("旧版钥匙串凭据需要重新保存一次 API Key。");
    }
    const payload = value.slice(PREFIX.length).split(".");
    if (payload.length !== 3) throw new Error("本机凭据格式损坏。");
    const [iv, tag, ciphertext] = payload;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private key(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    if (existsSync(this.keyPath)) {
      const key = readFileSync(this.keyPath);
      if (key.length !== KEY_BYTES) throw new Error("本机凭据密钥长度不正确。");
      this.cachedKey = key;
      return key;
    }
    mkdirSync(dirname(this.keyPath), { recursive: true, mode: 0o700 });
    const key = randomBytes(KEY_BYTES);
    writeFileSync(this.keyPath, key, { mode: 0o600 });
    chmodSync(this.keyPath, 0o600);
    this.cachedKey = key;
    return key;
  }
}
