# 上游根因系统审计（2026-09-09 21:18 起）

> 背景：此前多轮修复（fileSectionMap 作用域、autoWire 补线、④ class 对齐、FLEX-005 量纲）均落在**管线末端的确定性补丁**上，用户反馈"继续打补丁没意义，要从上游查真相"。本轮对 `env-monitor(d2311f17)`、`device(9b66f2fe)`、`traffic(ff99b1ac)` 三组件做**四层取证**（vision-cache / checkpoint.figma.json / resource-dom-mapping / package 源码），定位到真正的上游缺陷。

---

## 一、取证方法

| 层 | 数据源 | 看什么 |
|----|--------|--------|
| 视觉层 | `.mc-gen/cache/vision-cache/*.json` | OCR 文本、bg/icon 识别、布局结构 |
| 真值层 | `.checkpoint/figma.json` | figma 节点的真实 type/fills/children/imageRef |
| 映射层 | `.mc-gen/resource-dom-mapping.json` | assignedVarName / deduplicatedFrom / downloadStatus |
| 产物层 | `package/**/*.vue` + `resources/styles/*` | LLM 实际怎么用资源、class 形态 |

---

## 二、四个上游根因（均实锤）

### 节点 A/B — 资源映射无"具名语义"，矢量图标被当位图提取
**实证（device 的 figma.json）：**
- 全部 14 个 icon 节点（`2:8798/8817/8444/...`）在 figma 树里 **0 个 IMAGE fill**，全是 `GROUP + VECTOR/RECTANGLE/ELLIPSE 组合`（渐变+纯色绘制）→ **矢量绘制图标，非位图**。
- 资源提取把每个 `name=icon` 的 GROUP 整体导出成 `icon-N.png`（Figma 渲染 API 能渲，downloadStatus=success 已证实可行）。
- 但 mapping 里 14 个 icon **全叫 "icon" 无具名语义**；DOM 写 `alt="摄像机" / alt="风速风向仪"` 等 13 种设备名 → LLM 凭视觉记忆生成，mapping 无对应资源 → `T08 stripUndefinedResourceRefs` 把无 src 的 `<img>` 删成空壳 → **"很多元素没展示"**。
- 仅 `icon13` 被 `autoMountUnusedIcons` 随机挂到 main-content（位置错）。

**根因：** 资源提取层只按节点 name 正则识别，不区分"矢量图标组合"与"位图 icon"，且**不携带"icon 对应哪个设备卡"的具名语义**。LLM 拿到 14 张无名的 `icon-N.png` 无法对应到 13 种设备。这是 **vision/资源层的结构性缺陷**，末端补丁无法解。

---

### 节点 D — 资源变量归属契约未在规划层固化（CODE-019 不收敛的根）
**实证（env-monitor d2311f17）：**
- `HeaderIcons.vue`：`import icon1 from '../../resources/images/icon-7941.png'` + `import icon2 ...` + `defineProps({ icon1:{required:true}, icon2:{required:true} })`。
- 父 `index.vue`：`<HeaderIcons />` **完全没传 props**，script **零 import / 零声明** icon1/icon2。
- `autoWireSubComponentProps`（props-wiring-guard.js:524）只在 `resolveWirableNames(script)` 包含同名变量时才补 `:prop="prop"`（L510-514）。父 script 空集 → **autoWire 永不连线** → CODE-019 3×BLOCK 不收敛。

**根因：** "资源变量到底归父组件 import 还是子组件 import、props 契约从哪来"**从未在子组件规划（L2/plan）阶段固化**。写盘自愈各凭 LLM 遵守 prompt——LLM 把资源 import 写进子组件，autoWire 的"父已声明才连线"前提就永远不成立。

---

### 节点 C — 去重按相对坐标签名，把"设计稿合法复制的背景"并成 1 份
**实证（device 的 figma.json）：**
- `2:8439`(y=549.99) 与 `2:8468`(y=626.99) 是**逐位一致**的渐变背景 GROUP（同名 bg、2 个 VECTOR、色值逐位相等、仅 y 差 77px）。
- `asset-signature.js` `nodeKey`（L78-80）用**相对容器原点 + `Math.round` 取整** → y 偏移被归一化 → 签名相同 → 判"同一资源"去重。
- 结果：13 个 bg 节点全 `deduplicatedFrom: 2:8439`，共用 `bg-8439.png` 一张图。

**判定：** 视觉上这**确实是设计稿有意在同一背景复制多份**（合法），去重本身正确。真正问题在**下游 LLM 只把该背景贴到部分容器** → 部分卡片背景缺失。属"去重正确但下游漏用"，不是去重误判。

---

### 节点 4 — theme-vars.less 变量写在 mixin 内，子组件 scoped 拿不到（每次预览必现告警）
**实证（三组件 theme-vars.less）：**
- 全部色量（`@colorTextBase`/`@color-bg-page`/...）写在 `.common()` `.theme-dark()` `.theme-light()` mixin 块**内**，不在顶层。
- 子组件 scoped `<style>` 通过 `@import '../resources/styles/index.less'` 引变量，但 index.less 只 `@import theme-vars.less` + 顶层调 `.common(); .theme-dark();` —— mixin 内的变量**不会进入子组件 scoped 作用域**（LESS 语义）。
- 子组件直接 `color: @colorTextBase` → **`@colorTextBase is undefined` 必现**（每代每次预览先报一次）。

**根因：** 变量体系设计问题——mixin 闭包内的变量不对外可见。此前只在 device 的 common.less 自愈暴露了顶层变量，子组件 scoped 未覆盖。

---

## 三、关键认知：此前修复都是下游补丁

| 修复 | 落点 | 实质 |
|------|------|------|
| fileSectionMap 提升作用域 | microcode-engineer.js:1351 | 修"主干读闭包内变量"的报错，但变量**该写什么值**没治 |
| autoWire 补线 | props-wiring-guard.js:524 | 依赖"父已声明"前提，前提不成立就失效（节点 D） |
| ④ class 对齐 | style-class-consolidator.js | 修 class 名形态，但资源没进来、样式没内容（节点 A/B） |
| FLEX-005 量纲 | figma-section-heights.js | 修 flex 写法，但背景没挂对、图标没进来（节点 A/C） |

**结论：** 末端补丁无法让"资源正确进入产物"——因为资源提取层（A/B）和规划层（D）本身没给 LLM 正确的事实源。

---

## 四、治本优先级建议

| 优先级 | 节点 | 治本方向 | 价值 |
|--------|------|---------|------|
| **P0** | **D 资源归属契约** | L2 子组件规划阶段固化：资源归父还是归子 + props 契约（父 import + 子 defineProps 同源）；写盘按契约注入，autoWire 改为"按契约强制连线" | 同时解 CODE-019 不收敛 + 为 A/B 对齐提供事实源 |
| P1 | A/B 映射具名语义 | 资源提取给每个 icon 携带"对应设备/区块"语义（从兄弟 TEXT 反推 name）；矢量图标与位图图标分流处理 | 解"很多元素没展示" |
| P2 | C 去重下游挂载 | 资源挂载按 figma 节点归属（谁该用这张图）而非按去重组，避免"一份图只贴部分位置" | 解"背景重复/部分缺失" |
| P3 | 4 theme 变量暴露 | theme-vars.less 将色量提升到顶层（mixin 外），或子组件 scoped 自愈补本地 fallback | 解每次预览 `@colorTextBase is undefined` |

**建议从 P0（节点 D）开始**：它是 CODE-019 与 A/B 对齐的共同前提，治好后 CODE-019 重试不收敛消失、资源契约清晰，下游挂载才有确定事实源。

---

## 五、当前状态
- 审计完成，**未改动任何 src**（用户要求先查真相）。
- 进程 85020 仍在跑旧 dist，`:13030` 健康。
- 待用户决策：从哪个节点开始治本（推荐 P0/D）。
