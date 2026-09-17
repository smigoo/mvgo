// sfc-semantics.js 顶层用 import.meta.url（createRequire）→ jest CJS 模式无法加载（既有基线）。
// ensureVue3StyleEntry 不依赖其实现，mock 掉即可。
jest.mock('../../utils/sfc-semantics.js', () => ({
  extractComponentTagNames: () => [],
}))

import { ensureVue3StyleEntry } from './vue3-style-entry.js'
import {
  buildStyleTokens,
  buildVue3ThemeVarsLess,
} from '../../utils/style-tokens.js'

/**
 * ensureVue3StyleEntry 接 styleTokens 契约（1.4，2026-09-03）。
 * 覆盖：theme-vars.less 缺失→契约渲染；缺 mixin→补契约块；完整文件不覆盖。
 */

const logger = { warn: () => {}, info: () => {} }

/** 深色稿契约（fast 构造：figmaNodeData 极小化，light 走派生） */
function tokens() {
  return buildStyleTokens(
    {
      figmaNodeData: {
        type: 'FRAME',
        children: [
          {
            type: 'RECTANGLE',
            fills: [{ type: 'SOLID', visible: true, color: { r: 0.05, g: 0.05, b: 0.08 } }],
            absoluteBoundingBox: { width: 800, height: 600 },
          },
        ],
      },
      backgroundBrightness: 'dark',
    },
    { logger },
  )
}

describe('ensureVue3StyleEntry + styleTokens（1.4）', () => {
  it('theme-vars.less 缺失 + 有契约 → 契约确定性渲染（含枚举主色），index.less 导入链不变', () => {
    const files = ensureVue3StyleEntry({}, { logger, styleTokens: tokens() })
    expect(files['resources/styles/theme-vars.less']).toContain(
      '.theme-dark() {',
    )
    expect(files['resources/styles/theme-vars.less']).toContain(
      '@colorPrimary: #44E4FF;',
    )
    expect(files['resources/styles/index.less']).toBe(
      "@import './theme-vars.less';\n@import './common.less';\n",
    )
    expect(files['resources/styles/common.less']).toBeDefined()
  })

  it('theme-vars.less 缺失 + 无契约 → 维持空模板兜底（兼容旧路径）', () => {
    const files = ensureVue3StyleEntry({}, { logger })
    expect(files['resources/styles/theme-vars.less']).toContain('.common() {')
    // 空模板无任何契约色值
    expect(files['resources/styles/theme-vars.less']).not.toContain('#44E4FF')
  })

  it('theme-vars.less 已存在（LLM 生成，含 kebab-case/裸属性）→ 系统确定性覆盖，不再保留 LLM 内容', () => {
    const partial = `// LLM 生成（含裸属性 + kebab-case 变量，会被覆盖）
.common() {
  @fontSize: 14px;
  display: flex;
}

.theme-dark() {
  @color-text-base: #123456;
}
`
    const files = ensureVue3StyleEntry(
      { 'resources/styles/theme-vars.less': partial },
      { logger, styleTokens: tokens() },
    )
    const out = files['resources/styles/theme-vars.less']
    // 系统确定性覆盖：LLM 的 kebab-case 变量与裸属性被丢弃
    expect(out).not.toContain('@color-text-base')
    expect(out).not.toContain('display: flex')
    // 系统契约 camelCase 变量 + 三 mixin 齐全
    expect(out).toContain('@colorTextBase')
    expect(out).toContain('.common() {')
    expect(out).toContain('.theme-dark() {')
    expect(out).toContain('.theme-light() {')
  })

  it('文件已完整（3 mixin 齐）→ 原样保留、不追加', () => {
    const full = buildVue3ThemeVarsLess(tokens())
    const files = ensureVue3StyleEntry(
      { 'resources/styles/theme-vars.less': full },
      { logger, styleTokens: tokens() },
    )
    expect(files['resources/styles/theme-vars.less']).toBe(full)
  })
})
