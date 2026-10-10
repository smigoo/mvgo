/**
 * 🛡️ U1-lite（2026-10-10）：裸写原生表单控件守卫（纯函数判据，供重试闭环消费）
 *
 * 背景（实锤 c-add-product-3f734e7a / mc-lite-1791599903933-3f734e7a）：
 * lite 微码线产物 12 处裸 <input> / 2 处 <button> / 1 处 <textarea>，
 * 而 antd-mimicry-guard 的库名指纹判据（antd-xxx class）对其完全盲扫——
 * 语义命名（c-add-product-input）不触发指纹。
 *
 * 判据（确定性、零 LLM）：模板中出现裸的 <input / <select / <textarea / <label 标签
 * （<a-input 等 antd 标签天然不匹配——`<` 后是字母 `a`）。
 * label（2026-10-10 · mv-lite-1791600614695-397d13ce 实锤）：LLM 会把控件换成 antd
 * 但保留裸 <label> 行结构（10 处），表单结构层必须由 a-form-item 的 label 属性/#label
 * 插槽承载。<button 暂不判（图标按钮/自定义按钮存在合理场景，避免误伤）。
 *
 * 定位：lite 线无 L0-B 门禁，命中后由调用方（lite.service）触发「带修正指令
 * 的单轮重试」，对比两轮命中数择优；不直接阻断落盘。
 */

const BARE_CONTROL_RX = /<(input|select|textarea|label)(?=[\s/>])/g

/** 单行上下文样本（日志用） */
function sampleAt(text, index) {
  const start = Math.max(0, text.lastIndexOf('\n', index))
  const end = text.indexOf('\n', index)
  const line = text.slice(start === -1 ? 0 : start, end === -1 ? undefined : end)
  return line.trim().slice(0, 80)
}

/**
 * 扫描 SFC 文本中的裸写原生表单控件标签（含裸 <label>——表单行标签必须由 a-form-item 承载）。
 * @param {string} vueCode - 完整 SFC 文本
 * @returns {Array<{tag: string, sample: string}>} 命中清单（每处一条）
 */
export function scanBareFormControls(vueCode) {
  const hits = []
  if (!vueCode || typeof vueCode !== 'string') return hits
  const rx = new RegExp(BARE_CONTROL_RX.source, 'g')
  let m
  while ((m = rx.exec(vueCode)) !== null) {
    hits.push({ tag: m[1], sample: sampleAt(vueCode, m.index) })
  }
  return hits
}

/** 摘要（日志/进度消息用） */
export function summarizeBareFormControls(hits) {
  if (!hits || hits.length === 0) return ''
  const byTag = new Map()
  for (const h of hits) byTag.set(h.tag, (byTag.get(h.tag) || 0) + 1)
  return [...byTag.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `<${tag}>×${n}`)
    .join('、')
}
