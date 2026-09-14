/**
 * 🛡️ 删减法批次 2 loop 2c（2026-09-14 · 485d724d §13 实锤）：同图共享变量编号。
 *
 * 根因：device-grid 12 卡共享同一张 bg-8439.png，视觉序编号却给 12 个条目各发
 *   bg3~bg14 十二个别名 → prompt 列 12 个变量诱导 LLM 多别名引用/别名转发
 *  （`const bg6 = bg3` 刀 7b 事故）→ dedupeSameImageAliases 事后合并（纠偏器存在理由）。
 *
 * 治本：编号阶段同 resourceFile 共享 assignedVarName（首条视觉序为唯一事实），
 *   非首条目标记 isSharedAlias（prompt/validator 侧折叠），编号不被别名消耗。
 */
import { assignVisualOrderVarNames } from './visual-order-assign.js'

const entry = (over: any) => ({
  m: {
    resourceFile: 'bg-a.png',
    figmaBox: { x: 0, y: 0, width: 100, height: 50 },
    figmaNodeId: '1:1',
    downloadStatus: 'success',
    ...over,
  },
  role: 'bg',
})

describe('assignVisualOrderVarNames 同图共享编号（2c）', () => {
  it('回归：不同 resourceFile → 视觉序独立编号（y 行间 + x 行内升序）', () => {
    const list = [
      entry({ resourceFile: 'bg-right.png', figmaBox: { x: 200, y: 0 }, figmaNodeId: '1:2' }),
      entry({ resourceFile: 'bg-left.png', figmaBox: { x: 10, y: 0 }, figmaNodeId: '1:1' }),
      entry({ resourceFile: 'bg-bottom.png', figmaBox: { x: 0, y: 100 }, figmaNodeId: '1:3' }),
    ]
    assignVisualOrderVarNames(list)
    const byNode = new Map(list.map((e) => [e.m.figmaNodeId, e.m.assignedVarName]))
    expect(byNode.get('1:1')).toBe('bg1') // 最左
    expect(byNode.get('1:2')).toBe('bg2')
    expect(byNode.get('1:3')).toBe('bg3')
    expect(list.every((e) => !e.m.isSharedAlias)).toBe(true)
  })

  it('同 resourceFile 12 卡形态 → 全部共享首个编号，别名不消耗新号', () => {
    const list = [
      entry({ resourceFile: 'bg-head.png', figmaBox: { x: 0, y: 0 }, figmaNodeId: '2:1' }),
      // 12 卡共享 bg-8439.png（取 3 卡代表），y 相同、x 升序
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 37, y: 100 }, figmaNodeId: '2:11' }),
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 166, y: 100 }, figmaNodeId: '2:12' }),
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 274, y: 100 }, figmaNodeId: '2:13' }),
      entry({ resourceFile: 'bg-tail.png', figmaBox: { x: 0, y: 300 }, figmaNodeId: '2:2' }),
    ]
    assignVisualOrderVarNames(list)
    const byNode = new Map(list.map((e) => [e.m.figmaNodeId, e.m]))
    expect(byNode.get('2:1').assignedVarName).toBe('bg1')
    // 三卡共享 bg2（视觉序首个卡位），不消耗 bg3/bg4
    expect(byNode.get('2:11').assignedVarName).toBe('bg2')
    expect(byNode.get('2:12').assignedVarName).toBe('bg2')
    expect(byNode.get('2:13').assignedVarName).toBe('bg2')
    // 尾资源拿 bg3（编号只被不同文件消耗）
    expect(byNode.get('2:2').assignedVarName).toBe('bg3')
  })

  it('非首条目标记 isSharedAlias，首条目聚合 sharedBy 全节点', () => {
    const list = [
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 37, y: 100 }, figmaNodeId: '2:11' }),
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 166, y: 100 }, figmaNodeId: '2:12' }),
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 274, y: 100 }, figmaNodeId: '2:13' }),
    ]
    assignVisualOrderVarNames(list)
    const sorted = [...list].sort((a, b) => a.m.figmaBox.x - b.m.figmaBox.x)
    const first = sorted[0].m
    expect(first.isSharedAlias).toBeFalsy()
    expect(first.sharedBy).toEqual(['2:11', '2:12', '2:13'])
    expect(sorted[1].m.isSharedAlias).toBe(true)
    expect(sorted[2].m.isSharedAlias).toBe(true)
  })

  it('role 独立：icon 同图共享不影响 bg 编号空间', () => {
    const list = [
      entry({ resourceFile: 'bg-a.png', figmaBox: { x: 0, y: 0 }, figmaNodeId: '3:1' }),
      { m: { resourceFile: 'icon-x.png', figmaBox: { x: 0, y: 0 }, figmaNodeId: '3:2', downloadStatus: 'success' }, role: 'icon' },
      { m: { resourceFile: 'icon-x.png', figmaBox: { x: 50, y: 0 }, figmaNodeId: '3:3', downloadStatus: 'success' }, role: 'icon' },
    ]
    assignVisualOrderVarNames(list)
    const byNode = new Map(list.map((e) => [e.m.figmaNodeId, e.m]))
    expect(byNode.get('3:1').assignedVarName).toBe('bg1')
    expect(byNode.get('3:2').assignedVarName).toBe('icon1')
    expect(byNode.get('3:3').assignedVarName).toBe('icon1')
    expect(byNode.get('3:3').isSharedAlias).toBe(true)
  })

  it('幂等：重复调用结果一致（别名不重复消费编号）', () => {
    const list = [
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 37, y: 100 }, figmaNodeId: '2:11' }),
      entry({ resourceFile: 'bg-8439.png', figmaBox: { x: 166, y: 100 }, figmaNodeId: '2:12' }),
      entry({ resourceFile: 'bg-tail.png', figmaBox: { x: 0, y: 300 }, figmaNodeId: '2:2' }),
    ]
    assignVisualOrderVarNames(list)
    const once = list.map((e) => [e.m.figmaNodeId, e.m.assignedVarName])
    assignVisualOrderVarNames(list)
    const twice = list.map((e) => [e.m.figmaNodeId, e.m.assignedVarName])
    expect(twice).toEqual(once)
  })
})
