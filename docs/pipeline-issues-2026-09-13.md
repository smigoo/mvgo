# 今日生成组件管线问题（2026-09-13）

> **状态：`closed`（代码落地已收口；重生成验收仍待）。**  
> 权威执行顺序仍以 `docs/pipeline-governance-v2-2026-09-10.md` 为准；复发治愈口径对照 `docs/0911-管线复发问题根治方案.md`。  
> **原则：扩展既有函数/门禁覆盖面，禁止平行新 CODE、禁止产物打补丁当完成。**  
> 原诊断正文保留作取证；§4 为落地对照。workspace 产物（vehicle/traffic/device）一律不就地改。

---

## 0. 今日组件清单

workspace 当日样本（backend + frontend 各一份副本）：

| # | 任务 | 组件目录 | 现象摘要 |
|---|------|----------|----------|
| A | `mc-max-1789270078772-3eef1eb3` | `c-vehicle-monitor-ahscsupc-3eef1eb3` | ① tabs 在 `#header-right` 又在内容区 ② 三卡左右对调 ③ 中卡无背景 |
| B | `mc-max-1789269700673-3df87ac9` | `c-traffic-monitor-yb6mcxbx-3df87ac9` | ① 内容空白 ② 过拆（planner 8 叶 / 18 个 `.vue` / chunk 双写） |
| C | `mc-max-1789278525957-bfb14cea` | `c-device-monitor-6rjyo1md-bfb14cea` | 设备网格几乎全空（12 卡无图标）。`codeVersion.distBuildAt=2026-09-13T04:56:50.363Z`，生成于本轮 6 刀 **未进运行进程** 的旧 dist（PID 10391） |

产物路径（以 backend 为准，frontend 镜像同构）：

- `backend-node/workspace/custom-components/c-vehicle-monitor-ahscsupc-3eef1eb3/`
- `backend-node/workspace/custom-components/c-traffic-monitor-yb6mcxbx-3df87ac9/`

对照稿（用户）：车辆监测左危化 51 / 中重型 2 / 右超高 19。流量监测 UI 为「标题栏 + 当日总流量 + 车型分布 + 两张小时柱状图 + 流量预测」，不是 18 个独立子组件。

---

## 1. 车辆监测 `3eef1eb3`

### 1.1 插槽一份、内容区又一份 tabs

**表象**

`package/index.vue`：

```
<template #header-right>
  <HeaderSection />          <!-- 插槽里的 tabs -->
</template>
<div class="…-slot-con">
  <TabsSection />            <!-- 内容区再一份 tabs -->
  <ContentSection />
  <StatsSection />
</div>
```

`HeaderSection2` 静态 import 未用。checkpoint 已预警：`tabs/小标题/sub-header` 与 `section-cards` 双轨；`headerSlots` 同时有 tab + statistic 两个 header-right。

**effectiveSections（planner 出口）**

| id | title | type | 装配去向 |
|----|-------|------|----------|
| `2:7954` | tabs | `tabs` | body → `TabsSection` |
| `2:7959` | 小标题 | `header` | `#header-right` → `HeaderSection` |
| `136:122` | sub-header | `header` | `#header-right`（第二份 header 叶） |
| `2:8023` | Group | （未标 header） | body → `ContentSection` |
| `section-cards` | 统计卡片区 | `stats` | body → `StatsSection` |

**原因（管线，不是这一份组件写错）**

1. **`deriveSectionType` 关键词过宽**（`subcomponent-planner.js` `TYPE_KEYWORDS`）：`header` 命中 `header/title/顶部/标题/头部`。Figma 名叫「小标题 / sub-header / tabs」都会被打成 `type: header` 或与 header 槽抢同一视觉行。
2. **确定性模板按 type 二分**（`code-generator.js` `buildDeterministicIndexTemplate`）：
   - `headerLeaves = leaves.filter(s => s.type === 'header')` → 全部进 `#header-right`
   - `bodyLeaves = leaves.filter(s => s.type !== 'header')` → **tabs 不是 header，整叶进 slot-con**
   - 同一视觉「标题行 tabs」因此双落：一份被当 header 叶，一份因 `type=tabs` 进 body。
3. **`dedupeDuplicateSections` 覆盖不足**（`section-tree.js:52-117`）：
   - ① `sourceNodeIds` 交集去重（只在 **sections 数组内部**）
   - ② 仅 `type===tabs` 才走措辞兜底
   - **不处理 headerSlots ↔ body 双通道**
   - **不处理 `type=header` 过拆**（两个 header 叶、tabs 与 header 描述同一行）
4. 这与 v2 已点名的 **D3 / C6「headerSlots 双通道」**、0911 **R1-1「同一 Figma 子树单一归属」** 是同一病。今日不是新病，是 R1-1 只收了「两个 tabs 叶子」那一刀，没收到「header 叶 + tabs 叶」和「slots vs body」。

**根治（扩展既有，不新开规则）**

| 落点 | 改什么 | 不要做什么 |
|------|--------|------------|
| `dedupeDuplicateSections` | 增加跨通道：headerSlots / `type=header` 叶 与 body 叶若 `sourceNodeIds` 相交，只留一处。tabs 在面板标题行 → 只进 `#header-right`，body 删对应叶 | 不要新 CODE；不要对这一份 index.vue 手工删 `TabsSection` 当完成 |
| `deriveSectionType` | `type=header` 仅给「真正进 base-panel 标题栏」的节点（panel chrome / 业务 tab·stat 已在 headerSlots 契约里的）。内容区小标题、sub-header 行保持 content/stats | 不要把所有含「标题」的 section 都塞进 header-right |
| `buildDeterministicIndexTemplate` | header-right 只渲染 **headerSlots 契约** 指定的叶；body 不得再挂同一 `figmaNodeId` | 不要再按 `s.type === 'header'` 词二分当唯一事实 |

对照 v2 硬规则 7：「同一 `figmaNodeId` 只落 slots 或 content 一次」。今日缺的是把这条接到 `dedupe` + 确定性模板，而不是再写一份去重器。

---

### 1.2 三卡顺序反了

**表象**

对照稿 L→R：危化 51 / 重型 2 / 超高 19。  
产物 `StatsSection.vue` DOM L→R：超高 19 / 重型 2 / 危化 51。

**原因**

`figma-connector.js` 固化 `assignedVarName` 时按 **mapping 遍历序** `roleIndex[role]++`，注释写明「全量 success 资源稳定遍历顺序」，**没有按视觉 x 排序**。

本组件三张卡背景 bbox.x：

| 视觉位置 | Figma path 末段 | node | x | 文件 | assignedVarName |
|----------|-----------------|------|---|------|-----------------|
| 左 危化 | `…/1/bg` | `136:125` | 37 | `bg-125.png` | **bg3** |
| 中 重型 | `…/2/bg` | `136:124` | 166 | `bg-124.png` | **bg2** |
| 右 超高 | `…/3/bg` | `136:126` | 274 | `bg-126.png` | **bg1** |

文档树顺序是 3→2→1（右→左），编号 1 落在最右卡。LLM 按「bg1 第一张卡、从左往右写」装配，DOM 就变成右→左。

`StatsSection.vue` 注释还与真实 import 矛盾（注释写 `bg1→bg-125`，实际 `import bg1 from …/bg-126.png`），说明 prompt 侧语义说明和固化编号已经对不上，模型在猜。

**根治**

- **扩展既有 `assignedVarName` 固化点**：同 role、同父行的资源在编号前按 `figmaBox.x`（行内）/`y`（行间）排序，使 bg1 = 视觉最左。  
- 这不推翻「单一事实源、下游只读 assignedVarName」——只改编号键从「文档序」改为「视觉序」。  
- 不要在 StatsSection 里手工换三张卡当完成。

---

### 1.3 中间卡没有背景

**表象**

```vue
<!-- 左超高：挂了 bg1 -->
:style="{ backgroundImage: `url(${bg1})`, … }"
<!-- 中重型：只有 class，无 backgroundImage；script 仍 import 了 bg2 -->
<div class="c-vehicle-monitor-stat-card">
<!-- 右危化：挂了 bg3 -->
:style="{ backgroundImage: `url(${bg3})`, … }"
import bg2 from '../../resources/images/bg-124.png'  <!-- 未引用 -->
```

**原因（两段）**

1. **产生层**：LLM 漏写中卡 `:style`。heal / `injectResourceImports` 会补 **import**，**不会补挂载表达式**（0911 R3-2 已承认「CODE-022 只检测无修复」）。
2. **门禁盲区**：`CODE-022` 的 `findUnmountedResourceVars` 实现正确（去注释后数引用），但 **validate 只扫 `package/index.vue`**（`code-structure-validator.js` CODE-022 段）。中卡 bg 在 `StatsSection.vue`，index 零资源 import → **漏报**。

**根治**

- 扩 `CODE-022` 扫描集：所有 `package/components/*.vue` + index，同一 `findUnmountedResourceVars`。  
- 若走 R3-2 修复器 `pruneUnmountedResourceImports`：删未引用 import **不能**当「背景已挂上」；真正缺的是对照 mapping 的确定性 mount（已有 resource-mounter 职责）。中卡应在 mount 阶段按 `assignedVarName=bg2` 写入对应卡 `:style`。  
- **禁止新增 RESOURCE-xxx / CODE-024。** v2 D5：「不要用新 CODE 掩盖装配没写对」。

---

## 2. 流量监测 `3df87ac9`

### 2.1 内容一片空白

**表象**

`package/index.vue` 模板：

```
#header-right → <HeaderSection />
slot-con → <ContentSection /><ContentSection2 /><ChartSection /><ChartSection2 /><ContentSection3 />
```

script（`defineAsyncComponent`）声明的是另一套名字：

`HeaderSection, SubHeaderSection, TotalFlowSection, VehicleTypeSection, ForecastHeaderSection, TunnelHourlyChart, BridgeHourlyChart, TrafficForecast`

模板里的 `ContentSection*` / `ChartSection*` **script 无绑定**；script 里真正的业务组件 **模板 0 引用**。Vue 对未声明 PascalCase 自定义标签渲染为空 → 内容空白。

**不是**「`<script setup>` 缺 `export default`」。那是错误归因。

**原因**

1. **两套命名两波 chunk 抢同一 index**：`chunk-meta.json` `total: 6`，但 `completed` 远多于 6，且同路径双索引，例如：
   - `ContentSection.vue`：index 15 与 index 8
   - `HeaderSection2.vue`：index 13 与 index 6
   - 语义名一波（TotalFlowSection / TunnelHourlyChart…）+ 通用名一波（ContentSection / ChartSection…）
2. **确定性模板**按 `assignSectionComponentNames` 给 header→`HeaderSection`、其余→`ContentSection`/`ChartSection` 递增；**script 段 LLM** 按 section 注释写了语义组件名。模板确定性、脚本非确定性，拼装后双轨。
3. **`ensureSubComponentImport` 仍用 lazy 模板正则**（`resource-mounter.js:2582`）：
   ```js
   const tplMatch = content.match(/<template>([\s\S]*?)<\/template>/i);
   ```
   具名 `#header-right` 的 `</template>` 提前截断 → 只看见 `HeaderSection`，slot-con 里五个标签对 ensure **不可见**，不会补 import。  
   对称函数 `pruneDeadSubComponentImports` **已经**改 `extractSfcTemplate`（0ca84358）。ensure 未跟 → 声明「单一事实源」落地半截。
4. **`pruneDead` 只删静态 `import X from './components/…'`，不删 `defineAsyncComponent`**，所以语义名绑定会作为死代码留在 script。
5. **CODE-023 按规则应当 BLOCK**（见下节冲突表）。产物仍发出 = **门禁未接到终版写盘/发布**，不是规则没写。

**根治**

| 落点 | 改法 |
|------|------|
| `ensureSubComponentImport` | 改用 `extractSfcTemplate`，与 prune / CODE-023 同源。补绑定时优先静态 import，已有 `defineAsyncComponent` 视为已声明 |
| `assembleIndexVue` | script 绑定名必须 = 确定性模板 `sectionRoots[].component`（单一事实源已在 R1-2）。LLM script 段禁止另起组件名 |
| chunk 写盘 | 同相对路径后写覆盖前写必须记冲突；`chunk-meta.total` 必须等于实际 completed 去重后的文件数 |
| CODE-023 闭环 | 终版 `files` map（拼装后的 index + 最终 components 清单）再跑一次；BLOCK 则禁止 publish-to-workspace / 禁止标 completed |

---

### 2.2 拆分过多

**表象**

- planner `effectiveSections` **8 个叶子**：`2:3550` header、`88:32` header（sub-header）、`2:3660` Group、`2:3438` 车型、`2:3565` header（又一个 sub-header）、tunnel chart、bridge chart、traffic-forecast。其中三个 `type=header`，两张图 `sourceNodeIds: []`。
- 磁盘 **18 个** `package/components/*.vue`：`HeaderSection{,2,3}`、`ContentSection{,2,3}`、`ChartSection{,2}`、`SubHeader`/`SubHeaderSection`、`ForecastHeader`/`ForecastHeaderSection`、`TotalFlowStats`/`TotalFlowSection`、`TunnelHourlyChart`、`BridgeHourlyChart`、`TrafficForecast`、`VehicleTypeSection`。
- analysis.review 已报：两个 section 都叫 `sub-header`（`88:32` vs `2:3565`）。

**原因**

1. 与 1.1 同源：`deriveSectionType` 把内容区「标题行」打成 `header` → 确定性模板每个 header 叶一个 HeaderSection，再叠加 LLM 语义名 = 双倍文件。
2. `dedupe` 对非 tabs、无 `sourceNodeIds` 交集的叶无作为；图表叶 id 是臆造字符串（`tunnel-hourly-chart`）且 `sourceNodeIds: []` → R1-1 归属图根本套不上。
3. chunk 并发/重试对同一 `package/components/X.vue` 用不同 index 各写一次，磁盘留下两套命名。

**根治**

- header type 收窄（同 1.1）。内容区小标题并入下一个业务叶，不单独成 `.vue`。
- 图表叶必须带真实 Figma node id 进 `sourceNodeIds`，禁止空数组臆造 id 逃出去重。
- `assignSectionComponentNames` 一次命名，后续 chunk **禁止**再按 ContentSection 序号另生成文件。
- 过拆验收：同一 Figma 面板重生成后叶子数应接近视觉模块数（本 UI ≈ 标题栏控件 + 总流量 + 车型 + 隧道图 + 大桥图 + 预测 ≈ 6），而不是 18。

---

## 3. 与既有声明 / 实施的冲突·重复检查

不做「再发明一套」。每条今日问题对到已有承诺，只标 **缺口类型**。

| 今日问题 | 已有声明 | 代码事实 | 冲突/重复判定 | 正确动作 |
|----------|----------|----------|----------------|----------|
| tabs 双轨（插槽+内容） | v2 硬规则 7：同一 node 只落 slots 或 content；D3/C6 headerSlots 双通道；0911 R1-1 `dedupeDuplicateSections` | dedupe 只做 sections 内 sourceNodeIds + **仅 tabs** 措辞；模板按 `type===header` 二分，tabs 进 body | **不是新病**。R1-1 落地半截（只挡住「两个 tabs 叶」） | **扩展** `dedupeDuplicateSections` + 模板消费 headerSlots 契约；不要第二套去重器 |
| header 过拆 | planner `TYPE_KEYWORDS` 注释已警告 `header-stats` 会误伤 header（2026-09-04）；v2 chrome 业务 controls 不应误剥 | `标题/header/title` 仍把「小标题/sub-header」打成 header | **声明与实施不一致**（关键词表过宽） | 收窄 `deriveSectionType`，不是新增 type |
| 三卡顺序反 | `assignedVarName` 单一事实源（figma-connector 注释：禁止 prompt/注入各自编号） | 编号键 = 文档遍历序，非常视觉 x | **声明方向对、键选错**。扩固化点，不推翻单一事实源 | 编号前按 bbox 排序 |
| 中卡无 bg | CODE-022 / 不变量 I6「资源 import↔挂载」；0911 R3-2 修复器 | 检测器只跑 index.vue；heal 只补 import | **覆盖不足，不是缺新码** | 扫子组件；mount 补 `:style` |
| traffic 空白 | CODE-023 三向对齐 BLOCK；I2 标签↔import↔文件双射；0ca84358 `extractSfcTemplate` | 检测器 `declared` 含 `const X =`，**按终版 index 应 BLOCK** `ContentSection*`（有文件缺绑定）。ensure 仍 lazy `</template>`；prune 已边界法；prune 不处理 defineAsync | **① ensure 与 0ca84358 声明冲突（未迁移）② CODE-023 声明 BLOCK 但产物仍发布 = 写盘闭环缺口** | ensure 改边界法；终版再验 CODE-023；BLOCK 禁止 publish。**不要 CODE-024** |
| 过拆 / 18 vue | COMP-001 只拦「规划 section 未进模板」，不拦「规划过细」；R1-1 要求 sourceNodeIds | 图表叶 `sourceNodeIds: []`；chunk 同路径双写 `total≠completed` | COMP-001 **不必升级成拆分预算门禁**（v2：不新增门禁）。过拆在 planner 收口 | 收窄 header、图表补 node id、chunk 同路径去重 |
| HeaderSection2 死 import（vehicle） | CODE-021 死代码 BLOCK | `findDeadSubComponentImports` 只认静态 import，vehicle 的 `HeaderSection2` **按规则应 BLOCK** 仍发出 | 与 traffic 空白同一类：**门禁未接到终版发布** | 先修闭环，再谈规则 |
| 空白曾被误判为缺 export default | — | `<script setup>` 不需要 export default | 分析错误，已作废 | 本文 2.1 为准 |

v2 §6「明确不要做」对照今日方案：

- 不新增 CODE → 遵守（只扩 021/022/023 扫描面与接线）。
- 不改当前产物换图/写死高度 → 遵守（本文不改 workspace）。
- 契约出现在 LLM 写该文件之前 → traffic 的 script 组件名必须在确定性 `sectionRoots` 之后只读，禁止另命名。

0911 R3-1 原文「层① + ensure 保证三要素天然齐备，新门禁只拦异常」。今日证明：**ensure 因 lazy 正则看不见 slot-con 标签，三要素并不齐备**，门禁若再被发布路径绕过，异常就变成交付物。

---

## 4. 落地对照（用户授权「全部执行」后）

一次一个，可独立 revert。代码落地以 src + dist 为准；**重生成验收仍待**（禁止就地改产物）。

| 序 | 刀 | 状态 | 落点 | 单测 / 缺口 |
|----|----|------|------|-------------|
| 1 | ensure 改 `extractSfcTemplate` | ✅ 已落地 | `resource-mounter.js`；declared 含静态 import + `const X=` + defineAsync | `ensure-subcomponent-import.spec.ts` 4 绿 |
| 2 | CODE-022 扫子组件 | ✅ 已落地 | `code-structure-validator.js` 扫 `package/index.vue` + `package/components/*.vue` | `dead-code-guard.spec.ts` 含子组件 BLOCK |
| 3 | 021/022/023 BLOCK 禁止 publish | ✅ graph 硬闸已接 | `gate-score.js` `hasHardPublishBlock`；phase2 条件边 → `l0b-fail`；complete throw `L0B_HARD_BLOCK` | publisher / `copyToWorkspace` **函数签名仍无门禁参数**（靠 graph 兜底） |
| 4 | `assignedVarName` 视觉序 | ✅ 已落地 | `visual-order-assign.js`（零依赖，避开 import.meta）；`figma-connector.js` 调用 | `figma-connector-visual-order.spec.ts` 6 绿 |
| 5a | header type 收窄 | ✅ 已落地 | `section-type-derive.js`；planner 改 import | `section-type-derive.spec.ts` 7 绿 |
| 5b | 扩 `dedupeDuplicateSections` | ❌ 未做 | header 过拆 + 图表叶 `sourceNodeIds:[]` 逃逸 | 过拆验收仍待 planner 收口 |
| 5c | 模板消费 headerSlots 契约 | ✅ 已落地 | `buildDeterministicIndexTemplate`：契约 nodeId ∩ sourceNodeIds → header-right，body 排除同 node；无契约回退 `type===header` | `code-generator.deterministic-template.spec.ts` +2 |
| 5 命名 | `assignSectionComponentNames` 「标题」过宽 | ❌ 未做 | 「小标题」仍可能命名成 `HeaderSection` | 与 5c 归属无关的独立残留 |
| 6a | chunk 非 index.vue 同路径后写覆盖 | ✅ 已落地 | `chunk-meta-files.js` `upsertFileSegment` | `chunk-meta-files.spec.ts` +2 |
| 6b | `chunk-meta.total` = completed 去重文件数 | ❌ 未做 | 次要展示 | — |

第 1–3 刀是门禁/装配闭环；第 4–5 改结构与资源序；第 6 防过拆文件残留。

完成标准（沿用 v2）：同一 Figma **重生成**后肉眼对照，禁止用单测绿或「文档写了」代替。验收样本：vehicle `3eef1eb3`、traffic `3df87ac9`、device `bfb14cea`（后者生成于旧 dist，必须重跑）。

---

## 5. 本文与旧文档关系

| 文档 | 关系 |
|------|------|
| `pipeline-governance-v2-2026-09-10.md` | 执行权威。本文是 09-13 两样本在该原则下的取证，不另起 Loop |
| `0911-管线复发问题根治方案.md` | R1-1 / R3-1 / R3-2 / I2 / I6 仍然有效；本文记录这些项的**覆盖缺口** |
| `0907` / `0909` headerSlots 双份 | 诊断仍成立。今日 vehicle 是同一病在「tabs 非 header type」上的投影 |
| `P1-类名结构单一事实源-方案-2026-09-11.md` | 无关本两例主因，不并行开工 |

状态：`closed`（诊断→落地收口，2026-09-13）。未做项（5b / 5 命名 / 6b / 重生成验收）记在 §4，不阻塞本文关闭；新样本继续写新条目或新文档，不要把本文重新打回 open-diagnosis。

---

## 6. 追加（15:00–15:30）：device-monitor 新样本 · 撞名误杀主内容区 + 四层误报

> 追加条目，不改本文 §1–5 结论。样本 Figma `1t7Dmmpsl5i0PC8BJt2QLf` node `2:8417`；复现 = `/api/phase2/generate` + `reuseCache:true`（跳过 Figma/Vision，只重跑代码生成）。

### 6.1 主根因（已治本 + 真实重生成验收）

`c-device-monitor-6ajwy8yn-c9e4a435/component-meta.json`：`degradedFiles:["package/components/MainSection.vue"]`，`reason:"SFC 编译失败，已隔离降级"`。server.log 铁证行：`Identifier 'bg6' has already been declared`。

崩坏链（确定性，全部可取证）：

| 步 | 事实 | 证据 |
|----|------|------|
| 1 | 12 张设备卡背景同图 `bg-8439.png` | `resource-dom-mapping.json`：`bg3…bg14` 全部 `resourceFile: bg-8439.png` |
| 2 | 视觉序把同图拆成 12 个变量名 | `visual-order-assign.js`（刀 4）按 y/x 编号 |
| 3 | `injectResourceImports` 对同图副名生成别名转发 | `resource-import-guard.js:427+`（W2）→ `const bg6 = bg3` |
| 4 | `ensureResourceImportInVue` 只查 `import bgN from` → 误判「未 import」→ 注入 `import bg6` | `resource-mounter.js` |
| 5 | `const bg6 = bg3` + `import bg6` → 重复声明 → SFC 编译失败 | `@vue/compiler-sfc` |
| 6 | P1-4 隔离降级剔除 MainSection → 主内容区（tab + 12 卡网格）整体消失 | `code-healer.js#isolateBadVueFiles` |

**治本（刀 7a/7b）**：`collectDeclaredBindings` 由 `resource-import-guard.js` 导出（单一事实源，覆盖 import / const / let / var / 解构 / 多声明符）；`ensureResourceImportInVue` 增撞名复核。

### 6.2 同源误报三连（刀 7c / 7d / 7e）

治本 7a/7b 后 MainSection 恢复，门禁随即暴露**同一类缺陷**（「什么算引用/绑定」判定过窄），逐个治本：

| 刀 | 误报 | 根因 | 落点 |
|----|------|------|------|
| 7c | R2：「`bg4/bg7/bg10/bg12/bg13` 幽灵引用」 | `buildResourceFacts` 只认 `import` 为绑定，不认 `const bgN = bg3` 别名 | `resource-facts.js`：加 `declaredByFile`，`imported || declared` |
| 7d | R2：「`icon`/`bgIndex` 幽灵引用」 | 标识符扫描把对象键 `{ icon: icon9 }`、成员名 `device.bgIndex` 当引用 | `resource-facts.js#collectResourceVarRefsFromSfc`：剥离属性名 |
| 7e | CODE-022：「`bg1`/`icon1` import 未挂载」 | 扫描含注释 → 注释 `// 系统自动注入 bg1~bg14、icon1~icon14` 触发注入 | `resource-import-guard.js` `injectResourceImports` + `validateSubcomponentResourceDeps`：扫描前剥注释 |

### 6.3 验收矩阵（session `mc-1789284222821-075b13a4` → `c-device-monitor-00g6b7vh-075b13a4`）

| 判据 | 结果 |
|------|------|
| `component-meta.json.degradedFiles` | 无（不再隔离）✅ |
| 子组件齐备 | Header / MainSection / Switch / Tabs 四件 ✅ |
| MainSection 含设备网格 | 24 处「设备/摄像机」✅ |
| TabsSection 是否错塞设备卡 | 0 处（旧模型错已消失）✅ |
| 离线 `checkResourceContract` | R1=[] R2=[] BLOCKING=[] WARN=0 ✅ |
| L0-B 结果 | 「软失败：重试耗尽，降级完成并附带评分」→ 发布 ✅（旧为硬 fail-closed） |
| CODE-022 | 自愈日志「删除未挂载的资源 import」✅ |

单测：`resource-facts.spec.ts` / `resource-import-guard.spec.ts` / `resource-mounter.spec.ts` 三 spec 96 用例全绿；`npm run build` exit=0。

### 6.4 残余（本期未治，独立立项）

1. **CODE-020/024 类名契约（慢性）**：`common.less` 双前缀 `c-device-monitor-00g6b7vh-c-device-monitor-*` 与模板单前缀 `c-device-monitor-*` 不匹配。**非本期引入**——09-11 起所有 device 样本 `common.less` 双前缀 45–82 处。根因指向 `classPrefix`（含随机段 `-<slug>`）与 LLM 使用的语义干不一致。
2. **CODE-026 骨架「缺失」假阳性**：`css-vars.js` / `dark.less` / `light.less` / `index.less` 终产物均存在，但 L0-B 报缺失 → 校验发生在骨架物料化之前（时序缺陷；上一轮偶发不复现）。
3. **CODE-024 修饰符方言**：模板 `active` / `is-selected` 未在写盘前归一为 `基类--active`（方言归一器未命中）。

---

## 7. 追加（15:50–16:05）：CODE-020/024 双前缀治本 · 刀 8 家族（根因：sessionId 缺失 → 随机兜底段污染 class 前缀契约）

§6.4 列为「残余慢性项」的第 1 条（`common.less` 双前缀 `c-device-monitor-00g6b7vh-c-device-monitor-*`）
本次**已治本并真实验收通过**。根因不在类名归一器，而在 **componentId 的随机兜底段**。

### 7.1 完整根因链（100% 确定性取证）

| # | 环节 | 证据 |
|---|---|---|
| ① | phase2 微码链路的 engineer input **顶层无 sessionId**（只嵌在 `ctx: new GenerationContext({ sessionId })` 内），运行期靠 `this._engineerSessionId = ctx.sessionId` 兜住 `normalizeDeclareJson` | `mc-component-graph-phase2.js:1184` 是 `ctx` 对象字面量内的一行；`awk '^        sessionId'` 扫描顶层字段 = 0 命中 |
| ② | `safeGenerateDeclareJson` 读的是**顶层** `input.sessionId` → 恒空 → 走 `Math.random().toString(36).slice(2,10)` 随机兜底 | `code-generator.js:519`（旧实现）|
| ③ | base36 随机段（8 位、含 `g/v/h` 等非 hex 字母）拼进 componentId：`c-device-monitor-00g6b7vh` | `declare.json` 落盘即为该值；产物目录 `c-device-monitor-00g6b7vh-075b13a4` |
| ④ | `classPrefixOf` 只剥 `-[0-9a-f]{8}$` → 随机段**不可剥离**；`semanticSegmentOf` 同样漏它 → 重建后 slug 被当语义段继承 | `declare.json.meta.checkpoint.classPrefix = "c-device-monitor-00g6b7vh"`（铁证）|
| ⑤ | CODE-003 以该前缀判定 LLM 自然生成的 `.c-device-monitor-*` 为「缺前缀」→ autoFix **二次叠加** → 选择器永不命中模板 | server.log：`[CODE-003] common.less 中 42 个 class 缺少 c-device-monitor-00g6b7vh 前缀` |
| ⑥ | 判据量化：`[CODE-003-HIT-RATE] 命中率过低（48%，47/90 个未使用）` | 同 run 日志 |

**系统性验证**：`workspace/custom-components/` 下几乎全部微码产物都是四段形态
`c-<语义>-<8位base36随机>-<8hex>`（`c-device-monitor-yoyz6l2l-011998bb`、`c-env-monitor-002v6v4b-b81edc3b`…）
—— 证明这不是单样本偶发，而是**自 2026-09-04 引入随机兜底起、影响所有微码生成**的慢性缺陷。

### 7.2 治本三刀

| 刀 | 文件 | 改动 |
|---|---|---|
| **8a** 根因 | `mc-component-graph-phase2.js`、`code-generator.js` | ① engineer input 补**顶层** `sessionId: state.sessionId`；② 装配逻辑抽为纯函数 `resolveDeclareComponentId(input, options)`，取值链 `input.sessionId → input.ctx.sessionId → options.sessionId`；③ 全缺时**不注入随机尾段**（componentId 保持 `c-<语义>`），且仅接受尾段为 `^[0-9a-f]{8}$` 的 sessionId |
| **8b** 加固 | `component-naming.js` | 新增 `isDecorSlugSegment(seg)`（8 位 `[a-z0-9]` + 含数字 + 含非 hex 字母 → base36 随机特征）与 `stripDecorSlugTail(id)`（支持 `…-<slug8>-<hex8>` 与 `…-<slug8>` 两形态）；接入 `classPrefixOf`（剥段两次：hex 尾前/后）与 `semanticSegmentOf` |
| **8c** 安全网 | `code-structure-validator.js`、`code-validator.js` | ① `findPrefixViolations` 同时接受「装饰段已剥离的语义干」形态 → 不再把正确类判为违规；② 新增 `collapseDoubledComponentPrefix(text, prefixId)` 折叠存量病灶 `<stem>-<slug8>-<stem>-x → <stem>-x`（幂等）；③ autoFix 新增前缀一律写**语义干**；④ 折叠置于 early-return **之前**并新增 `collapsed` 返回字段，纯折叠场景也写回 |

判据设计原则：`isDecorSlugSegment` 要求「数字 **且** 非 hex 字母」同时出现，反例不误伤
（`overview`/`register`/`progress` 无数字；`20240913`/`43e7fe45` 为纯 hex）。

### 7.3 真实验收（session `mc-1789285935903-97e8f48e` → `c-device-monitor-97e8f48e`，status=completed）

| 指标 | 旧产物 `…00g6b7vh-075b13a4` | 新产物 `…97e8f48e` | 判定 |
|---|---|---|---|
| `declare.componentId` | `c-device-monitor-00g6b7vh-075b13a4` | `c-device-monitor-97e8f48e` | ✅ 尾段纯 hex |
| `declare.meta.checkpoint.classPrefix` | `c-device-monitor-00g6b7vh` | `c-device-monitor` | ✅ 收敛到语义干 |
| `businessEvents` 键 | 2 个（`c-…-00g6b7vh-onload` + `device-monitor-onload` 双轨） | 1 个（`device-monitor-onload`） | ✅ 事件名不再双轨 |
| `common.less` 双前缀处数 | **56** | **0** | ✅ |
| `common.less` 顶层规则数 | 99 | 65 | ✅ 剪掉 34 条死重复 |
| 各 .vue 双前缀处数 | index 1 / Header 8 / 其余 0 | 全部 0 | ✅ 模板↔样式一致 |
| 模板有 CSS 无（死样式） | 0（但 47/90 为孤立死定义） | **2**（仅 `--selected` 方言残留） | ✅ 命中率 48% → ~98% |
| `[CODE-003]` 门禁 | 42 项误报 | **0** | ✅ |
| `[CODE-003-HIT-RATE]` | 48%（47/90 未使用） | **不再触发** | ✅ |
| `degradedFiles` | 4 子组件齐 | 4 子组件齐、无降级 | ✅ |
| 随机段残留（除合法尾段） | 多处 | **0** | ✅ |

单测：新增 `component-naming.decor-slug.spec.ts`（14）、`code-generator.declare-component-id.spec.ts`（7）、
`code-structure-validator.spec.ts` 追加 8 例 → 合 29 例；加上 `class-prefix-fixer` / `classname-contract` /
`class-facts` / `pipeline-regression-0908` / `code-generator.deterministic-template` 回归全绿（171 用例）；
`npm run build` exit=0；dist 校验含 `resolveDeclareComponentId` / `isDecorSlugSegment` / `stripDecorSlugTail` /
`collapseDoubledComponentPrefix`。

### 7.4 本次后残余（仍未治，独立立项）

1. **CODE-026 骨架「缺失」假阳性**：终产物齐备，校验发生在骨架物料化之前（时序缺陷）。
2. **CODE-024 修饰符方言**：模板 `--selected` 与样式 `.is-active` 双轨未归一（本次新产物仍余 2 处死样式）。
3. `CODE-003-FOLD` 折叠路径本次 0 命中（源头已修，无存量可折）；能力保留供存量产物自愈，单测已覆盖。
