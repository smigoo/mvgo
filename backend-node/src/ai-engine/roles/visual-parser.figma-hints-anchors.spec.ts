/**
 * 刀A/B/C 回归夹具（2026-11-16 · ca3b76de / d9b6f34b 真机实锤）
 *
 * 刀A：extractFigmaHints 对 @echarts 容器「剔子保父」——旧实现 `return ''` 整树剔除，
 *      真值 2:3604(@echarts/line-7) 在深度 2 也被剔 ⇒ prompt 全文 0 次，「流量预测」段模型
 *      想锚也没锚可选。现保留容器行 + ⚙️注记，只跳过子级递归。
 * 刀B：深度边界（maxDepth=4）子节点不再静默剪枝——d9b6f34b 真机 prompt 里 89:39 @antd/tab
 *      只剩 `[layout: vertical, 6 children]`，6 个 tab 组 id 全不可见；2:8437 的 12 张卡同。
 *      现父层输出一层紧凑子清单（上限 MAX_DEPTH_BOUNDARY_CHILDREN=16，超限显式标注）。
 * 刀C：prompt anchorRules 追加规则6「标题节点不是段身」反例（几何语言，不做命名硬拦）。
 *
 * 测试策略：VisualParser 继承链含 `import.meta`（BaseAgent），本仓 jest(CJS) 不可 import
 * （先例：visual-parser-direct-bg.spec.ts）⇒ 用**方法体切片 + new Function 装配**运行
 * `extractFigmaHints` 真实代码（从源文件 slice 出来，this 引用自由变量闭包）——
 * 与纯源码断言相比能真跑逻辑。离线真机重放阳性对照：/tmp/hints-after-ca3b76de.txt、
 * /tmp/hints-after-d9b6f34b.txt（ca3b76de 2:3604 0→2 次；d9b6f34b 6 tab+12 卡 id 全可见；
 * 阴性 diff 仅新增块，既有行逐字不变）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, 'visual-parser.js'), 'utf-8')

/** 从类源码切出 extractFigmaHints 方法体，装配为可执行函数 */
function buildExtractFigmaHints() {
  const sig = 'extractFigmaHints(node, maxDepth = 4, currentDepth = 0, resourceDomMapping = null, budget = null) {'
  const at = SRC.indexOf(sig)
  expect(at).toBeGreaterThan(0)
  const end = SRC.indexOf('\n  }\n', at)
  expect(end).toBeGreaterThan(at)
  const body = SRC.slice(at + sig.length, end)
  // 闭包注入方法体内引用的自由变量：FIGMA_HINT_MAX_CHARS / MAX_DEPTH_BOUNDARY_CHILDREN / logger
  const FIGMA_HINT_MAX_CHARS = 5000
  const MAX_DEPTH_BOUNDARY_CHILDREN = 16
  const logger = { warn: () => {}, info: () => {} }
  const fillToRgba = (f) => (f && f.color ? `rgba(${Math.round((f.color.r||0)*255)},${Math.round((f.color.g||0)*255)},${Math.round((f.color.b||0)*255)},${f.color.a ?? 1})` : null)
  const fillsToCss = () => ''
  const matchResourceMapping = () => null
  const fn = new Function(
    'FIGMA_HINT_MAX_CHARS','MAX_DEPTH_BOUNDARY_CHILDREN','logger','fillToRgba','fillsToCss','matchResourceMapping',
    `return function extractFigmaHints(node, maxDepth = 4, currentDepth = 0, resourceDomMapping = null, budget = null) {${body}}`
  )(FIGMA_HINT_MAX_CHARS, MAX_DEPTH_BOUNDARY_CHILDREN, logger, fillToRgba, fillsToCss, matchResourceMapping)
  // 方法体内递归调用 `this.extractFigmaHints(child, ...)` ⇒ 把自身挂为属性后以之为 this 调用
  const self = { extractFigmaHints: fn }
  return fn.bind(self)
}

/** 构造 Figma 节点 */
function node(id, name, box, extra = {}) {
  return {
    id,
    name,
    type: extra.type || 'FRAME',
    ...(box ? { absoluteBoundingBox: { x: box[0], y: box[1], width: box[2], height: box[3] } } : {}),
    ...extra,
  }
}

describe('刀A：@echarts 剔子保父（ca3b76de 2:3604 实锤）', () => {
  const extract = buildExtractFigmaHints()

  it('方法体切片有效（防切片漂移导致断言空转）', () => {
    expect(SRC).toContain('剔子保父')
    expect(SRC).toContain('MAX_DEPTH_BOUNDARY_CHILDREN = 16')
  })

  it('阳性：@echarts 容器行保留（id/尺寸可见），子级 id 不出现', () => {
    // 真机形态：2:3604 @echarts/line-7 363x141，子级 83:31/2:3636
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [
        node('2:3604', '@echarts/line-7', [10, 10, 363, 141], {
          children: [node('83:31', 'decor', [10, 10, 50, 20]), node('2:3636', 'bar', [10, 40, 100, 30])],
        }),
      ],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[2:3604]')
    expect(out).toContain('363x141')
    expect(out).toContain('图表容器')
    expect(out).not.toContain('83:31')
    expect(out).not.toContain('2:3636')
  })

  it('阳性：注记含「禁止静态还原」与容器 id 提示', () => {
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [node('9:9', '@echarts/bar-1', [0, 0, 100, 50], { children: [node('9:10', 'x', [0, 0, 10, 10])] })],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('禁止当 UI 元素静态还原')
    expect(out).toContain('9:9')
  })

  it('计数：echartsContainerShown/echartsChildrenPruned 跨递归累加且写回调用方对象', () => {
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [
        node('9:1', '@echarts/a', [0, 0, 10, 10], { children: [node('9:2', 'x', [0, 0, 5, 5]), node('9:3', 'y', [0, 5, 5, 5])] }),
        node('9:4', '@echarts/b', [20, 0, 10, 10], { children: [] }),
      ],
    })
    const budget = { used: 0, limit: 5000, truncated: false }
    extract(tree, 4, 0, null, budget)
    expect(budget.counters.echartsContainerShown).toBe(2)
    expect(budget.counters.echartsChildrenPruned).toBe(2)
  })

  it('阴性：非 @echarts 子树不受影响（@antd/tab 正常递归）', () => {
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [
        node('3:1', '@antd/tab', [0, 0, 46, 316], {
          children: [node('3:2', 'tab-a', [0, 0, 46, 54])],
        }),
      ],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[3:1]')
    expect(out).toContain('[3:2]') // @antd 子级正常递归可见
    expect(out).not.toContain('图表容器')
  })

  it('阴性：@echarts 命名大小写不敏感（@ECharts 同样剔子保父）', () => {
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [node('9:9', '@ECharts/pie', [0, 0, 100, 50], { children: [node('9:10', 'x', [0, 0, 5, 5])] })],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[9:9]')
    expect(out).not.toContain('[9:10]')
  })

  it('嵌套 @echarts：只剔命中节点子级，兄弟不受影响', () => {
    const tree = node('2:1', 'slot', [0, 0, 400, 300], {
      children: [
        node('9:1', '@echarts/x', [0, 0, 100, 50], { children: [node('9:2', 'inner', [0, 0, 5, 5], { children: [node('9:3', 'leaf', [0, 0, 2, 2])] })] }),
        node('9:9', 'text-neighbor', [0, 60, 50, 20]),
      ],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[9:9]')
    expect(out).not.toContain('[9:2]')
    expect(out).not.toContain('[9:3]')
  })
})

describe('刀B：深度边界一层紧凑子清单（d9b6f34b 89:39/2:8437 实锤）', () => {
  const extract = buildExtractFigmaHints()

  /** 深度链 root(0)→a(1)→b(2)→c(3)→d(4)：c 是 maxDepth-1 父层，d 处于被剪层 */
  function deepTree(childCount = 6) {
    return node('r', 'root', [0, 0, 400, 400], {
      children: [
        node('a', 'l1', [0, 0, 400, 380], {
          children: [
            node('b', 'l2', [0, 0, 400, 360], {
              children: [
                node('c', 'l3', [0, 0, 400, 340], {
                  children: Array.from({ length: childCount }, (_, i) =>
                    node(`d${i}`, `leaf-${i}`, [0, i * 20, 40, 18])
                  ),
                }),
              ],
            }),
          ],
        }),
      ],
    })
  }

  it('阳性：深度边界列出直接子清单（id 可见、可作锚点引用）', () => {
    const out = extract(deepTree(6), 4, 0, null)
    expect(out).toContain('深度边界')
    expect(out).toContain('d0')
    expect(out).toContain('d5')
  })

  it('阳性：一层不递归——子清单只列直接子，孙级不出现', () => {
    const tree = deepTree(2)
    const c = tree.children[0].children[0].children[0]
    c.children[0].children = [node('g0', 'grandchild', [0, 0, 2, 2])]
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('d0')
    expect(out).not.toContain('g0')
  })

  it('上限：超过 16 个只列 16 个并显式标注省略数', () => {
    const out = extract(deepTree(20), 4, 0, null)
    expect(out).toContain('d15')
    expect(out).not.toContain('d16')
    expect(out).toContain('另省略 4 个')
  })

  it('计数：depthBoundaryListed/depthBoundaryChildren 写回调用方对象', () => {
    const budget = { used: 0, limit: 5000, truncated: false }
    extract(deepTree(6), 4, 0, null, budget)
    expect(budget.counters.depthBoundaryListed).toBe(1)
    expect(budget.counters.depthBoundaryChildren).toBe(6)
  })

  it('清单计入预算（budget.used 增长，防预算通道静默断掉）', () => {
    const budget = { used: 0, limit: 5000, truncated: false }
    extract(deepTree(6), 4, 0, null, budget)
    expect(budget.used).toBeGreaterThan(200)
  })

  it('阴性：浅树（深度≤4 正常递归）不触发深度边界块', () => {
    const tree = node('r', 'root', [0, 0, 400, 400], {
      children: [node('a', 'l1', [0, 0, 100, 50], { children: [node('b', 'l2', [0, 0, 50, 20])] })],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[b]')
    expect(out).not.toContain('深度边界')
  })

  it('阴性：@echarts 容器即使处于深度边界父层也不列子清单（刀A 剔子保父优先）', () => {
    const tree = node('r', 'root', [0, 0, 400, 400], {
      children: [
        node('a', 'l1', [0, 0, 400, 380], {
          children: [
            node('b', 'l2', [0, 0, 400, 360], {
              children: [
                node('9:9', '@echarts/x', [0, 0, 300, 200], {
                  children: [node('9:10', 'slice', [0, 0, 50, 20])],
                }),
              ],
            }),
          ],
        }),
      ],
    })
    const out = extract(tree, 4, 0, null)
    expect(out).toContain('[9:9]')
    expect(out).not.toContain('[9:10]')
    expect(out).not.toContain('深度边界')
    expect(out).toContain('图表容器')
  })
})

describe('刀C：prompt 锚点反例条款（ca3b76de 2:7625 实锤）', () => {
  it('anchorRules 含「标题节点不是段身」反例规则（规则6）', () => {
    expect(SRC).toContain('标题节点不是段身')
    expect(SRC).toContain('禁止作为覆盖图表/卡片/列表区域的 section.id')
  })

  it('判别法用几何语言（尺寸装不下），条款内不含实现级正则（软约束非硬门禁）', () => {
    expect(SRC).toContain('21px 高的标题装不下 131px 高的图表')
    const rule = SRC.match(/6\. \*\*标题节点不是段身\*\*[^\n]+/)?.[0] || ''
    expect(rule).not.toMatch(/RegExp|\.test\(/)
  })

  it('接线：buildPrompt 恒打 figma-hints 计数行（0 也打）', () => {
    expect(SRC).toContain("logger.info('📐 figma-hints 计数'")
    expect(SRC).toContain('hintsBudget')
  })
})
