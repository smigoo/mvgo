/**
 * 刀 39 spec（2026-10-21 · mc-max-1792563165341-e3ab048a 实锤）：
 * `ensureReferencedIconSize` 必须覆盖 `backgroundImage` 形态，而不只是 `<img :src>`。
 *
 * 事故：`ContentIcon.vue` 的 section 根写成
 *   `<div data-section-id="187:262" :style="{ backgroundImage: `url(${icon2})`,
 *     backgroundSize: '100% 100%', … }">`
 * 而真值 `187:262` = 53 × 55.45（mapping.figmaBox；parentBox 265×76 ⇒ 覆盖率 0.146，
 * 本就**不该**判 cover）。旧实现正则只认 `:src="icon2"` ⇒ patched=false ⇒ 调用方
 * `doneKeys.add(key); continue;` 静默放弃 ⇒ 图标被 100% 100% 拉伸变形。
 */
import { ensureReferencedIconSize } from './resource-mounter.js'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}))

const SIZE = { width: 53, height: 55 }

describe('刀 39 ensureReferencedIconSize —— backgroundImage 形态', () => {
  it('阳性：`backgroundSize: \'100% 100%\'` ⇒ 改为真值 px', () => {
    const src =
      '<div data-section-id="187:262" class="c-icon" :style="{ backgroundImage: `url(${icon2})` , backgroundSize: \'100% 100%\', backgroundRepeat:\'no-repeat\', backgroundPosition:\'0px 0px\'}" v-bind="$attrs"></div>'
    const { content, patched, mode } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(true)
    expect(mode).toBe('bg')
    expect(content).toContain("backgroundSize: '53px 55px'")
    expect(content).not.toContain('100% 100%')
    // 其余三件套原样保留
    expect(content).toContain("backgroundRepeat:'no-repeat'")
    expect(content).toContain("backgroundPosition:'0px 0px'")
  })

  it('阳性：字符串拼接写法 + cover ⇒ 改为真值 px', () => {
    const src = `<div :style="{ backgroundImage: 'url(' + icon2 + ')', backgroundSize: 'cover' }"></div>`
    const { content, patched } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(true)
    expect(content).toContain("backgroundSize: '53px 55px'")
  })

  it('阳性：对象写法完全没有 backgroundSize 键 ⇒ 补一项', () => {
    const src = '<div :style="{ backgroundImage: `url(${icon2})` }"></div>'
    const { content, patched } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(true)
    expect(content).toContain("backgroundSize: '53px 55px'")
    // 语法上必须仍是合法对象字面量：`... }, backgroundSize: '...' }`
    expect(content).toMatch(/backgroundImage:\s*`url\(\$\{icon2\}\)`\s*,\s*backgroundSize:\s*'53px 55px'\s*\}/)
  })

  it('阳性：原生 style 字符串无视 size ⇒ 追加 background-size', () => {
    const src = '<div style="background-image:url(icon2);color:red"></div>'
    const { content, patched } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(true)
    expect(content).toContain('background-size:53px 55px')
    expect(content).toContain('color:red')
  });

  it('阴性：已是 px 尺寸 ⇒ 一字不动（幂等）', () => {
    const src = `<div :style="{ backgroundImage: \`url(\${icon2})\`, backgroundSize: '53px 55px' }"></div>`
    const { content, patched } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(false)
    expect(content).toBe(src)
  })

  it('阴性：引用的不是本变量（icon3）⇒ 不动', () => {
    const src = `<div :style="{ backgroundImage: \`url(\${icon3})\`, backgroundSize: '100% 100%' }"></div>`
    const { content, patched } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(false)
    expect(content).toBe(src)
  })

  it('阴性：<img :src> 分支行为不变（回归）', () => {
    const src = '<img :src="icon2" alt="" />'
    const { content, patched, mode } = ensureReferencedIconSize(src, 'icon2', SIZE)
    expect(patched).toBe(true)
    expect(mode).toBe('img')
    expect(content).toContain('width:53px')
    expect(content).toContain('height:55px')
  })

  it('阴性：尺寸真值缺失 ⇒ 全量不动（fail-open）', () => {
    const src = '<div :style="{ backgroundImage: `url(${icon2})`, backgroundSize: \'100% 100%\' }"></div>'
    expect(ensureReferencedIconSize(src, 'icon2', null).patched).toBe(false)
    expect(ensureReferencedIconSize(src, 'icon2', { width: 0, height: 0 }).patched).toBe(false)
  })
})
