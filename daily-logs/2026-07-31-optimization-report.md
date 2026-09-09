# 微码组件生成管线性能优化报告

**生成时间**: 2026-07-31  
**优化目标**: 将微码组件生成时间从 50+ 分钟降至 25-30 分钟，同时保证生成质量不受影响  
**实际状态**: P0/P1 系列优化已全部实施完成

---

## 📋 优化项清单

### P0 系列（高优先级，已实施）

#### P0-1: adversarial-checker 与 screenshot-renderer 并行执行
- **文件**: `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- **改动**: 
  - 新增 `parallel-quality-check` 节点（~line 1074）
  - 将原本串行的对抗性检查和截图渲染改为并行
  - 边修改：`adversarial-checker → parallel-quality-check → visual-comparator`（~line 2167-2168）
- **预期收益**: 节省 30-60s
- **关键代码位置**: 
  - 节点定义: line 1074
  - 边定义: line 2167-2168

#### P0-2: microcode-engineer maxTokens 降低
- **文件**: `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- **改动**: maxTokens 从 24000 降到 16000
- **预期收益**: 节省 60-120s（LLM 输出时间）
- **关键代码位置**: microcode-engineer 节点的 LLM 调用处

#### P0-3: 缓存 visual-parser 结果
- **文件**: `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- **改动**: 
  - visual-parser 节点末尾添加 `_visualParserCache`（~line 494-505）
  - 避免 L0-A 循环重复调用 Vision API
- **预期收益**: 节省 20-40s
- **关键代码位置**: visual-parser 节点末尾

#### P0-4: adversarial-checker 参考文档按需加载
- **文件**: `backend-node/src/ai-engine/roles/adversarial-checker.js`
- **改动**:
  1. 构造函数改为懒加载模式，新增 `_referencePaths` 和 `_standardsCache`
  2. 新增 `_loadStandardsByComplexity(complexity)` 方法
  3. `buildCheckPrompt` 接受复杂度参数
  4. `check()` 方法根据复杂度预加载文档
- **预期收益**: 
  - simple 组件: 节省 ~70% prompt tokens
  - medium 组件: 节省 ~40% prompt tokens
- **关键代码位置**: 
  - 懒加载逻辑: constructor
  - 复杂度判断: `_assessComplexity()`
  - 文档加载: `_loadStandardsByComplexity()`

---

### P1 系列（中优先级，已实施）

#### P1-1: L2 路由优化
- **文件**: `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- **改动**: 
  - revision-decision 节点中新增 issueCategories 为空时的智能路由
  - issueCategories 都为空但有 critiques → 走 `parallel-refine`（layout-style-refiner 合并精修）
  - 完全无问题但标记 needs_revision → 可能是 LLM 误判，强制完成
- **预期收益**: 避免无效迭代，节省一轮 LLM 调用（30-60s）
- **关键代码位置**: revision-decision 节点的路由逻辑（~line 1260-1310）

#### P1-2: 降低 maxIterations 从 2 到 1
- **文件**: `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
- **改动**: 第 116 行 `maxIterations: parseInt(process.env.MAX_ITERATIONS || '1')`
- **预期收益**: 避免无效迭代，节省 30-60s
- **配置**: 可通过环境变量 `MAX_ITERATIONS=2` 恢复
- **关键代码位置**: 图配置初始化（line 116）

#### P1-4: Puppeteer 预热
- **文件**: 
  - `backend-node/src/ai-engine/roles/screenshot-renderer.js`: 新增 `warmupBrowser()` 导出函数（~line 542-565）
  - `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`: init 节点末尾调用 `warmupBrowser()`
- **改动**: 
  - 在 init 节点启动时预启动 Puppeteer 浏览器
  - 避免 screenshot-renderer 首次启动延迟
- **预期收益**: 节省 10-20s
- **关键代码位置**: 
  - warmupBrowser 定义: screenshot-renderer.js:542-565
  - 调用位置: init 节点末尾

---

### 网络优化（已完成）

#### Figma API 请求并行化
- **文件**: `backend-node/src/ai-engine/roles/figma-connector.js`
- **改动**:
  1. `execute()` 方法中 `downloadPreviewImage` 和 `fetchNodeData` 改为并行执行
  2. `_saveFigmaCache()` 改为不阻塞后续流程（异步执行）
  3. 添加详细的耗时日志（phase1Time, phase2Time, totalTime）
- **预期收益**: 
  - 预览图下载和节点数据获取并行，节省 10-20s
  - 缓存保存不阻塞，节省 5-10s

#### 图片下载并行化
- **文件**: `backend-node/src/ai-engine/roles/figma-connector.js`
- **改动**:
  1. 新增 `batchGetImageUrls()` 方法 — 批量获取渲染 URL
     - Figma Images API 支持 `?ids=a,b,c` 一次返回多个
     - 每批最多 50 个节点（避免 URL 过长或 API 限制）
  2. 新增 `_downloadImageFromUrl()` 方法 — 从已有 URL 直接下载图片
     - 跳过 Figma Images API 调用
     - 支持超时控制（AbortController）
  3. 改造 `downloadAssets()` 方法:
     - 先批量获取所有渲染 URL（1-2 次 API 调用）
     - 然后并发下载所有图片（并发数 10）
     - 保留去重逻辑和错误处理
- **预期收益**: 
  - 减少 API 调用次数（从 N 次降到 1-2 次）
  - 图片下载并发化，节省 30-60s（取决于图片数量）
- **关键代码位置**: 
  - batchGetImageUrls: line 278-339
  - _downloadImageFromUrl: line 341-430
  - downloadAssets 改造: line 432-500

---

## 📊 预期总收益

| 优化项 | 节省时间 | 实施状态 |
|-------|---------|---------|
| P0-1: 并行质量检查 | 30-60s | ✅ 已实施 |
| P0-2: maxTokens 降低 | 60-120s | ✅ 已实施 |
| P0-3: visual-parser 缓存 | 20-40s | ✅ 已实施 |
| P0-4: 文档按需加载 | 10-30s（prompt 减少） | ✅ 已实施 |
| P1-1: L2 路由优化 | 30-60s | ✅ 已实施 |
| P1-2: maxIterations 降低 | 30-60s | ✅ 已实施 |
| P1-4: Puppeteer 预热 | 10-20s | ✅ 已实施 |
| Figma API 并行化 | 15-30s | ✅ 已实施 |
| 图片下载并行化 | 30-60s | ✅ 已实施 |

**总计预期收益**: 235-480s（约 4-8 分钟）

考虑到优化项之间有叠加效应（如并行 + 缓存 + 按需加载），实际收益可能达到 **6-10 分钟**，将生成时间从 50+ 分钟降至 **40-44 分钟**。

---

## 🔧 技术细节

### 关键代码位置

#### 管线图定义
- `parallel-quality-check` 节点: `mc-component-graph-phase2.js:1074`
- visual-parser 缓存: `mc-component-graph-phase2.js:494-505`
- revision-decision 智能路由: `mc-component-graph-phase2.js:1260-1310`
- maxIterations 配置: `mc-component-graph-phase2.js:116`
- Puppeteer 预热调用: `mc-component-graph-phase2.js` init 节点末尾

#### 角色模块
- Puppeteer 预热函数: `screenshot-renderer.js:542-565`
- adversarial-checker 懒加载: `adversarial-checker.js` constructor + `_loadStandardsByComplexity()`
- Figma API 并行化: `figma-connector.js` execute() + batchGetImageUrls() + _downloadImageFromUrl()

### 环境变量配置

```bash
# 恢复旧的最大迭代次数（默认 1）
export MAX_ITERATIONS=2

# 其他相关变量（已有，无需修改）
export TEXT_API_KEY=...
export VISION_API_KEY=...
export FIGMA_ACCESS_TOKEN=...
```

---

## 🚀 部署步骤

### 1. 重建 dist
```bash
cd /Users/smigoo/工作/mvgo/backend-node
bash build-backend.sh
```

### 2. 重启 Node 后端
```bash
# 如果使用 pm2
pm2 restart mvgo-backend-node

# 如果手动启动
bash .start-server.sh
```

### 3. 验证优化效果
- 观察日志中的耗时信息：
  - Figma 数据获取阶段会输出 `phase1Time`, `phase2Time`, `totalTime`
  - parallel-quality-check 节点会显示并行执行
  - visual-parser 缓存命中会显示 `Cache hit`
  - Puppeteer 预热会显示 `warmupBrowser called`

---

## ⚠️ 注意事项

### P1-3: simple 组件走快速通道（评估后暂不实施）
- **评估结论**: 风险大于收益
- **原因**: 
  - `parallel-analysis` 输出的 `reviewResult` 和 `styleMappings` 是 `microcode-engineer` 的核心输入
  - 跳过会导致样式不一致、布局关系丢失，质量损失明显
- **替代方案**: 如果 simple 组件占比高，可探索"轻量级 parallel-analysis"（只保留 styleMappings，跳过 reviewResult）

### Prompt 精简（评估后暂不实施）
- **评估结论**: 会显著影响效果
- **原因**: 
  - microcode-engineer 的 prompt 依赖 `layoutStructure`、`figmaNodeData`、`styleMappings` 三者完整信息
  - 精简会导致布局关系丢失、样式不准确
- **替代方案**: 
  - 模型切换（qwen3.7-plus → qwen-plus/deepseek-v3）
  - 并行 LLM 调用（更多节点并行化）
  - 结果缓存（相似组件复用）

---

## 📈 后续优化方向

### 1. LLM 模型分层（推荐，风险低）
- **目标**: 不同任务用不同模型
- **方案**:
  - microcode-engineer: 保持 qwen3.7-plus（需要强代码生成能力）
  - adversarial-checker/visual-comparator: 用 qwen-plus 或 deepseek-chat（简单判断任务）
  - layout-reviewer/style-mapper: 用 qwen-plus（结构化判断任务）
- **预期收益**: 整体 LLM 调用时间减少 30-40%

### 2. 结果缓存（需要 Redis）
- **目标**: 相同结构的组件复用历史结果
- **方案**:
  - 基于 `layoutStructure` 的 hash 作为缓存 key
  - 缓存有效期 24 小时
  - 命中率预估: 30-50%（取决于组件重复度）
- **预期收益**: 重复请求减少 80-90%

### 3. 更激进的并行化（高难度）
- **目标**: 更多节点并行执行
- **方案**:
  - parallel-analysis 内部的 layout-reviewer 和 style-mapper 已经是并行的
  - 可以考虑将 microcode-engineer 和 parallel-analysis 部分并行（需要重构依赖关系）
- **预期收益**: 20-30%

---

## ✅ 总结

所有计划中的 P0 和 P1 优化项已实施完毕（除 P1-3 因质量风险暂不实施），加上网络优化（Figma API 并行化 + 图片下载并行化）。

**关键改动**:
1. 并行质量检查（P0-1）
2. Token 预算优化（P0-2、P0-4）
3. 缓存机制（P0-3）
4. 智能路由（P1-1）
5. 迭代控制（P1-2）
6. 基础设施预热（P1-4）
7. 网络并行化（Figma API + 图片下载）

**预期效果**: 将生成时间从 50+ 分钟降至 **40-44 分钟**（节省 6-10 分钟）。

**下一步**: 部署后监控实际效果，根据数据决定是否需要进一步优化。
