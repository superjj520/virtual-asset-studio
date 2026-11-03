#!/usr/bin/env node
/**
 * 把 App 内置的 Shisei 法线清单（electron/services/shisei-catalog.ts）导出成
 * ComfyUI 节点包能读的 JSON。
 *
 * 为什么要导出而不是各存一份：
 * 同一份 944 张的清单在仓库里已经有过「抄三遍然后三处不一致」的教训（画风预设）。
 * 这里让 TS 当唯一真相，Python 侧读导出的 JSON，导完可以比对条数。
 *
 * 用法：node scripts/export-shisei-catalog.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "electron/services/shisei-catalog.ts");
const OUT = join(ROOT, "comfyui-vas-nodes/normal-catalog.json");

const text = readFileSync(SRC, "utf8");

// 每一条都是单行对象字面量，字段顺序固定：series / id / name / category / views。
// 文件里现在有两份清单（SHISEI_POSES 与 SHISEI_PHOTOS），形状一样，
// 所以必须只切 SHISEI_POSES 那一段——否则两份会被加在一起，张数对不上。
const posesBlock = text.slice(
  text.indexOf("export const SHISEI_POSES:"),
  text.indexOf("export const SHISEI_NORMAL_COUNT"),
);
const photosBlock = text.slice(
  text.indexOf("export const SHISEI_PHOTOS:"),
  text.indexOf("export const SHISEI_PHOTO_COUNT"),
);
const rowRe = /series:\s*"([^"]+)",\s*id:\s*"([^"]+)",\s*name:\s*"([^"]*)",\s*category:\s*"([^"]*)",\s*views:\s*"([^"]*)"/g;

const read = (block) => {
  const out = [];
  for (const m of block.matchAll(rowRe)) {
    const [, series, id, name, category, views] = m;
    out.push({ series, id, name, category, views });
  }
  return out;
};

const poses = read(posesBlock);
// 实拍照片只有 20 个姿势有（89 张），形状相同但清单不同，所以分开给。
const photos = read(photosBlock);

if (!poses.length) {
  console.error("✗ 一条都没解析出来，检查 shisei-catalog.ts 的格式");
  process.exit(1);
}
if (!posesBlock) {
  console.error("✗ 没找到 SHISEI_POSES 段，检查生成脚本还写不写这个名字");
  process.exit(1);
}

const declared = Number(/SHISEI_NORMAL_COUNT\s*=\s*(\d+)/.exec(text)?.[1] ?? 0);
const expanded = poses.reduce((sum, p) => sum + p.views.split(",").filter(Boolean).length, 0);

if (declared && declared !== expanded) {
  console.error(`✗ 展开张数对不上：清单写 ${declared}，按 views 数出来 ${expanded}`);
  process.exit(1);
}

const photoExpanded = photos.reduce(
  (sum, p) => sum + p.views.split(",").filter(Boolean).length,
  0,
);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      count: expanded,
      photoCount: photoExpanded,
      // clay 与 normal 是同一批、同文件名，只换目录：poses 这一段两者共用。
      poses,
      photos,
    },
    null,
    1,
  )}\n`,
  "utf8",
);
console.log(
  `✓ 导出 ${poses.length} 个姿势 / ${expanded} 张（clay 与 normal 共用这一份）` +
    `、${photos.length} 个姿势 / ${photoExpanded} 张实拍 → ${OUT}`,
);
