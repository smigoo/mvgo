import fs from 'node:fs'
import less from 'less'
import { renderMicrocodeThemeVarsLess } from './style-tokens.js'
import { buildIndexLessTemplate } from '../roles/microcode/code-healer.js'

/**
 * 🛡️ R21（2026-10-21 · c-a6c6fb-a6c6fbd3 实锤）：根作用域主题取值 —— **回归护栏**。
 *
 * 这条护栏存在的理由，是**我自己差点改错**：曾据「LESS 后赋值覆盖前赋值」把默认主题
 * 挪到最后，真编译一测才发现语义相反，`index.less` 的顺序本来就是对的。
 *
 * 实测钉死两种**相反**语义（less 4.x）：
 *   · 普通重复赋值 `@c:#000; @c:#fff;`            ⇒ **后者**胜出 (#fff)
 *   · mixin 注入  `.m1(); .m2();`（都定义 @c）    ⇒ **先调用者**胜出 (m1 的值)
 *
 * ⇒ 不变式：**默认主题必须最先调用**（紧随 `.common()`）。谁把它"改成收尾"，
 *   浅色稿的根作用域就会变成其它主题的深色值（浅底白字 / 发光取深色轨）。
 *
 * ⚠️ 作用域事实：mixin 变量只泄漏到**调用者作用域**，不泄漏给兄弟规则 ⇒
 *   `theme-vars.less` 里的 `:root { .theme-*() }` 对 `common.less` **无效**（死块）；
 *   真正决定 `common.less` 根取值的是 `index.less` 的**顶层**调用。
 *
 * 硬判据：less 真编译后的声明值，不是文本 grep。
 */

const REAL = '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/c-a6c6fb-a6c6fbd3/resources/styles'

async function compileChain({ themeVars, indexLess, commonLess }) {
  const tmp = fs.mkdtempSync('/tmp/r21-')
  fs.mkdirSync(`${tmp}/themes`, { recursive: true })
  fs.writeFileSync(`${tmp}/themes/theme-vars.less`, themeVars)
  fs.writeFileSync(`${tmp}/index.less`, indexLess)
  fs.writeFileSync(`${tmp}/common.less`, commonLess)
  const out = await less.render(indexLess, { filename: `${tmp}/index.less`, paths: [tmp] })
  return out.css
}

const probeColor = (css) => ((css.match(/\.probe\s*\{[^}]*color:\s*([^;}]+)/) || [])[1] || '').trim().toLowerCase()

describe('R21 前提 ①：普通重复赋值 = 后者胜出', () => {
  it('@c:#000; @c:#fff; ⇒ #fff', async () => {
    const out = await less.render('@c:#000;\n@c:#fff;\n.p{color:@c}\n')
    expect(out.css).toMatch(/\.p\s*\{\s*color:\s*#fff/)
  })
})

describe('R21 前提 ②：mixin 注入 = 先调用者胜出（与①相反）', () => {
  it('.m1();.m2(); 都定义 @c ⇒ 取 .m1 的值', async () => {
    const out = await less.render(
      '.m1(){@c:#000}\n.m2(){@c:#fff}\n.m1();\n.m2();\n.p{color:@c}\n',
    )
    expect(out.css).toMatch(/\.p\s*\{\s*color:\s*#000/)
  })

  it('顺序颠倒 ⇒ 取 .m2 的值（证明顺序决定结果）', async () => {
    const out = await less.render(
      '.m1(){@c:#000}\n.m2(){@c:#fff}\n.m2();\n.m1();\n.p{color:@c}\n',
    )
    expect(out.css).toMatch(/\.p\s*\{\s*color:\s*#fff/)
  })
})

describe('R21 buildIndexLessTemplate：默认主题必须最先', () => {
  it('light 为默认 ⇒ 第一个 .theme-*() 调用是 .theme-light()', () => {
    const src = buildIndexLessTemplate('light', false, ['light', 'dark', 'theme_2'])
    const calls = [...src.matchAll(/\.(theme-[a-zA-Z0-9_-]+)\(\);/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]).toBe('theme-light')
    // 其余主题仍需全部被调用（否则它们的变量在根不可见 ⇒ undefined 编译阻断）
    expect(calls).toContain('theme-dark')
    expect(calls).toContain('theme-theme_2')
  })

  it('dark 为默认（深色稿）⇒ 第一个调用是 .theme-dark()', () => {
    const src = buildIndexLessTemplate('dark', false, ['light', 'dark'])
    const calls = [...src.matchAll(/\.(theme-[a-zA-Z0-9_-]+)\(\);/g)].map((m) => m[1])
    expect(calls[0]).toBe('theme-dark')
  })
})

describe('R21 renderMicrocodeThemeVarsLess：:root 暴露段默认主题最先', () => {
  it(':root 块内第一个 theme 调用 = 默认主题（light）', () => {
    const src = renderMicrocodeThemeVarsLess({}, '')
    const m = src.match(/:root\s*\{([\s\S]*?)\n\}/)
    expect(m).toBeTruthy()
    const calls = [...m[1].matchAll(/\.(theme-[a-zA-Z0-9_-]+)\(\);/g)].map((x) => x[1])
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]).toBe('theme-light')
  })
})

describe('R21 端到端（真实产物 theme-vars）：根作用域 = 默认主题', () => {
  const varsPath = `${REAL}/themes/theme-vars.less`

  it('现行模板 ⇒ @color-text-base 取 light #333333', async () => {
    if (!fs.existsSync(varsPath)) return
    const themeVars = fs.readFileSync(varsPath, 'utf8')
    const indexLess = buildIndexLessTemplate('light', false, ['light', 'dark', 'theme_2'])
    const css = await compileChain({
      themeVars,
      indexLess,
      commonLess: '.probe { color: @color-text-base; }\n',
    })
    expect(probeColor(css)).toBe('#333333')
  })

  it('阴性对照：默认主题挪到最后 ⇒ 取到 #ffffff（说明顺序护栏不是摆设）', async () => {
    if (!fs.existsSync(varsPath)) return
    const themeVars = fs.readFileSync(varsPath, 'utf8')
    const bad = `// 样式入口（系统自动生成，勿手改）
@import './themes/theme-vars.less';

.common();
.theme-theme_2();
.theme-dark();
.theme-light();

@import (multiple) './common.less';
`
    const css = await compileChain({
      themeVars,
      indexLess: bad,
      commonLess: '.probe { color: @color-text-base; }\n',
    })
    expect(probeColor(css)).toBe('#ffffff')
  })
})
