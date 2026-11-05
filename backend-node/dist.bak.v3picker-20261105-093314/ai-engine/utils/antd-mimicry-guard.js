/**
 * 🛡️ U1（2026-10-09）：antd 手写模仿指纹守卫（只留痕，不阻断）
 *
 * 背景（实锤 c-c19746-c1974689）：明明是表单类组件，代码生成却「半真半假」——
 * a-input/a-select 等用了真组件，但 form-item 结构 / upload 上传区手写 div 模仿，
 * class 名出现 `c-c19746-antd-form-item` / `c-c19746-ant-design-vue-upload`。
 *
 * 判据（确定性、零 LLM）：产物 class 名 / 样式选择器中出现以 `antd` 或 `ant-design-vue`
 * 库名为词根的 token。正常业务样式不会用组件库名命名自己的 class——这是「手写模仿
 * antd DOM 结构」的确定性指纹。
 *
 * 定位：与 flex-shrink-guard 同模式——只告警留痕（meta.antdMimicryIssues），不阻断落盘。
 * 治本在 prompt 层（prompt-builder U1 段 / preview-analysis schema 的 control 标注）。
 */

const MIMICRY_TOKEN_RX = /^(?:[a-zA-Z0-9_-]*[-_])?(?:antd|ant-design-vue)(?:[-_][a-zA-Z0-9_-]+)+$/

/** class 属性值（静态）提取：class="..."；:class 绑定跳过（WP4 同款负向后行排除动态绑定） */
const CLASS_ATTR_RX = /\bclass="([^"]*)"/g
/** CSS 选择器行：.token 形态（.less/.css/.vue style 块通用粗筛） */
const CSS_CLASS_RX = /\.[a-zA-Z][a-zA-Z0-9_-]*/g

function isMimicryToken(token) {
  if (!token || token.length < 6) return false
  return MIMICRY_TOKEN_RX.test(token)
}

function collectFromText(text, rx, onHit) {
  let m
  const rxLocal = new RegExp(rx.source, rx.flags)
  while ((m = rxLocal.exec(text)) !== null) {
    onHit(m)
  }
}

/**
 * 扫描产物中的 antd 手写模仿指纹。
 * ⚠️ 输入双形态归一（2026-10-09 · mc-max-1791528133746-17b69623 实锤）：
 *   graph 接线传的是 `Array<{path, content}>`，而本函数最初按 `Record<path, content>`
 *   设计——数组形态下 Object.entries 拿到索引 key、content 是 {path,content} 对象，
 *   `typeof !== 'string'` 全跳过 ⇒ **运行时恒扫空**（spec 用对象形态所以全绿）。
 *   现在两种形态都接受，杜绝再犯。
 * @param {Record<string,string>|Array<{path:string,content:string}>} files
 * @returns {{ issues: Array<{file:string, token:string, kind:'template'|'style', sample:string}> }}
 */
export function scanAntdMimicry(files) {
  const issues = []
  if (!files || typeof files !== 'object') return { issues }

  // 双形态归一：数组 [{path,content}] → Record<path,content>；Record 原样
  const entries =
    Array.isArray(files)
      ? files
          .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
          .map((f) => [f.path, f.content])
      : Object.entries(files).filter(([, c]) => typeof c === 'string')

  for (const [filePath, content] of entries) {
    if (typeof content !== 'string') continue
    const seen = new Map() // token → kind
    const record = (token, kind) => {
      if (!isMimicryToken(token)) return
      if (!seen.has(token)) seen.set(token, kind)
    }

    // 1. 模板 class 属性（静态 class="..."）
    collectFromText(content, CLASS_ATTR_RX, (m) => {
      for (const token of String(m[1] || '').split(/\s+/)) record(token, 'template')
    })
    // 2. 样式选择器（.token）
    if (/\.(vue|less|css)$/.test(filePath)) {
      collectFromText(content, CSS_CLASS_RX, (m) => record(String(m[0]).slice(1), 'style'))
    }

    for (const [token, kind] of seen) {
      issues.push({ file: filePath, token, kind, sample: token })
    }
  }
  return { issues }
}

/**
 * 摘要（日志/进度消息用）
 */
export function summarizeAntdMimicryIssues(issues) {
  if (!issues || issues.length === 0) return ''
  const byFile = new Map()
  for (const it of issues) byFile.set(it.file, (byFile.get(it.file) || 0) + 1)
  const top = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, n]) => `${f.split('/').pop()}×${n}`)
  return `${issues.length} 处（${top.join('、')}）`
}
