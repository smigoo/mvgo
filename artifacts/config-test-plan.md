# 配置测试功能规划

## 一、现状问题

当前配置面板（ConfigPanel.vue）只有"保存"和"清除"，**没有任何配置验证能力**。用户填入 API Key 后，只能通过"跑一次完整生成"才能知道配置是否正确。一旦出错（401/403/429/endpoint 不通），往往在生成中途失败，浪费时间和 Token。

## 二、需要测试的 4 类配置

### 1. 文本模型连通性测试

**目的**：验证文本 API Key + Base URL + Model 是否可用（代码生成/审查/布局分析）

**方案**：
- 前端点击"测试" → 后端 `POST /api/config/test-text` → 调用 LLM 发一个轻量 prompt
- 请求体：`{ apiKey, baseURL, model }`
- 验证项：
  - ✅ 能连通（200 响应）
  - ✅ 返回内容非空
  - ⚠️ 响应时间 < 15s（超时报警）
  - ❌ 401/403 → Key 无效
  - ❌ 429 → 额度用尽
  - ❌ 404 → 模型名错误

**测试 Prompt 建议**：
```
Reply with exactly: "OK"
```
（最省 Token 的方式，不依赖视觉能力）

### 2. 视觉模型连通性测试 ⭐ 重点

**目的**：验证视觉 API Key 对应的模型**确实支持图像输入**（Preview 阶段核心依赖）

**方案**：
- 前端点击"测试" → 后端 `POST /api/config/test-vision` → 调用 Vision API 发一张小测试图
- 请求体：`{ apiKey, baseURL, model }`（可复用测试图片 base64）
- 验证项：
  - ✅ 模型能正确描述图片内容（返回非空描述文本）
  - ✅ 响应时间 < 30s（图片处理比纯文本慢）
  - ❌ 返回 "model does not support images" → 模型无视觉能力
  - ❌ 401/403 → Key 无效
  - ❌ 429 → 额度用尽

**测试图片建议**：
使用一张固定的 200×150 简单图片（如红色方块 + 文字 "TEST"），压缩后 < 10KB base64。
后端内嵌或 public/test-img.png。

**后端 `isVisionModel()` 已有检测**：识别含 `vision`/`qwen-vl`/`claude-3` 的模型名。
但这是黑名单检测，不能完全保证 API 端支持——所以必须做一次真实请求验证。

**统一模式特殊处理**：
统一模式下，同一个 Key 同时承担文本和视觉任务。需要测试：
- 该模型是否既能处理纯文本，也能处理图像输入
- 如果不支持视觉 → 弹出警告："统一模型模式下请选择支持多模态的模型（如 claude-opus-4-8、qwen-vl-max）"

### 3. Figma Token 测试

**目的**：验证 Figma Personal Access Token 是否有效

**方案**：
- 前端点击"测试" → 后端 `POST /api/config/test-figma` → 调用 Figma API `GET /v1/me`
- 验证项：
  - ✅ 返回用户信息（handle/email）
  - ❌ 403 → Token 无效或已过期
  - ❌ 网络超时 → Figma API 不通

**返回展示**：
```
✅ 连接成功
用户：smigoo (xxx@xxx.com)
```

### 4. Apifox Token 测试

**目的**：验证 Apifox Access Token 是否有效

**方案**：
- 前端点击"测试" → 后端 `POST /api/config/test-apifox` → 调用 Apifox API
- 验证项：
  - ✅ 能正常返回数据
  - ❌ 401 → Token 无效
  - ❌ 网络超时

## 三、UI 交互设计

### 位置
在每个配置字段组右侧/下方增加"测试"按钮（小按钮，不抢保存的主 CTA）。

### 模型 Tab — 统一模式
```
┌─────────────────────────────────┐
│ API Key    [sk-ant-...]  👁    │
│ Base URL   [https://...]       │
│ Model      [claude-opus-4-8]   │
│                                 │
│ [🔌 测试连通性]                  │
│                                 │
│ 测试结果：                      │
│ ✅ 文本生成 — OK (1.2s)         │
│ ✅ 视觉分析 — OK (3.8s)         │
└─────────────────────────────────┘
```

### 模型 Tab — 分别模式
```
视觉任务
  API Key  [sk-ant-...]  👁
  Base URL [https://...]
  Model    [claude-opus-4-8]
  [🔌 测试视觉能力]
  结果：✅ 视觉分析正常 (3.8s)

文本任务
  API Key  [sk-ant-...]  👁
  Base URL [https://...]
  Model    [claude-opus-4-8]
  [🔌 测试连通性]
  结果：✅ 文本生成正常 (1.2s)
```

### 外部服务 Tab
```
Figma     [figd_...]  👁   [测试]  ✅ 已连接：smigoo
Apifox    [Apifox...] 👁   [测试]  ✅ 已连接
```

### 测试结果状态
- ⏳ 测试中（loading spinner）
- ✅ 通过 + 耗时
- ❌ 失败 + 错误原因（具体到 401/429/404 等）
- ⚠️ 警告（能通但有风险，如响应慢、模型名不匹配视觉能力）

## 四、后端接口设计

### `POST /api/config/test-text`
```typescript
// 请求
{ apiKey: string, baseURL: string, model: string }

// 响应
{ success: boolean, latency?: number, error?: string, detail?: string }
```

实现：构造最简 prompt，调用 OpenAI 兼容接口，测量延迟。

### `POST /api/config/test-vision`
```typescript
// 请求
{ apiKey: string, baseURL: string, model: string }

// 响应
{ success: boolean, latency?: number, error?: string, detail?: string, isVisionCapable?: boolean }
```

实现：发送 base64 测试图片（红色方块），要求模型描述图片内容。如果模型返回 "不支持图像" 类错误，标记 `isVisionCapable: false`。

### `POST /api/config/test-figma`
```typescript
// 请求
{ token: string }

// 响应
{ success: boolean, user?: { handle: string, email?: string }, error?: string }
```

实现：`GET https://api.figma.com/v1/me` + Header `X-Figma-Token: {token}`

### `POST /api/config/test-apifox`
```typescript
// 请求
{ token: string }

// 响应
{ success: boolean, error?: string }
```

## 五、实施优先级

| 优先级 | 测试项 | 理由 |
|--------|--------|------|
| **P0** | 视觉模型测试 | 7 个视觉功能依赖，失败代价最高（Preview 阶段全挂） |
| **P0** | 文本模型测试 | 代码生成核心能力，配置错误会导致整个管线跑空 |
| **P1** | Figma Token 测试 | 设计稿获取是第一步，无效 Token 直接阻塞 |
| **P2** | Apifox Token 测试 | 只有 API 绑定时才用到，非核心路径 |

## 六、注意事项

1. **Token 消耗**：测试请求应使用最小 prompt，控制在 10 Token 以内
2. **超时保护**：文本 15s、视觉 30s、外部 API 10s
3. **安全**：测试请求不应保存配置，只用于验证
4. **错误分类**：区分"配置错误"（401/403）和"服务不可用"（5xx/timeout），给用户不同的引导
5. **统一模式警告**：如果用户选了非视觉模型但在统一模式下，提前警告
6. **模型能力检测**：结合 `isVisionModel()` 做前端预检 + 后端实测双重验证

## 七、测试矩阵

| 场景 | 文本测试 | 视觉测试 | 预期结果 |
|------|---------|---------|---------|
| 分别模式 + claude-opus-4-8 两组 | ✅ 测试 | ✅ 测试 | 均通过 |
| 分别模式 + 视觉用 gpt-4o-mini（非视觉名） | ✅ 测试 | ✅ 测试 | 视觉：isVisionModel 警告但实测可能通过 |
| 统一模式 + claude-opus-4-8 | — | ✅ 测试（文本+视觉） | 通过（多模态模型） |
| 统一模式 + gpt-4o-mini | — | ⚠️ 预检警告 | 建议换模型 |
| 429 额度耗尽 | ❌ 429 | ❌ 429 | 明确提示"额度已用完" |
| 错误 endpoint | ❌ 网络错误 | ❌ 网络错误 | 提示检查 Base URL |
| 空 API Key | 前端拦截 | 前端拦截 | 不允许发送测试请求 |
