import { readFileSync } from "node:fs";
import { basename } from "node:path";

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
      /** 整条片子最多等多久，超了就中断并释放缓存，默认 20 分钟。 */
      timeoutMs?: number;
      /** 连续几次「既不在队列、也不在 history」才判定任务丢了，默认 2 次。 */
      lostPolls?: number;
    },
  ) {}

  /** prompt_id → 首次查询时间；prompt_id → 连续丢失次数。 */
  private readonly startedAt = new Map<string, number>();
  private readonly lostCount = new Map<string, number>();

  private base(): string | undefined {
    return this.options.baseUrl()?.trim().replace(/\/+$/, "") || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.base());
  }

  /**
   * 出片前看一眼内存：16 GB 机器上 AnimateDiff 要 4 GB 出头，参考图越大越吃。
   * 预检失败（老版本没这个接口）就放行，绝不因为预检本身挡掉出片。
   */
  private async memoryGuard(frames: number, width = 512, height = 512): Promise<void> {
    const base = this.base();
    if (!base) return;
    let ramFree = 0;
    let ramTotal = 0;
    try {
      const response = await fetchProvider("comfyui", `${base}/system_stats`, { method: "GET" }, 8_000);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        system?: { ram_free?: number; ram_total?: number };
      };
      ramFree = Number(payload.system?.ram_free ?? 0);
      ramTotal = Number(payload.system?.ram_total ?? 0);
    } catch {
      return;
    }
    if (!ramFree || !ramTotal) return;
    // 实测标定：512×512×16 帧在剩 3–5 GB 时能过，剩 1 GB 时必炸（ComfyUI 当时自己报 Need 1.3 GB）。
    // 关键点——ComfyUI 自己会缓存模型，ram_free 低不等于跑不动（模型已在显存里），
    // 所以只看「明显没救」的硬地板 2 GB，估出来的需求量只在提示里报给你，不拿来拦。
    const pixels = (width * height) / (512 * 512);
    const need = (3.0 + frames * 0.05 * pixels) * 1024 ** 3;
    const floor = 2 * 1024 ** 3;
    if (ramFree < floor) {
      const free = Math.round(ramFree / 1024 ** 3);
      const want = Math.round(need / 1024 ** 3);
      throw new Error(
        `本机内存不够出这段视频：现在只剩约 ${free} GB 可用，这条 ${frames} 帧大约要 ${want} GB。` +
          "先关掉其它出片任务或把时长降到 2 秒以内再试；也可以把底模换成 sd_xl_turbo 省一截。",
      );
    }
  }

  /** 任务因为内存挂掉时，让 ComfyUI 把模型吐出来，下次别接着崩。 */
  private async releaseMemory(): Promise<void> {
    const base = this.base();
    if (!base) return;
    await fetchProvider(
      "comfyui",
      `${base}/free`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      },
      10_000,
    ).catch(() => undefined);
  }

  /** 把 ComfyUI 的英文报错翻成能照着做的中文。 */
  private explain(error: unknown): string {
    const raw = typeof error === "string" ? error : JSON.stringify(error ?? "");
    if (/not enough memory|out of memory|OutOfMemory/i.test(raw))
      return (
        "本机内存不足，ComfyUI 采样阶段被系统打断了。" +
        "把时长降到 2 秒（16 帧）以内、或换回 512×512 横版再试；已经顺手让它释放了模型缓存。"
      );
    return raw.slice(0, 300);
  }

  /** 把本地参考图传进 ComfyUI 的 input 目录，返回它认得的文件名。 */
  private async uploadImage(path: string, mediaType: string): Promise<string> {
    const base = this.base();
    if (!base) throw new Error("尚未配置 ComfyUI 地址，无法上传参考图。");
    const form = new FormData();
    form.append("image", new Blob([readFileSync(path)], { type: mediaType }), basename(path) || "reference.png");
    form.append("overwrite", "true");
    const response = await fetchProvider("comfyui", `${base}/upload/image`, { method: "POST", body: form }, 60_000);
    if (!response.ok) throw new Error(`ComfyUI 参考图上传失败（${response.status}）`);
    const payload = (await response.json()) as { name?: string; subfolder?: string };
    if (!payload.name) throw new Error("ComfyUI 参考图上传没有返回文件名。");
    return payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name;
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
  }, referenceName?: string): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
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

    // 图生视频：参考图 → 缩放成训练分辨率 → VAE 编码成首帧 → 复制成 N 帧 → 低 denoise 采样，
    // 这样画面从原图长出来，只加运动不加主角，比纯文生视频稳得多。
    if (referenceName) {
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
        "3": { class_type: "LoadImage", inputs: { image: referenceName, upload: "image" } },
        "4": {
          class_type: "ImageScale",
          inputs: { image: ["3", 0], upscale_method: "lanczos", width, height, crop: "center" },
        },
        "5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
        "6": { class_type: "RepeatLatentBatch", inputs: { samples: ["5", 0], amount: frames } },
        "7": { class_type: "CLIPTextEncode", inputs: { text: input.prompt, clip: ["1", 1] } },
        "8": {
          class_type: "CLIPTextEncode",
          inputs: { text: "形变, 人物换脸, 文字, 水印, 模糊, 畸形, 低质量", clip: ["1", 1] },
        },
        "9": {
          class_type: "KSampler",
          inputs: {
            seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
            steps: 4,
            cfg: 1.5,
            sampler_name: "euler",
            scheduler: "normal",
            // 0.55 是实测折中：低于 0.4 几乎只有轻微呼吸，高于 0.7 会开始重画主体。
            denoise: 0.55,
            model: ["2", 0],
            positive: ["7", 0],
            negative: ["8", 0],
            latent_image: ["6", 0],
          },
        },
        "10": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["1", 2] } },
        "11": {
          class_type: "VHS_VideoCombine",
          inputs: {
            images: ["10", 0],
            frame_rate: ANIMATE_FPS,
            loop_count: 0,
            filename_prefix: "studio_anim_i2v",
            format: "video/h264-mp4",
            pingpong: false,
            save_output: true,
          },
        },
      };
    }

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
    // 图生视频只在本机 animate 引擎上支持（Wan2.1 的 i2v 权重没装）。
    if (input.referencePath && this.mode() === "wan") {
      return {
        id: "unsupported",
        status: "failed",
        error: { message: "Wan2.1 只接了文生视频；要图生视频请把视频引擎切回 AnimateDiff Lightning。" },
      };
    }
    const referenceName = input.referencePath
      ? await this.uploadImage(input.referencePath, input.referenceMediaType ?? "image/png")
      : undefined;
    const { width, height } = this.dimensions(input.size);
    await this.memoryGuard(this.mode() === "animate" ? this.frames(input.seconds) : 33, width, height);
    const workflow = this.buildWorkflow(input, referenceName);
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
    const started = this.startedAt.get(id) ?? Date.now();
    this.startedAt.set(id, started);
    const timeoutMs = this.options.timeoutMs ?? 20 * 60 * 1000;
    if (Date.now() - started > timeoutMs) {
      await this.abortAndRelease();
      this.forget(id);
      return {
        id,
        status: "failed",
        error: {
          message: `等了 ${Math.round(timeoutMs / 60000)} 分钟还没出片，已经中断这条任务并释放 ComfyUI 缓存。多半是本机内存吃紧（先看 sysctl vm.swapusage），降帧数或换快底模再试。`,
        },
      };
    }

    const entry = await this.history(id);
    if (!entry) {
      const lost = await this.isLost(id);
      if (lost) {
        this.forget(id);
        return {
          id,
          status: "failed",
          error: {
            message:
              "这条任务在 ComfyUI 里已经不见了（服务重启或队列被清空）。重新生成一次即可，不会重复扣费。",
          },
        };
      }
      return { id, status: "in_progress", progress: 0.15 };
    }
    if (entry.status?.status_str === "error") {
      const raw = JSON.stringify(entry.status.messages ?? []);
      if (/not enough memory|out of memory/i.test(raw)) await this.releaseMemory();
      this.forget(id);
      return { id, status: "failed", error: { message: `ComfyUI 执行失败：${this.explain(raw)}` } };
    }
    const files = this.files(entry);
    if (entry.status?.completed && files.length) {
      this.forget(id);
      return { id, status: "completed", progress: 1 };
    }
    return { id, status: "in_progress", progress: 0.6 };
  }

  /** 任务是否已经既不在队列、也查不到 history —— 服务重启后队列会被清空。 */
  private async isLost(id: string): Promise<boolean> {
    const base = this.base();
    if (!base) return false;
    let queued: string[] = [];
    try {
      const response = await fetchProvider("comfyui", `${base}/queue`, { method: "GET" }, 15_000);
      const payload = (await response.json()) as {
        queue_running?: unknown[];
        queue_pending?: unknown[];
      };
      queued = [...(payload.queue_running ?? []), ...(payload.queue_pending ?? [])]
        .map((item) => (Array.isArray(item) ? String(item[1] ?? "") : ""))
        .filter(Boolean);
    } catch {
      return false; // 队列查不到就当好着，别误杀
    }
    if (queued.includes(id)) {
      this.lostCount.delete(id);
      return false;
    }
    const count = (this.lostCount.get(id) ?? 0) + 1;
    this.lostCount.set(id, count);
    return count >= (this.options.lostPolls ?? 2);
  }

  /** 中断当前任务并释放缓存；两条命令都是尽力而为，失败不影响报错。 */
  private async abortAndRelease(): Promise<void> {
    const base = this.base();
    if (!base) return;
    await fetchProvider("comfyui", `${base}/interrupt`, { method: "POST" }, 15_000).catch(() => undefined);
    await fetchProvider(
      "comfyui",
      `${base}/free`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      },
      20_000,
    ).catch(() => undefined);
  }

  private forget(id: string): void {
    this.startedAt.delete(id);
    this.lostCount.delete(id);
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
