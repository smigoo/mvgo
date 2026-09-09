/**
 * 0907 管线回归症状断言（Phase 0 测试基线）
 *
 * 背景：docs/0907-组件生成问题分析.md 第六章审计结论——
 * 三个组件（env/traffic/device）暴露的 12 项根因中，5 项「写错了」。
 * 本 spec 把这些「写错了」固化为可执行断言：当前应 FAIL（红），
 * 止血层 L1-L4 修复后逐项转绿。
 *
 * fixture：src/fixtures/0907/{env,traffic,device}/
 *   - figma-node-data.json（裁剪版：骨架+TEXT+关键子树）
 *   - vision.json / resource-dom-mapping.json / 问题产物样本
 *
 * 与既有 jest 失败基线隔离：独立 spec 文件，不依赖 Nest 容器。
 */

import * as fs from 'fs'
import * as path from 'path'

const AI_ENGINE_DIR = __dirname
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/0907')

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(AI_ENGINE_DIR, rel), 'utf8')
}

function readAllMd(dir: string): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push({ file: p, content: fs.readFileSync(p, 'utf8') })
    }
  }
  walk(dir)
  return out
}

function loadJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8'))
}

/** 动态探测尚未实现的函数（L2/L4 落地后转绿），不存在时返回 null。
 *  支持 ESM（jest 下 .js 为 ESM，require 会抛错 → 退回动态 import） */
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

// ---------------------------------------------------------------------------
// T1 · flex 事实源清零（L1 落地后转绿）
// 审计：prompts/engineer/shared/root-container.md:20 仍写「flex-grow 直接取
// 设计稿高度值」——09-05 只修了 microcode-engineer.js 的 p 段，此 .md 漏修。
// ---------------------------------------------------------------------------
describe('T1 flex 像素误写事实源', () => {
  const rootContainer = readSrc('./prompts/engineer/shared/root-container.md')

  test('root-container.md 不含「flex-grow 直接取设计稿高度值」错误示例', () => {
    expect(rootContainer).not.toContain('flex-grow 直接取设计稿高度值')
  })

  test('root-container.md 不含 `flex: <...高度...> 1 0` 量纲混用写法', () => {
    expect(rootContainer).not.toMatch(/flex:\s*<[^>]*高度[^>]*>\s*1\s+0/)
  })

  test('prompts/ 全部 .md 无「grow 取设计稿高度」同类表述', () => {
    const promptsDir = path.resolve(AI_ENGINE_DIR, './prompts')
    const offenders = readAllMd(promptsDir).filter(({ content }) =>
      /flex-grow[^\n]{0,20}(直接取|等于|使用)[^\n]{0,20}(设计稿|Figma)[^\n]{0,10}(高度|height)/.test(
        content,
      ),
    )
    expect(offenders.map((o) => o.file)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// T2 · min-height 口径三合一（L3 落地后转绿）
// 审计：T2 硬编码 80px（microcode-engineer.js）vs post-process.js 注入
// min-height: 0 vs chart-standards.md 160/100px——三处口径互相矛盾。
// ---------------------------------------------------------------------------
describe('T2 图表 min-height 口径统一', () => {
  test('post-process.js 不再向图表容器注入 min-height: 0', () => {
    const postProcess = readSrc('./utils/post-process.js')
    // injectChartMinHeight 函数体内的 min-height: 0 注入必须移除
    expect(postProcess).not.toMatch(/injectChartMinHeight[\s\S]{0,600}min-height:\s*0/)
  })

  test('microcode-engineer.js T2 段不含硬编码 min-height: 80px', () => {
    const engineer = readSrc('./roles/microcode-engineer.js')
    expect(engineer).not.toContain('min-height: 80px')
  })
})

// ---------------------------------------------------------------------------
// T3 · 行内复合结构保留（L2 落地后转绿）
// 审计：visual-parser.js:1515-1564 兜底重建硬编码 layout:'vertical'，
// 把行内并列节点（y 重叠 + x 不相交）拍平为纵向 children。
// ---------------------------------------------------------------------------
describe('T3 行内复合结构', () => {
  test('T3a fixture 自检：device @antd/tab 的 tabs 与 cons y 区间高度重叠', () => {
    const device = loadJson('device/figma-node-data.json')
    const find = (n: any, pred: (x: any) => boolean): any =>
      pred(n) ? n : (n.children || []).map((c: any) => find(c, pred)).find(Boolean)
    const tab = find(device.document, (n: any) => n.name === '@antd/tab')
    expect(tab).toBeTruthy()
    const tabs = find(tab, (n: any) => n.name === 'tabs')
    const cons = find(tab, (n: any) => n.name === 'cons')
    const t = tabs.absoluteBoundingBox
    const c = cons.absoluteBoundingBox
    const overlap = Math.min(t.y + t.height, c.y + c.height) - Math.max(t.y, c.y)
    const ratio = overlap / Math.min(t.height, c.height)
    expect(ratio).toBeGreaterThan(0.7)
  })

  test('T3b 兜底重建含水平复合判定（当前硬编码 vertical）', () => {
    // 实现位于 utils/inline-row-rebuilder.js（纯函数）；visual-parser.js 仅 import 复用
    const src = readSrc('./utils/inline-row-rebuilder.js')
    // 锚定兜底重建的行聚类段（rows.sort 之后的段落），断言其中存在 horizontal 复合判定。
    // 当前该段硬编码 layout:'vertical' 拍平行内并列节点 → 红；L2 修复后 → 绿。
    const anchor = src.indexOf('rows.sort((a, b) => a.y - b.y)')
    expect(anchor).toBeGreaterThan(-1)
    const rebuildSegment = src.slice(anchor, anchor + 3000)
    expect(rebuildSegment).toMatch(/layout:\s*['"]horizontal['"]/)
  })

  test('T3c 兜底重建函数对行内并列 fixture 输出 horizontal（L2 导出后转绿）', async () => {
    // 纯函数实现于 utils/inline-row-rebuilder.js（无 import.meta，jest 可 require）；visual-parser.js 仅 re-export
    const rebuild = await tryRequire<(doc: any) => any>(
      './utils/inline-row-rebuilder.js',
      'rebuildSectionsPreservingInlineRows',
    )
    // L2：导出兜底重建并保留行内复合
    expect(rebuild).not.toBeNull()
    if (!rebuild) return
    const env = loadJson('env/figma-node-data.json')
    const sections = rebuild(env.document)
    const subT = (sections || []).find((s: any) => /sub-t|tab/i.test(JSON.stringify(s)))
    expect(JSON.stringify(subT)).toContain('horizontal')
  })
})

// ---------------------------------------------------------------------------
// T4 · TEXT-TRUTH 核心文案分级（L4 落地后转绿）
// 审计：code-structure-validator.js:1926 阈值「≤2 处 WARN」——device
// 「南北接线 设备」→「房屋建筑设备」单处标题级篡改必然放行。
// 根源方案：标题级（t- 前缀 TEXT 节点）篡改必 BLOCK，普通文本保留阈值。
// ---------------------------------------------------------------------------
describe('T4 TEXT-TRUTH 核心文案分级', () => {
  const { detectUnknownText } = require('./utils/text-truth-guard.js')
  const device = loadJson('device/figma-node-data.json')
  // device 产物 ViewSwitch.vue 把「南北接线 设备」臆造为「房屋建筑\n设备」
  const fakeFiles = [
    {
      path: 'package/components/ViewSwitch.vue',
      content: fs.readFileSync(path.join(FIXTURE_DIR, 'device/ViewSwitch.vue'), 'utf8'),
    },
  ]

  test('T4a 检测能力基线：「房屋建筑设备」能被检出为 unknownText（当前应 PASS）', () => {
    const unknowns = detectUnknownText(fakeFiles, device.document)
    const texts = unknowns.map((u: any) => u.text)
    expect(texts).toContain('房屋建筑')
  })

  test('T4b 标题级篡改必须 BLOCK：resolveTextTruthSeverity 分级判定（L4 实现后转绿）', async () => {
    const resolver = await tryRequire<(u: any[], doc: any) => string>(
      './utils/text-truth-guard.js',
      'resolveTextTruthSeverity',
    )
    // L4：核心文案篡改必 BLOCK，普通文本保留阈值
    expect(resolver).not.toBeNull()
    if (!resolver) return
    const unknowns = detectUnknownText(fakeFiles, device.document)
    expect(resolver(unknowns, device.document)).toBe('BLOCK')
  })
})
