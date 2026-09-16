# 资源跨区错绑修复方案 v1.0

> 基于 mc-max-1788949001753-2e895949 后验分析
> 发布日期：2026-09-09 | 状态：设计稿（待实施）

---

## 一、问题定义

资源错绑表现为：**Figma 中属于 section A 的背景图/图标，被注入到 section B 的组件文件中**。

典型案例（mc-max-1788949001753-2e895949）：
- `bg-_m-34`（Figma 归属 `slot-当日总流量` 的每日流量统计区域）被注入 `HourlyFlowTunnel.vue`（隧道小时流量组件）
- LLM 原始生成结果中 `HourlyFlowTunnel.vue` **没有任何**背景图 import 或 `backgroundImage`——全由管线后处理 `injectResourceImports` 注入

---

## 二、管线现状全景

### 2.1 已有的事实源

`resource-manifest.js` 的 `annotateResourceOwnership(mappings)` 已能按 `figmaPath` 中的 `slot-*` 段，给每个 mapping 条目标注 `ownerRole`（`section`/`panel`/`unassigned`）和 `ownerSectionId`（如 `slot-当日总流量`）。

```js
// resource-manifest.js:63-72
export function annotateResourceOwnership(mappings, options = {}) {
  return mappings.map((m) => {
    const sec = sectionKeyOf(m.figmaPath, re)  // 提取首个 slot- 段
    if (!sec) return withResourceOwner(m, 'panel', null)
    return withResourceOwner(m, 'section', sec)
  })
}
```

### 2.2 资源错绑的 4 个接触面

| # | 接触面 | 文件 | 感知 section | 问题 |
|---|--------|------|-------------|------|
| 1 | **注入 import** | `resource-import-guard.js:266` `injectResourceImports()` | ❌ 无 | 收全量 `effectiveMapping`，按变量名匹配注入，不问资源归属哪个 section |
| 2 | **兜底挂载** | `resource-mounter.js:851` `autoMountUnusedBackgrounds()` | ❌ 无 | 关键词匹配失败时 `pickNextRegionContainer` = 任意未占用容器 |
| 3 | **自愈绑定** | `code-fix-rules.js:816` `engineer._autoMountUnusedBackgrounds()` | ❌ 无 | 同 2 |
| 4 | **L7 校验** | `resource-attribution-validator.js:287` `detectCrossSectionResourceBindings()` | ✅ 有 | 能 BLOCK 但**不自动修复**，只能靠 LLM 重试（确定性损坏 LLM 修不了） |

### 2.3 关键缺口

```
annotateResourceOwnership 推算 ownerSectionId
         │
         ▼  （运行时推算，不持久化）
    buildResourceManifest (仅供 L5/L6/L7 消费)
         │
         ▼  （不写回 resourceDomMapping 条目）
    detectCrossSectionResourceBindings (只 BLOCK 不修)
         │
         ▼  （没有自愈回路）
    injectResourceImports / autoMountUnusedBackgrounds (无感知 → 错绑)
```

---

## 三、修复方案（4 阶段，可独立回退）

### Phase 1: 持久化 ownerSectionId 到 mapping 条目

**文件**：`backend-node/src/ai-engine/roles/figma-connector.js`（`_buildResourceDomMapping` 或其紧后）

**改动**：在 `_buildResourceDomMapping` 末尾（或 microcode-engineer.js 中 "有效映射构建" 之后），调 `annotateResourceOwnership` 并将结果**写回原 mapping 条目**：

```js
// 在 buildVarToMapping 或类似「构造 effectiveMapping」的位置
if (Array.isArray(effectiveMapping)) {
  const annotated = annotateResourceOwnership(effectiveMapping, { sectionPrefix: 'slot-' })
  for (let i = 0; i < effectiveMapping.length; i++) {
    if (annotated[i]?.ownerRole) {
      effectiveMapping[i].ownerRole = annotated[i].ownerRole
      effectiveMapping[i].ownerSectionId = annotated[i].ownerSectionId
    }
  }
}
```

**效果**：每个 mapping 条目带上 `ownerRole` + `ownerSectionId`，后续所有消费方可直接读取，无需重复推算。

**检证**：
- `grep 'ownerSectionId' resourceDomMapping` 确认每个成功下载的资源都有归属
- section 内资源 `ownerRole === 'section'`，根容器资源 `ownerRole === 'panel'`

---

### Phase 2: injectResourceImports 添加 section-scope 过滤

**文件**：`backend-node/src/ai-engine/utils/resource-import-guard.js`

**改动**：给 `injectResourceImports` 加第 5 个可选参数 `options = {}`，支持 `sectionScope` 过滤：

```js
export function injectResourceImports(code, resourceDomMapping, resourceRelBase = null, diag = null, options = {}) {
  // ...
  // ── 🆕 section-scope 过滤（2026-09-09）──
  // 如果传了 sectionScope（形如 'slot-当日总流量'），只处理归属该 section 的资源
  const sectionScope = options?.sectionScope
  if (sectionScope) {
    // ownerSectionId 由 Phase 1 持久化写入
    available = available.filter((m) => {
      if (m.ownerRole === 'panel') return true  // panel 级资源（根背景等）不过滤
      return m.ownerSectionId === sectionScope
    })
    // 同步重建 varToMapping
    // ...
  }
  // ...
}
```

**规则语义**：
- `sectionScope` 未传 → 行为不变（向后兼容）
- `sectionScope` 已传 + 资源 `ownerRole === 'panel'` → 放行（根级背景全局可用）
- `sectionScope` 已传 + 资源属于该 section → 放行
- `sectionScope` 已传 + 资源属于其他 section → 拦截

**调用点更新**（microcode-engineer.js 共 4 处）：

| 行号 | 当前调用 | 应传的 sectionScope |
|------|---------|-------------------|
| 1509 | 子组件文件 `fixed` | 从文件名反推（`HourlyFlowTunnel.vue` → 匹配 section 映射）|
| 1937 | generateCode 内循环 | 当前处理的 `relPath` 对应的 section |
| 5072 | execute 兜底 (index.vue) | 不传（index.vue 是主组件，可接受全部资源）|
| 6002 | 落盘前终验 | 同 1509 |

---

### Phase 3: autoMountUnusedBackgrounds 添加 section 约束

**文件**：`backend-node/src/ai-engine/roles/microcode/resource-mounter.js`（`autoMountUnusedBackgrounds`）

**当前逻辑**（简化）：
```
for (const m of candidates) {
  kws = extractMountKeywords(m)
  targets = collectMountCandidates(allFiles, kws)
  target = pickBestMountTarget(m, targets)
  if (!target) target = pickNextRegionContainer(allFiles)  // ← 跨 section 入口
  injectBackground(m, target, targetFile)
}
```

**改动**：`autoMountUnusedBackgrounds` 接收 `sectionScope` 参数（由 caller 传入当前文件所属 section）。挂载目标选择时增加 section 约束：

```js
// 在 pickNextRegionContainer 前，按 ownerSectionId 限定候选
const sectionScope = options?.sectionScope
if (sectionScope && m.ownerSectionId && m.ownerSectionId !== sectionScope) {
  logger?.warn('🛡️ 跨 section 资源跳过：', {
    resource: m.assignedVarName || m.resourceFile,
    owner: m.ownerSectionId,
    currentFile: currentFile,
  })
  continue  // 不把 A 区的资源挂到 B 区
}
```

**挂载结果逻辑**：
1. 无 sectionScope → 行为不变（向后兼容）
2. 有 sectionScope + 资源归属当前 section → 正常挂载
3. 有 sectionScope + 资源归属其他 section → **跳过**（不再用 `pickNextRegionContainer` 兜底）
4. 有 sectionScope + 资源 `ownerRole === 'panel'` → 放行（panel 级资源是全局背景）

---

### Phase 4: L7 自动修复（不依赖 LLM 重试）

**文件**：`backend-node/src/ai-engine/validators/resource-attribution-validator.js`

**当前**：`detectCrossSectionResourceBindings` 生成 `{ id: 'RES-ATTR-CROSS-SECTION', severity: 'BLOCK', ... }`，然后抛给重试循环。

**改动**：在返回 issues 之前，增加一行 **自动剥离** 逻辑：

```js
// 🆕 自动修复：从错绑的文件中剥离不属于它的资源
if (severity === 'BLOCK' && issue.id === 'RES-ATTR-CROSS-SECTION') {
  const autoFixed = autoStripMisboundResources(
    generatedFiles,        // 文件集合
    issue.file,            // 错绑的文件路径
    issue.resourceName,    // 错绑的资源变量名（如 bg1）
    issue.ownerSection,    // 资源的正确归属 section
    issue.currentSection,  // 当前文件的 section
  )
  if (autoFixed) {
    // 标记已修复并将 severity 降为 WARN（不阻断管道）
    issue.severity = 'WARN'
    issue.autoFixed = true
    // 记录日志
  }
}
```

**`autoStripMisboundResources` 职责**：
1. 从 `.vue` 文件的 `<script setup>` 中移除该资源变量的 `import` 语句
2. 从模板中移除 `:style="{ backgroundImage: url(...) }"` 引用
3. 从模板中移除 `:src="xxx"` 等 props 绑定（如果有）
4. 清理残留的空 `:style="{}"` 或尾部逗号
5. 如果文件中引用了其他同 section 资源，保留它们不受影响

**剥离 vs 重试**：
- 资源错绑是**确定性后处理注入的**（不是 LLM 写的），LLM 重试 3 次也修不好
- 自动剥离走正则替换（纯字符串操作），无 LLM 调用、无 LLM 成本、零时序
- 剥离后产物：不显示本不应属于该 section 的背景图 → 是正确的（比显示错误背景更好）

---

## 四、实施顺序与依赖关系

```
Phase 1 (持久化 ownerSectionId)
    │
    ├──→ Phase 2 (inject 过滤) —— 无依赖 Phase 3/4
    ├──→ Phase 3 (auto-mount 过滤) —— 无依赖 Phase 2/4
    └──→ Phase 4 (L7 auto-heal) —— 依赖 Phase 1（mapping 带 ownerSectionId）
```

| 阶段 | 改动 | 风险 | 可独立回退 |
|------|------|------|-----------|
| Phase 1 | +2 字段到 mapping 条目 | 低（新增只读字段，不改任何逻辑） | ✅ |
| Phase 2 | 可选 sectionScope 参数 | 中（向后兼容，不传即旧行为） | ✅ |
| Phase 3 | auto-mount 可选 section 约束 | 中（section 匹配不到时跳过，不兜底） | ✅ |
| Phase 4 | L7 auto-heal 自动剥离 | 高（需验证剥离不破坏合法内容） | ✅ |

---

## 五、验证方案

### 5.1 探针验证（Phase 1 + Phase 2）

```js
// 构造含跨 section 资源的 mapping
const mapping = [
  { resourceFile: 'bg-daily-total.png', figmaPath: 'cp-流量监测/slot-当日总流量/bg', downloadStatus: 'success' },
  { resourceFile: 'bg-hourly.png', figmaPath: 'cp-流量监测/slot-小时车流/bg', downloadStatus: 'success' },
];

// Phase 1 验证：annotateResourceOwnership
const annotated = annotateResourceOwnership(mapping);
assert(annotated[0].ownerSectionId === 'slot-当日总流量');
assert(annotated[1].ownerSectionId === 'slot-小时车流');

// Phase 2 验证：section-scope 过滤
const code = '<script setup>\n</script>\n<template>\n  <div :style="{ backgroundImage: `url(${bg1})` }"></div>\n</template>';
const out = injectResourceImports(code, annotated, '../resources/images/', null, {
  sectionScope: 'slot-当日总流量',
});
assert(out.includes('import bg1'));  // bg1 属 slot-当日总流量 → 注入 ✅

const out2 = injectResourceImports(code, annotated, '../resources/images/', null, {
  sectionScope: 'slot-小时车流',
});
assert(!out2.includes('import bg1'));  // bg1 不属 slot-小时车流 → 不注入 ✅
```

### 5.2 回顾验证（用已失败的组件重跑）

取 mc-max-1788949001753-2e895949 的输入数据：

| 验证项 | 预期 |
|--------|------|
| HourlyFlowTunnel.vue 不再被注入 bg-_m-34 | ✅ bg-_m-34 的 ownerSectionId='slot-当日总流量'，HourlyFlowTunnel 的 sectionScope='slot-小时车流' → 不注入 |
| DailyTotalFlow.vue 正常获得 bg-_m-34 | ✅ 同一 section 范围 → 注入 |
| panel 级资源（根容器 bg）仍能注入所有子组件 | ✅ ownerRole='panel' 不受 sectionScope 过滤 |

### 5.3 回归验证

- `injectResourceImports` 不传 `sectionScope` → 行为完全不变（所有现有测试通过）
- `autoMountUnusedBackgrounds` 不传 `options.sectionScope` → 行为完全不变
- L7 auto-heal 只影响 `RES-ATTR-CROSS-SECTION` 类 issue，其他 BLOCK 不受影响

---

## 六、拒绝的替代方案

### ❌ 方案 A：只改 prompt 让 LLM 不写错
已试过，无效。因为错绑是**确定性后处理**注入的，不关 LLM 事。

### ❌ 方案 B：修改 bgPlaceholder 字段语义
`bgPlaceholder` 仅存在于 fixture 中，生产零消费。要改它需要从 visual-parser 到整个管线改一圈，成本高于 Phase 1 的 `ownerSectionId` 持久化。

### ❌ 方案 C：拆成每个 section 一个 effectiveMapping
会在 microcode-engineer.js 的多处调用点产生大量条件分支，侵入性太大。不如在 `injectResourceImports` 内部加可选 sectionScope 过滤干净。

### ❌ 方案 D：直接删掉 auto-mount 的 pickNextRegionContainer 兜底
删兜底链会导致「背景有归属但没挂上」的漏用问题（目前绕过了，资源虽错但至少显示了）。正确的做法是**加 section 约束**而不是删兜底。

---

## 七、后续可能

- **Phase 5（可选）**：在 L5/L6 prompt 构建时，把 `ownerSectionId` 信息一并传给 LLM——不仅给资源清单，还给「每个资源属于哪个 section」的元数据。让 LLM 在写代码时就知道该在哪个组件里用哪个资源，减少后处理依赖。
- **Phase 6（可选）**：section 映射（子组件文件名 → sectionScope）建立 deterministic 表，避免每处 caller 都需要手动反推 section 归属。可在 `code-fix-rules.js` 初始化时统一构建。