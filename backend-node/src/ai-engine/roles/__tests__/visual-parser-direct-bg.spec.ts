/**
 * 🛡️ 直接 bg 判据（2026-11-13）：`_findContentBackgroundResource` 收口为「只有直接 bg 才挂」。
 *
 * 病灶（mc-max-1794546172891-8b9302bc 实锤）：车型分布两张卡的椭圆光晕底（bg-[m]，
 * 191×81，figmaPath 在 section 子树内）被旧策略1（子树路径命中即 return，无尺寸校验）
 * 提升为 section body 背景 ⇒ 模板映射后贴到 base-panel 根（还带上从卡片盒算出的错位
 * backgroundPosition: 1px 30px）；同族另一张（bg-_m-36）body 只补一张无人认领 ⇒ 悬空
 * import ⇒ CODE-022 BLOCK。旧策略2（路径双向 includes）/策略3（尺寸面积最大猜）同理
 * 是猜测通道——11-05 的「h<120 && ratio>2.5」防线只挡细长条（191/81≈2.34 从下面溜过）。
 *
 * 用户申明（2026-11-13）：section 可以没有背景，而且大部分都没有；只有 section 有
 * **直接** bg 的时候才需要挂。判据 = 策略0 自声明占位 ∨ 策略1 子树命中∧铺满校验
 * （bg 盒 ≈ 容器盒，宽高差 ≤8px，与 11-11 让位判据同口径）。
 *
 * 为什么用源码断言：`VisualParser` 继承的 `BaseAgent` 含 `import.meta.url`，本仓库
 * jest(CJS) 不可 import（先例：visual-parser-bg-sizing-truth.spec.ts）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(__dirname, '../visual-parser.js'), 'utf-8')

function sliceMethod(src, signature) {
  const at = src.indexOf(signature)
  if (at < 0) return ''
  const end = src.indexOf('\n  }\n', at)
  return src.slice(at, end > at ? end : at + 6000)
}

describe('直接 bg 判据 —— _findContentBackgroundResource 收口', () => {
  const SIG = '_findContentBackgroundResource(contentNode, availableBgMappings, parsed)'
  const method = sliceMethod(SRC, SIG)

  it('方法体已取到（防切片漂移导致断言空转）', () => {
    expect(method.length).toBeGreaterThan(500)
  })

  it('策略0 自声明占位保留（bgPlaceholder 解析）', () => {
    expect(method).toMatch(/bgPlaceholder/)
    expect(method).toMatch(/bySelfName/)
  })

  it('策略1 = 子树命中 ∧ 铺满校验（宽高差 ≤8px，与 11-11 让位判据同口径）', () => {
    expect(method).toMatch(/inSubtree/)
    expect(method).toMatch(/Math\.abs\(bw - cw\) <= 8/)
    expect(method).toMatch(/Math\.abs\(bh - ch\) <= 8/)
  })

  it('无直接 bg ⇒ return null（不补背景是常态，不是缺失）', () => {
    expect(method).toMatch(/return null/)
  })

  it('猜测通道整体废除：不再有「尺寸面积最大兜底」与「路径双向 includes」', () => {
    // 旧策略2：contentPathHint.includes(path) 双向包含
    expect(method).not.toMatch(/contentPathHint\.includes\(path\)/)
    // 旧策略3：不看路径、只按尺寸筛 + 面积最大的候选池
    expect(method).not.toMatch(/targetPool/)
    expect(method).not.toMatch(/ratio > 2\.5/)
    // 唯一 return 面积比较只在 directHits（已过铺满校验）内部
    expect(method).toMatch(/directHits\.reduce/)
  })

  it('调用方 _enrichContentBackground 保留子级归属保护（_bodyChildrenHaveResources）', () => {
    // 方法内嵌套块会截断切片，改用两个唯一调用点断言（content 分支 + body 分支）
    expect(SRC).toMatch(/const contentHasChildResources = this\._bodyChildrenHaveResources\(content\)/)
    expect(SRC).toMatch(/if \(this\._bodyChildrenHaveResources\(body\)\)/)
  })
})
