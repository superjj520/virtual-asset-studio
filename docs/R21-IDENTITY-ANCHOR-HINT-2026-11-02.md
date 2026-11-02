# R21 身份锚点为空或没写发色时在创作卡上提示（2026-11-02）

## 为什么要加这个

R20 修掉了提示词里「补充参考可以带发型轮廓」和「发型只认身份参考」的矛盾。但还有一条更隐蔽的漂移来源，不在文案层：

`src/shared/character-slots.ts:192` 里身份锚点是——

```
identityAnchor: describe(byGroup("identity", "face", "hair", "skin"))
```

`describe` 只取 `activeCharacterFacts` 中被 `characterFactIsUsable` 判定为**已确认且来源有效**的细项。角色档案里填了发色、但那条细项还是草稿状态时，它不会进入身份锚点——卡上看不见，出图时模型就自由发挥。

用户在卡面上看到的是一片祥和的表单，实际发色约束是空的。这种「看起来写了其实没写」最伤，所以补一条即时提示。

## 改了什么

新建 `src/shared/identity-anchor.ts`：

```
HAIR_HINTS = ["发", "刘海", "马尾", "辫", "卷", "直发", "光头"]

identityAnchorWarning(anchor)
  ├─ 空 → "身份锚点还没写：不写这段，出图会自由发挥脸型和发色。至少写「圆脸、黑发齐肩」。"
  ├─ 没提发色发型 → "身份锚点没提发色或发型，换一组参考图就容易漂移。补一句「黑发齐肩直发」这类具体描述。"
  └─ 有 → undefined（不打扰）
```

提示挂在两个真正会写身份锚点的地方：

1. 角色塑造的草稿卡（`src/App.tsx:4603` 那个 `textarea[aria-label="身份锚点"]` 下方，渲染成 `<small class="identity-anchor-hint" role="status">`）。
2. 创作卡编辑页的字段区（`src/App.tsx:6034` 附近，`ReferenceBindingsPanel` 之前）。

样式 `.identity-anchor-hint` 用 `--warning` 色、左边框 3px、`--accent-soft` 底色；草稿卡里是 `small`，额外加了 `display:block` 与更紧的内边距。

只在这两种情况下出现，锚点写全了就完全不显示——不制造常驻噪音。

## 证据

- `src/shared/identity-anchor.test.ts` 3 项：空锚点、缺发色、有发色/短发卷发/马尾三种正常值都返回 undefined。
- `npm test`：**432 项全过**（上一轮 429）。
- `npm run build` 通过。

## 真机验证（已验收）

入口路径：资产域 → 角色档案 → 右上角「新建角色档案」→ 表单右侧「身份锚点」输入框下方。

用 CDP 脚本在真实 Electron 窗口里跑了三种状态：

| 输入 | 提示 | 计算样式 |
|---|---|---|
| 空 | 「身份锚点还没写：不写这段，出图会自由发挥脸型和发色。至少写「圆脸、黑发齐肩」。」 | — |
| 「圆脸、单眼皮、二十二岁」 | 「身份锚点没提发色或发型，换一组参考图就容易漂移。补一句「黑发齐肩直发」这类具体描述。」 | `rgb(170, 116, 24)` = `--warning` |
| 「圆脸、单眼皮、黑发齐肩直发」 | 不出现（`null`） | — |

`role="status"` 已确认，读屏会播报。截图 `artifacts/screenshots/identity-anchor-hint.png`。

前两轮找不到这个输入框，是因为一直在创作向导里找——草稿卡其实挂在 `isCreatingCharacter` 分支（`src/App.tsx:4579`），入口在角色档案页的「新建角色档案」，跟创作流程是两条路。
