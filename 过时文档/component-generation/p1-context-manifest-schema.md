# P1-A Context Manifest 设计（契约化按需上下文）

> 目标：把「每个分块重复携带大段固定规范 + 全量业务上下文」改为「按分块类型声明所需契约，只注入必要内容」。
> 与 P0-C 精简重试、P1-B 输入预算硬门禁协同，共同压缩输入 Token 35%–50%。

## 一、核心概念

每个分块（chunk）在构建 Prompt 前先声明一份 **Context Manifest**，描述它需要什么、不需要什么：

```json
{
  "target": "script",
  "required": ["runtime-contract", "template-contract", "events", "bindings"],
  "optional": ["charts", "requirement-business", "subcomponent-boundary"],
  "excluded": ["figma-raw-tree", "less-naming", "declare-schema", "style-guide"]
}
```

组装器按 Manifest 从**上下文注册表**取件，而非手拼全量字符串。超出预算时由 P1-B 门禁按降级链收敛。

## 二、四类分块契约定义

### 1. template 块
| 维度 | 内容 |
|---|---|
| required | 布局树摘要、文本→资源映射、class 命名约束、子组件边界、事件名清单 |
| optional | 面板类型（panelKey）、header 插槽 |
| excluded | 事件实现、完整 script、样式规范、declare schema |

### 2. script 块
| 维度 | 内容 |
|---|---|
| required | runtime-contract（$mcComponentBuilder/runtimeBuilder 约定）、template-contract、events、models、components、bindings |
| optional | charts（ECharts init 契约）、requirement-business |
| excluded | 完整 template 源码、less 规范、declare schema |

script 契约示例：

```json
{
  "refs": ["chartRef", "tableRef"],
  "events": ["change", "rowClick"],
  "models": ["filters", "dateRange"],
  "components": ["MonitorStats"],
  "bindings": ["tableData", "columns"]
}
```

### 3. subcomponent 块
| 维度 | 内容 |
|---|---|
| required | 当前子组件对应 section、props/emits 契约、父组件 import 名、相关资源 |
| optional | 当前子组件视觉映射 |
| excluded | 完整 package/index.vue（当前每块都重复携带，是最大浪费点） |

### 4. style 块
| 维度 | 内容 |
|---|---|
| required | class 清单、DOM 父子关系、Ant/ECharts 使用清单、elementStyleMap 对应条目、主题与尺寸 |
| optional | Ant Table 暗色覆盖模板 |
| excluded | 所有 Vue 文件前 8000 字（当前 `_collectVueContextFiles` 的膨胀源） |

## 三、上下文注册表

| key | 来源 | 稳定/动态 |
|---|---|---|
| runtime-contract | 固定模板（$mcComponentBuilder 约定） | 稳定 |
| template-contract | 上一步生成的 template 结构化契约 | 动态 |
| events/bindings/models/components | 从 template 契约提取 | 动态 |
| requirement-business | doc-analysis.json | 动态 |
| charts | 固定 ECharts init/ResizeObserver 契约 | 稳定 |
| style-guide / less-naming / declare-schema | references/*.md | 稳定 |

## 四、降级链（与 P1-B 门禁联动）

超过预算时按序执行：

1. 去掉调试说明、历史说明、重复段落；
2. 全文改结构化摘要（保留关键段，删冗余规范段）；
3. 只保留目标 section；
4. 仍超限 → 重新拆块，**不允许直接发送超长输入**。

## 五、验收指标

- [ ] 每个分块只注入 Manifest 声明的上下文；
- [ ] script/template 块不再携带完整对方源码；
- [ ] 子组件块不再携带完整 index.vue；
- [ ] 输入 Token 较当前降低 ≥ 35%，质量通过率不下降；
- [ ] 单测覆盖：Manifest 解析、注册表取件、预算降级链、幂等。

## 六、实施顺序与风险

1. 先落地 **ContextRegistry + Manifest 解析器**（纯函数 + 单测）；
2. 逐个分块接入（template → script → subcomponent → style），每接一块跑单测 + 构建 + 一个真实分块重放；
3. 最后与 P1-B 门禁联动。

风险：契约口径不一致会导致跨块变量名/事件名漂移。缓解：契约 schema 先评审、每块接入后做「跨文件一致性校验」（已有 `_validateCrossFileConsistency` 可复用）。

## 七、与既有代码的关系

- 复用：`_trimSharedForFileType`（type-aware 裁剪）、`_buildDocDesignBlock`（业务设计块）、`_validateCrossFileConsistency`、`resolveResourceDomMapping`。
- 废弃/收敛：`getOptimizedConstraints` / `buildCompressedPrompt`（未接入的死代码）应并入本设计，避免两套机制并存。
- 保留：P0-C `buildRetryPrompt`、P1-B `enforceInputBudget` 作为本设计的下游消费方。
