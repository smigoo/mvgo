# Figma 节点命名规范 / 结构契约（v20261110.28）

> **用途**：mv-figma 插件 → 「结构契约 → mvgo」→ mvgo 生成管线（vue3 / microcode）。
> **定位**：插件输出的是「节点名 + 缩进层级」的纯文本树，不含几何、颜色、资源二进制。本文件定义每个名字**应该生成什么代码**，供管线解析、校验、注入 prompt。
> **权威来源**：`figma/src/cursor_mcp_plugin/code.js`（`CONTRACT_HEADER`、`walkSkeleton`、`buildStructureContract`）、`ui.html`（`NAMING_BLOCK`）。

---

## 0. 一分钟版：前缀 → 生成动作

| 前缀 | 生成什么 | 严禁 |
|---|---|---|
| `cp-<语义>` | 唯一组件根（SFC 外壳 / 微码组件壳） | 内部节点再叫 `cp-` |
| `header` / `header-title` / `header-slot-*` | 组件标题栏；`header-slot-right` 预留 `<slot>` | 模块小标题叫 `header-*` |
| `bg` / `bg-*` | 背景装饰层，整体导出 PNG@2x | 逐个重建矢量 |
| `slot-con` | 唯一内容容器，其余全部内容都在其中 | 第二个 `slot-con-*` / 把内容平铺到组件根 |
| `section-<语义>` | 异构分区 → `<section>` / 独立子组件，**不可迭代** | 用 `v-for` 遍历 |
| `section-title-<语义>` | 模块小标题（静态文案 `[data:label]`） | 提升成根级 header |
| `graphic-<语义>` | 静态图形 → `<img>`，内部矢量已合并导出 | 用 echarts / chart 库重建 |
| `@echarts/<type>` | 真图表 → ECharts option，`type` 决定 series.type | 写成 `echarts-` / `chart-` / `gauge-` |
| `@antd/<type>` | 组件库控件 → 对应组件 | 手写等价 HTML |
| `icon-*` | 小图标，SVG 整体导出 | 并入背景位图 |
| `img-*` | 内容图片，PNG@2x 整体导出 | 并入背景位图 |
| `item-<语义>-N` | 同构循环项 → `v-for` / `map`，**只生成一份模板** | 生成 N 份重复代码 |
| `card-*` / `list-*` / `form-*` | 卡片 / 列表 / 表单容器 | — |
| `legend` / `axis-*` / `label` / `value` / `unit` | 图表内部语义元素、数据槽 | 压平成图片 |
| `[data:value\|unit]` | 绑定 props / 接口字段 | 把字面量写死 |

### 0.1 vue3 与 microcode 的实现差异（v20261110.28 补）

| 契约语义 | vue3 | microcode |
|---|---|---|
| `graphic-*` / `img-*` / `bg-*` | `<img>` / CSS background | `<img :src="资源变量">`，**图片 import 必须由 `injectResourceImports` 后处理注入，禁止 LLM 手写**（`code-structure-validator.js:1279,1319`、`mc-component-graph-vue3.js:3409`） |
| `header-slot-right` | `<slot>` | 同样用 `<slot>`；declare.json 里不要重复声明同名插槽 |
| `item-*-N` | `v-for` 单模板 | `v-for` 单模板；数据字段走 declare 的 props / API 绑定，不写死字面量 |
| `section-*` | 独立子组件 / `<section>` | 独立子组件；组件边界以 `declare.json` + `index.vue` 为准 |
| `cp-*` | SFC 外壳 | 微码组件壳（`<base-panel>` 等宿主由平台注入，不要自己套） |

> 规范主表用 vue3 语义书写；microcode 侧唯一硬差异是**资源实现**，其余结构约束两档一致。

---

## 1. 固定前缀（用户规定，**不得改写**）

| 前缀 | 含义 | 导出预设 |
|---|---|---|
| `@<技术栈>/<类型>` | 技术栈注解；当前用 `@echarts/*`、`@antd/*` | 不导出，按库组件实现 |
| `bg` / `bg-<角色>` | 背景 / 装饰层（`bg-card` / `bg-glow` / `bg-ring` / `bg-panel`） | PNG @2x，整体导出文件夹 |
| `icon-<语义>` | 明确语义的小图标（建筑 / 报警 / 箭头 / 状态点） | SVG |
| `img-<语义>` | 非背景的内容图片 | PNG @2x |
| `header` / `header-title` / `header-slot-left\|center\|right` | 唯一标题区与插槽 | 不导出 |
| `slot-con` | 唯一内容槽 Group（精确名，不接受前缀匹配） | 不导出 |

> 插件侧判据：`isSlotContainer()` 只认精确 `slot-con` 或 `mvSlotCon` 标记；`isHeaderLike()` / `isBgLike()` 仍按前缀。

---

## 2. 语义前缀（v20261110.27 重设计）

| 前缀 | 引入版本 | 语义 | 与 `item-` 的关系 |
|---|---|---|---|
| `cp-<语义>` | .20 | 组件根，全树唯一 | — |
| `section-<语义>` | **.27** | 按 `section-title-*` 锚点切出的异构分区；数量固定、结构不同、不可迭代 | 取代旧的「不带序号 `item-*` 分区」 |
| `section-title-<语义>` | .24 | 模块小标题，与 `section-<语义>` 同名成套 | — |
| `graphic-<语义>` | **.27** | 零散矢量拼成的静态仪表 / 环形进度 / 装饰图形 | 取代旧的 `item-disposal-rate-gauge` |
| `item-<语义>-N` | 初版 | **只**表示带 `-N` 序号的同构循环子项 | 循环专用，歧义已清除 |
| `item-<slug>-<seq\|order>` | .9 / .20 | 几何行聚类 / 视觉模块容器，带序号，同属循环模板族 | 保持不动 |
| `card-*` / `list-*` / `form-*` | 初版 | 卡片 / 列表 / 表单容器 | 保持不动 |
| `legend` / `axis-*` / `label` / `value` / `unit` / `title` / `footer` | 初版 | 通用前端语义名，小写英文 | 保持不动 |

**核心不变量**：`item-` 只用于带 `-N` 序号的同构循环子项；**不带序号的 `item-` 不是循环项，且不再由插件产出**。

**历史兼容**：`.26` 及之前整理过的文件里仍可能有不带序号的 `item-*` 分区，插件按兼容逻辑保留，**不会自动改名**；下游遇到时按「异构分区」处理，不要按 v-for 展开。

---

## 3. 根级骨架与契约树

组件根固定三段式；`slot-con` 下按小标题再切一层分区：

```
cp-event-analysis                          ← 组件根（唯一）
├ header                                   ← 标题区（唯一）
│  ├ header-title
│  └ header-slot-right                     ← 按钮 / tab / 图例 / 时间筛选
├ bg                                       ← 背景（唯一）
└ slot-con                                 ← 内容槽（唯一）
   ├ section-type-distribution             ← 分区 1（不可迭代）
   │  ├ section-title-type-distribution    ← 小标题，标 [data:label]
   │  ├ @echarts/gauge
   │  └ @echarts/bar
   ├ section-level-analysis                ← 分区 2
   │  ├ section-title-level-analysis
   │  ├ item-progress-1  [循环 ×3]         ← 同构子项只展开首项
   │  └ @echarts/line
   ├ section-impact-analysis               ← 分区 3
   │  └ …
   └ img-fullscreen-map                    ← 段前 / 跨段 / 全屏底图：直属 slot-con
```

切分依据（零 token）：`section-title-*` 的 `y` 坐标作为分割线，按视觉顺序把「标题 + 其下方图表」归入同一 `section-*`；跨段节点、下沿越过下一标题的节点、与父级等高的全屏底图一律 **pin 住留直属**。

---

## 4. 契约文本语法

| 项 | 规则 |
|---|---|
| 行格式 | `- <节点名>`，每级缩进 **2 空格**；缩进 = 父子包含关系 |
| 同级顺序 | **视觉从上到下**（已按 `y` 升序 / 同 `y` 按 `x` 升序排序），与 Figma 图层面板（children 反序显示）无关 |
| `[循环 ×N]` | 同构序号子项折叠，只展开首项，其余不生成重复代码 |
| `[data:value\|label\|unit "摘要"]` | TEXT 行尾标记；`value` / `unit` 绑定 props 或接口字段，`label` 多为静态文案 |
| `[骨架]` / `[视觉]` | 仅出现在「生成结构方案」的只读推演文本里，不出现在结构契约 |
| 上限 | `maxNodes 600` / `maxDepth 12` / `maxChars 18000`；截断时末尾追加 `(已达上限，其余节点省略)` 与 `# [省略 N 行 @ 深度 d；结构不完整，勿据此推断缺失模块]`（v20261110.28） |
| 目标字段上限 | `requirementDocText` 在 mvgo 侧 ≤ 20000 字（`user-addendum.js:15` 兜底截断） |
| `# @meta`（.28） | 契约头后一行：`version / sections / loops / slots / nodes / truncated / omitted / omittedDepth / ids / quality`。管线可做生成后计数校验、决定信任权重；`truncated=true` 表示树不完整 |
| 行尾 `#1-283`（.28，可开关） | UI「附带 Figma 节点 ID」开启时，真实节点行尾附 nodeId（`1:283` → `1-283`）。**用于回填已有同名 section，不得据此新建节点**；虚拟骨架行 `header` / `bg` / `slot-con` / `section-*` 不带 ID |
| `[循环 ×N，首项即模板]`（.28） | 折叠区间改为完整 `1..N`（旧版误写成 `2..N`），首行已单独展开即模板，勿生成 N+1 份 |
| 结构硬声明（.28） | 契约头声明「本段不是需求文档」「结构约束不让位设计稿」「禁止臆造交互事件/数据接口」；详见 §7.3 |

契约文本自带 `CONTRACT_HEADER` 规则说明（约 23 行 `#` 注释），**只要整段文本进入 `requirementDocText`，模型已能看到上述规则**；本文档用于管线侧解析、二次校验，或在没有契约时单独约束命名。

> 🔴 v20261110.28：契约虽仍走 `requirementDocText`，但后端已按契约头标记**分流**——不再触发需求文档分析子管线，改由 `buildStructureContractSection()` 以独立段落注入 codegen prompt。详见 §7.2 / §7.3。

---

## 5. 正反例（防误判）

| 场景 | ✅ 正确 | ❌ 错误 | 后果 |
|---|---|---|---|
| 三个异构模块（类型分布 / 等级分析 / 影响分析） | `section-type-distribution` 等 3 个 | `item-type-distribution` 等 | 模型误判为可迭代，生成 v-for 或 N 份重复代码 |
| 零散矢量拼成的环形进度盘 | `graphic-disposal-rate-gauge` | `@echarts/gauge` / `echarts-gauge` / `chart-gauge` | 用图表库重建静态图形，视觉失真 |
| 带坐标轴 / 图例 / 多组系列的柱图 | `@echarts/bar` | `graphic-bar` | 把真图表压成图片，丢失交互与数据 |
| 列表里 4 个同构卡片 | `item-alarm-card-1..4` → `[循环 ×4]` | 每张卡起不同语义名 | 生成 4 份重复代码 |
| 每个模块的小标题 | `section-title-level-analysis` | `header-level-analysis` | 被当成第二个根级标题，从 `slot-con` 中排除 |
| 局部模块的容器 | `item-xxx` / `card-xxx`（带或不带序号均可） | `slot-con-xxx` | 被当成第二个根槽复用 |
| TEXT 数值 | 保留独立 TEXT + `[data:value]` | 并入 `img-*` 位图 | 动态数据被固化成图片 |

---

## 6. 机读正则（可直接搬到管线）

```js
// 固定前缀（用户规定，优先级最高）
const FIXED_RE   = /^(?:bg(?:-|$)|img-|icon-|header(?:[-/]|$)|slot-con$|@[a-z0-9-]+\/)/i;
// 语义容器（注意排除 section-title-）
const SECTION_RE = /^section-(?!title-)/i;
const TITLE_RE   = /^section-title(?:-|$)/i;
const GRAPHIC_RE = /^graphic-/i;
const ROOT_RE    = /^cp-/i;
// 循环项：必须带 -N 序号
const LOOP_RE    = /^item-.+-\d+$/i;
// 技术栈注解 → 捕获 (tech, type)
const TECH_RE    = /^@([a-z0-9-]+)\/(.+)$/i;
// 动态数据槽 → 捕获 (kind, preview)
const DATA_RE    = /\[data:(value|label|unit)(?:\s+"([^"]*)")?\]/;
// 循环折叠标记（.28 标签带「，首项即模板」后缀，正则不变）
const LOOP_TAG_RE = /\[循环\s*×(\d+)\]/;
// 契约头机器摘要
const META_RE = /^# @meta (.+)$/m;
// 行尾 Figma 节点 ID（仅真实节点行有）
const NODE_ID_RE = /\s+#(\d+-\d+)\s*$/;
```

> `@meta` 建议解析成 key=value 字典；`sections` / `loops` / `slots` 可与生成后 SFC 的 `<section>` / `v-for` / 绑定字段数量对照，作为 P2 门禁输入。`NODE_ID_RE` 命中行才能与 vision JSON 的 `figmaNodeId` / `section.sourceNodeIds` 做 join（**本版只提供 ID，不代管线新建 section**）。

插件侧业务语义白名单（`code.js:1277`，用于 `isDecoration` 判定「内容 vs 装饰」）：

```js
/^(cp-|card-|list-|item-|section-|graphic-|form-|img-|icon-|echarts-|@|header|slot-|chart-|legend|axis|label|value)/i
```

> 🔴 `section-` / `graphic-` 必须在此白名单内，否则新命名的分区会被 `isDecoration` 当成装饰收进 `bg-*` 文件夹。

**建议的管线静态校验**（可作为生成后门禁）：

1. `@echarts/*` 是否真的调用了图表库，且 series.type 与 `<type>` 一致；
2. `graphic-*` / `bg-*` / `img-*` 是否只渲染为图片，未出现 echarts 初始化；
3. `item-*-N` 是否用单模板 `v-for` / `map`，未复制 N 份；
4. `[data:value|unit]` 是否绑定了 props / 接口字段，未写死字面量；
5. 组件根是否只有 `header` / `bg` / `slot-con` 三段，内容未平铺到根级。

---

## 7. mvgo 管线对接点

### 7.1 入口（插件已实现）

`ui.html:451-480`「🚀 推送生成」：

```http
POST {mvgo-base}/api/lite/generate
Content-Type: application/json
token: dev                         # SessionGuard 读 headers.token，缺失一律 401

{
  "figmaUrl": "https://www.figma.com/design/...?node-id=1-283",
  "componentType": "vue3",         # vue3 | microcode
  "componentName": "cp-event-analysis",
  "requirementDocText": "<结构契约全文>",
  "groupId": "<可选>"
}
```

只读导出（不写 Figma 文件、零 token）同样产契约；契约文本也可复制后粘到 mvgo「需求文档」输入框。

### 7.2 注入链路（源码定位）

| 环节 | 文件 | 说明 |
|---|---|---|
| DTO 白名单 | `backend-node/src/lite/dto/generate-lite.dto.ts:243,248` | `extraPrompt` ≤4000 / `requirementDocText` ≤20000 |
| 控制器 | `backend-node/src/lite/lite.controller.ts:279,355-356,394-395` | `POST /lite/generate`，向 phase2 / Lite 两路透传 |
| 图白名单 | `backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js:876-877,4007-4008,4129-4130` | 三处补齐 `extraPrompt` / `requirementDocText` / `userComponentId`（.22） |
| 图白名单 | `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js:1863-1864,6308-6309,6475-6476` | 同上 |
| prompt 段 | `backend-node/src/ai-engine/utils/user-addendum.js:13-27` | `buildUserAddendumSection()` 纯函数，单一来源 |
| **契约分流（.28）** | `backend-node/src/ai-engine/utils/structure-contract.js` | `isStructureContract()` 按契约头识别；`buildStructureContractSection()` 生成独立段落 + 结构硬约束 |
| **文档子管线排除（.28）** | `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js:733-743` | `_docTextSource` 遇契约跳过 D0/D1+D2 `docAnalysis`，避免 `buildDocDesignBlock` 臆造 events/interactions |
| 消费方 | `backend-node/src/ai-engine/roles/microcode-engineer.js:1090`、`vue3-engineer.js:406` | 每个分块 codegen prompt 携带 |

### 7.3 优先级契约（`user-addendum.js:23-24`，不可绕过）

```
Figma @技术栈 锚点契约  >  用户补充需求段（本规范 / 契约文本）  >  平台默认规范
```

- 视觉样式（颜色 / 尺寸 / 布局 / 字体）与设计稿冲突时 **以设计稿为准**；
- 但交互 / 行为类显式要求（tab 切换、轮播、折叠、点击联动）**必须落实**，不得以「设计稿没有」为由省略。
- 🔴 **v20261110.28 结构契约例外**：契约文本里的组件边界 / 分区划分 / 循环判定 / 图表 vs 静态图形 / 资源实现属**结构约束**，优先级等同 Figma @技术栈锚点契约，**不让位设计稿**；仅颜色、字号、间距等纯视觉样式可让位。该例外由 `structure-contract.js` 与 `CONTRACT_HEADER` 双重声明，防止「布局让位」被泛化成整套骨架让位（同 2026-11-02 tab 事故）。

### 7.4 当前运行时状态（⚠️ 对接前必读）

- `vue3-engineer.js` / `mc-component-graph-vue3.js` 的注入改动已在源码中（本地 commit `7334489`），但 **`dist` 未构建、`:13030` 未重启 ⇒ 运行时仍是旧代码**，契约文本不会真正进 prompt。
- **v20261110.28 新增的 `structure-contract.js` 分流 / `user-addendum.js` 改段 / `phase2` 图排除逻辑同样是源码态**，未构建前旧运行时仍会把契约当需求文档分析；构建/重启需用户明确授权。
- 冒烟请求必须带 `token: dev` 头，否则一律 401，不要误判成服务异常。
- 构建需 `npm run build`（不是裸 `npx tsc`，`.js` assets 靠 nest-cli 复制），构建后必须验 `dist/main.js` 存在；**任何构建/重启/部署动作均需用户明确授权**。

### 7.5 建议的下游改造顺序

| 阶段 | 动作 | 成本 |
|---|---|---|
| **P0** | 契约文本原样进 `requirementDocText`（已打通），把 `FIGMA-NAMING-SPEC.prompt.txt` 作为**可选常量**拼进系统提示，用于没有契约时的兜底 | 零改动 / 一个常量 |
| **P1** | 在 `VisualParser` / Figma 结构参考里按 §6 正则把契约行映射成「组件 / 分区 / 图表 / 图片 / 循环 / 数据槽」六类意图，替代纯文本自由理解 | 中，需图侧改动 |
| **P2** | 把 §6 的 5 条静态校验做成生成后门禁，与现有 `TEXT-TRUTH` / `CODE-017` / 循环折叠检查并列 | 中 |

---

## 8. 版本变更

| 版本 | 命名相关变更 |
|---|---|
| .24 | 根级唯一 `header`；其余 `header-*` → `section-title-*`；`isSlotContainer` 收紧为精确 `slot-con` |
| .25 | 契约按 `y/x` 升序输出；槽内按 `y` 降序排图层；清理多余空槽 |
| .26 | 按 `section-title-*` 锚点切子模块，契约虚拟分组 + Figma 真建 Group（当时命名 `item-*`） |
| .27 | 命名体系重设计：异构分区 `item-*` → `section-*`；静态仪表 `item-*` → `graphic-*`；`item-` 收归循环专用；新增「固定前缀（不得改写）」声明 |
| **.28** | **契约自描述化**：`@meta` 机器摘要、可选 Figma nodeId、结构约束不让位硬声明、循环标签 `1..N 首项即模板`、截断显式警示、`componentName` 取契约 `cp-*`；后端新增契约分流（不再触发文档子管线）；规范补 vue3/microcode 差异 |

---

## 9. 已知边界

1. 模型若**直接吐出不带序号的裸 `item-xxx`** 作为分区，插件目前只靠 prompt 约束，**尚不会强制归一化**（`normalizeChartName` 只处理 `echarts-/chart-/gauge-`）。
2. `.26` 及之前整理过的历史结果不会自动改名，下游需兼容旧 `item-*` 分区。
3. 结构契约是**只读文本**：不落盘、不缓存、不带几何/颜色/资源二进制；同名层级即组件边界，严禁臆造树中不存在的节点。
4. 规范文档与 `.28` 插件包均未部署；Figma 侧需 Remove + Import 新包才显示 `.28`。
5. **nodeId 默认关闭**，需在「推送设置」勾选「附带 Figma 节点 ID」后重新导出才写入契约；本版只提供 join key，**按 ID 回填已有 section 的适配器尚未实现**（属 C 阶段），不得据 ID 新建节点。
6. 契约仍通过 `requirementDocText` 传输；后端分流靠**首行契约头标记**识别，任何改契约头的改动必须同步 `structure-contract.js` 与回归脚本。
