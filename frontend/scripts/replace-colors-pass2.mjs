#!/usr/bin/env node
/**
 * 颜色变量替换第二轮 — 上下文敏感的替换
 * 处理 #fff/#ffffff（根据 CSS 属性判断语义）和其他第一轮未覆盖的颜色
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const EXCLUDE_DIRS = [
  'workspace/custom-components',
  'workspace/vue3-components',
  'node_modules',
  '.workbuddy',
]

function processLine(line) {
  let result = line
  let changes = 0

  // #fff / #ffffff — 根据 CSS 属性判断语义
  // background / background-color: #fff → var(--bg-card)
  if (/background(?:-color)?\s*:\s*#fff(?:fff)?(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#fff(?:fff)?(?![0-9a-fA-F])/gi, 'var(--bg-card)')
    changes++
  }
  // color: #fff → var(--text-inverse) (白字通常在深色背景上)
  else if (/^\s*color\s*:\s*#fff(?:fff)?(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#fff(?:fff)?(?![0-9a-fA-F])/gi, 'var(--text-inverse)')
    changes++
  }
  // border.*: #fff → var(--border-default) 不太对，保持不变
  // box-shadow 中的 #fff 保持不变

  // #000 / #000000 — 文字色
  if (/^\s*color\s*:\s*#000(?:000)?(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#000(?:000)?(?![0-9a-fA-F])/gi, 'var(--text-primary)')
    changes++
  }

  // #222 → text-primary
  if (/#222(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#222(?![0-9a-fA-F])/gi, 'var(--text-primary)')
    changes++
  }
  if (/#222222(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#222222(?![0-9a-fA-F])/gi, 'var(--text-primary)')
    changes++
  }

  // #262626 → text-primary (if color) or bg (if background)
  if (/#262626(?![0-9a-fA-F])/.test(result)) {
    if (/color\s*:/i.test(result) && !/background/i.test(result)) {
      result = result.replace(/#262626(?![0-9a-fA-F])/gi, 'var(--text-primary)')
      changes++
    }
  }

  // #595959 → text-secondary
  if (/#595959(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#595959(?![0-9a-fA-F])/gi, 'var(--text-secondary)')
    changes++
  }

  // #434343 → text-secondary
  if (/#434343(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#434343(?![0-9a-fA-F])/gi, 'var(--text-secondary)')
    changes++
  }

  // #1f1f1f → text-primary
  if (/#1f1f1f(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#1f1f1f(?![0-9a-fA-F])/gi, 'var(--text-primary)')
    changes++
  }

  // #2d3748 → text-primary
  if (/#2d3748(?![0-9a-fA-F])/.test(result)) {
    if (/background/i.test(result)) {
      result = result.replace(/#2d3748(?![0-9a-fA-F])/gi, 'var(--bg-elevated)')
    } else {
      result = result.replace(/#2d3748(?![0-9a-fA-F])/gi, 'var(--text-primary)')
    }
    changes++
  }

  // #374151 → text-secondary
  if (/#374151(?![0-9a-fA-F])/.test(result) && /color\s*:/i.test(result)) {
    result = result.replace(/#374151(?![0-9a-fA-F])/gi, 'var(--text-secondary)')
    changes++
  }

  // #86909c → text-tertiary
  if (/#86909c(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#86909c(?![0-9a-fA-F])/gi, 'var(--text-tertiary)')
    changes++
  }

  // #c8cdd6 → border-default
  if (/#c8cdd6(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#c8cdd6(?![0-9a-fA-F])/gi, 'var(--border-default)')
    changes++
  }

  // #e8ecf1 → border-default
  if (/#e8ecf1(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#e8ecf1(?![0-9a-fA-F])/gi, 'var(--border-default)')
    changes++
  }

  // #f8f9fa → bg-hover
  if (/#f8f9fa(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#f8f9fa(?![0-9a-fA-F])/gi, 'var(--bg-hover)')
    changes++
  }

  // #2196f3 → brand-light
  if (/#2196f3(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#2196f3(?![0-9a-fA-F])/gi, 'var(--brand-light)')
    changes++
  }

  // #409eff → brand-light
  if (/#409eff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#409eff(?![0-9a-fA-F])/gi, 'var(--brand-light)')
    changes++
  }

  // #0958d9 → brand-hover
  if (/#0958d9(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#0958d9(?![0-9a-fA-F])/gi, 'var(--brand-hover)')
    changes++
  }

  // #40a9ff → brand-light
  if (/#40a9ff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#40a9ff(?![0-9a-fA-F])/gi, 'var(--brand-light)')
    changes++
  }

  // #1890ff → brand (Ant Design v4 blue)
  if (/#1890ff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#1890ff(?![0-9a-fA-F])/gi, 'var(--brand)')
    changes++
  }

  // #1677ff → brand (Ant Design v5 blue)
  if (/#1677ff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#1677ff(?![0-9a-fA-F])/gi, 'var(--brand)')
    changes++
  }

  // #4096ff → brand-light
  if (/#4096ff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#4096ff(?![0-9a-fA-F])/gi, 'var(--brand-light)')
    changes++
  }

  // #91caff → c-blue-200
  if (/#91caff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#91caff(?![0-9a-fA-F])/gi, 'var(--c-blue-200)')
    changes++
  }

  // #bfdbfe → c-blue-100
  if (/#bfdbfe(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#bfdbfe(?![0-9a-fA-F])/gi, 'var(--c-blue-100)')
    changes++
  }

  // #dbeafe → c-blue-100
  if (/#dbeafe(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#dbeafe(?![0-9a-fA-F])/gi, 'var(--c-blue-100)')
    changes++
  }

  // #eff6ff → brand-bg
  if (/#eff6ff(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#eff6ff(?![0-9a-fA-F])/gi, 'var(--brand-bg)')
    changes++
  }

  // #667eea → feature (gradient purple-blue)
  // skip — decorative gradient, leave as-is

  // #4caf50 → success
  if (/#4caf50(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#4caf50(?![0-9a-fA-F])/gi, 'var(--success)')
    changes++
  }

  // #10b981 → success-light
  if (/#10b981(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#10b981(?![0-9a-fA-F])/gi, 'var(--success-light)')
    changes++
  }

  // #059669 → success
  if (/#059669(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#059669(?![0-9a-fA-F])/gi, 'var(--success)')
    changes++
  }

  // #2BB47A → success
  if (/#2BB47A(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#2BB47A(?![0-9a-fA-F])/gi, 'var(--success)')
    changes++
  }

  // #2B7A4F → success
  if (/#2B7A4F(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#2B7A4F(?![0-9a-fA-F])/gi, 'var(--success)')
    changes++
  }

  // #0fcd7d → success-light
  if (/#0fcd7d(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#0fcd7d(?![0-9a-fA-F])/gi, 'var(--success-light)')
    changes++
  }

  // #48bb78 → success-light
  if (/#48bb78(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#48bb78(?![0-9a-fA-F])/gi, 'var(--success-light)')
    changes++
  }

  // #e74c3c → error
  if (/#e74c3c(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#e74c3c(?![0-9a-fA-F])/gi, 'var(--error)')
    changes++
  }

  // #e53e3e → error
  if (/#e53e3e(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#e53e3e(?![0-9a-fA-F])/gi, 'var(--error)')
    changes++
  }

  // #f56565 → error-light
  if (/#f56565(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#f56565(?![0-9a-fA-F])/gi, 'var(--error-light)')
    changes++
  }

  // #d32f2f → error-text
  if (/#d32f2f(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#d32f2f(?![0-9a-fA-F])/gi, 'var(--error-text)')
    changes++
  }

  // #C53030 → error-text
  if (/#C53030(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#C53030(?![0-9a-fA-F])/gi, 'var(--error-text)')
    changes++
  }

  // #f39c12 → warning-light
  if (/#f39c12(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#f39c12(?![0-9a-fA-F])/gi, 'var(--warning-light)')
    changes++
  }

  // #fbbf24 → c-yellow-400
  if (/#fbbf24(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#fbbf24(?![0-9a-fA-F])/gi, 'var(--c-yellow-400)')
    changes++
  }

  // #764ba2 → feature (gradient)
  if (/#764ba2(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#764ba2(?![0-9a-fA-F])/gi, 'var(--feature)')
    changes++
  }

  // #9c27b0 → feature
  if (/#9c27b0(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#9c27b0(?![0-9a-fA-F])/gi, 'var(--feature)')
    changes++
  }

  // #ec4899 → c-purple-500 (pink)
  if (/#ec4899(?![0-9a-fA-F])/i.test(result)) {
    result = result.replace(/#ec4899(?![0-9a-fA-F])/gi, 'var(--c-purple-500)')
    changes++
  }

  // rgba(24,144,255,...) — Ant Design blue
  if (/rgba\(\s*24\s*,\s*144\s*,\s*255\s*,/i.test(result)) {
    result = result.replace(/rgba\(\s*24\s*,\s*144\s*,\s*255\s*,\s*0?\.?2\s*\)/gi, 'var(--brand-border)')
    changes++
  }

  return { line: result, changes }
}

function walkDir(dir, exts, base) {
  const results = []
  const items = fs.readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    const relPath = path.relative(base, fullPath)

    if (item.isDirectory()) {
      if (EXCLUDE_DIRS.some(ex => relPath.replace(/\\/g, '/').startsWith(ex))) continue
      if (item.name === 'node_modules' || item.name === '.git') continue
      results.push(...walkDir(fullPath, exts, base))
    } else if (exts.some(ext => item.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }

  return results
}

function main() {
  const srcDir = path.join(ROOT, 'src')
  const files = walkDir(srcDir, ['.vue', '.less'], srcDir)

  console.log(`Found ${files.length} files to process`)

  let totalChanges = 0
  let filesChanged = 0
  const report = []

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf-8')
    const lines = original.split('\n')
    let changes = 0

    const processedLines = lines.map(line => {
      const { line: processed, changes: c } = processLine(line)
      changes += c
      return processed
    })

    if (changes > 0) {
      fs.writeFileSync(file, processedLines.join('\n'), 'utf-8')
      totalChanges += changes
      filesChanged++
      const relPath = path.relative(ROOT, file)
      report.push({ file: relPath, changes })
    }
  }

  report.sort((a, b) => b.changes - a.changes)

  console.log(`\nDone! ${totalChanges} replacements in ${filesChanged} files\n`)
  console.log('Top 20 files by changes:')
  report.slice(0, 20).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.file}: ${r.changes} replacements`)
  })

  if (report.length > 20) {
    console.log(`  ... and ${report.length - 20} more files`)
  }
}

main()
