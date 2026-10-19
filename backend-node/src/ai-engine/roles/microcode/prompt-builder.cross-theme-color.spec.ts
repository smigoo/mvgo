/**
 * 🌗 跨主题配色真值 → 分块 prompt 接线 spec（2026-10-19 · c-aiot-dpjh-bsjd-c27cb2eb 实锤）
 *
 * 用户反馈：「深色设计稿版本和默认 dark 效果几乎一样，列表背景和文字色没按设计」。
 * 根因链（本 spec 逐跳锁死）：
 *   ① **透传断点**：`execute` 解构了 `dualTruth`，但 `this.generateCode({...})` 是
 *      **显式白名单**，此前**没有**列 `dualTruth` ⇒ 分块 prompt 层恒收不到
 *      （零报错零日志的静默丢弃，与 businessTextRules 曾踩的坑同型）。
 *   ② **无真值可依**：prompt 只有主稿 Figma 树 ⇒ 副主题 mixin 的业务槽位
 *      （@color-card-bg / @color-node-name …）只能靠 `safeLessVarValue` 语义推断
 *      ⇒ 填 #ffffff/#2b2b2b、#333333/#e6e6e6 这类通用灰阶，而非副稿实测色。
 *   ③ 治本：注入「跨稿色值对齐表 + 每稿实测色板」，副主题槽位取值从此有真值。
 *
 * ⚠️ 透传自检铁律（memory）：锚点用 `[from,to)` 区间 + 区间内命中行数 === 1，
 *    并配阳性对照 —— 「锚点 ± 窗口」会盖到相邻出现（删字段仍绿）。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildCrossThemeColorBlock,
  buildThemeVarsChunkPrompt,
  buildCommonLessChunkPrompt,
} from './prompt-builder.js'

const hexToRgb = (h: string) => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
})

/** 迷你 Figma 文档节点（fetchNodeData 返回 document 本体，非 {document} 包装） */
const rect = (name: string, hex: string, w = 100, h = 40) => ({
  name,
  type: 'RECTANGLE',
  absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
  fills: [{ type: 'SOLID', color: hexToRgb(hex), opacity: 1 }],
})
const doc = (children: object[], bg: string) => ({
  name: 'cp-demo',
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  fills: [{ type: 'SOLID', color: hexToRgb(bg), opacity: 1 }],
  children,
})

// 主稿 light：白底 + 深灰字；副稿 theme_2：深蓝底 + 浅蓝字（真实深色稿的色相，非中性灰）
const lightNode = doc([rect('list-item-bg', '#ffffff', 300, 60), rect('node-name', '#333333')], '#f5f7fa')
const theme2Node = doc([rect('list-item-bg', '#123259', 300, 60), rect('node-name', '#98c2f6')], '#071f3d')

const dualTruth = {
  enabled: true,
  themes: [
    { key: 'light', nodeData: lightNode },
    { key: 'theme_2', nodeData: theme2Node },
  ],
}

const baseChunk = {
  files: ['resources/styles/themes/theme-vars.less'],
  index: 3,
  total: 6,
  title: '样式',
}

describe('① buildCrossThemeColorBlock — 真值段生成', () => {
  it('双稿 → 段落含副稿实测色值与硬约束', () => {
    const md = buildCrossThemeColorBlock({ dualTruth })
    expect(md).toContain('跨主题配色真值')
    expect(md).toContain('#123259') // 副稿列表背景
    expect(md).toContain('#98c2f6') // 副稿文字色
    expect(md).toContain('theme_2')
    expect(md).toContain('严禁')
  })

  it('🩺 阳性对照：无 dualTruth / 单稿 → 空串（零注入、零回归）', () => {
    expect(buildCrossThemeColorBlock({})).toBe('')
    expect(buildCrossThemeColorBlock({ dualTruth: null })).toBe('')
    expect(buildCrossThemeColorBlock({ dualTruth: { themes: [dualTruth.themes[0]] } })).toBe('')
  })
})

describe('② 分块 prompt 注入（theme-vars / common.less）', () => {
  it('theme-vars 分块：注入跨稿真值', () => {
    const p = buildThemeVarsChunkPrompt({ dualTruth, backgroundBrightness: 'light' }, baseChunk)
    expect(p).toContain('跨主题配色真值')
    expect(p).toContain('#123259')
  })

  it('🩺 阳性对照：未透传 dualTruth 时 theme-vars 分块不含该段（证明注入确实来自 dualTruth）', () => {
    const p = buildThemeVarsChunkPrompt({ backgroundBrightness: 'light' }, baseChunk)
    expect(p).not.toContain('跨主题配色真值')
    expect(p).not.toContain('#123259')
  })

  it('common.less 分块：注入跨稿真值', () => {
    const p = buildCommonLessChunkPrompt({ dualTruth, componentName: 'demo' }, {
      ...baseChunk,
      files: ['resources/styles/common.less'],
    })
    expect(p).toContain('跨主题配色真值')
    expect(p).toContain('#98c2f6')
  })

  it('🩺 阳性对照：未透传时 common.less 分块不含该段', () => {
    const p = buildCommonLessChunkPrompt({ componentName: 'demo' }, {
      ...baseChunk,
      files: ['resources/styles/common.less'],
    })
    expect(p).not.toContain('跨主题配色真值')
  })
})

describe('③ 透传自检：generateCode 入参白名单必须带 dualTruth', () => {
  it('`await this.generateCode({` … `});` 区间内 dualTruth 恰好 1 行（漏传即静默失效）', () => {
    const src = readFileSync(join(__dirname, '..', 'microcode-engineer.js'), 'utf-8')
    const from = src.indexOf('await this.generateCode({')
    expect(from).toBeGreaterThan(-1)
    // 区间右界：从锚点起第一个「行首 6 空格 + });」（generateCode 调用体的闭合）
    const closeRe = /\n {6}\}\);/
    const rest = src.slice(from)
    const m = closeRe.exec(rest)
    expect(m).not.toBeNull()
    const to = from + (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length
    const region = src.slice(from, to)
    const hits = region.split('\n').filter((l) => /^\s*dualTruth,\s*$/.test(l))
    expect(hits).toHaveLength(1)
    // 阳性对照：同区间内 businessTextRules（既有已透传字段）也应为 1 行，
    // 证明区间切片本身有效（若判据写成 0 行也会绿，就没意义了）
    const ctrl = region.split('\n').filter((l) => /^\s*businessTextRules,\s*$/.test(l))
    expect(ctrl).toHaveLength(1)
  })
})
