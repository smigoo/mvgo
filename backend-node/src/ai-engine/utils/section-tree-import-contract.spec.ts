import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

/**
 * A′ Phase 5：section-tree 消费方必须显式 import。
 * 根因：code-generator.js 调用 collectLeafSections 却未 import →
 * generateIndexVue 在 charts 判定处 ReferenceError，任务挂死
 *（mc-max-1789033951504-d1d341ad / dist/code-generator.js:221）。
 */

const SRC_ROOT = join(__dirname, '..')
const SYMBOLS = [
  'collectLeafSections',
  'formatSectionTreeForPrompt',
  'isLayoutContainerSection',
  'findSectionById',
  'collectContainerSections',
]
const SKIP = new Set([
  'section-tree.js',
  'section-tree-import-contract.spec.ts',
])

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist' || name.name === '__tests__') continue
    const full = join(dir, name.name)
    if (name.isDirectory()) walk(full, acc)
    else if (/\.(js|ts)$/.test(name.name) && !/\.spec\./.test(name.name) && !SKIP.has(name.name)) acc.push(full)
  }
  return acc
}

function hasImport(src: string, symbol: string): boolean {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*['"][^'"]*section-tree\\.js['"]`,
  )
  return re.test(src)
}

describe('section-tree 消费方必须 import', () => {
  const files = walk(SRC_ROOT)

  it.each(SYMBOLS)('%s：凡调用必须有 import', (symbol) => {
    const callRe = new RegExp(`\\b${symbol}\\s*\\(`)
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      if (!callRe.test(src)) continue
      if (hasImport(src, symbol)) continue
      offenders.push(relative(SRC_ROOT, file))
    }
    expect(offenders).toEqual([])
  })
})
