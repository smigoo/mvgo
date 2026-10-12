# 微码 Demo × mc-check 自相矛盾清单

> 日期：2026-10-12
> demo：`~/Downloads/microcode-scaffold-main 3/src/workspace/custom-components/`
> 判据：`backend-node/skills/frontend-mc-check` **v1.0.20**（已统一为 scaffold 上游版）
> 方法：**用判据实跑 demo**，不靠推测。所有结论附文件行号或实测输出。

---

## 结论：demo 与 check 来自同一供应商，但彼此矛盾

demo 是官方样板（作者署名「朱琦」），mc-check 也是官方判据（v1.0.20）。
**但两者对同一部件给出互斥要求** —— 实跑结果：

```
❌ c-mc-css-demo-event 通过:32 失败:1 ← 不允许上线
   └─ [M4-10] dark核心变量色值枚举: colorPrimary "#3677f8" 不在允许值 [#44E4FF] 中
                                colorPrimaryBg "#696969" 不在允许值 [#414141,#454545,#474747] 中

❌ c-mc-demo 通过:29 失败:3 ← 不允许上线
   └─ [M3-12] 内容布局存在性: layoutConfig.list 至少需要一个布局配置
   └─ [M3-13] dark主题配置: themeConfig.list 中必须包含 key="dark" 的主题
   └─ [M5-6] @fontSize变量声明与使用: css-vars.js 已定义 fontSize，但业务样式中未实际使用 @fontSize
```

**官方样板通不过官方门禁。** 下面逐条定性。

---

## 矛盾一：M5-6 —— 我今天修的方向与 check 完全相反 🔴

### 判据要求什么

`mc-check.cjs:1122-1134`：
```js
// 要求 1：theme-vars.less 中必须有 @fontSize: var(--fontSize) 映射声明
const hasDeclaration = /@fontSize\s*:\s*var\(--fontSize\)/.test(stripComments(themeVarsContent))
```

**硬性要求 `var()` 透传形式，且不接受任何替代写法。**

### 实测 A/B（同一组件，只改这一行）

| `.common()` 里 `@fontSize` | M5-6 |
|---|---|
| `var(--fontSize)` | ✅ **通过** |
| `12px`（字面量） | ❌ **error：theme-vars.less 缺少 `@fontSize: var(--fontSize)` 映射声明** |

### 我今天做了什么

我在**管线侧**（不在 check 侧）加了两条规则，把尺寸变量的 `var()` 降级为字面量：
- `style-tokens.js:1048-1129` `deVarMathLessVars`
- `less-variable-checker.js:26-45` `MATH_OPERAND_VARS` + `:387-412` 分流

**依据是真实编译实验**（`less.render` 三组对照）：
```
@fontSize: var(--fontSize)        → @fontSize * 1.5  ❌ Operation on an invalid type
@fontSize: var(--fontSize, 12px)  → @fontSize * 1.5  ❌ 同样失败
@fontSize: 12px                   → @fontSize * 1.5  ✅ 18px
```

### 定性

**两边各有道理，且不可兼得：**

| | M5-6（check） | 我的铁律（管线） |
|---|---|---|
| 目标 | 字号可**运行期**由宿主 CSS 变量调节 | 字号倍数运算（`@fontSize * 1.5`）可编译 |
| 场景 | 业务写 `@fontSize`（直接用） | 业务写 `@fontSize * 系数` |
| 失败表现 | 字号不可动态调 | **编译期硬报错** |

**关键事实**：真实产物里两种写法**都出现过**。
- `mc-max-1791783220397` 的 `common.less` 用 `calc(@fontSize * 1.2857)` → 能编译（Less 穿透成 CSS `calc()`）
- `mc-max-1791782604925` 的 `common.less:312` 用裸 `@fontSize * 1.5` → **编译失败**

⇒ **真正的病根不是 `var()` vs 字面量，而是业务样式该怎么写倍数**。`calc()` 两种都活，裸乘法只有字面量活。

**建议（比现在两边硬顶更优）**：
1. **业务侧统一写 `calc(@fontSize * N)`**（不是 `@fontSize * N`）；
2. 这样 `@fontSize` 可以**保持 `var()` 透传**（M5-6 过，运行期可调）；
3. **我的 `deVarMathLessVars` / `MATH_OPERAND_VARS` 应当回退或改为「只对裸乘法场景兜底」** —— 否则与 M5-6 永久互斥，产物必然一边被拦。

> 🔴 我今天的修复「对编译正确性」成立，但**与官方判据冲突**，且真机跑通了不代表合规（我那个任务 `mc-1791783806265` 只查了 status=completed，**没跑 mc-check**）。这是我的验证漏洞。

---

## 矛盾二：M3-13 —— 官方 demo 只有一个 light 主题，check 必查 dark

### demo 怎么写

`c-mc-demo/declare.json`：
```json
"themeConfig": { "default": "light", "list": [ { "name": "亮色", "key": "light" } ] }
```
**只有 light，没有 dark。**

### check 怎么判

`mc-check.cjs:620-631`：
```js
if (isBusiness) {
  const hasDarkTheme = themeList.some((t) => t.key === 'dark')
  results.push(issue('M3-13', 'dark主题配置', hasDarkTheme, ...))
}
```

`isBusiness` 的判定（`:117-132`）：未配 `componentCategory` 时，**只要不在豁免名单就是业务组件**（默认 `true`）。豁免名单只有 `["c-mc-micro-*"]`。

⇒ **demo 未声明豁免、未设 `componentCategory` ⇒ 被当业务组件 ⇒ M3-13 必挂。**

### 定性

这是**可配置的策略冲突**，不一定是 bug：
- 若「只做浅色的组件」是合法场景 → 豁免名单该加 `c-mc-demo*`，或 M3-13 应对「无 dark」降级为 WARN；
- 若「微码组件必须有 dark」是硬契约 → demo 写错了。

**倾向后者**：微码组件库的组件要在任意宿主面板里可用，缺 dark 基本没法上生产。**建议 demo 补 dark**（同时这也是我 N 主题能力的直接用例）。

---

## 矛盾三：M3-12 —— demo 缺 layoutConfig，check 必查

### demo

`c-mc-demo/declare.json` **完全没有 `layoutConfig` 字段**（对比 `c-mc-css-demo-event` 有完整 3 条）。

### check

`mc-check.cjs:607-617`：`layoutList.length >= 1` 才过。

### 定性

**check 对、demo 不完整**。`layoutConfig` 是必填结构（管线侧 `component-template.js:161-170` 也强制给默认值），demo 属于早期手写、没跟上规范。

⇒ 建议 demo 补 `layoutConfig`（顺带可作为多布局的最小示例）。

---

## 矛盾四：M4-10 —— demo 的自定义主色被枚举白名单拦

### demo 的 `css-vars.js` dark 主题

```js
const dark = {
  colorPrimary: '#3677f8',        // ← 自定义蓝
  colorPrimaryBg: '#696969',      // ← 自定义灰
  ...
}
```

### check 的白名单

`darkThemeColorRules` 硬枚举：`colorPrimary: ['#44E4FF']`、`colorPrimaryBg: ['#414141','#454545','#474747']`。

⇒ demo 的值**不在白名单** ⇒ M4-10 error。

### 定性

M4-10 的设计意图是「防止模型编造深色主色」，白名单是给**默认深色主题**的基准值。
但 demo 表明**深色主色应该由设计稿决定**（可以是任意色）。

**这正是我们 D8 双真值豁免要解决的问题** —— 而该豁免已因统一到 scaffold 版而丢失（见评审文档 §6）。

**这是本次统一带来的最实质的功能损失**：多主题产物（色值来自 Figma 真值）会被 M4-10 全拦。

---

## 矛盾五：`businessConfig` —— demo 用数组，check 也要数组，但管线 prompt 教对象

| 来源 | 写法 |
|---|---|
| `c-mc-demo/declare.json` | `"businessConfig": [{ "name":"查询字段:", "key":"queryField", "type":"array" }]` ✅ 数组 |
| `mc-check` 校验 | 要求数组（BLOCK） |
| **管线 `prompt-builder.js:2178` 示例** | `"businessConfig": {}` ❌ **对象** |
| 全部实测生成产物 | `{}` ❌ 对象 |

⇒ **demo 和 check 一致，都对；是管线的 prompt 示例错了**，导致模型永远输出对象、必被 BLOCK。
**修复方向明确**：把 prompt 示例改成数组。

---

## 矛盾六：`cssVariableConfig` —— demo 独有，管线 schema 不支持

demo 有（且是**多布局变量分域**的关键）：
```json
"cssVariableConfig": [
  { "name":"xy轴字体颜色", "key":"axisColor", "type":"color", "layoutTypes":["echartBar"] },
  { "name":"饼图字体大小", "key":"pieFontSize", "type":"size", "layoutTypes":["echartPie"] }
]
```

管线侧**完全没有 `cssVariableConfig` 这个字段**（生成产物里也不存在）。

⇒ 这正是「方便后期扩充多布局」的**现成契约** —— demo 已经定义好了怎么把变量限定到某个布局。

---

## 汇总表

| # | 矛盾 | demo | check | 定性 | 建议 |
|---|---|---|---|---|---|
| 1 | M5-6 fontSize 形式 | `var()` ✅ | 强制 `var()` | 🔴 **两边互斥**，我今天改了管线侧 | 业务统一写 `calc(@fontSize * N)`；回退或改造我的铁律 |
| 2 | M3-13 dark 必查 | 只有 light | 必查 dark | 🟡 策略冲突 | demo 补 dark（推荐）或豁免 |
| 3 | M3-12 layoutConfig | 缺失 | 必填 ≥1 | 🟢 check 对 | demo 补 |
| 4 | M4-10 主色枚举 | 自定义色 | 硬枚举 | 🔴 **功能损失**（统一后） | 把 D8 豁免移植回 scaffold 版 |
| 5 | businessConfig 类型 | 数组 ✅ | 要数组 | 🟢 demo/check 对，管线错 | 修 `prompt-builder.js:2178` |
| 6 | cssVariableConfig | 有（含 layoutTypes） | — | 🟡 demo 领先 | 管线补字段（多布局预留） |

---

## 我的判断

**最要紧的是第 1 条和第 4 条：**

1. **第 1 条我今天做错了方向** —— 依据「Less 硬限制」这个真事实，但没先查官方判据就动手。正确解法不是二选一，而是**让业务统一用 `calc()`**，两种形态便都可行。
2. **第 4 条是统一的直接代价** —— scaffold 版没有 D8 双真值豁免，多主题产物必被拦。

**建议处理顺序**：
1. 先定第 1 条的写法规范（`calc()`），再决定我的铁律是回退还是改造；
2. 把 D8 豁免移植进 scaffold 版（保住多主题可用性）；
3. 第 5 条（`businessConfig` prompt）是明确 bug，随时可修；
4. 第 6 条为多布局预留；
5. 第 2/3 条建议反馈给 demo 作者补全。

---

## 附：复现命令

```bash
cd /Users/smigoo/工作/mvgo/backend-node
node skills/frontend-mc-check/scripts/mc-check.cjs --component-path <组件绝对路径>
```
⚠️ 不传 `--component-path` 时，脚本把参数当组件 id 拼到 `ROOT/<componentBaseDir>` 下；
`ROOT` 由 `__dirname` 上溯 4 级写死在 `backend-node` 之外，换目录就找不到。
