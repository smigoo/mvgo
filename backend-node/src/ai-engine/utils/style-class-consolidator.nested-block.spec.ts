import {
  consolidateSubComponentClasses,
  splitBlockBody,
  outerBlockBody,
} from './style-class-consolidator.js'

/**
 * 🛡️ 刀 48（2026-10-22 · mc-1792643509867-db2d65f7 实锤）：嵌套子块的声明必须留在子块里。
 *
 * ── 事故 ─────────────────────────────────────────────────────────────
 * 真机产物 `resources/styles/common.less` 里 `.c-db2d65-card-grid-list2` 一条规则同时含：
 *   容器声明（display:grid / grid-template-columns / column-gap:20px / row-gap:20px）
 *   + 子项声明（gap:4px / height:30px / padding:0 6px / background / border-radius）
 * 而 `gap` 是速记属性、且**后写** ⇒ 把 column-gap/row-gap 一起顶掉 ⇒ 普通厂商段
 * 实测行距列距都是 4px（真值 20），容器高被钉 30px。
 *
 * 根因：`mergeCssBlocks` 用 `/\{([^}]*)\}/` 取块体，`[^}]` 在**第一个子块的 `}`** 处截断，
 * 之后逐行按 `prop: value` 解析 ⇒ 子块内部声明全部被当成父块声明。
 *
 * 本 spec 覆盖：
 *   ① 真机数据端到端（父块不得含子块声明，子块必须存活）
 *   ② splitBlockBody 纯函数正例 + 四个误伤对照（字符串 / 注释 / 深层嵌套 / 无嵌套回归）
 *   ③ outerBlockBody 深度感知（不被第一个 `}` 截断）
 *   ④ 合并语义：顶层与子块各自「后写者胜」
 */

const logger = { warn: () => {}, info: () => {}, log: () => {} }

/** 构造子组件 SFC（template 里出现该类名，保证类事实命中） */
const childSfc = (cls, body) => `<template>
  <div class="${cls}"><div class="${cls}-item"></div></div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

${body}
</style>
`

/** 取指定选择器的**外层块体**（与生产同一实现，禁止在测试里另写一份正则） */
const bodyOf = (less, selector) => {
  const idx = less.indexOf(`${selector} {`)
  if (idx < 0) return null
  return outerBlockBody(less.slice(idx))
}

describe('刀 48 · 嵌套子块声明不得并入父块', () => {
  // ── ① 真机数据端到端 ────────────────────────────────────────────────
  it('① 阳性（第八轮真机数据）：父块保留 column-gap/row-gap，子项的 gap:4px 不得上浮', () => {
    const files = {
      // common.less 已有同名块（style chunk 产物，只含容器声明）
      'resources/styles/common.less': `.c-demo-card-grid-list2 {
  display: grid;
  grid-template-columns: repeat(4, 126px);
  grid-auto-rows: 30px;
  column-gap: 20px;
  row-gap: 20px;
  align-content: start;
}
`,
      // 子组件：父块 + 嵌套子块（LLM 真实写法）
      'package/components/CardGridList2.vue': childSfc(
        'c-demo-card-grid-list2',
        `.c-demo-card-grid-list2 {
  display: grid;
  grid-template-columns: repeat(4, 126px);
  column-gap: 20px;
  row-gap: 20px;
  height: 100%;
  min-height: 0;

  .c-demo-card-grid-list2-item {
    display: flex;
    flex-direction: row;
    gap: 4px;
    min-width: 0;
    height: 30px;
    padding: 0 6px;
    background: #f6fff7;
    border-radius: 4px;
  }
}`,
      ),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const less = out['resources/styles/common.less']
    const parentBody = bodyOf(less, '.c-demo-card-grid-list2')
    expect(parentBody).toBeTruthy()

    // 父块保留容器声明（未被覆盖）
    expect(parentBody).toContain('column-gap: 20px')
    expect(parentBody).toContain('row-gap: 20px')
    expect(parentBody).toContain('grid-template-columns: repeat(4, 126px)')
    expect(parentBody).toContain('height: 100%')

    // 🔴 核心断言：子项声明**不得**出现在父块的顶层
    const parentTopLevel = splitBlockBody(parentBody).decls.join(';')
    expect(parentTopLevel).not.toMatch(/(^|;)\s*gap\s*:\s*4px/)
    expect(parentTopLevel).not.toMatch(/(^|;)\s*padding\s*:\s*0 6px/)
    expect(parentTopLevel).not.toMatch(/(^|;)\s*background\s*:/)
    expect(parentTopLevel).not.toMatch(/(^|;)\s*border-radius\s*:\s*4px/)

    // 子块必须存活并带回自己的声明
    const subs = splitBlockBody(parentBody).nested
    const sub = subs.find((n) => n.selector === '.c-demo-card-grid-list2-item')
    expect(sub).toBeTruthy()
    const subDecls = splitBlockBody(sub.body).decls.join(';')
    expect(subDecls).toMatch(/gap\s*:\s*4px/)
    expect(subDecls).toMatch(/height\s*:\s*30px/)
    expect(subDecls).toMatch(/padding\s*:\s*0 6px/)
  })

  // ── ② splitBlockBody 纯函数 ────────────────────────────────────────
  it('② 纯函数：顶层声明与嵌套块彻底分离', () => {
    const { decls, nested } = splitBlockBody(`
  display: flex;
  gap: 20px;
  .child {
    gap: 4px;
  }
  color: red;
`)
    expect(decls).toEqual(['display: flex', 'gap: 20px', 'color: red'])
    expect(nested).toHaveLength(1)
    expect(nested[0].selector).toBe('.child')
    expect(splitBlockBody(nested[0].body).decls).toEqual(['gap: 4px'])
  })

  it('③ 误伤对照：字符串里的花括号/分号不参与切分', () => {
    const { decls, nested } = splitBlockBody(`
  content: "}";
  background: url("a;b.png");
  font-family: 'A;B';
`)
    expect(nested).toHaveLength(0)
    expect(decls).toHaveLength(3)
    expect(decls[1]).toBe('background: url("a;b.png")')
  })

  it('④ 误伤对照：块注释里的花括号不参与切分', () => {
    const { decls, nested } = splitBlockBody(`
  display: grid; /* 网格 { 容器 } */
  column-gap: 20px;
`)
    expect(nested).toHaveLength(0)
    expect(decls.join(';')).toMatch(/column-gap\s*:\s*20px/)
  })

  it('⑤ 深层嵌套（depth ≥ 3）原文保留，不做属性级合并', () => {
    const { nested } = splitBlockBody(`
  display: flex;
  .mid {
    color: red;
    .deep { color: blue; }
  }
`)
    expect(nested).toHaveLength(1)
    expect(nested[0].body).toContain('.deep')
    expect(nested[0].body).toContain('color: blue')
  })

  it('⑥ 无嵌套回归：纯声明块行为与旧版等价（后写者胜）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-plain {\n  gap: 44px;\n  width: 100%;\n}\n',
      'package/components/Plain.vue': childSfc('c-demo-plain', '.c-demo-plain {\n  gap: 4px;\n}'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const body = bodyOf(out['resources/styles/common.less'], '.c-demo-plain')
    expect(body).toBeTruthy()
    const decls = splitBlockBody(body).decls.join(';')
    expect(decls).toMatch(/gap\s*:\s*4px/) // 后写者胜
    expect(decls).toMatch(/width\s*:\s*100%/) // 并集保留
    expect(splitBlockBody(body).nested).toHaveLength(0)
  })

  // ── ③ outerBlockBody ──────────────────────────────────────────────
  it('⑦ outerBlockBody 深度感知：不被第一个子块的 `}` 截断', () => {
    const text = `.a {
  gap: 20px;
  .b { gap: 4px; }
  color: red;
}`
    const body = outerBlockBody(text)
    expect(body).toContain('.b { gap: 4px; }')
    // 截断的判据：末尾那条顶层声明必须还在（旧实现在子块 `}` 处就返回了）
    expect(body.trim()).toMatch(/color:\s*red;\s*$/)
  })

  it('⑧ outerBlockBody 对照：单层块体与原文一致', () => {
    expect(outerBlockBody('.a { gap: 4px; }')).toBe(' gap: 4px; ')
  })

  // ── ④ 合并语义 ────────────────────────────────────────────────────
  it('⑨ 子块同名时也按后写者胜合并，不丢声明', () => {
    const files = {
      'resources/styles/common.less': `.c-demo-mix {
  display: flex;
  .c-demo-mix-item {
    gap: 20px;
    color: red;
  }
}
`,
      'package/components/Mix.vue': childSfc(
        'c-demo-mix',
        `.c-demo-mix {
  display: flex;
  .c-demo-mix-item {
    gap: 4px;
  }
}`,
      ),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const parentBody = bodyOf(out['resources/styles/common.less'], '.c-demo-mix')
    const sub = splitBlockBody(parentBody).nested.find(
      (n) => n.selector === '.c-demo-mix-item',
    )
    expect(sub).toBeTruthy()
    const subDecls = splitBlockBody(sub.body).decls.join(';')
    expect(subDecls).toMatch(/gap\s*:\s*4px/) // 后写者胜
    expect(subDecls).toMatch(/color\s*:\s*red/) // 并集保留
  })
})
