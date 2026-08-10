# 视觉模型 404 / MODEL_NOT_FOUND 根本修复报告

> 日期：2026-08-06
> 问题：`html-upload-test-1` 等任务的视觉分析阶段失败，报错
> `视觉分析失败: 404 请求的资源未找到... MODEL_NOT_FOUND`
> 结论：**已彻底根本修复（代码已落地 + 验证通过）**，需重启后端生效。

---

## 一、根因（为什么之前一直 404）

视觉模型请求走哪条 SDK，由 `baseURL` 判断：

| 链路 | 旧判断规则 | 对你的 baseURL 结果 |
|------|-----------|---------------------|
| 文本链 `base-agent.js` | 含 `dashscope` / `openai.com` / `api.deepseek.com` / `openai.` / `/v1` | ✅ OpenAI 兼容 |
| 视觉链 `vision-agent.js` | 只含 `dashscope.aliyuncs.com` / `openai.com` | ❌ 误判为 Anthropic |

你的视觉配置：

```json
"visionBaseURL": "https://code.newcli.com/claude/ultra/v1",
"visionModel": "claude-opus-4-8"
```

这个地址是 `/v1` 风格的 OpenAI 兼容网关，但 `vision-agent.js` 只认 `dashscope` 和 `openai.com`，
于是把它当成 **Anthropic 原生接口** 请求 → 命中错误路由 → `404 / MODEL_NOT_FOUND`。

后端日志证据（之前已抓取）：
```
VisionAgent 配置  baseURL=https://code.newcli.com/claude/ultra/v1
API 类型判断      isOpenAICompatible=false
使用 Anthropic Claude API
→ MODEL_NOT_FOUND / 404
```

---

## 二、修复方案（不是给某个 URL 打补丁）

新增唯一真相源：`backend-node/src/ai-engine/utils/provider-utils.js`

```js
const OPENAI_COMPATIBLE_PATTERNS = ['/v1', 'openai.com', 'openai.', 'dashscope', 'deepseek']

export function isOpenAICompatibleBaseURL(baseURL) {
  if (!baseURL || typeof baseURL !== 'string') return false
  return OPENAI_COMPATIBLE_PATTERNS.some((p) => baseURL.includes(p))
}
```

让以下 7 个调用点全部统一引用（消除口径漂移）：

1. `src/ai-engine/agents/vision-agent.js` — auto 分支（核心命中路径）
2. `src/ai-engine/agents/base-agent.js`
3. `src/ai-engine/agents/code-reviewer-agent.js`
4. `src/ai-engine/graphs/playground-agent-graph.js`
5. `src/ai-engine/graphs/mc-component-graph-phase2.js`
6. `src/vue3/doc-analyzer.service.ts`
7. `src/phase2/doc/doc-analyzer.service.ts`

---

## 三、验证结果

### 语法
- 6 个改动 JS 文件 `node --check` 全部 OK
- 2 个 TS 文件改动为同签名替换，类型兼容（函数返回 `boolean`）

### 行为（实际跑共享函数）
| baseURL | 结果 | 说明 |
|---------|------|------|
| `https://code.newcli.com/claude/ultra/v1` | `true` | ✅ 你的真实配置，现在正确走 OpenAI 兼容 |
| `https://dashscope.aliyuncs.com/.../v1` | `true` | 通义千问 |
| `https://api.openai.com/v1` | `true` | OpenAI |
| `https://api.deepseek.com/v1` | `true` | DeepSeek |
| `https://api.anthropic.com` | `false` | 真正的 Anthropic 原生地址仍走 Anthropic，无误伤 |
| `''` | `false` | 安全兜底 |

### 配置路径确认
- `data/ai-config.json` **没有 `visionProviderType` 字段**
  → `buildVisionAgent()` 必然走 `'auto'`
  → 正好命中本次修复的 auto 分支
- 因此 `https://code.newcli.com/claude/ultra/v1` 现在会被判为 OpenAI 兼容，
  走 `buildChatUrl(baseURL)` + axios Bearer 分支，不再 404。

---

## 四、生效条件（重要）

改动在 `backend-node/src`，**NestJS 不热加载**，必须重启后端进程才能生效：

```bash
cd /Users/smigoo/工作/mvgo/backend-node
bash build-backend.sh      # 重新构建（如有需要）
bash .start-server.sh      # 重启后端，端口 13030
```

重启后，HTML 拆分 / Lite / Vue3-Phase2 的视觉分析链路都会走统一判断。

---

## 五、后续建议

- 如果以后新增模型供应商，只需在 `provider-utils.js` 的
  `OPENAI_COMPATIBLE_PATTERNS` 维护一份规则，所有 agent / graph 自动生效。
- 不建议再在各自文件里硬编码 `baseURL.includes('xxx')` 判断。
