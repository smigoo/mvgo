# Figma → Vue3 / 微码视觉生成管线优化方案

## 1. 结论

当前效果差并非单一模型能力问题，而是 4 个系统问题叠加：

1. **低可信分析继续进入自由生成**：本次视觉覆盖率仅 44%～45%，布局审查又是 `response_parse_failed / score=0 / degraded=true`，但仍被作为正常输入传给代码工程师。
2. **确定性 Figma 事实没有最高优先级**：Figma 根节点已有约 `425.83 × 807 CSS px` 的真实尺寸，背景节点的 fill 还是 `visible:false`，Vision 却推断了 `#edf4fb` 根背景，后续模型采用了错误推断。
3. **生成后缺少“设计证据”门禁**：模型添加 `background / border / border-radius / box-shadow / padding` 时，没有被要求证明它们来自哪个 Figma 节点；现有固定黑名单只能匹配少数精确字符串，本次 `#e3eef7` 和 `rgba(...,0.04)` 均漏检。
4. **状态语义混乱**：`status=completed` 与 `qualityGate=warned` 同时出现，前端把“代码生成完成”展示成“视觉通过”，造成“系统显示成功但效果很差”。

因此核心改法不是继续堆 prompt，而是建立：

> **Figma 确定性事实 → 可信度分流 → 受约束生成 → 证据式静态校验 → 尺寸/DPR 校验 → 视觉比对 → 分层状态**

---

## 2. 本次问题的完整证据链

| 问题 | 首次引入阶段 | 未被拦截原因 | 当前表现 |
|---|---|---|---|
| 宽高不是真实组件尺寸 | Figma 尺寸未形成生成契约 | 根组件仍是 `width/height:100%`；截图只看设备像素，未校验 CSS px | Figma 约 426×807，截图 880×1654（DPR=2） |
| 虚构浅蓝根背景 | Vision 分析 | 覆盖率 44% 仍放行；Vision 覆盖 Figma `visible:false` 事实 | `.traffic-monitor-root { background:#edf4fb }` |
| 虚构卡片、圆角、边框、阴影 | Vue 代码生成 | Style Mapper fallback 含 `8px` 等通用 token；无证据校验 | `.chart-item` 被套通用卡片样式 |
| 图例重复 | 图表规范/代码生成 | 没有图例渲染所有权；DOM 与 ECharts 均可自由生成 | DOM 图例 + ECharts legend 同时出现 |
| 坏视觉仍显示完成 | generate 模式质量收口 | 为避免整轮作废而降级发布，但未拆分质量状态 | `completed + qualityGate:warned` |

关键代码证据：

- `backend-node/src/ai-engine/utils/visual-trust.js:53`：`coverageRate < 60` 仅返回 warning。
- `backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js:352-360`：默认只记录覆盖率警告，必须显式环境变量才硬阻断。
- `mc-component-graph-vue3.js:630`：降级的 `reviewResult` 仍传入 engineer。
- `backend-node/src/ai-engine/validators/code-quality/ai-common-styles-detector.js:8`：检测器已存在，但未形成主图必经门禁。
- `backend-node/src/ai-engine/roles/visual-comparator.js:265`：通过条件主要依赖模型给出的相似度，缺少尺寸、DPR、重复图例等确定性检查。

---

## 3. 目标管线

```text
Figma API + 预览图
        │
        ▼
DesignFactsCompiler（确定性事实，Figma API 优先）
        │
        ├─ rootSize / fills / strokes / effects / radius
        ├─ selector ↔ Figma node 映射
        └─ chart legend owner
        │
        ▼
VisualTrustRouter（可信度分流）
        ├─ trusted：正常生成
        ├─ restricted：禁止无证据装饰，只用确定性事实
        └─ blocked：输入损坏/缺关键尺寸时停止
        │
        ▼
Engineer（Prompt 只消费可用事实，不消费污染 fallback）
        │
        ▼
确定性门禁
        ├─ DesignEvidenceValidator
        ├─ ChartOwnershipValidator
        ├─ CssSizeContractValidator
        └─ SFC / LESS / runtime gate
        │
        ▼
截图（记录 CSS px + DPR）→ 归一化 → VisualComparator
        │
        ├─ 可自动修复：最多 1～2 轮 selector/property 级修正
        └─ 不可修复：生成完成，但标记 visual_review_required
```

---

## 4. P0：先解决“凭空添加”和“低可信仍自由生成”

### P0-1 建立 `designFacts` 单一事实源

建议新增：

- `backend-node/src/ai-engine/utils/design-facts-compiler.js`
- `backend-node/src/ai-engine/types/design-facts.js`（或 JSDoc schema，避免过度引入类型层）

核心结构：

```javascript
{
  version: 1,
  root: {
    nodeId: '2:9778',
    cssSize: { width: 425.8275, height: 807 },
    source: 'figma-api'
  },
  nodes: {
    '2:9778': {
      fill: { visible: false, source: 'figma-api' },
      strokes: [],
      effects: [],
      cornerRadius: 0
    }
  },
  charts: {
    trafficDirection: {
      legend: {
        items: ['北京方向', '上海方向'],
        owner: 'dom',
        position: 'top-right'
      }
    }
  },
  provenance: {
    figmaApi: true,
    visionCoverageRate: 44,
    layoutReviewDegraded: true
  }
}
```

优先级必须固定：

1. Figma API 的尺寸、fills、strokes、effects、cornerRadius；
2. Figma 节点树与已有 DOM mapping；
3. Vision 只补语义、OCR、图表类型等 Figma API 不直接表达的信息；
4. Style Mapper fallback 只能用于代码结构兜底，**不得升级为设计事实**。

冲突规则：Vision 说“有背景”，但对应 Figma fill 为 `visible:false`，最终事实必须是“禁止背景”。

### P0-2 将视觉可信度改成三级路由，而不是 warning / hard block 二选一

修改：

- `backend-node/src/ai-engine/utils/visual-trust.js`
- `backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js`
- `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`

建议裁决：

| 条件 | verdict | 行为 |
|---|---|---|
| sourceImage 缺失、size=0 且没有有效 Figma 树；根尺寸缺失 | `blocked` | 停止，明确输入损坏 |
| coverage < 60%；或 review.degraded；或 score=0 | `restricted` | 可生成草稿，但禁用通用视觉 fallback、禁止无证据装饰 |
| coverage ≥ 60%，review 有效 | `trusted` | 正常生成 + 后置门禁 |

本次 44% + degraded 应进入 `restricted`，而不是直接失败，也不能继续自由生成。

### P0-3 升级并强制接入“设计证据式样式门禁”

现有 `AICommonStylesDetector` 不应继续只依赖固定黑名单。建议新增完整产物校验器：

- `backend-node/src/ai-engine/validators/design-evidence-validator.js`

校验范围：

- `background` / `background-color`
- `border` / `border-*`
- `border-radius`
- `box-shadow`
- `padding`（当它改变设计边界时）
- 可选：`filter`、`backdrop-filter`、伪元素装饰

规则：

1. 用 CSS/LESS AST 提取 selector + property + value；
2. 通过模板 class、`resourceDomMapping` 或新建 selector-node mapping 找对应 Figma 节点；
3. 对应节点无 fill/stroke/effect/radius 证据时，报告 `DESIGN-EVIDENCE-*`；
4. `restricted` 模式下无证据属性自动删除或进入一次确定性修复；
5. `trusted` 模式先反馈给 refiner，重试后仍存在则标记视觉不通过。

不要再用“`8px`、某几个灰色、某几个透明度”作为核心判断。设计不存在 `box-shadow` 时，任何阴影值都应被拦截。

### P0-4 图例单一所有权

修改图表分析 schema、Visual Parser prompt 与代码生成 prompt：

```javascript
legend: {
  items: ['北京方向', '上海方向'],
  owner: 'dom', // 'dom' | 'echarts' | 'none'
  position: 'top-right'
}
```

确定性生成规则：

- `owner='dom'`：生成 DOM 图例；ECharts 强制 `legend: { show:false }`。
- `owner='echarts'`：不生成 DOM 图例；ECharts 生成 legend。
- `owner='none'`：两者都不生成。

新增 `ChartOwnershipValidator`：扫描模板中的 legend DOM 标识与 ECharts option，发现双开直接修复/阻断视觉验收。

注意：当前面积图被手工设为 `legend.show=false`，但模板没有 DOM 图例，后续应依据 Figma 事实决定恢复 ECharts 图例还是明确 `owner='none'`，不能永久依赖手工修补。

### P0-5 清理 Style Mapper fallback 污染

修改：

- `backend-node/src/ai-engine/roles/style-mapper.js`

要求：

- `synthesizedFallback=true` 时，每个值必须带 `source:'fallback'`；
- fallback 不允许向 Figma 生成 prompt 输出背景、边框、圆角、阴影等视觉事实；
- 暗色 `--bg:#0f0f0f`、`--text-color:rgba(255,255,255,.9)`、`--border-radius-base:8px` 等通用值不能用于浅色 Figma 任务；
- 缺事实时输出 `unknown/null`，而不是“看起来合理”的默认值。

---

## 5. P1：尺寸、DPR 与状态语义收口

### P1-1 根尺寸契约

从 `figma.json.absoluteBoundingBox` 生成：

```javascript
expectedCssSize: {
  width: 425.8275,
  height: 807,
  tolerance: 1
}
```

职责划分：

- **预览舞台**：按真实 CSS px 建立容器；缩放只作用于外层 transform，不改变组件布局尺寸。
- **组件根节点**：通常保留 `width:100%;height:100%`，由舞台提供真实尺寸；若是独立发布组件，则把 expected size 写入 metadata，而不是盲目硬编码截图像素。
- **截图器**：记录 `getBoundingClientRect()`、viewport、deviceScaleFactor。
- **质量门禁**：实际 CSS 宽高与 expected 相差超过 1px 时失败。

本次 `440×827` 预览图与 `880×1654` 截图是严格 2 倍，说明截图 DPR=2；不能把 880×1654 当作 CSS 尺寸错误。比对前应归一化到同一逻辑尺寸。

修改重点：

- `frontend/src/views/preview/index.vue`
- 截图渲染器/preview publisher
- `backend-node/src/ai-engine/roles/visual-comparator.js`

### P1-2 Visual Comparator 增加确定性检查

在调用 Vision 相似度模型前先做：

1. CSS 尺寸契约；
2. DPR/图片尺寸比例一致性；
3. 根背景/边框/阴影的像素级存在性提示；
4. 重复图例静态结果；
5. 参考图与渲染图归一化。

最终报告拆分：

```javascript
{
  deterministic: {
    sizePassed: true,
    evidencePassed: false,
    chartOwnershipPassed: true
  },
  visual: {
    overallSimilarity: 82,
    modelValid: true
  },
  pass: false
}
```

Vision 相似度解析失败时不能返回“安全通过”；应返回 `modelValid:false`，但不覆盖确定性检查结果。

### P1-3 质量状态分层

后端任务状态建议拆分：

```javascript
{
  generationStatus: 'completed',
  runtimeStatus: 'passed',
  visualStatus: 'review_required',
  publishStatus: 'draft',
  qualityIssues: [...]
}
```

前端展示：

- “代码已生成” ≠ “视觉已通过”；
- `qualityGate=warned` 时显示“已生成草稿，待视觉复核”；
- 只有 runtime + deterministic visual gates + similarity 达标才显示“可发布”。

这样保留 generate 模式不中断成果的优点，又不会把差产物包装成成功。

---

## 6. P2：自动修复闭环与可观测性

### P2-1 最多 1～2 轮属性级自动修复

输入必须是确定性 issue，而非宽泛的“请更还原”：

```javascript
{
  selector: '.chart-item',
  remove: ['background', 'border', 'border-radius', 'box-shadow', 'padding'],
  reason: 'no-figma-evidence',
  figmaNodeId: null
}
```

修复后重新跑：SFC/LESS → evidence gate → runtime → screenshot → comparator。

### P2-2 保存最终 Engineer prompt/response

当前只保存了 Visual Parser 的 debug prompt/response，无法精确审计后续哪条 prompt 诱导了卡片样式。应按 agent/chunk 保存：

```text
.mc-gen/cache/engineer/
  main-template.prompt.txt
  main-template.response.txt
  style.prompt.txt
  style.response.txt
  refine-1.prompt.txt
  refine-1.response.txt
```

敏感配置必须脱敏；记录 providerId/model/finishReason/input/output token 与 trust verdict。

### P2-3 建立视觉回归样本

至少沉淀 5 类历史失败件：

1. 无背景/无卡片的图表面板；
2. 有 DOM 图例的 ECharts；
3. 由 ECharts 自带图例的图表；
4. DPR=2 截图但 CSS 尺寸正确；
5. 低覆盖率 + 布局审查 degraded。

每次改图或 validator 后跑固定样本，避免稳定性修复反过来降低视觉质量。

---

## 7. 推荐实施顺序

### 第一批（P0，优先落地）

1. `designFacts` 编译器与 Figma/Vision 冲突优先级；
2. visual trust 三级路由；
3. Style Mapper fallback 隔离；
4. `legend.owner` + 重复图例校验；
5. DesignEvidenceValidator 先以 warn + 自动修复运行，不立即全模式 fail-closed；
6. 构建并用本次 `c-lljc-test` 历史产物回放验证。

### 第二批（P1）

1. expectedCssSize + DPR 记录；
2. comparator 归一化与确定性报告；
3. 后端/前端质量状态分层。

### 第三批（P2）

1. 属性级自动修复闭环；
2. Engineer prompt/response 可观测性；
3. 视觉回归样本集。

不建议一次性把所有问题改成 hard block。第一批应先“受限生成 + 草稿状态 + 可诊断”，观察误报后再逐步提高阻断等级。

---

## 8. 验收标准

| 维度 | 验收指标 |
|---|---|
| 尺寸 | `getBoundingClientRect()` 与 Figma 根尺寸误差 ≤ 1 CSS px |
| DPR | 截图报告明确记录 DPR；比对前统一逻辑尺寸 |
| 虚构装饰 | 无 Figma 证据的 background/border/radius/shadow 数量 = 0 |
| 图例 | 每个图表只有一个 owner；DOM + ECharts 双开数量 = 0 |
| 低可信分流 | coverage < 60 或 review degraded 时必为 restricted，不使用视觉 fallback |
| 状态语义 | `generation completed` 不再自动等于 `visual passed/publishable` |
| 自动修复 | 可确定修复问题最多 2 轮收敛；不无限重试 |
| 稳定性 | 单个视觉问题不作废全部成果，仍可保留 draft 与完整诊断 |
| 回归 | Vue3 与 Phase2 两张图行为一致；历史 5 类失败样本全部通过预期断言 |

---

## 9. 本轮边界

本轮完成的是根因审查和实施方案，**尚未修改生成管线源码，也未构建或重启服务**。当前单组件中的卡片装饰和重复图例已手工处理，但面积图图例所有权、真实尺寸契约仍需由上述管线改造统一解决。