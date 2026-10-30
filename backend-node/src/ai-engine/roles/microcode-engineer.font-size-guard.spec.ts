/**
 * 🛡️ 字号下限守卫 —— max 链路（Figma / mc-gen）接线契约
 *
 * 历史缺口：守卫实现原本内联在 `microcode-engineer.js` 里，只有 `writeFiles` 后处理链会调用它，
 * 于是 Lite 链路（自己 writeFileSync 落盘、全库不调 writeFiles）整条裸奔。
 * 2026-10-30 治本：实现提为单一来源 `utils/font-size-guard.js`，engineer 与 lite 共用。
 *
 * 本 spec 只负责「engineer 这一侧是否真按单一来源接线」，纯函数行为见
 * `utils/font-size-guard.spec.ts`，Lite 侧见 `lite/lite.font-size-guard-wiring.spec.ts`。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const ENGINEER_PATH = join(__dirname, 'microcode-engineer.js')
const src = readFileSync(ENGINEER_PATH, 'utf-8')

describe('microcode-engineer 字号守卫接线契约', () => {
  it('从单一来源导入 ensureMinFontSize / formatFontGuardLog', () => {
    expect(src).toContain("from '../utils/font-size-guard.js'")
    expect(src).toMatch(/import\s*\{[\s\S]{0,200}ensureMinFontSize[\s\S]{0,200}\}\s*from\s*'\.\.\/utils\/font-size-guard\.js'/)
    expect(src).toContain('formatFontGuardLog')
  })

  it('禁止在 engineer 内再写一份局部实现（单一来源硬约束）', () => {
    // 局部 `function ensureMinFontSize(` 定义一旦回归，这里立刻红
    expect(src).not.toMatch(/^\s*function ensureMinFontSize\s*\(/m)
  })

  it('禁止在 engineer 内自行拼 minRatio / 常量（必须由 formatFontGuardLog 统一产出）', () => {
    expect(src).not.toContain('MIN_BODY_FONT_RATIO')
  })

  it('writeFiles 后处理链调用守卫，且用 max tag', () => {
    expect(src).toMatch(/const\s+_fontGuard\s*=\s*ensureMinFontSize\(targetFiles\)/)
    expect(src).toContain("formatFontGuardLog(_fontGuard, 'max')")
  })

  it('日志无条件打（禁止 changes>0 才打：那会让「没接线」与「零命中」同形）', () => {
    expect(src).not.toMatch(/_fontGuard\.changes\.length\s*>\s*0/)
    // 日志调用必须紧跟在守卫结果之后，不受任何条件包裹
    const idxGuard = src.indexOf('const _fontGuard = ensureMinFontSize(targetFiles)')
    const idxLog = src.indexOf("formatFontGuardLog(_fontGuard, 'max')")
    expect(idxGuard).toBeGreaterThan(-1)
    expect(idxLog).toBeGreaterThan(idxGuard)
    const between = src.slice(idxGuard, idxLog)
    expect(between).not.toMatch(/if\s*\(/)
  })
})

describe('阳性对照：篡改源码必须让上面的断言失败', () => {
  // 用「改写后的源码字符串」复跑同款断言，证明断言真的有牙而不是恒真
  const mutAssert = (mutated: string) => {
    const ok =
      mutated.includes("from '../utils/font-size-guard.js'") &&
      !/^\s*function ensureMinFontSize\s*\(/m.test(mutated) &&
      !mutated.includes('MIN_BODY_FONT_RATIO') &&
      /const\s+_fontGuard\s*=\s*ensureMinFontSize\(targetFiles\)/.test(mutated) &&
      mutated.includes("formatFontGuardLog(_fontGuard, 'max')")
    return ok
  }

  it('原源码 → 通过', () => {
    expect(mutAssert(src)).toBe(true)
  })

  it('变异①：把局部实现塞回去 → 打红', () => {
    const mutated = `${src}\nfunction ensureMinFontSize(files) { return files }\n`
    expect(mutAssert(mutated)).toBe(false)
  })

  it('变异②：改回自拼 minRatio 常量 → 打红', () => {
    const mutated = src.replace('formatFontGuardLog(_fontGuard, \'max\')', 'MIN_BODY_FONT_RATIO')
    expect(mutAssert(mutated)).toBe(false)
  })

  it('变异③：删掉守卫调用 → 打红', () => {
    const mutated = src.replace(
      'const _fontGuard = ensureMinFontSize(targetFiles)',
      'const _fontGuard = { files: targetFiles, changes: [] }',
    )
    expect(mutAssert(mutated)).toBe(false)
  })

  it('变异④：tag 改成 lite（链路混淆）→ 打红', () => {
    const mutated = src.replace("formatFontGuardLog(_fontGuard, 'max')", "formatFontGuardLog(_fontGuard, 'lite')")
    expect(mutAssert(mutated)).toBe(false)
  })
})
