# R25 · 创作任务板折叠（2026-11-02）

## 问题

`src/App.tsx:4857`：

```tsx
{creativeTasks.slice(0, 6).map((task) => (...))}
```

项目总览的任务板只铺 6 个，且**没有任何「查看全部」入口**。

用 `grep -rn "creativeTasks" src/App.tsx` 确认：这个列表是全应用唯一一处渲染创作任务的地方。也就是说第 7 个及以后的任务，在界面上根本不存在——除非删掉前面的。

这是 R24（云端图库 `.slice(0, 48)`）的同类问题：**数据存得下，界面不给看**。

## 改法

`TASK_PREVIEW_SIZE = 6` + `showAllTasks` 状态：

```tsx
{(showAllTasks ? creativeTasks : creativeTasks.slice(0, TASK_PREVIEW_SIZE)).map(...)}
```

头部按钮（仅当任务数 > 6 时出现）：

- 折叠：「查看全部 8 个」
- 展开：「只看最近 6 个」

数字是实时的，用户能直接看出自己一共建了多少个任务。

## 真机验证

`artifacts/screenshots/task-board-all.png`，8 个任务：

| 状态 | DOM 卡片数 | 按钮文案 |
|---|---|---|
| 折叠 | 6 | 查看全部 8 个 |
| 展开 | 8 | 只看最近 6 个 |

截图里展开态可见 `验证任务 07/08/03/04/05/06/01/02` 全部 8 张。

门禁：92 文件 / **450 测试全过**，build 通过。

## 三个取证坑（都花了不少时间）

**1. CDP 端口撞到别人的 Electron。** 端口 9471 上有另一个 Electron 应用在跑，`/json` 返回的是它的页面，于是截回来一张完全无关的「人生模拟器」界面，而我一度按那张图在排查。修法：拿到 target 列表后必须校验：

```js
const page = pages.find((t) => /virtual-asset|虚拟资产|dist\/index\.html/i.test(`${t.title} ${t.url}`))
          ?? pages.find((t) => t.url.startsWith("file://"));
```

**2. React 受控 `<select>` 不能直接赋 `.value`。** 直接赋值会绕过 React 的 value tracker，`onChange` 不触发，项目选不上（表现为任务板一直空）。必须走原型上的原生 setter：

```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
setter.call(sel, opt.value);
sel.dispatchEvent(new Event("change", { bubbles: true }));
```

**3. 创作中心和项目总览同时在 DOM 里。** 只按 `document.querySelector(".task-card")` 计数，读到的是隐藏的那份——数字会变（6→8），但截图永远是创作中心。必须 `board.scrollIntoView({ block: "center" })` 再截，否则拿到的是「数字对、画面错」的假证据。

## 遗留观察

任务卡顺序是 `07、08、03、04、05、06、01、02`，不是创建顺序。8 个任务在同一毫秒内建完，`updatedAt` 相同，排序退化成不确定。真实使用不会这么快，但严格说 SQL 的 `ORDER BY updated_at DESC` 缺少次级排序键（例如 `id`）来兜底。不是本次改动引入的，记在这里。
