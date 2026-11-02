import { describe, expect, it } from "vitest";
import { compilePrompt } from "../../electron/services/creation/prompt-compiler";
import type { CreativeCard } from "../shared/types";

/**
 * 身份一致性的对照条件。
 *
 * R20 修了提示词自相矛盾，但只验证到「文本不再打架」，
 * 没跑真出图。这次先把「对比成立的前提」钉死：同一张卡、同一种子，
 * 只改身份锚点里的发色，其余提示词必须逐字一致——
 * 否则出来的两张图不一样，也说明不了发色是不是跟着锚点走。
 *
 * 真出图（花钱，约 0.05–0.15 美元/张）留成手动步骤：
 *   配好 FAL_API_KEY 后，用下面两张卡的 prompt 分别提交，
 *   种子固定，对比发色是否随锚点变化。
 */

const baseCard = (hair: string): CreativeCard => ({
  id: "card-identity-check",
  intent: "角色主视觉",
  subject: "东亚女性",
  identityAnchor: `圆脸、单眼皮、二十二岁、${hair}、齐肩直发`,
  mustKeep: "沿用参考板中的脸型、五官、肤色、年龄感、发色与发型走向，不重新设计",
  bodyAndWardrobe: "月白改良汉服、细金色头饰",
  expressionAndPose: "安静站立、重心在左腿",
  scene: "午后侧逆光、庭院石阶",
  lighting: "自然光",
  camera: "半身像",
  style: "写真",
  aspectRatio: "3:4",
  avoid: "拼贴、分屏、多个主体、水印",
} as CreativeCard);

describe("身份一致性的对照条件", () => {
  it("两张卡只有发色不同，其余提示词逐字一致", () => {
    const black = compilePrompt(baseCard("黑发")).positive;
    const blonde = compilePrompt(baseCard("金发")).positive;
    expect(black.replace(/黑发/g, "发色占位")).toBe(
      blonde.replace(/金发/g, "发色占位"),
    );
  });

  it("发色确实进入送模提示词的身份锚点模块", () => {
    const modules = compilePrompt(baseCard("金发")).modules;
    const anchor = modules.find((item) => item.label === "身份锚点");
    expect(anchor?.value).toContain("金发");
  });

  it("负面提示词完全相同，对比不受它影响", () => {
    expect(compilePrompt(baseCard("黑发")).negative).toBe(
      compilePrompt(baseCard("金发")).negative,
    );
  });
});

/**
 * 真出图对比。默认跳过。
 *
 *   RUN_REAL_GENERATION=1 FAL_API_KEY=xxx npx vitest run identity-consistency
 *
 * 会提交两次 fal flux/schnell（每张约 0.05 美元），同一种子、
 * 同一提示词，只有身份锚点里的发色不同，把两张图落到
 * artifacts/identity-consistency/ 供肉眼比对发色。
 */
const realGeneration = process.env.RUN_REAL_GENERATION === "1" && Boolean(process.env.FAL_API_KEY);

describe.skipIf(!realGeneration)("真出图对比（花钱，需显式开启）", () => {
  it(
    "同一张卡只改发色，出两张图",
    async () => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const outDir = join(process.cwd(), "artifacts/identity-consistency");
      await mkdir(outDir, { recursive: true });
      const seed = 20261103;

      for (const hair of ["黑发", "金发"]) {
        const prompt = compilePrompt(baseCard(hair)).positive;
        const created = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
          method: "POST",
          headers: {
            Authorization: `Key ${process.env.FAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            image_size: { width: 768, height: 1024 },
            num_inference_steps: 4,
            num_images: 1,
            seed,
            output_format: "png",
          }),
        });
        expect(created.ok).toBe(true);
        const task = (await created.json()) as { request_id: string; status_url: string; response_url: string };

        let imageUrl = "";
        for (let attempt = 0; attempt < 120 && !imageUrl; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const status = (await fetch(task.status_url, {
            headers: { Authorization: `Key ${process.env.FAL_API_KEY}` },
          })).ok
            ? ((await (await fetch(task.status_url, {
                headers: { Authorization: `Key ${process.env.FAL_API_KEY}` },
              })).json()) as { status?: string })
            : {};
          if (status.status === "COMPLETED") {
            const result = (await (await fetch(task.response_url, {
              headers: { Authorization: `Key ${process.env.FAL_API_KEY}` },
            })).json()) as { images?: Array<{ url?: string }> };
            imageUrl = result.images?.[0]?.url ?? "";
          }
        }
        expect(imageUrl).toBeTruthy();
        const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
        await writeFile(join(outDir, `${hair}.png`), bytes);
      }
    },
    300_000,
  );
});
