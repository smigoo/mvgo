# 标准组件 Demo × 生成管线 契约评审报告

> 评审日期：2026-10-12
> 基准（demo）：`~/Downloads/microcode-scaffold-main 3/src/workspace/custom-components/`
> 被评（管线）：`mvgo` backend-node 微码生成管线（phase2 / lite 两条）
> 判据工具：项目内已统一的 `frontend-mc-check` **v1.0.20**（scaffold 版）

---

## 0. 结论先行（TL;DR）

| 维度 | 管线是否对齐 demo | 严重度 | 一句话 |
|---|---|---|---|
| **多布局** | ❌ 完全未实现 | 🔴 高 | demo 有完整运行时（`:is="layouts[layoutType]"` + 异步组件注册表），管线**只产出单布局壳**、无生成、无校验、无运行时 |
| **多主题** | ⚠️ 结构对齐，**范式相反** | 🔴 高 | 结构（`.theme-<key>()` + `&.<key>` 覆盖层）一致；但 demo 走 **模式 A（`var()` 透传）**，管线强制 **模式 B（Less 槽位）** |
| **样式变量** | ⚠️ 槽位划分一致，**表达方式冲突** | 🟡 中 | 变量**分类**（common/主题专属/布局专属）两边一致；但 demo 的 `.common()` 允许 `var()`，管线 2026-10-12 刚立的铁律要求**尺寸必须字面量** |
| **事件定义调用** | ❌ 范式冲突 | 🔴 高 | demo 的 `businessEvents: {}` **是空的**；管线强制 keyed 对象 + `-onload` 强约定 + `publishEvent` 必声明 |

**最硬的证据**：把刚统一的 mc-check v1.0.20 **跑在官方 demo 自己身上**，两个 demo **都判「不允许上线」**：

```
❌ c-mc-css-demo-event 通过:32 失败:1 ← 不允许上线
   └─ [M4-10] dark核心变量色值枚举: colorPrimary "#3677f8" 不在允许值 [#44E4FF] 中

❌ c-mc-demo 通过:29 失败:3 ← 不允许上线
   └─ [M3-12] layoutConfig.list 至少需要一个布局配置
   └─ [M3-13] themeConfig.list 中必须包含 key="dark" 的主题
   └─ [M5-6] css-vars.js 已定义 fontSize，但业务样式中未实际使用 @fontSize
```

⇒ **demo 与判据本身不同源**。这不是「demo 写错了」，而是**两套并行的范式**：demo 是 2025-05 的人工样板（模式 A），判据与生成器是 2026-10 的模式 B 体系。

---

## 1. 多布局（layoutConfig）

### 1.1 demo 的做法（基准）

`declare.json`：
```json
"layoutConfig": {
  "default": "list",
  "list": [
    { "name": "列表布局",   "key": "list",      "previewName": "mc-preview.png" },
    { "name": "柱形图布局", "key": "echartBar", "previewName": "mc-preview-two.png" },
    { "name": "饼图布局",   "key": "echartPie", "previewName": "mc-preview-three.png" }
  ]
}
```

**运行时实现**（`package/index.vue:11-34`）—— 这是核心：
```vue
<component
  :is="layouts[componentProps?.layoutType]"
  :class="['event-wrapper', componentProps?.themeType]"
  ...
/>
...
const { componentProps } = $mcComponentBuilder()
const layouts = {
  list:      defineAsyncComponent(() => import('./components/List.vue')),
  echartBar: defineAsyncComponent(() => import('./components/EchartBar.vue')),
  echartPie: defineAsyncComponent(() => import('./components/EchartPie.vue'))
}
```

配套：
- 每布局一个**独立子组件**（`package/components/{List,EchartBar,EchartPie}.vue`）
- 每布局一张**独立预览图**（`mc-preview*.png`，命名与 `previewName` 对应）
- 每布局**独立的 cssVariableConfig 项**（`axisColor`/`barHoverColor` 只对 `echartBar`、`pieFontSize` 只对 `echartPie`，用 `layoutTypes` 字段限定）
- 布局专属图片放 `resources/images/layout-one/*.svg`（按布局分目录）

### 1.2 管线现状

| 环节 | 现状 | 位置 |
|---|---|---|
| 结构校验 | ✅ 有（`DECL_LAYOUT_*`，BLOCK 级） | `declare-json-schema-validator.js:222-256` |
| 生成 | ⚠️ 只有单布局壳 | `component-template.js:161-170`（`{default:'one', list:[1条]}`）；`lite.service.ts:2628-2633` |
| 兜底 | ⚠️ 结构非法时**强制重置为单布局** | `microcode-engineer.js:5316-5347` |
| 预览图 | ❌ 只有一张 `mc-preview.png`，**无 N 张逻辑** | `figma-connector.js:1597-1601`；`lite.service.ts:598-600` |
| 运行时切换 | ❌ **零实现**。全仓产物 grep `layoutType\|layoutConfig` **零命中** | — |
| 规范文档 | 🔴 **死文件**（`prompts/references/multi-layout-pattern.md` 从未被 prompt 加载） | `multi-layout-pattern.md:46` 自述 |

前端只把 `layoutConfig.default` 透传成 prop（`core.js:96` → `layoutType`），但**产物侧没有消费方**。

### 1.3 差距与建议

**差距**：demo 的多布局是「**一个 key ↔ 一个子组件 ↔ 一张预览图 ↔ 一组专属变量**」的四元映射；管线只有 `key` 一个维度，且没有运行时。

**建议（按你说的「暂时不考虑多布局，但要符合主题标准、方便后期扩充」）**：

1. **不动实现，只留扩展位** —— `layoutConfig` 的 `{default, list[]}` 结构**已经与 demo 同构**，无需改；
2. **补一条 M2-4 同级判据**：现在只检查 `layoutConfig.list.length >= 1`，建议加 WARN 级「`previewName` 与 `list[].key` 一一对应」检查，为后续多布局预留；
3. **CSS 变量按 `layoutTypes` 分域** —— demo 已有 `layoutTypes` 字段，管线**完全没有**。这是「方便后期扩充」的关键：将来加布局时，布局专属变量（`pieFontSize` 这类）能有地方挂。建议在 `cssVariableConfig` schema 里预留该字段（先只校验不消费）；
4. 🔴 **注意死文件**：`multi-layout-pattern.md` 若将来要启用，必须先解决「加载链三查」问题，否则改了也不生效。

---

## 2. 多主题（themeConfig）

### 2.1 两边结构一致 ✅

| 项 | demo | 管线 | 一致 |
|---|---|---|---|
| `themeConfig` 结构 | `{default, list:[{name,key}]}` | 同 | ✅ |
| mixin 命名 | `.theme-dark()` / `.theme-light()` | `.theme-<key>()` | ✅ |
| 覆盖层文件 | `themes/light.less` / `dark.less` | 同（`THEME_WRAPPER_TEMPLATES`） | ✅ |
| 覆盖层内容 | `&.light { .theme-light(); @import (multiple) '../common.less'; }` | 同 | ✅ |
| `index.less` | `@import theme-vars` + `@import` 各主题覆盖层 | 同 | ✅ |

### 2.2 但**范式相反** 🔴

demo 的 `theme-vars.less`：
```less
.common() {
  @fontSize: var(--fontSize);          // ← 模式 A：var() 透传
  @colorTextBase: var(--colorTextBase);
  @colorPrimary: var(--colorPrimary);
  ...
}
.common();                              // ← 文件顶层直接调用

.theme-dark() { }                       // ← 空 mixin
.theme-light() { }                      // ← 空 mixin
```

管线的模式 B：
- 颜色**只能**落在 `.theme-*(  )` 里，值取 Figma 真值；
- 业务样式只能写 `@color-xxx`（Less 槽位），**禁 `var(--colorXxx)`**；
- 门禁 `THEME-VAR-NAME-MISMATCH` >3 处直接 **BLOCK**（`theme-color-guard.js:762-780`）。

**这两套不可能同时成立。** mc-check 实跑已证实：demo 的 `colorPrimary: "#3677f8"` 被 M4-10 判 error（不在枚举白名单）。

### 2.3 覆盖层：demo 比管线「多一步」

demo 的 `light.less` **不只 import common.less，还写主题专属样式**：
```less
&.light {
  .theme-light();
  @import (multiple) '../common.less';
  .box { box-shadow: ... }              // ← 主题专属样式
}
```

管线的 `THEME_WRAPPER_TEMPLATES` 只有 import 骨架，**没有主题专属样式块的位置**。

**这一点对 N 主题扩容很关键**：管线目前只能做到「**同一套结构 + N 套变量**」，做不到 demo 的「**N 套变量 + N 套差异化样式**」。后者才是多主题的完整形态。

### 2.4 🔴 我引入的缺陷（需修）

上一轮我为 N 主题加覆盖层生成时，在 `microcode-engineer.js:_buildBootstrapStyleFiles` 引用了**未声明的 `themeMeta`**：
```
microcode-engineer.js:4862 / :4869  → themeMeta is not defined
```
该 `ReferenceError` 被外层 try/catch 吞成 warn ⇒ **N 主题覆盖层实际不生成**，且**零报错**。

同时 mc-check 的 **M2-4**（`:239-249`）与 **M4-5**（`:746-756`）要求「每个 `themeConfig.list[].key` 都有对应 `.less` 且被 `index.less` import」⇒ 契约与实现已经对不上。

> ⚠️ 这条必须先修，否则后续扩主题越多、缺口越大。

---

## 3. 样式变量

### 3.1 槽位分类 —— 高度一致 ✅

demo 的三层划分，管线都有对应：

| demo | 管线 | 说明 |
|---|---|---|
| `common`（`css-vars.js`）+ `.common()` mixin | 同 | 跨主题共享 |
| `dark` / `light` 对象 + `.theme-*()` | 同 | 主题专属 |
| `layoutTypes` 限定的变量（`axisColor` 等） | ❌ **无此维度** | 见 §1.3 |
| `$mcCssBuilder.getCssSize()` | ✅ 有 | 尺寸取基准倍数 |

### 3.2 冲突点一：`.common()` 能否用 `var()`

| | 主张 |
|---|---|
| demo | `.common()` 里 `@fontSize: var(--fontSize)` ✅ |
| 管线（2026-10-12 铁律） | 尺寸变量**必须字面量**，因为 Less 变量是 `var()` 就**无法参与算术** |

实测三组对照（`less.render`）：
```
@fontSize: var(--fontSize)        → @fontSize * 1.5  ❌ invalid type
@fontSize: var(--fontSize, 12px)  → @fontSize * 1.5  ❌ invalid type（fallback 不参与 Less 求值）
@fontSize: 12px                   → @fontSize * 1.5  ✅ 18px
```

**这不是范式之争，是 Less 的硬限制。** demo 的写法在**只做透传**（不运算）时可用，一旦业务写 `@fontSize * 1.5` 就会炸。

> 🔴 **代码里已自认这个矛盾**：`style-tokens.js:1058-1059` 注释写「文件头还写着『禁止 CSS 变量』，自相矛盾」。
> 而 demo 的 `theme-vars.less` 文件头确实没写「禁止 CSS 变量」—— 所以**是管线的文件头注释与 demo 的实际用法冲突**。

### 3.3 冲突点二：兜底模板仍在教旧写法 🔴

以下位置仍写 `@fontSize: var(--fontSize)`，与新铁律**直接矛盾**，且它们是**中断/失败任务的兜底产物**（会被用户看到）：
- `microcode-engineer.js:4825`（bootstrap 模板）
- `code-healer.js:1621`
- `file-writer.js:717`（`THEME-PRESET-OVERRIDE` 文案仍教 `var(--colorTextBase, <默认>)`）

**这类「文档/模板说一套、生成器做一套」的问题，会让后续任何排查都绕远路。**

### 3.4 建议

1. **保留铁律**（Less 限制是硬的，demo 的写法在运算场景必炸）；
2. **统一文件头注释**：把「禁止 CSS 变量」改成准确表述 —— 「`.common()` 禁颜色；尺寸必须字面量（`var()` 无法参与 Less 运算）；颜色透传仅限不参与运算的框架预设」；
3. **清理 3 处兜底模板**，与铁律对齐；
4. **demo 与铁律的关系要在文档里写清**：demo 是手写样板（可透传），生成器产物必须走字面量。二者不应混为一谈。

---

## 4. 事件定义与调用

### 4.1 🔴 根本分歧：demo 的 `businessEvents` 是空的

```json
"businessEvents": {},       // ← demo：空对象
"businessStatuses": {},
"promptConfig": [
  { "name": "事件类型描述", "key": "eventTypeDesc", "value": "事件类型" },
  { "name": "事件类型数量", "key": "eventTypeCount", "value": "事件数量" }
]
```

demo 用 **`promptConfig` + `dataSources`** 这类更轻的机制表达「可配置项」，而**不用 `businessEvents`**。

管线则强制：
- `businessEvents` 必填且**必须是对象**（`DECL_EVENTS_REQUIRED` / `DECL_EVENTS_ARRAY`，`declare-json-schema-validator.js:146-177`）
- 必须含 `${name}-onload`（`:173-176`，WARN 级）
- 组件内必须用 `runtimeBuilder.publishEvent()`，且**未声明即失败**（`mc-health-validator.js:237-252`，M5-4/M5-5）

### 4.2 `businessConfig` —— 规范与现实矛盾

| 来源 | 说法 |
|---|---|
| 规范 `references/specs/declare-json.md:144-167` | **数组**，每项 `{name,key,type,describe,renderType,default,list}` |
| 校验器 `declare-json-schema-validator.js:370-412` | **必须数组**（`DECL_BIZCFG_ARRAY`，BLOCK） |
| prompt 示例 `prompt-builder.js:2178` | `"businessConfig": {}` ← **对象** |
| 全部实测产物 | `{}` ← **对象** |

**prompt 教的是对象、校验器要的是数组** ⇒ 产物必然过不了 BLOCK。

### 4.3 `dataSources` / `formSources` —— 实际不产出

合并时**强制以骨架为准，LLM 输出被丢弃**（`code-generator.js:1376-1382`），骨架默认 `null` ⇒ 两个字段恒为 `null`，等于**功能未实现**。

### 4.4 事件名分裂（管线自身问题）

实测产物里同时存在两个 onload：
```
declare.json:  c-device-monitor-8bg3u6ns-onload   ← 带 componentId 前缀
declare.json:  device-monitor-onload              ← 不带
package/index.vue:295  publishEvent('device-monitor-onload', ...)
```
根因是 `code-validator.js:1425-1517` 的「**以代码为准**改写 declare 声明」—— 但改写不彻底，留下两套。

### 4.5 建议

| 项 | 动作 | 优先级 |
|---|---|---|
| `businessEvents` 空对象 | 明确 demo 是「不涉及事件」的最小样板，非完整契约；**以管线为准**（判据 + 门禁更完整） | 低（文档澄清） |
| `businessConfig` 类型矛盾 | 🔴 **修 prompt 示例**（`:2178` 改数组），否则模型永远输出 `{}` 被 BLOCK | 🔴 高 |
| `businessConfig` 空判据 | mc-check M3-9 用 `length > 0` 才检查 ⇒ `{}` 直接跳过，**门禁形同虚设** | 🟡 中 |
| `dataSources`/`formSources` | 要么实现、要么从 schema 移除。当前「校验必填数组 + 实际恒 null」是自相矛盾 | 🟡 中 |
| 事件名分裂 | 修 `code-validator.js:1425-1517` 的改写逻辑，保证 declare 与代码**单一命名** | 🟡 中 |

---

## 5. 行动清单（按优先级）

| # | 事项 | 类型 | 优先级 | 状态 |
|---|---|---|---|---|
| 1 | 修 `microcode-engineer.js` 的 `themeMeta` 未声明 | 🐛 我的缺陷 | 🔴 P0 | ✅ **本轮已修**（详见 §8） |
| 2 | 修 `prompt-builder.js:2178` 的 `businessConfig` 示例（对象→数组） | 🐛 既有 | 🔴 P0 | ⏳ 待你确认 |
| 3 | `index.less` 覆盖层 import 按 N 主题生成 | 📐 契约 | 🔴 P0 | ✅ **本轮已修**（详见 §8） |
| 4 | `verify:dual-truth` 兼容无 `_M4_10_DUAL_TRUTH` 的上游 config | 🔧 工具 | 🔴 P0 | ✅ **本轮已修**（脚本不再崩，如实报告不通过） |
| 5 | 统一 `.common()` 文件头注释 + 清理 3 处兜底模板的 `var(--fontSize)` | 📄 一致性 | 🟡 P1 | ⏳ 待做 |
| 6 | 修事件名分裂 | 🐛 既有 | 🟡 P1 | ⏳ 待做 |
| 7 | `cssVariableConfig` 预留 `layoutTypes` 字段（只校验不消费） | 🧪 预留 | 🟡 P1 | ⏳ 待做 |
| 8 | `businessConfig` 空判据（M3-9）收紧 | 🧪 门禁 | 🟢 P2 | ⏳ 待做 |
| 9 | `dataSources`/`formSources` 定去留 | 📋 决策 | 🟢 P2 | ⏳ 待做 |
| 10 | 文档澄清：demo 是手写样板（模式 A），生成器走模式 B | 📄 文档 | 🟢 P2 | ⏳ 待做 |
| 11 | 多布局运行时（`:is="layouts[layoutType]"` + 异步组件表） | 🚧 暂缓 | ⚪ — | 按指示暂不考虑 |

---

## 6. ⚠️ 已确认的连带影响：双真值豁免丢失

把 mc-check 统一为 scaffold 上游版后，**D8 双真值豁免随之消失**，后果已实测兑现：

```
$ npm run verify:dual-truth
❌ 双真值被识别
❌ 双真值 M4-10 通过 — colorTextBase "#e8ecf5" 不在允许值 [#ffffff, #F0F0F0] 中
```

含义：**任何双主题/多主题产物，只要色值来自 Figma 设计真值（非枚举白名单值），M4-10 就会判 error 并阻止上线**。

已做处理：修 `verify-m4-10-dual-truth.mjs` 的断言，让它在缺 `_M4_10_DUAL_TRUTH` 时按「豁免名单为空」运行 —— **不再崩溃，如实报告不通过**。

待你决策：
- **选项 i**：把 D8 豁免**移植进 scaffold 版**（3 处配套改动）⇒ 既保持版本统一，又保住功能（推荐）
- **选项 ii**：接受现状，双主题产物暂时过不了 M4-10（不推荐 —— 功能直接不可用）

---

## 7. 需要你决策的三点

1. **demo 与判据不同源，怎么定性？**
   - A：demo 是历史手写样板（模式 A），**判据与管线为准**，仅作结构参考（推荐）
   - B：demo 是现行标准（模式 A），**管线改回 `var()` 透传** —— 但与 Less 运算硬限制冲突，且要推翻 theme-color-guard 四道门禁

2. **双真值豁免是否移植进 scaffold 版？**（见 §6，不移植则双主题功能不可用）

3. **P0 剩余项（`businessConfig` prompt 示例）要不要现在修？**

---

## 8. 本轮已完成的修复（附证据）

### 8.1 `themeMeta` 未声明（我引入的静默缺陷）

**症状**：`_buildBootstrapStyleFiles` 引用未声明的 `themeMeta` ⇒ `ReferenceError` 被外层 catch 吞成 warn ⇒ **N 主题覆盖层不生成，零报错**。

**修复**：从形参 `input` 显式取值（该函数签名是 `(backgroundBrightness, input)`，此前我误以为有 `opts`）。

⚠️ 修第一版时我又引入了 `opts.styleTokens?.themeMeta` —— **`opts` 在本函数不存在**，会二次抛错。是靠签名核实才发现的。

### 8.2 `index.less` 覆盖层 import 按 N 主题生成

**症状**：原实现硬编码 `@import dark.less / light.less` 两行 ⇒ 第 3 个及以后的主题**生成了文件但没被 import**，等于死文件，直接违反 M4-5。

**修复**：`buildIndexLessTemplate(backgroundBrightness, emitThemeOverrides, themeKeys)` 按 keys 数组生成，去重。

**验证**（离线，含阳性对照）：
```
① 单稿(不传)        → 2 行  ✅ 单稿逐字节不变
② 单稿(空数组)      → 2 行  ✅
③ 双主题            → 2 行  ✅
④ 三主题            → 3 行  ✅ dusk-mode.less 被 import
⑤ 含重复 key        → 2 行  ✅ 去重
关闭覆盖层开关      → 0 行  ✅
```

**回归**：`tsc` 239（< 242 基线）。

---

## 9. 附：证据索引

**demo 侧**
- `c-mc-css-demo-event/declare.json` —— layoutConfig/themeConfig/cssVariableConfig/layoutTypes/promptConfig
- `c-mc-css-demo-event/package/index.vue:11-34` —— 布局运行时 + `layouts` 注册表
- `c-mc-css-demo-event/resources/styles/theme-vars.less` —— 模式 A（`var()` 透传 + 空主题 mixin）
- `c-mc-css-demo-event/resources/styles/themes/light.less` —— `&.light` + 主题专属样式
- `c-mc-css-demo-event/resources/config/css-vars.js` —— `common`/`dark`/`light` 三段

**管线侧**
- `declare-json-schema-validator.js:146-177`（事件）`:222-256`（布局）`:259-290`（主题）`:370-412`（businessConfig）
- `theme-color-guard.js:762-780`（THEME-VAR-NAME-MISMATCH）
- `style-tokens.js:1048-1129`（deVarMathLessVars）`:1260-1386`（renderMicrocodeThemeVarsLess）
- `less-variable-checker.js:26-45`（MATH_OPERAND_VARS）`:387-412`（分流）
- `microcode-engineer.js:4819-4874`（bootstrap 样式）`:4890-4898`（`_buildThemeWrapperLess`）`:7753-7768`（渲染调用点）
- `mc-check.cjs:239-249`（M2-4）`:746-756`（M4-5）`:490`（M3-9）
- `code-validator.js:1425-1517`（事件名对齐）

**实跑命令**（mc-check v1.0.20，scaffold 版）
```bash
node backend-node/skills/frontend-mc-check/scripts/mc-check.cjs \
  --component-path <组件目录>
```
> ⚠️ 脚本的 `ROOT` 由 `__dirname` 上溯 4 级写死，**只认 `backend-node` 之外的固定布局**；对外部目录必须用 `--component-path`。

---

## 7. 需要你决策的两点

1. **demo 与判据不同源，怎么定性？**
   - 选项 A：demo 是历史手写样板（模式 A），**判据与管线为准**，仅把 demo 当结构参考 → 我按此补充文档说明（推荐）
   - 选项 B：demo 是现行标准（模式 A），**管线要改回 `var()` 透传** → 但这与 Less 运算硬限制冲突，且要推翻 theme-color-guard 四道门禁

2. **P0 两项要不要现在就修？**（`themeMeta` 未声明是我引入的；`businessConfig` prompt 示例是既有缺陷）
