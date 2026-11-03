#!/usr/bin/env node
/**
 * 本地素材服务的真机验收。
 *
 * 这套服务是给「本机别的程序」用的——脚本、ComfyUI、别的创作工具都靠它拿素材。
 * 所以不能只看它起没起来：要确认它真的读到了库、真的能把图按字节吐出来、
 * 搜索真的能用、路径穿越真的挡住了。
 *
 * 起一个临时端口的实例（不动用户手上那个 7788 的），跑完自己关掉。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.VAS_VERIFY_PORT || 7799);
const BASE = `http://127.0.0.1:${PORT}`;
const ENTRY = 'dist/service/materials.mjs';

let passed = 0;
const failures = [];

const check = (ok, label, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(label);
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const get = async (path) => {
  const response = await fetch(`${BASE}${path}`);
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return { status: response.status, type, body: await response.json() };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type, buffer };
};

const waitForHealth = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { status } = await get('/health');
      if (status === 200) return true;
    } catch {
      // 还没起来，继续等。
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
};

if (!existsSync(ENTRY)) {
  console.error(`找不到 ${ENTRY}，先跑 npm run build:service`);
  process.exit(1);
}

console.log(`起一个临时实例在 ${BASE} …`);
const child = spawn(process.execPath, ['--experimental-sqlite', ENTRY, `--port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
child.stdout.on('data', (chunk) => log.push(String(chunk)));
child.stderr.on('data', (chunk) => log.push(String(chunk)));

const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};
process.on('exit', stop);

try {
  const healthy = await waitForHealth(20_000);
  check(healthy, '服务起得来并响应 /health', healthy ? '' : log.join('').slice(-300));
  if (!healthy) throw new Error('服务没起来');

  const health = await get('/health');
  check(health.body?.ok === true, '/health 报 ok', `assets=${health.body?.assets}`);
  check(Number(health.body?.assets) >= 10_000, '/health 的资产数已经不是空库', `${health.body?.assets} 条`);

  const kinds = await get('/kinds');
  const kindNames = (kinds.body?.kinds ?? []).map((row) => row.kind);
  check(kindNames.includes('normal'), '/kinds 认得出法线', kindNames.slice(0, 5).join(' / '));
  check(kindNames.length >= 9, '/kinds 至少九类', `${kindNames.length} 类`);

  // 挑一个一定有图的 kind 拿一张，再看图本身。
  const list = await get('/materials?kind=normal&limit=2');
  const items = list.body?.items ?? [];
  check(list.status === 200 && items.length > 0, '能按 kind 列出素材', `total=${list.body?.total}`);
  check(
    typeof items[0]?.imageUrl === 'string' && items[0].imageUrl.startsWith('/materials/'),
    '列表项给了可取的图片地址',
    items[0]?.imageUrl,
  );

  if (items[0]?.id) {
    const image = await get(`/materials/${encodeURIComponent(items[0].id)}/image`);
    const riff = image.buffer?.subarray(0, 4).toString('latin1');
    check(image.status === 200, '图片接口返回 200');
    check((image.type ?? '').startsWith('image/'), '图片 content-type 是 image/*', image.type);
    check(riff === 'RIFF', '吐出来的真的是图片字节（WebP/RIFF 头）', `${image.buffer?.length} 字节`);
  }

  const detail = items[0]?.id ? await get(`/materials/${encodeURIComponent(items[0].id)}`) : undefined;
  check(detail?.status === 200 && detail.body?.sha256, '详情接口带 sha256 与权利信息', detail?.body?.sha256?.slice(0, 12));

  const random = await get('/random?kind=clay&count=2');
  check((random.body?.items ?? []).length === 2, '/random 能按 kind 随机取');

  const search = await get('/materials?q=%E7%AB%99%E5%A7%BF&limit=2');
  check(Number(search.body?.total) > 0, '中文搜索能命中（站姿）', `${search.body?.total} 条`);

  const traversal = await get('/outputs/..%2F..%2Fetc%2Fpasswd');
  check(traversal.status === 400 || traversal.status === 404, '路径穿越被挡', `HTTP ${traversal.status}`);

  const missing = await get('/materials/不存在的-id');
  check(missing.status === 404, '不存在的素材返回 404');

  const unknown = await get('/nope');
  check(unknown.status === 404, '未知接口返回 404');
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  stop();
  await new Promise((resolve) => setTimeout(resolve, 400));
}

console.log('');
if (failures.length) {
  console.log(`${passed} 项通过，${failures.length} 项未通过：`);
  for (const name of failures) console.log(`  - ${name}`);
  process.exit(1);
}
console.log(`${passed} 项全部通过。`);
process.exit(0);
