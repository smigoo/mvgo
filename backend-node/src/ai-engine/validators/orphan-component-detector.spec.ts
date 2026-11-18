import { mkdtemp, mkdir, rm, writeFile, access, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// validator → logger/index → logger/logger → backend-root（用了 import.meta，jest 无法直接加载）
jest.mock(
  '../../config/backend-root.js',
  () => ({
    workspaceRoot: process.cwd(),
    logsDir: process.cwd() + '/logs',
  }),
  { virtual: true },
)

import { OrphanComponentDetector } from './orphan-component-detector.js'

/**
 * 回归背景：
 * 真实子组件写在 package/components/** 下，而旧实现只 readdirSync(package/) 顶层，
 * 导致 childComponents 恒为空 → orphansFound 恒为 0（检测器静默失效，
 * 生成产物里的死代码子组件（如 ContentCons.vue）不被清理）。
 * 同时引用判定只看 index.vue，会把「被兄弟子组件引用」的文件误删。
 */
describe('OrphanComponentDetector.detect', () => {
  let root: string

  const exists = async (p: string) => {
    try {
      await access(p)
      return true
    } catch {
      return false
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-orphan-'))
    await mkdir(join(root, 'package', 'components'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('检测并删除 package/components 下无人引用的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n`,
      'utf-8',
    )
    const orphan = join(root, 'package', 'components', 'ContentCons.vue')
    await writeFile(orphan, `<template><div class="cons" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.orphans).toContain(orphan)
    expect(result.deleted).toContain(orphan)
    expect(await exists(orphan)).toBe(false)
  })

  it('保留被 index.vue 以 ./components 路径 import 的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><ContentActive /></template>\n<script setup>\nimport ContentActive from './components/ContentActive.vue'\n</script>\n`,
      'utf-8',
    )
    const child = join(root, 'package', 'components', 'ContentActive.vue')
    await writeFile(child, `<template><div class="a" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.kept).toContain(child)
    expect(result.deleted).toHaveLength(0)
    expect(await exists(child)).toBe(true)
  })

  it('保留仅被兄弟子组件引用（index.vue 未直接引用）的子组件', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><Wrapper /></template>\n<script setup>\nimport Wrapper from './components/Wrapper.vue'\n</script>\n`,
      'utf-8',
    )
    const wrapper = join(root, 'package', 'components', 'Wrapper.vue')
    await writeFile(
      wrapper,
      `<template><Inner /></template>\n<script setup>\nimport Inner from './Inner.vue'\n</script>\n`,
      'utf-8',
    )
    const inner = join(root, 'package', 'components', 'Inner.vue')
    await writeFile(inner, `<template><div class="i" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.kept).toContain(inner)
    expect(result.deleted).toHaveLength(0)
    expect(await exists(inner)).toBe(true)
  })

  it('无 package/index.vue 时安全返回，不误删任何文件', async () => {
    const stray = join(root, 'package', 'components', 'Stray.vue')
    await writeFile(stray, `<template><div class="s" /></template>\n`, 'utf-8')

    const result = await OrphanComponentDetector.detect(root)

    expect(result.deleted).toHaveLength(0)
    expect(await exists(stray)).toBe(true)
  })

  // ===== S1 图表宿主保护红测（P0：ChartBlock 被孤儿检测误删）=====
  // 判据：①源码含 echarts.init 且 ②series type 归一化后 ∈ vision.charts 归一化类型集
  // 背景：本次事故 vision type='area' / 产物 series type='line' ⇒ 必须走 normalizeChartType 同源
  const CHART_SRC_LINE = `<template><div ref="chartRef" /></template>\n<script setup>\nimport * as echarts from 'echarts'\nconst chart = echarts.init(chartRef.value)\nconst option = { xAxis: { type: 'category' }, series: [{ type: 'line' }] }\n</script>\n`
  const CHART_SRC_PIE = CHART_SRC_LINE.replace("type: 'line'", "type: 'pie'")
  const NO_ECHARTS_SRC = `<template><div class="x" /></template>\n<script setup>\nconst series = [{ type: 'line' }]\n</script>\n` // 只有 type 文本、无 echarts.init ⇒ 假图表

  const indexVue = `<template><div class="root" /></template>\n`

  /** 写入一个 index + 指定子组件，返回子组件绝对路径 */
  const setupChild = async (name: string, content: string) => {
    await writeFile(join(root, 'package', 'index.vue'), indexVue, 'utf-8')
    const child = join(root, 'package', 'components', name)
    await writeFile(child, content, 'utf-8')
    return child
  }

  it('【S1-阳性】vision 声明 area / 产物 series line，命中归一化 ⇒ 孤儿 retained 且记 protectedOrphans', async () => {
    const child = await setupChild('ChartBlock.vue', CHART_SRC_LINE)
    const result: any = await (OrphanComponentDetector.detect as any)(root, {
      visionCharts: [{ section: '2:7898', type: 'area' }],
    })
    expect(result.protectedOrphans).toContain(child)
    expect(result.orphans).not.toContain(child)
    expect(result.deleted).not.toContain(child)
    expect(await exists(child)).toBe(true)
  })

  it('【S1-阴性·类型不符】产物是 pie 而 vision 只声明 area(line) ⇒ 仍照删', async () => {
    const child = await setupChild('PieBlock.vue', CHART_SRC_PIE)
    const result: any = await (OrphanComponentDetector.detect as any)(root, {
      visionCharts: [{ section: '2:7898', type: 'area' }],
    })
    expect(result.orphans).toContain(child)
    expect(result.deleted).toContain(child)
    expect(result.protectedOrphans || []).not.toContain(child)
    expect(await exists(child)).toBe(false)
  })

  it('【S1-阴性·无 echarts】只有 series type 文本、无 echarts.init 的假图表 ⇒ 仍照删', async () => {
    const child = await setupChild('FakeChart.vue', NO_ECHARTS_SRC)
    const result: any = await (OrphanComponentDetector.detect as any)(root, {
      visionCharts: [{ section: '2:7898', type: 'area' }],
    })
    expect(result.deleted).toContain(child)
    expect(await exists(child)).toBe(false)
  })

  it('【S1-阴性·真孤儿】无图表的普通孤儿（TitleHeader/TabBar 形态）⇒ 仍照删，保护不过度', async () => {
    const child = await setupChild('TitleHeader.vue', `<template><h1>t</h1></template>\n`)
    const result: any = await (OrphanComponentDetector.detect as any)(root, {
      visionCharts: [{ section: '2:7898', type: 'area' }],
    })
    expect(result.deleted).toContain(child)
    expect(await exists(child)).toBe(false)
  })

  it('【S1-fail-open】visionCharts 为空 / 未传 ⇒ 含 echarts 的孤儿也照删（行为与改动前逐字相同）', async () => {
    const child = await setupChild('ChartBlock.vue', CHART_SRC_LINE)
    const r1: any = await (OrphanComponentDetector.detect as any)(root, { visionCharts: [] })
    expect(r1.deleted).toContain(child)
    const child2 = await setupChild('ChartBlock.vue', CHART_SRC_LINE)
    const r2: any = await OrphanComponentDetector.detect(root) // 单参调用兼容
    expect(r2.deleted).toContain(child2)
    expect(r2.protectedOrphans).toEqual([]) // 新字段恒在，0 也打
  })

  it('【S1-双图同步】mc/vue3 两处调用点必须都传第二参（visionCharts），漏一处即 FAIL', async () => {
    const files = [
      join(__dirname, '..', '..', 'ai-engine', 'graphs', 'mc-component-graph-phase2.js'),
      join(__dirname, '..', '..', 'ai-engine', 'graphs', 'mc-component-graph-vue3.js'),
    ]
    for (const f of files) {
      const src = await readFile(f, 'utf-8')
      expect(src).toMatch(/OrphanComponentDetector\.detect\([\s\S]{0,400}?visionCharts/)
    }
  })

  it('【S1-日志命名】protectedOrphans 与视觉段 orphanCharts 文案不得混用', async () => {
    const src = await readFile(join(__dirname, 'orphan-component-detector.js'), 'utf-8')
    expect(src).toMatch(/protectedOrphans/)
    expect(src).not.toMatch(/orphanCharts/) // 命名隔离：视觉段判据在 phase2:1593，不在此检测器
  })
})
