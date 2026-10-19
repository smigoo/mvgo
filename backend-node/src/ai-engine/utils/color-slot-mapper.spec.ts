import { mkdtemp, mkdir, rm, writeFile, readFileSync } from 'fs/promises'
import fsMod from 'fs'
import pathMod from 'path'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildColorSlotMapping,
  applyColorSlotMapping,
  buildCrossThemeColorFacts,
  formatCrossThemeColorFacts,
  auditSemanticGuessSlots,
} from './color-slot-mapper.js'

/**
 * 🔴 2026-10-13 批次二：业务样式颜色 → 槽位变量（映射规则 v2，确定性）。
 * 背景：LLM 生成的 common.less 颜色硬编码 ⇒ N 主题覆盖层无颜色差异
 * （真机 fca166e8：theme_2 切了没视觉变化）。
 */

// 迷你 Figma 节点
const solid = (hex, w = 10, h = 10) => {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return {
    type: 'RECTANGLE',
    name: 'r',
    fills: [{ type: 'SOLID', color: { r: rgb[0], g: rgb[1], b: rgb[2] }, opacity: 1 }],
    absoluteBoundingBox: { width: w, height: h },
  }
}
const frame = (name, children, bg) => ({
  type: 'FRAME',
  name,
  fills: bg ? [solid(bg).fills[0]] : [],
  absoluteBoundingBox: { width: 100, height: 100 },
  children,
})

describe('buildColorSlotMapping — 跨稿色值对归类', () => {
  const lightTree = frame('cp', [
    frame('card', [solid('#ffffff', 200, 100)], '#a0c1ff'), // 背景
    frame('title', [solid('#546881')]),                     // 文字（既有槽位）
    frame('online', [solid('#10ba27')]),                    // 无既有槽位（绿色数字）
    frame('static', [solid('#999999')]),                    // 跨稿无差异
  ])
  const theme2Tree = frame('cp', [
    frame('card', [solid('#071f3d', 200, 100)], '#123259'),
    frame('title', [solid('#98c2f6')]),
    frame('online', [solid('#26ce3c')]),
    frame('static', [solid('#999999')]),
  ])
  const themeEntries = [
    { key: 'light', nodeData: lightTree },
    { key: 'theme_2', nodeData: theme2Tree },
  ]
  const themeSlots = {
    light: { 'color-text-base': '#546881', 'color-bg-design': '#a0c1ff', 'color-primary': '#a6ceff' },
    theme_2: { 'color-text-base': '#98c2f6', 'color-bg-design': '#123259', 'color-primary': '#071f3d' },
  }

  it('主通道：主稿 hex 命中既有槽位（精确匹配）→ 替换为槽位变量', () => {
    const r = buildColorSlotMapping({ themeEntries, themeSlots, primaryKey: 'light' })
    expect(r.replacements.get('#546881')).toBe('color-text-base')
    expect(r.stats.canonical).toBeGreaterThanOrEqual(1)
  })

  it('扩展通道：无既有槽位的跨稿差异 → 自动生成 color-custom-N', () => {
    const r = buildColorSlotMapping({ themeEntries, themeSlots, primaryKey: 'light' })
    const customVar = r.replacements.get('#10ba27')
    expect(customVar).toMatch(/^color-custom-\d+$/)
    // 自定义槽位的各稿值正确（light=#10ba27 / theme_2=#26ce3c）
    expect(r.customSlots[customVar]).toEqual({ light: '#10ba27', theme_2: '#26ce3c' })
  })

  it('兜底：跨稿无差异的色值不进映射（保留字面量）', () => {
    const r = buildColorSlotMapping({ themeEntries, themeSlots, primaryKey: 'light' })
    expect(r.replacements.has('#999999')).toBe(false)
  })

  it('单稿 → 空映射（无对齐基础）', () => {
    const r = buildColorSlotMapping({ themeEntries: [themeEntries[0]], themeSlots, primaryKey: 'light' })
    expect(r.replacements.size).toBe(0)
  })

  // 🛡️ 2026-10-19（c-aiot-dpjh-bsjd-c27cb2eb 实锤）：#10ba27→#26ce3c 一档色值对
  //   在树里出现 5 次 ⇒ 旧实现建了 custom-3/5/7/10/12 五个**同值孤儿槽位**。
  it('同值对去重：同一主稿色出现在多条树路径 → 只建一个槽位', () => {
    const dupLight = frame('cp', [
      frame('a', [solid('#10ba27')]),
      frame('b', [solid('#10ba27')]),
      frame('c', [solid('#10ba27')]),
    ])
    const dupTheme2 = frame('cp', [
      frame('a', [solid('#26ce3c')]),
      frame('b', [solid('#26ce3c')]),
      frame('c', [solid('#26ce3c')]),
    ])
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: dupLight },
        { key: 'theme_2', nodeData: dupTheme2 },
      ],
      themeSlots,
      primaryKey: 'light',
    })
    // 只有一个自定义槽位，且各稿值齐全（不会因去重丢掉副稿值）
    const customKeys = Object.keys(r.customSlots)
    expect(customKeys).toHaveLength(1)
    expect(customKeys[0]).toBe('color-custom-1')
    expect(r.customSlots['color-custom-1']).toEqual({ light: '#10ba27', theme_2: '#26ce3c' })
    expect(r.replacements.get('#10ba27')).toBe('color-custom-1')
    // 统计口径：3 条路径都被归类（3 次 custom），而非「1 槽位 + 2 次漏计」
    expect(r.stats.custom).toBe(3)
  })

  it('同值对去重（主通道）：同一主稿色重复命中既有槽位 → 不重复建槽位', () => {
    const dupLight = frame('cp', [
      frame('a', [solid('#546881')]),
      frame('b', [solid('#546881')]),
    ])
    const dupTheme2 = frame('cp', [
      frame('a', [solid('#98c2f6')]),
      frame('b', [solid('#98c2f6')]),
    ])
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: dupLight },
        { key: 'theme_2', nodeData: dupTheme2 },
      ],
      themeSlots,
      primaryKey: 'light',
    })
    expect(Object.keys(r.customSlots)).toHaveLength(0)
    expect(r.replacements.get('#546881')).toBe('color-text-base')
    expect(r.stats.canonical).toBe(2)
  })
})

describe('applyColorSlotMapping — 产物落盘（槽位注入 + 字面量替换）', () => {
  it('自定义槽位写入各主题 mixin + common.less hex 替换，且幂等', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csm-'))
    await mkdir(join(dir, 'resources/styles/themes'), { recursive: true })
    const themeVars = [
      '.common() { @font-size-base: 14px; }',
      '',
      '.theme-light() {',
      '  @color-primary: #a6ceff;',
      '}',
      '',
      '.theme-theme_2() {',
      '  @color-primary: #071f3d;',
      '}',
    ].join('\n')
    await writeFile(join(dir, 'resources/styles/themes/theme-vars.less'), themeVars)
    const commonLess = [
      '.card {',
      '  background: #ffffff;',
      '  color: #546881;',
      '  .num { color: #10ba27; }',
      '}',
    ].join('\n')
    await writeFile(join(dir, 'resources/styles/common.less'), commonLess)

    const mapping = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: frame('cp', [frame('title', [solid('#546881')]), frame('online', [solid('#10ba27')])]) },
        { key: 'theme_2', nodeData: frame('cp', [frame('title', [solid('#98c2f6')]), frame('online', [solid('#26ce3c')])]) },
      ],
      themeSlots: {
        light: { 'color-text-base': '#546881' },
        theme_2: { 'color-text-base': '#98c2f6' },
      },
      primaryKey: 'light',
    })
    const r = applyColorSlotMapping({ outputPath: dir, mapping, fsMod, pathMod })

    // common.less：#546881 → @color-text-base；#10ba27 → @color-custom-1
    const after = fsMod.readFileSync(join(dir, 'resources/styles/common.less'), 'utf-8')
    expect(after).toContain('@color-text-base')
    expect(after).toContain('@color-custom-1')
    expect(after).not.toContain('#546881')
    expect(after).not.toContain('#10ba27')
    expect(r.replacedCount).toBeGreaterThanOrEqual(2)

    // 自定义槽位写入各主题 mixin
    const tv = fsMod.readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')
    const lightBlock = tv.match(/\.theme-light\(\)\s*\{([^}]*)\}/)[1]
    const t2Block = tv.match(/\.theme-theme_2\(\)\s*\{([^}]*)\}/)[1]
    expect(lightBlock).toContain('@color-custom-1: #10ba27')
    expect(t2Block).toContain('@color-custom-1: #26ce3c')

    // 幂等：再跑一次不重复替换/注入
    const r2 = applyColorSlotMapping({ outputPath: dir, mapping, fsMod, pathMod })
    expect(r2.replacedCount).toBe(0)
    const tv2 = fsMod.readFileSync(join(dir, 'resources/styles/themes/theme-vars.less'), 'utf-8')
    expect(tv2.match(/@color-custom-1:/g).length).toBe(2) // 每主题仍只有一条
    await rm(dir, { recursive: true, force: true })
  })
})

// ──────────────────────────────────────────────────────────────
// 🌗 跨主题配色真值（2026-10-19 · c-aiot-dpjh-bsjd-c27cb2eb 实锤）
//
// 病灶：分块 prompt 只带主稿 Figma 树 ⇒ 副主题 mixin 的业务槽位
//   （@color-card-bg / @color-node-name …）无真值可依 ⇒ LLM 按明暗语义
//   猜通用灰阶（#2b2b2b / #e6e6e6）⇒ 深色稿版本 ≈ 系统默认 dark。
// 本组锁「对齐表 + 每稿色板」两件事实，以及空数据零注入。
// ──────────────────────────────────────────────────────────────
describe('buildCrossThemeColorFacts — 跨稿配色真值', () => {
  const lightNode = frame('cp', [
    frame('list-item-bg', [solid('#ffffff', 200, 40)], '#ffffff'),
    frame('title', [solid('#333333', 100, 20)]),
    frame('static', [solid('#999999')]), // 跨稿无差异 ⇒ 不该进表
  ])
  const theme2Node = frame('cp', [
    frame('list-item-bg', [solid('#123259', 200, 40)], '#123259'),
    frame('title', [solid('#98c2f6', 100, 20)]),
    frame('static', [solid('#999999')]),
  ])
  const themes = [
    { key: 'light', nodeData: lightNode },
    { key: 'theme_2', nodeData: theme2Node },
  ]

  it('双稿 → 对齐出「主稿色 ↔ 副稿色」且带每稿主色板', () => {
    const f = buildCrossThemeColorFacts({ themes })
    expect(f).not.toBeNull()
    expect(f.primaryKey).toBe('light')
    expect(f.themeKeys).toEqual(['light', 'theme_2'])
    const pair = f.rows.find((r) => r.primary === '#ffffff')
    expect(pair?.perTheme.theme_2).toBe('#123259')
    const textPair = f.rows.find((r) => r.primary === '#333333')
    expect(textPair?.perTheme.theme_2).toBe('#98c2f6')
    // 每稿实测色板（LLM 兜底补齐时也要贴合该稿色相）
    expect(f.palettes.theme_2).toContain('#123259')
    expect(f.palettes.light).toContain('#ffffff')
  })

  it('🩺 阳性对照：跨稿无差异的色值不进对齐表', () => {
    const f = buildCrossThemeColorFacts({ themes })
    expect(f.rows.some((r) => r.primary === '#999999')).toBe(false)
  })

  it('单稿 / 无 nodeData → null（零注入、零回归）', () => {
    expect(buildCrossThemeColorFacts({ themes: [themes[0]] })).toBeNull()
    expect(buildCrossThemeColorFacts({ themes: [{ key: 'a' }, { key: 'b' }] })).toBeNull()
    expect(buildCrossThemeColorFacts({})).toBeNull()
    expect(buildCrossThemeColorFacts(undefined)).toBeNull()
  })

  it('渲染段落：含副稿实测色值 + 反「语义推断灰阶」硬约束；无数据 → 空串', () => {
    const md = formatCrossThemeColorFacts(buildCrossThemeColorFacts({ themes }))
    expect(md).toContain('跨主题配色真值')
    expect(md).toContain('#123259')
    expect(md).toContain('#98c2f6')
    expect(md).toContain('theme_2')
    expect(md).toContain('严禁')
    expect(md).toContain('#2b2b2b') // 明令禁止的错误灰阶示例
    expect(formatCrossThemeColorFacts(null)).toBe('')
    expect(formatCrossThemeColorFacts({ rows: [] })).toBe('')
  })

  it('同色值组合去重（同色在多条路径重复 ⇒ 不刷屏）', () => {
    const mk = (hex: string) =>
      frame('cp', [
        frame('a', [solid(hex, 10, 10)]),
        frame('b', [solid(hex, 10, 10)]),
        frame('c', [solid(hex, 10, 10)]),
      ])
    const f = buildCrossThemeColorFacts({
      themes: [
        { key: 'light', nodeData: mk('#ffffff') },
        { key: 'theme_2', nodeData: mk('#123259') },
      ],
    })
    expect(f.rows).toHaveLength(1)
  })
})

describe('auditSemanticGuessSlots — 语义推断槽位留痕（只报不改）', () => {
  const themeVars = [
    '.common() { @font-size-base: 14px; }',
    '.theme-light() {',
    '  @color-card-bg: #ffffff; // 自动添加（语义推断）',
    '  @color-node-name: #333333; // 自动添加（语义推断）',
    '  @color-text-base: #546881;',
    '}',
    '.theme-theme_2() {',
    '  @color-card-bg: #2b2b2b; // 自动添加（语义推断）',
    '  @color-node-name: #e6e6e6; // 自动添加（语义推断）',
    '}',
  ].join('\n')
  const commonLess = [
    '.c-card { background: @color-card-bg; }',
    '.c-name { color: @color-node-name; }',
  ].join('\n')

  it('被引用 ⇒ risky（深色稿 ≈ 默认 dark 的风险信号）', () => {
    const r = auditSemanticGuessSlots({ themeVarsContent: themeVars, commonLessContent: commonLess })
    expect(r.guessed.sort()).toEqual(['color-card-bg', 'color-node-name'])
    expect(r.risky.sort()).toEqual(['color-card-bg', 'color-node-name'])
    expect(r.riskCount).toBe(2)
  })

  it('🩺 阳性对照：无「语义推断」注释 ⇒ guessed/risky 皆空', () => {
    const tv = themeVars.replace(/; \/\/ 自动添加（语义推断）/g, ';')
    const r = auditSemanticGuessSlots({ themeVarsContent: tv, commonLessContent: commonLess })
    expect(r.guessed).toHaveLength(0)
    expect(r.risky).toHaveLength(0)
  })

  it('🩺 阳性对照：推断槽位未被 common.less 引用 ⇒ risky 空（guessed 仍在）', () => {
    const r = auditSemanticGuessSlots({
      themeVarsContent: themeVars,
      commonLessContent: '.c-card { background: @color-text-base; }',
    })
    expect(r.guessed.length).toBeGreaterThan(0)
    expect(r.risky).toHaveLength(0)
  })

  it('common.less 内的定义行不算引用（避免假报）', () => {
    const r = auditSemanticGuessSlots({
      themeVarsContent: themeVars,
      commonLessContent: '@color-card-bg: #ffffff;\n.c-x { color: #333333; }',
    })
    expect(r.risky).toHaveLength(0)
  })
})
