/**
 * 刀 40（2026-10-21 · mc-1792575046720-2c0767be 实锤）— 同一规则块内同属性重复声明消歧。
 *
 * 事故：`.c-component-card-grid-list` 同一块内先 `display: grid` 后 `display: flex`
 * （+ `flex-direction: column`）⇒ 折叠列表 12 张卡纵向单列堆叠，12 个厂商名全在却
 * 看起来像「完全没修」。
 *
 * 本 spec 守三条：
 *   ① 阳性：真机原样形态 ⇒ 删 `display:grid` 留 `display:flex`，且其余声明一字不动；
 *   ② 阴性 A~D：厂商前缀 / var() / !important 混存 / 纯色+渐变 —— 四种**合法渐进增强**一律不动；
 *   ③ 阴性 E：块内含注释、含嵌套 ⇒ 整块跳过（重建声明体会破坏注释）。
 */

import {
  dedupeBlockDecls,
  dedupeDuplicateDeclsInBlocks,
  dedupeStyleBlocks,
  isBenignFallbackGroup,
} from '../block-duplicate-decl-guard.js'

const REAL_BODY = `
  height: 100%;

  display: grid;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 20px;
  align-content: flex-start;
`

describe('dedupeBlockDecls — 同一块内同属性重复', () => {
  it('① 阳性（真机原样）：display 写两遍 ⇒ 删前面的 grid、留后面的 flex，其余不动', () => {
    const r = dedupeBlockDecls(REAL_BODY)
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0]).toMatchObject({ prop: 'display', dropped: ['grid'], kept: 'flex', reason: 'conflict' })
    expect(r.body).toContain('display: flex')
    expect(r.body).not.toContain('display: grid')
    // 其余声明必须逐条保留
    for (const d of ['height: 100%', 'width: 100%', 'flex: 1 1 0', 'min-height: 0',
      'flex-direction: column', 'flex-wrap: wrap', 'gap: 20px', 'align-content: flex-start']) {
      expect(r.body).toContain(d)
    }
    // 每条都以 ; 收尾（P2-11）
    expect(r.body.trim().split('\n').every((l) => l.trim().endsWith(';'))).toBe(true)
  })

  it('② 阴性：不同属性之间不得互相误伤', () => {
    const r = dedupeBlockDecls('width: 100%; height: 30px; gap: 20px;')
    expect(r.removed).toEqual([])
    expect(r.body).toBe('width: 100%; height: 30px; gap: 20px;')
  })

  it('③ 阴性 A：厂商前缀值属渐进增强（display: -webkit-box → display: flex）', () => {
    const body = 'display: -webkit-box; display: flex;'
    expect(isBenignFallbackGroup([{ value: '-webkit-box' }, { value: 'flex' }])).toBe(true)
    const r = dedupeBlockDecls(body)
    expect(r.removed).toEqual([])
    expect(r.body).toBe(body)
  })

  it('④ 阴性 B：var()/env() 回退不得删（color: #333 → color: var(--c)）', () => {
    const body = 'color: #333333; color: var(--color-text-base);'
    expect(isBenignFallbackGroup([{ value: '#333333' }, { value: 'var(--color-text-base)' }])).toBe(true)
    expect(dedupeBlockDecls(body).removed).toEqual([])
  })

  it('⑤ 阴性 C：!important 与普通混存不得按顺序取舍', () => {
    const body = 'color: red !important; color: blue;'
    expect(isBenignFallbackGroup([{ value: 'red !important' }, { value: 'blue' }])).toBe(true)
    expect(dedupeBlockDecls(body).removed).toEqual([])
  })

  it('⑥ 阴性 D：纯色 + 渐变属双层回退（background: #fff → linear-gradient）', () => {
    const body = 'background: #ffffff; background: linear-gradient(90deg, #fff, #000);'
    expect(isBenignFallbackGroup([{ value: '#ffffff' }, { value: 'linear-gradient(90deg, #fff, #000)' }])).toBe(true)
    expect(dedupeBlockDecls(body).removed).toEqual([])
  })

  it('⑦ 阴性 E：块内含注释 ⇒ 整块跳过（重建会破坏注释）', () => {
    const body = '/* 面板底 */ background: #fff; /* 备注 */ display: grid; display: flex;'
    const r = dedupeBlockDecls(body)
    expect(r.removed).toEqual([])
    expect(r.body).toBe(body)
  })

  it('⑧ 同值重复属冗余 ⇒ 删前面留一条（reason=redundant）', () => {
    const r = dedupeBlockDecls('display: flex; display: flex;')
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].reason).toBe('redundant')
    expect(r.body).toBe('  display: flex;')
  })

  it('⑨ 三条同属性冲突 ⇒ 只留最后一条', () => {
    const r = dedupeBlockDecls('display: block; display: grid; display: flex;')
    expect(r.removed[0].dropped).toEqual(['block', 'grid'])
    expect(r.removed[0].kept).toBe('flex')
  })
})

describe('dedupeStyleBlocks — 逐块扫描', () => {
  it('⑩ 只处理最内层块，嵌套块的外层结构不得被破坏', () => {
    const css = `.a { .b { display: grid; display: flex; } }`
    const r = dedupeStyleBlocks(css)
    expect(r.content).toContain('display: flex')
    expect(r.content).not.toContain('display: grid')
    // 花括号必须仍然平衡
    const open = (r.content.match(/\{/g) || []).length
    const close = (r.content.match(/\}/g) || []).length
    expect(open).toBe(close)
  })

  it('⑪ 多个块各自独立处理', () => {
    const css = `.a { display: grid; display: flex; }\n.b { color: red; }\n.c { gap: 1px; gap: 2px; }`
    const r = dedupeStyleBlocks(css)
    expect(r.changes).toHaveLength(2)
    expect(r.content).toContain('.b { color: red; }')
  })
})

describe('dedupeDuplicateDeclsInBlocks — 全量产物入口', () => {
  const lessPath = 'resources/styles/common.less'

  it('⑫ 数组形态：命中 less 与 vue 的 style 块', () => {
    const files = [
      { path: lessPath, content: `.x { display: grid; display: flex; }` },
      {
        path: 'package/components/CardGridList.vue',
        content: `<template><div/></template>\n<style lang="less" scoped>.y { gap: 4px; gap: 20px; }</style>`,
      },
    ]
    const r = dedupeDuplicateDeclsInBlocks(files)
    expect(r.changes).toHaveLength(2)
    expect(r.files[0].content).not.toContain('display: grid')
    expect(r.files[1].content).toContain('gap: 20px')
    expect(r.files[1].content).not.toContain('gap: 4px')
  })

  it('⑬ 对象 map 形态：进什么形态出什么形态', () => {
    const files = { [lessPath]: `.x { display: grid; display: flex; }` }
    const r = dedupeDuplicateDeclsInBlocks(files)
    expect(Array.isArray(r.files)).toBe(false)
    expect(r.files[lessPath]).toContain('display: flex')
    expect(r.files[lessPath]).not.toContain('display: grid')
  })

  it('⑭ 无改动返回输入原引用（供管线判定 applied）', () => {
    const files = [{ path: lessPath, content: `.x { color: red; }` }]
    const r = dedupeDuplicateDeclsInBlocks(files)
    expect(r.changes).toEqual([])
    expect(r.files).toBe(files)
  })

  it('⑮ 幂等：跑两次结果一致', () => {
    const files = [{ path: lessPath, content: `.x { display: grid; display: flex; }` }]
    const once = dedupeDuplicateDeclsInBlocks(files)
    const twice = dedupeDuplicateDeclsInBlocks(once.files)
    expect(twice.changes).toEqual([])
    expect(twice.files[0].content).toBe(once.files[0].content)
  })

  it('⑯ 非样式文件（.js/.json）不得被动到', () => {
    const js = 'const s = "display: grid; display: flex;"'
    const files = [{ path: 'package/index.js', content: js }]
    const r = dedupeDuplicateDeclsInBlocks(files)
    expect(r.files).toBe(files)
  })
})
