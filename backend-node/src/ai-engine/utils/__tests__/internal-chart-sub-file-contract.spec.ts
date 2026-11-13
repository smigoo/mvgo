/**
 * ⚙️ internal chart 子组件文件契约（2026-11-13 · mc-max-1794551009165-7dfc01e9 环形图缺失实锤）
 *
 * 病灶链：R1-geo 把 @echarts 裸名环形帧（246:30/31）挂为宿主 internalSubcomponents 成功，
 * 但「子组件派工清单 = _detectSubComponents(index.vue 文本反推)」——internal sub 不在
 * 文本里 ⇒ 无人生成；二级补齐依赖「宿主已写引用」——宿主没写 ⇒ 也不触发。
 * prompt 软提示（「需进一步拆分为 N 个内部子组件」）被 LLM 无视 ⇒ 环形图整图缺失。
 *
 * 治本（本 spec 覆盖）：名字契约——internalChartSubFileName 从 sub.id 确定性派生
 * 独立文件名（Chart24630.vue），两处 chart-component prompt 渲染点下发「独立文件 + 宿主
 * 必须挂载」强制指令；LLM 忘输出但宿主写引用 ⇒ 既有二级子组件补齐按引用二波生成。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const ENG = readFileSync(
  join(__dirname, '../../roles/microcode-engineer.js'),
  'utf8',
)

// —— internalChartSubFileName 派生判据（与 engineer 模块内实现同形，钉死契约形态）——
function derive(sub) {
  const digits = String(sub?.id ?? '').replace(/[^0-9]/g, '')
  return digits ? `Chart${digits}.vue` : null
}

describe('internalChartSubFileName 名字派生', () => {
  it('R1-geo 合成 id（chart-246:30）⇒ Chart24630.vue', () => {
    expect(derive({ id: 'chart-246:30' })).toBe('Chart24630.vue')
  })

  it('planner R1 形态 id ⇒ 数字拼接', () => {
    expect(derive({ id: 'chart-2:7898' })).toBe('Chart27898.vue')
  })

  it('无数字可派生 ⇒ null（调用方跳过契约行，不臆造名字）', () => {
    expect(derive({ id: 'chart-' })).toBeNull()
    expect(derive(null)).toBeNull()
    expect(derive({})).toBeNull()
  })

  it('engineer 模块内派生函数存在且与契约同形', () => {
    expect(ENG).toContain('const internalChartSubFileName = (sub) =>')
    expect(ENG).toContain("String(sub?.id ?? '').replace(/[^0-9]/g, '')")
  })
})

describe('两处 chart-component 渲染点均下发文件契约', () => {
  it('「内部子组件详细说明」块：独立文件 + 一并输出 + 宿主挂载指令', () => {
    // 详细说明块（:1725 附近）契约行
    expect(ENG).toContain('   - ⚙️ 文件契约（强制）：本图表必须作为**独立文件**')
    expect(ENG).toContain('与宿主组件**一并输出**')
    expect(ENG).toContain('禁止省略挂载、禁止把图表内联进宿主模板')
  })

  it('section 清单块：独立文件 + import + 挂载指令', () => {
    // 清单块（:1642 附近）契约行
    expect(ENG).toContain('         ⚙️ 文件契约（强制）：本图表必须作为**独立文件**')
    expect(ENG).toContain('并在本组件模板中 import + 挂载')
    expect(ENG).toContain('禁止省略挂载或内联')
  })

  it('两处契约都由 internalChartSubFileName 单一来源派生（禁第二份命名实现）', () => {
    const calls = ENG.match(/internalChartSubFileName\(sub\)/g) || []
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})
