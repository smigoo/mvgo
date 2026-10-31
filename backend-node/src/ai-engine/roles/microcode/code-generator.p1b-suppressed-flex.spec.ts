/**
 * 🛡️ P1-B 单测（2026-10-26 · mc-max-1792934367321-ab7bb76c 实锤）：
 * 「被刀 53 两阶段决策抑制的成员，必须从 flex 归一化**分母**里剔除」。
 *
 * ## 为什么需要这条判据（真渲染实测，不是推理）
 * 事故件 `43:4784` 是 flex row，两列真值宽 179 / 291 ⇒ 装配层给出
 * `flex:0.380`（幸存者）/ `flex:0.620`（被抑制的 CardGrid）。看似「被抑制的兄弟
 * 占了一半宽度」，实际 puppeteer 三组对照给出了**完全不同**的结论：
 *
 *   | 组 | 情形                                   | 幸存者实测宽 |
 *   |----|----------------------------------------|--------------|
 *   | A  | 兄弟 `display:none;flex:0.620`         | 177.83px     |
 *   | B  | 兄弟可见（对照）                       | 177.83px     |
 *   | E  | 兄弟**物理删出 DOM**                   | 177.83px（逐像素不变）|
 *   | F  | 幸存者**重归一化** `flex:1.000`        | 468px（吃掉整行）|
 *
 * ⇒ `display:none` **不占位**（rect 0×0），删 DOM 也不改变结果。病根是 CSS Flexbox
 *   的 `<1` 特例：因子总和 <1 时浏览器把可用空间**乘以该总和**再分配
 *   ⇒ `flex:0.380` 语义是「容器 38% 的绝对值」，不是「占兄弟份额的 38%」。
 *   **唯一有效解法**：让幸存者的因子之和回到 1.0 ⇒ 把抑制成员的尺寸填 0
 *   （0 不贡献 `total`，幸存者 `w/total` 自动归一化到 1.000）。
 *
 * ## 三条纪律（本 spec 逐条对应）
 * 1. **单一事实源**：`suppressed` 只能来自 `collectFoldedGridTakeover`（刀 53 唯一判据源），
 *    装配层只消费。禁止用 `vue.includes('display:none')` 嗅探产物 —— 那是把「渲染结果」
 *    当判据，改一个类名就静默失效。
 * 2. **同一棵树**：剔除键必须取自 `resolvePlanSections(input)` 的树（与下游 `nameOf` 同源），
 *    否则 `dedupeDuplicateSections` 增删叶子会让 id/tag 错位并归零到**错误的子项**。
 * 3. **fail-open**：判据不可用（无 Figma 事实 / 树为空 / 接管器异常）⇒ 空集 ⇒ 走既有比例
 *    行为，零回归。
 *
 * 阳性语料复刻事故件比例：两列 179 / 291（合计 470，即 0.381 / 0.619），两列同属一张
 * 三行表 ⇒ 触发表格两阶段决策 ⇒ 第 2 个成员被抑制。
 */
import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：与 code-generator.deterministic-template.spec.ts 同款替身
// （下列模块内部使用 import.meta，jest CJS 模式下直接 import 会加载失败）。
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

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

import {
  buildDeterministicIndexTemplate,
  flexItemStyleFromWidths,
  resolveSectionFlexSize,
} from './code-generator.js'
import { collectFoldedGridTakeover } from '../../utils/folded-grid-section-takeover.js'
import { indexFigmaNodes } from '../../utils/section-tree.js'

// ────────────────────────── Figma 语料夹具 ──────────────────────────

const solid = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  }
}

const textNode = (id: string, chars: string, x: number, y: number, w: number, h: number) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [solid('#333333')],
  style: { fontSize: 14, fontWeight: 400 },
})

/** 事故件 `43:4784` 真值：两列 179 / 291（合计 470），三行数据 + 表头 */
const COL_W = [179, 291]
/** 列 x 由列宽**累积**得出（左对齐无间隙 ⇒ 满足「x 严格递增 + 咬合 ≤2px」） */
const colXs = (widths: number[]) =>
  widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
const ROW_H = 44
const HEAD = ['设备名称', '启用状态']
const ROWS = [
  ['K1', '启用'],
  ['K2', '启用'],
  ['K3', '禁用'],
]
const COL_TEXTS = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])])

/** 一张 N 列 × 3 行表格：列容器同高同 y、x 严格递增、跨列逐行 y 对齐 */
const makeTable = (id: string, colTexts: string[][], widths: number[] = COL_W) => {
  const xs = colXs(widths)
  const totalW = widths.reduce((a, b) => a + b, 0)
  return {
    id,
    type: 'FRAME',
    name: `table-${id}`,
    absoluteBoundingBox: { x: 0, y: 0, width: totalW, height: ROW_H * colTexts[0].length },
    children: colTexts.map((texts, ci) => ({
      id: `${id}-c${ci}`,
      type: 'FRAME',
      name: `col-${ci}`,
      absoluteBoundingBox: {
        x: xs[ci],
        y: 0,
        width: widths[ci],
        height: ROW_H * texts.length,
      },
      children: texts.map((t, ri) => ({
        id: `${id}-c${ci}-r${ri}`,
        type: 'FRAME',
        absoluteBoundingBox: { x: xs[ci], y: ri * ROW_H, width: widths[ci], height: ROW_H },
        children: [textNode(`${id}-t${ci}-${ri}`, t, xs[ci] + 8, ri * ROW_H + 15, 60, 14)],
      })),
    })),
  }
}

const docOf = (...nodes: any[]) => ({ id: 'doc', type: 'DOCUMENT', children: nodes })

/** 横向布局容器（`layoutSource:'container-rebuild'` 才会被认作 layout 容器） */
const rowContainer = (a: any, b: any) => ({
  id: 'root',
  type: 'body',
  layout: 'horizontal',
  layoutSource: 'container-rebuild',
  children: [a, b],
})

const member = (id: string, sourceNodeIds: string[]) => ({ id, type: 'content', sourceNodeIds })

const makeInput = (sections: any[], figmaNodeData: any) => ({
  componentName: 'p1b-fixture',
  panelType: 'default-panel',
  subComponentPlan: { effectiveSections: sections, isForced: true },
  figmaNodeData,
})

const makeLogger = () => {
  const lines: Array<{ msg: string; meta: any }> = []
  return {
    lines,
    info: (msg: string, meta?: any) => lines.push({ msg, meta }),
    warn: (msg: string, meta?: any) => lines.push({ msg, meta }),
    debug: () => {},
    error: () => {},
  }
}

/** 取容器 `data-section-id="root"` 之后紧跟的两行子组件标签（模板行序 = children 序） */
const childTagLines = (tpl: string) => {
  const lines = tpl.split('\n').map((l) => l.trim())
  const at = lines.findIndex((l) => l.includes('data-section-id="root"'))
  expect(at).toBeGreaterThanOrEqual(0)
  return [lines[at + 1], lines[at + 2]]
}

// ────────────────────────── ① 事实源契约 ──────────────────────────

describe('P1-B ① 事实源：collectFoldedGridTakeover 显式暴露 suppressed', () => {
  it('表格两阶段决策 ⇒ 每组恰 1 个成员 suppressed=true，其余 false', () => {
    const tbl = makeTable('tbl', COL_TEXTS)
    const tk = collectFoldedGridTakeover({
      treeSections: [rowContainer(member('sec-a', ['tbl-c0']), member('sec-b', ['tbl-c1']))],
      figmaNodeData: docOf(tbl),
      resourceMapping: [],
      componentName: 'p1b-fixture',
    })

    expect(tk.tableHits).toBe(1)
    expect(tk.tableSuppressed).toBe(1)
    expect(tk.map.size).toBe(2)

    // 契约：每个值都必须有**布尔** `suppressed`（消费方据此剔除分母，不嗅探产物字符串）
    const flags = [...tk.map.values()].map((v: any) => v.suppressed)
    expect(flags.every((f: any) => typeof f === 'boolean')).toBe(true)
    expect(flags.filter(Boolean)).toHaveLength(1)

    // 键 = plan 段 id（与命名无关）；被抑制的必须是 memberIndex=1 的 sec-b
    const suppressedIds = [...tk.map.values()]
      .filter((v: any) => v.suppressed)
      .map((v: any) => v.sectionId)
    expect(suppressedIds).toEqual(['sec-b'])

    // 反向护栏：被抑制成员的产物里确实带 display:none（契约与产物一致，
    // 但**判据仍以布尔为准** —— 上一行断言的就是这个布尔）
    const supVue = [...tk.map.values()].find((v: any) => v.suppressed) as any
    expect(supVue.vue).toContain('display:none')
  })

  it('无抑制成员（单成员组）⇒ 全部 suppressed=false', () => {
    const tk = collectFoldedGridTakeover({
      treeSections: [
        rowContainer(
          member('sec-a', ['tblA-c0']),
          member('sec-b', ['tblB-c0']),
        ),
      ],
      figmaNodeData: docOf(
        makeTable('tblA', COL_TEXTS),
        makeTable('tblB', COL_TEXTS),
      ),
      resourceMapping: [],
      componentName: 'p1b-fixture',
    })
    expect(tk.map.size).toBe(2)
    expect([...tk.map.values()].every((v: any) => v.suppressed === false)).toBe(true)
  })
})

// ────────────────────────── ② 阳性：分母剔除 ──────────────────────────

describe('P1-B ② 阳性：抑制成员从 flex 分母剔除，幸存者归一化到 1.000', () => {
  const tpl = () => {
    const tbl = makeTable('tbl', COL_TEXTS)
    const logger = makeLogger()
    const facts = buildDeterministicIndexTemplate(
      makeInput(
        [rowContainer(member('sec-a', ['tbl-c0']), member('sec-b', ['tbl-c1']))],
        docOf(tbl),
      ) as any,
      { logger } as any,
    )
    return { facts, logger, tbl }
  }

  it('幸存者 flex:0.381 → 1.000；被抑制成员不再计入分母', () => {
    const { facts } = tpl()
    const [first, second] = childTagLines(facts!.template)

    // 幸存者（memberIndex=0，= sec-a / 179px）：分母只剩自己 ⇒ 179/179 = 1.000
    expect(first).toContain('flex:1.000;min-width:0;')
    // 被抑制成员（memberIndex=1）：既不贡献分母，自身也必须是零布局因子；
    // 不能让通用「当前项=0 ⇒ flex:1」兜底重新把它写回空间分配。
    expect(second).toContain('flex:0;min-width:0;')

    // 🔴 反向断言：修复前的 0.381 / 0.619 必须**彻底消失**
    expect(facts!.template).not.toContain('flex:0.381;')
    expect(facts!.template).not.toContain('flex:0.619;')
  })

  it('计数行留痕：takeoverLeaves=2 / excluded=1 / ids=[sec-b]', () => {
    const { logger } = tpl()
    const hit = logger.lines.find((l) => l.msg.includes('P1-B 抑制成员 flex 分母剔除'))
    expect(hit).toBeTruthy()
    expect(hit!.meta).toEqual({ takeoverLeaves: 2, excluded: 1, ids: ['sec-b'] })
  })

  it('对照：不传 figma 事实时同一棵树回到旧比例（证明差异确实来自剔除）', () => {
    const logger = makeLogger()
    const facts = buildDeterministicIndexTemplate(
      makeInput(
        [rowContainer(member('sec-a', ['tbl-c0']), member('sec-b', ['tbl-c1']))],
        null,
      ) as any,
      { logger } as any,
    )
    const [first, second] = childTagLines(facts!.template)
    // 无 Figma ⇒ 宽度全 0 ⇒ 两侧都回退 flex:1（旧行为）
    expect(first).toContain('flex:1;min-width:0;')
    expect(second).toContain('flex:1;min-width:0;')
    const hit = logger.lines.find((l) => l.msg.includes('P1-B 抑制成员 flex 分母剔除'))
    expect(hit!.meta).toEqual({ takeoverLeaves: 0, excluded: 0, ids: [] })
  })
})

// ────────────────────────── ③ 阴性：零误伤 ──────────────────────────

describe('P1-B ③ 阴性：无抑制时逐字等于既有比例公式（零回归）', () => {
  it('两成员锚定**不同**表 ⇒ 各自独占一组 ⇒ 无抑制 ⇒ 比例不变 0.381/0.619', () => {
    const logger = makeLogger()
    // 两张表列宽序列相反 ⇒ 各自锚点的真值宽 179 / 291（合计 470，即 0.381 / 0.619）
    const figma = docOf(
      makeTable('tblA', COL_TEXTS, [179, 291]),
      makeTable('tblB', COL_TEXTS, [291, 179]),
    )
    const facts = buildDeterministicIndexTemplate(
      makeInput(
        [rowContainer(member('sec-a', ['tblA-c0']), member('sec-b', ['tblB-c0']))],
        figma,
      ) as any,
      { logger } as any,
    )

    // 期望值由纯函数给出（不硬编码，避免与判据漂移）
    const idx = indexFigmaNodes(figma)
    const widths = [
      resolveSectionFlexSize(member('sec-a', ['tblA-c0']) as any, idx, 'width'),
      resolveSectionFlexSize(member('sec-b', ['tblB-c0']) as any, idx, 'width'),
    ]
    expect(widths).toEqual([179, 291])

    const [first, second] = childTagLines(facts!.template)
    expect(first).toContain(flexItemStyleFromWidths(widths, 0))
    expect(second).toContain(flexItemStyleFromWidths(widths, 1))
    expect(first).toContain('flex:0.381;')
    expect(second).toContain('flex:0.619;')

    const hit = logger.lines.find((l) => l.msg.includes('P1-B 抑制成员 flex 分母剔除'))
    expect(hit!.meta.excluded).toBe(0)
  })

  it('判据完全不命中（锚点是普通文本叶）⇒ excluded=0 且保留原比例', () => {
    const tbl = makeTable('tbl', COL_TEXTS)
    const figma = docOf(tbl)
    const logger = makeLogger()
    // 两个成员都锚到**同一列的同一个文本节点** ⇒ 不是表格列 ⇒ 不接管
    // （同 sourceNodeIds 会被 dedupe 合并，故用不同文本节点）
    const facts = buildDeterministicIndexTemplate(
      makeInput(
        [
          rowContainer(
            member('sec-a', ['tbl-t0-0']),
            member('sec-b', ['tbl-t0-1']),
          ),
        ],
        figma,
      ) as any,
      { logger } as any,
    )
    const hit = logger.lines.find((l) => l.msg.includes('P1-B 抑制成员 flex 分母剔除'))
    expect(hit).toBeTruthy()
    expect(hit!.meta.excluded).toBe(0)
    // 模板仍产出两行子组件（结构未受损）
    const [first, second] = childTagLines(facts!.template)
    expect(first).toMatch(/^<[A-Z]\w* style="flex:/)
    expect(second).toMatch(/^<[A-Z]\w* style="flex:/)
  })
})

// ────────────────────────── ④ fail-open ──────────────────────────

describe('P1-B ④ fail-open：判据不可用时绝不抛错、绝不改比例', () => {
  it('figmaNodeData=null ⇒ 不抛异常，模板照常产出', () => {
    const logger = makeLogger()
    expect(() =>
      buildDeterministicIndexTemplate(
        makeInput(
          [rowContainer(member('sec-a', ['tbl-c0']), member('sec-b', ['tbl-c1']))],
          null,
        ) as any,
        { logger } as any,
      ),
    ).not.toThrow()
  })

  it('figmaNodeData 为畸形结构（无 children）⇒ 不抛异常', () => {
    const logger = makeLogger()
    const facts = buildDeterministicIndexTemplate(
      makeInput(
        [rowContainer(member('sec-a', ['tbl-c0']), member('sec-b', ['tbl-c1']))],
        { document: { id: 'doc', type: 'DOCUMENT' } },
      ) as any,
      { logger } as any,
    )
    expect(facts).not.toBeNull()
    const hit = logger.lines.find((l) => l.msg.includes('P1-B 抑制成员 flex 分母剔除'))
    expect(hit!.meta.excluded).toBe(0)
  })
})
