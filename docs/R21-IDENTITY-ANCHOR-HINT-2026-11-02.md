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

创作卡在 `ReferenceBindingsPanel` 之前渲染这段提示（`src/App.tsx:6034` 附近），样式 `.identity-anchor-hint` 用 `--warning` 色、左边框 3px、`--accent-soft` 底色。

只在这两种情况下出现，锚点写全了就完全不显示——不制造常驻噪音。

## 证据

- `src/shared/identity-anchor.test.ts` 3 项：空锚点、缺发色、有发色/短发卷发/马尾三种正常值都返回 undefined。
- `npm test`：**432 项全过**（上一轮 429）。
- `npm run build` 通过。

## 待验收，不是已验收

真机截图没拿到。创作卡（带 `textarea[aria-label="身份锚点"]` 的页面）需要先有一条进行中的创作任务才渲染。用 CDP 脚本走完「角色塑造」六步并保存角色后，页面回到创作启动页的四类卡片，仍是空状态，没有创作卡。

按 `docs/PRODUCT-ACCEPTANCE.md` 和 AGENTS.md 的规矩：**没有截图证据就是待验收**。这项记为「已实现、待验收」，下一轮需要先用「单张画面」走完一条真实创作流程，进入创作卡后再截图。
