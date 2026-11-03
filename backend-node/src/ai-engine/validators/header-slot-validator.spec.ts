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

function makeHeader() {
  return {
    id: '136:120', type: 'FRAME', name: 'header',
    absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 40 },
    children: [
      {
        id: '2:7954', type: 'FRAME', name: 'tabs',
        absoluteBoundingBox: { x: 250, y: 8, width: 220, height: 24 },
        children: [
          {
            id: '2:7955', type: 'TEXT', characters: '江阴靖江长江隧道',
            absoluteBoundingBox: { x: 260, y: 10, width: 112, height: 20 },
          },
          {
            id: '2:7956', type: 'TEXT', characters: '江阴大桥',
            absoluteBoundingBox: { x: 400, y: 10, width: 64, height: 20 },
          },
        ],
      },
      {
        id: '2:7959', type: 'GROUP', name: '小标题',
        absoluteBoundingBox: { x: 20, y: 8, width: 130, height: 24 },
        children: [{
          id: '2:7966', type: 'TEXT', characters: '重点车辆监测',
          absoluteBoundingBox: { x: 20, y: 10, width: 114, height: 20 },
        }],
      },
    ],
  }
}

describe('HeaderSlotValidator 推导契约的 section 归属', () => {
  test('Tab 与标题段是兄弟时，唯一同容器候选补 sectionId，而不是误用外层容器 id', () => {
    const header = makeHeader()
    const connector = { findHeaderContainer: () => header }
    const validator = new HeaderSlotValidator(connector as any)
    const slots = validator.deriveHeaderSlotsFromFigma(
      { document: header },
      null,
      [{ slotType: 'header-right', sectionId: '2:7959', content: '标题栏与Tab切换' }],
    )
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({
      slotType: 'header-right',
      figmaNodeId: '2:7954',
      sectionId: '2:7959',
    })
    expect(slots[0].sectionId).not.toBe('136:120')
  })

  test('同容器存在多个不同宿主候选时不猜 sectionId', () => {
    const header = makeHeader()
    const connector = { findHeaderContainer: () => header }
    const validator = new HeaderSlotValidator(connector as any)
    const slots = validator.deriveHeaderSlotsFromFigma(
      { document: header },
      null,
      [
        { slotType: 'header-right', sectionId: '2:7959' },
        { slotType: 'header-right', sectionId: '2:7954' },
      ],
    )
    expect(slots).toHaveLength(1)
    expect(slots[0]).not.toHaveProperty('sectionId')
  })
})
