/**
 * 0907 管线回归 · Phase 2 装配层 v1 资源表（L6）
 *
 * L6 接线：microcode-engineer chunk prompt 按当前 section 从 Manifest 过滤资源清单。
 * 验证 scopedResourceDomMapping（prompt-builder.js 实际调用的纯函数）在确定子组件文件
 * 命中其归属 section 时，把资源清单收敛为「仅该 section 资源」，从而从管线层消除跨 section 错绑。
 *
 * 错绑拦截断言：当日总流量 section 只应看到 icon1/bg1，绝不应看到车型分布的 icon2/bg2
 * 或流量预测的 icon3。
 */

import * as fs from 'fs'
import * as path from 'path'

const AI_ENGINE_DIR = __dirname
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/0907')

function loadJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8'))
}

async function tryRequire<T = any>(rel: string, exportName: string): Promise<T | null> {
  const p = path.resolve(AI_ENGINE_DIR, rel)
  try {
    const mod = require(p)
    const ns = mod?.default ?? mod
    return ns?.[exportName] ?? null
  } catch {
    try {
      const mod = await import(p)
      const ns = mod?.default ?? mod
      return ns?.[exportName] ?? null
    } catch {
      return null
    }
  }
}

function buildInput(rdm: any[]) {
  return {
    resourceDomMapping: rdm,
    subComponentPlan: {
      effectiveSections: [
        { id: 'daily-total-flow', title: '当日总流量', responsibility: '图表组件：当日总流量' },
        { id: 'vehicle-type-distribution', title: '车型分布', responsibility: '图表组件：车型分布' },
        { id: 'flow-prediction', title: '流量预测', responsibility: '图表组件：流量预测' },
      ],
    },
  }
}

describe('T6 chunk prompt 按 section 过滤资源清单（资源错绑治本·接线）', () => {
  test('T6a scopedResourceDomMapping 已实现并可加载', async () => {
    const fn = await tryRequire<any>('./utils/resource-manifest.js', 'scopedResourceDomMapping')
    expect(fn).not.toBeNull()
  })

  test('T6b 当日总流量 section 只拿到本 section 资源（错绑拦截）', async () => {
    const fn = await tryRequire<any>('./utils/resource-manifest.js', 'scopedResourceDomMapping')
    if (!fn) return
    const rdm = loadJson('traffic/resource-dom-mapping.json')
    const input = buildInput(rdm)
    const sec = input.subComponentPlan.effectiveSections[0] // 当日总流量
    const scoped = fn(rdm, sec)
    expect(scoped).toBeDefined()
    const vars = (scoped || []).map((m: any) => m.assignedVarName)
    expect(vars).toContain('icon1')
    expect(vars).toContain('bg1')
    // 跨 section 资源必须被过滤掉（错绑根因）
    expect(vars).not.toContain('icon2') // 车型分布
    expect(vars).not.toContain('bg2') // 车型分布
    expect(vars).not.toContain('icon3') // 流量预测
  })

  test('T6c 车型分布 section 只拿到本 section 资源', async () => {
    const fn = await tryRequire<any>('./utils/resource-manifest.js', 'scopedResourceDomMapping')
    if (!fn) return
    const rdm = loadJson('traffic/resource-dom-mapping.json')
    const input = buildInput(rdm)
    const sec = input.subComponentPlan.effectiveSections[1] // 车型分布
    const scoped = fn(rdm, sec)
    const vars = (scoped || []).map((m: any) => m.assignedVarName)
    expect(vars).toContain('icon2')
    expect(vars).toContain('bg2')
    expect(vars).not.toContain('icon1')
    expect(vars).not.toContain('icon3')
  })

  test('T6d 未匹配 section 时 fail-open 返回 undefined（保留全量，不阻断生成）', async () => {
    const fn = await tryRequire<any>('./utils/resource-manifest.js', 'scopedResourceDomMapping')
    if (!fn) return
    const rdm = loadJson('traffic/resource-dom-mapping.json')
    expect(fn(rdm, null)).toBeUndefined()
    expect(fn(rdm, { id: 'nope', title: '不存在' })).toBeUndefined()
    expect(fn([], { id: 'x', title: '当日总流量' })).toBeUndefined()
  })
})
