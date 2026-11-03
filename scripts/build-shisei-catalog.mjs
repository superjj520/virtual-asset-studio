#!/usr/bin/env node
/**
 * 把 Shisei 的 catalog.json 生成为 App 内置的 TypeScript 清单。
 *
 * 为什么内置而不是每次去拉：raw.githubusercontent 在体检时被限速吊住过
 * （20 秒超时都拿不到），清单要是也得联网，整个素材库会看起来是坏的。
 * 内置之后只有图片本身需要网络，清单永远可用。
 *
 * 生成两份清单：
 * - SHISEI_POSES：有 clay / depth / normal 的那 270 个姿势（944 个视角）。
 *   三种图是同一批、同文件名、只换目录，所以一份清单够三处用。
 * - SHISEI_PHOTOS：89 张 AI 生成的人像照片（20 个姿势），只有 photo 目录有。
 *
 * 用法：
 *   curl -sSL --noproxy '*' -o /tmp/shisei-catalog.json \
 *     https://raw.githubusercontent.com/wquguru/shisei/main/data/catalog.json
 *   node scripts/build-shisei-catalog.mjs /tmp/shisei-catalog.json
 *
 * 授权：图像 CC0 1.0（可商用、可修改、可再分发），见 docs/R52-SHISEI-CC0-ASSESSMENT.md。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "electron/services/shisei-catalog.ts");
const source = process.argv[2] ?? "/tmp/shisei-catalog.json";

const poses = JSON.parse(readFileSync(source, "utf8"));
if (!Array.isArray(poses) || poses.length === 0) {
  console.error("✗ catalog.json 读不出数组");
  process.exit(1);
}

// 视角顺序固定：图库和节点下拉都按它排，顺序变了用户会觉得「选项乱跳」。
const VIEW_ORDER = ["front", "diag", "side", "above", "below"];
const orderedViews = (record) =>
  VIEW_ORDER.filter((view) => record && record[view]).join(",");

const mapPoses = [];
const photoPoses = [];
for (const pose of poses) {
  const views = orderedViews(pose.maps);
  if (views) {
    mapPoses.push({
      series: pose.series,
      id: pose.id,
      name: pose.name_cn || pose.name_en || pose.id,
      category: pose.class_cn || pose.class_en || "",
      views,
    });
  }
  const photos = orderedViews(pose.photos);
  if (photos) {
    photoPoses.push({
      series: pose.series,
      id: pose.id,
      name: pose.name_cn || pose.name_en || pose.id,
      category: pose.class_cn || pose.class_en || "",
      views: photos,
    });
  }
}

const countOf = (list) =>
  list.reduce((sum, pose) => sum + pose.views.split(",").filter(Boolean).length, 0);
const mapCount = countOf(mapPoses);
const photoCount = countOf(photoPoses);

if (mapCount === 0 || photoCount === 0) {
  console.error(`✗ 展开张数为零：maps ${mapCount} / photos ${photoCount}`);
  process.exit(1);
}

const render = (list, name) =>
  `export const ${name}: ShiseiPoseEntry[] = [\n${list
    .map(
      (p) =>
        `  { series: ${JSON.stringify(p.series)}, id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(
          p.name,
        )}, category: ${JSON.stringify(p.category)}, views: ${JSON.stringify(p.views)} },`,
    )
    .join("\n")}\n];\n`;

const text = `/**
 * Shisei 姿势清单（内置，不联网）。
 *
 * 由 \`node scripts/build-shisei-catalog.mjs <catalog.json>\` 生成，不要手改。
 *
 * - SHISEI_POSES：${mapPoses.length} 个姿势 / ${mapCount} 个视角，是 clay、depth、normal 三种图的共同清单
 *   （同一批姿势、同一套文件名 \`{series}_{id}_{view}.webp\`，只有目录不同）。
 * - SHISEI_PHOTOS：${photoPoses.length} 个姿势 / ${photoCount} 张 AI 生成人像照片，只有 photo 目录有。
 *
 * 授权：图像 CC0 1.0（可商用、可修改、可再分发），见 docs/R52-SHISEI-CC0-ASSESSMENT.md。
 */
export type ShiseiPoseEntry = {
  series: string;
  id: string;
  name: string;
  category: string;
  /** 该姿势实际存在的视角，逗号分隔：front,diag,side,above,below 的任意子集。 */
  views: string;
};

${render(mapPoses, "SHISEI_POSES")}
export const SHISEI_NORMAL_COUNT = ${mapCount};
export const SHISEI_CLAY_COUNT = ${mapCount};

${render(photoPoses, "SHISEI_PHOTOS")}
export const SHISEI_PHOTO_COUNT = ${photoCount};
`;

writeFileSync(OUT, text, "utf8");
console.log(
  `✓ 生成 ${OUT}\n  clay/depth/normal 共用清单：${mapPoses.length} 姿势 / ${mapCount} 张\n  photo 清单：${photoPoses.length} 姿势 / ${photoCount} 张`,
);
