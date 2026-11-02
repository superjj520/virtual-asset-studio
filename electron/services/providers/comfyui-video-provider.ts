import { fetchProvider } from "./request";

const DEFAULT_UNET = "wan2.1_t2v_1.3B_fp16.safetensors";
const DEFAULT_CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const DEFAULT_VAE = "wan_2.1_vae.safetensors";
const DEFAULT_MOTION = "animatediff_lightning_4step_comfyui.safetensors";
const WAN_FPS = 16;
const ANIMATE_FPS = 8;

export type ComfyVideoRemote = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { message?: string };
};

type ComfyHistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<string, { images?: ComfyFile[]; videos?: ComfyFile[]; gifs?: ComfyFile[] }>;
};

type ComfyFile = { filename?: string; subfolder?: string; type?: string };

/**
 * 本机 ComfyUI 出视频，两种引擎：
 * - animate（默认）：SD1.5 checkpoint + AnimateDiff Lightning，4 步出 16 帧短视频，16 GB 机器实测 66 秒可用；
 * - wan：Wan2.1 文生视频，画质更好但需要 T5+UNet 约 9 GB，16 GB 机器会把 swap 打满，仅在更大内存机器上选。
 * ComfyUI 没有远程任务编号，这里直接把它的 prompt_id 当编号，由 getVideo 轮询、downloadVideo 取回 mp4。
 */
export class ComfyUiVideoProvider {
  constructor(
    private readonly options: {
      baseUrl: () => string | undefined;
      /** animate | wan，默认 animate。 */
      mode?: () => string | undefined;
      unet?: () => string | undefined;
      clip?: () => string | undefined;
      vae?: () => string | undefined;
      /** animate 模式用的 SD1.5 checkpoint，留空则回落到设置页里的默认 checkpoint。 */
      checkpoint?: () => string | undefined;
      motion?: () => string | undefined;
      /** 单帧宽度上限，超过会等比缩小，避免 16 GB 机器直接 OOM。 */
      maxWidth?: number;
      maxFrames?: number;
    },
  ) {}

  private base(): string | undefined {
    return this.options.baseUrl()?.trim().replace(/\/+$/, "") || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.base());
  }

  private mode(): "animate" | "wan" {
    return this.options.mode?.()?.trim().toLowerCase() === "wan" ? "wan" : "animate";
  }

  /** 界面展示用的模型信息，不含任何密钥。 */
  describe(): { baseUrl: string; mode: string; checkpoint: string; motion: string } {
    return {
      baseUrl: this.base() ?? "",
      mode: this.mode(),
      checkpoint: this.options.checkpoint?.()?.trim() || "",
      motion: this.options.motion?.()?.trim() || DEFAULT_MOTION,
    };
  }

  /** 画幅换算：Sora 的两个档位映射到本机引擎的训练分辨率附近。 */
  private dimensions(size: "1280x720" | "720x1280"): { width: number; height: number } {
    // 16 GB 机器上 768×512×24 帧会 OOM；而且 AnimateDiff/SD1.5 只认 512 训练分辨率，
    // 用 640×384 这类非原生比例会直接出抽象色带，所以横版固定 512×512、竖版 512×768。
    const landscape = this.mode() === "wan" ? { width: 832, height: 480 } : { width: 512, height: 512 };
    const portrait = this.mode() === "wan" ? { width: 480, height: 832 } : { width: 512, height: 768 };
    const picked = size === "720x1280" ? portrait : landscape;
    const cap = this.options.maxWidth ?? (this.mode() === "wan" ? 832 : 768);
    if (picked.width <= cap) return picked;
    const scale = cap / picked.width;
    return {
      width: Math.round((picked.width * scale) / 16) * 16,
      height: Math.round((picked.height * scale) / 16) * 16,
    };
  }

  /** 动画帧数：8 fps × 秒数，默认上限 16 帧（2 秒），16 GB 机器再多就 OOM。 */
  private frames(seconds: 4 | 8 | 12): number {
    const fps = this.mode() === "wan" ? WAN_FPS : ANIMATE_FPS;
    const wanted = Math.round(seconds * fps);
    return Math.min(wanted, this.options.maxFrames ?? (this.mode() === "wan" ? 129 : 16));
  }

  buildWorkflow(input: {
    prompt: string;
    size: "1280x720" | "720x1280";
    seconds: 4 | 8 | 12;
    seed?: number;
  }): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
    const { width, height } = this.dimensions(input.size);
    if (this.mode() === "wan") {
      const length = Math.min(Math.round(input.seconds * WAN_FPS) + 1, this.options.maxFrames ?? 129);
      return {
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: this.options.unet?.()?.trim() || DEFAULT_UNET, weight_dtype: "default" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: { clip_name: this.options.clip?.()?.trim() || DEFAULT_CLIP, type: "wan", device: "default" },
        },
        "3": { class_type: "VAELoader", inputs: { vae_name: this.options.vae?.()?.trim() || DEFAULT_VAE } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: input.prompt, clip: ["2", 0] } },
        "5": {
          class_type: "CLIPTextEncode",
          inputs: { text: "静态画面, 文字, 水印, 模糊, 抖动, 低质量", clip: ["2", 0] },
        },
        "6": { class_type: "ModelSamplingSD3", inputs: { model: ["1", 0], shift: 8 } },
        "7": { class_type: "EmptyHunyuanLatentVideo", inputs: { width, height, length, batch_size: 1 } },
        "8": {
          class_type: "KSampler",
          inputs: {
            seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
            steps: 20,
            cfg: 6,
            sampler_name: "euler",
            scheduler: "simple",
            denoise: 1,
            model: ["6", 0],
            positive: ["4", 0],
            negative: ["5", 0],
            latent_image: ["7", 0],
          },
        },
        "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
        "10": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: WAN_FPS } },
        "11": {
          class_type: "SaveVideo",
          inputs: { video: ["10", 0], filename_prefix: "studio_wan", format: "mp4", codec: "h264" },
        },
      };
    }

    const checkpoint = this.options.checkpoint?.()?.trim();
    if (!checkpoint) throw new Error("尚未设置动画出片用的 SD1.5 checkpoint。");
    const frames = this.frames(input.seconds);
    return {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
      "2": {
        class_type: "ADE_AnimateDiffLoaderGen1",
        inputs: {
          model: ["1", 0],
          model_name: this.options.motion?.()?.trim() || DEFAULT_MOTION,
          beta_schedule: "autoselect",
        },
      },
      "3": { class_type: "CLIPTextEncode", inputs: { text: input.prompt, clip: ["1", 1] } },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: "文字, 水印, 模糊, 畸形, 低质量", clip: ["1", 1] },
      },
      "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: frames } },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
          steps: 4,
          cfg: 1.5,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["2", 0],
          positive: ["3", 0],
          negative: ["4", 0],
          latent_image: ["5", 0],
        },
      },
      "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
      "8": {
        class_type: "VHS_VideoCombine",
        inputs: {
          images: ["7", 0],
          frame_rate: ANIMATE_FPS,
          loop_count: 0,
          filename_prefix: "studio_anim",
          format: "video/h264-mp4",
          pingpong: false,
          save_output: true,
        },
      },
    };
  }

  async createVideo(input: {
    prompt: string;
    model: "sora-2" | "sora-2-pro";
    size: "1280x720" | "720x1280";
    seconds: 4 | 8 | 12;
    referencePath?: string;
    referenceMediaType?: string;
    seed?: number;
  }): Promise<ComfyVideoRemote> {
    const base = this.base();
    if (!base) throw new Error("尚未配置 ComfyUI 地址，无法生成视频。");
    // 参考图暂不参与文生视频，一旦传入就明确告知，避免用户以为已生效。
    if (input.referencePath) {
      return {
        id: "unsupported",
        status: "failed",
        error: { message: "本机文生视频暂不支持参考图；请改用不带动画的图生视频通道。" },
      };
    }
    const workflow = this.buildWorkflow(input);
    const response = await fetchProvider(
      "comfyui",
      `${base}/prompt`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) },
      30_000,
    );
    const payload = (await response.json()) as { prompt_id?: string; error?: unknown };
    if (!payload.prompt_id)
      throw new Error(`ComfyUI 拒绝了视频工作流：${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
    return { id: payload.prompt_id, status: "in_progress", progress: 0 };
  }

  private async history(id: string): Promise<ComfyHistoryEntry | undefined> {
    const base = this.base();
    if (!base) throw new Error("尚未配置 ComfyUI 地址，无法生成视频。");
    const response = await fetchProvider("comfyui", `${base}/history/${encodeURIComponent(id)}`, { method: "GET" }, 20_000);
    const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
    return payload[id];
  }

  async getVideo(id: string): Promise<ComfyVideoRemote> {
    const entry = await this.history(id);
    if (!entry) return { id, status: "in_progress", progress: 0.15 };
    if (entry.status?.status_str === "error") {
      return {
        id,
        status: "failed",
        error: { message: `ComfyUI 执行失败：${JSON.stringify(entry.status.messages ?? []).slice(0, 300)}` },
      };
    }
    const files = this.files(entry);
    if (entry.status?.completed && files.length) return { id, status: "completed", progress: 1 };
    return { id, status: "in_progress", progress: 0.6 };
  }

  private files(entry: ComfyHistoryEntry): ComfyFile[] {
    return Object.values(entry.outputs ?? {}).flatMap((output) => [
      ...(output.videos ?? []),
      ...(output.gifs ?? []),
      ...(output.images ?? []),
    ]);
  }

  async downloadVideo(id: string): Promise<Buffer> {
    const base = this.base();
    if (!base) throw new Error("尚未配置 ComfyUI 地址，无法生成视频。");
    const entry = await this.history(id);
    const file = entry ? this.files(entry)[0] : undefined;
    if (!file?.filename) throw new Error("ComfyUI 尚未产出视频文件。");
    const url = `${base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder ?? "")}&type=${encodeURIComponent(file.type ?? "output")}`;
    const response = await fetchProvider("comfyui", url, { method: "GET" }, 120_000);
    return Buffer.from(await response.arrayBuffer());
  }
}
