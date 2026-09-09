/**
 * Provider 类型判断统一工具
 *
 * 判定给定 baseURL 是否应走 OpenAI 兼容协议（/v1/chat/completions），
 * 而非 Anthropic 原生 Messages API。
 *
 * 这是全链路唯一判断入口。历史上 vision-agent / base-agent / code-reviewer /
 * graph / doc-analyzer 各自硬编码判断规则，导致视觉链漏判 `/v1` 网关
 * （如 https://code.newcli.com/claude/ultra/v1），被错误当作 Anthropic 原生
 * 接口请求 → 404 / MODEL_NOT_FOUND。统一后任何新网关只需在此维护一份规则。
 */

// 规则取历史所有调用点的并集，避免缩小既有匹配导致回归：
// dashscope / openai / deepseek / api.deepseek.com / openai. / /v1
const OPENAI_COMPATIBLE_PATTERNS = [
  '/v1',
  'openai.com',
  'openai.',
  'dashscope',
  'deepseek',
]

export function isOpenAICompatibleBaseURL(baseURL) {
  if (!baseURL || typeof baseURL !== 'string') return false
  // 优先判定 Anthropic 原生路径：含 /anthropic 或 api.anthropic.com 的地址
  // （如 https://api.deepseek.com/anthropic 是 DeepSeek 提供的 Anthropic 兼容端点，
  //  虽含 deepseek 子串，但只接受 /v1/messages，不能按 OpenAI 兼容处理）
  if (baseURL.includes('/anthropic') || baseURL.includes('api.anthropic.com')) {
    return false
  }
  // 含 /chat/completions 的地址必然是 OpenAI 兼容协议（Anthropic 原生走 /v1/messages）。
  // 覆盖智谱 bigmodel.cn（/api/paas/v4/chat/completions，v4 而非 v1）、
  // 以及各种中转网关等未被下面固定模式命中的情况 —— 之前 GLM 因此被误判为 Anthropic，
  // 走 ChatAnthropic 拼 /v1/messages → 404 /v4/chat/completions/v1/messages。
  if (baseURL.includes('chat/completions')) {
    return true
  }
  return OPENAI_COMPATIBLE_PATTERNS.some((pattern) => baseURL.includes(pattern))
}
