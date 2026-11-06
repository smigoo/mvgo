/**
 * 🛡️ 2026-11-05 治本（c-traffic-monitor-de627a9d 实锤）：背景 size 判据单测。
 *
 * 背景：Figma IMAGE fill 的 `scaleMode` 此前全链路未提取（76/76 条样本无该字段），
 *   `background-size` 只能靠几何覆盖比推断 ⇒ 无法表达「保形填充」：
 *   - FILL（保持比例填满、溢出裁切）≈ CSS `cover`：容器尺寸变化时**自适应且不变形**
 *   - FIT ≈ `contain`；STRETCH = `100% 100%`（会变形，仅设计本意如此时才对）；TILE = repeat
 *
 * 判据单一来源：`sizeFromScaleMode`（纯函数），inferBackground* 三门消费它。
 */
import {
  sizeFromScaleMode,
  inferBackgroundSize,
  inferBackgroundRepeat,
  inferBackgroundStyle,
  sizingFromScaleMode,
  areaBackgroundSizing,
} from './background-size-inference.js'

describe('background-size-inference（scaleMode 权威 + 几何回落）', () => {
  // 08:19 真实形态：bg 420×807 落在 425.83×807 容器（覆盖比 0.986 ≥ 0.9）
  const box = { figmaBox: { x: 15.8, y: 109, width: 420, height: 807 }, parentBox: { x: 10, y: 109, width: 425.83, height: 807 } }

  it('FILL → cover（保形自适应，容器变化不变形）', () => {
    expect(sizeFromScaleMode({ imageScaleMode: 'FILL' })).toEqual({ size: 'cover', repeat: 'no-repeat', inferredBy: 'scaleMode' })
    const r = inferBackgroundStyle({ ...box, imageScaleMode: 'FILL' })
    expect(r.size).toBe('cover')
    expect(r.repeat).toBe('no-repeat')
    expect(r.inferredBy).toBe('scaleMode')
    expect(r.cover).toBe(false) // cover≠100% 100%，不触发 shorthand 省略
  })

  it('FIT → contain', () => {
    const r = inferBackgroundStyle({ ...box, imageScaleMode: 'FIT' })
    expect(r.size).toBe('contain')
    expect(r.repeat).toBe('no-repeat')
  })

  it('STRETCH → 100% 100%（唯一会变形的模式，且只在真值确实如此时使用）', () => {
    // 注意：本 fixture 的 coverage = 420×807 / (425.83×807) = 0.986 ≥ 0.9，即「图节点≈容器」，
    // 此时 STRETCH 才等价于铺满。局部场景见下一条用例（D2 回归防线）。
    const r = inferBackgroundStyle({ ...box, imageScaleMode: 'STRETCH' })
    expect(r.size).toBe('100% 100%')
    expect(r.cover).toBe(true) // 100% 100% 铺满：position 归零，避免露白边
    expect(r.position).toBe('0px 0px')
  })

  it('🔴 STRETCH + 图节点只是容器局部（coverage<0.9）⇒ 必须用比例口径（🧬刀70 T4），禁止拉满', () => {
    // 2026-11-05 D2 治本回归防线 · c-aiot-dpjh-bsjd-09636315 实锤：
    // 卡 470×72，其顶部装饰带 `image 313` 为 459×29 @ 相对 y=0（coverage=0.393）。
    // 旧行为：scaleMode=STRETCH 无条件 → `100% 100%` ⇒ 29px 带子被拉伸 2.48 倍铺满整卡，
    //        激活卡 `#a6ceff` 与非激活卡 `rgba(255,255,255,0.43)` 的底色差异被完全盖住
    //        ⇒ 用户「每个 list 都出现 image_313-5800、应该激活才有」。
    const r = inferBackgroundStyle({
      imageScaleMode: 'STRETCH',
      figmaBox: { x: 6, y: 0, width: 459, height: 29 },
      parentBox: { x: 0, y: 0, width: 470, height: 72 },
    })
    // 🧬 刀70 T4：百分比口径（相对 parentBox），容器弹性时等比跟随；与实现同公式计算期望
    const sw = ((459 / 470) * 100).toFixed(2)
    const sh = ((29 / 72) * 100).toFixed(2)
    expect(r.size).toBe(`${sw}% ${sh}%`)
    expect(r.cover).toBe(false)
    const gapX = 470 * (1 - parseFloat(sw) / 100)
    expect(r.position).toBe(`${((6 / gapX) * 100).toFixed(2)}% 0px`)
    expect(r.repeat).toBe('no-repeat')
    // 来源仍必须是 scaleMode（不得因走了几何尺寸就降级为 geometry，否则来源分布失真）
    expect(r.inferredBy).toBe('scaleMode')
  })

  it('🔴 STRETCH 保形模式不受影响：FILL/FIT/TILE 与容器覆盖率无关', () => {
    const local = {
      figmaBox: { x: 6, y: 0, width: 459, height: 29 },
      parentBox: { x: 0, y: 0, width: 470, height: 72 },
    }
    // cover / contain 是保形语义，即便图节点是局部也必须保持（与容器尺寸无关）
    expect(inferBackgroundStyle({ ...local, imageScaleMode: 'FILL' }).size).toBe('cover')
    expect(inferBackgroundStyle({ ...local, imageScaleMode: 'FIT' }).size).toBe('contain')
    expect(inferBackgroundStyle({ ...local, imageScaleMode: 'TILE' }).size).toBe('auto')
  })

  it('TILE → auto + repeat', () => {
    const r = inferBackgroundStyle({ ...box, imageScaleMode: 'TILE' })
    expect(r.size).toBe('auto')
    expect(r.repeat).toBe('repeat')
    expect(inferBackgroundRepeat({ imageScaleMode: 'TILE' })).toBe('repeat')
  })

  it('CROP 视同 FILL（Figma 裁切填充）', () => {
    expect(sizeFromScaleMode({ imageScaleMode: 'CROP' })?.size).toBe('cover')
  })

  it('scaleMode 缺失 → 回落几何推断，且与旧行为逐字段一致（零回归）', () => {
    const r = inferBackgroundStyle(box)
    expect(r.inferredBy).toBe('geometry')
    // 覆盖比 0.986 ≥ 0.9 → 100% 100%（旧规则）
    expect(r.size).toBe('100% 100%')
    expect(r.cover).toBe(true)
    // 局部小图 → 🧬刀70 T4 比例口径（有 parentBox）；与实现同公式计算期望
    const small = inferBackgroundStyle({
      figmaBox: { x: 5, y: 3, width: 78, height: 21 },
      parentBox: { x: 0, y: 0, width: 295, height: 27 },
    })
    expect(small.inferredBy).toBe('geometry')
    const ssw = ((78 / 295) * 100).toFixed(2)
    const ssh = ((21 / 27) * 100).toFixed(2)
    expect(small.size).toBe(`${ssw}% ${ssh}%`)
    expect(small.repeat).toBe('no-repeat') // 维度约束：21/27=0.78>0.5
  })

  it('未知 scaleMode 字符串 → 回落几何（不误判）', () => {
    expect(sizeFromScaleMode({ imageScaleMode: 'WEIRD' })).toBeNull()
    expect(inferBackgroundSize({ ...box, imageScaleMode: 'WEIRD' }).inferredBy).toBe('geometry')
  })
})


describe('3b-A：sub-state 的 parentBox ≠ DOM 状态子项时回落 px', () => {
  const tabState = {
    bgRole: 'sub-state',
    mountTarget: 'tabs-list',
    figmaBox: { x: 1500, y: 906, width: 78, height: 21 },
    parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  }

  it('⭐ 5bf49590 真机同构：78×21 / 295×27 不再写成 26.44% 77.78%', () => {
    const mapping: any = { ...tabState }
    const r = inferBackgroundStyle(mapping)
    expect(r.size).toBe('78px 21px')
    expect(r.position).toBe('5px 3px')
    expect(r.repeat).toBe('no-repeat')
    expect(r.percentFallback).toBe('sub-state-mount-container')
    expect(mapping.backgroundPercentFallback).toBe('sub-state-mount-container')
  })

  it('scaleMode 入口同源：STRETCH 局部状态图也回落真实像素与偏移', () => {
    const mapping: any = {
      ...tabState,
      imageScaleMode: 'STRETCH',
      figmaBox: { x: 6, y: 0, width: 459, height: 29 },
      parentBox: { x: 0, y: 0, width: 470, height: 72 },
    }
    expect(sizingFromScaleMode(mapping)).toEqual({
      backgroundSize: '459px 29px',
      backgroundPosition: '6px 0px',
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
    })
  })

  it('面积几何入口同源：调用方缺覆盖盒时仍读取 mapping 并回落 px', () => {
    const mapping: any = {
      bgRole: 'sub-state',
      figmaBox: { x: 6, y: 16, width: 27, height: 32 },
      parentBox: { x: 0, y: 0, width: 117, height: 64 },
    }
    const r = areaBackgroundSizing(null, null, mapping)
    expect(r.backgroundSize).toBe('27px 32px')
    expect(r.backgroundPosition).toBe('6px 16px')
    expect(mapping.backgroundPercentFallback).toBe('sub-state-mount-container')
  })

  it('阴性：普通局部容器没有 sub-state 反证，继续使用刀70 百分比', () => {
    const r = inferBackgroundStyle({ ...tabState, bgRole: 'container' })
    expect(r.size).toBe(expectPctSize(78, 21, 295, 27))
    expect(r.position).toBe(expectPctPos(5, 3, 295, 27, 26.44, 77.78))
    expect(r.percentFallback).toBeNull()
  })

  it('阴性：sub-state 满铺仍 100% 100%；冻结 mapping 也能回落且不写回', () => {
    const full: any = {
      bgRole: 'sub-state',
      figmaBox: { x: 0, y: 0, width: 100, height: 40 },
      parentBox: { x: 0, y: 0, width: 100, height: 40 },
    }
    expect(inferBackgroundStyle(full).size).toBe('100% 100%')
    expect(full.backgroundPercentFallback).toBeUndefined()

    const frozen: any = Object.freeze({ ...tabState })
    const r = inferBackgroundStyle(frozen)
    expect(r.size).toBe('78px 21px')
    expect(r.percentFallback).toBeNull()
    expect(frozen.backgroundPercentFallback).toBeUndefined()
  })
})

// 🧬 刀70 T4：与 background-size-inference.js 同公式的期望值计算（改验不同正则：断言值由独立公式推导）
function expectPctSize(bw: number, bh: number, pw: number, ph: number) {
  return `${((bw / pw) * 100).toFixed(2)}% ${((bh / ph) * 100).toFixed(2)}%`
}
function expectPctPos(dx: number, dy: number, pw: number, ph: number, sw: number, sh: number) {
  // 镜像实现语义：偏移 0 → '0px'（percentOffsetFrom 边界分支）
  const gx = dx === 0 ? '0px' : `${(dx / (pw * (1 - sw / 100)) * 100).toFixed(2)}%`
  const gy = dy === 0 ? '0px' : `${(dy / (ph * (1 - sh / 100)) * 100).toFixed(2)}%`
  return `${gx} ${gy}`
}

/**
 * 🛡️ R3-bg 刀 A（2026-11-05）：`sizingFromScaleMode` —— 视觉解析层（`visual-parser._calculateBackgroundSizing`）
 * 复用同一真值实现，两套几何口径在「有 scaleMode」时结论不再分叉。
 *
 * 为什么单独立测：`_calculateBackgroundSizing` 是**轴向比值**口径，本文件是**面积覆盖比**口径，
 * 对同一资源可以给出不同结论（语料实测 73.5% 分歧）。这里锁三件事：
 *   ① 无真值必须返回 `null` ⇒ 调用方走旧分支，几何兜底零回归；
 *   ② STRETCH 必须复刻 coverage 守卫 ⇒ 否则 D2 治本（局部装饰带被拉满整卡）在视觉解析层被重造；
 *   ③ position 的三条语义分支（保形居中 / TILE 左上原点 / 像素回退取真实偏移）。
 *
 * 夹具坐标全部取自 `data/tasks.json` 真机条目。
 */
describe('sizingFromScaleMode —— 背景四件套真值裁决（R3-bg 刀 A）', () => {
  // 实锤 ①：卡顶装饰带 image_313（48:5800，D2 治本原案）459×29@(20837,51606) / 470×72@(20831,51606)，cov 0.393
  const deco = {
    imageScaleMode: 'STRETCH',
    figmaBox: { x: 20837, y: 51606, width: 459, height: 29 },
    parentBox: { x: 20831, y: 51606, width: 470, height: 72 },
  }
  // 实锤 ②：48px 图标（2:8049）47.52×47.52@(169.52,1004) / 120×74.2@(166,984)，cov 0.254 ⇒ 旧几何口径给 cover（图标变巨图）
  const icon = {
    imageScaleMode: 'STRETCH',
    figmaBox: { x: 169.5205078125, y: 1004, width: 47.52000045776367, height: 47.52000045776367 },
    parentBox: { x: 166, y: 984, width: 120, height: 74.1953125 },
  }
  // 图节点 ≈ 父容器（cov 0.986）
  const full = {
    imageScaleMode: 'STRETCH',
    figmaBox: { x: 15.8, y: 109, width: 420, height: 807 },
    parentBox: { x: 10, y: 109, width: 425.83, height: 807 },
  }

  it('无 scaleMode ⇒ null（调用方回落几何，零回归契约）', () => {
    expect(sizingFromScaleMode(null)).toBeNull()
    expect(sizingFromScaleMode({})).toBeNull()
    expect(sizingFromScaleMode({ figmaBox: { width: 10, height: 10 } })).toBeNull()
    expect(sizingFromScaleMode({ imageScaleMode: 'WEIRD', figmaBox: { width: 10, height: 10 } })).toBeNull()
  })

  it('STRETCH + cov < 0.9 ⇒ 图片实际像素 + 真实偏移（D2 守卫不被重造）', () => {
    const decoSize = expectPctSize(459, 29, 470, 72)
    const decoSw = parseFloat(decoSize.split('%')[0])
    const decoSh = parseFloat(decoSize.split('%')[1])
    expect(sizingFromScaleMode(deco)).toEqual({
      backgroundSize: decoSize,
      backgroundPosition: expectPctPos(6, 0, 470, 72, decoSw, decoSh),
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
    })
    // 旧几何口径对这条给 cover（47.52/120=0.396、47.52/74.2=0.641 落进 cover 兜底）⇒ 图标被放大铺满
    // 🧬刀70 T4：百分比口径用 Figma 原始真值（47.52×47.52 @ 120×74.195），不做取整
    const iconSize = expectPctSize(47.52, 47.52, 120, 74.1953125)
    const iconSw = parseFloat(iconSize.split('%')[0])
    const iconSh = parseFloat(iconSize.split('%')[1])
    expect(sizingFromScaleMode(icon)).toEqual({
      backgroundSize: iconSize,
      backgroundPosition: expectPctPos(4, 20, 120, 74.1953125, iconSw, iconSh),
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
    })
  })

  it('STRETCH + cov ≥ 0.9 ⇒ 100% 100% + 居中（图≈容器时与旧结论一致）', () => {
    const r = sizingFromScaleMode(full)
    expect(r.backgroundSize).toBe('100% 100%')
    expect(r.backgroundPosition).toBe('center center')
    expect(r.needsOverflowHidden).toBe(false)
  })

  it('FILL / CROP ⇒ cover + 居中 + 需裁切（保形自适应）', () => {
    for (const sm of ['FILL', 'CROP']) {
      expect(sizingFromScaleMode({ ...full, imageScaleMode: sm })).toEqual({
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        needsOverflowHidden: true,
      })
    }
  })

  it('FIT ⇒ contain + 居中（完整装入，不裁切）', () => {
    expect(sizingFromScaleMode({ ...full, imageScaleMode: 'FIT' })).toEqual({
      backgroundSize: 'contain',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat',
      needsOverflowHidden: false,
    })
  })

  it('TILE ⇒ auto + repeat + 左上原点（平铺语义，不居中）', () => {
    expect(sizingFromScaleMode({ ...full, imageScaleMode: 'TILE' })).toEqual({
      backgroundSize: 'auto',
      backgroundPosition: '0px 0px',
      backgroundRepeat: 'repeat',
      needsOverflowHidden: false,
    })
  })

  it('mapping 缺坐标时用「轴向比积」代理 coverage（不含伪精度）', () => {
    // 只有 scaleMode、无 figmaBox/parentBox ⇒ 由调用方传入的尺寸算代理覆盖比
    const r = sizingFromScaleMode({ imageScaleMode: 'STRETCH' }, { width: 459, height: 29 }, { width: 470, height: 72 })
    expect(r.backgroundSize).toBe(expectPctSize(459, 29, 470, 72)) // 🧬刀70 T4 比例口径；代理 cov 0.393 < 0.9
    expect(r.backgroundPosition).toBe('0px 0px') // 无偏移可算 ⇒ 原点
    // 调用方尺寸与容器一致 ⇒ 代理 cov = 1 ⇒ 铺满
    expect(sizingFromScaleMode({ imageScaleMode: 'STRETCH' }, { width: 470, height: 72 }, { width: 470, height: 72 }).backgroundSize)
      .toBe('100% 100%')
  })

  it('调用方手上的尺寸优先于 mapping 内的同名字段', () => {
    // mapping.figmaBox 是 459×29（cov 0.393），但调用方确认背景就是整框 ⇒ 以调用方为准
    const r = sizingFromScaleMode(deco, { width: 470, height: 72 }, { width: 470, height: 72 })
    expect(r.backgroundSize).toBe('100% 100%')
  })
})

/**
 * 🛡️ R3-bg 刀 B2（2026-11-05）：`areaBackgroundSizing` —— 面积口径的几何裁决（唯一实现）。
 *
 * 为什么单独立测：`visual-parser._calculateBackgroundSizing` 的新版几何段在三处出口
 * （近等 / 小图标 / 大图+兜底）改调本函数，而 `VisualParser` 继承的 `BaseAgent`
 * 在 jest(CJS) 下不可 import（`fileURLToPath(import.meta.url)`）⇒ 只能直接测纯函数。
 *
 * 锁四件事：
 *   ① `cov ≥ 0.9` ⇒ `100% 100%`（含边界 0.9，与 `inferBackgroundSize` 同口径）；
 *   ② 语料实锤两条（27×32/117×64、16×16/388×30）必须落「图实际像素 + 真实偏移」；
 *   ③ 真·无几何 ⇒ `cover`（旧行为逐字保留，不做无证据的拉伸）；
 *   ④ 永远 `no-repeat`（平铺只有 Figma `TILE` 真值才有资格 —— 刀 B1）。
 */
describe('areaBackgroundSizing —— 面积口径几何裁决（R3-bg 刀 B2）', () => {
  it('cov ≥ 0.9 ⇒ 100% 100% + 居中 + 不裁切（位置归零，避免露白边）', () => {
    const r = areaBackgroundSizing(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    )
    expect(r.backgroundSize).toBe('100% 100%')
    expect(r.backgroundPosition).toBe('center center')
    expect(r.backgroundRepeat).toBe('no-repeat')
    expect(r.needsOverflowHidden).toBe(false)
    expect(r.coverage).toBe(1)
  })

  it('边界：cov 恰好 = COVER_RATIO(0.9) ⇒ 铺满（与 inferBackgroundSize 同阈值）', () => {
    // 90% 覆盖率：图 90×100 落在 100×100 容器（无偏移）⇒ cov = 0.9
    const r = areaBackgroundSizing(
      { x: 0, y: 0, width: 90, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    )
    expect(r.backgroundSize).toBe('100% 100%')
    expect(r.coverage).toBeCloseTo(0.9, 6)
  })

  it('🔴 语料实锤 A：27×32 挂 117×64 ⇒ 27px 32px + 真实偏移（不再被 cover 放大 4.3 倍）', () => {
    // 旧轴向口径：wR=0.231、hR **恰好** 0.5（`hR < 0.5` 不成立）⇒ 落兜底 `cover`
    // ⇒ 27px 图标被放大到 117×64 并裁切。cov = 27×32/(117×64) = 0.115。
    const r = areaBackgroundSizing(
      { x: 6, y: 16, width: 27, height: 32 },
      { x: 0, y: 0, width: 117, height: 64 },
    )
    expect(r.backgroundSize).toBe(expectPctSize(27, 32, 117, 64)) // 🧬刀70 T4
    expect(r.backgroundPosition).toBe(expectPctPos(6, 16, 117, 64, 23.08, 50.00))
    expect(r.backgroundRepeat).toBe('no-repeat')
    expect(r.needsOverflowHidden).toBe(false)
  })

  it('🔴 语料实锤 B：16×16 挂 388×30 ⇒ 16px 16px + 真实偏移（旧落 cover）', () => {
    // 旧轴向口径：wR=0.041、hR=0.533 ⇒ 小图标出口不命中（hR>0.5），落兜底 `cover`。
    const r = areaBackgroundSizing(
      { x: 83, y: 4, width: 16, height: 16 },
      { x: 0, y: 0, width: 388, height: 30 },
    )
    expect(r.backgroundSize).toBe(expectPctSize(16, 16, 388, 30)) // 🧬刀70 T4
    expect(r.backgroundPosition).toBe(expectPctPos(83, 4, 388, 30, 4.12, 53.33))
  })

  it('小图标（旧判 contain 的那批）⇒ 图实际像素，保形语义不再被一维比例伪造', () => {
    const r = areaBackgroundSizing(
      { x: 18, y: 8, width: 8, height: 8 },
      { x: 0, y: 0, width: 388, height: 30 },
    )
    expect(r.backgroundSize).toBe(expectPctSize(8, 8, 388, 30)) // 🧬刀70 T4
    expect(r.backgroundPosition).toBe(expectPctPos(18, 8, 388, 30, 2.06, 26.67))
  })

  it('cov < 0.9 且无偏移可算（只给尺寸）⇒ 位置回落 0px 0px', () => {
    const r = areaBackgroundSizing({ width: 27, height: 32 }, { width: 117, height: 64 })
    expect(r.backgroundSize).toBe(expectPctSize(27, 32, 117, 64)) // 🧬刀70 T4
    expect(r.backgroundPosition).toBe('0px 0px')
  })

  it('真·无几何 ⇒ cover（旧行为逐字保留；不改成 100% 100% —— 零证据下不做拉伸）', () => {
    expect(areaBackgroundSizing(null, null, null).backgroundSize).toBe('cover')
    expect(areaBackgroundSizing({}, {}, {}).backgroundSize).toBe('cover')
    expect(areaBackgroundSizing(null, null, null).needsOverflowHidden).toBe(false)
  })

  it('两个 box 都缺时取 mapping 内同名字段兜底', () => {
    const mapping = {
      figmaBox: { x: 6, y: 16, width: 27, height: 32 },
      parentBox: { x: 0, y: 0, width: 117, height: 64 },
    }
    const r = areaBackgroundSizing(null, null, mapping)
    expect(r.backgroundSize).toBe(expectPctSize(27, 32, 117, 64)) // 🧬刀70 T4
    expect(r.backgroundPosition).toBe(expectPctPos(6, 16, 117, 64, 23.08, 50.00))
  })

  it('无交集 ⇒ cov = 0 ⇒ 图实际像素 + 真实偏移（不被 clamp 成 0,0）', () => {
    const r = areaBackgroundSizing(
      { x: 500, y: 0, width: 20, height: 20 },
      { x: 0, y: 0, width: 100, height: 100 },
    )
    expect(r.backgroundSize).toBe('20px 20px')
    expect(r.backgroundPosition).toBe('500px 0px')
    expect(r.coverage).toBe(0)
  })

  it('纯函数：不改写入参、重复调用结果一致（幂等）', () => {
    const fb = { x: 6, y: 16, width: 27, height: 32 }
    const pb = { x: 0, y: 0, width: 117, height: 64 }
    const snapFb = JSON.stringify(fb)
    const snapPb = JSON.stringify(pb)
    const a = areaBackgroundSizing(fb, pb)
    const b = areaBackgroundSizing(fb, pb)
    expect(a).toEqual(b)
    expect(JSON.stringify(fb)).toBe(snapFb)
    expect(JSON.stringify(pb)).toBe(snapPb)
    expect(Object.isFrozen(fb)).toBe(false)
  })

  it('永远 no-repeat：几何路径不产生 repeat-x / repeat-y / repeat（刀 B1）', () => {
    const cases = [
      [{ x: 0, y: 0, width: 459, height: 29 }, { x: 0, y: 0, width: 470, height: 72 }], // 细长横条
      [{ x: 0, y: 0, width: 21, height: 78 }, { x: 0, y: 0, width: 295, height: 80 }], // 细长竖条
      [{ x: 0, y: 0, width: 8, height: 8 }, { x: 0, y: 0, width: 388, height: 30 }], // 小图标
      [{ x: 0, y: 0, width: 600, height: 600 }, { x: 0, y: 0, width: 100, height: 100 }], // 大图
    ]
    for (const [fb, pb] of cases) {
      expect(areaBackgroundSizing(fb, pb).backgroundRepeat).toBe('no-repeat')
    }
  })
})

