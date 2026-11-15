/**
 * A2 治本单测（2026-11-15 · mc-max-1794706325675-693c8d17）
 *
 * 病灶：deriveHeaderSlotsFromFigma 的「纯文本」else 分支完全不看节点名，
 * 名为 "tabs" 但文本不含数字的 Tab 组被判成 label ⇒ 下游拿不到 tab 语义。
 * 修法：加窄判据（name 含 tab/switch/segmented 且 ≥2 个独立子项）→ 结构化 tab 契约；
 * 普通 label / 单文本 / 含数字分支逐字不变。
 */
import { jest } from '@jest/globals'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

import { HeaderSlotValidator } from './header-slot-validator.js'

const box = (x: number, y: number, w: number, h = 20) => ({
  x, y, width: w, height: h,
})

function makeHeader(tabChildren: any[], tabName = 'tabs') {
  return {
    id: '136:120', type: 'FRAME', name: 'header',
    absoluteBoundingBox: box(36, 932, 380, 28),
    children: [
      {
        id: '2:7954', type: 'FRAME', name: tabName,
        absoluteBoundingBox: box(199, 932, 204, 18),
        children: tabChildren,
      },
      {
        id: '2:7959', type: 'GROUP', name: '小标题',
        absoluteBoundingBox: box(36, 932, 380, 28),
        children: [
          { id: '2:7966', type: 'TEXT', name: '重点车辆监测', characters: '重点车辆监测', absoluteBoundingBox: box(36, 932, 96, 19) },
          { id: '2:7967', type: 'TEXT', name: '*数据实时更新', characters: '*数据实时更新', absoluteBoundingBox: box(322, 929, 91, 21) },
        ],
      },
    ],
  }
}

const tabFrame = (id: string, text: string, x: number) => ({
  id, type: 'FRAME', name: `Frame ${id}`,
  absoluteBoundingBox: box(x, 932, 100, 19),
  children: [{ id: `${id}-t`, type: 'TEXT', name: text, characters: text, absoluteBoundingBox: box(x, 932, 100, 19) }],
})

function derive(header: any) {
  const validator = new HeaderSlotValidator({ findHeaderContainer: () => header } as any)
  return validator.deriveHeaderSlotsFromFigma({ document: header }, null, [])
}

describe('A2 deriveHeaderSlotsFromFigma · 纯文本 Tab 组结构化', () => {
  test('真机形态：tabs FRAME 含两个 FRAME+TEXT ⇒ tab 契约，id 与视觉 body.children 对齐', () => {
    const header = makeHeader([
      tabFrame('2:7955', '江阴靖江长江隧道', 199),
      tabFrame('2:7957', '江阴大桥', 335),
    ])
    const slots = derive(header)
    const tab = slots.find((s: any) => s.figmaNodeId === '2:7954')
    expect(tab).toMatchObject({
      slotType: 'header-right',
      elementType: 'tab',
      content: '江阴靖江长江隧道 江阴大桥',
      figmaNodeId: '2:7954',
    })
    expect((tab as any).tabs).toEqual([
      { id: '2:7955', text: '江阴靖江长江隧道' },
      { id: '2:7957', text: '江阴大桥' },
    ])
  })

  test('普通 label 容器（2 个文本但名字不含 tab）⇒ 逐字保持 label，无 tabs 字段', () => {
    const header = makeHeader([
      tabFrame('2:8001', '设备总数', 199),
      tabFrame('2:8002', '在线率', 335),
    ], '辅助信息')
    const slots = derive(header)
    const label = slots.find((s: any) => s.figmaNodeId === '2:7954')
    expect(label?.elementType).toBe('label')
    expect(label).not.toHaveProperty('tabs')
  })

  test('单文本 Tab 容器 ⇒ 不误判为 tab（窄判据要求 ≥2 项）', () => {
    const header = makeHeader([tabFrame('2:7955', '江阴大桥', 199)], 'tabs')
    const slots = derive(header)
    const only = slots.find((s: any) => s.figmaNodeId === '2:7954')
    expect(only?.elementType).toBe('label')
    expect(only).not.toHaveProperty('tabs')
  })

  test('含数字文本仍走原含数字分支（原行为不变，不带 tabs 字段）', () => {
    const header = makeHeader([
      tabFrame('2:7955', '监测类型 12', 199),
      tabFrame('2:7957', '告警 34', 335),
    ])
    const slots = derive(header)
    const only = slots.find((s: any) => s.figmaNodeId === '2:7954')
    expect(only?.elementType).toBe('tab')
    expect(only).not.toHaveProperty('tabs')
  })

  test('设计师注释 (* 开头) 不进 tabs', () => {
    const header = makeHeader([
      tabFrame('2:7955', '*占位说明', 199),
      tabFrame('2:7957', '江阴大桥', 335),
    ])
    const slots = derive(header)
    const only = slots.find((s: any) => s.figmaNodeId === '2:7954')
    expect(only).not.toHaveProperty('tabs')
    expect(only?.elementType).toBe('label')
  })

  test('name 为 segmented / switch 同样识别', () => {
    for (const nm of ['segmented-control', 'switch-bar']) {
      const header = makeHeader([
        tabFrame('2:7955', '甲', 199),
        tabFrame('2:7957', '乙', 335),
      ], nm)
      const slots = derive(header)
      expect(slots.find((s: any) => s.figmaNodeId === '2:7954')?.elementType).toBe('tab')
    }
  })

  test('无 children 的 tab 命名容器 ⇒ 走原空文本分支，不抛', () => {
    const header = makeHeader([], 'tabs')
    expect(() => derive(header)).not.toThrow()
    const only = derive(header).find((s: any) => s.figmaNodeId === '2:7954')
    expect(only?.elementType).toBe('tab')
  })
})
