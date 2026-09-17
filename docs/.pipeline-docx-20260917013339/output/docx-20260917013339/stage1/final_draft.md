# 任务遥测与 Bad Case 反馈闭环设计方案

## TL;DR

建立"地面真值"数据飞轮：通过用户行为信号 + 主动反馈机制，识别门禁漏网/误杀问题，按 baseURL 分组对比模型效果，实现管线持续优化。

---

## 一、背景与问题

### 1.1 核心矛盾

当前系统存在一个根本性盲区：**成功/失败 ≠ 效果好/差**。

| 系统视角 | 用户视角 | 真实情况 |
|---------|---------|---------|
| 门禁通过 | 效果差 | ⚠️ **漏网**（门禁太松）|
| 门禁拦截 | 效果还行 | ⚠️ **误杀**（门禁太严）|
| 门禁通过 | 效果好 | ✅ 正确放行 |
| 门禁拦截 | 效果差 | ✅ 正确拦截 |

**问题**：系统只能看到"成功/失败"，看不到"效果好/差"。没有用户满意度反馈，就无法校准门禁阈值。

### 1.2 数据飞轮缺失

理想的优化闭环：

```
收集地面真值 → 识别问题 → 调整门禁/模型 → 验证效果 → 迭代
```

当前缺失的是第一步：**地面真值数据**。没有它，所有优化都是盲人摸象。

---

## 二、数据收集方案

### 2.1 满意度信号层级

用户满意度不是二元的"满意/不满意"，而是一个连续光谱。通过行为信号推断真实满意度：

| 信号强度 | 用户行为 | 含义 | 收集方式 |
|---------|---------|------|---------|
| ⭐⭐⭐⭐⭐ | 提交到公共组件库 | 非常满意，愿意分享 | 自动记录 |
| ⭐⭐⭐⭐ | 下载组件 | 满意，愿意使用 | 自动记录 |
| ⭐⭐⭐ | 预览页停留 > 30s | 效果还行，在仔细看 | 自动记录 |
| ⭐⭐ | 任务完成但没下载 | 不确定，可能忘了 | 主动询问 |
| ⭐ | 预览 < 5s 就关闭 | 可能不满意 | 主动询问 |

### 2.2 智能触发策略

**核心原则**：强满意信号不打扰，弱信号才询问。

| 场景 | 策略 | 理由 |
|------|------|------|
| 用户下载/提交公共 | 不询问 | 已经是强满意信号，询问会打扰 |
| 任务完成 24h 后仍没下载 | 询问「效果不满意吗？」| 弱信号，需要确认 |
| 预览 < 5s 就关闭 | 询问「需要重新生成吗？」| 可能效果差，主动提供帮助 |
| 任务失败 | 询问「需要查看失败原因吗？」| 提供调试支持 |

---

## 三、遥测数据模型

### 3.1 TaskTelemetry 完整结构

```typescript
interface TaskTelemetry {
  // === 基础信息 ===
  sessionId: string;
  userId: string;
  createdAt: Date;
  status: 'success' | 'failed';
  
  // === 复杂度指标（归一化用）===
  complexity: {
    subcomponentCount: number;      // 子组件数量
    totalLines: number;             // 总代码行数
    fileCount: number;              // 文件数量
    hasEcharts: boolean;            // 是否含图表
    hasResource: boolean;           // 是否含资源图片
    panelType: string;              // 面板类型
  };
  
  // === 输入源 ===
  input: {
    sourceType: 'figma' | 'screenshot' | 'html';
    figmaNodeKey?: string;
    sourceImageUrl?: string;        // 源设计图 URL
  };
  
  // === 管线配置 ===
  config: {
    textModel: string;              // 文本模型名称
    visionModel: string;            // 视觉模型名称
    v3Mode: 'minimal' | 'standard' | 'full';
  };
  
  // === 模型级遥测（按 baseURL 聚合）===
  modelUsage: Array<{
    modelName: string;              // 'deepseek-v4-pro' | 'claude-sonnet-5'
    providerType: string;           // 'openai-compatible' | 'anthropic'
    baseURL: string;                // 'https://api.deepseek.com'
    providerId: string;             // 供应池中的 ID
    callCount: number;              // 调用次数
    totalDuration: number;          // 总耗时 ms
    totalTokens: number;            // 总 token 消耗
    successCount: number;
    failCount: number;
    nodesUsedIn: Array<{
      nodeName: string;
      callCount: number;
      avgDuration: number;
    }>;
  }>;
  
  // === 管线节点遥测 ===
  nodes: Array<{
    name: string;                   // 'figma-parse' | 'visual-parser' | ...
    duration: number;               // 节点耗时 ms
    status: 'ok' | 'skip' | 'fail' | 'retry';
    retryCount: number;
    modelCalls?: Array<{
      modelName: string;
      providerType: string;
      baseURL: string;
      duration: number;
      tokens: number;
      status: 'ok' | 'fail';
    }>;
    gateResults?: Array<{
      name: string;
      passed: boolean;
      score?: number;
    }>;
  }>;
  
  // === 最终产物 ===
  output: {
    visualCoverage?: number;        // 视觉覆盖率
    totalDuration: number;          // 总耗时 ms
  };
  
  // === 用户行为信号 ===
  userActions: {
    previewOpenedAt?: Date;
    previewDuration?: number;       // 预览停留时长 ms
    downloadedAt?: Date;
    submittedToPublicAt?: Date;
  };
  
  // === 用户反馈 ===
  userFeedback?: {
    rating?: 1 | 2 | 3 | 4 | 5;
    issueType?: string;             // 'layout' | 'color' | 'text' | 'chart' | ...
    comment?: string;
  };
}
```

### 3.2 关键设计决策

**决策 1：为什么按 baseURL 分组模型遥测？**

- **背景**：同一模型（如 deepseek-v4-pro）可能通过不同厂商端点调用，效果差异大
- **方案对比**：
  | 方案 | 优点 | 缺点 |
  |------|------|------|
  | 按 modelName 聚合 | 简单 | 无法区分厂商差异 |
  | 按 baseURL 聚合 | 可识别厂商效果差异 | 数据量略大 |
- **最终选择**：按 baseURL 聚合
- **理由**：实际运维中发现，同一模型通过代理端点调用时，失败率和耗时显著高于直连官方 API

**决策 2：为什么需要复杂度指标？**

- **背景**：不同任务的复杂度差异巨大（1 个子组件 vs 10 个子组件）
- **问题**：直接比较"总耗时"不公平
- **解决方案**：归一化效率指标
  - 每子组件耗时 = 总耗时 / 子组件数
  - 每百行代码耗时 = 总耗时 / (代码行数 / 100)

---

## 四、管理员仪表盘

### 4.1 门禁校准矩阵

这是最核心的视图，直接回答"门禁是松还是严"：

| | 用户好评 | 用户差评 |
|---|---|---|
| **门禁通过** | ✅ 正确放行 | ⚠️ 漏网（门禁太松）|
| **门禁拦截** | ⚠️ 误杀（门禁太严）| ✅ 正确拦截 |

**行动指引**：
- 漏网多 → 收紧门禁阈值
- 误杀多 → 放松门禁阈值
- 正确放行多 → 当前阈值合理

### 4.2 模型效果对比（按 baseURL 分组）

| 模型 | 厂商端点 | 调用 | 成功 | 失败 | 平均耗时 | 平均 tokens |
|---|---|---|---|---|---|---|
| deepseek-v4-pro | api.deepseek.com | 120 | 118 | 2 | 3.2s | 4,500 |
| deepseek-v4-pro | proxy.example.com | 45 | 38 | 7 | 8.5s ⚠️ | 4,200 |
| claude-sonnet-5 | api.anthropic.com | 80 | 79 | 1 | 4.1s | 5,800 |

**洞察**：proxy.example.com 端点失败率高、耗时长，建议切换到直连官方 API。

### 4.3 管线瓶颈热力图

| 节点 | 平均耗时 | 失败率 | 重试率 | 状态 |
|---|---|---|---|---|
| figma-parse | 8s | 5% | 2% | ✅ 健康 |
| visual-parser | 45s | 12% | 8% | ⚠️ 需关注 |
| microcode-engineer | 120s | 18% | 15% | 🔴 最大瓶颈 |

**行动指引**：优先优化 microcode-engineer 节点（耗时最长、失败率最高）。

### 4.4 归一化效率

| 任务 ID | 子组件数 | 代码行数 | 总耗时 | 每子组件耗时 | 每百行耗时 |
|---------|---------|---------|--------|-------------|-----------|
| task-001 | 3 | 450 | 180s | 60s | 40s |
| task-002 | 8 | 1200 | 480s | 60s | 40s |
| task-003 | 2 | 200 | 150s | 75s ⚠️ | 75s ⚠️ |

**洞察**：task-003 效率异常，可能是模型能力不足或任务复杂度过高。

---

## 五、前端展示设计

### 5.1 集成到现有 UsersView

**全局统计卡片（顶部）**：
- 总任务数
- 下载率（下载数 / 任务数）
- 公共提交率（提交数 / 任务数）
- 平均视觉覆盖率
- 主动反馈数

**用户列表表格新增列**：
- 下载率
- 平均视觉覆盖率
- 反馈数

**用户抽屉新增区块**：
- 「质量指标」：下载率、视觉覆盖率、反馈数
- 「最近任务」：可展开查看每个任务的遥测详情

### 5.2 TaskDetail 页面增强

**侧边栏新增「复杂度」区块**：
- 子组件数
- 代码行数
- 文件数
- 含图表/资源标签

**主内容区新增「管线耗时」瀑布图**：
- 按节点展示耗时占比
- 可展开查看每个节点的模型调用明细

**主内容区新增「模型调用明细」**：
- 按节点展开
- 显示每次模型调用的 baseURL、耗时、tokens

**归一化效率展示**：
- 每子组件耗时
- 每百行代码耗时
- 与历史平均值对比

---

## 六、数据存储与维护

### 6.1 数据量估算

| 维度 | 单任务 | 每天 100 任务 | 每月 | 每年 |
|------|--------|--------------|------|------|
| 大小 | 5-10 KB | 500 KB - 1 MB | 15-30 MB | 180-360 MB |

**压缩后**：年存储 ~90 MB（可接受）。

### 6.2 三层数据分层

| 层级 | 时间范围 | 存储格式 | 用途 | 大小 |
|---|---|---|---|---|
| 热数据 | 最近 30 天 | JSON（未压缩）| 管理员仪表盘、实时分析 | ~30 MB |
| 温数据 | 30-180 天 | JSONL + gzip（按月聚合）| 历史趋势分析 | ~20 MB 压缩 |
| 冷数据 | > 180 天 | JSONL + gzip（按半年聚合）| 长期趋势、年度复盘 | ~40 MB 压缩 |

### 6.3 自动化维护

**Cron 任务**：
- 每月 1 号凌晨 3 点：归档 30 天前的热数据
- 每年 1 月 1 号凌晨 4 点：归档上一年冷数据

**维护成本**：极低（自动化执行，无需人工干预）。

---

## 七、实现优先级

### 7.1 阶段划分

| 阶段 | 功能 | 工作量 | 优先级 |
|---|---|---|---|
| **P0** | 后端：管线节点耗时采集（wrapNodeWithTiming）| 1 天 | 🔴 最高 |
| **P0** | 后端：ai-request-gateway 记录每次模型调用 | 0.5 天 | 🔴 最高 |
| **P0** | 后端：复杂度指标计算 | 0.5 天 | 🔴 最高 |
| **P0** | 后端：遥测 JSON 落盘（含 modelUsage）| 0.5 天 | 🔴 最高 |
| **P0** | 后端：下载/提交公共事件钩子 | 0.5 天 | 🔴 最高 |
| **P1** | 前端：TaskDetail 侧边栏加「复杂度」区块 | 0.5 天 | 🟡 高 |
| **P1** | 前端：TaskDetail 主内容区加「管线耗时」瀑布图 | 1 天 | 🟡 高 |
| **P1** | 前端：TaskDetail 侧边栏「AI 模型」增强 | 0.5 天 | 🟡 高 |
| **P1** | 前端：归一化效率展示 | 0.5 天 | 🟡 高 |
| **P2** | 后端：管理员聚合 API | 1 天 | 🟢 中 |
| **P2** | 前端：管理员仪表盘前端 | 2 天 | 🟢 中 |

### 7.2 实施建议

**第一阶段（P0，3 天）**：后端数据采集 + 落盘
- 优先实现管线节点耗时采集
- 实现 ai-request-gateway 模型调用记录
- 实现复杂度指标计算
- 实现遥测 JSON 落盘
- 实现下载/提交公共事件钩子

**第二阶段（P1，2.5 天）**：前端展示增强
- TaskDetail 侧边栏加「复杂度」区块
- TaskDetail 主内容区加「管线耗时」瀑布图
- TaskDetail 侧边栏「AI 模型」增强
- 归一化效率展示

**第三阶段（P2，3 天）**：管理员仪表盘
- 后端聚合 API
- 前端仪表盘界面

---

## 八、日志优化（已完成）

### 8.1 deepseek v4 日志去重

**问题**：「🔧 deepseek v4 系默认关推理」每次任务重复 2-4 次，日志冗余。

**解决方案**：添加进程级去重 Set，同模型只 WARN 一次。

**文件**：`backend-node/src/ai-engine/utils/ai-defaults.js`

**状态**：✅ 已完成

---

## 元信息

- **目标读者**：中高级前端/后端开发者，负责 mvgo 平台运维与优化
- **前置知识**：Vue 3、NestJS、LangGraph、Figma API
- **技术栈版本**：Node.js 22+、Vue 3.5+、NestJS 10+、MongoDB 7+
- **预计阅读时间**：25 分钟
