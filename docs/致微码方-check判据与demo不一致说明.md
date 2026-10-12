# 关于 frontend-mc-check 判据与官方 demo 不一致的沟通说明

> 发出方：微码组件生成平台（mvgo）研发
> 接收方：微码组件规范 / mc-check 维护方
> 日期：2026-10-12
> 版本：mc-check v1.0.20

---

## 一、背景与结论

我们在接入 `frontend-mc-check`（v1.0.20）作为组件质量门禁时，**用该判据检查了官方提供的 demo 组件，发现官方 demo 自身无法通过官方判据**。

这意味着我们在开发过程中遇到一个两难：**按 demo 写会不合规，按判据写又不知道与 demo 的差异该以哪个为准**。为避免猜测，我们实测了每个冲突点，现把证据整理如下，恳请确认哪一侧是当前推荐的标准。

---

## 二、复现方式

```bash
node scripts/mc-check.cjs --component-path <组件绝对路径>
```

实测结果：

```
c-mc-css-demo-event   通过:32  失败:1
c-mc-demo             通过:29  失败:3
```

---

## 三、逐条不一致明细

### 【问题 1】`c-mc-demo` 未声明 `layoutConfig`，但判据要求至少一个布局

**判据要求**（M3-12，`mc-check.cjs:607-617`）：
> `layoutConfig.list 至少需要一个布局配置`

**demo 实际情况**：`c-mc-demo/declare.json` 中**完全没有 `layoutConfig` 字段**。
（对比：`c-mc-css-demo-event` 有完整的 3 条布局声明。）

**我们的疑问**：
- `layoutConfig` 是必填结构吗？
- 若必填，建议在 demo 中补齐（我们发现 `c-mc-css-demo-event` 的多布局写法很完整，可直接作为参考示例）；
- 若非必填，建议 M3-12 降级为 WARN，或增加条件（仅当存在 `themeConfig` 多主题时才检查布局）。

---

### 【问题 2】`c-mc-demo` 只有 light 主题，但判据强制要求必须有 dark

**判据要求**（M3-13，`mc-check.cjs:620-631`）：
> `themeConfig.list 中必须包含 key="dark" 的主题`

**demo 实际情况**（`c-mc-demo/declare.json`）：
```json
"themeConfig": {
  "default": "light",
  "list": [ { "name": "亮色", "key": "light" } ]
}
```
**只有 light，没有 dark。**

判据的豁免逻辑（`mc-check.cjs:117-132`）：仅当 `componentCategory === 'service'`，或组件 id 命中 `businessExemptionList`（当前仅 `["c-mc-micro-*"]`）时才跳过。demo 两个条件都不满足，因此被判为业务组件并触发 M3-13。

**我们的疑问**：
- 「微码组件必须有 dark 主题」是硬性契约吗？
  - 若是，**建议 demo 补齐 dark**（我们的多主题生成能力也依赖这个前提）；
  - 若否（例如允许纯浅色组件），建议 M3-13 对「无 dark」降级为 WARN，或扩充豁免名单。

---

### 【问题 3】`c-mc-demo` 声明了 `fontSize` 但业务样式从未使用，判据 M5-6 不通过

**判据要求**（M5-6，`mc-check.cjs:1122-1134`）包含**两个条件**：
> 要求 1：`theme-vars.less` 中必须有 `@fontSize: var(--fontSize)` 映射声明
> 要求 2：业务样式中实际使用了 `@fontSize`

**demo 实际情况**：
- `theme-vars.less:2` → `@fontSize: var(--fontSize);` ✅ 满足要求 1
- `css-vars.js:3` → `fontSize: $mcCssBuilder.getCssSize(),` ✅ 声明了变量
- `common.less` → **没有任何 `font-size` 或 `@fontSize`** ❌ 触发要求 2

判据报错原文：
> `css-vars.js 已定义 fontSize，但业务样式中未实际使用 @fontSize`

**我们的疑问**：M5-6 的语义是「声明了就要用」。但 demo 声明了 `fontSize` 却不用，看起来是**样板代码未清理**，而非规范意图。我们理解判据的本意是「防止定义了字号变量却不落到样式上」，这个意图合理。

**建议**：demo 补上 `@fontSize` 的实际使用（这样同时消除问题 3 与问题 4）。

---

### 【问题 4】判据要求 `var(--fontSize)` 形式，但直接使用会导致 LESS 编译失败 ⚠️

这是我们最需要确认的一条，因为它**影响所有生成产物**。

**判据要求**（M5-6，`mc-check.cjs:1122-1134`）：
```js
// 要求 1：theme-vars.less 中必须有 @fontSize: var(--fontSize) 映射声明
const hasDeclaration = /@fontSize\s*:\s*var\(--fontSize\)/.test(...)
```
**硬性要求 `var()` 透传形式，且不接受任何替代写法。**

**我们实测发现的问题**：Less 变量一旦是 `var()` 形式，就**无法参与算术运算**。三组对照实验：

| `.common()` 中的定义 | 业务样式 `@fontSize * 1.5` |
|---|---|
| `@fontSize: var(--fontSize)` | ❌ `Operation on an invalid type`（编译失败） |
| `@fontSize: var(--fontSize, 12px)` | ❌ **同样失败**（fallback 不参与 Less 求值） |
| `@fontSize: 12px` | ✅ 成功（18px） |

**真实的线上案例**：我们有一个组件使用了裸的 `@fontSize * 1.5`，导致最终 LESS 编译门禁阻断、生成失败。改为 `@fontSize: 12px` 后可以编译，但**又违反 M5-6**。两条路互相堵死。

**我们的发现**：问题不在于「var() 还是字面量」，而在于**业务样式怎么写倍数**：

| 业务写法 | `@fontSize: var(--fontSize)` | `@fontSize: 12px` |
|---|---|---|
| `calc(@fontSize * 1.5)` | ✅ 通过 | ✅ 通过 |
| `@fontSize * 1.5`（裸乘法） | ❌ **编译失败** | ✅ 通过 |

⇒ **只要业务侧统一使用 `calc(@fontSize * N)`，两种变量定义形式都能正常工作**，M5-6 与 LESS 编译就不再冲突。

完整 6 组对照见附件脚本 `backend-node/scripts/repro-less-var-arithmetic.mjs`（可直接运行验证）：
```
var(--fontSize)       + 裸乘法            → ❌ Operation on an invalid type
var(--fontSize)       + calc(...)          → ✅
var(--fontSize, 12px) + 裸乘法            → ❌ Operation on an invalid type
var(--fontSize, 12px) + calc(...)          → ✅
12px                  + 裸乘法            → ✅ 18px
12px                  + calc(...)          → ✅
```

**我们的疑问与建议**：
1. 能否在规范文档中**明确要求业务样式使用 `calc(@fontSize * N)` 写法**？（这样 `var()` 透传与编译正确性可以同时满足，M5-6 与 LESS 编译不再冲突）
2. 是否可以增加一条**互补的检查项**：禁止业务样式出现裸的 `@fontSize * N`（要求必须用 `calc()`）？这样可以从规范层面根除这类编译失败。

---

### 【问题 5】`c-mc-css-demo-event` 的自定义主题色被 M4-10 枚举拦截

**判据要求**（M4-10）：dark 主题的 `colorPrimary` / `colorPrimaryBg` 等核心变量**必须落在硬编码枚举内**：
- `colorPrimary` → `["#44E4FF"]`
- `colorPrimaryBg` → `["#414141", "#454545", "#474747"]`

**demo 实际情况**（`c-mc-css-demo-event/resources/config/css-vars.js`）：
```js
const dark = {
  colorPrimary: '#3677f8',      // 不在枚举内
  colorPrimaryBg: '#696969',    // 不在枚举内
  ...
}
```

实测报错：
> `[M4-10] colorPrimary: "#3677f8" 不在允许值 [#44E4FF] 中；colorPrimaryBg: "#696969" 不在允许值 [#414141, #454545, #474747] 中`

**我们的理解**：M4-10 的意图应该是防止模型臆造深色主题色。但 demo 表明**深色主色本可以由设计稿决定**（这里是 `#3677f8` 这个特定蓝色）。

**我们的疑问**：
- 当用户提供了明确的深色设计稿时，深色主色应当以设计稿为准，此时 M4-10 的枚举校验是否应该豁免？
- 我们此前在本地版本加过一个「双真值模式」的豁免逻辑（通过检测产物内的确定性标记来判断），但当前使用的 v1.0.20 官方版本中没有这个能力。
- **想请教：官方是否已有对应机制？若有，应如何使用？若无，是否考虑支持？**

---

## 四、我们已确认「一致」的部分（供参考，无需回复）

以下 demo 与判据是对齐的，我们已按判据实现：
- M2-4：`themes/` 目录需包含 `theme-vars.less` + 各主题的 `.less`（demo 的 `light.less`/`dark.less` 结构完整）
- M4-5：`index.less` 需 import 各主题覆盖层
- `businessConfig` 必须是**数组**（demo 的 `c-mc-demo` 写法正确：`[{ name, key, type }]`）

---

## 五、待确认问题清单（逐条回复即可）

| # | 问题 | 期望结论 |
|---|---|---|
| 1 | `layoutConfig` 是否必填？ | demo 补齐 / 判据降级 |
| 2 | 微码组件是否必须包含 dark 主题？ | 是 → demo 补齐；否 → 判据放宽 |
| 3 | 是否需要在规范中明确「业务样式字号倍数必须写 `calc(@fontSize * N)`」？ | 是否增加该规范 + 对应检查项 |
| 4 | 设计稿驱动的深色主题，M4-10 枚举校验如何处理？ | 是否有官方豁免机制及其用法 |
| 5 | M5-6 要求「必须使用 @fontSize」，若组件无字号需求是否可豁免？ | 是否降级为 WARN |

---

## 六、我们的处理原则

在收到回复前，我们会：
1. 以**判据**为准做门禁（保证组件可上线）；
2. 以**demo**为准做代码结构参考（保证风格一致）；
3. 对上述 5 条冲突点，在代码中以**最小影响、可快速切换**的方式处理，一旦确认标准后即可低成本调整。

如有需要，我们可以提供更详细的复现工程或跑批数据。
