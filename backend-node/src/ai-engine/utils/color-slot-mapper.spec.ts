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
  realignThemeVarsSlotValues,
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

// ──────────────────────────────────────────────────────────────
// 🛡️ 跨稿对齐三级降级（2026-10-20 治本 · dpjh-bsjd 双稿 unmatched:35/35 实锤）
//
// 旧实现对齐键 = 含根名绝对路径；用户的两稿 frame **不同名**（Figma 复制稿
// 自动改名）⇒ 全灭。降级链：剥根段路径 → 先序位置 → none。
// ⚠️ fixtures 必须复刻真实前提：两稿根名不同（理想化同名 fixture = 假绿温床）。
// ──────────────────────────────────────────────────────────────
describe('跨稿对齐三级降级（真实前提：两稿根名/层名不同）', () => {
  it('L1：根名不同但内层同源 → mode=path，色值对命中', () => {
    const light = frame('cp-aiot-dpjh-bsjd', [
      frame('card', [solid('#ffffff')], '#a0c1ff'),
      frame('title', [solid('#546881')]),
    ])
    const dark = frame('cp-aiot-dpjh-bsjd-深色稿', [ // 🔴 根名不同（真实场景）
      frame('card', [solid('#071f3d')], '#123259'),
      frame('title', [solid('#98c2f6')]),
    ])
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: light },
        { key: 'theme_2', nodeData: dark },
      ],
      themeSlots: {
        light: { 'color-text-base': '#546881' },
        theme_2: { 'color-text-base': '#98c2f6' },
      },
      primaryKey: 'light',
    })
    expect(r.stats.alignment[0].mode).toBe('path')
    expect(r.stats.alignment[0].matched).toBeGreaterThan(0)
    expect(r.replacements.get('#546881')).toBe('color-text-base') // 主通道仍通
    expect(r.replacements.get('#ffffff')).toMatch(/^color-custom-\d+$/) // 扩展通道
  })

  it('🩺 阳性对照：回退绝对路径对齐（含根名）时该 fixture 应全灭 —— 证明修复确实生效', () => {
    // 直接用含根名的绝对路径模拟旧行为：两稿根名不同 ⇒ 任何路径都不匹配
    const light = frame('cp-foo', [frame('card', [solid('#ffffff')])])
    const dark = frame('cp-bar', [frame('card', [solid('#071f3d')])])
    const absKeys = (n: object) => {
      const out: string[] = []
      const walk = (node: any, path: string) => {
        const key = path ? `${path}/${node.name || ''}` : String(node.name || '')
        out.push(key)
        for (const c of node.children || []) walk(c, key)
      }
      walk(n, '')
      return out
    }
    const a = new Set(absKeys(light))
    const b = new Set(absKeys(dark))
    const intersection = [...a].filter((k) => b.has(k))
    expect(intersection).toHaveLength(0) // 旧算法 0 命中 ⇒ 证明旧判据在此类数据上必死
  })

  it('L2：层名全不同（重画稿）→ mode=order，按先序位置对齐仍能给真值', () => {
    const light = frame('cp-foo', [
      frame('card', [solid('#ffffff')], '#a0c1ff'),
      frame('title', [solid('#546881')]),
    ])
    const dark = frame('另一个根', [
      frame('容器甲', [solid('#071f3d')], '#123259'),
      frame('标题乙', [solid('#98c2f6')]),
    ])
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: light },
        { key: 'theme_2', nodeData: dark },
      ],
      themeSlots: {},
      primaryKey: 'light',
    })
    expect(r.stats.alignment[0].mode).toBe('order')
    // 先序位置：root bg #a0c1ff↔#123259, card #ffffff↔#071f3d, title #546881↔#98c2f6
    const f = buildCrossThemeColorFacts({
      themes: [
        { key: 'light', nodeData: light },
        { key: 'theme_2', nodeData: dark },
      ],
    })
    expect(f?.alignment?.[0].mode).toBe('order')
    expect(f?.rows.some((r2) => r2.primary === '#546881' && r2.perTheme.theme_2 === '#98c2f6')).toBe(true)
  })

  it('rows 空（两稿全同色）但色板非空 → 段落仍下发（2026-10-20 修正：色板不再被连带丢弃）', () => {
    const light = frame('cp-a', [frame('card', [solid('#ffffff')])])
    const dark = frame('cp-b', [frame('card', [solid('#ffffff')])])
    const f = buildCrossThemeColorFacts({
      themes: [
        { key: 'light', nodeData: light },
        { key: 'theme_2', nodeData: dark },
      ],
    })
    expect(f?.rows).toHaveLength(0)
    const md = formatCrossThemeColorFacts(f)
    expect(md).toContain('跨主题配色真值')
    expect(md).toContain('实测主色板')
    expect(md).toContain('#ffffff')
    expect(md).toContain('对齐未命中')
  })
})

// 🆕 2026-10-20（#128 ③，84af4f8f 实锤）：LLM 自造槽位名（真值表外）→ 值被
//   臆造/语义推断猜成中性灰 ⇒ 副稿配色全毁。以主稿 mixin 值为锚做二次对齐矫正。
describe('realignThemeVarsSlotValues — 自造槽位二次对齐矫正', () => {
  const TABLE = { '#a0c1ff': { light: '#a0c1ff', theme_2: '#123259' } }
  const wrap = (lightBody, theme2Body, darkBody = '') => `.common() {
  @font-size-base: 14px;
}
.theme-light() {
${lightBody}
}
.theme-theme_2() {
${theme2Body}
}${darkBody ? `\n.theme-dark() {\n${darkBody}\n}` : ''}`

  it('基本矫正：主稿值命中真值表 ⇒ 副稿 mixin 同名槽位改写为该稿实测色（含注释改写）', () => {
    const content = wrap(
      '  @color-mask-bg-outer: #a0c1ff;',
      '  @color-mask-bg-outer: #2b2b2b; // 自动添加（语义推断）',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    expect(r.corrections).toEqual([
      { slot: 'color-mask-bg-outer', theme: 'theme_2', from: '#2b2b2b', to: '#123259' },
    ])
    expect(r.content).toContain('@color-mask-bg-outer: #123259;')
    expect(r.content).toContain('跨稿真值矫正')
    expect(r.content).not.toContain('自动添加（语义推断）') // 原标注已被矫正标注覆盖
    // 主稿 mixin 自身不动
    expect(r.content).toMatch(/\.theme-light\(\) \{\n  @color-mask-bg-outer: #a0c1ff;/)
  })

  it('幂等：副稿已是真值 ⇒ 零矫正、零 diff', () => {
    const content = wrap(
      '  @color-mask-bg-outer: #a0c1ff;',
      '  @color-mask-bg-outer: #123259;',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    expect(r.corrections).toHaveLength(0)
    expect(r.content).toBe(content)
  })

  it('🩺 阳性对照：主稿值未命中真值表 ⇒ 不动（无锚不猜）', () => {
    const content = wrap(
      '  @color-mask-bg-outer: #abcdef;',
      '  @color-mask-bg-outer: #2b2b2b; // 自动添加（语义推断）',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    expect(r.corrections).toHaveLength(0)
    expect(r.content).toBe(content)
  })

  it('🩺 阳性对照：空真值表 ⇒ 全不动', () => {
    const content = wrap(
      '  @color-mask-bg-outer: #a0c1ff;',
      '  @color-mask-bg-outer: #2b2b2b;',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: {},
      primaryKey: 'light',
    })
    expect(r.corrections).toHaveLength(0)
    expect(r.content).toBe(content)
  })

  it('同 mixin 内重复定义全改（真机实锤：addMissingVariables 会重复追加同名槽位）', () => {
    const content = wrap(
      '  @color-mask-bg-outer: #a0c1ff;',
      '  @color-mask-bg-outer: #2b2b2b; // 自动添加（语义推断）\n  @color-mask-bg-outer: #2b2b2b; // 自动添加（语义推断）',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    expect(r.content.match(/@color-mask-bg-outer: #123259;/g)).toHaveLength(2)
    expect(r.content).not.toContain('#2b2b2b')
  })

  it('窄条件：非颜色槽位 / 现状值非 hex / 真值表外主题（dark）一律不碰', () => {
    const content = wrap(
      '  @color-x: #a0c1ff;',
      '  @color-x: rgba(0, 0, 0, 0.5);',
      '  @color-x: #111111;',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    // theme_2 现状是 rgba ⇒ 不碰；dark 不在 perTheme（表只有 light/theme_2）⇒ 不碰
    expect(r.corrections).toHaveLength(0)
    expect(r.content).toBe(content)
  })

  it('主稿 mixin 未定义该槽位 ⇒ 无锚不动', () => {
    const content = wrap(
      '  @color-other: #a0c1ff;',
      '  @color-mask-bg-outer: #2b2b2b; // 自动添加（语义推断）',
    )
    const r = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: TABLE,
      primaryKey: 'light',
    })
    // color-mask-bg-outer 只在副稿有 ⇒ 无锚；color-other 只在主稿有 ⇒ 副稿没定义 ⇒ 都不动
    expect(r.corrections).toHaveLength(0)
    expect(r.content).toBe(content)
  })

  it('与 buildColorSlotMapping 集成：perThemeByPrimaryHex 携带对齐真值（含主通道槽位色）', () => {
    const light = frame('cp', [frame('card', [solid('#ffffff', 200, 100)], '#a0c1ff')])
    const dark = frame('cp', [frame('card', [solid('#071f3d', 200, 100)], '#123259')])
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: light },
        { key: 'theme_2', nodeData: dark },
      ],
      themeSlots: {
        light: { 'color-bg-design': '#a0c1ff' },
        theme_2: { 'color-bg-design': '#123259' },
      },
      primaryKey: 'light',
    })
    expect(r.perThemeByPrimaryHex['#a0c1ff']).toEqual({ light: '#a0c1ff', theme_2: '#123259' })
    expect(r.perThemeByPrimaryHex['#ffffff']).toEqual({ light: '#ffffff', theme_2: '#071f3d' })
    // 端到端：自造槽位以 #ffffff（主稿色）为锚 ⇒ 矫正副稿
    const content = wrap(
      '  @color-card-bg: #ffffff;',
      '  @color-card-bg: #2b2b2b; // 自动添加（语义推断）',
    )
    const rr = realignThemeVarsSlotValues({
      themeVarsContent: content,
      perThemeByPrimaryHex: r.perThemeByPrimaryHex,
      primaryKey: 'light',
    })
    expect(rr.corrections).toEqual([
      { slot: 'color-card-bg', theme: 'theme_2', from: '#2b2b2b', to: '#071f3d' },
    ])
  })
})

// ──────────────────────────────────────────────────────────────
// 🔴 2026-10-26 RC1：alpha 必须与色值成对保真（a0f93b25 实锤）
//
// 病灶（三处同源，本组锁前两处；第三处 .vue 内联样式另案）：
//   ① flattenTreeList `alpha <= 0.5` 直接丢弃填充 —— 该稿 111 个 SOLID 里仅 3 个半透明，
//      全部落在 0.2–0.35（三块面板底色），恰好是设计主色 ⇒ 被丢 ⇒ 面板色无槽位。
//   ② applyColorSlotMapping 只拼 `#rrggbb` 正则 ⇒ common.less 的 `rgba(...)` 全线逃逸
//      ⇒ 真机 `replacedCount:0`。
// 阳性对照用真实形态 rgba(226, 208, 132, 0.2)（gold 面板），阴性对照锁「不透明路径不变」。
// ──────────────────────────────────────────────────────────────
describe('RC1 · 半透明色参与跨稿映射（a0f93b25 实锤）', () => {
  // 不透明 / 半透明混合 fill 的节点
  const solidA = (hex, alpha, w = 10, h = 10) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    return {
      type: 'RECTANGLE',
      name: 'r',
      fills: [{ type: 'SOLID', color: { r: rgb[0], g: rgb[1], b: rgb[2] }, opacity: alpha }],
      absoluteBoundingBox: { width: w, height: h },
    }
  }
  const box = (name, children) => ({
    type: 'FRAME',
    name,
    fills: [],
    absoluteBoundingBox: { width: 100, height: 100 },
    children,
  })

  it('🩺 阳性：alpha=0.2 的面板色进入映射（旧阈值 0.5 会整条丢弃）', () => {
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: box('cp', [box('panel', [solidA('#e2d084', 0.2)])]) },
        { key: 'theme_2', nodeData: box('cp', [box('panel', [solidA('#3a3320', 0.2)])]) },
      ],
      themeSlots: { light: {}, theme_2: {} },
      primaryKey: 'light',
    })
    // 颜色键保真 alpha（不是裸 hex）
    expect(r.replacements.has('rgba(226, 208, 132, 0.2)')).toBe(true)
    expect(r.stats.translucent).toBe(1)
    const varName = r.replacements.get('rgba(226, 208, 132, 0.2)')
    expect(varName).toBe('color-custom-1')
    // 槽位值两侧各自保真（不臆造主稿 alpha）
    expect(r.customSlots[varName]).toEqual({
      light: 'rgba(226, 208, 132, 0.2)',
      theme_2: 'rgba(58, 51, 32, 0.2)',
    })
  })

  it('🩺 阳性：alpha 差异本身即「随主题变」（只比 hex 会误判全同而跳过）', () => {
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: box('cp', [solidA('#00ff00', 0.2)]) },
        { key: 'theme_2', nodeData: box('cp', [solidA('#00ff00', 0.45)]) },
      ],
      themeSlots: { light: {}, theme_2: {} },
      primaryKey: 'light',
    })
    expect(r.replacements.size).toBe(1)
    expect(r.customSlots['color-custom-1']).toEqual({
      light: 'rgba(0, 255, 0, 0.2)',
      theme_2: 'rgba(0, 255, 0, 0.45)',
    })
  })

  it('🩺 阴性：仅 alpha<=0.1 的近全透明填充被排除（0.2 不再被排除）', () => {
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: box('cp', [solidA('#e2d084', 0.05)]) },
        { key: 'theme_2', nodeData: box('cp', [solidA('#111111', 0.05)]) },
      ],
      themeSlots: { light: {}, theme_2: {} },
      primaryKey: 'light',
    })
    expect(r.replacements.size).toBe(0)
    expect(r.stats.pairs).toBe(0)
  })

  it('🩺 阴性：不透明路径逐字节不变（键仍是 #rrggbb，落 custom-1 而非 rgba 键）', () => {
    const r = buildColorSlotMapping({
      themeEntries: [
        { key: 'light', nodeData: box('cp', [solidA('#10ba27', 1)]) },
        { key: 'theme_2', nodeData: box('cp', [solidA('#26ce3c', 1)]) },
      ],
      themeSlots: { light: {}, theme_2: {} },
      primaryKey: 'light',
    })
    expect([...r.replacements.keys()]).toEqual(['#10ba27'])
    expect(r.customSlots['color-custom-1']).toEqual({ light: '#10ba27', theme_2: '#26ce3c' })
    expect(r.stats.translucent).toBe(0)
  })

  it('🩺 阳性落盘：common.less 的 rgba 字面量被替换为槽位变量（旧实现 replacedCount:0）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csm-alpha-'))
    await mkdir(join(dir, 'resources/styles/themes'), { recursive: true })
    await writeFile(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      '.theme-light() {\n}\n\n.theme-theme_2() {\n}\n',
    )
    await writeFile(
      join(dir, 'resources/styles/common.less'),
      [
        '.panel-gold {',
        '  background: rgba(226, 208, 132, 0.2);',
        // 空格/大小写容差（同一令牌判定口径）
        '  box-shadow: inset 0 0 16px 0 rgba( 255 , 200 , 0 , 1 );',
        '}',
        '.keep { color: var(--colorTextBase); background: #12345678; }',
      ].join('\n'),
    )
    const mapping = buildColorSlotMapping({
      themeEntries: [
        {
          key: 'light',
          nodeData: box('cp', [
            box('p', [solidA('#e2d084', 0.2)]),
            box('s', [solidA('#ffc800', 1)]),
          ]),
        },
        {
          key: 'theme_2',
          nodeData: box('cp', [
            box('p', [solidA('#3a3320', 0.2)]),
            box('s', [solidA('#7a5f00', 1)]),
          ]),
        },
      ],
      themeSlots: { light: {}, theme_2: {} },
      primaryKey: 'light',
    })
    const r = applyColorSlotMapping({ outputPath: dir, mapping, fsMod, pathMod })
    const after = fsMod.readFileSync(join(dir, 'resources/styles/common.less'), 'utf-8')
    expect(r.replacedCount).toBe(2)
    expect(after).toContain('background: @color-custom-1;')
    expect(after).toContain('box-shadow: inset 0 0 16px 0 @color-custom-2;')
    // 识别不到 → 原样保留（不造假绿）
    expect(after).toContain('var(--colorTextBase)')
    expect(after).toContain('#12345678')

    // 幂等：再跑一次 0 替换
    const r2 = applyColorSlotMapping({ outputPath: dir, mapping, fsMod, pathMod })
    expect(r2.replacedCount).toBe(0)
    await rm(dir, { recursive: true, force: true })
  })
})
