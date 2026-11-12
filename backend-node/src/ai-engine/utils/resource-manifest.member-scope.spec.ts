/**
 * scopedResourceDomMapping · 合并段成员节点归属（2026-11-12 治本）
 *
 * 真机实锤：mc-max-1794459793796-e5de62fd
 *   统计卡段 `38:3134` 由两张卡 `38:3260` / `38:3282` 合并而成（见 `sourceNodeIds`），
 *   两卡各自的图标 `icon2` / `icon3` 的 `ownerSectionId` 记的是**成员卡** id。
 *   旧实现只按 `matchedSection.id` 分桶 ⇒ 该段资源清单 0 条 ⇒ LLM 只能臆造变量名
 *   （`icon战略厂商`）且无 import 可用 ⇒ E2-v3「落盘未消费」硬拒。
 *
 * 同时锁住两个不得回退的行为：
 *   ① 段独占全部资源时必须返回全部（旧「过滤后未减少 ⇒ []」是该 bug 的直接成因）；
 *   ② 物理祖先（`ancestorIds`）不得让上层容器段吞掉子段资源（否则跨段错绑复活）。
 */

import { scopedResourceDomMapping } from './resource-manifest.js'

type Res = Record<string, any>

const rdm: Res[] = [
  // 统计卡段自身（段 id 精确命中）
  { figmaNodeId: '38:3135', ownerSectionId: '38:3134', ancestorIds: ['38:3134'], assignedVarName: null },
  { figmaNodeId: '38:3136', ownerSectionId: '38:3134', ancestorIds: ['38:3134'], resourceFile: '../resources/images/header-3136.png', assignedVarName: 'icon1' },
  // 统计卡段的两张成员卡（sourceNodeIds 命中）
  { figmaNodeId: '187:262', ownerSectionId: '38:3260', ancestorIds: ['38:3260', '796:3', '38:3134'], resourceFile: '../resources/images/icon-262.png', assignedVarName: 'icon2' },
  { figmaNodeId: '187:263', ownerSectionId: '38:3282', ancestorIds: ['38:3282', '796:3', '38:3134'], resourceFile: '../resources/images/icon-263.png', assignedVarName: 'icon3' },
  // 三组网格各自的图标：owner 是**另一个段**，但物理祖先同样是 38:3134
  { figmaNodeId: '38:3160', ownerSectionId: '38:3137', ancestorIds: ['38:3137', '796:3', '38:3134'], resourceFile: '../resources/images/icon-4.png', assignedVarName: 'icon4' },
  { figmaNodeId: '38:3164', ownerSectionId: '38:3162', ancestorIds: ['38:3162', '796:3', '38:3134'], resourceFile: '../resources/images/icon-5.png', assignedVarName: 'icon5' },
  { figmaNodeId: '38:3208', ownerSectionId: '38:3206', ancestorIds: ['38:3206', '796:3', '38:3134'], resourceFile: '../resources/images/icon-6.png', assignedVarName: 'icon6' },
]

const statsSection = {
  id: '38:3134',
  title: '统计卡片区',
  sourceNodeIds: ['38:3134', '38:3260', '38:3282'],
}

const varsOf = (list: Res[] | undefined) => (list || []).map((m) => m.assignedVarName)

describe('scopedResourceDomMapping · 合并段成员归属', () => {
  test('阳性：成员卡（sourceNodeIds）的图标进入本段清单', () => {
    const r = scopedResourceDomMapping(rdm as any, statsSection as any)
    expect(r).toBeDefined()
    expect(varsOf(r as any)).toContain('icon2')
    expect(varsOf(r as any)).toContain('icon3')
    expect(varsOf(r as any)).toContain('icon1')
  })

  test('阴性（错绑防护）：物理祖先命中的他段资源不得进入本段', () => {
    // icon4/5/6 的 ancestorIds 都含 38:3134，但 owner 是另外三个段
    const vars = varsOf(scopedResourceDomMapping(rdm as any, statsSection as any) as any)
    expect(vars).not.toContain('icon4')
    expect(vars).not.toContain('icon5')
    expect(vars).not.toContain('icon6')
  })

  test('段独占全部资源：返回全部，而不是空数组', () => {
    // 单段组件：所有资源 owner 都是本段（或成员节点）
    const single = rdm.filter((m) => m.resourceFile)
    const sec = {
      id: '38:3134',
      title: '统计卡片区',
      sourceNodeIds: ['38:3134', '38:3260', '38:3282', '38:3137', '38:3162', '38:3206'],
    }
    const r = scopedResourceDomMapping(single as any, sec as any)
    expect(r).toBeDefined()
    expect((r as any).length).toBe(single.length)
  })

  test('阴性：未命中任何归属仍 fail-closed 返回空数组', () => {
    const r = scopedResourceDomMapping(rdm as any, { id: 'no-such', title: '不存在' } as any)
    expect(r).toEqual([])
  })

  test('无 matchedSection / 空映射保持 undefined（fail-open 不改 prompt）', () => {
    expect(scopedResourceDomMapping(rdm as any, null as any)).toBeUndefined()
    expect(scopedResourceDomMapping([] as any, statsSection as any)).toBeUndefined()
  })

  test('他段视角：三组网格各自只拿自己的图标', () => {
    for (const [id, expectVar, others] of [
      ['38:3137', 'icon4', ['icon5', 'icon6', 'icon2']],
      ['38:3162', 'icon5', ['icon4', 'icon6', 'icon3']],
      ['38:3206', 'icon6', ['icon4', 'icon5', 'icon2']],
    ] as const) {
      const vars = varsOf(scopedResourceDomMapping(rdm as any, { id, title: id } as any) as any)
      expect(vars).toContain(expectVar)
      for (const o of others) expect(vars).not.toContain(o)
    }
  })
})
