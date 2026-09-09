/**
 * 统一构建 OpenAI 兼容 chat/completions 完整 URL
 *
 * 兼容用户在配置面板粘贴的多种 Base URL 形态：
 * - https://host/v1                         → https://host/v1/chat/completions
 * - https://host/v1/                        → https://host/v1/chat/completions（去尾斜杠）
 * - https://host/v1/chat/completions        → https://host/v1/chat/completions（不重复拼接）
 * - .../chat/completions/chat/completions   → https://host/v1/chat/completions（截断到第一个出现位置）
 *
 * 背景：用户常把完整 endpoint（含 /chat/completions）粘贴进 Base URL，
 * 若直接 `baseURL + '/chat/completions'` 会拼出双路径 → 404「接口不存在」。
 * 本函数对所有链路（配置测试、文档分析、代码审查、视觉分析）统一归一化。
 *
 * @param {string} baseURL 用户配置的 Base URL（可能为空、带尾斜杠、含完整 endpoint）
 * @returns {string} 完整的 chat/completions URL（空输入返回 '/chat/completions'）
 */
export function buildChatUrl(baseURL) {
  let trimmed = String(baseURL || '').trim().replace(/\/+$/, '')
  // 若已包含 /chat/completions（可能被多次叠加），截断到第一个出现位置之前
  const idx = trimmed.toLowerCase().indexOf('/chat/completions')
  if (idx !== -1) {
    trimmed = trimmed.slice(0, idx).replace(/\/+$/, '')
  }
  // 🆕 纯域名根路径（无任何路径段）自动补 /v1：
  // OpenAI 兼容 API 标准路径是 /v1/chat/completions，但用户常只填域名根（如 https://token.xxx.com），
  // 直接拼 /chat/completions 会 404 或返回网关 HTML（New API 等网关首页）。
  // 仅对「根路径」补 /v1，带自定义路径段（/xxx）的不动，避免误伤。
  try {
    const u = new URL(trimmed)
    if (u.pathname.replace(/\/+$/, '') === '') {
      trimmed = trimmed + '/v1'
    }
  } catch {
    // 非标准 URL（如空串 / 纯相对路径）保持原样
  }
  return trimmed + '/chat/completions'
}

export default { buildChatUrl }
