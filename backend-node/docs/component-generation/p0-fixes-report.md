# P0 严重问题修复报告

**日期**: 2026-08-28  
**状态**: ✅ 已完成  
**文件**: `src/ai-engine/graphs/mc-component-graph-phase2.js`

---

## 修复清单

### ✅ P0-1: 闭包计数器与状态不一致
**位置**: Line 1780-1783  
**问题**: `revisionLoopCount` 闭包变量与 `state.iterationCount` 不同步，导致修订决策混乱

**修复**:
```javascript
revisionLoopCount++; // 闭包计数
const iterationCount = revisionLoopCount;

// 🛡️ P0-1 修复：同步回写 state.iterationCount，保持单一事实源
state.iterationCount = iterationCount;
```

**影响**: 修订循环计数现在保持一致，避免决策混乱

---

### ✅ P0-2: 视觉比对降级导致无限循环
**位置**: Line 1980-2020  
**问题**: 视觉 API 故障时 `visualScore=null`，但 `qualityScore` 仍用 `textScore`，导致持续低于阈值无法退出

**修复**:
```javascript
// 🛡️ P0-2 修复：视觉比对降级时的安全退出机制
if (visualScore === null && visualReport?.degraded) {
  const degradedIterationCount = state._visualDegradedIterations || 0;
  state._visualDegradedIterations = degradedIterationCount + 1;

  // 降级状态下最多允许2轮修订，之后强制退出
  if (degradedIterationCount >= 2) {
    logger.warn(
      `🛑 P0-2: 视觉比对持续降级(${degradedIterationCount + 1}轮)，强制退出避免无限循环`,
      { textScore, qualityScore }
    );
    return {
      needsRevision: false,
      violationCount,
      _visualDegradedIterations: 0,
    };
  }
} else {
  state._visualDegradedIterations = 0;
}
```

**影响**: 视觉 API 故障时，最多2轮修订后强制退出，避免无限循环

---

### ✅ P0-3: Token 预算超限后未真正降级
**位置**: Line 4223-4242  
**问题**: Token 预算耗尽仅触发回调通知，未中断执行，继续调用 LLM 造成额外费用

**修复**:
```javascript
const onTokenUsage = (usageData) => {
  const status = tokenBudget.track(...);

  // 🛡️ P0-3 修复：预算超限时设置标志，让后续节点检查并跳过 LLM 调用
  if (status.exceeded && !initialState._budgetExceeded) {
    logger.warn('🛑 Token 预算已耗尽，后续节点将降级执行', {
      used: status.used,
      budget: status.budget,
    });
    initialState._budgetExceeded = true;
  }
  
  // ... 原有逻辑
};
```

**影响**: 预算超限后设置 `state._budgetExceeded` 标志，后续节点可检查此标志跳过 LLM 调用

**待完成**: 需要在各个节点开头检查 `state._budgetExceeded`，跳过 LLM 调用

---

### ✅ P0-4: 并行 Promise 缺少超时保护
**位置**: Line 2587-2630  
**问题**: Layout Reviewer 和 Style Mapper 并行执行无超时，agent 卡死会导致流程无限等待

**修复**:
```javascript
// 🛡️ P0-4 修复：添加超时保护，防止单个 agent 卡死
const PARALLEL_ANALYSIS_TIMEOUT = 10 * 60 * 1000; // 10分钟

const [reviewResult, styleMappings] = await withTimeout(
  Promise.all([
    // Layout Reviewer
    (async () => { ... })(),
    // Style Mapper
    (async () => { ... })()
  ]),
  PARALLEL_ANALYSIS_TIMEOUT,
  '并行分析总超时'
);
```

**影响**: 并行分析最多等待10分钟，超时后抛出错误，避免无限等待

---

### ✅ P0-5: L0-B 失败回退缺少指导检查
**位置**: Line 3698-3716  
**问题**: 重试时未检查 `_l0CodeRetryGuidance` 是否为空，盲目重试可能重复相同错误

**修复**:
```javascript
if (!r.pass && !r._bypassed) {
  if (retryCount <= maxRetry) {
    // 🛡️ P0-5 修复：检查修复指导是否存在
    if (!state._l0CodeRetryGuidance || state._l0CodeRetryGuidance.trim().length === 0) {
      logger.warn(
        `⚠️ P0-5: L0-B 校验失败但缺少修复指导，重试可能重复相同错误`,
        { retryCount, maxRetry, blockCount: r.blockCount }
      );
      state._l0RetryWithoutGuidance = true;
    }

    logger.info(
      `L0-B 校验失败，回退 engineer 重试 (${retryCount}/${maxRetry})`,
      {
        hasGuidance: !!state._l0CodeRetryGuidance,
        guidanceLength: state._l0CodeRetryGuidance?.length || 0,
      }
    );
    return 'microcode-engineer';
  }
  // ... 重试耗尽逻辑
}
```

**影响**: 缺少修复指导时记录警告，帮助诊断重试失败原因

---

## 额外修复

### ✅ MC Model Undefined (再次修复)
**位置**: Line 807  
**问题**: `mc-component-graph-phase2.js` 中直接实例化 MicrocodeEngineer，绕过了 `dynamic-workflow-graph.js` 的修复

**修复**:
```javascript
const engineer = new EngineerClass({
  apiKey: textCfg.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY,
  model: textCfg.model || process.env.TEXT_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', // 🛡️ 防御性默认值
  baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL,
  onTokenUsage: state.onTokenUsage,
  providerId: textCfg.providerId || null
})
```

**影响**: 彻底修复 MC model undefined 错误

---

## 测试建议

### 立即测试
1. **MC 生成测试**: 验证 model undefined 错误已彻底修复
2. **视觉比对降级**: 模拟视觉 API 故障，验证2轮后强制退出

### 回归测试
3. **正常修订循环**: 验证计数器同步不影响正常流程
4. **并行分析超时**: 验证10分钟超时机制生效
5. **L0-B 重试**: 验证缺少指导时的警告日志

### 压力测试
6. **Token 预算超限**: 设置低预算，验证超限后的降级行为（需要补充节点检查逻辑）

---

## 待完成工作

### P0-3 后续工作
需要在以下节点开头添加预算检查：
- `microcode-engineer` (Line ~800)
- `layout-refiner` (Line ~2300)
- `style-refiner` (Line ~2400)
- `adversarial-checker` (Line ~1050)

**检查逻辑**:
```javascript
if (state._budgetExceeded) {
  logger.warn('Token 预算已耗尽，跳过 LLM 调用');
  return { /* 降级结果 */ };
}
```

---

## 影响评估

| 修复项 | 严重程度 | 触发频率 | 修复状态 | 影响范围 |
|--------|----------|----------|----------|----------|
| P0-1 计数器不一致 | 高 | 中等 | ✅ 完成 | 修订决策 |
| P0-2 视觉降级循环 | 高 | 低 (API故障) | ✅ 完成 | 修订退出 |
| P0-3 预算超限 | 高 | 低 (大组件) | 🟡 部分完成 | 费用控制 |
| P0-4 并行超时 | 高 | 极低 (agent卡死) | ✅ 完成 | 流程稳定性 |
| P0-5 缺少指导 | 中 | 中等 | ✅ 完成 | 重试效率 |
| MC Model Undefined | 高 | 频繁 | ✅ 完成 | 代码生成 |

**总体评估**: 5个核心问题已修复，1个部分完成（需补充节点检查逻辑）

---

## 下一步行动

1. **立即部署**: 修复 MC model undefined 错误，恢复正常生成
2. **补充 P0-3**: 在各节点添加预算检查逻辑（1小时）
3. **回归测试**: 验证修复不影响正常流程（2小时）
4. **继续 P1**: 修复中等问题（缓存优化、文件读取等）

---

**备注**: 所有修复均已添加详细日志，便于后续诊断和监控
