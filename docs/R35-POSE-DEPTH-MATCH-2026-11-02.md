# R35 姿势换深度图：从「按编号猜」改成「按 id 对」

日期：2026-11-02

## 问题

R33 给 `VASPoseGallery` 加了「用深度图」开关，当时的实现是「按姿势编号跨库匹配」：

```python
match = re.search(r"[A-Z]+\d+", pose_choice)
code = match.group(0) if match else ""
for row in load_rows("depth"):
    if code.lower() in str(row.get("id", "")).lower():
        return label("depth", row)
```

R33 文档里我把「匹配率没统计」写进了诚实边界。这轮把它统计了，结论是**这条路径基本等于没生效**：

1. `label("pose", row)` 只返回姿势名称（「S形站姿・胯部侧顶」），**不含编号**。所以正则取不到 `P001`，直接落到按名字模糊匹配那一支——而姿势库是中文名、深度库是日文名（「S字立ち・腰を横に突き出す」），永远匹配不上，返回空字符串，节点静默退回原姿势图。
2. 就算把编号塞进 label 也还是错的：`P001` 这个编号底下有 **4 个不同姿势 × 5 个角度 = 20 条**。按编号对，用户选「胸前双手比心」，会拿到「S字立ち」那张。

## 真实关系

两套库是**同一批图的两套名字**，`id` 完全一致：

| id | 姿势库（中文） | 深度库（日文） |
| --- | --- | --- |
| `full_sexy_P001_front` | S形站姿・胯部侧顶 / 正面 | S字立ち・腰を横に突き出す / 正面 |
| `full_sexy_P002_side` | 后仰坐・单膝立起 / 侧面 | 仰け反り座り・片膝立て / 横 |

两边都是 1,439 条，`id` 集合完全相同。所以唯一的正确键是 `id`，既不是编号，也不是名字。

角度词也不一样，但按 id 对之后自然就对齐了：`正面/斜侧/侧面/仰视/俯视` ↔ `正面/斜め/横/下から/上から`。

## 改动

`comfyui-vas-nodes/nodes.py`：

- 删掉 `_matching_depth_choice` 与 `DEPTH_ANGLE`，换成 `_depth_choice_for_pose(pose_choice)`——先在姿势库里按 label 找回那一条，拿它的 `id`，再去深度库找同 `id` 的条目，返回深度库的 label。找不到返回空字符串，节点退回原姿势图。
- `VASPoseGallery.run` 里「用深度图」分支改调新函数。

`comfyui-vas-nodes/vas_data.py`：

- `label("pose", row)` 改成 `编号 · 名称 · 角度`。两个理由：一是下拉里五个角度不能长一样（原来 1,439 条在界面上去重后只剩 288 个可见名字，用户没法选角度），二是排查时要能一眼看出是哪条。

新建 `comfyui-vas-nodes/depth_test.py`：

```
python3 depth_test.py            # 用缓存
python3 depth_test.py --refresh  # 重新下载
```

遍历姿势库每一条，断言它换到的深度条目和同 id 的那条完全一致。**不需要 torch**，只比字符串。

## 验证

```
$ python3 depth_test.py
姿势 1439 条，深度 1439 条
按 id 精确匹配 1439/1439 = 100.0%
✓ 每条姿势都能换成同一张图的深度版，角度也对得上
```

- `python3 contract_test.py` → 7 个节点全部符合 ComfyUI 加载规范
- `python3 prompt_test.py` → 提示词构建全部符合预期
- `python3 selftest.py` → 六源通过 6/6
- `npm test` → 94 文件 / 475 测试

## 诚实边界

- 这轮证明的是「换到的条目对不对」，没证明「换出来的深度图长什么样」。本机没有 torch / ComfyUI，`_to_tensor` 的像素路径仍然只有假 PIL 覆盖。
- `label("pose")` 加了编号，UI 上下拉文字变长（`P001 · 胸前双手比心 · 俯视`）。ComfyUI 的下拉有宽度限制，长名字会被截断，但序号在前所以仍可区分。
- 姿势库和深度库的 `id` 集合今天是完全相同的。**如果哪天上游只更新了一个库**，多出来的那批会匹配不到并退回原图——不会报错，也不会串图，但会静默失去深度效果。
