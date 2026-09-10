# 微码组件检查项清单

> 此清单是 `mc-check.cjs` 所有检查项的完整索引，规范升级时对照此表判断影响范围。
> 同步更新位置：`scripts/mc-check.cjs`、`scripts/mc-check-config.json`、`SKILL.md`

---

## 分类说明

**检查项按「被检查对象」划分五大系列**，不再按结果级别（严重/警告）或场景（一体化适配）分类。

| 系列 | 检查对象 | 说明 |
| ---- | -------- | ---- |
| M1   | 命名规范 | componentId、componentName、version |
| M2   | 必要文件 | 组件结构与资源文件 |
| M3   | declare.json 配置 | 各配置字段的完整性、规范性、废弃字段 |
| M4   | 文件格式与构建脚本 | declare.js、component.js、css-vars.js、index.less |
| M5   | 代码实现 | 模板结构、禁用 API、样式规范 |

**每个检查项统一由四个要素定义**：

| 要素 | 取值 | 说明 |
| ---- | ---- | ---- |
| 规则内容 | 文字 | 该检查点具体要求（即判定标准） |
| 适用范围 | `all` / `business` | `business` 项仅业务组件执行；服务组件自动不触发 |
| 触发条件 | `required` 或具体条件 | `required` = 无条件执行；否则仅在满足条件时执行（即可选项） |
| 结果 | `pass` / `error` / `warning` | 检查项执行后的结论；`error`/`warning` 为「不通过」的两种级别 |

**检查结果（每个检查项执行后的「结果」）**：

| 结果 | 含义 | 对上线的影响 |
| ---- | ---- | ------------ |
| `pass` | 满足规则，无问题 | 无影响 |
| `error` | 违反规则，检查不通过 | **阻断上线**，必须修复 |
| `warning` | 存在隐患/废弃用法，检查不通过 | 提醒，不阻断上线 |

**结果与级别解耦**：级别（error/warning）是「不通过」结果的属性，而非检查项的分类依据。组件「pass」= 不产生任何 `error` 级结果（即所有检查项均为 `pass` 或 `warning`）。

---

## M1 命名规范（3 项）

| 编号 | 检查项 | 规则内容 | 适用范围 | 触发条件 | 结果 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| M1-1 | componentId 规范 | `c-` 开头、kebab-case（全小写+连字符）、与目录名一致、≤50 字符 | all | required | error |
| M1-2 | componentName 长度 | 2-50 字符 | all | required | error |
| M1-3 | version 格式 | `v1.0.0` 语义化版本格式 | all | required | error |

---

## M2 必要文件（7 项）

| 编号 | 检查项 | 规则内容 | 适用范围 | 触发条件 | 结果 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| M2-1 | 必要文件存在性 | `package/index.vue`、`declare.json`、`declare.js`、`component.js` 必须存在 | all | required | error |
| M2-2 | mc-preview.png 存在 | `resources/images/mc-preview.png` 必须存在 | all | required | error |
| M2-3 | css-vars.js 存在性 | `resources/config/css-vars.js` 必须存在 | all | required | error |
| M2-4 | themes 目录结构 | `theme-vars.less` + 每个 `themeConfig.list[].key` 对应的 `.less` 文件 | all | required | error |
| M2-5 | index.less 存在 | `resources/styles/index.less` 必须存在 | all | required | error |
| M2-6 | layoutConfig 预览图 | `previewName` 必须存在、以 `mc-preview` 开头、对应图片存在于 `resources/images/` | all | 配置了 `layoutConfig` | error |
| M2-7 | layoutConfig 预览图唯一性 | `previewName` 不得重复 | all | 配置了 `layoutConfig` | error |

---

## M3 declare.json 配置（14 项）

| 编号 | 检查项 | 规则内容 | 适用范围 | 触发条件 | 结果 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| M3-1 | 必填字段 | `componentId`、`componentName`、`version`、`attribute.aspectRatio`、`businessEvents`、`businessStatuses`、`themeConfig`（≥1 项） | all | required | error |
| M3-2 | themeConfig 完整性 | `default`、`list` 非空、`list[].name`、`list[].key` | all | required | error |
| M3-3 | businessEvents 完整性 | `eventId`（kebab-case）、`eventName`、`eventDataSchema`（必须为 object 类型）字段完整 | all | `businessEvents` 非空 | error |
| M3-4 | businessStatuses 完整性 | `statusId`（kebab-case）、`statusName`、`parameters` 字段完整 | all | `businessStatuses` 非空 | error |
| M3-5 | layoutConfig 完整性 | `default`、`list[].name`、`list[].key` | all | 配置了 `layoutConfig` | error |
| M3-6 | cssVariableConfig 规范 | `name`、`key`、`type`（枚举值合法） | all | 配置了 `cssVariableConfig` | error |
| M3-7 | cssVariableConfig 与 css-vars.js 一致性 | `cssVariableConfig` 定义的变量必须在 `css-vars.js` 中存在 | all | 配置了 `cssVariableConfig` | error |
| M3-8 | css-vars.js 自定义变量声明 | `css-vars.js` 自定义变量必须在 `cssVariableConfig` 中声明 | all | `css-vars.js` 有自定义变量 | error |
| M3-9 | businessConfig 规范 | `name`、`key`（camelCase）、`type`（枚举值合法，不区分大小写） | all | `businessConfig` 非空 | error |
| M3-10 | dataSources 规范 | `sourceName` 存在；`columns` 字段存在；column 项 `name`/`type`/`comment` 必填、`type` 为 `string`/`number`、`defVal` 类型与 `type` 匹配、不使用系统保留字段 | all | `dataSources` 非空 | error |
| M3-11 | formSources 规范 | `formName` 字段完整 | all | `formSources` 非空 | error |
| M3-12 | 内容布局存在性 | `layoutConfig.list.length >= 1` | business | required | error |
| M3-13 | dark 主题配置 | `themeConfig.list` 中必须包含 `key='dark'` | business | required | error |
| M3-14 | 废弃字段 | `versionCode` 等已废弃字段不应存在 | all | required | warning |

---

## M4 文件格式与构建脚本（11 项）

| 编号 | 检查项 | 规则内容 | 适用范围 | 触发条件 | 结果 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| M4-1 | declare.js 格式 | declare.js 有效，使用 `$createMcDeclare` | all | required | error |
| M4-2 | declare.js 传入 cssVars | 必须传入 `cssVars` 参数 | all | required | error |
| M4-3 | component.js 格式 | component.js 有效，导出 `./package/index.vue` | all | required | error |
| M4-4 | css-vars.js 导出结构 | 导出 `common` + 每个 `themeConfig.list[].key` | all | required | error |
| M4-5 | index.less 引入主题文件 | `@import` 每个 `themeConfig.list[].key` 对应的 `.less` | all | required | error |
| M4-6 | index.less 被引用 | `package/` 下的文件中有 `styles/index` 引用 | all | required | error |
| M4-7 | css-vars.js 字体变量格式 | 字体大小变量必须使用 `$mcCssBuilder.getCssSize()` 或 `$mcCssBuilder.getCssSize(数字)` | all | `css-vars.js` 有字体变量 | error |
| M4-8 | css-vars.js 导出 dark | `resources/config/css-vars.js` 必须导出 `dark` 对象 | business | 存在 dark 主题（M3-13） | error |
| M4-9 | dark 核心变量完整性 | 必须包含 `colorTextBase`、`colorPrimary`、`colorPrimaryBg` | business | 已导出 dark（M4-8） | error |
| M4-10 | dark 核心变量色值枚举 | 3 个核心变量（`colorTextBase`/`colorPrimary`/`colorPrimaryBg`）的值必须在允许枚举内（不区分大小写） | business | 已导出 dark 且核心变量完整（M4-9） | error |
| M4-11 | dark 可选变量色值 | 如配置 `scrollbarTrackBg`/`scrollbarThumbBg`，值须为固定值 `#424242`/`#646464` | business | dark 对象配置了滚动条变量 | error |

---

## M5 代码实现（10 项）

| 编号 | 检查项 | 规则内容 | 适用范围 | 触发条件 | 结果 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| M5-1 | `<base-panel>` 包裹 | `package/index.vue` 顶层必须使用 `<base-panel>` | all | required | error |
| M5-2 | `$mcComponentBuilder` 单次调用 | `package/` 下调用次数 ≤ 1 | all | required | error |
| M5-3 | 禁用 API 检查 | 不使用 `createRequest`、`axios`、`this.$http`、`.fetch()`（忽略 `.esm.js`/`.min.js`） | all | required | error |
| M5-4 | publishEvent 与 businessEvents 一致性 | `publishEvent` 调用的事件名已在 `businessEvents` 中声明 | all | 代码中有 `publishEvent` 调用 | error |
| M5-5 | listenEvent 与 businessStatuses 一致性 | `listenEvent` 调用的事件名已在 `businessStatuses` 中声明 | all | 代码中有 `listenEvent` 调用 | error |
| M5-6 | @fontSize 变量声明与使用 | `css-vars.js` 定义了 `fontSize` 时：`theme-vars.less` 中必须有 `@fontSize: var(--fontSize)` 映射声明，且业务样式中实际使用 `@fontSize` | all | `css-vars.js` 中定义了 `fontSize` | error |
| M5-7 | 禁止硬编码字体大小 | 不得使用 >5px 的固定 `font-size` | all | 样式中有 px 固定值的 `font-size` 声明 | error |
| M5-8 | base-panel 背景色限制 | `<base-panel>` 不得设置内联背景色 | business | required | error |
| M5-9 | 第一子元素背景色限制 | `<base-panel>` 第一个子元素不得设置内联背景色 | business | required | error |
| M5-10 | 硬编码颜色 | 样式中存在 hex/rgb/rgba，建议改用 CSS 变量 | all | required | warning |

---

## 必查项清单（按组件类型二分）

### 服务组件必查（21 项）

服务组件执行 M1~M5 中 `适用范围=all` 且 `触发条件=required` 的检查项，不执行 `business` 项。

| 系列 | 必查项 |
| ---- | ------ |
| M1   | M1-1、M1-2、M1-3 |
| M2   | M2-1、M2-2、M2-3、M2-4、M2-5 |
| M3   | M3-1、M3-2、M3-14（warning） |
| M4   | M4-1、M4-2、M4-3、M4-4、M4-5、M4-6 |
| M5   | M5-1、M5-2、M5-3、M5-10（warning） |

### 业务组件必查（25 项）

业务组件 = 服务组件 21 项 + 以下 4 项 `business` 必查项：

| 编号 | 检查项 |
| ---- | ------ |
| M3-12 | 内容布局存在性 |
| M3-13 | dark 主题配置 |
| M5-8 | base-panel 背景色限制 |
| M5-9 | 第一子元素背景色限制 |

---

## 检查项统计汇总

- **总检查项**：45 项（M1~M5 全系列）
  - M1：3 项；M2：7 项；M3：14 项；M4：11 项；M5：10 项
- **必查项**：服务组件 21 项；业务组件 25 项
- **可选项**：20 项（条件触发）
- **warning 级**：2 项（M3-14 废弃字段、M5-10 硬编码颜色）

---

## 组件类型（componentCategory）

在 `declare.json` 中可选配置 `componentCategory` 字段：

```json
{
  "componentCategory": "business" // 或 "service"
}
```

| 类型       | 说明             | `business` 项 | 示例                    |
| ---------- | ---------------- | ------------- | ----------------------- |
| `business` | 业务组件（默认） | ✅ 执行        | 一体化展示组件          |
| `service`  | 服务组件         | ❌ 豁免        | 纯逻辑服务、后台任务    |

**白名单豁免**（无需配置 `componentCategory`）：

- `c-mc-micro-*` 模式

**注**：豁免仅作用于 `适用范围=business` 的检查项，不影响 `all` 项（如 M5-1 `<base-panel>` 包裹仍对所有组件必查）。
