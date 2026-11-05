/**
 * 🛡️ R3-bg 刀 A 接线契约（2026-11-05）：`visual-parser` 的背景尺寸必须走「真值优先」。
 *
 * 为什么用源码断言而不是 import：`VisualParser` 继承的 `BaseAgent` 含
 * `fileURLToPath(import.meta.url)`，在本仓库的 jest(CJS) 下不可 import（先例：
 * `visual-parser-figma-hints.spec.ts` 只测抽出来的纯函数）。而本刀的真实失效模式恰恰在
 * **接线**上、不在纯函数里：
 *   - `_calculateBackgroundSizing` 若不看 `imageScaleMode`，轴向比值口径会把 48px 图标
 *     `cover` 放大到铺满整卡（`2:8049` 实锤）；STRETCH 的 D2 守卫也会在视觉解析层被重造；
 *   - 三个调用点任意一处漏传第三个参数（`mapping`）都不会报错，只会**静默退化**成旧行为
 *     —— 这正是 R3-legacy 里「白名单恒空、退化为旧行为且无日志」踩过的坑。
 * 所以这里锁「函数首位有真值分支」+「每个调用点都传了 mapping」两件事。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(__dirname, '../visual-parser.js'), 'utf-8')

describe('R3-bg 刀 A —— visual-parser 背景尺寸真值接线', () => {
  it('_calculateBackgroundSizing 首位由 sizingFromScaleMode 裁决并提前返回', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\bsizingFromScaleMode\b[^}]*\}\s*from\s*'\.\.\/utils\/background-size-inference\.js'/)
    // 方法体起点：签名含默认值只为定义处所有（JSDoc 里的 @param 不带 `= null`）
    const body = SRC.slice(SRC.indexOf('_calculateBackgroundSizing(bgFigmaBox, parentDims, mapping = null)'))
    expect(body.length).toBeGreaterThan(0)
    expect(body.slice(0, 800)).toMatch(/sizingFromScaleMode\(mapping,\s*bgFigmaBox,\s*parentDims\)/)
    expect(body.slice(0, 800)).toMatch(/if\s*\(fromScaleMode\)\s*return\s*fromScaleMode/)
    // 真值分支必须排在第一条几何判据（轴向比值）之前，否则真值永不可达
    const truthAt = body.indexOf('fromScaleMode')
    const geoAt = body.indexOf('const wR = bgW / pW')
    expect(geoAt).toBeGreaterThan(-1)
    expect(truthAt).toBeLessThan(geoAt)
  })

  it('三个调用点全部下传 mapping（漏一处即静默退化）', () => {
    const calls = SRC.match(/_calculateBackgroundSizing\([^)]*\)/g) || []
    // 1 处方法定义 + 3 处调用
    expect(calls).toHaveLength(4)
    const withMapping = calls.filter((c) => /,\s*(contentBg|bodyBg|resourceMappingMap\.get\(bgResourceFile\))/.test(c))
    expect(withMapping).toHaveLength(3)
  })

  it('批量遍历入口有整条 mapping 的平行 Map（resourceFigmaMap 只存 figmaBox，取不到 scaleMode）', () => {
    expect(SRC).toMatch(/const resourceMappingMap = new Map\(\)/)
    expect(SRC).toMatch(/resourceMappingMap\.set\(m\.resourceFile, m\)/)
  })
})

/**
 * 🛡️ R3-bg 刀 B1 / B2 接线契约（2026-11-05）。
 *
 * 真实失效模式同样在**接线**上：
 *   - B1 若只删 `if` 而不删 `backgroundRepeat: 'repeat-x'`，或反过来，会出现「条件还在但出口变了」
 *     这类半吊子状态；
 *   - B2 若只把一部分出口改成 `areaBackgroundSizing`、漏掉「通用兜底」，则最后一档仍写死
 *     `cover`，27×32 家族照样被放大（该类案例全在兜底分支上）。
 *
 * 全语料逐条对照（`scripts/audit-r3bg-b1b2-diff.mjs`，961 条走几何分支）实测：
 *   B1 命中 66 条，size/pos 逐字不变、`needsOverflowHidden` 零变化，仅 `repeat-x/y → no-repeat`；
 *   B2 命中 496 条，全部 `cover`(352) / `contain`(127) / `100% 100%`(17) → `Wpx Hpx`，
 *     且不产生任何新的 `cover` / `contain`。
 */
describe('R3-bg 刀 B1 / B2 —— visual-parser 几何出口收敛', () => {
  const AT = '_calculateBackgroundSizing(bgFigmaBox, parentDims, mapping = null)'
  const at = SRC.indexOf(AT)
  const endRel = SRC.indexOf('\n  }\n', at)
  const method = SRC.slice(at, endRel > at ? endRel : at + 6000)

  it('方法体已取到（防止切片漂移导致断言空转）', () => {
    expect(at).toBeGreaterThan(-1)
    expect(method.length).toBeGreaterThan(500)
    expect(method).toMatch(/areaBackgroundSizing\(bgFigmaBox, parentDims, mapping\)/)
  })

  it('B1：几何段不再产生 repeat-x / repeat-y 值（注释里提到不算命中）', () => {
    expect(method).not.toMatch(/backgroundRepeat:\s*['"]repeat-x['"]/)
    expect(method).not.toMatch(/backgroundRepeat:\s*['"]repeat-y['"]/)
    // 值字面量整体清零：防止「条件删了但出口还在」这类半吊子状态
    expect(method).not.toMatch(/['"]repeat-x['"]/)
    expect(method).not.toMatch(/['"]repeat-y['"]/)
    // 正向锚：删掉的注释仍在（说明是有意删除而非误删整段）
    expect(method).toMatch(/刀 B1/)
  })

  it('B2：四处出口（近等 / 小图标 / 大图 / 通用兜底）全部改调 areaBackgroundSizing', () => {
    const calls = method.match(/return areaBackgroundSizing\(bgFigmaBox, parentDims, mapping\)/g) || []
    expect(calls).toHaveLength(4)
  })

  it('B2：几何段不再产生 contain / cover，唯一 `cover` 是无几何早退', () => {
    expect(method).not.toMatch(/backgroundSize: 'contain'/)
    // 仅 `:2723-2725` 那条「缺尺寸 ⇒ cover/center」保留（零证据下不拉伸）
    expect(method.match(/backgroundSize: 'cover'/g) || []).toHaveLength(1)
    expect(method).toMatch(/if\s*\(!bgW \|\| !bgH \|\| !pW \|\| !pH\)\s*\{/)
  })

  it('B2 保留：四个 100% auto / auto 100% 贴边出口 + 一条 100% auto/auto 100% 裁剪分支', () => {
    // 贴边语义面积口径给不出等价表达 ⇒ 明确保留（`:2748-2804` 区间的 4 个分支）
    expect(method.match(/backgroundSize: '100% auto'/g) || []).toHaveLength(3)
    expect(method.match(/backgroundSize: 'auto 100%'/g) || []).toHaveLength(3)
  })

  it('刀 A 真值早退仍在 B1/B2 之前（顺序不可倒，否则真值永不可达）', () => {
    const t = method.indexOf('sizingFromScaleMode(mapping, bgFigmaBox, parentDims)')
    const g = method.indexOf('const wR = bgW / pW')
    expect(t).toBeGreaterThan(-1)
    expect(g).toBeGreaterThan(-1)
    expect(t).toBeLessThan(g)
  })
})
