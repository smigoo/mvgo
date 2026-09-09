# 微码组件/Vue3组件生成管线节点整理（基于实际代码）

> **数据来源**：直接从源代码提取，非文档推断
> 
> - `/backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js` (微码管线)
> - `/backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js` (Vue3管线)

---

## 一、管线概览

两条管线（微码与Vue3）共享**高度一致的节点结构**，主要差异：

| 维度 | 微码管线 | Vue3管线 |
|------|---------|----------|
| **节点总数** | 22个 | 19个 |
| **代码生成器** | MicrocodeEngineer | Vue3Engineer |
| **产物协议** | declare.json + component.js + package/ | 标准SFC |
| **独有节点** | l0b-fail, parallel-quality-check, screenshot-renderer, visual-comparator | runtime-preview-gate |

核心运行模式：
- `generate`（默认）：代码生成+L0校验，写完即停
- `minimal`：添加基础精修
- `full`：完整质量闭环（最多3轮修订）
- `off`：最小化

---

## 二、完整节点清单（从代码提取）

### 2.1 两条管线的节点对比

#### 共享节点（18个）
```
1. init                          - 初始化
2. figma-connector               - Figma数据获取
3. visual-parser                 - 视觉分析
4. preview-validator             - L0-A预览校验
5. parallel-analysis             - 并行分析
6. subcomponent-planner          - 子组件规划
7. microcode-engineer            - 代码生成（注意：两边都叫这个名字，但用不同Engineer）
8. code-structure-validator      - L0-B代码结构校验
9. do-not-invent-check          - 禁止臆造校验
10. generate-runtime-verify      - generate模式运行时校验
11. complete                     - 完成节点
12. parallel-refine              - 并行精修
13. refine-feedback              - L1同伴评审
14. style-refiner                - 样式精修
15. adversarial-checker          - 对抗检查
16. revision-decision            - L2智能路由
17. layout-refiner-legacy        - 串行布局精修（兼容）
18. style-refiner-legacy         - 串行样式精修（兼容）
```

#### 微码独有节点（4个）
```
1. l0b-fail                      - L0-B失败终态
2. parallel-quality-check        - 并行质量检查
3. screenshot-renderer           - 截图渲染
4. visual-comparator             - 视觉比对
```

#### Vue3独有节点（1个）
```
1. runtime-preview-gate          - 运行时预览门禁
```

### 2.2 节点详细说明表

| 节点名称 | 作用 | 微码 | Vue3 | 执行时机 |
|---------|------|------|------|----------|
| **init** | 初始化会话、解析v3Mode、加载自优化建议 | ✅ | ✅ | 入口，必执行 |
| **figma-connector** | 获取Figma节点数据和资源 | ✅ | ✅ | 紧随init |
| **visual-parser** | 视觉分析：布局结构、样式、组件层次 | ✅ | ✅ | figma数据之后 |
| **preview-validator** | L0-A预览分析校验 | ✅ | ✅ | 视觉分析后（可选，看v3Mode） |
| **parallel-analysis** | 并行分析：布局审查+样式映射 | ✅ | ✅ | L0-A后或直接在visual-parser后 |
| **subcomponent-planner** | 子组件拆分规划（零LLM） | ✅ | ✅ | parallel-analysis后 |
| **microcode-engineer** | 代码生成核心（两边实现不同） | ✅ | ✅ | 规划后，可能重试 |
| **code-structure-validator** | L0-B代码结构校验 | ✅ | ✅ | engineer后，可能触发重试 |
| **do-not-invent-check** | 禁止臆造硬门禁 | ✅ | ✅ | generate模式专属 |
| **generate-runtime-verify** | 运行时质量门禁 | ✅ | ✅ | generate模式专属 |
| **complete** | 完成，输出最终结果 | ✅ | ✅ | 终态节点 |
| **parallel-refine** | 并行精修（布局+样式） | ✅ | ✅ | full模式，L0-B后或L2路由 |
| **layout-refiner-legacy** | 串行布局精修 | ✅ | ✅ | minimal/off模式 |
| **style-refiner-legacy** | 串行样式精修 | ✅ | ✅ | minimal/off模式 |
| **style-refiner** | 样式精修 | ✅ | ✅ | full模式L2路由目标 |
| **refine-feedback** | L1同伴评审 | ✅ | ✅ | full模式，parallel-refine后 |
| **adversarial-checker** | 对抗检查 | ✅ | ✅ | 精修后或legacy refiner后 |
| **parallel-quality-check** | 并行质量检查 | ✅ | ❌ | 微码专属，adversarial后 |
| **screenshot-renderer** | 渲染组件截图 | ✅ | ❌ | 微码专属，quality-check后 |
| **visual-comparator** | 视觉比对 | ✅ | ❌ | 微码专属，screenshot后 |
| **runtime-preview-gate** | 运行时预览门禁 | ❌ | ✅ | Vue3专属，adversarial后 |
| **revision-decision** | L2智能路由 | ✅ | ✅ | 质量检查后，决定下一步 |
| **l0b-fail** | L0-B失败终态 | ✅ | ❌ | 微码专属，L0-B重试耗尽 |

---

## 三、边与路由规则（从代码提取）

### 3.1 微码管线边定义

#### 固定边（无条件）
```javascript
init → figma-connector
figma-connector → visual-parser
parallel-analysis → subcomponent-planner
subcomponent-planner → microcode-engineer
do-not-invent-check → generate-runtime-verify
generate-runtime-verify → complete
refine-feedback → adversarial-checker
adversarial-checker → parallel-quality-check
parallel-quality-check → screenshot-renderer
screenshot-renderer → visual-comparator
visual-comparator → revision-decision
style-refiner → adversarial-checker
layout-refiner-legacy → style-refiner-legacy
style-refiner-legacy → adversarial-checker
```

#### 条件边

**1. visual-parser 条件分流**
```javascript
visual-parser → (state) => {
  const mode = state._v3Mode || 'generate'
  return isFeatureEnabled(mode, 'l0-preview') 
    ? 'preview-validator'   // minimal/full模式
    : 'parallel-analysis'   // generate/off模式，跳过L0-A
}
```

**2. preview-validator 条件分流（L0-A重试）**
```javascript
preview-validator → (state) => {
  const r = state.validationResult
  const maxRetry = state._v3Config?.l0MaxRetry || 1
  
  if (r.pass) return 'parallel-analysis'
  if ((state.validatorRetryCount || 0) <= maxRetry && state.retryGuidance) 
    return 'visual-parser'  // 重试
  return 'parallel-analysis'  // 重试耗尽，带warning继续
}
```

**3. microcode-engineer 条件分流（语义重试）**
```javascript
microcode-engineer → (state) => {
  if (state._semanticRetried && !state._semanticRetryConsumed) {
    state._semanticRetryConsumed = true
    return 'microcode-engineer'  // 语义失败重试
  }
  return 'code-structure-validator'
}
```

**4. code-structure-validator 条件分流（L0-B重试 + 模式路由）**
```javascript
code-structure-validator → (state) => {
  const r = state.codeValidationResult
  const maxRetry = state._v3Config?.l0MaxRetry ?? 1
  const retryCount = state.codeValidatorRetryCount || 0

  // BLOCK且未bypass
  if (!r.pass && !r._bypassed) {
    if (retryCount <= maxRetry) {
      return 'microcode-engineer'  // 重试
    }
    return 'l0b-fail'  // 重试耗尽，fail-closed
  }

  const mode = state._v3Mode || 'generate'
  if (mode === 'generate') {
    // 结构顺序门禁
    const gate = state._structureOrderResult
    if (gate?.detected && !state._structureOrderRetried) {
      return 'microcode-engineer'  // 结构顺序重试
    }
    return 'do-not-invent-check'  // generate模式路径
  }

  // minimal/full模式精修路径
  return isFeatureEnabled(mode, 'parallel-refine') 
    ? 'parallel-refine' 
    : 'layout-refiner-legacy'
}
```

**5. parallel-refine 条件分流（L1启用）**
```javascript
parallel-refine → (state) => {
  const mode = state._v3Mode || 'generate'
  return isFeatureEnabled(mode, 'l1-feedback') 
    ? 'refine-feedback'      // full模式，有L1
    : 'adversarial-checker'  // minimal模式，跳过L1
}
```

**6. revision-decision 条件分流（L2智能路由）**
```javascript
revision-decision → (state) => {
  if (!state.needsRevision) return 'complete'

  const mode = state._v3Mode || 'generate'

  // minimal/off模式：binary决策
  if (!isFeatureEnabled(mode, 'l2-routing')) {
    return 'microcode-engineer'
  }

  // full模式：4路智能路由
  let target = 'microcode-engineer'
  switch (state._reviseTarget) {
    case 'stylistic':
      target = 'style-refiner'; break
    case 'layout':
      target = 'parallel-refine'; break
    default:
      target = 'microcode-engineer'
  }
  return target
}
```

### 3.2 Vue3管线边定义

#### 固定边
```javascript
init → figma-connector
figma-connector → visual-parser
parallel-analysis → subcomponent-planner
subcomponent-planner → microcode-engineer
microcode-engineer → code-structure-validator  // 注意：Vue3没有语义重试条件边
do-not-invent-check → generate-runtime-verify
generate-runtime-verify → complete
refine-feedback → adversarial-checker
adversarial-checker → runtime-preview-gate     // Vue3专属节点
runtime-preview-gate → revision-decision
style-refiner → adversarial-checker
layout-refiner-legacy → style-refiner-legacy
style-refiner-legacy → adversarial-checker
```

#### 条件边

Vue3的条件边与微码**基本一致**，主要差异：

1. **microcode-engineer** → 直接到 `code-structure-validator`，**没有语义重试条件边**
2. **adversarial-checker** → `runtime-preview-gate` （微码是 → `parallel-quality-check`）
3. **没有 screenshot-renderer 和 visual-comparator**

---

## 四、关键路径对比

### 4.1 generate模式路径（默认）

**微码：**
```
init → figma-connector → visual-parser → parallel-analysis 
  → subcomponent-planner → microcode-engineer → code-structure-validator 
  → do-not-invent-check → generate-runtime-verify → complete
```

**Vue3：**
```
init → figma-connector → visual-parser → parallel-analysis 
  → subcomponent-planner → microcode-engineer → code-structure-validator 
  → do-not-invent-check → generate-runtime-verify → complete
```

**完全一致**（微码有语义重试边，但不影响正常路径）

### 4.2 full模式路径（完整闭环）

**微码：**
```
... → code-structure-validator → parallel-refine → refine-feedback 
  → adversarial-checker → parallel-quality-check → screenshot-renderer 
  → visual-comparator → revision-decision 
  → [需要修订] → (4路路由) → ... (循环最多3次)
  → [不需要修订] → complete
```

**Vue3：**
```
... → code-structure-validator → parallel-refine → refine-feedback 
  → adversarial-checker → runtime-preview-gate → revision-decision 
  → [需要修订] → (4路路由) → ... (循环最多3次)
  → [不需要修订] → complete
```

**差异：**
- 微码：`adversarial-checker → parallel-quality-check → screenshot-renderer → visual-comparator → revision-decision`
- Vue3：`adversarial-checker → runtime-preview-gate → revision-decision`

### 4.3 minimal模式路径（串行精修）

**两边完全一致：**
```
... → code-structure-validator → layout-refiner-legacy → style-refiner-legacy 
  → adversarial-checker → revision-decision 
  → [需要修订] → microcode-engineer (binary决策)
  → [不需要修订] → complete
```

---

## 五、模式对应的功能启用表

| v3Mode | l0-preview | parallel-refine | l1-feedback | l2-routing |
|--------|-----------|----------------|-------------|-----------|
| `off` | ❌ | ❌ | ❌ | ❌ |
| `generate` | ❌ | ❌ | ❌ | ❌ |
| `minimal` | ✅ | ❌ | ❌ | ❌ |
| `full` | ✅ | ✅ | ✅ | ✅ |

说明：
- `l0-preview`：启用preview-validator（L0-A）
- `parallel-refine`：并行精修（否则走legacy串行）
- `l1-feedback`：refine-feedback同伴评审
- `l2-routing`：4路智能路由（否则binary决策）

---

## 六、图形化展示

### 6.1 generate模式完整路径

```
     ┌─────┐
     │init │
     └──┬──┘
        │
   ┌────▼────────┐
   │figma-       │
   │ connector   │
   └────┬────────┘
        │
   ┌────▼────────┐
   │visual-      │
   │ parser      │
   └────┬────────┘
        │
   ┌────▼────────┐
   │parallel-    │
   │ analysis    │
   └────┬────────┘
        │
   ┌────▼────────────┐
   │subcomponent-    │
   │ planner         │
   └────┬────────────┘
        │
   ┌────▼────────────┐
   │microcode-       │◄──┐ 语义重试（微码）
   │ engineer        │   │ L0-B重试
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │code-structure-  │───┘
   │ validator       │
   └────┬────────────┘
        │
   ┌────▼────────────┐
   │do-not-invent-   │
   │ check           │
   └────┬────────────┘
        │
   ┌────▼────────────┐
   │generate-runtime-│
   │ verify          │
   └────┬────────────┘
        │
   ┌────▼────────┐
   │ complete    │
   └─────────────┘
```

### 6.2 full模式完整路径（微码）

```
... code-structure-validator
        │
   ┌────▼────────────┐
   │parallel-refine  │◄──┐
   └────┬────────────┘   │
        │                │ L2路由
   ┌────▼────────────┐   │ layout
   │refine-feedback  │   │
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │adversarial-     │◄──┤
   │ checker         │   │
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │parallel-quality-│   │
   │ check           │   │
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │screenshot-      │   │
   │ renderer        │   │
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │visual-          │   │
   │ comparator      │   │
   └────┬────────────┘   │
        │                │
   ┌────▼────────────┐   │
   │revision-        │───┤
   │ decision        │   │
   └────┬─────┬──────┘   │
        │     │          │
     完成│     │需要修订  │
        │     │          │
        │  ┌──▼──────────┴──┐
        │  │ 4路智能路由:    │
        │  │ - stylistic    │───> style-refiner ───┐
        │  │ - layout       │───> parallel-refine   │
        │  │ - full         │───┐                   │
        │  │ - structural   │   │                   │
        │  └────────────────┘   │                   │
        │                       │                   │
        │            ┌──────────▼───────────┐       │
        │            │microcode-engineer    │       │
        │            └──────────┬───────────┘       │
        │                       │                   │
        │            ┌──────────▼───────────┐       │
        │            │code-structure-       │       │
        │            │ validator            │       │
        │            └──────────┬───────────┘       │
        │                       │                   │
        │                       └───────────────────┘
        │                            (回到adversarial-checker)
        │
   ┌────▼────────┐
   │ complete    │
   └─────────────┘
```

### 6.3 full模式完整路径（Vue3）

与微码的唯一差异：
```
adversarial-checker 
  → runtime-preview-gate     (Vue3专属，替代微码的quality-check链)
  → revision-decision
```

---

## 七、节点命名问题

### 问题：microcode-engineer节点名污染

**现状：**
- 两条管线都使用 `microcode-engineer` 作为节点名
- 但实际实现不同：
  - 微码管线：使用 `MicrocodeEngineer`
  - Vue3管线：使用 `Vue3Engineer`

**建议：**
- 节点名应中性化为 `engineer` 或 `code-generator`
- 或明确区分：`microcode-engineer` vs `vue3-engineer`

**代码位置：**
- 微码：`mc-component-graph-phase2.js:777`
- Vue3：`mc-component-graph-vue3.js:551`

---

## 八、关键发现

### 8.1 两条管线的一致性

✅ **高度一致**：18个共享节点，核心流程完全相同
✅ **条件路由一致**：L0-A、L0-B、L2的路由逻辑基本相同
✅ **模式切换一致**：generate/minimal/full三种模式行为对齐

### 8.2 差异点

| 维度 | 微码 | Vue3 |
|------|------|------|
| **质量检查链** | parallel-quality-check → screenshot-renderer → visual-comparator | runtime-preview-gate |
| **L0-B重试** | 有语义重试条件边 | 无语义重试 |
| **失败终态** | l0b-fail节点 | 无专门节点 |
| **视觉闭环** | 完整的截图+比对流程 | 简化的运行时门禁 |

### 8.3 架构建议

1. **共享基础设施**：Graph执行器、ExecutionControl、CheckpointService
2. **统一接口，独立实现**：Engineer、Validator、Refiner
3. **质量检查插件化**：parallel-quality-check、visual-comparator作为可选能力
4. **节点名中性化**：`microcode-engineer` → `engineer`

---

## 九、参考代码位置

- 微码管线：`backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
  - 总行数：~3800行
  - 节点定义：206-3387行
  - 边定义：3017-3387行

- Vue3管线：`backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js`
  - 总行数：~2900行
  - 节点定义：113-2480行
  - 边定义：2487-2847行

- Graph基础类：`backend-node/src/ai-engine/graphs/graph.js`
- 特性开关：`backend-node/src/ai-engine/config/v3-mode-features.js`

---

**文档生成时间**: 2026-08-28  
**管线版本**: v3.0  
**节点总数**: 微码22个，Vue3 19个，共享18个
