import { describe, expect, it } from "vitest";
import {
  applyWorkflowOverrides,
  listWorkflowParameters,
  parameterKey,
} from "./workflow-parameters";

const workflow = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.5,
      sampler_name: "euler",
      model: ["4", 0],
      positive: ["6", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "a woman", clip: ["4", 1] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "vas", images: ["8", 0] },
  },
};

describe("工作流参数识别", () => {
  it("只列出能改的标量字段，连线和强制连接不算", () => {
    const { parameters, linkedInputs } = listWorkflowParameters(workflow);
    const inputs = parameters.map((item) => item.input).sort();
    expect(inputs).toEqual(["cfg", "ckpt_name", "filename_prefix", "sampler_name", "seed", "steps", "text"]);
    expect(linkedInputs).toBe(4); // model / positive / clip / images
  });

  it("没有 studio 元数据时用「节点 / 字段」当标签", () => {
    const { parameters } = listWorkflowParameters(workflow);
    const steps = parameters.find((item) => item.input === "steps");
    expect(steps?.label).toBe("3 / steps");
    expect(steps?.group).toBe("其他参数");
    expect(steps?.recommended).toBe(false);
  });

  it("按 _meta.studio.controls 给出标签、分组和枚举", () => {
    const annotated = {
      "3": {
        class_type: "KSampler",
        inputs: { steps: 20, sampler_name: "euler" },
        _meta: {
          title: "采样器",
          studio: {
            controls: [
              { input: "steps", label: "步数", description: "越高越细但越慢", group: "采样" },
              {
                input: "sampler_name",
                label: "采样器",
                group: "采样",
                options: [
                  { value: "euler", label: "欧拉" },
                  { value: "dpmpp_2m", label: "DPM++ 2M" },
                ],
              },
            ],
          },
        },
      },
    };
    const { parameters } = listWorkflowParameters(annotated);
    expect(parameters.map((item) => item.label)).toEqual(["步数", "采样器"]);
    expect(parameters.every((item) => item.group === "采样" && item.recommended)).toBe(true);
    expect(parameters[1].kind).toBe("enum");
    expect(parameters[1].options?.map((option) => option.label)).toEqual(["欧拉", "DPM++ 2M"]);
  });

  it("推荐参数排在前面", () => {
    const annotated = {
      "3": {
        inputs: { steps: 20, cfg: 7.5 },
        _meta: { studio: { controls: [{ input: "cfg", label: "引导强度" }] } },
      },
    };
    const { parameters } = listWorkflowParameters(annotated);
    expect(parameters[0].input).toBe("cfg");
  });

  it("声明了但字段不存在的元数据会被报出来", () => {
    const stale = {
      "3": {
        inputs: { steps: 20 },
        _meta: { title: "采样器", studio: { controls: [{ input: "cfg", label: "引导强度" }] } },
      },
    };
    const { staleHints } = listWorkflowParameters(stale);
    expect(staleHints).toEqual(["采样器 / cfg"]);
  });
});

describe("覆盖值写回", () => {
  it("只改指定字段，不改原对象", () => {
    const report = listWorkflowParameters(workflow);
    const overrides = {
      [parameterKey("3", "steps")]: 30,
      [parameterKey("6", "text")]: "a man",
    };
    const result = applyWorkflowOverrides(workflow, overrides, report);
    const patched = result.workflow as typeof workflow;
    expect(patched["3"].inputs.steps).toBe(30);
    expect(patched["6"].inputs.text).toBe("a man");
    expect(workflow["3"].inputs.steps).toBe(20); // 原对象没被改
    expect(result.applied).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("类型对不上就跳过，不把字符串写进数字字段", () => {
    const report = listWorkflowParameters(workflow);
    const result = applyWorkflowOverrides(workflow, { [parameterKey("3", "steps")]: "30" }, report);
    expect(result.skipped).toEqual(["3/steps"]);
    expect((result.workflow as typeof workflow)["3"].inputs.steps).toBe(20);
  });

  it("覆盖一个被连线的字段时跳过", () => {
    const report = listWorkflowParameters(workflow);
    const result = applyWorkflowOverrides(workflow, { [parameterKey("3", "model")]: "x" }, report);
    expect(result.skipped).toEqual(["3/model"]);
  });

  it("工作流换成没有该节点的新图时跳过，不凭空造节点", () => {
    const report = listWorkflowParameters(workflow);
    const replaced = { "5": { inputs: { width: 1024 } } };
    const result = applyWorkflowOverrides(replaced, { [parameterKey("3", "steps")]: 30 }, report);
    expect(result.skipped).toEqual(["3/steps"]);
    expect((result.workflow as typeof replaced)["5"]).toBeDefined();
    expect((result.workflow as Record<string, unknown>)["3"]).toBeUndefined();
  });
});

describe("占位符与隐藏字段", () => {
  it("整串是占位符的字段不生成控件，只计数", () => {
    const report = listWorkflowParameters({
      "3": { class_type: "KSampler", inputs: { seed: "{{seed}}", steps: "{{steps}}", cfg: 7 } },
      "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{checkpoint}}" } },
      "5": { class_type: "SaveImage", inputs: { filename_prefix: "vas" } },
    });
    expect(report.parameters.map((p) => `${p.nodeId}/${p.input}`)).toEqual(["3/cfg", "5/filename_prefix"]);
    expect(report.placeholderInputs).toBe(3);
  });

  it("hiddenInputs 里的字段既不生成控件也不计入占位符", () => {
    const report = listWorkflowParameters({
      "3": {
        class_type: "KSampler",
        inputs: { cfg: 7, denoise: 1 },
        _meta: { title: "采样器", studio: { hiddenInputs: ["denoise"] } },
      },
    });
    expect(report.parameters.map((p) => p.input)).toEqual(["cfg"]);
    expect(report.placeholderInputs).toBe(0);
  });

  it("节点级 studio 声明生效，没声明的字段进「其他参数」", () => {
    const report = listWorkflowParameters({
      "3": {
        class_type: "KSampler",
        inputs: { cfg: 7, steps: 20 },
        _meta: {
          title: "采样器",
          studio: {
            controls: [
              { input: "cfg", label: "CFG 强度", group: "采样", description: "越高越贴提示词" },
            ],
          },
        },
      },
    });
    const cfg = report.parameters.find((p) => p.input === "cfg");
    expect(cfg?.label).toBe("CFG 强度");
    expect(cfg?.group).toBe("采样");
    expect(cfg?.recommended).toBe(true);
    const steps = report.parameters.find((p) => p.input === "steps");
    expect(steps?.group).toBe("其他参数");
    expect(steps?.recommended).toBe(false);
  });

  it("把别的节点的参数写在同一份声明里时按 node 字段匹配，不报过期", () => {
    const report = listWorkflowParameters({
      "3": {
        inputs: { cfg: 7 },
        _meta: {
          title: "采样器",
          studio: {
            controls: [
              { input: "cfg", label: "CFG 强度" },
              { input: "batch_size", node: "5", label: "每批张数" },
            ],
          },
        },
      },
      "5": { inputs: { batch_size: 1 }, _meta: { title: "空 latent" } },
    });

    expect(report.staleHints).toEqual([]);
    const batch = report.parameters.find((p) => p.input === "batch_size");
    expect(batch?.label).toBe("每批张数");
    expect(batch?.recommended).toBe(true);
  });
});
