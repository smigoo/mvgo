/**
 * 🛡️ 字号下限守卫（ensureMinFontSize / formatFontGuardLog）单测
 *
 * 真实样本：c-deployment-node-overview-74d5fe95（Lite 微码产物，LLM 把正文压到 8px
 * = `calc(@fontSize * 0.5714)`，而视觉分析真值是「正文约13px、次要信息约11px」）。
 *
 * 本 spec 只测**纯函数**；两条链路（engineer / lite）的「是否真接线」由各自的 wiring spec 负责。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureMinFontSize, formatFontGuardLog } from './font-size-guard.js'
import {
  FONT_BASE_PX,
  MIN_BODY_FONT_PX,
  MIN_BODY_FONT_RATIO,
} from './font-size-normalizer.js'

const normerSrc = readFileSync(join(__dirname, 'font-size-normalizer.js'), 'utf-8')

describe('字号下限常量（单一来源）', () => {
  it('MIN_BODY_FONT_PX === FONT_BASE_PX × MIN_BODY_FONT_RATIO（14 × 0.75 = 10.5）', () => {
    expect(MIN_BODY_FONT_RATIO).toBe(0.75)
    expect(FONT_BASE_PX).toBe(14)
    expect(MIN_BODY_FONT_PX).toBe(10.5)
    expect(Number((FONT_BASE_PX * MIN_BODY_FONT_RATIO).toFixed(2))).toBe(MIN_BODY_FONT_PX)
  })

  it('normalizer 里确实导出了这两个常量（防止被改名后静默 undefined）', () => {
    expect(normerSrc).toContain('export const MIN_BODY_FONT_RATIO = 0.75')
    expect(normerSrc).toMatch(/export const MIN_BODY_FONT_PX = Number\(\(FONT_BASE_PX \* MIN_BODY_FONT_RATIO\)\.toFixed\(2\)\)/)
  })
})

describe('ensureMinFontSize（落盘兜底）', () => {
  it('阳性：calc(@fontSize * 0.5714)（=8px 实锤）→ 提升到 0.75', () => {
    const files = { 'package/index.vue': `.stat-label { font-size: calc(@fontSize * 0.5714); }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toContain('calc(@fontSize * 0.75)')
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0].ratio).toBe(0.5714)
  })

  it('阳性：calc(var(--fontSize) * 0.6429) → 提升到 0.75', () => {
    const files = { 'package/index.vue': `.addr { font-size: calc(var(--fontSize) * 0.6429); }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toContain('calc(var(--fontSize) * 0.75)')
    expect(r.changes).toHaveLength(1)
  })

  it('阳性：.less 文件同样生效（微码业务样式真实落点是 common.less）', () => {
    const files = { 'resources/styles/common.less': `.c-x__label { font-size: calc(@fontSize * 0.6429); }` }
    const r = ensureMinFontSize(files)
    expect(r.files['resources/styles/common.less']).toContain('calc(@fontSize * 0.75)')
    expect(r.changes).toHaveLength(1)
  })

  it('反向①：0.85 ≥ 下限 → 不动', () => {
    const files = { 'package/index.vue': `.title { font-size: calc(@fontSize * 0.85); }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe(files['package/index.vue'])
    expect(r.changes).toHaveLength(0)
  })

  it('反向②：恰好 0.75 = 阈值 → 不动（不重复提升）', () => {
    const files = { 'package/index.vue': `.name { font-size: calc(@fontSize * 0.75); }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe(files['package/index.vue'])
    expect(r.changes).toHaveLength(0)
  })

  it('反向③：非 .vue/.less 文件 → 跳过', () => {
    const files = { 'resources/config/css-vars.js': `var x = "calc(@fontSize * 0.5)";` }
    const r = ensureMinFontSize(files)
    expect(r.files['resources/config/css-vars.js']).toBe(files['resources/config/css-vars.js'])
    expect(r.changes).toHaveLength(0)
  })

  it('多处混合：只提升低于阈值的', () => {
    const files = {
      'package/index.vue': `
        .a { font-size: calc(@fontSize * 0.5714); }
        .b { font-size: calc(@fontSize * 0.85); }
        .c { font-size: calc(var(--fontSize) * 0.6429); }
      `,
    }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toContain('calc(@fontSize * 0.75)')
    expect(r.files['package/index.vue']).toContain('calc(@fontSize * 0.85)')
    expect(r.files['package/index.vue']).toContain('calc(var(--fontSize) * 0.75)')
    expect(r.changes).toHaveLength(2)
  })

  it('幂等：连续两次结果一致，第二次零命中', () => {
    const files = { 'package/index.vue': `.name { font-size: calc(@fontSize * 0.57); }` }
    const r1 = ensureMinFontSize(files)
    const r2 = ensureMinFontSize(r1.files)
    expect(r2.files['package/index.vue']).toBe(r1.files['package/index.vue'])
    expect(r2.changes).toHaveLength(0)
  })

  it('不改写原对象（纯函数）', () => {
    const files = { 'package/index.vue': `.name { font-size: calc(@fontSize * 0.5714); }` }
    const before = files['package/index.vue']
    ensureMinFontSize(files)
    expect(files['package/index.vue']).toBe(before)
  })
})

describe('裸 px 形态（Lite vue3 分支实证：该分支不做归一，字号就是绝对 px）', () => {
  it('阳性：font-size: 8px → 提升到 10.5px，changes 标记 form=rawpx', () => {
    const files = { 'package/index.vue': `.name { font-size: 8px; }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe('.name { font-size: 10.5px; }')
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0].form).toBe('rawpx')
    expect(r.rawFixed).toBe(1)
    expect(r.rawUnderMin).toBe(0)
  })

  it('阳性：行内 style 里的裸 px 同样命中（vue3 产物大量用 inline style）', () => {
    const files = {
      'package/index.vue': `<span style="color:#333;font-size:9px;line-height:1">{{ t }}</span>`,
    }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toContain('font-size:10.5px')
    expect(r.changes).toHaveLength(1)
  })

  it('阳性：真实病灶阶梯 8/9/10/11/12px → 只提升 8/9/10 三处，11/12 不动', () => {
    const files = {
      'package/index.vue': `
        .a { font-size: 12px; }
        .b { font-size: 11px; }
        .c { font-size: 10px; }
        .d { font-size: 9px; }
        .e { font-size: 8px; }
      `,
    }
    const r = ensureMinFontSize(files)
    expect(r.changes).toHaveLength(3)
    expect(r.rawFixed).toBe(3)
    expect(r.files['package/index.vue']).toContain('.a { font-size: 12px; }')
    expect(r.files['package/index.vue']).toContain('.b { font-size: 11px; }')
    expect(r.files['package/index.vue']).toContain('.c { font-size: 10.5px; }')
    expect(r.files['package/index.vue']).toContain('.d { font-size: 10.5px; }')
    expect(r.files['package/index.vue']).toContain('.e { font-size: 10.5px; }')
    // 改后不得再有低于下限的裸 px
    expect(r.rawUnderMin).toBe(0)
  })

  it('豁免：≤ MIN_FONT_PX(5px) 不动（font-size:0 是隐藏文本技巧，不是可读正文）', () => {
    const files = { 'package/index.vue': `.a{font-size:0px}.b{font-size:1px}.c{font-size:5px}` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe(files['package/index.vue'])
    expect(r.changes).toHaveLength(0)
  })

  it('反向：≥ 下限（10.5px / 12px / 16px）不动', () => {
    const files = { 'package/index.vue': `.a{font-size:10.5px}.b{font-size:12px}.c{font-size:16px}` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe(files['package/index.vue'])
    expect(r.changes).toHaveLength(0)
  })

  it('反向：非 px 形态（rem/em/%）不在覆盖范围，保持原样', () => {
    const files = { 'package/index.vue': `.a{font-size:0.5rem}.b{font-size:0.8em}.c{font-size:70%}` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe(files['package/index.vue'])
    expect(r.changes).toHaveLength(0)
  })

  it('大小写无关：FONT-SIZE: 8PX 也命中', () => {
    const files = { 'package/index.vue': `.a { FONT-SIZE: 8PX; }` }
    const r = ensureMinFontSize(files)
    expect(r.files['package/index.vue']).toBe('.a { FONT-SIZE: 10.5px; }')
    expect(r.changes).toHaveLength(1)
  })

  it('两种形态混合：calc 与裸 px 各自命中，form 可区分', () => {
    const files = {
      'package/index.vue': `.a { font-size: calc(@fontSize * 0.5714); }
                             .b { font-size: 8px; }`,
    }
    const r = ensureMinFontSize(files)
    expect(r.changes).toHaveLength(2)
    expect(r.changes.map((c) => c.form).sort()).toEqual(['calc', 'rawpx'])
    expect(r.rawFixed).toBe(1)
  })

  it('幂等：裸 px 提升后再跑零命中且内容不变', () => {
    const files = { 'package/index.vue': `.a { font-size: 8px; }` }
    const r1 = ensureMinFontSize(files)
    const r2 = ensureMinFontSize(r1.files)
    expect(r2.files['package/index.vue']).toBe(r1.files['package/index.vue'])
    expect(r2.changes).toHaveLength(0)
  })
})

describe('formatFontGuardLog（真机日志判据载体）', () => {
  it('hits:0 也必须产出可 grep 的日志行（区分「没接线」与「零命中」）', () => {
    const r = ensureMinFontSize({ 'package/index.vue': `.a { color: red; }` })
    const { message, meta } = formatFontGuardLog(r, 'lite')
    expect(message).toContain('[FONT-MIN-GUARD@lite]')
    expect(message).toContain('hits:0')
    expect(message).toContain(`minRatio:${MIN_BODY_FONT_RATIO}`)
    expect(message).toContain(`minPx:${MIN_BODY_FONT_PX}`)
    expect(meta.tag).toBe('lite')
    expect(meta.count).toBe(0)
  })

  it('有命中时带 tag / 计数 / 样本', () => {
    const r = ensureMinFontSize({ 'package/index.vue': `.a { font-size: calc(@fontSize * 0.5714); }` })
    const { message, meta } = formatFontGuardLog(r, 'max')
    expect(message).toContain('[FONT-MIN-GUARD@max]')
    expect(message).toContain('hits:1')
    expect(meta.count).toBe(1)
    expect(meta.samples[0]).toContain('package/index.vue')
    expect(meta.samples[0]).toContain('0.75')
  })

  it('两条链路 tag 必须不同（否则真机日志无法定位是哪条链路在兜底）', () => {
    const r = ensureMinFontSize({ 'package/index.vue': `.a { color: red; }` })
    expect(formatFontGuardLog(r, 'max').message).not.toBe(formatFontGuardLog(r, 'lite').message)
  })

  it('日志必须区分命中形态：calc 与 rawpx 各自计数（定位是哪个 target 被兜底）', () => {
    const mixed = ensureMinFontSize({
      'package/index.vue': `.a{font-size:calc(@fontSize * 0.5714)}.b{font-size:8px}`,
    })
    const mixedMsg = formatFontGuardLog(mixed, 'lite').message
    expect(mixedMsg).toContain('hits:2')
    expect(mixedMsg).toContain('calc:1')
    expect(mixedMsg).toContain('rawpx:1')

    const rawOnly = ensureMinFontSize({ 'package/index.vue': `.b{font-size:8px}` })
    expect(formatFontGuardLog(rawOnly, 'lite').message).toContain('rawpx:1')
    expect(formatFontGuardLog(rawOnly, 'lite').message).toContain('calc:0')
  })
})
