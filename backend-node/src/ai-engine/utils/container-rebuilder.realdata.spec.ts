/**
 * A′ 真值集成测试：用 device 真实 checkpoint 跑容器重建，钉死端到端行为。
 * 数据源：workspace/custom-components/c-device-monitor-hnhl49no-1003d7d3/.checkpoint/{figma,visual}.json
 * 若样本缺失则跳过（CI/其他环境无该样本时不失败）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { rebuildSlotConContainers, flattenContainerSections, collectContainerHints } from './container-rebuilder.js'

const CKPT = path.resolve(
  process.cwd(),
  'workspace/custom-components/c-device-monitor-hnhl49no-1003d7d3/.checkpoint',
)
const hasSample = fs.existsSync(path.join(CKPT, 'figma.json')) && fs.existsSync(path.join(CKPT, 'visual.json'))

describe('A′ container-rebuilder 真值集成（device checkpoint）', () => {
  const maybe = hasSample ? describe : describe.skip

  maybe('真实 checkpoint 用例', () => {
  it('slot-con(89:40) 被重建为嵌套 section，children=[89:38 switch, 89:37 @antd/tab]', () => {
    const figma = JSON.parse(fs.readFileSync(path.join(CKPT, 'figma.json'), 'utf8'))
    const visual = JSON.parse(fs.readFileSync(path.join(CKPT, 'visual.json'), 'utf8'))
    const layout = visual.layoutStructure.layout

    const out = rebuildSlotConContainers(layout, figma)
    const container = out.sections.find((s: any) => s.id === '89:40')
    expect(container).toBeDefined()
    expect(container.layoutSource).toBe('container-rebuild')
    expect(container.layout).toBe('vertical')
    // switch 在上(y475)、tab 在下(y538) → 顺序固定
    expect(container.children.map((c: any) => c.id)).toEqual(['89:38', '89:37'])
    // 二者不再是顶层平级
    expect(out.sections.find((s: any) => s.id === '89:38')).toBeUndefined()
    expect(out.sections.find((s: any) => s.id === '89:37')).toBeUndefined()
  })

  it('展平后 switch/tab 回到 effectiveSections 且带 parentContainerId=89:40', () => {
    const figma = JSON.parse(fs.readFileSync(path.join(CKPT, 'figma.json'), 'utf8'))
    const visual = JSON.parse(fs.readFileSync(path.join(CKPT, 'visual.json'), 'utf8'))
    const out = rebuildSlotConContainers(visual.layoutStructure.layout, figma)

    const hints = collectContainerHints(out.sections)
    expect(hints.some((h) => h.containerId === '89:40')).toBe(true)

    const flat = flattenContainerSections(out.sections)
    const sw = flat.find((s: any) => s.id === '89:38')
    const tab = flat.find((s: any) => s.id === '89:37')
    expect(sw?.parentContainerId).toBe('89:40')
    expect(tab?.parentContainerId).toBe('89:40')
    // switch 必须紧邻 tab 之前（同容器内 y 序）
    expect(flat.indexOf(sw)).toBe(flat.indexOf(tab) - 1)
  })

  it('横向容器 cons(2:8437) 不被重建（merger 行为保留）', () => {
    const figma = JSON.parse(fs.readFileSync(path.join(CKPT, 'figma.json'), 'utf8'))
    const visual = JSON.parse(fs.readFileSync(path.join(CKPT, 'visual.json'), 'utf8'))
    const out = rebuildSlotConContainers(visual.layoutStructure.layout, figma)
    const cons = out.sections.find((s: any) => s.id === '2:8437')
    // cons 仍作为 merger 的 inline-row section（横向），未被本模块改成 container-rebuild
    expect(cons).toBeDefined()
    expect(cons.layoutSource).not.toBe('container-rebuild')
    expect(cons.layout).toBe('horizontal')
  })
  })
})

