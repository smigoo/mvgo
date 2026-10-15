/**
 * repeatedCardTruth 结构化真值链 spec（2026-10-15 · 2238359a 臆造斑马纹根因第三层）。
 *
 * 根因链：Figma 6 卡仅首卡异色（激活态）→ vision 只记「卡片背景装饰」不结构化
 * 「N 张重复卡哪张异色」→ 下游 LLM 归纳偏误泛化成 nth-child(odd) 斑马纹。
 * 刀 32（healZebraStripeMisread）是事后纠偏；本链是源头预防：
 *   ① visual-parser._postProcessAnalysis 用 classifyRepeatedCardFills（刀 32 同款判据）
 *      把确定性真值注入 parsed.repeatedCardTruth（随 layoutStructure 原样进 prompt）；
 *   ② prompt-builder.buildCodePrompt 在 layoutStructure JSON 后追加「权威行」强约束。
 * 本 spec 锁两层接线；判据本体由 layout-truth-healer.spec.ts 32 用例覆盖。
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

import { injectRepeatedCardTruth } from '../../utils/layout-truth-healer.js'
import { buildCodePrompt, buildThemeVarsChunkPrompt } from './prompt-builder.js'

// ── Figma 真值 fixture：6 张同名同尺寸卡，仅首卡 #a6ceff（2238359a 实锤形态），
//    其余 5 张 #ffffff@0.43（91544b38 实锤形态：半透白叠浅蓝页底=tint）──
function makeFigmaSixCards(firstHex: string, restHex: string, restOpacity = 1): object {
  const hexToRgb = (h: string) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  })
  const card = (hex: string, y: number, opacity?: number) => ({
    name: 'card-bg',
    type: 'RECTANGLE',
    absoluteBoundingBox: { x: 0, y, width: 200, height: 60 },
    fills: [{ type: 'SOLID', color: hexToRgb(hex), ...(opacity != null ? { opacity } : {}) }],
  })
  return {
    document: {
      children: [
        card(firstHex, 0),
        card(restHex, 70, restOpacity),
        card(restHex, 140, restOpacity),
        card(restHex, 210, restOpacity),
        card(restHex, 280, restOpacity),
        card(restHex, 350, restOpacity),
      ],
    },
  }
}

describe('① injectRepeatedCardTruth：确定性注入（visual-parser 挂点判据）', () => {
  it('1异5同 → parsed.repeatedCardTruth = active（含 activeHex）', () => {
    const parsed: Record<string, unknown> = { layout: 'vertical', sections: [] }
    const truth = injectRepeatedCardTruth(parsed, makeFigmaSixCards('#a6ceff', '#1f3d5c'))
    expect(truth?.kind).toBe('active')
    const t = (parsed as any).repeatedCardTruth
    expect(t).toBeDefined()
    expect(t.kind).toBe('active')
    expect(t.size).toBe(6)
    expect(t.activeHex).toBe('#a6ceff')
  })

  it('全同色 → kind=uniform', () => {
    const parsed: Record<string, unknown> = { layout: 'vertical', sections: [] }
    injectRepeatedCardTruth(parsed, makeFigmaSixCards('#1f3d5c', '#1f3d5c'))
    expect((parsed as any).repeatedCardTruth?.kind).toBe('uniform')
  })

  it('figmaRoot 缺失 → 不注入（fail-open）', () => {
    const parsed: Record<string, unknown> = { layout: 'vertical', sections: [] }
    const truth = injectRepeatedCardTruth(parsed, null)
    expect(truth).toBeNull()
    expect((parsed as any).repeatedCardTruth).toBeUndefined()
  })

  it('parsed 非对象 → 不炸（防御）', () => {
    expect(() => injectRepeatedCardTruth(null, makeFigmaSixCards('#a6ceff', '#1f3d5c'))).not.toThrow()
  })

  it('91544b38 形态：多数派 #ffffff@0.43 → baseFill 带 opacity（不透明化病灶的源头判据）', () => {
    const parsed: Record<string, unknown> = {}
    const truth = injectRepeatedCardTruth(parsed, makeFigmaSixCards('#a6ceff', '#ffffff', 0.43))
    expect(truth?.kind).toBe('active')
    expect(truth?.baseFill).toEqual({ hex: '#ffffff', opacity: 0.43 })
    expect(truth?.activeFill).toEqual({ hex: '#a6ceff', opacity: 1 })
  })
})

describe('② prompt-builder 接线：权威行进 prompt', () => {
  function buildWith(truth: unknown): string {
    return buildCodePrompt(
      {
        componentName: 'c-truth-probe',
        displayName: '真值探针',
        stage: 'figma',
        layoutStructure: { sections: [], repeatedCardTruth: truth },
        visualElements: [],
        charts: [],
        interactions: [],
        figmaNodeData: null,
        headerSlots: [],
      },
      { segmentType: 'template', files: ['package/index.vue'] },
      { constraints: {}, componentType: 'microcode' },
    )
  }

  it('active → 权威行禁 nth-child 斑马、要求 :first-child/:hover', () => {
    const prompt = buildWith({ kind: 'active', size: 6, activeHex: '#a6ceff' })
    expect(prompt).toContain('重复卡填充真值')
    expect(prompt).toContain('#a6ceff')
    expect(prompt).toContain(':first-child, :hover')
    expect(prompt).toContain('严禁')
  })

  it('active + baseFill rgba → 权威行带半透明基础底色且禁提为不透明（91544b38 病灶锁死）', () => {
    const prompt = buildWith({
      kind: 'active',
      size: 6,
      activeHex: '#a6ceff',
      activeFill: { hex: '#a6ceff', opacity: 1 },
      baseFill: { hex: '#ffffff', opacity: 0.43 },
    })
    expect(prompt).toContain('rgba(255, 255, 255, 0.43)')
    expect(prompt).toContain('禁提为不透明')
    expect(prompt).toContain('作卡片基础 background')
  })

  it('uniform → 权威行禁止臆造交替背景', () => {
    const prompt = buildWith({ kind: 'uniform', size: 6 })
    expect(prompt).toContain('全部同色')
    expect(prompt).toContain('禁止')
  })

  it('zebra → 权威行允许 nth-child 且不得误改激活态', () => {
    const prompt = buildWith({ kind: 'zebra', size: 6 })
    expect(prompt).toContain('严格 ABAB 交替')
    expect(prompt).toContain('不得误改成激活态')
  })

  it('无 repeatedCardTruth → 不出现权威行（阴性）', () => {
    const prompt = buildWith(undefined)
    expect(prompt).not.toContain('重复卡填充真值')
  })
})

describe('③ theme-vars 分块 prompt：重复卡底色真值硬约束（91544b38 治本）', () => {
  function buildThemeVars(truth: unknown): string {
    return buildThemeVarsChunkPrompt(
      {
        backgroundBrightness: 'light',
        layoutStructure: truth ? { sections: [], repeatedCardTruth: truth } : { sections: [] },
        visualElements: [],
        figmaNodeData: null,
        figmaStyleTree: null,
        elementStyleMap: null,
        styleMappings: null,
      },
      { files: ['resources/styles/themes/theme-vars.less'], index: 1, total: 1, title: '主题变量' },
      { constraints: {}, componentType: 'microcode' },
    )
  }

  it('active + baseFill rgba → 卡底槽位必须取 rgba 且禁提为不透明', () => {
    const prompt = buildThemeVars({
      kind: 'active',
      size: 6,
      activeHex: '#a6ceff',
      baseFill: { hex: '#ffffff', opacity: 0.43 },
    })
    expect(prompt).toContain('重复卡底色真值')
    expect(prompt).toContain('rgba(255, 255, 255, 0.43)')
    expect(prompt).toContain('必须取此值')
    expect(prompt).toContain('禁止提为不透明')
    expect(prompt).toContain('#a6ceff')
  })

  it('无 repeatedCardTruth → 不出现真值块（阴性）', () => {
    expect(buildThemeVars(undefined)).not.toContain('重复卡底色真值')
  })

  it('baseFill 不透明 → 真值块给 hex 且不含「禁提为不透明」措辞', () => {
    const prompt = buildThemeVars({
      kind: 'uniform',
      size: 4,
      fill: { hex: '#e0f0ff', opacity: 1 },
    })
    expect(prompt).toContain('#e0f0ff')
    expect(prompt).not.toContain('禁止提为不透明')
  })
})
