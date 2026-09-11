# 0001-资源归属与 import 白名单

- **状态**：Accepted
- **日期**：2026-09-11

## 决策

微码/vue3 组件产物的**静态资源归属**遵循「白名单注入 + 确定性落点」：
仅**禁资源图片**（background/icon 等）由系统 `injectResourceImports` 按 Figma 资源映射确定性注入；
**vue / echarts / 子组件**三类 import 必须由 LLM 手写，系统不代写。

## 背景 / 动机

- 资源变量名是 LLM 的臆造重灾区（`bg-_m-34` / `icon-3561` 等），臆造名 → 运行时资源 404 / 语义门禁报「模板引用未声明变量」（mvgo-resource-var-ghost-triage 两类根因：A 臆造名、B 双名丢失）。
- 若系统代写 vue/echarts/子组件 import，会与 LLM 输出冲突、破坏 SFC 语义门禁的「标签↔import↔文件」三向对齐，反而制造悬空/死 import（CODE-021 / CODE-022）。

## 方案与理由

- **注入白名单**：只有 `resources/images` 下的图片资源走系统注入，其它一律手写。理由：图片名与 Figma 静态资源节点有一一映射（resourceDomMapping），可确定性解析；vue/echarts/子组件无此确定性来源。
- **样式 @import**：less 的 `@import` 由生成期确定性处理，不允许 LLM 臆造路径。
- **否决替代**：曾考虑「全量手写」→ 臆造名失控；曾考虑「系统代写全部 import」→ 与 LLM 输出打架、破坏三向对齐。二者均被实锤否定。

## 影响面（当前）

- `resource-import-guard.js#injectResourceImports` / `resolveResourceDomMapping`
- `resource-mounter.js` 资源挂载相关规则
- `artifact-invariants.js` I6（资源挂载对齐，CODE-022 口径）

## 后果

- 正面：资源名可确定性还原，杜绝臆造名 404。
- 负面：LLM 手写 import 仍需语义门禁兜底（不能省）。
- 债务：若未来新增「确定性可注入」的资源类型，需回本 ADR 扩展白名单口径。
