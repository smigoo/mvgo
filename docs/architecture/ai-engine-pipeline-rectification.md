# ai-engine 生成管线整改方案

> 目标：通用（各类型组件）、无硬编码、高还原度、高效率
> 依据：2026-08-28/29 连续 6 类生成失败 + 代码盘点实证

## 一、现状问题（排查实证）

### 1. 三个核心矛盾（单一事实源缺失）

| # | 矛盾 | 证据 |
|---|---|---|
| 1 | **资源变量双命名**：每个资源同时有 `assignedVarName`(bg1) + `semanticVarName`(bgm) | figma-connector.js 2226 分配编号名、2030 分配语义名 |
| 2 | **两套资源校验口径分裂**：归属校验(BLOCK)只认 assignedVarName，L0-B(WARN)认两者 | resource-attribution-validator.js:117 vs code-structure-validator.js:16-17 → 模型用 `bgm` 被一处判"已用"、一处判"未用" |
| 3 | **尾部垃圾剥离 5 层重叠**：stripLlmTailGarbage / _stripTrailingGarbageAfterLastBlock / _stripInterBlockProse / CONTEXT-LEAK / sanitizeStyleFenceLeak，规则各不同 | 同一污染被 5 处用不同边界处理 |
| 4 | **子组件命名三阶段不一致**：planner 规划名 / index.vue 引用名 / 子组件实际文件名三者各自脑补 | mc-max-1787936480802 实锤：index.vue `import DeviceGrid`，实际生成 `HeaderStats.vue` → DeviceGrid 缺失(预览404) + HeaderStats 孤儿 |

**矛盾 4 详解（子组件命名缺乏单一事实源）**

生成链路里「子组件叫什么名」在三个地方各自决定、互不对齐：
1. planner 规划 section → 给子组件定一个名（如 DeviceGrid）
2. index.vue 生成：模型在模板里写 `<DeviceGrid />`（脑补，参考 planner 或视觉）
3. 子组件生成：模型生成了 `HeaderStats.vue`（另一个脑补名）

结果：`DeviceGrid.vue` 不存在（import 悬空 → 预览「找不到文件」404）+ `HeaderStats.vue` 是孤儿（生成未用）。

现有补救（`_pruneDanglingSubComponentImports` 剥悬空 import / `_pruneOrphanSubComponents` 剔孤儿）是**事后补救**，无论哪种补救，视觉上都必然缺一块（剥了 import 就少一个 section，剔了孤儿就白生成）。根子在「名字没有唯一来源」。

### 2. 两个重复点

- **资源未使用校验两套**：`validateResourceAttribution`(generateCode 内 BLOCK) + `RESOURCE-001`(L0-B WARN)
- **重试双轨**：统一 `_pendingRetry` + 旧式 `_semanticRetried/_resourceRetried`（置位双写，消费需同步清）

### 3. 硬编码清单

| 位置 | 硬编码 | 治理 |
|---|---|---|
| `_clampOversizeMinHeight` | `rootH * 0.85`、`rootH >= 600` | 改为配置 + 用 vision 真值计算 |
| `figma-connector` | `DECORATION_MAX_SIZE = 12` | 抽到 config |
| `microcode-engineer` | `180s` 超时、`1200000` 预算默认值 | 已有 env 回退，收敛到统一 config |

### 4. 通用性缺口

`stripLlmTailGarbage` / `code-fix-pipeline` 目前**只被微码引擎（microcode-engineer）引用**，Vue3 引擎（vue3-engineer）未接入——确定性修复是微码单边的，Vue3 路径仍裸奔。

## 二、目标架构（三层 + 单一事实源）

```
            ┌─────────────────────────────────────────────┐
            │  LLM 生成（微码/Vue3/Lite/Max 四引擎共享下游） │
            └─────────────────────────────────────────────┘
                              ↓
            ┌─────────────────────────────────────────────┐
            │  N 净化层（唯一入口：stripLlmTailGarbage）      │
            │  · 尾部围栏/说明文字剥离 · 结构闭合截断         │
            │  · 解析/恢复/快照/门禁 四条路径全过此入口       │
            └─────────────────────────────────────────────┘
                              ↓
            ┌─────────────────────────────────────────────┐
            │  F 修复层（唯一调度：code-fix-pipeline）       │
            │  · 主题解包 · CSS替代替换 · min-height clamp   │
            │  · 资源挂载(sub-state/区域) · 双c前缀坍缩 …    │
            │  · 全部规则幂等、单一调度、统一开关             │
            └─────────────────────────────────────────────┘
                              ↓
            ┌─────────────────────────────────────────────┐
            │  V 校验层（兜底，只报"F 修不了"的真错误）       │
            │  · SFC 语法 · 语义完整 · 资源归属 · 结构        │
            │  · 原则：F 能修的，绝不到 V 就 fail-closed      │
            └─────────────────────────────────────────────┘
                              ↓
              仅真不可修复 → LLM 重试（预算制 + 精确指导）
```

**三条铁律**

1. **单一事实源**：资源变量命名、产物净化、重试状态各只有一套实现，其余废弃。
2. **确定性优先**：任何可确定性修复的错误，F 层修掉，不 fail-closed 靠 LLM 重试。
3. **真值驱动**：尺寸/颜色/挂载归属来自 Figma 真值（figma-node-data），不靠 LLM 猜。

## 三、整改项（分阶段）

### P0 — 单一事实源收敛（治本，直接消除今日失败）

| 项 | 改动 | 验收 |
|---|---|---|
| P0-1 命名单一化 | 只留 `assignedVarName` 作唯一引用名；`semanticVarName` 降级为纯 prompt 描述，从 `buildVarToMapping`/`resource-attribution-validator` 的引用判定中移除 | 两套校验对同一资源结论一致 |
| P0-2 净化单一入口 | `_stripTrailingGarbageAfterLastBlock`/`_stripInterBlockProse`/CONTEXT-LEAK 废弃，统一走 `stripLlmTailGarbage` | 全仓 grep 只剩 1 个尾部剥离实现 |
| P0-3 重试单轨 | 删除旧式 `_semanticRetried/_resourceRetried` 置位与消费，只留 `_pendingRetry` | 无"生成成功被拖回重跑" |
| P0-4 通用性接入 | Vue3 引擎接入 `stripLlmTailGarbage` + `code-fix-pipeline` | Vue3/微码共用同一净化+修复 |
| P0-5 子组件命名单一事实源 | planner 确定性输出子组件名清单（唯一来源）；index.vue 生成 + 子组件生成**强制只引用清单名**；生成后校验「import 名 ⊆ 文件集 ⊆ planner 清单」；prune-dangling/prune-orphan 降级为兜底告警 | 消除 DeviceGrid 缺失 + HeaderStats 孤儿类 404 |

### P1 — 硬编码治理（无硬编码目标）

| 项 | 改动 |
|---|---|
| P1-1 | `0.85`/`600`/`12`/`180s` 等 magic number 抽到 `config` 模块，env 可覆盖 |
| P1-2 | min-height clamp 从「0.85 系数」改为「用 vision chart 区真值 + 根高联动计算」 |
| P1-3 | 装饰阈值 `DECORATION_MAX_SIZE` 收敛到单一 config |

### P2 — 还原度 + 效率（长期打磨）

| 项 | 方向 |
|---|---|
| P2-1 | 资源挂载表从「prompt 描述」升级为「结构化真值注入 + 生成后挂载校验」双保险 |
| P2-2 | 尺寸/颜色还原：vision 真值 → prompt 硬约束 → 生成后 diff 校验三级 |
| P2-3 | 未声明变量确定性修复（acorn 定位剥离），补齐"死变量"场景，彻底移除语义 fail-closed 死循环 |

## 四、验收标准

1. **通用**：同一 Figma 节点在微码/Vue3 两引擎下产出都过净化+修复层，grep 确认无引擎私有的清洗逻辑。
2. **无硬编码**：`grep -rn "[0-9]{2,}px\|0\.[0-9]+\|>= [0-9]+" src/ai-engine` 仅命中 config 模块与 Figma 真值。
3. **高还原**：资源挂载/尺寸/颜色 100% 来自 figma-node-data，无 LLM 臆造值。
4. **高效率**：确定性可修复错误零 LLM 重试；仅截断/业务缺失触发重试，重试预算制。

## 五、风险与回滚

- **P0 是行为收敛**，不改生成质量，仅消除多实现间的口径分裂，回滚成本低（git revert）。
- **P0-1 命名单一化**涉及资源校验语义，需回归验证：用一个含 `bg-[m]` 节点的真实任务端到端跑通。
- 建议按 P0-1 → P0-3 → P0-2 → P0-4 顺序推进，每项独立提交、独立验证，不一次性大改。
