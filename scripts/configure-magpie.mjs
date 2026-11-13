#!/usr/bin/env node
/**
 * 把本机 Magpie 免费池写进本应用的设置库。
 *
 * 为什么要有这个脚本：模型连接页是给「人手一次」准备的，但免费池的网关地址、
 * 出图模型、文本路由组要跟着 manage.sh 每天重建的池子一起用，所以这里直接写设置库，
 * 保证重装/换机后一条命令就能恢复。凭据用应用自己的 local:v1 格式加密，不碰钥匙串。
 *
 * 用法：
 *   node scripts/configure-magpie.mjs                 # 写入默认配置并切换路由
 *   node scripts/configure-magpie.mjs --dry-run       # 只看会写什么
 *   node scripts/configure-magpie.mjs --base http://127.0.0.1:3425/v1 --image freeimg/flux
 *   node scripts/configure-magpie.mjs --no-route      # 只存凭据，不改文字/出图路由
 *   node scripts/configure-magpie.mjs --revert        # 还原上一次改动
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";

const PREFIX = "local:v1:";
const DEFAULTS = {
  base: "http://127.0.0.1:3425/v1",
  image: "freeimg/flux",
  text: "group/free-token-pool",
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const userData =
  option("user-data", null) ??
  (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "virtual-asset-studio")
    : join(homedir(), ".config", "virtual-asset-studio"));
const dbPath = join(userData, "virtual-asset-studio.sqlite");
const keyPath = join(userData, "credentials.key");
const backupPath = join(userData, "magpie-config-backup.json");

for (const [label, path] of [["设置库", dbPath], ["凭据密钥", keyPath]]) {
  if (!existsSync(path)) {
    console.error(`找不到${label}：${path}\n先运行一次应用（npm start）让它初始化本机数据。`);
    process.exit(1);
  }
}

const key = readFileSync(keyPath);
const encrypt = (value) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
};
const decrypt = (value) => {
  if (!value?.startsWith(PREFIX)) return null;
  const [iv, tag, data] = value.slice(PREFIX.length).split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};
// 只有真像密钥的值才打码：模型 id、路由组、网关地址都要原样显示才看得出配得对不对。
const mask = (value) =>
  value && /^(sk-|rc-|ak-|Bearer )/.test(value) ? `${value.slice(0, 5)}…${value.slice(-4)}` : value;

const db = new BetterSqlite3(dbPath);
const readAll = () =>
  Object.fromEntries(db.prepare("select key, value from settings").all().map((row) => [row.key, row.value]));

if (flag("revert")) {
  if (!existsSync(backupPath)) {
    console.error(`没有可还原的备份：${backupPath}`);
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  const before = readAll();
  const upsert = db.prepare(
    "insert into settings (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
  );
  const remove = db.prepare("delete from settings where key = ?");
  db.transaction(() => {
    for (const [name, value] of Object.entries(backup.present)) upsert.run(name, value, new Date().toISOString());
    for (const name of backup.absent ?? []) if (!(name in backup.present)) remove.run(name);
  })();
  const after = readAll();
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (before[name] !== after[name])
      console.log(`  ${name}: ${mask(before[name]) ?? "(无)"} → ${mask(after[name]) ?? "(已删除)"}`);
  console.log(`已还原 ${backupPath}`);
  process.exit(0);
}

const before = readAll();
const want = {
  magpie_api_key: encrypt(option("base", DEFAULTS.base)),
  magpie_image_model: option("image", DEFAULTS.image),
  magpie_text_model: option("text", DEFAULTS.text),
  ...(flag("no-route") ? {} : { route_text: "magpie", route_image: "magpie" }),
};

const decryptable = decrypt(want.magpie_api_key);
if (decryptable !== option("base", DEFAULTS.base)) {
  console.error("加密自检失败：写进去的地址解不出来，已中止。");
  process.exit(1);
}

if (flag("dry-run")) {
  console.log(`设置库：${dbPath}`);
  for (const [name, value] of Object.entries(want)) {
    const current = name === "magpie_api_key" ? decrypt(before[name]) : before[name];
    console.log(`  ${name}: ${mask(current) ?? "(无)"} → ${mask(name === "magpie_api_key" ? decryptable : value)}`);
  }
  process.exit(0);
}

if (!existsSync(backupPath)) {
  const present = {};
  for (const name of Object.keys(want)) if (before[name] !== undefined) present[name] = before[name];
  writeFileSync(backupPath, `${JSON.stringify({ present, absent: Object.keys(want) }, null, 2)}\n`, { mode: 0o600 });
}

const upsert = db.prepare(
  "insert into settings (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
);
db.transaction(() => {
  for (const [name, value] of Object.entries(want)) upsert.run(name, value, new Date().toISOString());
})();

const after = readAll();
console.log(`网关地址：${decrypt(after.magpie_api_key)}`);
console.log(`出图模型：${after.magpie_image_model}`);
console.log(`文本路由：${after.magpie_text_model}`);
console.log(`文字路由：${after.route_text ?? "(默认)"}    出图路由：${after.route_image ?? "(默认)"}`);
console.log(`改动已写入 ${dbPath}；备份在 ${backupPath}，可 --revert 还原。`);
