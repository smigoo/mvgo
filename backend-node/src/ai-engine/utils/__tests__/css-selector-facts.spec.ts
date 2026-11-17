/**
 * 🧩 CSS/LESS 选择器事实解析 · 阴阳对照（2026-11-17）
 *
 * 回灌锚：真机产物 mc-max-1794895488047-f785be7f 的 `resources/styles/common.less`
 * 与 `package/components/ContentSection4.vue` 的 `<style lang="less" scoped>` 都是**嵌套写法**，
 * 旧实现 `/([^{}]+)\{([^{}]*)\}/g` 在这里同时踩两个缺陷：
 *   A) 把声明挂给选择器里**所有** class（`.frame .icon .icon-img{28×28}` ⇒ `.frame`/`.icon` 也 28×28）；
 *   C) `[^{}]+` 跨不了 `{`，把**上一块的属性体当选择器**（`margin-left:9.41px; .c-monitor-icon {`）。
 *
 * 本 spec 锁死两条语义：subject 归因 + 嵌套展开。任何回退都会在这里红。
 */
import {
  parseCssRules,
  splitSelectorChain,
  splitCommaGroups,
  classesInFragment,
  stripCssComments,
} from '../css-selector-facts.js'

const NESTED_LESS = `
// 计数器注释里也有 // 与 { }
@color-bg: #1f1f1f;

.c-monitor-frame-2136636627 {
  position: relative;
  display: flex;
  flex-direction: row;

  .c-monitor-icon {
    display: flex;
    flex-direction: column;
    margin-left: 9.41px;

    .c-monitor-icon-img {
      width: 28px;
      height: 28px;
      display: block;
    }
  }

  .c-monitor-alert-label,
  .c-monitor-alert-label-alt {
    flex-direction: column;
    white-space: nowrap;
  }
}
`

describe('stripCssComments', () => {
  it('块注释与 LESS 行注释都被去掉', () => {
    const out = stripCssComments('/* a{b} */\n.a{color:red} // tail{c}\n.b{color:blue}')
    expect(out).not.toContain('/*')
    expect(out).not.toContain('// tail')
    expect(out).toContain('.a{color:red}')
    expect(out).toContain('.b{color:blue}')
  })

  it('字符串里的 `//` 与注释符不被误删', () => {
    const out = stripCssComments('.a{ background: url("http://x/y.png"); content: "// not a comment"; }')
    expect(out).toContain('http://x/y.png')
    expect(out).toContain('// not a comment')
  })
})

describe('parseCssRules（嵌套展开 · 修缺陷 C）', () => {
  const rules = parseCssRules(NESTED_LESS)
  const findByChain = (chain) => rules.filter((r) => r.selector.join(' ') === chain)

  it('LESS 嵌套被展开为完整选择器链（不是把属性体当选择器）', () => {
    expect(findByChain('.c-monitor-frame-2136636627 .c-monitor-icon')).toHaveLength(1)
    expect(
      findByChain('.c-monitor-frame-2136636627 .c-monitor-icon .c-monitor-icon-img'),
    ).toHaveLength(1)
  })

  it('嵌套内层的声明体不含外层属性（`margin-left` 不得混进 img 规则）', () => {
    const [img] = findByChain('.c-monitor-frame-2136636627 .c-monitor-icon .c-monitor-icon-img')
    expect(img.decl).toContain('width: 28px')
    expect(img.decl).not.toContain('margin-left')
    expect(img.decl).not.toContain('flex-direction')
  })

  it('外层规则不吸收内层声明（`.frame` 自身没有 width/height）', () => {
    const [frame] = findByChain('.c-monitor-frame-2136636627')
    expect(frame.decl).not.toContain('width')
    expect(frame.decl).not.toContain('44.41')
    expect(frame.decl).toContain('flex-direction: row')
  })

  it('逗号分组：一条规则拆成多条链，都得同一份声明体', () => {
    const alt = findByChain('.c-monitor-frame-2136636627 .c-monitor-alert-label-alt')
    const base = findByChain('.c-monitor-frame-2136636627 .c-monitor-alert-label')
    expect(alt).toHaveLength(1)
    expect(base).toHaveLength(1)
    expect(alt[0].decl).toBe(base[0].decl)
  })

  it('顶层变量 / @import 语句不产出规则（交给 ; 丢弃）', () => {
    expect(rules.some((r) => r.selector.some((s) => s.includes('@color-bg')))).toBe(false)
  })
})

describe('parseCssRules（at-rule / & 父链）', () => {
  it('@media 透明穿透：内部规则继承外层链', () => {
    const rules = parseCssRules(`
.card { display: flex; }
@media (max-width: 100px) {
  .card { width: 50px; }
  .card .title { font-size: 12px; }
}
`)
    const chains = rules.map((r) => r.selector.join(' '))
    expect(chains).toContain('.card')
    expect(chains).toContain('.card .title')
    // @media 自身不产出规则
    expect(chains.some((c) => /^@media/.test(c))).toBe(false)
  })

  it('`&` 替换父链（LESS 语义）', () => {
    const rules = parseCssRules('.btn { color: red; &:hover { color: blue; } &.is-on { color: green; } & > .dot { width: 2px; height: 2px; } }')
    const chains = rules.map((r) => r.selector.join(' '))
    expect(chains).toContain('.btn')
    expect(chains).toContain('.btn:hover')
    expect(chains).toContain('.btn.is-on')
    expect(chains).toContain('.btn .dot')
  })

  it('未闭合的块按已采集内容产出（宁可多采，不静默丢事实）', () => {
    const rules = parseCssRules('.a { color: red; .b { width: 2px; height: 2px;')
    const chains = rules.map((r) => r.selector.join(' '))
    expect(chains).toContain('.a')
    expect(chains).toContain('.a .b')
  })
})

describe('splitSelectorChain / splitCommaGroups / classesInFragment', () => {
  it('按组合子切分，括号内空格不切', () => {
    expect(splitSelectorChain('.a > .b .c:hover')).toEqual(['.a', '.b', '.c:hover'])
    expect(splitSelectorChain('.a:not(.b .c) .d')).toEqual(['.a:not(.b .c)', '.d'])
    expect(splitSelectorChain('[data-x="a b"] .d')).toEqual(['[data-x="a b"]', '.d'])
  })

  it('顶层逗号拆分，括号内逗号不拆', () => {
    expect(splitCommaGroups('.a, .b')).toEqual(['.a', '.b'])
    expect(splitCommaGroups('.a:not(.b, .c), .d')).toEqual(['.a:not(.b, .c)', '.d'])
  })

  it('取 class 时剥掉属性选择器与伪类参数（`:not(.x)` 里的 x 不是受体）', () => {
    expect(classesInFragment('.a.b:hover')).toEqual(['a', 'b'])
    expect(classesInFragment('.a:not(.b)')).toEqual(['a'])
    expect(classesInFragment('[class=".fake"] .real')).toEqual(['real'])
    expect(classesInFragment('div > span')).toEqual([])
  })
})
