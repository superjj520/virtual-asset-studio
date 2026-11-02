# R22 · ComfyUI 支持参考图（2026-11-02）

## 问题

R18 只做了纯文本出图。用户选 ComfyUI 又挂了参考卡时，生成流程会走 `refineWithResult` → `imageEditProviders[providerId]`，而那张表里只有 `openai` / `fal` / `gemini`：

```
模型 comfyui 尚未安装图片修订适配器。
```

更糟的是即使不报错，内置模板里也没有 `LoadImage` 节点——参考图会被静默丢掉。用户以为身份锁定了，出图其实是自由发挥。这跟「候选 1 金发 vs 黑发」是同一类失败。

## 改法

### 1. 上传参考图

`electron/services/providers/comfyui-image-provider.ts` 新增：

```ts
async uploadImage(file: { path: string; mediaType: string }): Promise<string>
```

`POST /upload/image`（multipart，字段 `image` + `overwrite=true`），返回 ComfyUI 分配的文件名；有 `subfolder` 时拼成 `subfolder/name`。

### 2. 占位符约定

```
{{reference_image}}      第一张
{{reference_image_1}}    第 1 张（与上面同值）
{{reference_image_n}}    第 n 张
```

`buildWorkflow` 现在接受 `referenceNames?: string[]`，把它们并进占位符表。

### 3. 不静默丢图

有参考图、但最终工作流里没有 `{{reference_image}}` 占位符时**直接报错**：

```
当前 ComfyUI 工作流没有 {{reference_image}} 占位符，参考图会被忽略。
请加一个 LoadImage 节点，把它的 image 写成 {{reference_image}}。
```

宁可让用户改工作流，也不能让他以为身份被锁住了。

### 4. 接到运行时

`electron/runtime.ts` 的 `imageEditProviders` 从 `{ openai, fal, gemini }` 改为 `{ openai, fal, gemini, comfyui }`。ComfyUI 的 `refineImage` 先逐张上传，再用文件名走原来的 `/prompt → /history → /view` 流程。

内置模板仍然不含 `LoadImage`——纯文本模型（SDXL）本来就没有参考图入口。要锁身份就在自定义工作流里加 LoadImage（接 IPAdapter / ControlNet / Reference Only 都行）。

## 测试

`electron/services/providers/comfyui-image-provider.test.ts` 从 8 项增到 10 项，新增：

1. **带参考图出图时先上传，再把返回的文件名注进占位符**——断言 `POST /upload/image` 收到 multipart（含 `name="image"`），且 `/prompt` 里 `LoadImage.image` 等于上传返回的名字。
2. **工作流没有参考图占位符时直接报错，不静默丢掉参考图**——断言抛错，且没有发出 `/prompt` 请求。

mock server 也要改：原来无条件 `JSON.parse(raw)`，multipart 会炸；改成 try/catch 并保留 `raw` 供断言。

## 门禁

```
npm test     89 文件 / 434 测试全过
npm run build 通过
```

## 一个踩坑

`npm run build` 第一次报：

```
src/App.tsx(615,80): error TS2345: Argument of type '{ openai: string; ...; comfyui: string }' is not assignable to parameter of type 'Record<ProviderId, string>'
```

但那个对象里 `magpie` 明明在。原因是 `tsc -b` 的增量缓存拿了旧快照——**直接重跑一次 build 就过了**（1.30s）。以后看到 `tsc -b` 报「对象缺某个键」而源码里键明明存在，先重跑再排查。

## 仍未做

- 没跑真实 ComfyUI 出图（本机没有运行中的 ComfyUI 实例，也没有 checkpoint）。
- 参考图的权重控制（IPAdapter strength）目前得用户自己在工作流里调。
