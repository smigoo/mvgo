# 文本接口协议（DeepSeek /anthropic）404 根因与修复

## 用户配置
- 文本 Base URL：`https://api.deepseek.com/anthropic`
- 文本接口协议：**Anthropic 原生协议**
- 文本 Model：`deepseek-v4-flash`

## 为什么不通 —— 三个叠加问题

### 1. 你在 UI 选的"Anthropic 原生协议"被代码完全无视
- 前端 `ConfigPanel.vue:365` 有"文本接口协议"下拉，存成 `textProviderType: 'anthropic'`。
- 但后端 `resolveTextConfig()`（`ai-defaults.js`）返回时只回传 `apiKey/baseURL/model`，**把 `providerType` 整个丢掉了**。
- `BaseAgent`（`base-agent.js`）构造时**根本不接收 `providerType`**，只用 URL 字符串猜协议。
- → 下拉框选了等于白选，最终协议由 URL 决定。

### 2. URL 自动识别把 DeepSeek 的 `/anthropic` 路径判反了（主因 404）
- `https://api.deepseek.com/anthropic` 含 `deepseek` 子串 → 旧 `isOpenAICompatibleBaseURL` 返回 `true`。
- 代码因此用 `ChatOpenAI` 去请求 `POST /anthropic/chat/completions`。
- 但 DeepSeek 的 `/anthropic` 路径是 Anthropic 协议专用端点，**只认 `/v1/messages`** → 直接 404。

### 3. 模型名 `deepseek-v4-flash` 很可能不存在（次要）
- DeepSeek 公开模型为 `deepseek-chat` / `deepseek-reasoner`，没有 `deepseek-v4-flash`。
- 即便协议修对，这个名字也会 `model_not_found`。

## 彻底修复（对称于此前 vision 404 修复）

| 文件 | 改动 |
|------|------|
| `ai-engine/utils/provider-utils.js` | `isOpenAICompatibleBaseURL` 新增优先判定：URL 含 `/anthropic` 或 `api.anthropic.com` 直接判为 Anthropic 原生，避免 `/anthropic` 路径被 `deepseek` 子串误判 |
| `ai-engine/utils/ai-defaults.js` | `resolveTextConfig` 透传 `providerType: pick(config.textProviderType, env TEXT_PROVIDER_TYPE, 'auto')` |
| `ai-engine/agents/base-agent.js` | `BaseAgent` 尊重显式 `providerType`（openai-compatible / anthropic / auto 回退 URL 识别） |

## 验证结果
- 三个 JS 文件 `node --check` 全 OK。
- 功能实测：
  - `https://api.deepseek.com/anthropic` → **Anthropic 原生** ✅（此前误判 OpenAI 兼容，正是 404 根因）
  - `https://api.deepseek.com`（OpenAI 基址）→ OpenAI 兼容 ✅（未误伤）
  - `https://code.newcli.com/claude/ultra/v1`（视觉修复）→ OpenAI 兼容 ✅（未回归）
  - `https://api.anthropic.com` → Anthropic 原生 ✅

## 生效前提与提醒
1. **需重启后端**：改动在 `backend-node/src`，NestJS 不热加载，当前运行实例仍是旧代码（按你之前"不要重启服务"的要求，尚未重启）。
2. **模型名请确认**：建议把 `deepseek-v4-flash` 改为 `deepseek-chat` 或 `deepseek-reasoner`，否则协议修对后仍会 model_not_found。
3. 你粘贴的 API Key 未写入任何文件、未用于测试，仅作诊断上下文。
