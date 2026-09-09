# 统一优化方案 v1.0 — 根治级

> 基于 55e0f192（交通监测）与 021e3cf7（设备监测）双会话后验分析
> 覆盖 7 项系统性根因，拒绝补丁式修复，统一入口，确定性根治

## 一、问题全景

| 编号 | 根因 | 症状 | 涉话会话 | 严重度 |
|------|------|------|----------|--------|
| **P0** | `buildComponentId` 跨轮次生成不同 random8（中间段变化） | prefix 漂移 → autoFixPrefixViolations 叠加 → 双前缀 → 类名不命中 | 55e0f192, 021e3cf7 | **CRITICAL** |
| **P1** | `_inferHeaderSlotsFromInlineRows` 绕过 C-1/C-2 bbox 过滤器 | 衍生的 headerSlots 包含内容区统计 → 插槽重复 → 两份渲染 | 021e3cf7 | **CRITICAL** |
| **P2** | `autoFixPrefixViolations` 只处理 index.vue + common.less，不扫子组件 | 子组件 scoped style 单前缀，common.less 双前缀 → 跨文件类名断链 | 021e3cf7 | **HIGH** |
| **P3** | `FLEX-005` 只检查不自动修复 | 重试 3 次仍同一错误 → 重试耗尽 BLOCK | 021e3cf7 | **HIGH** |
| **P4** | `sanitizeCssContent` 分隔线正则无行锚定 | `}====` 残留 → LESS Unrecognised input | 55e0f192 | **HIGH** |
| **P5** | P1-3 重叠去重只删合约不删已注入 DOM | index.vue 中 `<template #header-right>` 内容静默残留 → 重复渲染 | 021e3cf7 | **MEDIUM** |
| **P6** | 确定性缺陷（FLEX-005、prefix drift、class naming）导致重试浪费 | 3 次 retry 全部消耗在 Auto-fixable 问题 → 重试预算耗尽 | 021e3cf7 | **MEDIUM** |

---

## 二、7 项优化项

---

### P0: ComponentId 持久化检查点系统

**文件**：`backend-node/src/ai-engine/utils/component-naming.js:160-167` + `backend-node/src/ai-engine/roles/microcode-engineer.js:3825-3843`

**根因**：`buildComponentId(seg, sessionId)` 生成 `c-<seg>-<tail8>`。虽然**当前版已无 random8 中间段**，但若 `_engineerSessionId` 在重试轮次中被覆写（或 LLM 产出的 componentId 后缀与 sessionId 尾 8 不匹配 → 进入重建分支），会生成新的 componentId，导致 `classPrefixOf(componentId)` 结果漂移。

**方案**：

1. **第一轮生成后写入磁盘检查点**：在 `normalizeDeclareJson` 首次确定 `d.componentId` 后，将 `{ componentId, prefixId }` 写至 `declare.json` 的 `meta.checkpoint` 字段。
2. **后续轮次只读检查点**：`normalizeDeclareJson` 优先读取 `declare.json.meta.checkpoint.componentId`，若存在 → 直接复用，跳过重建分支。
3. **一致性守护**：写盘前对比 `d.componentId` 与 `classPrefixOf(d.componentId)` 的 `prefixId` 是否已存在于 `common.less` 的选择器中；若已存在不同 segment 的旧前缀 → 触发全局替换。

**修改点**：

```javascript
// component-naming.js — buildComponentId 已确定型，无需改
// microcode-engineer.js normalizeDeclareJson ~L3825

// ① 在 if (d.componentId && _sessionId) 块前增加检查点读取
const _checkpoint = d.meta?.checkpoint;
if (_checkpoint?.componentId && /^c-/.test(_checkpoint.componentId)) {
  // 检查点命中 → 直接复用，跳过重建
  d.componentId = _checkpoint.componentId;
  // 仍校验前缀一致性（但不重建）
  this._checkpointUsed = true;
} else {
  // 原有的重建逻辑
}

// ② 重建后写入检查点
if (_forceChanged) {
  d.meta = d.meta || {};
  d.meta.checkpoint = {
    componentId: d.componentId,
    createdAt: new Date().toISOString(),
  };
}
```

---

### P1: HeaderSlots 单入口过滤器

**文件**：`backend-node/src/ai-engine/roles/visual-parser.js:3168`

**根因**：`_inferHeaderSlotsFromInlineRows` 从 `inlineCompositeRows` 派生 headerSlots 时，直接将 `inlineRows` 节点转为 slot 候选。这些节点来自**内容区**（container 内顶部行），而 `C-1/C-2 bbox 过滤器` 此前已正确地将它们从 `correctedHeaderSlots` 中剔除。派生路径未经过 C-1/C-2，导致内容区节点重新进入 slot 候选。

**方案**：

1. `_inferHeaderSlotsFromInlineRows` 的结果**必须与 `this.correctedHeaderSlots` 做合并（取并集）后再写回 contract**。
2. 具体做法：
   ```javascript
   // 在 contract.headerSlots 写回前 ~L3168
   const derived = this._inferHeaderSlotsFromInlineRows(figmaNodeData);
   // 🛡️ 派生结果必须经过 correct 过滤器的兜底
   if (derived && derived.length > 0) {
     const correctedSet = new Set(
       (this.correctedHeaderSlots || []).map(s => s.figmaNodeId || s.name || s.content)
     );
     const filtered = derived.filter(s => 
       correctedSet.has(s.figmaNodeId || s.name || s.content) ||
       // 或通过 bbox containment 过滤
       this._containedInHeader(s, headerBox)
     );
     contract.headerSlots = [...(this.correctedHeaderSlots || []), ...filtered];
   }
   ```

**核心原则**：一条入口路径（visual = derived + corrected），一个过滤器（C-1/C-2 bbox containment），最终写回 `contract.headerSlots` 的数据必须全部经过同一个过滤器。

---

### P2: `autoFixPrefixViolations` → 全 SFC 覆盖

**文件**：
- `backend-node/src/ai-engine/validators/code-structure-validator.js:2761-2836`
- `backend-node/src/ai-engine/roles/microcode/code-validator.js:1330-1420`

**根因**：`autoFixPrefixViolations` 只迭代 `files` map 中的 `index.vue` 和 `common.less`。子组件 `.vue` 文件的 template（中的 `class` 属性）和 `<style scoped>`（中的选择器）未被扫描和修正。

**方案**：

1. **扫描范围扩大**：遍历 `allFiles` 中所有 `package/**/*.vue` 文件（包括子组件）。
2. **双重修复**：
   - **Template 层**：替换所有 `class="c-<bare-xxx>"` 为 `class="c-<prefix>-<bare-xxx>"`（与 index.vue 相同的逻辑）
   - **Scoped Style 层**：替换 `<style scoped>` 内的选择器 `.c-<bare-xxx>` 为 `.c-<prefix>-<bare-xxx>`
3. **Double-prefix 守卫**：如果 class 已以 `prefixId` 开头（`c-traffic-monitor-c-traffic-monitor-*` → 二次应用），跳过或反向修复。

```javascript
// 在 autoFixPrefixViolations 循环末尾，增加子组件扫尾
for (const [filePath, content] of Object.entries(allFiles)) {
  if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue')) continue;
  // 跳过主入口
  if (filePath === 'package/index.vue') continue;
  
  let fixed = content;
  // ① Template class 前缀修复
  fixed = fixed.replace(
    /\bclass="(c-)(?!random8|prefix)([a-z][a-z0-9-]*)"/g,
    (m, prefix, name) => `class="${prefixId}-${name}"`
  );
  // ② Scoped style 选择器修复
  fixed = fixed.replace(
    /<style[^>]*scoped[^>]*>([\s\S]*?)<\/style>/gi,
    (styleTag, cssBody) => {
      const fixedCss = cssBody.replace(
        /\.(c-)(?!random8|prefix)([a-z][a-z0-9-]*)/g,
        (m, prefix, name) => `.${prefixId}-${name}`
      );
      return styleTag.replace(cssBody, fixedCss);
    }
  );
  if (fixed !== content) {
    allFiles[filePath] = fixed;
    fixes.push({ file: filePath, type: 'prefix-scoped-style' });
  }
}
```

---

### P3: FLEX-005 自动归一化器

**文件**：`backend-node/src/ai-engine/utils/flex-sibling-guard.js`（新建或扩展现有文件）

**根因**：FLEX-005 检测到兄弟 Flex 子元素的 `flex-grow` 值混合了 px（如 `flex: 30 1 0`）和 ratio（如 `flex: 1`），但只记录日志不修复。模型重试 3 次依然产出同一模式 → 重试耗尽 BLOCK。

**方案**：

在 LESS 编译门禁之前（`code-healer.js` 或 `flex-sibling-guard.js`），增加自动归一化步骤：

```javascript
/**
 * 🛡️ FLEX-005 自动归一化器
 * 检测同一 flex container 下兄弟块的 flex 属性量纲混杂：
 *   - px 形态：flex: <px> 1 0
 *   - ratio 形态：flex: <N>
 * 归一化为统一量纲：
 *   策略 A（推荐）：px → flex: 0 0 <px>（保持尺寸不变，不再伸展/收缩）
 *   策略 B：px → ratio (h_i / Σh)，统一为 flex: <ratio>
 *   策略 C：全部转为 flex: 1（均分，视觉可能偏差）
 * 
 * 偏向策略 A：破坏最小，不改变容器总高度分布
 */
function autoNormalizeFlexDimension(commonLessContent) {
  // 1. 用 FLEX-005 相同的检测逻辑找到「量纲混杂」的 flex container
  const mixedContainers = detectMixedDimensionGrow(commonLessContent);
  if (mixedContainers.length === 0) return { content: commonLessContent, fixed: false };
  
  // 2. 对每个混杂容器，找到所有含 px grow 的子规则
  for (const container of mixedContainers) {
    // 策略 A：px-grow → flex: 0 0 <px>
    // flex: 30 1 0 → flex: 0 0 30px
    commonLessContent = commonLessContent.replace(
      /flex:\s*(\d+)\s+1\s+0\s*;/g,
      (match, px) => `flex: 0 0 ${px}px;`
    );
  }
  
  return { content: commonLessContent, fixed: true };
}
```

**集成位置**：在 `microcode-engineer.js` 的 `postProcessIndexVue` 或 `writeFiles` 阶段，LESS 编译前调用。

---

### P4: CSS Sanitizer 分隔线正则 → 行锚定

**文件**：`backend-node/src/ai-engine/utils/css-sanitizer.js:38`

**根因**：`sanitizeCssContent` 的分隔线检测正则 `/\/\/\s*===\s*[\s\S]*?===\s*\n?/g` 使用 **lazy `[\s\S]*?===`**，在 `}` 紧贴 `// ===`（无换行）时，只匹配 60 个 `=` 中的前 6 个，剩下 `=====` 黏在 `}` 后 → `lessc: Unrecognised input`。

**方案**：改用**行锚定 + 完整行删除**：

```javascript
// 旧
// content = content.replace(/\/\/\s*===\s*[\s\S]*?===\s*\n?/g, '');

// 新：行锚定，匹配完整的分隔线（// =====...=====）
content = content.replace(/^\/\/\s*={10,}\s*\n?/gm, '');
```

**配套修复**：在自愈步骤 `heal` 中，当检测到 `}\n//` 模式时，确保 `}` 与 `//` 之间有换行：

```javascript
// 在 healCSS 或 file-writer heal 步骤中
content = content.replace(/}(?!\n)\s*\/\/\s*={10,}/g, '}\n// ===========');
```

---

### P5: T09 → P1-3 后清理已注入 DOM

**文件**：
- `backend-node/src/ai-engine/roles/microcode/resource-mounter.js:2140-2300`（ensureHeaderSlots）
- `backend-node/src/ai-engine/roles/microcode/resource-mounter.js:2031-2100`（P1-3 dedup）

**根因**：T09 在 `ensureHeaderSlots` 中已将 `<template #header-right>` 注入 `index.vue`。随后 P1-3 检测到注入内容与子组件渲染内容重叠 → 从合约中剔除了 3 个 slot 候选。但**已注入的 DOM 块不会回滚**，导致 `index.vue` 残留两份渲染：一份是 T09 注入的内联 span，另一份是 `<HeaderStats>` 子组件自渲染。

**方案**：

在 P1-3 重叠去重逻辑中，当判定某个 `header-right` slot 与子组件内容重叠时，不仅要剔除合约候选，还要**同步从 index.vue 中删除对应的 `<template #header-right>` 块**：

```javascript
// 在 P1-3 去重逻辑中（重叠判断通过后）
if (intersectionRatio > OVERLAP_THRESHOLD) {
  logger.warn(`🛡️ P1-3 重叠去重 + 回滚：剔除 header-right ${slotName}`);
  // ① 从合约候选剔除（已有）
  remainingSlots = remainingSlots.filter(s => s !== slot);
  
  // ② 🆕 从 index.vue 删除已注入的模板块
  result = result.replace(
    new RegExp(
      `<template\\s+#header-right\\s*>([\\s\\S]*?)</template>`,
      'gi'
    ),
    ''
  );
  result += '\n';
}
```

---

### P6: 确定性缺陷自动修复 → 重试保护

**文件**：`backend-node/src/ai-engine/roles/microcode-engineer.js`（重试循环附近）

**根因**：FLEX-005、autoFixPrefixViolations class 偏移、CODE-016（common.less 类名命中率低）均属**确定性代码缺陷**。每次重试 LLM 仍产出同模式缺陷，3 次重试全部浪费在自动可修复的问题上。

**方案**：

在每次重试通知 LLM 之前，增加原子检查点：

```javascript
// 在重试循环开始前
const preRetryDefectChecklist = [
  { id: 'FLEX-005', autoFixable: true, fixFn: autoNormalizeFlexDimension },
  { id: 'CODE-016', autoFixable: true, fixFn: fixClassHitRate },
  { id: 'PREFIX-DRIFT', autoFixable: true, fixFn: normalizeAllPrefixes },
  { id: 'LESS-COMPILE', autoFixable: true, fixFn: sanitizeCssContent },
];

for (const defect of preRetryDefectChecklist) {
  if (currentErrors.some(e => e.id === defect.id)) {
    const result = defect.fixFn(allFiles, commonLess);
    if (result.fixed) {
      logger.info(`🩹 自动修复确定性缺陷 ${defect.id}，跳过 LLM 重试`);
      // 写回修复后的文件
    }
  }
}

// 如果所有 pending error 全部 auto-fixed → 跳过 LLM 重试，直接进入门禁重校验
if (allErrorsResolved) {
  logger.info('✅ 所有缺陷已自动修复，跳过 LLM 重试，直接进入门禁重校验');
  // 跳转到 writeFiles + gate re-validate
}
```

---

## 三、实施顺序与依赖关系

```
P4 (CSS sanitizer) ────────── 无依赖，可最先做
     │
P0 (ComponentId checkpoint) ── 无依赖，但影响前缀稳定性
     │
     ├──→ P2 (全 SFC 前缀覆盖) ── 依赖 P0 的稳定 prefixId
     │
     ├──→ P6 (重试保护) ─────── 依赖 P0 (prefix)、P3 (flex)、P4 (CSS)
     │
P1 (单入口过滤) ────────────── 无依赖
     │
     ├──→ P5 (T09 回滚注入) ── 依赖 P1 过滤结果 + T09/P1-3 代码理解
     │
P3 (FLEX-005 归一化) ──────── 无依赖
```

**推荐执行顺序**：

| 轮次 | 项 | 预期工时 | 风险 |
|------|-----|---------|------|
| 1 | P4 CSS sanitizer 行锚定 | 15min | 极低 |
| 2 | P0 ComponentId 持久化检查点 | 30min | 低（新增逻辑，不影响旧路径） |
| 3 | P2 全 SFC 前缀覆盖 | 20min | 低（新增扫描范围） |
| 4 | P3 FLEX-005 自动归一化器 | 30min | 中（可能误改非冲突 flex） |
| 5 | P1 HeaderSlots 单入口过滤 | 15min | 中（改视觉 parser，需验证派生 vs corrected 差异） |
| 6 | P5 T09 回滚已注入 DOM | 20min | 低（P1-3 内扩展，不影响无重叠场景） |
| 7 | P6 重试保护 | 30min | 中（改重试逻辑，影响 retry 流程） |

---

## 四、验证标准

| 项 | 验证方法 | 通过条件 |
|-----|---------|---------|
| P0 | 同一 session 重跑 2 次 + 检查 `declare.json.meta.checkpoint.componentId` | 2 次 componentId 完全相同 |
| P0 | 检查 `common.less` 类名前缀与 `classPrefixOf(componentId)` 一致 | 全量 selector 匹配 |
| P1 | 日志 `headerSlots 契约推导完成` 数量和 `C-1 剔除` 数量之和 = `契约回写` 数量 | 无被剔除节点重新进入 |
| P2 | 所有子组件 `.vue` 文件的 template class + scoped style 均含 prefixId | grep 验证（子组件中无 bare `c-` class） |
| P3 | 含 `flex: <px> 1 0` 的 common.less → 编译后全部为 `flex: 0 0 <px>px` 或统一 ratio | lessc 编译通过 |
| P4 | `// =======...` 分隔线紧贴 `}` 的 CSS 输入 → 编译通过 | lessc 编译通过 |
| P5 | headerSlots 与子组件内容重叠 → index.vue 中无 `<template #header-right>` 残留 | grep 验证 |
| P6 | 重试时 pending error 全部为 auto-fixable → 跳过 LLM 调用 | 日志 `跳过 LLM 重试` |

---

## 五、回退策略

所有修改均满足**向后兼容**：

- P0：新增字段 `meta.checkpoint` 不影响旧 declare.json 读取（`?.` 守卫）
- P1：派生路径结果与未修改前一致（合并 filtered derived 相当于 not change）
- P2：新扫描的子组件若已正确前缀，replacement 不命中 → 零影响
- P3：现有 non-mixed flex 规则不会被正则匹配到 → 零影响
- P4：旧正则匹配范围更宽；新锚定匹配更严格（只删完整行），旧行为子集
- P5：P1-3 新增回滚步骤只在判定重叠时触发；无重叠场景行为完全不变
- P6：新增重试前检查点，仅在 pending error 全部 auto-fixable 时拦截，不影响普通重试

**紧急回滚**：若某单项引入问题，单文件单函数级 `git revert` 即可独立回退，无跨文件耦合。

---

## 六、统一性原则总结

| 旧模式 | 统一后 |
|--------|--------|
| 多处入口生成 headerSlots（vision + derived + corrected 混合） | 单入口过滤器：所有候选经 C-1/C-2 bbox 过滤后才写回 contract |
| autoFixPrefixViolations 只修 index.vue | 统一扫描所有 `.vue` 文件，template + scoped style 全部修复 |
| FLEX-005 只检测不修复 | 统一在 LESS 编译前自动归一化 |
| 确定性缺陷消耗 3 次 retry | 统一在重试前 auto-fix，跳过不必要 LLM 调用 |
| sanitiizeCssContent 正则无锚定 | 统一行锚定 + 配合 heal 新增换行 |
| T09 注入后 P1-3 不清理 | 统一在 P1-3 剔除合约时同步回滚 index.vue |

---

*2026-09-09 v1.0 — 基于 55e0f192 + 021e3cf7 双 session 后验分析*