# 组件生成质量问题根因矩阵（2026-09-09 实测）

> 两任务：
> - `mc-max-1788952386700-23d4e35f`（c-traffic-monitor-xdwoekb3）
> - `mc-max-1788952392653-7fdf8e59`（c-device-monitor-pyb7ue1h）
>
> 审查方式：从快照 revision 终态代码 + Figma 真值 + 资源映射 + 管线源码四层对照，定位每个症状的**首个引入层**，不笼统归因 LLM。
> 结论先行：**这不是单点 bug，而是"设计结构真值未形成不可变中间契约，各层各自重新猜一遍"导致的系统性失真**。

---

## 一、七层根因矩阵

| 层 | 审查对象 | traffic 判定 | device 判定 |
|----|---------|------------|------------|
| L1 视觉/Figma 真值 | figma.json 节点树 | ✅ 基本正确（含 2 张 bar+1 line+数字卡，无环形图） | ⚠️ 真值含左侧竖 tab 头，但后续映射层漏抓 |
| L2 结构规划 | analysis/subComponentPlan | ⚠️ 把 legend/axis/tooltip 当平级 DOM | 🔴 把 @antd/tab 拆成 14 个孤立 cons 组，**丢左侧 tab 头** |
| L3 资源映射 | resource-dom-mapping.json | 🔴 **icon-3561 绑 3 次、bg-3475 绑 2 次**（跨区错绑） | 🔴 **bg-8439 绑 13 次**，无 tab 头/左侧 nav 资源 |
| L4 LLM 代码 | package/*.vue | ⚠️ 臆造 pie 环形图、AI 效果、重复 icon | ⚠️ 结构对但资源 prop 父不传子 |
| L5 确定性后处理 | injectResourceImports/autoMount | 🔴 **写盘仍走全量 effectiveMapping**（注释明说），section 过滤只作用于 prompt | 同左：全量注入，跨区资源全进 import |
| L6 质量门禁 | code-structure-validator / CODE-019 | ⚠️ CODE-003-HIT-RATE 仅警告，放过结构失真 | 🔴 CODE-019 正确拦截父不传子，但重试不收敛 |
| L7 预览运行时 | vite iframe / echarts | 🔴 图表容器 0 高度（见 §3）/ scoped 样式脱节 | ⚠️ 文字背景缺失（bg 路径未命中） |

---

## 二、逐症状根因（file:line 证据）

### A. traffic：icon 错误 / 好几个 icon
- **根因 L3**：`resource-dom-mapping.json` 中 `icon-3561.png` 被分配给 `icon1/icon2/icon3`，分别命中 `slot-当日总流量/sub-header`、`slot-车型分布/sub-header`、`slot-流量预测/sub-header` 三个不同 section 标题。
- LLM 在 prompt 全量资源里选了同名相邻图（L5 注释：`写盘后的 import 注入仍走全量 effectiveMapping` → `prompt-builder.js:1428`）。
- **治本**：L5 写盘注入必须接 `resource-manifest.js` 的 `scopedResourceDomMapping`（已有纯函数，未接线写盘）。

### B. traffic：图背景被引用多次（内部也用）
- `bg-3475.png` 同时绑 `bg3`（车型 Frame 1280/t/bg）+ `bg5`（流量预测 tab active 背景）。
- Figma 真值里 `bg-3475` 仅是 `Frame 1280` 内部 `t` 区块，被错误提升为 legend/tab 背景 → chart header 出现 `min-height:160px` 异常（见 §3）。

### C. traffic：图表不显示
- **根因 L7 + L2**：`TunnelHourlyChart.vue` 的 `.c-traffic-monitor-chart-header` 同时有 `height:21px` **和** `min-height:160px`（`common.less:127-134` 与组件 scoped:264-271 冲突），header 被撑到 160px，挤压 chart-body。
- 更关键：`common.less` 类名命中率仅 ~40%（17/42 选择器与模板脱节），`.c-traffic-monitor-xdwoekb3-c-traffic-monitor-chart-body` 等**关键容器样式在中央 less 缺失** → 容器无确定高度 → echarts `clientHeight=0` → `initChart` 走 ResizeObserver 但若父级塌陷仍 0 → 图表空白。
- 终态 index 有 `.c-traffic-monitor-chart-body`（scoped 定义）但 `common.less` 的 `.c-traffic-monitor-xdwoekb3-c-traffic-monitor-chart-body` 是另一套长类名，**不匹配** → 高度链断裂。

### D. traffic：车型分布样式完全不一样 + 臆造 AI 效果
- **根因 L1/L4**：Figma 真值 `slot-车型分布` 是**两张数字卡（客车/货车文本）+ 单图标**，无环形图。终态 `VehicleDistributionSection.vue` 臆造 `pie` 环形图（radius 55%-75%）+ 双 donut + 标题"车型分布"带科技感 → 与真值完全不符。
- 这是 CODE-003（文本命中率）未严格拦截 + 模型偏好"图表化"的典型幻觉。

### E. device：缺少左侧类型切换（tab 头）
- **根因 L2/L3**：Figma 真值 `@antd/tab` (id 89:37) 内部 **左侧 `tabs` 竖排 tab 头**（监控/照明/通风/消防/交通诱导/供配电）与右侧 `cons` 设备卡同帧。
- 资源映射 `resource-dom-mapping.json` 只抓了 `slot-con/@antd/tab/cons/Group...` 的 **13 组 bg+icon**，**左侧 tab 头无任何资源条目** → subcomponent-planner 把 @antd/tab 当成纯内容组，规划出 `DeviceGrid` 渲染 14 设备卡，**左侧 tab 头在 L2 即被丢弃**。
- 终态 index 只有 HeaderStats/DeviceCards/SwitchControl/DeviceGrid，**整个竖向导航丢失**。

### F. device：header 插槽跑到内容区 + 大 tab 出现两次且样式不同
- **根因 L2**：`inline-header-slot-inferrer.js` 兜底逻辑把 header 统计区（设备类型/总数/完好率）与 `switch` 区块都规划进内容流。
- `SwitchControl.vue` 自渲染"隧道设备/南北接线设备"两个 switch-item（第 1 个大 tab），`DeviceGrid` 又渲染 12 设备卡（第 2 个大 tab 区）——两者视觉角色重叠但样式来源不同（switch 用 bg-8807/bg-8439，grid 全用 bg-8439），导致"大 tab 两次、样式不一"。

### G. device：生成失败 CODE-019
- **根因 L4/L6**：`DeviceCards.vue` 用 `defineProps({bg1,bg2,icon1,icon2})`，但父 `index.vue` 未传这些 prop（父只 `<DeviceCards />`）。
- `code-structure-validator.js:1928` 调 `detectMissingPropsWiring` 正确 BLOCK。重试路径只让 LLM 重生成，但**资源契约未在 L2 固定**，重试仍产出"父不传子" → 耗尽早退失败。
- 真正治本：在 L2/L3 把"子组件资源 prop 契约"写死进 plan，写盘时父组件按契约 `:bg1="bg1"` 注入（而非依赖 LLM 自洽）。

### H. device：文字背景部分未显示
- **根因 L3/L7**：根容器 `bg` 映射 `status:"missing",skip:true`（`cp-设备监测/bg` 无图），`bg1..bg14` 中除 bg1/bg2 外全指向 `bg-8439`（同一张被 13 次复用），且 DeviceCards `bg2` 由父传入但父未传 → `:style="{backgroundImage:url(${bg2})}"` 为 `url(undefined)` → 背景不显。

---

## 三、跨任务共性根因（治本优先级）

### 根因 1：资源归属链未贯通到写盘（最严重，A/B/H 共因）
- 已有 `resource-manifest.js`（`annotateResourceOwnership` / `buildResourceManifest` / `scopedResourceDomMapping`）能在 **prompt 层**按 section 过滤。
- 但 `prompt-builder.js:1428-1429` 注释明示：**写盘 import 注入仍走全量 effectiveMapping** → L5 `injectResourceImports` 不感知 section → 跨区错绑无法在写盘层消除。
- **治本**：把 L5 写盘注入改为接收 `matchedSection`，只注入该 section 归属资源（panel 级资源仍全量）；无 section 时 fail-open 全量。

### 根因 2：结构真值未形成不可变中间契约（E/F/G 共因）
- subcomponent-planner 产出 `effectiveSections`，但 **@antd/tab 的 tab 头被当成非内容丢弃**（E），且**资源 prop 契约未随 plan 固化**（G）。
- **治本**：planner 对 `@antd/tab`/`nav`/`tabs` 类型节点强制保留"标签头+内容面板"二元结构；每个 section 的 `resourceProps` 契约随 plan 下发，写盘父组件按契约注入。

### 根因 3：图表/公共样式作用域脱节（C/D 共因）
- `common.less` 中央样式与组件 scoped 样式**类名体系不一致**（长前缀 vs 短前缀），命中率 ~40%，图表容器高度链断裂。
- **治本**：统一 `common.less` 与组件 scoped 的类名来源（均从 plan 生成）；图表容器强制 `min-height` 注入（治本 T2 已有，需确认生效）。

### 根因 4：质量门禁对结构失真过松（D/G 共因）
- CODE-003 文本命中率仅警告；CODE-019 重试不收敛。
- **治本**：结构类门禁（section 完整性、资源 prop 契约、图表 type 真值对照）升级为 BLOCK + 重试时回灌 plan 契约而非纯文本指导。

---

## 四、修复优先级与回归验收

| 优先级 | 修复项 | 文件 | 验收标准 |
|-------|-------|------|---------|
| P0 | L5 写盘接 section 过滤 | microcode resource-mounter.js / injectResourceImports | resource-dom-mapping 跨区资源不再进非归属组件 import |
| P0 | @antd/tab 头保留 | subcomponent-planner.js | 含 tab 头的组件索引含左侧 nav/tab 结构 |
| P0 | 资源 prop 契约固化+父注入 | planner + microcode-engineer.js | CODE-019 首次生成即通过，不重试 |
| P1 | common.less 类名体系对齐 | common.less 生成器 | 图表容器命中率 100%，echarts 可见 |
| P1 | 图表 type 真值对照 | code-structure-validator | Figma 无图表则禁止生成 pie/line |
| P2 | CODE-003 升 BLOCK | code-structure-validator | 文本/模块缺失即拦截重试 |

> 注：方向 4 文档 `fix-resource-cross-section-misbinding-2026-09-09.md` 的 Phase 2（inject 过滤）与本矩阵根因 1 同一处，落地时合并实施。
