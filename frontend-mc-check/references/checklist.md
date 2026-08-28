# 微码组件检查项清单

> 此清单是 `mc-check.cjs` 所有检查项的完整索引，规范升级时对照此表判断影响范围。
> 同步更新位置：`scripts/mc-check.cjs`、`scripts/mc-check-config.json`、`.claude/skills/frontend-mc-check/SKILL.md`

---

## 必须项（M 系列）— 100% 通过才允许上线

### M1 命名规范

| ID | 检查项 | 说明 |
|----|--------|------|
| M1-1 | componentId 规范 | `c-` 开头、kebab-case（全小写+连字符）、与目录名一致、≤50字符 |
| M1-2 | componentName 长度 | 2-50 字符 |
| M1-3 | version 格式 | `v1.0.0` 格式 |

### M2 必要文件

| ID | 检查项 | 说明 |
|----|--------|------|
| M2-1 | 必要文件存在性 | `package/index.vue`、`declare.json`、`declare.js`、`component.js` |
| M2-2 | mc-preview.png 存在 | `resources/images/mc-preview.png` 必须存在 |
| M2-3 | css-vars.js 存在性 | `resources/config/css-vars.js` 必须存在 |
| M2-4 | themes 目录结构 | `theme-vars.less` + 每个 `themeConfig.list[].key` 对应的 `.less` 文件 |
| M2-5 | layoutConfig 预览图 | `previewName` 对应图片存在于 `resources/images/` |
| M2-6 | index.less 存在 | `resources/styles/index.less` 必须存在 |

### M3 declare.json 字段规范

| ID | 检查项 | 说明 |
|----|--------|------|
| M3-1 | 必填字段 | `componentId`、`componentName`、`version`、`attribute.aspectRatio`、`businessEvents`、`businessStatuses`、`themeConfig`（≥1项） |
| M3-2 | businessEvents 完整性 | `eventId`（kebab-case）、`eventName`、`eventDataSchema` 字段完整；`eventDataSchema` 必须为 object 类型 |
| M3-3 | businessStatuses 完整性 | `statusId`（kebab-case）、`statusName`、`parameters` 字段完整 |
| M3-4 | cssVariableConfig 规范 | `name`、`key`、`type`（枚举值合法） |
| M3-5 | layoutConfig 完整性 | `default`、`list[].name`、`list[].key` |
| M3-6 | themeConfig 完整性 | `default`、`list` 非空、`list[].name`、`list[].key` |
| M3-7 | businessConfig 规范 | `name`、`key`（camelCase）、`type`、`renderType`（枚举值合法） |
| M3-8 | dataSources 规范 | `sourceName` 存在，`columns` 字段必须存在（允许为空数组 `[]`）；一旦配置了 column 项，则该项的 `name`、`type`、`comment` 必填；`columns` 每项仅允许 `name`/`type`/`comment`/`defVal` 字段；`type` 枚举为 `string`/`number`；`defVal` 类型必须是 `string`/`number`/`null`，且类型需与 `type` 字段匹配；不使用系统保留字段 |
| M3-9 | formSources 规范 | `formName` 存在 |

### M4 文件格式规范

| ID | 检查项 | 说明 |
|----|--------|------|
| M4-1 | declare.js 格式 | 使用 `$createMcDeclare` |
| M4-2 | declare.js 传入 cssVars | 必须传入 cssVars 参数 |
| M4-3 | component.js 格式 | 导出 `./package/index.vue` |
| M4-4 | css-vars.js 导出结构 | 导出 `common` + 每个 `themeConfig.list[].key` |
| M4-5 | index.less 引入主题文件 | `@import` 每个 `themeConfig.list[].key` 对应的 `.less` |
| M4-6 | index.less 被引用 | `package/` 下的文件中有 `styles/index` 引用 |

### M5 代码规范

| ID | 检查项 | 说明 |
|----|--------|------|
| M5-1 | `<base-panel>` 包裹 | `package/index.vue` 顶层必须使用 `<base-panel>` |
| M5-2 | `$mcComponentBuilder` 只调用一次 | `package/` 下调用次数 ≤ 1 |
| M5-3 | 禁用 API 检查 | 不使用 `createRequest`、`axios`、`this.$http`、`.fetch()`；忽略 `.esm.js`、`.min.js` |
| M5-4 | publishEvent 与 businessEvents 一致性 | 所有 `publishEvent` 调用的事件名已在 `businessEvents` 中声明 |
| M5-5 | listenEvent 与 businessStatuses 一致性 | 所有 `listenEvent` 调用的事件名已在 `businessStatuses` 中声明 |

---

## 警告项（W 系列）— 不影响上线，建议修复

| ID | 检查项 | 说明 |
|----|--------|------|
| W-CSS-1 | 硬编码颜色值 | 样式中存在 hex/rgb/rgba，建议改用 CSS 变量 |
| W-CSS-2 | 硬编码字体大小 | `font-size` 使用 >5px 的固定值，建议改用 em/rem |
| W-DEP | 废弃字段 | `versionCode` 等已废弃字段 |
| W-DS-1 | dataSources columns 完整性 | `columns` 至少有一个字段，且每个字段包含必填字段 `name`、`type`、`comment` |
