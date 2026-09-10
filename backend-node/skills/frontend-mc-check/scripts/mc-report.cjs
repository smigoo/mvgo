#!/usr/bin/env node
/**
 * 微码组件检查报告生成脚本
 * 读取 check-result.json，生成 HTML 和 Markdown 报告
 * 支持 M1~M5 检查项 + Q 系列 AI 质量评分（条件渲染）
 *
 * 用法：
 *   node mc-report.cjs [<check-result.json路径>] [--format html|md|json|all]
 *   node mc-report.cjs                           # 使用最新的检查结果，生成全部格式
 *   node mc-report.cjs --format json             # 仅保留 JSON，不生成 HTML/MD（后端模式）
 *   node mc-report.cjs result.json --format html # 指定输入文件，仅生成 HTML
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../../..')
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc-check-config.json'), 'utf-8'))

const args = process.argv.slice(2)
const formatIdx = args.indexOf('--format')
const FORMAT = formatIdx !== -1 ? args[formatIdx + 1] : 'all'
const INPUT_FILE = args.find((a) => !a.startsWith('--') && a !== FORMAT)

function getLatestCheckResult() {
  const baseDir = path.join(ROOT, CONFIG.reportOutputDir)
  if (!fs.existsSync(baseDir)) return null
  const subdirs = fs
    .readdirSync(baseDir)
    .filter((n) => fs.statSync(path.join(baseDir, n)).isDirectory())
    .sort()
    .reverse()
  for (const sub of subdirs) {
    const candidate = path.join(baseDir, sub, 'check-result.json')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getGradeClass(grade) {
  const map = {
    优秀: 'badge-purple',
    良好: 'badge-blue',
    合格: 'badge-amber',
    待改进: 'badge-gray'
  }
  return map[grade] || 'badge-gray'
}

// 从 results 派生 warning 级结果（warning 级不阻断上线）
function getWarnings(comp) {
  return (comp.results || []).filter((r) => !r.passed && r.level === 'warning')
}

// ─── HTML 报告 ───────────────────────────────────────────────────────────────
function generateHtml(data) {
  const { specVersion, checkedAt, components } = data
  const valid = components.filter((c) => !c.error)
  const canReleaseCount = valid.filter((c) => c.canRelease).length
  const blockedCount = valid.filter((c) => !c.canRelease).length
  const hasAiReview = valid.some((c) => c.aiReview)
  const scoredComponents = valid.filter((c) => c.aiReview)
  const avgScore =
    scoredComponents.length > 0
      ? Math.round(
          scoredComponents.reduce((sum, c) => sum + c.aiReview.totalScore, 0) /
            scoredComponents.length
        )
      : null
  const colCount = hasAiReview ? 9 : 8

  const componentRows = components
    .map((comp) => {
      if (comp.error) {
        return `<tr class="row-error"><td colspan="${colCount}">❌ ${comp.dirName}：${comp.error}</td></tr>`
      }
      const releaseClass = comp.canRelease ? 'badge-green' : 'badge-red'
      const releaseText = comp.canRelease ? '✅ 允许上线' : '❌ 不允许上线'
      const detailId = `detail-${comp.dirName}`
      const failedResults = comp.results.filter((r) => !r.passed && r.level !== 'warning')
      const warnings = getWarnings(comp)

      const detailRows = failedResults
        .map(
          (r) => `
      <tr class="check-fail"><td>${r.id}</td><td>${r.name}</td><td>❌ 失败</td><td>${escapeHtml(r.message)}</td></tr>`
        )
        .join('')
      const warningRows = warnings
        .map((w) => `<tr class="check-warn"><td>${w.id}</td><td>${w.name}</td><td>⚠️ 警告</td><td>${escapeHtml(w.message)}</td></tr>`)
        .join('')

      let qualityDetail = ''
      if (comp.aiReview) {
        const ai = comp.aiReview
        const qRows = Object.entries(ai.scores)
          .map(([key, cat]) => {
            let detailStr = ''
            if (cat.details && cat.details.length > 0) {
              detailStr = cat.details.map((d) => `${d.id} ${d.name} ${d.score}/${d.max}`).join('; ')
            } else {
              detailStr = `得分 ${cat.score}/${cat.max}`
            }
            return `<tr><td>${key} ${escapeHtml(cat.name)}</td><td>${cat.score}</td><td>${cat.max}</td><td>${escapeHtml(detailStr)}</td></tr>`
          })
          .join('')
        const sugHtml =
          ai.suggestions && ai.suggestions.length > 0
            ? `<h4 style="margin-top:12px;font-size:13px;font-weight:600;color:#475569">改进建议</h4><ul class="suggestion-list">${ai.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
            : ''
        qualityDetail = `<div class="quality-section"><h4>质量评分明细 — ${ai.totalScore}/100 (${ai.grade})</h4>
        <table class="detail-table"><thead><tr><th>维度</th><th>得分</th><th>满分</th><th>明细</th></tr></thead>
        <tbody>${qRows}</tbody></table>${sugHtml}</div>`
      }

      const hasDetail = failedResults.length > 0 || warnings.length > 0 || comp.aiReview
      const expandable = hasDetail ? `onclick="toggleDetail('${detailId}')"` : ''
      const expandHint = hasDetail ? ' <span class="expand-hint">▶</span>' : ''
      const qualityCell = hasAiReview
        ? comp.aiReview
          ? `<td><span class="badge ${getGradeClass(comp.aiReview.grade)}">${comp.aiReview.totalScore}/100 ${comp.aiReview.grade}</span></td>`
          : `<td class="muted">-</td>`
        : ''

      return `
    <tr class="comp-row" ${expandable}>
      <td><code>${comp.dirName}</code>${expandHint}</td>
      <td>${comp.componentName || '-'}</td><td>${comp.version || '-'}</td>
      <td class="total">${comp.totalChecks || comp.passCount + comp.failCount + warnings.length}</td>
      <td class="pass">${comp.passCount}</td><td class="fail">${comp.failCount}</td>
      <td class="warn">${warnings.length || '-'}</td>
      <td><span class="badge ${releaseClass}">${releaseText}</span></td>${qualityCell}
    </tr>
    <tr id="${detailId}" class="detail-row" style="display:none"><td colspan="${colCount}">
      <table class="detail-table"><thead><tr><th>ID</th><th>检查项</th><th>结果</th><th>说明</th></tr></thead>
      <tbody>${detailRows}${warningRows}</tbody></table>${qualityDetail}
    </td></tr>`
    })
    .join('')

  const avgCard =
    avgScore !== null
      ? `<div class="stat-card purple"><div class="num">${avgScore}</div><div class="label">平均质量评分</div></div>`
      : ''
  const qualityColHeader = hasAiReview ? '<th>质量评分</th>' : ''

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>微码组件规范检查报告</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b}
.header{background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:32px 40px}
.header h1{font-size:24px;font-weight:700;margin-bottom:8px}
.header .meta{font-size:13px;opacity:.8}
.summary{display:flex;gap:16px;padding:24px 40px;flex-wrap:wrap}
.stat-card{background:#fff;border-radius:12px;padding:20px 28px;flex:1;min-width:140px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
.stat-card .num{font-size:32px;font-weight:700}.stat-card .label{font-size:13px;color:#64748b;margin-top:4px}
.stat-card.green .num{color:#22c55e}.stat-card.red .num{color:#ef4444}.stat-card.blue .num{color:#3b82f6}.stat-card.purple .num{color:#8b5cf6}
.content{padding:0 40px 40px}
.section-title{font-size:16px;font-weight:600;margin:24px 0 12px;color:#334155}
.note{font-size:13px;color:#64748b;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th{background:#f1f5f9;padding:12px 16px;text-align:left;font-size:13px;color:#475569;font-weight:600}
td{padding:12px 16px;font-size:13px;border-top:1px solid #f1f5f9}
.comp-row{cursor:pointer;transition:background .15s}.comp-row:hover{background:#f8fafc}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;color:#fff;font-size:12px;font-weight:600}
.badge-green{background:#22c55e}.badge-red{background:#ef4444}.badge-purple{background:#8b5cf6}.badge-blue{background:#3b82f6}.badge-amber{background:#f59e0b}.badge-gray{background:#6b7280}
.total{color:#3b82f6;font-weight:600}.pass{color:#22c55e;font-weight:600}.fail{color:#ef4444;font-weight:600}.warn{color:#f59e0b;font-weight:600}.muted{color:#94a3b8}
.expand-hint{font-size:10px;color:#94a3b8;margin-left:4px}
.detail-row td{background:#f8fafc;padding:12px 24px}
.detail-table{box-shadow:none;border:1px solid #e2e8f0}.detail-table th{background:#e2e8f0}
.check-fail td{color:#991b1b;background:#fef2f2}.check-warn td{color:#92400e;background:#fffbeb}.row-error td{color:#991b1b;background:#fef2f2}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px}
.footer{text-align:center;padding:24px;font-size:12px;color:#94a3b8}
.quality-section{margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0}
.quality-section h4{font-size:13px;font-weight:600;color:#475569;margin-bottom:8px}
.suggestion-list{margin-top:8px;padding-left:16px}.suggestion-list li{font-size:12px;color:#64748b;margin:4px 0}
</style></head><body>
<div class="header"><h1>微码组件规范检查报告</h1>
<div class="meta">规范版本：${specVersion} | 检查时间：${new Date(checkedAt).toLocaleString('zh-CN')} | 共检查 ${valid.length} 个组件</div></div>
<div class="summary">
<div class="stat-card blue"><div class="num">${valid.length}</div><div class="label">检查组件数</div></div>
<div class="stat-card green"><div class="num">${canReleaseCount}</div><div class="label">允许上线</div></div>
<div class="stat-card red"><div class="num">${blockedCount}</div><div class="label">不允许上线</div></div>${avgCard}</div>
<div class="content">
<div class="section-title">检查结果（点击行展开详情）</div>
<p class="note">必须项需 100% 通过才允许上线。质量评分由 AI 审查，不影响上线判断。</p>
<table><thead><tr><th>组件目录</th><th>组件名称</th><th>版本</th><th>检查项</th><th>通过</th><th>失败</th><th>警告</th><th>上线状态</th>${qualityColHeader}</tr></thead>
<tbody>${componentRows}</tbody></table></div>
<div class="footer">由 微码平台 脚本生成 | 规范版本 ${specVersion}</div>
<script>function toggleDetail(id){const el=document.getElementById(id);el.style.display=el.style.display==='none'?'table-row':'none'}</script>
</body></html>`
}

// ─── Markdown 报告 ───────────────────────────────────────────────────────────
function generateMarkdown(data) {
  const { specVersion, checkedAt, components } = data
  const valid = components.filter((c) => !c.error)
  const canReleaseCount = valid.filter((c) => c.canRelease).length
  const blockedCount = valid.filter((c) => !c.canRelease).length
  const hasAiReview = valid.some((c) => c.aiReview)

  let md = `# 微码组件规范检查报告\n\n`
  md += `> 规范版本：${specVersion} | 检查时间：${new Date(checkedAt).toLocaleString('zh-CN')} | 共检查 ${valid.length} 个组件\n\n`
  md += `## 汇总\n\n| 检查组件数 | 允许上线 | 不允许上线 |\n|---|---|---|\n| ${valid.length} | ${canReleaseCount} | ${blockedCount} |\n\n`
  md += `## 检查结果\n\n`

  const qCol = hasAiReview ? ' 质量评分 |' : ''
  const qSep = hasAiReview ? '---|' : ''
  md += `| 组件目录 | 组件名称 | 版本 | 检查项 | 通过 | 失败 | 警告 | 上线状态 |${qCol}\n`
  md += `|---|---|---|---|---|---|---|---|${qSep}\n`

  valid.forEach((comp) => {
    const status = comp.canRelease ? '✅ 允许上线' : '❌ 不允许上线'
    const totalChecks = comp.totalChecks || comp.passCount + comp.failCount + getWarnings(comp).length
    const qCell = hasAiReview
      ? comp.aiReview
        ? ` ${comp.aiReview.totalScore}/100 ${comp.aiReview.grade} |`
        : ' - |'
      : ''
    md += `| \`${comp.dirName}\` | ${comp.componentName || '-'} | ${comp.version || '-'} | ${totalChecks} | ${comp.passCount} | ${comp.failCount} | ${getWarnings(comp).length || '-'} | ${status} |${qCell}\n`
  })

  const blocked = valid.filter((c) => !c.canRelease)
  if (blocked.length > 0) {
    md += `\n## 失败项明细\n\n`
    blocked.forEach((comp) => {
      md += `### ${comp.dirName}\n\n`
      comp.results
        .filter((r) => !r.passed && r.level !== 'warning')
        .forEach((r) => {
          md += `- **[${r.id}] ${r.name}**：${r.message}\n`
        })
      getWarnings(comp).forEach((w) => (md += `- ⚠️ **[${w.id}] ${w.name}**：${w.message}\n`))
      md += '\n'
    })
  }

  const withWarnings = valid.filter((c) => c.canRelease && getWarnings(c).length > 0)
  if (withWarnings.length > 0) {
    md += `## 警告项（允许上线，建议修复）\n\n`
    withWarnings.forEach((comp) => {
      md += `### ${comp.dirName}\n\n`
      getWarnings(comp).forEach((w) => (md += `- ⚠️ **[${w.id}] ${w.name}**：${w.message}\n`))
      md += '\n'
    })
  }

  const scored = valid.filter((c) => c.aiReview)
  if (scored.length > 0) {
    md += `## 质量评分明细\n\n`
    scored.forEach((comp) => {
      const ai = comp.aiReview
      md += `### ${comp.dirName} — ${ai.totalScore}/100 (${ai.grade})\n\n`
      md += `| 维度 | 得分 | 满分 | 说明 |\n|---|---|---|---|\n`
      Object.entries(ai.scores).forEach(([key, cat]) => {
        // 优先使用 details 生成说明，否则使用 scores 摘要
        let detailStr = ''
        if (cat.details && cat.details.length > 0) {
          detailStr = cat.details.map((x) => `${x.id} ${x.name} ${x.score}/${x.max}`).join('; ')
        } else {
          // 缺少 details 时自动生成说明
          detailStr = `得分 ${cat.score}/${cat.max}`
        }
        md += `| ${key} ${cat.name} | ${cat.score} | ${cat.max} | ${detailStr} |\n`
      })
      if (ai.suggestions && ai.suggestions.length > 0) {
        md += `\n**改进建议：**\n`
        ai.suggestions.forEach((s) => (md += `- ${s}\n`))
      }
      md += '\n'
    })
  }

  md += `---\n*由 微码平台 脚本生成，规范版本 ${specVersion}*\n`
  return md
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
function generateReport(resultFilePath, format = 'all') {
  const resultFile = resultFilePath || getLatestCheckResult()
  if (!resultFile) {
    console.error('未找到检查结果文件，请先运行 mc-check.cjs')
    process.exit(1)
  }
  const reportDir = path.dirname(resultFile)
  const data = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
  const prefix = CONFIG.reportFilePrefix || ''

  // format 参数：json | html | md | all
  // json: 仅保留 JSON 文件，不生成其他格式（后端模式）
  // html: 仅生成 HTML
  // md: 仅生成 Markdown
  // all: 生成 HTML + Markdown（默认，前端模式）
  const outputFormat = format || 'all'

  if (outputFormat === 'json') {
    console.log(`✅ JSON 结果已保存：${resultFile}（跳过 HTML/MD 生成）`)
    return
  }

  if (outputFormat === 'html' || outputFormat === 'all') {
    const outPath = path.join(reportDir, `${prefix}report.html`)
    fs.writeFileSync(outPath, generateHtml(data))
    console.log(`✅ HTML 报告已生成：${outPath}`)
  }
  if (outputFormat === 'md' || outputFormat === 'all') {
    const outPath = path.join(reportDir, `${prefix}report.md`)
    fs.writeFileSync(outPath, generateMarkdown(data))
    console.log(`✅ Markdown 报告已生成：${outPath}`)
  }
}

if (require.main === module) {
  const inputFile = INPUT_FILE && fs.existsSync(INPUT_FILE) ? INPUT_FILE : null
  generateReport(inputFile, FORMAT)
}

module.exports = { generateReport, getLatestCheckResult }
