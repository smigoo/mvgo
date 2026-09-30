// ============================================================
// 剪贴板：带降级路径
// ------------------------------------------------------------
// navigator.clipboard 只在安全上下文（https / localhost）可用，
// 内网 http 访问时它是 undefined —— 必须留一条 execCommand 退路，
// 否则「复制」按钮在真实部署环境会静默失效。
// ============================================================

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_) {
    /* 落到降级路径 */
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (_) {
    return false
  }
}
