# 模型配置重构方案（模型库 + 槽位绑定）

> 需求：模型配置改为「一次添加 N 个模型（最少 1 个、上不封顶）」，仍分「统一大模型 / 分类」两种模式，统一/文本/视觉槽位从模型库中选，且每个槽位可挂「模型池」。

## 一、现状痛点

| # | 痛点 | 现状 |
|---|---|---|
| 1 | 两套割裂配置 | 主模型是 `unified/text/vision` 三组固定字段，供应商池是 `providers` 数组，同一模型两处各填一遍 |
| 2 | 池是二等公民 | 供应商池折叠在「高级·可选」里，与主模型层级不对等 |
| 3 | 主池靠手动对齐 | `promoteProviderToPrimary`（设为主模型）本质是把池里某条"提升"成主，靠按钮同步 |
| 4 | 表达力不足 | "一个模型 = 一把 key" 一对一，无法直观表达同模型多 key |

## 二、目标信息架构

```
模型库（N 个模型条目，最少 1 个）
        │
        ├── 统一大模型 ──→ 统一槽位：选主模型 + 可选模型池
        └── 分类配置 ────→ 文本槽位：选主模型 + 可选模型池
                          视觉槽位：选主模型 + 可选模型池
```

## 三、数据模型（确定版）

```ts
// ① 模型库（一等公民）
models: Array<{
  id: string                 // uuid，稳定引用
  name: string               // 显示名，如 "kimi-k2" / "glm-5V 主"
  apiKey: string
  baseURL: string
  model: string              // 模型名，区分大小写
  providerType: 'openai-compatible' | 'anthropic' | 'auto'
  capability: 'both' | 'text' | 'vision'   // 能力标记，驱动槽位候选过滤
  temperature?: number
  rpm?: number               // 请求/分，0=不限
  tpm?: number               // Token/分，0=不限
  weight?: number            // 池内权重
}>

// ② 模式 + 槽位绑定（引用模型库 id）
modelMode: 'unified' | 'separate'
unified?: { primaryId: string; poolIds: string[] }   // 统一模式
text?:    { primaryId: string; poolIds: string[] }   // 分类模式
vision?:  { primaryId: string; poolIds: string[] }   // 分类模式
```

**池语义（已确认）**：`poolIds` 为模型库子集；`primaryId` 自动是池成员（主模型优先，池内其余按权重轮询 + 熔断故障转移）。

## 四、交互设计

### 1. 模型库区（顶部，一等公民）
- 卡片列表，每条显示：名称、model 名、capability 徽章（文本/视觉/通用）、协议
- 卡片可展开编辑：名称 / Base URL / API Key / Model / 协议 / 能力 / 温度 / RPM / TPM / 权重
- 「+ 添加模型」追加；删除时仅剩 1 条则禁用删除按钮
- 删除被槽位引用的模型 → 弹警告，确认后自动清该槽位引用（置空或回退首条）

### 2. 模式选择（中部）
- 「统一大模型」/「分类配置」两个 toggle，沿用现有 `switchMode`

### 3. 槽位绑定（下部，随模式切换）
| 模式 | 槽位 | 主模型候选（capability 过滤） |
|---|---|---|
| 统一 | 统一槽位 | `both` / `vision`（须支持视觉） |
| 分类 | 文本槽位 | `text` / `both` |
| 分类 | 视觉槽位 | `vision` / `both` |

每个槽位卡内部：
- 「主模型」下拉（单选，必选，按 capability 过滤候选）
- 「模型池」多选勾选（可空 = 只用主模型；勾选即把主模型 + 勾选项组成池）

统一模式下保留现有提示：「所选模型须支持视觉，否则 Preview 阶段会失败」。

## 五、后端改造点

1. **`config.service.ts`**
   - zod schema 增加 `models[]` + `unified/text/vision` 绑定对象
   - 保留 legacy 字段（`unifiedApiKey` 等）作向下兼容
   - 新增两个转换函数：
     - `resolveBindingToLegacy(merged)`：新 → 旧，供下游生成链路消费（下游仍读 role 字段）
     - `migrateLegacyToModels(merged)`：旧 → 新，供前端读取

2. **`provider-pool.js`**：基本不改。`setProviders(providers, cfg, { role, primaryId })` 已支持 text/vision 分槽 + 主模型 + 加权轮询 + 熔断。

3. **`component.controller.ts` / 其余消费方**：无需改动（继续读 legacy 字段）。

## 六、自动迁移逻辑（旧 → 新）

读取时若后端无 `models` 字段、仅有 legacy，则按模式转换：

| 旧配置形态 | 迁移动作 |
|---|---|
| `modelMode='unified'` | `unified*` 建 1 条模型（`capability='both'`）；`providers` 转其余模型条目；绑定 `unified.primaryId = 主条目` |
| `modelMode='separate'` | `vision*` 建视觉模型、`text*` 建文本模型；`providers` 按 `role` 归入对应槽位池 |

**边界情况**：
- `providers` 中 `role='both'` 的条目，同时归入文本池和视觉池（与现有 `setProviders` 行为一致）
- `providers` 为空 → 迁移后池为空（等价单模型）

## 七、分阶段实施计划

| 阶段 | 内容 | 验证 |
|---|---|---|
| P1 数据层 | 后端 schema + 两个转换函数 + 单测 | `npm run build` + 转换单测 |
| P2 前端 UI | 模型库卡片增删改 + 槽位绑定 + 池勾选 | `vue-tsc` + 手测四种形态 |
| P3 联调 | 保存/读取 + 旧配置自动迁移 | 旧配置导入后 UI 正确回显 |
| P4 回归 | 统一/分类/池/迁移四场景 + 生成链路回归 | 端到端生成一次 |

## 八、风险清单

1. **capability 标记失准**：用户把纯文本模型标成 `both`，统一模式会失败 → 保留统一模式的视觉提示。
2. **删除引用完整性**：删被引用模型须清引用，避免悬空 `primaryId`。
3. **迁移幂等**：迁移函数须幂等，避免重复加载重复建条目（以 `id` 稳定去重）。
4. **旧字段漂移**：legacy 字段仍被下游消费，`resolveBindingToLegacy` 必须覆盖 `unified/text/vision` 三组全部字段，避免"UI 显示 A、生成走 B"。

## 九、影响面评估（基于代码证据，2026-08-25 复核）

消费链路：`getMergedAiConfig(userId)` → `resolveVisionConfig/resolveTextConfig`（只读 `modelMode + unified*/text*/vision* + providers[]`）→ `resolveProvider`（读 `config.providers`）→ `provider-pool.setProviders/pick`。下游 7 条管线（Phase2 / Vue3 / Lite / v2 / 编排器 / 页面生成器 / Playground）全部走这条链，不认识 `models[]`/`binding`。

**关键注意点（实施时必须守住）**：

| # | 注意点 | 说明 | 对策 |
|---|---|---|---|
| 1 | **configSnapshot 快照结构** | 任务创建快照配置（`tasks.service.ts:999`）；若快照存新结构，任务重跑 `resolveTextConfig(快照)` 拿不到 legacy 字段 → 解析失败 | 快照必须存**降维后**的旧结构 |
| 2 | **zod schema 向后兼容** | `AI_CONFIG_SCHEMA` 加 `models[]`/`binding` 必须 `.optional()`，legacy 字段保留 `.optional()`，否则旧前端/旧 payload 校验报错 | 新老字段全 optional |
| 3 | **一处独立实现** | `component-analysis.service.ts:173` 有独立 `resolveVisionConfig`（不走全局 config，直接读请求体） | 只要 legacy 字段保留就不受影响，需回归验证 |

**安全**：`redactSecrets`（`common/utils/redact.ts`）递归正则匹配 `/apikey/i`，`models[].apiKey` 会被自动脱敏，无新增泄露风险。
