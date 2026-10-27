/**
 * 方向真值三态对照 spec —— 用**视觉裁判**的真值给产线方向度量上锁（2026-10-27）
 *
 * ## 这一刀要解决什么
 *
 * `ratio = sideBySide / C(N,2)` 是**成对计数**度量：一条全宽矩形 / 分隔线会与每个兄弟
 * 都配不上 ⇒ 分子平方级损失、分母不变 ⇒ `confidence` 被系统性压低到 `low`。
 * 我一度想把它换成「行/列带聚类」（`decideByBands`），并用 `layoutMode` 当裁判，
 * 得到 `bands 100% > 旧 97.83%` —— **差点又是一次假绿**：
 * 有 `layoutMode` 的 2164 个容器里 `low` 样本为 **0**，而 777 个 `low` 全在无 `layoutMode`
 * 的 GROUP 里 ⇒ **机器裁判对真问题区完全失明**（「裁判与被测对象同分布」检查救回这一刀）。
 *
 * ⇒ 换用**视觉裁判**（设计稿截图局部裁剪目视判读），覆盖的正是 `low` 这批。
 * 结果（本 spec 的断言把结论钉死）：
 *   · 产线旧度量（`06ed935` 之后）：20/22 = **90.9%**
 *   · 行/列带聚类： 2/22 = **9.1%**（把 row 判成 grid、把 column 判成 grid 是主要错法）
 * ⇒ **bands 度量为废案**，生产度量保持不动。这一刀不产出代码改动，产出的是「不许再换」的证据。
 *
 * ## 三态对照（缺任何一态都可能恒绿）
 *
 * 1. **阳性**：22 个可判样本，产线预测 == 视觉真值。
 * 2. **阴性**：把 bbox 的 x↔y / w↔h 全部转置（等同于把整张图绕对角线翻面），
 *    方向类**必须整体反向**（`row ⇄ column`，`grid` 保持 `grid`）；
 *    刀 5 引入 2 个**有意的轴不对称**例外（`2:3438` / `2:3446`，见用例注释）。
 *    这一态挡的是「度量其实没看几何、只是把训练时的答案背下来」。
 * 3. **变异**：故意把真值表整体写反，记分**必须从 22 掉到 1**（唯一残留是 grid 不变量）。
 *    这一态挡的是「断言写错了但恰好恒真」（比如把 `expected` 写成变量自身）。
 *
 * ## 刀 5（同日紧接）：宽容器真纵排
 *
 * 视觉裁判暴露的不是「度量方向错了」，而是 **`low` 兜底闸漏了一类容器**：
 * `2:3438`（387×142）与 `2:3446`（192×114）都是「标题带在上 + 内容带在下」，
 * `ratio` 本来就 < 0.5（几何判 column），只因容器是**宽**的（`tallContainer` 不成立）
 * 就被兜底翻成 row。给闸补第三条事实「内容真的堆成 ≥2 条带」（`hasStackedContentBands`）
 * 之后 **22/22 = 100%**；全语料爆炸半径实测 **95 个容器 / 3 种结构，翻 57 个**
 * （`2:3438`×19 + `2:3446`×38），`2:8419` 那 38 个 header 一位不动。
 *
 * ⚠️ 首轮在 4×6 对照图上判读时把 `2:3446` 判成了 row；逐张看 3× 放大裁剪才纠正。
 *    ⇒ 对照图只用于初筛，**定稿必须逐张看放大图**。
 */
import { decideLayoutForBoxes } from '../figma-node-layout-facts'
import {
  DIRECTION_TRUTH_CASES,
  type DirectionTruthCase,
  type DirectionTruth,
} from './fixtures/direction-truth-cases'

/** fixture 的扁平 bbox 元组 → 产线入参（与 `buildNodeLayoutFacts` 同口径：不带 `type`） */
const toBoxes = (c: DirectionTruthCase) =>
  c.kids.map(([x, y, width, height], i) => ({
    id: `${c.id}#${i}`,
    absoluteBoundingBox: { x, y, width, height },
  }))

const toParent = (c: DirectionTruthCase) => {
  const [x, y, width, height] = c.parent
  return { x, y, width, height }
}

const runMetric = (c: DirectionTruthCase) =>
  decideLayoutForBoxes(toBoxes(c), toParent(c))

/** 方向类（只取 row / column / grid，忽略 gridColumns —— 见文件尾「列数未校验」说明） */
const predict = (c: DirectionTruthCase): DirectionTruth | null => {
  const r = runMetric(c)
  if (!r) return null
  return r.display === 'grid' ? 'grid' : (r.flexDirection as 'row' | 'column')
}

/** 转置：x↔y、width↔height（父框一起转）—— 几何上等价于把整张设计图绕对角线翻面 */
const transpose = (c: DirectionTruthCase): DirectionTruthCase => {
  const [px, py, pw, ph] = c.parent
  return {
    ...c,
    parent: [py, px, ph, pw],
    kids: c.kids.map(([x, y, w, h]) => [y, x, h, w] as [number, number, number, number]),
  }
}

/** 真值类别的「反向」：row ⇄ column；grid 是转置不变量 */
const flipDir = (d: DirectionTruth) => (d === 'row' ? 'column' : d === 'column' ? 'row' : d)

const JUDGED = DIRECTION_TRUTH_CASES.filter((c) => c.truth !== '?')
const ABSTAINED = DIRECTION_TRUTH_CASES.filter((c) => c.truth === '?')

/**
 * 记分器：拿「任意一张真值表」给产线度量打分。
 * 单独抽成函数是为了让变异对照能喂一张**错的真值表**进来，证明记分器真的会转红。
 */
function score(truthOf: (c: DirectionTruthCase) => DirectionTruth) {
  let ok = 0
  const details: string[] = []
  let total = 0
  for (const c of DIRECTION_TRUTH_CASES) {
    const t = truthOf(c)
    if (t === '?') continue
    total += 1
    const p = predict(c)
    if (p === t) ok += 1
    else details.push(`${c.id}: 预测=${p ?? 'null'} 真值=${t}`)
  }
  return { ok, total, details }
}

describe('方向真值 fixture 自身的完整性', () => {
  it('24 例 = 21 可判 + 1 已知缺陷 + 2 弃权，且没有重复 id', () => {
    expect(DIRECTION_TRUTH_CASES).toHaveLength(24)
    expect(JUDGED).toHaveLength(22)
    expect(ABSTAINED).toHaveLength(2)
    expect(ABSTAINED.map((c) => c.id).sort()).toEqual(['2:8798', '2:8817'])

    const ids = DIRECTION_TRUTH_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)

    // 6 个前几轮已人工确证的锚点必须在场（防止有人「优化」样本时把硬骨头剔掉）
    for (const anchor of ['565:3', '48:5801', '801:3', '81:7', '807:2', '2:8419']) {
      expect(ids).toContain(anchor)
    }
  })

  it('每个 case 至少 2 个子项、bbox 全部为正数（否则定向判据无意义）', () => {
    for (const c of DIRECTION_TRUTH_CASES) {
      expect(c.kids.length).toBeGreaterThanOrEqual(2)
      expect(c.parent[2]).toBeGreaterThan(0)
      expect(c.parent[3]).toBeGreaterThan(0)
      for (const [, , w, h] of c.kids) {
        expect(w).toBeGreaterThan(0)
        expect(h).toBeGreaterThan(0)
      }
    }
  })
})

describe('阳性对照：产线方向度量 vs 视觉真值', () => {
  it('22 个可判样本全部命中（锚点 6 个在内）', () => {
    const misses = JUDGED.filter((c) => predict(c) !== c.truth)
    expect(misses.map((c) => `${c.id}: 预测=${predict(c)} 真值=${c.truth}`)).toEqual([])
    expect(JUDGED).toHaveLength(22)
  })

  it('low 置信样本占绝大多数 —— 这正是本 fixture 存在的理由', () => {
    const lowCount = JUDGED.filter((c) => runMetric(c)?.confidence === 'low').length
    // 若哪天这条跌下来，说明产线 confidence 口径变了，整份 fixture 的取样前提要重审
    expect(lowCount).toBeGreaterThanOrEqual(15)
  })

  it('锚点 807:2：low 置信 + 高容器 ⇒ 走「容器高>宽」这条事实判 column', () => {
    const c = DIRECTION_TRUTH_CASES.find((x) => x.id === '807:2')!
    const r = runMetric(c)!
    expect(r.confidence).toBe('low')
    expect(r.flexDirection).toBe('column')
    expect(c.parent[3]).toBeGreaterThan(c.parent[2])
  })

  // ── 刀 5（2026-10-27）：宽容器真纵排 ──
  // 这两例都是「标题带在上 + 内容带在下」，`ratio` 本来就 < 0.5（几何判 column），
  // 仅因容器是宽的而被 low 兜底翻成 row。现在由「内容堆成 ≥2 条带」这条事实救回。
  it.each(['2:3438', '2:3446'])(
    '刀 5 · %s：宽容器真纵排 ⇒ column（不是靠高>宽）',
    (id) => {
      const c = DIRECTION_TRUTH_CASES.find((x) => x.id === id)!
      const r = runMetric(c)!
      expect(r.confidence).toBe('low')
      expect(c.parent[3]).toBeLessThan(c.parent[2]) // 是宽容器 ⇒ 旧闸不覆盖
      expect(r.flexDirection).toBe('column')
    },
  )

  it('刀 5 不误伤：388×30 的 header（2:8419）没有第二条内容带 ⇒ 仍 row', () => {
    const c = DIRECTION_TRUTH_CASES.find((x) => x.id === '2:8419')!
    const r = runMetric(c)!
    expect(r.confidence).toBe('low')
    expect(r.flexDirection).toBe('row')
    // 它的「第二条带」只有 6px 下划线（占父高 27%），过不了 ≥50% 的厚度门槛
    expect(c.parent[3]).toBeLessThan(c.parent[2])
  })
})

describe('阴性对照：bbox 转置后方向必须整体反向', () => {
  // 🔴 两个已知例外（刀 5 引入的**有意轴不对称**，不是漏判）：
  //   2:3438 / 2:3446 转置后容器变成「高>宽」⇒ 走 tallContainer 这条事实仍判 column，
  //   而按转置后的几何真值应为 row。原因是刀 5 的证据只看 **y 向带**（纵向堆叠），
  //   加上 tallContainer 本身也是 y 向假设 ⇒ 这一对事实在 x/y 上不同构。
  //   留着它、并且**用名字钉住**，比偷偷把这 2 例排除掉更诚实：一旦第三方改动让它们开始
  //   正常反转，这条断言会红，逼人回来重读这段注释、重新做视觉裁判。
  const AXIS_ASYMMETRIC = ['2:3438', '2:3446']

  it('除 2 个已知例外外，每个样本翻转后预测 == flipDir(原预测)', () => {
    const wrong: string[] = []
    for (const c of DIRECTION_TRUTH_CASES) {
      if (AXIS_ASYMMETRIC.includes(c.id)) continue
      const before = predict(c)
      const after = predict(transpose(c))
      if (before === null || after === null) {
        wrong.push(`${c.id}: 转置前后出现 null（${before}→${after}）`)
        continue
      }
      if (after !== flipDir(before)) {
        wrong.push(`${c.id}: 原=${before} 转置=${after} 期望=${flipDir(before)}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('那 2 个例外确实「不反转」，且都是被 tallContainer 接管（钉住不对称的成因）', () => {
    for (const id of AXIS_ASYMMETRIC) {
      const c = DIRECTION_TRUTH_CASES.find((x) => x.id === id)!
      const t = transpose(c)
      expect(predict(t)).toBe(predict(c)) // 不反转
      expect(t.parent[3]).toBeGreaterThan(t.parent[2]) // 转置后变高容器 ⇒ 走 tall 那条
    }
  })

  it('转置后「可判样本对真值的命中数」只剩 1 —— 证明度量真的在读几何', () => {
    const flipped = score((c) => flipDir(c.truth))
    // 22 个可判里只剩 81:7 一个「歪打正着」：grid 是转置不变量，flipDir('grid') 仍是 'grid'。
    expect(flipped.total).toBe(22)
    expect(flipped.ok).toBe(1)
    expect(flipped.details).toHaveLength(21)
    expect(flipped.details.join('\n')).toContain('565:3')
    // grid 样本不在「被转置打错」的名单里 —— 这是 grid 不变量的正确表现，不是漏判
    expect(flipped.details.join('\n')).not.toContain('81:7')
  })

  it('grid 样本 81:7 转置后仍是 grid，但列数变了（不是抄答案）', () => {
    const c = DIRECTION_TRUTH_CASES.find((x) => x.id === '81:7')!
    const a = runMetric(c)!
    const b = runMetric(transpose(c))!
    expect(a.display).toBe('grid')
    expect(b.display).toBe('grid')
    expect(b.gridColumns).not.toBe(a.gridColumns)
  })
})

describe('变异对照：故意写错真值表，记分器必须转红', () => {
  it('真值整体取反 ⇒ ok 从 22 掉到 1（唯一残留是 grid 不变量）', () => {
    const base = score((c) => c.truth)
    expect(base.ok).toBe(22)
    expect(base.total).toBe(22)
    expect(base.details).toEqual([])

    const mutated = score((c) => flipDir(c.truth))
    // 唯一残留 = 81:7（grid 经 flipDir 仍是 grid）
    expect(mutated.ok).toBe(1)
    expect(mutated.ok).toBeLessThan(base.ok)
  })

  it('真值全部填成 grid ⇒ 除了 81:7 全错（记分器不会放水）', () => {
    const allGrid = score(() => 'grid')
    expect(allGrid.ok).toBe(1)
    expect(allGrid.details.some((d) => d.startsWith('81:7'))).toBe(false)
  })

  it('真值全部填成弃权 ⇒ total 为 0（弃权不参与记分，不会凭空凑出通过率）', () => {
    const allAbstain = score(() => '?')
    expect(allAbstain.total).toBe(0)
    expect(allAbstain.ok).toBe(0)
  })
})

/**
 * ✅ `gridColumns` 已核对（2026-10-27 二次复核）：`81:7` 判 4 列是**对的**。
 * 用 3× 放大裁剪数过：一行是「label 值 label 值」= **4 个文本框**，共 6 行 ⇒ 24 个子项 / 4 列。
 * 首轮记录里写的「真值 2 列」是把「label-value 对」当成一列数了，不是缺陷。
 * ⇒ 本 spec 仍不在断言里钉死列数（那是另一条判据线），但**不许再把它记成缺陷**。
 */
