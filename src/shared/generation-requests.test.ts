import { describe, expect, it } from "vitest";
import {
  buildFalImageRequest,
  FAL_FLUX_SCHNELL_MODEL,
  FAL_MOSS_IMAGE_MODEL,
} from "./generation-requests";

describe("fal 图像请求体", () => {
  it("MOSS 使用 50 步、guidance 3 和自定义尺寸", () => {
    const request = buildFalImageRequest({
      prompt: "一张中文电影海报，标题是《月下东方》",
      negative: "错字，水印",
      size: "1024x1536",
      model: FAL_MOSS_IMAGE_MODEL,
    });
    expect(request).toMatchObject({
      prompt: "一张中文电影海报，标题是《月下东方》",
      negative_prompt: "错字，水印",
      image_size: { width: 1024, height: 1536 },
      num_inference_steps: 50,
      guidance_scale: 3,
      num_images: 1,
      output_format: "png",
      enable_prompt_expansion: true,
      enable_safety_checker: true,
    });
  });

  it("MOSS 显式种子写入请求，未填时不发送 seed", () => {
    const seeded = buildFalImageRequest({
      prompt: "海报",
      size: "1024x1536",
      model: FAL_MOSS_IMAGE_MODEL,
      seed: 123456,
    });
    expect(seeded).toMatchObject({ seed: 123456 });
    const random = buildFalImageRequest({
      prompt: "海报",
      size: "1024x1536",
      model: FAL_MOSS_IMAGE_MODEL,
    });
    expect(random).not.toHaveProperty("seed");
  });

  it("MOSS 空负向词不发送空字段", () => {
    const request = buildFalImageRequest({
      prompt: "海报",
      negative: "   ",
      size: "1024x1024",
      model: FAL_MOSS_IMAGE_MODEL,
    });
    expect(request).not.toHaveProperty("negative_prompt");
  });

  it("FLUX 保持 4 步快速参数，不混入 MOSS 参数", () => {
    const request = buildFalImageRequest({
      prompt: "写实人物",
      negative: "畸形",
      size: "1536x1024",
      model: FAL_FLUX_SCHNELL_MODEL,
    });
    expect(request).toMatchObject({
      prompt: "写实人物",
      image_size: { width: 1536, height: 1024 },
      num_inference_steps: 4,
      num_images: 1,
    });
    expect(request).not.toHaveProperty("negative_prompt");
    expect(request).not.toHaveProperty("guidance_scale");
  });
});
