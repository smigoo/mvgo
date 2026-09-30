/**
 * P1 prompt 精简（d157017）门控规格 —— 防「省 token」治理被误判 / 回退。
 *
 * 背景（离线探针实测，2026-09-30）：
 *   d157017 在 `prompt-builder.js#buildCodePrompt` 的 shared 段加了**两条**门控：
 *     ① L308 `code-patterns.md` 仅当 `segmentType ∉ {style, declare}` 注入
 *     ② L316 `less-naming-convention.md` 仅当 `segmentType === 'style'` 注入
 *
 *   但生成侧的路由（`microcode-engineer.js:1490`）是：
 *     `declare` → `_buildDeclareChunkPrompt`
 *     `style`   → `_buildStyleChunkPrompt`
 *     else      → `buildCodePrompt`（唯一入口）
 *   即 **style/declare 分块从不经过 buildCodePrompt**。
 *
 *   ⇒ 门控①是**惰性条件**（那 11KB 本来就没在这条链上注入过，"省 11KB" 未发生）；
 *      门控②**真生效**，但方向是「vue 型 chunk 移除 less-naming（2193 B/块）」。
 *
 * 本 spec 用 sentinel 断言两条门控的**行为契约**，并额外锁住**路由事实**——
 * 一旦有人把 style/declare 接回 buildCodePrompt（会让门控①看起来"生效"），
 * 或把 less-naming 无条件加回（回退精简），本 spec 立刻失败。
 *
 * prompt-builder 顶层 import prompt-loader（import.meta.url），jest CJS 下必须 mock；
 * 被测函数只消费调用方传入的 `options.constraints`，不依赖 prompt-loader 返回值。
 */
jest.mock('../../utils/prompt-loader.js', () => ({
  buildSharedSections: () => '',
  buildConcerns: () => '',
  buildFigmaStage: () => '',
  formatAssetsList: () => '',
  trimConstraintsForContext: (c = '') => c,
}))

import { buildCodePrompt, getChunkFileType } from './prompt-builder.js'

const SENT_CP = '<<<SENTINEL_CODE_PATTERNS>>>'
const SENT_LN = '<<<SENTINEL_LESS_NAMING>>>'

const constraints: Record<string, string> = {
  'references/ai-generation-constraints.md': 'CONSTRAINTS_OK',
  'references/patterns/code-patterns.md': SENT_CP,
  'references/specs/declare-json.md': 'DECLARE_JSON_OK',
  'references/standards/vue-style-standard.md': 'VUE_STYLE_OK',
  'references/standards/less-naming-convention.md': SENT_LN,
}

function baseInput(): Record<string, unknown> {
  return {
    componentName: 'c-gating-probe',
    displayName: '门控探针',
    stage: 'figma',
    layoutStructure: { sections: [] },
    visualElements: [],
    charts: [],
    interactions: [],
    figmaNodeData: null,
    headerSlots: [],
  }
}

function build(spec?: Record<string, unknown>): string {
  return buildCodePrompt(baseInput(), spec, {
    constraints,
    componentType: 'microcode',
  })
}

describe('P1 门控：buildCodePrompt 中 code-patterns / less-naming 的注入面', () => {
  it('vue 型 chunk（template / script / component / 无 segmentType）→ 含 code-patterns、不含 less-naming', () => {
    const specs = [
      { segmentType: 'template', files: ['package/index.vue'] },
      { segmentType: 'script', files: ['package/index.vue'] },
      { segmentType: 'component', files: ['package/components/A.vue'] },
      undefined, // 整文件 index.vue（simple/medium 分支）
    ]
    for (const spec of specs) {
      const p = build(spec)
      expect(p.length).toBeGreaterThan(0)
      expect(p).toContain(SENT_CP)
      expect(p).not.toContain(SENT_LN)
    }
  })

  it('style / declare chunk → 不含 code-patterns（门控①生效）', () => {
    expect(build({ segmentType: 'style', files: ['resources/styles/common.less'] })).not.toContain(
      SENT_CP,
    )
    expect(build({ segmentType: 'declare', files: ['declare.json'] })).not.toContain(SENT_CP)
  })

  it('less-naming 只对 segmentType==="style" 注入（门控②生效）', () => {
    expect(
      build({ segmentType: 'style', files: ['resources/styles/themes/theme-vars.less'] }),
    ).toContain(SENT_LN)
    expect(build({ segmentType: 'declare', files: ['declare.json'] })).not.toContain(SENT_LN)
  })
})

describe('P1 路由事实：style / declare 分块不经过 buildCodePrompt', () => {
  it('getChunkFileType 映射与生成侧分支一致', () => {
    // template / script 段视为 vue 类型（microcode-engineer:1490 的 else 分支 → buildCodePrompt）
    expect(getChunkFileType({ segmentType: 'template', files: ['package/index.vue'] })).toBe('vue')
    expect(getChunkFileType({ segmentType: 'script', files: ['package/index.vue'] })).toBe('vue')
    // 子组件 .vue 同样走 else 分支
    expect(getChunkFileType({ segmentType: 'component', files: ['package/components/A.vue'] })).toBe(
      'vue',
    )
    // 全 .json → 专用 declare 构建器；全 .less/.css → 专用 style 构建器
    expect(getChunkFileType({ segmentType: 'declare', files: ['declare.json'] })).toBe('declare')
    expect(
      getChunkFileType({ segmentType: 'style', files: ['resources/styles/common.less'] }),
    ).toBe('style')
    expect(
      getChunkFileType({
        segmentType: 'style',
        files: ['resources/styles/themes/theme-vars.less'],
      }),
    ).toBe('style')
  })

  it('防回归：style / declare 的 fileType 永不为 "vue" ⇒ 不会进入 buildCodePrompt', () => {
    const styleChunk = { segmentType: 'style', files: ['resources/styles/common.less'] }
    const declareChunk = { segmentType: 'declare', files: ['declare.json'] }
    expect(getChunkFileType(styleChunk)).not.toBe('vue')
    expect(getChunkFileType(declareChunk)).not.toBe('vue')
    // 说明：若将来把 style/declare 接回 buildCodePrompt，门控① 才会真正"生效"，
    //       此时本断言失败 → 提示这是一次路由变更，需重新评估精简收益口径。
  })
})
