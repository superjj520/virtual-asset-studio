/**
 * 在 Electron 主进程里跑一次免费池自检：用应用自己的 net.fetch + 已存的加密凭据，
 * 打本机 Magpie 网关的文本与出图端点。用来验证「设置库写对了、网关通、应用网络栈通」。
 *
 *   node scripts/README 里没有它；直接跑：npx electron scripts/magpie-probe.cjs
 */
const { app, net } = require("electron");
const { createDecipheriv } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const decrypt = (value, key) => {
  if (!value || !value.startsWith("local:v1:")) return undefined;
  const [iv, tag, data] = value.slice("local:v1:".length).split(".");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
};

// 探针不是打包应用，不设名字的话 userData 会落到 ".../Electron"，找不到真实的凭据密钥。
app.setName("virtual-asset-studio");

app.whenReady().then(async () => {
  const userData = process.env.MAGPIE_USER_DATA || app.getPath("userData");
  const key = readFileSync(join(userData, "credentials.key"));
  const credential = decrypt(process.env.MAGPIE_CIPHER, key);
  if (!credential) throw new Error("没有拿到 magpie 凭据（MAGPIE_CIPHER 为空或解不开）");
  const base = /^https?:\/\//.test(credential) ? credential : "http://127.0.0.1:3425/v1";
  const headers = { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" };

  let started = Date.now();
  const textResponse = await net.fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.MAGPIE_TEXT_MODEL || "group/free-token-pool",
      messages: [{ role: "user", content: "用一句话解释景深" }],
      max_tokens: 80,
    }),
  });
  const text = await textResponse.json();
  console.log(`文本 ${textResponse.status} / ${Date.now() - started}ms → ${text.choices?.[0]?.message?.content ?? "(空)"}`);

  started = Date.now();
  const imageResponse = await net.fetch(`${base}/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.MAGPIE_IMAGE_MODEL || "freeimg/flux",
      prompt: "a ceramic mug on a cream background, soft side light, product photo",
      size: "1024x1024",
      n: 1,
    }),
  });
  const payload = await imageResponse.json();
  const first = payload.data?.[0] ?? {};
  const bytes = first.b64_json
    ? Buffer.from(first.b64_json, "base64")
    : Buffer.from(await (await net.fetch(first.url)).arrayBuffer());
  const out = join(tmpdir(), "magpie-probe.png");
  writeFileSync(out, bytes);
  console.log(`出图 ${imageResponse.status} / ${Date.now() - started}ms → ${bytes.length} bytes → ${out}`);
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
