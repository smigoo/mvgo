import { jest } from '@jest/globals'

// ⚠️ 与 deterministic-template.spec 同款替身：code-generator 依赖的模块内部用 import.meta。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })
jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))
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

/**
 * 🛡️ 2026-11-14（用户硬约束）：**DOM 上不允许直接写尺寸**。
 *
 * 项目靠 `postcss-pxtorem`（vite.config.js:468）把 less/css 里的 px 转 rem 做适配；
 * inline style **不经过 postcss** ⇒ 写在模板上的 px 永远不转 ⇒ 大屏/rem 适配失效。
 * 所以段高只能用**比例**（无尺寸），或把尺寸放进样式表（less）由 px2rem 统一转换。
 *
 * 本文件是该约束的回归护栏：装配器输出的 flex 样式里**不得出现任何长度单位**。
 */
import { flexItemStyleFromHeights, flexItemStyleFromWidths, injectLayoutStyle } from './code-generator.js'

const H = [30, 91, 131, 131, 24, 114, 24, 141]

describe('装配层 flex 样式禁止 inline 尺寸（px2rem 约束）', () => {
  it('纵向：只输出比例 + min 约束，不含 px/%', () => {
    for (let i = 0; i < H.length; i += 1) {
      const s = flexItemStyleFromHeights(H, i)
      expect(s).not.toMatch(/\d+px/)
      expect(s).not.toContain('%')
      expect(s).toMatch(/^flex:0\.\d{3};min-height:0;$/)
    }
  })

  it('横向：同样只有比例 + min-width，不含尺寸单位', () => {
    for (let i = 0; i < 2; i += 1) {
      const s = flexItemStyleFromWidths([98, 173], i)
      expect(s).not.toMatch(/\d+px/)
      expect(s).not.toContain('%')
      expect(s).toMatch(/^flex:0\.\d{3};min-width:0;$/)
    }
  })

  it('缺真值 ⇒ flex:1 兜底，仍不含尺寸', () => {
    const s = flexItemStyleFromHeights([0, 0], 0)
    expect(s).toBe('flex:1;min-height:0;')
  })

  it('S4 分母覆盖仍生效（比例口径，非 px）', () => {
    expect(flexItemStyleFromWidths([98, 173], 0, 292)).toBe('flex:0.336;min-width:0;')
    // 纵向分母 = Σh + Σgap：131/(686+60)
    expect(flexItemStyleFromHeights(H, 2, 746)).toBe(`flex:${(131 / 746).toFixed(3)};min-height:0;`)
  })
})

describe('方案 E：段高走样式表（不写 inline 尺寸）', () => {
  it('injectLayoutStyle 注入到已有 less scoped 块末尾', () => {
    const src = '<template><div /></template>\n\n<style lang="less" scoped>\n@import \'../resources/styles/index.less\';\n</style>\n'
    const out = injectLayoutStyle(src, '  .c-x-sech-1 { flex: 0 1 131px !important; min-height: 0; }')
    expect(out).toContain('/* mvgo-layout-truth')
    expect(out).toContain('.c-x-sech-1 { flex: 0 1 131px !important; min-height: 0; }')
    // 原有 @import 必须保留
    expect(out).toContain("@import '../resources/styles/index.less';")
    // 只应有一个 style 块
    expect((out.match(/<style/g) || []).length).toBe(1)
  })

  it('没有 style 块 ⇒ 追加一个 less scoped 块', () => {
    const out = injectLayoutStyle('<template><div /></template>', '  .c-a { flex: 0 1 24px !important; }')
    expect(out).toMatch(/<style lang="less" scoped>/)
    expect(out).toContain('.c-a { flex: 0 1 24px !important; }')
  })

  it('幂等：重复注入不产生第二份规则', () => {
    const once = injectLayoutStyle('<template><div /></template>', '  .c-a { flex: 0 1 24px !important; }')
    const twice = injectLayoutStyle(once, '  .c-a { flex: 0 1 24px !important; }')
    expect(twice).toBe(once)
  })

  it('空规则 ⇒ 原样返回（零行为变更）', () => {
    const src = '<template><div /></template>'
    expect(injectLayoutStyle(src, '')).toBe(src)
    expect(injectLayoutStyle(src, '   ')).toBe(src)
  })
})
