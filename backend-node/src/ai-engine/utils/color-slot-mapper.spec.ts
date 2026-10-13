import { mkdtemp, mkdir, rm, writeFile, readFileSync } from 'fs/promises'
import fsMod from 'fs'
import pathMod from 'path'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildColorSlotMapping, applyColorSlotMapping } from './color-slot-mapper.js'

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
