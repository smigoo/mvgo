/**
 * header-owner-truth.spec.ts
 *
 * 事故锚：mc-max-1794749284344-c5e0aadc（「有的不是插槽进入了头部，有的却留在内容区域」）
 *   真值：root `2:8417` 直系子 = bg 向量 + `GROUP 'header' 2:8419`（高 30.09 / 425 = 7.1%）
 *        + `slot-con 89:40`；vision 却把 2:8419 标成 `content-below-title` 且 `controls=[]`。
 *   本 spec 用同形树把「结构锚 + 无量纲几何」钉死，并给出阴性对照。
 */
import {
  resolveHeaderOwner,
  summarizeVisionAgreement,
  isInHeaderOwnerSubtree,
  HEADER_OWNER_MAX_HEIGHT_RATIO,
} from './header-owner-truth'

type Box = { x: number; y: number; width: number; height: number }

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height })

const text = (id: string, characters: string, b: Box, fontSize = 14) => ({
  id,
  type: 'TEXT',
  name: characters,
  characters,
  absoluteBoundingBox: b,
  style: { fontSize },
})

const frame = (id: string, name: string, b: Box, children: any[] = [], type = 'FRAME') => ({
  id,
  type,
  name,
  absoluteBoundingBox: b,
  children,
})

/** c5e0aadc 同形树：root 420×425，header 组高 30.09，含 3 组「标签+数值」+ 装饰圆点。 */
function buildDeviceMonitorTree(overrides: { headerHeight?: number; headerY?: number } = {}) {
  const h = overrides.headerHeight ?? 30.09
  const hy = overrides.headerY ?? 441
  const stat = (id: string, label: string, value: string, x: number) =>
    frame(id, label, box(x, 441, 80, 23), [
      text(`${id}-l`, label, box(x, 441, 60, 20), 14),
      text(`${id}-v`, value, box(x + 60, 441, 20, 23), 18),
    ])
  return frame('2:8417', 'cp-设备监测', box(1475, 433, 420, 425), [
    frame('2:8418', 'bg', box(1475, 433, 420, 425), [], 'VECTOR'),
    frame(
      '2:8419',
      'header',
      box(1495, hy, 388, h),
      [
        text('2:8426', '设备监测', box(1495, 443, 64, 19), 19),
        text('2:8427', '*数据实时更新', box(1782, 440, 91, 21), 12),
        stat('2:8428', '设备类型', '28', 1595),
        stat('2:8431', '设备总数', '68562', 1681),
        stat('2:8434', '完好率', '98%', 1802),
        // 装饰圆点：y=463 挂在文本基线下方 —— 就是它把刀 56 的 y 带聚类带成 2 带
        frame('2:8421', 'g', box(1496, 463.09, 8, 8)),
      ],
      'GROUP',
    ),
    frame('89:40', 'slot-con', box(1475, 475, 407.4, 380), [
      frame('89:38', 'switch', box(1486, 475, 396.4, 64.8), [
        text('2:8787-t', '隧道设备', box(1500, 480, 60, 20), 14),
      ]),
      frame('89:37', 'cons', box(1475, 538, 413, 316), [
        text('2:8437-t', '摄像机', box(1521, 548, 50, 18), 14),
      ]),
    ]),
  ])
}

describe('resolveHeaderOwner — 阳性：结构锚命中真实 header 组', () => {
  it('c5e0aadc 同形树 ⇒ owner=2:8419，title-anchor，h/rootH≈0.0708', () => {
    const owner: any = resolveHeaderOwner(buildDeviceMonitorTree())
    expect(owner).toBeTruthy()
    expect(owner.ownerId).toBe('2:8419')
    expect(owner.ownerType).toBe('GROUP')
    expect(owner.source).toBe('title-anchor')
    expect(owner.titleNodeId).toBe('2:8426')
    expect(owner.titleText).toBe('设备监测')
    expect(owner.ambiguous).toBe(false)
    expect(owner.metrics.heightRatio).toBeCloseTo(0.0708, 3)
    expect(owner.metrics.topDeltaRatio).toBeCloseTo(0.0188, 3)
    expect(owner.memberIds).toContain('2:8428')
    expect(owner.subtreeIds).toContain('2:8431-v')
  })

  it('支持 { document } 与 { nodes:{k:{document}} } 两种入参形态（三形态结论一致）', () => {
    const raw = buildDeviceMonitorTree()
    const a: any = resolveHeaderOwner({ document: raw })
    const b: any = resolveHeaderOwner({ nodes: { '2:8417': { document: raw } } })
    expect(a.ownerId).toBe('2:8419')
    expect(b.ownerId).toBe('2:8419')
  })

  it('图层名与结论无关：把 header 改名为「随便什么」仍然命中（判据不靠名字）', () => {
    const raw = buildDeviceMonitorTree()
    raw.children[1].name = '顶部工具栏随便叫什么'
    const owner: any = resolveHeaderOwner(raw)
    expect(owner.ownerId).toBe('2:8419')
  })
})

describe('resolveHeaderOwner — 阴性：不得把内容段当头部', () => {
  it('顶部段高 40% root（>25%）⇒ 不认，回退后仍不认 ⇒ null', () => {
    const raw = buildDeviceMonitorTree({ headerHeight: 170 })
    const owner = resolveHeaderOwner(raw)
    expect(owner).toBeNull()
  })

  it('顶部薄条但不贴顶（topDelta 5%）⇒ 不认', () => {
    const raw = buildDeviceMonitorTree({ headerY: 433 + 425 * 0.05 })
    const owner = resolveHeaderOwner(raw)
    // 标题带内仍有标题 ⇒ owner 几何校验失败 ⇒ 回退到直系子节点，同样因 not-top 失败
    expect(owner).toBeNull()
  })

  it('无 bbox 的树 ⇒ null（fail-open）', () => {
    const owner = resolveHeaderOwner({ id: 'x', type: 'FRAME', children: [] })
    expect(owner).toBeNull()
  })

  it('空入参 / undefined ⇒ null，不抛错', () => {
    expect(resolveHeaderOwner(null)).toBeNull()
    expect(resolveHeaderOwner(undefined as any)).toBeNull()
    expect(resolveHeaderOwner({})).toBeNull()
  })

  it('标题直挂 root 下且无容器 ⇒ 回退不把 root 自身当头部', () => {
    const raw = frame('r', 'panel', box(0, 0, 400, 400), [
      text('t1', '设备监测', box(10, 5, 60, 18), 19),
      frame('c1', '内容', box(0, 60, 400, 320)),
    ])
    const owner = resolveHeaderOwner(raw)
    expect(owner).toBeNull()
  })
})

describe('resolveHeaderOwner — 回退与歧义', () => {
  it('无标题锚（顶部带内无 TEXT）时按 top-band 命中', () => {
    const raw = frame('r', 'panel', box(0, 0, 400, 400), [
      frame('h1', 'xxx', box(0, 0, 400, 30), [
        // 文本 y 全部落在 20% 带外（80 以下），顶部带内无标题 → 标题锚为空
        frame('d', 'deco', box(4, 100, 8, 8)),
      ]),
      frame('c1', '内容', box(0, 60, 400, 320)),
    ])
    // h1 内无文本 ⇒ 连回退也不认（含 TEXT 是硬条件）
    expect(resolveHeaderOwner(raw)).toBeNull()
    const raw2 = frame('r', 'panel', box(0, 0, 400, 400), [
      frame('h1', 'xxx', box(0, 0, 400, 30), [text('t9', '某一行字', box(10, 100, 50, 18), 12)]),
      frame('c1', '内容', box(0, 60, 400, 320)),
    ])
    const owner: any = resolveHeaderOwner(raw2)
    expect(owner.ownerId).toBe('h1')
    expect(owner.source).toBe('top-band')
  })

  it('两个等高顶部薄条且互不含标题 ⇒ ambiguous=true 且 ownerId=null', () => {
    const raw = frame('r', 'panel', box(0, 0, 400, 400), [
      frame('h1', 'a', box(0, 0, 400, 30), [text('t1', '甲', box(10, 100, 20, 18), 12)]),
      frame('h2', 'b', box(0, 0, 400, 30), [text('t2', '乙', box(200, 100, 20, 18), 12)]),
      frame('c1', '内容', box(0, 60, 400, 320)),
    ])
    const owner: any = resolveHeaderOwner(raw)
    expect(owner).toBeTruthy()
    expect(owner.ambiguous).toBe(true)
    expect(owner.ownerId).toBeNull()
    expect(owner.candidateCount).toBe(2)
  })

  it('阈值常量对外可见且与判据同源（防止各处再写一份 0.25）', () => {
    expect(HEADER_OWNER_MAX_HEIGHT_RATIO).toBe(0.25)
  })
})

describe('summarizeVisionAgreement — 只记账不改判', () => {
  const owner: any = resolveHeaderOwner(buildDeviceMonitorTree())

  it('c5e0aadc 实锤：vision=content-below-title & controls=0 ⇒ disagree', () => {
    const r = summarizeVisionAgreement(owner, [
      { id: '2:8419', name: '头部统计区', headerRelation: 'content-below-title', header: { controls: [] } },
    ])
    expect(r.verdict).toBe('disagree')
    expect(r.relation).toBe('content-below-title')
    expect(r.controls).toBe(0)
  })

  it('vision=title-itself 或 title-same-row ⇒ agree', () => {
    expect(
      summarizeVisionAgreement(owner, [{ id: '2:8419', headerRelation: 'title-itself' }]).verdict,
    ).toBe('agree')
    expect(
      summarizeVisionAgreement(owner, [{ id: '2:8419', headerRelation: 'title-same-row' }]).verdict,
    ).toBe('agree')
  })

  it('controls>0 也算 agree（即便 relation 是 (none)）', () => {
    const r = summarizeVisionAgreement(owner, [
      { id: '2:8419', headerRelation: '', header: { controls: [{ type: 'statistic' }] } },
    ])
    expect(r.verdict).toBe('agree')
  })

  it('vision 没把 owner 切成 section ⇒ absent；owner 为空 ⇒ no-owner', () => {
    expect(summarizeVisionAgreement(owner, [{ id: '89:38' }]).verdict).toBe('absent')
    expect(summarizeVisionAgreement(null, [{ id: '2:8419' }]).verdict).toBe('no-owner')
  })
})

describe('isInHeaderOwnerSubtree — T09 去重门禁用', () => {
  const owner: any = resolveHeaderOwner(buildDeviceMonitorTree())

  it('owner 自身与子孙命中，内容段不命中', () => {
    expect(isInHeaderOwnerSubtree(owner, '2:8419')).toBe(true)
    expect(isInHeaderOwnerSubtree(owner, '2:8431-v')).toBe(true)
    expect(isInHeaderOwnerSubtree(owner, '2:8437-t')).toBe(false)
  })

  it('owner 为空 / nodeId 为空 ⇒ false（fail-open）', () => {
    expect(isInHeaderOwnerSubtree(null, '2:8419')).toBe(false)
    expect(isInHeaderOwnerSubtree(owner, '')).toBe(false)
  })
})
