/**
 * 🎯 形态归一修复单测（2026-11-16 · 68783bf6/fdbb799d 实锤）
 *
 * 病灶：isVisualAnalysisDegraded 只读顶层 parsed.layout?.sections / parsed.sections，
 * 但 :4802 调用点传入的 executeResult 是**包装形态**（sections 埋在
 * layoutStructure.layout.sections，_buildCompleteResult 组装）⇒ secCount 恒 0；
 * charts/interactions 双零的静态组件（弹窗/详情类）被误判退化 → 拒缓存 →
 * 每次续跑重复调 Vision（server.log 03:27:16/36/38 三条 WARN 实锤）。
 *
 * 修复：补读 layoutStructure 包装形态路径；扁平形态语义逐字不变。
 *
 * ⚠️ 本 spec 用源码提取执行而非直接 import：visual-parser.js 模块体内含
 * import.meta（:264 构造器 projectRoot 解析），本仓 jest 为 CJS transform，
 * 整文件直接 import 会 SyntaxError（与 spec 无关的模块级约束，仓库既有惯例
 * 是「纯函数抽 utils 或源码文本断言」，此处取源码提取以同时锁**实现**与**行为**）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC_PATH = join(__dirname, 'visual-parser.js')
const src = readFileSync(SRC_PATH, 'utf-8')

/** 从源码提取 isVisualAnalysisDegraded 并编译为可调用函数（CJS 环境下行为等价） */
function loadFn(): (parsed: unknown) => boolean {
  const start = src.indexOf('export function isVisualAnalysisDegraded')
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start + 50)
  const body = src.slice(start, end + 2).replace('export function', 'function')
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return isVisualAnalysisDegraded;`)()
}

describe('isVisualAnalysisDegraded 形态归一（源码契约）', () => {
  it('补读包装形态：layoutStructure.layout.sections 与 layoutStructure.sections 两条路径都在', () => {
    expect(src).toContain('parsed.layoutStructure?.layout?.sections?.length')
    expect(src).toContain('parsed.layoutStructure?.sections?.length')
  })
  it('既有扁平路径保留（:982 调用点语义不变）', () => {
    expect(src).toContain('parsed.layout?.sections?.length')
    expect(src).toContain('parsed.sections?.length')
  })
  it('charts/interactions 兜底保留', () => {
    expect(src).toContain('parsed.charts?.length')
    expect(src).toContain('parsed.interactions?.length')
  })
})

describe('isVisualAnalysisDegraded 行为（提取执行）', () => {
  const fn = loadFn()

  // ── 扁平形态（:982 解析阶段调用点，既有语义不得变）──
  it('扁平形态：layout.sections 非空 → 非退化', () => {
    expect(fn({ layout: { sections: [{ id: 'a' }] } })).toBe(false)
  })
  it('扁平形态：sections 空但 charts 非空 → 非退化（既有兜底）', () => {
    expect(fn({ layout: { sections: [] }, charts: [{ type: 'bar' }] })).toBe(false)
  })
  it('扁平形态：三全空 → 退化（真半截数据仍拦截）', () => {
    expect(fn({ layout: { sections: [] } })).toBe(true)
    expect(fn({})).toBe(true)
    expect(fn(null)).toBe(true)
  })

  // ── 包装形态（:4802 execute 出口调用点，本轮修复目标）──
  it('包装形态：layoutStructure.layout.sections 非空 + charts/interactions 双零 → 非退化（修复前误判退化）', () => {
    expect(
      fn({
        layoutStructure: { layout: { sections: [{ id: '38:3260' }, { id: '38:3137' }] } },
        charts: [],
        interactions: [],
      }),
    ).toBe(false)
  })
  it('包装形态：layoutStructure.sections 直挂（无 layout 中间层）→ 非退化', () => {
    expect(
      fn({ layoutStructure: { sections: [{ id: 'a' }] }, charts: [], interactions: [] }),
    ).toBe(false)
  })
  it('包装形态：结构真空（包装壳里也没 sections）→ 仍判退化（不放过真坏数据）', () => {
    expect(
      fn({ layoutStructure: { layout: { sections: [] } }, charts: [], interactions: [] }),
    ).toBe(true)
  })

  // ── 真机重放锚：68783bf6 / fdbb799d 误判形态（静态组件三零 + 包装形态）──
  it('重放 mc-max-1794799628184-68783bf6：弹窗类 4 段 + 双零 → 非退化（修复前拒缓存）', () => {
    expect(
      fn({
        layoutStructure: {
          layout: {
            sections: [
              { id: '38:3260', name: '顶部统计卡片' },
              { id: '38:3137', name: '战略合作厂商' },
              { id: '38:3162', name: '优质厂商' },
              { id: '38:3206', name: '普通厂商' },
            ],
          },
        },
        charts: [],
        interactions: [],
      }),
    ).toBe(false)
  })
  it('重放 mc-max-1794799611748-fdbb799d：详情类单段 24 children + 双零 → 非退化（修复前拒缓存）', () => {
    expect(
      fn({
        layoutStructure: {
          layout: {
            sections: [{ id: '36:1693', name: '设备详情区域', body: { children: [{ id: '81:7' }] } }],
          },
        },
        charts: [],
        interactions: [],
      }),
    ).toBe(false)
  })

  // ── 兼容：包装形态 + 顶层 charts 非空（c1ac194a 类）→ 非退化 ──
  it('包装形态 + 顶层 charts 非空 → 非退化（既有兜底不受影响）', () => {
    expect(
      fn({
        layoutStructure: { layout: { sections: [] } },
        charts: [{ type: 'radar' }],
        interactions: [],
      }),
    ).toBe(false)
  })
})
