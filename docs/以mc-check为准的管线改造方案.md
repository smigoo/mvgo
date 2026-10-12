# 「以 mc-check 为准」管线侧改造方案

> 日期：2026-10-12
> 目标：后续生成的组件 **100% 通过 mc-check v1.0.20**，且支持多主题 + 自定义主题变量
> 判据事实来源：实跑 mc-check（非推测），脚本 `backend-node/skills/frontend-mc-check/`

---

## 0. 一个必须先摆的前提

**mc-check 从不在生成链路里自动执行。**

| 事实 | 证据 |
|---|---|
| 唯一执行者是 HTTP 手动端点 | `mc-spec.service.ts:377-381` spawnSync，唯一入口 `POST /api/mc-spec/check` |
| 触发者是**前端按钮** | `McSpecCheckButton.vue`（挂在 TaskDetail / ComponentDetail / demo 页） |
| 生成管线跑的是**另一套复刻实现** | `microcode-engineer.js:8354-8366` 调 `mc-health-validator.js` |
| 而复刻版**明确不阻断** | `microcode-engineer.js:8351` 原文：「仅记录告警，不 fail-closed 阻断（报告类检查，上线前由 mc-check 最终把关）」 |

⚠️ **并且默认模式在本仓根本跑不起来**：`ROOT = path.resolve(__dirname, '../../../..')`（`mc-check.cjs:29`）拼出的 `mvgo/src/workspace/custom-components` 不存在，裸跑会 ENOENT 崩（`getComponentDirs()` 无 `existsSync` 保护）。现实中只会以 `--component-path` 单组件形态跑。

**⇒ 结论：「100% 通过」只能靠管线侧「盲写对」，没有任何门禁反馈兜底。** 这是本次改造的核心难点 —— 不能靠"跑一下看报什么"迭代，必须一次写对。

---

## 1. 实测：三主题 + 自定义变量的当前判词

我造了一个「三主题 + 自定义变量 `accentColor`」的组件跑 mc-check：

```
❌ c-nt 通过:32 失败:5
   └─ [M3-7] cssVariableConfig 中定义的 accentColor 在 css-vars.js 中缺失
```

### 关键发现：自定义主题对象的变量对 mc-check **不可见**

`css-vars.js` 里明明有：
```js
const dusk_mode = { colorTextBase:"#ffe4cc", colorPrimary:"#ff8c42",
                    colorPrimaryBg:"#2b1a33", accentColor:"#ffd166" }
```
但 M3-7 报「`accentColor` 缺失」。

**原因**（`mc-check.cjs:1034`）：
```js
function extractCssVarsKeys(jsCode) {
  const objectNames = ['common', 'dark', 'light']   // ← 写死三个
```

⇒ **第 4 个及以后的自定义主题，其 css-vars.js 变量对 M3-7 / M3-8 完全不可见。**

**这对「可自定义主题变量」是致命阻断**：
- 自定义变量挂在第 3+ 个主题对象里 ⇒ M3-7 误判缺失（error）；
- 或挂进 `common`/`dark`/`light` ⇒ M3-8 反向判「未在 cssVariableConfig 声明」。

---

## 2. 改造清单（按依赖顺序）

### 阶段一：让判据「看得见」自定义主题（**前置条件，check 侧**）

**这一项不解决，后面全白做。**

| 项 | 内容 | 涉及 |
|---|---|---|
| **C1-1** | `extractCssVarsKeys` 的 `objectNames` 从硬编码改为**按 `themeConfig.list[].key` 动态推导** | `mc-check.cjs:1034` |
| **C1-2** | 新增 `extractCssVarsKeys(jsCode, extraObjectNames)` 参数，M3-7/M3-8 调用处传入 themeKeys | `mc-check.cjs:1034` + `:420-451` |
| **C1-3** | M4-10 枚举增加「设计稿真值」豁免（见 §3） | `mc-check.cjs:794-820` + config |
| **C1-4** | ROOT 解析修正 + `existsSync` 保护（让默认模式可用、便于批量扫描） | `mc-check.cjs:29` / `:63-69` |

> C1-1/C1-2 是**给 check 提的能力需求**，需要与微码方沟通并入上游；我方可先在本地副本实现并验证，同步提 MR。

---

### 阶段二：管线侧主题产物三件套（**核心**）

check 对每个 `themeConfig.list[].key` 强制要求**三份产物**（缺一即 3 项同时红）：

| check 项 | 要求 | 判据 |
|---|---|---|
| **M2-4** | `themes/<key>.less` 必须存在 | `mc-check.cjs:238-249` |
| **M4-4** | `css-vars.js` 必须导出 `common` + 每个 key | `mc-check.cjs:689-703` |
| **M4-5** | `index.less` 全文含 `<key>.less` 子串 | `mc-check.cjs:745-756` |

**实测确认**（加第 3 个主题但只补部分产物）：
```
[M2-4] themes/ 缺少：blue.less
[M4-4] css-vars.js 缺少导出：blue
[M4-5] index.less 未引入主题文件：themes/blue.less
```

**管线侧改动**：

| # | 内容 | 现状 → 目标 |
|---|---|---|
| **P2-1** | `theme-vars.less` 输出 N 套 `.theme-<key>()` mixin | 已有（`style-tokens.js#renderMicrocodeThemeVarsLess`）✅ |
| **P2-2** | `themes/<key>.less` **每个 key 一份** | 部分实现（light/dark 走 `THEME_WRAPPER_TEMPLATES`，N 主题走 `_buildThemeWrapperLess`）⚠️ 需补齐 + 修 `themeMeta` 取值 |
| **P2-3** | `index.less` 按 keys 动态 import | 本轮已改（`buildIndexLessTemplate(…, themeKeys)`）✅ 待真机验证 |
| **P2-4** | `css-vars.js` 导出 `common` + **每个 key** | 需扩展：`buildCssVarsFile`（`file-writer.js:1302-1407`）当前只写 N 主题自定义键，需保证 `export default` 含全部 themeKeys |
| **P2-5** | **强制含 dark**（M3-13） | 用户若只给浅色稿 ⇒ 管线必须补一个派生 dark，否则 error |
| **P2-6** | dark 对象必含三核心（M4-9） | 已有 `mcSlotsFromTokens`，需保证三核心**非空** |
| **P2-7** | 三核心色值满足 M4-10 枚举或走豁免 | 见 §3 |

---

### 阶段三：自定义主题变量（`cssVariableConfig`）

check 有 M3-6 / M3-7 / M3-8 三项构成**双向一致性**：

| 项 | 判定 | 级别 |
|---|---|---|
| M3-6 | 每项有 `name`/`key`/`type`，`type` ∈ `color/weight/size/number/string/select` | error |
| M3-7 | `cssVariableConfig[].key` 必须在 css-vars.js 出现 | error |
| M3-8 | css-vars.js 的非框架变量必须都在 `cssVariableConfig` 声明 | error |

**三个洞（已实测）**：
1. `cssVariableConfig` **整段可省略**（`:393` 守卫 `?.length > 0`；M3-1 必填清单不含它）⇒ 不声明就三项都不查，**等于自定义变量无门禁**；
2. 第 4+ 主题对象不可见（C1-1）；
3. **只查 type 枚举、不查值** ⇒ 自定义变量的色值无任何约束（可自由取设计稿真值，**这对我们有利**）。

**管线侧改动**：

| # | 内容 |
|---|---|
| **P3-1** | `declare.json` 产出 `cssVariableConfig[]`，从**各稿真值**提取（色板里除三核心外的显著色） |
| **P3-2** | 与 css-vars.js **双向生成**（同源产出，避免 M3-7/M3-8 对打）—— 建议从同一份 `styleTokens` 派生 |
| **P3-3** | 预留 `layoutTypes` 字段（demo 有、check 不管、管线无）—— 为多布局扩充留位 |
| **P3-4** | 决定是否强制生成该字段：**建议生成**（拿 check 当护栏），且值本身无色值约束，风险低 |

---

### 阶段四：样式变量写法（`.common()` 与 fontSize）

| # | 内容 | 依据 |
|---|---|---|
| **P4-1** | **`@fontSize` 必须写 `var(--fontSize)`**（不可改成字面量） | M5-6 `mc-check.cjs:1122-1134` 正则硬要求；**我今天改的方向与此冲突，需回退** |
| **P4-2** | 业务样式字号倍数**必须用 `calc(@fontSize * N)`**，禁裸乘 | Less 限制（`var()` 不能参与运算） |
| **P4-3** | `css-vars.js` 里 fontSize 必须 `$mcCssBuilder.getCssSize()` | M4-7 `mc-check.cjs:705-743` |
| **P4-4** | 业务样式 font-size 禁 `>5px` 硬编码 | M5-7 `mc-check.cjs:1141-1177` |
| **P4-5** | 颜色禁硬编码（**仅 warning，不阻断**） | M5-10 `mc-check.cjs:1071-1111` |

🔴 **P4-1 + P4-2 是我今天改错的地方，必须回退/改造**：
我加的 `deVarMathLessVars` / `MATH_OPERAND_VARS` 把 `@fontSize` 降级成字面量 —— 编译能过，但**违反 M5-6**。
正确解法：**保持 `var()` 透传**（M5-6 过 + 运行期可调字号），**同时要求业务写 `calc()`**（P4-2，编译也过）。

---

### 阶段五：其余必过项（不涉及主题，但同属"100% 通过"）

| 项 | 要求 | 判据 |
|---|---|---|
| M1-1 | 目录名 === `componentId`，`c-` 前缀 + kebab-case ≤50 | `:171` |
| M2-1 | `package/index.vue` + `declare.json` + `declare.js` + `component.js` 齐套 | — |
| M2-2/3 | `resources/images/mc-preview.png` 存在 | — |
| M2-6/7 | `layoutConfig.list[].previewName` 逐个真实存在 | — |
| M4-1/2 | `declare.js` 用 `$createMcDeclare` 且**传入 cssVars** | `:962-969` 附近 |
| M4-6 | `package/**` 至少一个文件 import `styles/index` | `:758-767` |
| M3-13 | 业务组件必须有 `key="dark"` | `:620-632` |
| M5-8/9 | `<base-panel>` 自身与首个子元素**不得有内联 background** | `:962-980` |

---

## 3. M4-10：唯一无法靠管线规避的冲突

### 事实

M4-10（`mc-check.cjs:794-820`）把 dark 三核心**锁死在 5 个色值**：
```json
"darkThemeColorRules": {
  "colorPrimary": ["#44E4FF"],
  "colorPrimaryBg": ["#414141", "#454545", "#474747"],
  ...
}
```

而**官方 demo 自己就过不了**（实测唯一 error 就是它）：`colorPrimary:"#3677f8"` 不在枚举内。

### 为什么管线侧无解

M4-10 是**纯文件字符串判定、无任务上下文** —— 判据无法「按模式分叉」。而设计稿真值千变万化，必然不在枚举内。

⇒ **只能二选一**：

| 选项 | 做法 | 代价 |
|---|---|---|
| **A（推荐）** | 引入「设计稿真值」豁免：**产物内写入确定性标记**（如 `css-vars.js` 首行 `// dualTruth: figma-derived`，由 `buildCssVarsFile` 写，LLM 无法伪造），M4-10 据此对三核心跳过枚举比对 | 需改 check（并入上游） |
| B | dark 三核心强制回落枚举值 | **多主题功能实质不可用**（深色主题色变成固定值，与设计稿不符） |

⚠️ 选项 A 的实现纪律：**标记必须由确定性生成器写**（`file-writer.js#buildCssVarsFile`），且**单稿路径不写**（保零回归）。我们本地已有过这个实现（随 scaffold 统一被覆盖丢失），可恢复。

---

## 4. 落地顺序与验收

```
阶段一（check 侧提需求：C1-1/1-2 看得见自定义主题 + C1-4 ROOT）
   ↓ 阻塞项：不解决则自定义主题变量必 error
阶段二（管线：主题三件套 P2-1~P2-7）
   ↓
阶段三（管线：cssVariableConfig P3-1~P3-4）
   ↓
阶段四（管线：写法规范 P4-1~P4-5，其中 P4-1 回退我今天的改动）
   ↓
阶段五（管线：其余必过项逐条对齐）
   ↓
验收：对真实生成产物跑 mc-check，error 必须为 0
```

### 验收方式（可自动化）

建议新增一条与 `verify:all-theme` 并列的脚本：

```bash
npm run verify:mc-check-align
# 对最近 N 个真机产物批量执行 mc-check --component-path，
# 统计 error 项数，要求 = 0；输出按检查项 ID 聚合的 Top-N
```

⚠️ 注意：`mc-check` 需要 `--component-path` 逐个跑（默认模式的 ROOT 指向不存在的目录）。

---

## 5. 与微码方沟通的两点（阶段一的依赖）

1. **`extractCssVarsKeys` 硬编码 `['common','dark','light']`** —— 是否支持按 `themeConfig.list[].key` 动态扫描？不支持则自定义主题变量永远不可管理。
2. **M4-10 是否提供真值豁免机制** —— 若无，设计稿驱动的多主题无法通过门禁。

这两点已并入 `docs/致微码方-check判据与demo不一致说明.md` 的待确认清单。

---

## 6. 风险与提醒

| 风险 | 说明 |
|---|---|
| 🔴 **盲写无兜底** | mc-check 不在生成链路里，全靠管线一次写对。建议阶段五时把 mc-check 接入发布前校验（fail-closed） |
| 🟡 check 有大量死配置 | `scoring`（config:74-88）零引用；`darkThemeColorRules` 里 5 个非核心键配了但 M4-10 只遍历三核心 ⇒ **别把 config 完备度当门禁强度** |
| 🟡 事件名分裂 | 产物里同时存在 `xxx-onload` 与带前缀版本，`code-validator.js:1425-1517` 以代码为准改写 declare 但不彻底 ⇒ M5-4/M5-5 风险 |
| 🟢 硬编码颜色仅 warning | M5-10 不阻断，颜色自由度较大（有利） |
