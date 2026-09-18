/**
 * buildNodeLayoutFacts 单测（B' 事实层，2026-09-18）
 * 覆盖：标准 Auto-Layout（layoutMode 确定性）、不标准文件几何推断（env-monitor tab 横排根治）、
 * 堆叠、模糊方向默认 row、递归、<2 子节点、{document} 包裹。
 * 注：本仓库 .ts spec 走 babel-jest（不剥类型），故此处不写 TS 类型注解，与 flex-direction-inferrer.spec.ts 同口径。
 */
import { buildNodeLayoutFacts } from '../figma-node-layout-facts.js'

function box(x, y, w, h) {
  return { x, y, width: w, height: h }
}
function child(id, x, y, w, h, extra) {
  return { id, type: 'FRAME', absoluteBoundingBox: box(x, y, w, h), ...(extra || {}) }
}

describe('buildNodeLayoutFacts — B\' 事实层', () => {
  it('⭐ 不标准文件：tab 列表 4 子项 side-by-side（env-monitor 根因）→ 几何推断 flex-row high', () => {
    // c-env-monitor-tabs-list 在 Figma 里 4 个 tab 横向并排、layoutMode 缺失（绝对定位）
    const tabsList = {
      id: '2:7889',
      layoutMode: 'NONE',
      children: [
        child('89:42', 0, 0, 120, 40),
        child('89:43', 120, 0, 120, 40),
        child('89:44', 240, 0, 120, 40),
        child('89:45', 360, 0, 120, 40),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [tabsList] } })
    expect(facts['2:7889']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })

  it('标准 Auto-Layout：layoutMode=HORIZONTAL → flex-row high（不依赖几何）', () => {
    const node = {
      id: '3:10',
      layoutMode: 'HORIZONTAL',
      children: [child('3:11', 0, 0, 50, 50), child('3:12', 0, 200, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['3:10']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
  })

  it('标准 Auto-Layout：layoutMode=VERTICAL → flex-column high', () => {
    const node = {
      id: '3:20',
      layoutMode: 'VERTICAL',
      children: [child('3:21', 0, 0, 50, 50), child('3:22', 200, 0, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['3:20']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
  })

  it('不标准文件：子节点纵向堆叠 → 几何推断 flex-column high', () => {
    const node = {
      id: '4:1',
      children: [
        child('4:2', 0, 0, 100, 40),
        child('4:3', 0, 40, 100, 40),
        child('4:4', 0, 80, 100, 40),
        child('4:5', 0, 120, 100, 40),
      ],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['4:1']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })

  it('方向模糊（部分横排+部分堆叠）→ 默认 flex-row + confidence=low', () => {
    // 3 子节点：2 横排 + 1 堆叠 → side-by-side 比例 1/3 ≈ 0.33（介于 0.25~0.75）→ low → 默认 row
    const node = {
      id: '5:1',
      children: [
        child('5:2', 0, 0, 100, 40),
        child('5:3', 110, 0, 100, 40),
        child('5:4', 0, 50, 100, 40),
      ],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['5:1']).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'low',
    })
  })

  it('子节点 < 2 个 → 不发事实（单子节点无需 flex 布局）', () => {
    const node = {
      id: '6:1',
      children: [child('6:2', 0, 0, 100, 40)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['6:1']).toBeUndefined()
  })

  it('递归遍历：嵌套节点各自产出事实', () => {
    const root = {
      id: '7:0',
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '7:1',
          layoutMode: 'NONE',
          children: [child('7:2', 0, 0, 80, 30), child('7:3', 90, 0, 80, 30)],
        },
        {
          id: '7:4',
          layoutMode: 'NONE',
          children: [child('7:5', 0, 60, 80, 30), child('7:6', 90, 60, 80, 30)],
        },
      ],
    }
    const facts = buildNodeLayoutFacts(root)
    expect(facts['7:0']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
    expect(facts['7:1']).toMatchObject({ display: 'flex', flexDirection: 'row', source: 'geometric-inference' })
    expect(facts['7:4']).toMatchObject({ display: 'flex', flexDirection: 'row', source: 'geometric-inference' })
  })

  it('空 / 非对象输入 → 返回空对象（fail-open，不抛错）', () => {
    expect(buildNodeLayoutFacts(null)).toEqual({})
    expect(buildNodeLayoutFacts(undefined)).toEqual({})
    expect(buildNodeLayoutFacts('not-a-tree')).toEqual({})
  })
})
