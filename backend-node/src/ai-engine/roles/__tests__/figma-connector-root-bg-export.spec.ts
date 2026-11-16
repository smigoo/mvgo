/**
 * 🛡️ 消歧一回归锚（2026-11-16 · 三样本实锤：53:34075 / 4572:6988 / device-detail bg 组）：
 *   根直接子 bg 节点（如 `cp-xxx/bg-cp-traffic-trend`，figmaPath 恒 2 段）旧实现被
 *   `extractResourceNodes` 整节点跳过收集 ⇒ 永不下载 ⇒ `resourceFile` 恒空 ⇒
 *   N4 面板背景注入（anchorRootContainerInFiles 要求 `skipMount && resourceFile`）
 *   断粮 ⇒ 产物白底（真值深色底板渲染行亮度 35 vs 产物 244）。
 *
 * 修复口径：**收集不跳过**（正常进入下载与映射）；「透明底不挂载」继续由挂载侧
 * 段数规则保证（figmaPath 2 段 ⇒ skipMount=true，`_buildResourceDomMapping`）——
 * 两个职责分离，导出侧不再越权。
 *
 * 断言行为级（不 mock 网络下载，只断「收集清单包含根直接子 bg」这一结构事实）。
 */
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: '/tmp',
  projectRoot: '/tmp',
  workspaceRoot: '/tmp',
  dataDir: '/tmp',
  logsDir: '/tmp',
}))
import { FigmaConnector } from '../figma-connector.js'

/** 构造最小 figma 树：根 FRAME + 直接子 bg GROUP + 业务 GROUP */
function rootDirectBgTree() {
  return {
    id: '0:0',
    name: 'cp-交通态势',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 358 },
    children: [
      {
        id: '4571:6920',
        name: 'bg-cp-traffic-trend',
        type: 'GROUP',
        absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 358 },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.1, g: 0.15, b: 0.2 } }],
        children: [
          {
            id: '4571:6921',
            name: 'Vector',
            type: 'VECTOR',
            absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 358 },
            fills: [{ type: 'GRADIENT_LINEAR', visible: true }],
          },
        ],
      },
      {
        id: '4571:6923',
        name: 'slot-con',
        type: 'GROUP',
        absoluteBoundingBox: { x: 12, y: 40, width: 391, height: 287 },
        children: [],
      },
    ],
  }
}

describe('消歧一 · 根直接子 bg 纳入导出（N4 面板背景供料）', () => {
  it('⭐ 阳性：根直接子 bg（bg-* 命名）必须进入收集清单（旧实现整节点跳过 ⇒ N4 断粮白底）', () => {
    const c = new FigmaConnector({ figmaToken: 'x' })
    const collected = c.extractResourceNodes(rootDirectBgTree())
    const ids = collected.map((n: any) => String(n.id))
    expect(ids).toContain('4571:6920') // 根直接子 bg 本体
  })

  it('⭐ 阳性：bg 本体收集后不下钻其子节点（0669e091 契约：父图已含子图视觉，禁双重渲染）', () => {
    const c = new FigmaConnector({ figmaToken: 'x' })
    const collected = c.extractResourceNodes(rootDirectBgTree())
    const ids = collected.map((n: any) => String(n.id))
    // bg 本体进清单且不重复
    expect(ids.filter((i: string) => i === '4571:6920').length).toBe(1)
    // bg 的内部 VECTOR 碎片不下钻（整体导出契约）
    expect(ids).not.toContain('4571:6921')
    // 空 slot-con 组不是资源、不进清单（正确行为）
    expect(ids).not.toContain('4571:6923')
  })

  it('🔴 反向：根节点自身名为 bg（罕见形态）仍跳过（本修复不动该分支）', () => {
    const c = new FigmaConnector({ figmaToken: 'x' })
    const tree = rootDirectBgTree()
    tree.name = 'bg' // 根节点本身是 bg
    const collected = c.extractResourceNodes(tree)
    const ids = collected.map((n: any) => String(n.id))
    expect(ids).not.toContain('0:0')
  })

  it('🔴 反向：非根层的 bg（嵌套）行为不变（原本就收集）', () => {
    const c = new FigmaConnector({ figmaToken: 'x' })
    const tree = rootDirectBgTree()
    // 把 bg 挪到 slot-con 下（3 段路径）
    const bg = tree.children![0]
    tree.children = [tree.children![1]]
    tree.children[0].children = [bg]
    const collected = c.extractResourceNodes(tree)
    const ids = collected.map((n: any) => String(n.id))
    expect(ids).toContain('4571:6920')
  })
})
