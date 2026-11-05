// Q-13 / FR-11：统一导出内容模型 + md / html / word / pdf 四种格式渲染
// 硬约束：
// 1. 所有格式的输入必须来自 draft-store.getExportPayload()（内部已过 assertPublished），
//    双重校验 payload.frozen，草稿态绝不产出可导出文件。
// 2. 跨格式必须保留：内部声明、三态来源、证据引用、人工编辑标记、RunVersion、审计。
// 3. HTML / Word / 打印页一律单文件内联、无外部资源；所有动态值按数据转义，杜绝脚本注入。
// 4. 诚实性：word 是 Word 兼容 HTML `.doc`（非 OOXML .docx）；pdf 是浏览器打印另存（不生成 .pdf 文件）。
// 本文件纯 JS、无 DOM 依赖，Node 冒烟可重复断言（不含时间戳，同 payload 输出确定）。

export const EXPORT_FORMATS = Object.freeze([
  {
    id: 'md',
    label: 'Markdown',
    ext: 'md',
    mime: 'text/markdown',
    mode: 'download',
    ready: true,
    note: '纯文本稿件，含来源标注、证据引用与变更记录'
  },
  {
    id: 'html',
    label: 'HTML',
    ext: 'html',
    mime: 'text/html',
    mode: 'download',
    ready: true,
    note: '单文件内联样式，无外部资源，可离线打开与打印'
  },
  {
    id: 'word',
    label: 'Word',
    ext: 'doc',
    mime: 'application/msword',
    mode: 'download',
    ready: true,
    note: 'Word 兼容 HTML 文档（.doc），非 OOXML .docx'
  },
  {
    id: 'pdf',
    label: 'PDF',
    ext: null,
    mime: 'text/html',
    mode: 'browser_print',
    ready: true,
    note: '打开打印预览，在打印对话框选「另存为 PDF」；不生成 .pdf 文件'
  }
])

export const EXPORT_SCOPES = Object.freeze([
  { id: 'both', label: '稿件 + 字段附录', note: '默认：整合输出稿件全文 + 结构化字段表' },
  { id: 'article', label: '仅整合稿件', note: '只输出成稿正文' },
  { id: 'fields', label: '仅结构化定稿', note: '只输出字段表与审计，不依赖稿件' }
])

export const EXPORT_FORMAT_IDS = Object.freeze(EXPORT_FORMATS.map((f) => f.id))

const SOURCE_MARKS = Object.freeze({
  from_meeting: '来自会议',
  from_background: '来自背景',
  unconfirmed: '未确认'
})

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mdCell(value) {
  return String(value ?? '').replace(/\r/g, '').replace(/\n/g, ' ').replace(/\|/g, '\\|')
}

function sourceOf(state) {
  return SOURCE_MARKS[state] || '未确认'
}

function valueOf(field) {
  return field.value === null || field.value === undefined || String(field.value).trim() === ''
    ? '（未确认 / 值保持 null）'
    : String(field.value)
}

// 轻量 Markdown → HTML：只处理稿件实际会用到的标题 / 列表 / 引用 / 行内 code，先转义再补标签
export function markdownToHtml(markdown) {
  const out = []
  let list = []
  const flush = () => {
    if (!list.length) return
    out.push(`<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>`)
    list = []
  }
  const inline = (text) =>
    escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>')

  String(markdown || '').split('\n').forEach((line) => {
    const t = line.trim()
    if (!t) {
      flush()
      return
    }
    if (/^###\s+/.test(t)) {
      flush()
      out.push(`<h3>${inline(t.replace(/^###\s+/, ''))}</h3>`)
    } else if (/^##\s+/.test(t)) {
      flush()
      out.push(`<h2>${inline(t.replace(/^##\s+/, ''))}</h2>`)
    } else if (/^#\s+/.test(t)) {
      flush()
      out.push(`<h1>${inline(t.replace(/^#\s+/, ''))}</h1>`)
    } else if (/^>\s?/.test(t)) {
      flush()
      out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`)
    } else if (/^[-*]\s+/.test(t)) {
      list.push(inline(t.replace(/^[-*]\s+/, '')))
    } else {
      flush()
      out.push(`<p>${inline(t)}</p>`)
    }
  })
  flush()
  return out.join('\n')
}

function assertPayload(payload) {
  if (!payload || payload.frozen !== true) {
    const error = new Error('草稿态禁止导出：请先确认定稿后再选择导出格式')
    error.code = 'EXPORT_NOT_PUBLISHED'
    throw error
  }
  if (!EXPORT_SCOPES.some((s) => s.id === payload.scope)) {
    const error = new Error(`未知导出内容范围：${payload.scope}`)
    error.code = 'EXPORT_SCOPE_INVALID'
    throw error
  }
  if (payload.scope !== 'fields' && !payload.article?.markdown) {
    const error = new Error('该内容范围需要整合稿件：请先合成输出稿件')
    error.code = 'ARTICLE_EMPTY'
    throw error
  }
}

function scopeLabel(scope) {
  return EXPORT_SCOPES.find((s) => s.id === scope)?.label || scope
}

function auditLines(payload) {
  return (payload.audit || []).map(
    (e) => `- #${e.seq} ${e.at} · ${e.action} · ${e.fieldId || '-'} · ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`
  )
}

function fieldsMarkdown(payload) {
  const lines = [
    '## 结构化字段（含来源标注与证据引用）',
    '',
    '| 字段 | 内容 | 来源 | 确认 | 置信度 | 证据 | 人工修订 |',
    '|---|---|---|---|---|---|---|'
  ]
  ;(payload.fields || []).forEach((f) => {
    lines.push(
      `| ${mdCell(f.label)} | ${mdCell(valueOf(f))} | ${sourceOf(f.sourceState)} | ` +
        `${mdCell(f.confirmState)} | ${f.confidence ?? '—'} | ` +
        `${(f.evidenceRefs || []).map(mdCell).join('、') || '—'} | ${f.humanEdited ? '是' : '否'} |`
    )
    if (f.humanEdited && f.aiValue !== f.value) lines.push(`| ↳ AI 原值 | ${mdCell(f.aiValue)} | | | | | |`)
    if (f.rejectReason) lines.push(`| ↳ 驳回原因 | ${mdCell(f.rejectReason)} | | | | | |`)
  })
  return lines
}

function renderMarkdown(payload) {
  const lines = [
    '# 会议智能纪要 · 内部定稿件',
    '',
    `> ${payload.notice}`,
    '',
    `- RunVersion：\`${payload.runVersion}\``,
    `- 模板：${payload.templateId}`,
    `- 产出语言：${payload.outputLanguage}`,
    `- 定稿时间：${payload.publishedAt}`,
    `- 内容范围：${scopeLabel(payload.scope)}`,
    ''
  ]
  if (payload.scope !== 'fields') {
    lines.push(payload.article.markdown.trim(), '')
  }
  if (payload.scope !== 'article') {
    lines.push(...fieldsMarkdown(payload), '')
  }
  lines.push('## 变更记录（FR-13）', '', `共 ${(payload.audit || []).length} 条 · RunVersion \`${payload.runVersion}\``)
  lines.push(...auditLines(payload), '')
  return `${lines.join('\n').trim()}\n`
}

const BASE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 20px 48px;
  background: #f5f7fa; color: #1f2733;
  font: 14px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.doc { max-width: 880px; margin: 0 auto; background: #fff; border: 1px solid #e2e7ef; border-radius: 10px; padding: 28px 32px; }
h1 { font-size: 22px; margin: 0 0 14px; }
h2 { font-size: 17px; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e7ef; }
h3 { font-size: 14px; margin: 18px 0 6px; color: #3d4757; }
p, li { margin: 5px 0; }
blockquote { margin: 10px 0; padding: 10px 14px; background: #fff5e3; border-left: 3px solid #b8790b; color: #6b4a08; border-radius: 4px; }
.notice { padding: 12px 14px; margin: 12px 0 20px; background: #fdebec; border: 1px solid #f3c2c6; color: #8f2530; border-radius: 6px; font-weight: 500; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 6px 16px; margin: 12px 0 22px; font-size: 12px; color: #667085; }
.meta b { color: #3d4757; font-weight: 500; }
table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12px; }
th, td { border: 1px solid #e2e7ef; padding: 7px 9px; text-align: left; vertical-align: top; word-break: break-word; }
th { background: #f1f4f8; color: #3d4757; font-weight: 500; }
code { background: #f1f4f8; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.audit { font-size: 11px; color: #667085; }
.audit li { margin: 2px 0; }
footer { margin-top: 26px; padding-top: 12px; border-top: 1px dashed #d9e0e9; font-size: 11px; color: #8a94a6; }
.no-print { margin: 0 0 16px; padding: 8px 12px; background: #e8f0fc; color: #1d5fa8; border-radius: 6px; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  body { background: #14161a; color: #e5e9ef; }
  .doc { background: #1c2026; border-color: #2b313a; }
  h3, .meta b { color: #c9d2de; }
  th { background: #20262e; color: #c9d2de; }
  th, td { border-color: #2b313a; }
  code, .meta { background: transparent; }
  code { background: #20262e; }
  blockquote { background: #3a2c12; color: #f0cf8e; }
  .notice { background: #3d1f22; border-color: #6d3038; color: #f0aab0; }
  .no-print { background: #1b2b42; color: #a8c8f0; }
  footer { border-color: #2b313a; }
}
@media print {
  body { background: #fff; color: #000; padding: 0; }
  .doc { border: 0; border-radius: 0; padding: 0; max-width: none; box-shadow: none; }
  .no-print { display: none !important; }
  .notice { background: #fff; border: 1px solid #666; color: #000; }
  blockquote { background: #fff; border-left: 2px solid #666; color: #000; }
  h2 { break-after: avoid; }
  table, tr, td, th { break-inside: avoid; }
  @page { size: A4; margin: 18mm 16mm; }
}
`.trim()

function metaHtml(payload) {
  const items = [
    ['RunVersion', payload.runVersion],
    ['模板', payload.templateId],
    ['产出语言', payload.outputLanguage],
    ['定稿时间', payload.publishedAt],
    ['内容范围', scopeLabel(payload.scope)]
  ]
  if (payload.article?.fingerprint) items.push(['稿件指纹', payload.article.fingerprint])
  return `<div class="meta">${items
    .map(([k, v]) => `<div><b>${escapeHtml(k)}：</b>${escapeHtml(v)}</div>`)
    .join('')}</div>`
}

function fieldsHtml(payload) {
  const rows = (payload.fields || []).map((f) => {
    const extra = []
    if (f.humanEdited && f.aiValue !== f.value) extra.push(`AI 原值：${escapeHtml(f.aiValue)}`)
    if (f.rejectReason) extra.push(`驳回原因：${escapeHtml(f.rejectReason)}`)
    return `<tr>
      <td>${escapeHtml(f.label)}</td>
      <td>${escapeHtml(valueOf(f))}${extra.length ? `<div class="audit">${extra.join(' · ')}</div>` : ''}</td>
      <td>${escapeHtml(sourceOf(f.sourceState))}</td>
      <td>${escapeHtml(f.confirmState)}</td>
      <td>${escapeHtml(f.confidence ?? '—')}</td>
      <td>${(f.evidenceRefs || []).map(escapeHtml).join('、') || '—'}</td>
      <td>${f.humanEdited ? '是' : '否'}</td>
    </tr>`
  })
  return `<h2>结构化字段（含来源标注与证据引用）</h2>
<table><thead><tr><th>字段</th><th>内容</th><th>来源</th><th>确认</th><th>置信度</th><th>证据</th><th>人工修订</th></tr></thead>
<tbody>${rows.join('')}</tbody></table>`
}

function auditHtml(payload) {
  const items = (payload.audit || []).map(
    (e) =>
      `<li>#${escapeHtml(e.seq)} ${escapeHtml(e.at)} · ${escapeHtml(e.action)} · ` +
      `${escapeHtml(e.fieldId || '-')} · ${escapeHtml(JSON.stringify(e.before))} → ${escapeHtml(JSON.stringify(e.after))}</li>`
  )
  return `<h2>变更记录（FR-13）</h2><ul class="audit">${items.join('') || '<li>无</li>'}</ul>`
}

function bodyHtml(payload, { printHint = false } = {}) {
  const parts = [
    printHint
      ? '<div class="no-print">当前为打印预览：请在浏览器打印对话框中选择「另存为 PDF」。本页不会自动下载 .pdf 文件。</div>'
      : '',
    '<h1>会议智能纪要 · 内部定稿件</h1>',
    `<div class="notice">${escapeHtml(payload.notice)}</div>`,
    metaHtml(payload)
  ]
  if (payload.scope !== 'fields') {
    parts.push('<h2>整合输出稿件</h2>', markdownToHtml(payload.article.markdown))
  }
  if (payload.scope !== 'article') {
    parts.push(fieldsHtml(payload))
  }
  parts.push(auditHtml(payload))
  parts.push(
    `<footer>${escapeHtml(payload.notice)}<br>RunVersion ${escapeHtml(payload.runVersion)} · ` +
      `导出物在本地生成，不上传、不外发；格式转换不改写内容、不补写结论。</footer>`
  )
  return `<div class="doc">${parts.join('\n')}</div>`
}

function renderHtml(payload, { word = false, print = false } = {}) {
  // 只加 urn: 命名空间（不引入 http 资源标识），保证导出物无任何外部资源引用
  const ns = word
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"'
    : ''
  const wordHead = word
    ? `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page { size: A4; margin: 2cm; } body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; } table { border-collapse: collapse; } th, td { border: 1px solid #999; }</style>`
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN"${ns}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>会议智能纪要 · 内部定稿件 · ${escapeHtml(payload.runVersion)}</title>
${wordHead}
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml(payload, { printHint: print })}
</body>
</html>
`
}

const RENDERERS = Object.freeze({
  md: renderMarkdown,
  html: (payload) => renderHtml(payload),
  word: (payload) => renderHtml(payload, { word: true }),
  pdf: (payload) => renderHtml(payload, { print: true })
})

/**
 * 统一导出入口：payload 必须来自 draft-store.getExportPayload()（已过 FR-11 发布门禁）。
 * 返回 { format, filename, mime, mode, content, note }；pdf 的 filename 为 null（浏览器打印另存）。
 */
export function exportDocument(payload, formatId) {
  assertPayload(payload)
  const meta = EXPORT_FORMATS.find((f) => f.id === formatId)
  if (!meta) {
    const error = new Error(`不支持的导出格式：${formatId}`)
    error.code = 'EXPORT_FORMAT_UNSUPPORTED'
    throw error
  }
  return {
    format: meta.id,
    label: meta.label,
    filename: meta.ext ? `meeting-draft-${payload.runVersion}.${meta.ext}` : null,
    mime: meta.mime,
    mode: meta.mode,
    content: RENDERERS[meta.id](payload),
    note: meta.note
  }
}
