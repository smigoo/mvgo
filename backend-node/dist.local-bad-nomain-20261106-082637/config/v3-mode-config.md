# v3.0 模式配置

## 目的
控制 v3.0 升级的启用范围，支持渐进式 rollout。

## 模式定义

| 模式 | 启用的 Phase | 适用场景 |
|------|-------------|---------|
| `off` | 无（纯 v2 行为） | 回归基线、紧急修复 |
| `minimal` | Phase 1 + Phase 2（样式标准 + L0 自验） | 初期验证、解决 80% 样式问题 |
| `full` | Phase 1-4 全部启用 | 生产稳定后全量推广 |

## 配置方式

```javascript
// 方式 1: 环境变量
process.env.V3_MODE = 'minimal'  // 默认 'full'

// 方式 2: 构造参数
const graph = createPhase2Graph({ v3Mode: 'minimal' })

// 方式 3: 组件级别覆盖（最高优先级）
state.v3ModeOverride = 'off'  // 单个组件关闭 v3.0
```

## 各模式下的行为差异

### off 模式
- visual-parser 使用原始内嵌 prompt（不加载模块化文件）
- 不经过 preview-validator (L0-A)
- 不经过 code-structure-validator (L0-B)
- engineer → layout-refiner → style-refiner **串行**执行
- adversarial-checker 无 L4 检查 + 无 issueCategories 输出
- revision-decision 仅 binary 决策（needsRevision true/false）

### minimal 模式
- ✅ 样式标准注入 engineer prompt（vue-style-standard.md, less-naming-convention.md）
- ✅ visual-parser 模块化 prompt 加载
- ✅ L0-A preview-validator 校验（最多重试 1 次）
- ✅ L0-B code-structure-validator 校验
- ❌ 并行精修（仍走串行 layout→style）
- ❌ L1 refine-feedback 环
- ❌ L2 智能路由（仅 binary 决策）
- ❌ 越权检测

### full 模式
- ✅ 全部 Phase 1-4 功能启用
- ✅ L0/L1/L2 三层循环全部激活
- ✅ 并行精修 + 智能路由 + 越权检测

## 降级阈值

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `l0MaxRetry` | 1 | L0 最大重试次数 |
| `l0BypassAfterFailures` | 3 | L0 连续失败 N 次后自动降级为 WARN-only |
| `violationMaxCount` | 2 | 连续越权 N 次后强制 full |
| `maxIterations` | 2 | 全局最大迭代次数 |

## Metrics 采集点

| 节点 | 采集指标 | 示例 |
|------|---------|------|
| init | mode, config | `{ v3Mode: 'minimal', l0MaxRetry: 1 }` |
| preview-validator | blockCount, warnCount, pass, retryCount | `{ block: 0, warn: 2, pass: false }` |
| parallel-refine | reviseTarget, durationMs | `{ target: 'stylistic', duration: 3200 }` |
| refine-feedback | needsEngineerRework | `{ upstreamIssues: { ... } }` |
| adversarial-checker | qualityScore, categories, violation | `{ score: 82, violation: false }` |
| revision-decision | routingTarget, routingReason, violationCount | `{ target: 'style-refiner', reason: '...' }` |
| complete | scopedCompliant, totalDuration, iterations | `{ scopedOK: true, duration: '45.2s' }` |

---

**版本**: v1.0  
**创建日期**: 2026-07-06  
**关联**: OPTIMIZATION-V3-COMPLETE.md
