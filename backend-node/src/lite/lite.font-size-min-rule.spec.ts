/**
 * 🛡️ Lite 生成阶段「字号下限铁律」判据（2026-10-30）
 *
 * 真实病灶：c-deployment-node-overview-74d5fe95 —— prompt 的 P0-4 反复说「空间不足优先缩字号」
 * 却没有任何下限，LLM 把正文压到 8px（归一后 `calc(@fontSize * 0.5714)`），整屏不可读。
 * 只靠 writeFiles 后处理钳制是治标；本 spec 守的是**生成阶段**必须把下限写进 prompt，
 * 且下限数值与后处理 `ensureMinFontSize` 同源（font-size-normalizer 的 MIN_BODY_FONT_*）。
 *
 * 判据取源码文本（LiteService 装配依赖太重，实例化会拖 sharp/mongoose），
 * 但每条断言都有牙：删条款 / 改硬编码 / 只注入一条 prompt，都会精确变红（见阳性对照）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const svcSrc = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8')
const normerSrc = readFileSync(
  join(__dirname, '../ai-engine/utils/font-size-normalizer.js'),
  'utf-8',
)

// ---- 单一来源常量（真实数值取自 normalizer 源码，spec 不另立一份） ----
const ratioMatch = normerSrc.match(/export const MIN_BODY_FONT_RATIO = ([\d.]+)/)
const baseMatch = normerSrc.match(/export const FONT_BASE_PX = (\d+)/)
if (!ratioMatch || !baseMatch) {
  throw new Error('MIN_BODY_FONT_RATIO / FONT_BASE_PX not found in font-size-normalizer.js')
}
const MIN_RATIO = Number(ratioMatch[1])
const FONT_BASE = Number(baseMatch[1])
const MIN_PX = Number((FONT_BASE * MIN_RATIO).toFixed(2))

/** 从 buildFontFloorRule 里取出模板原文，并把两个常量占位符渲染成真实值 */
const fnMatch = svcSrc.match(/private buildFontFloorRule\(brief\?: any\): string \{[\s\S]*?\n  \}/)
if (!fnMatch) throw new Error('buildFontFloorRule(brief?) not found in lite.service.ts')
const fnBody = fnMatch[0]
const tplMatch = fnBody.match(/return `([\s\S]*)`;/)
if (!tplMatch) throw new Error('buildFontFloorRule 未找到 return 模板字符串')
const rawTpl = tplMatch[1]
const rendered = rawTpl
  .replace(/\$\{truthBlock\}/g, '')
  .replace(/\$\{MIN_BODY_FONT_PX\}/g, String(MIN_PX))
  .replace(/\$\{MIN_BODY_FONT_RATIO\}/g, String(MIN_RATIO))

/** 铁律判据（供正向断言 + 阳性对照共用，保证「判据本身有牙」） */
function assertFloorRule(text: string) {
  expect(text).toContain('字号下限铁律')
  expect(text).toContain(`不得低于 ${MIN_PX}px`)
  expect(text).toContain(`× ${MIN_RATIO}`)
  expect(text).toContain('禁止把文字压到下限以下')
}

describe('Lite 生成阶段字号下限铁律', () => {
  it('常量自洽：MIN_BODY_FONT_PX = FONT_BASE_PX × MIN_BODY_FONT_RATIO（14 × 0.75 = 10.5）', () => {
    expect(normerSrc).toContain(
      'export const MIN_BODY_FONT_PX = Number((FONT_BASE_PX * MIN_BODY_FONT_RATIO).toFixed(2))',
    )
    expect(FONT_BASE).toBe(14)
    expect(MIN_RATIO).toBe(0.75)
    expect(MIN_PX).toBe(10.5)
  })

  it('铁律文本包含完整条款（下限数值 / 层级不变 / 禁压字号）', () => {
    assertFloorRule(rendered)
    // 必须点明下限只约束最低层级，避免模型把全部文字抬成同一字号
    expect(rendered).toContain('不得把所有文字统一抬成同一字号')
    // 必须给出替代手段，否则模型只知道「不许缩字号」而无处可去
    expect(rendered).toContain('优先压缩 padding')
  })

  it('数值必须引用常量占位符，禁止在 prompt 里硬编码 0.75 / 10.5', () => {
    // 硬编码回归守卫：改成字面量后 rendered 仍含相同数字（假绿），所以这里直接查原文占位符
    expect(rawTpl).toContain('${MIN_BODY_FONT_PX}')
    expect(rawTpl).toContain('${MIN_BODY_FONT_RATIO}')
  })

  it('两条生成 prompt（vue3 / 微码）都注入了该铁律', () => {
    expect((svcSrc.match(/\$\{fontFloorRule\}/g) || []).length).toBe(2)
    expect(
      (svcSrc.match(/const fontFloorRule = this\.buildFontFloorRule\(brief\);/g) || []).length,
    ).toBe(2)

    const iCodegen = svcSrc.indexOf('private buildCodegenPrompt(')
    const iMicro = svcSrc.indexOf('private buildMicrocodeCodegenPrompt(')
    expect(iCodegen).toBeGreaterThan(-1)
    expect(iMicro).toBeGreaterThan(iCodegen)
    // 按方法区间切段，确认各自体内真的注入了（而不是只在某一处）
    expect(svcSrc.slice(iCodegen, iMicro)).toContain('${fontFloorRule}')
    expect(svcSrc.slice(iMicro)).toContain('${fontFloorRule}')
  })

  it('阳性对照：篡改下限语义后判据必须变红', () => {
    expect(() => assertFloorRule(rendered.replace('不得低于', '不得高于'))).toThrow()
    expect(() => assertFloorRule(rendered.replace('禁止把文字压到下限以下', ''))).toThrow()
    expect(() => assertFloorRule('')).toThrow()
  })

  it('真值注入：brief.typography.size 必须原样进入 prompt（禁止只给下限不给真值）', () => {
    // 取值来源
    expect(fnBody).toContain('brief.typography?.size')
    // 真值段标题 + 原样插入 typoSize
    expect(fnBody).toContain('【本次字号真值（来自视觉分析，已按逻辑 CSS px 标定；逐级还原，禁止统一压缩）】')
    expect(fnBody).toContain('${typoSize}')
    // 允许 ±1px 容差，并明确禁止「整体乘同一缩小系数」（实锤：13px → 8px = 0.6 整体压缩）
    expect(fnBody).toContain('±1px')
    expect(fnBody).toContain('禁止整体乘以同一个缩小系数')
    // 真值段必须在返回值里真正被拼接（否则等于白算）
    expect(rawTpl).toContain('${truthBlock}')
  })

  it('两个生成 prompt 都必须把 brief 传进铁律（不传 ⇒ 真值段恒空，等于失效）', () => {
    expect((svcSrc.match(/this\.buildFontFloorRule\(brief\)/g) || []).length).toBe(2)
    expect(svcSrc.includes('this.buildFontFloorRule()')).toBe(false)
  })
})
