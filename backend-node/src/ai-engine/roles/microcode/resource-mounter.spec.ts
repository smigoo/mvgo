import { fixSectionHeightsForResource, ensureHeaderSlots, injectFailedResourceFallbacks, stripEmptyShellBindings, ensureResourceImportInVue, mountSubStateBackground, findVForItemTag, dedupeBgMultiRefs, healAbsoluteOverlayParents, healStandaloneBgLayers, findTagByClassKeyword, collectMountCandidates, pickBestMountTarget, fixMisplacedContainerOpacity } from './resource-mounter.js'
import { inferComponentPrefix, DETERMINISTIC_ANCHOR_SCORE } from '../../utils/mount-target-scoring.js'

// backend-root.js 是 ESM 风格（const __filename = fileURLToPath(import.meta.url)），
// ts-jest CJS 转换下与模块包装器参数撞名（SyntaxError），logger 链一经加载整个套件即 0 运行。
// 既有惯例（less-compile-gate/section-content-guard 等 30+ spec 同款）：工厂 mock 绕过真实文件。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}))

/**
 * 🛡️ fix-section-heights 规则②：组件根 height:100% 不得改写（2026-09-02 实锤）。
 *
 * 背景：宿主 `.pannel-content` 是 **block 定高容器**（`height: calc(100% - 38px)`，
 * 无 `display:flex`，见 frontend default-panel/index.vue:76-93）。组件根写
 * `height: 100%` 正好生效；但规则② 把「规则体含 display:flex 且含 height:100%」
 * 一律改写为 `flex: 1 1 0`，在非 flex 父容器下 **flex 完全失效** → 根高度退 auto →
 * 内部 `flex:1; min-height:0` 的图表区拿到 0 → **内容整块消失**。
 *
 * 实锤：mc-max-1788280914596-25b10e4d 最早 revision（r-f2dd7c10）根规则是
 * `height: 100%`（预览正常，用户「中途看到过」），最终产物同一选择器被改写成
 * `flex: 1 1 0`（内容消失）。同模式复现于 mc-max-1788280156657-f97fafa8（高度坍塌）
 * 与 mc-max-1788280167414-49dfbe7d。
 *
 * 规则② 的初衷（治内部多 section 各写 height:100% 互相溢出）仍然正确——
 * 内部 section 的父级是组件根（flex 容器），改写成 flex 分配有效。
 * 盲区只在于它分不清「组件根」与「内部 section」。
 */
describe('fixSectionHeightsForResource 规则②：组件根豁免 height:100% 改写', () => {
  const CTX = { path: 'resources/styles/common.less' }

  it('⭐ 组件根选择器（-root 结尾）保留 height:100%，不改写为 flex:1 1 0', () => {
    const input = [
      '.c-env-monitor-root {',
      '  width: 100%;',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('height: 100%')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('防误伤：内部 section（非 root）含 display:flex + height:100% 仍改写为 flex:1 1 0', () => {
    // 规则② 的原始职责必须保留：内部 section 父级是组件根（flex 容器），
    // 各写 height:100% 会互相溢出，改写成 flex 分配是正确行为。
    const input = [
      '.c-env-monitor-chart-section {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    expect(out).not.toContain('height: 100%')
  })

  it('同一文件 root + section 混合：只改 section，保留 root 的 height:100%', () => {
    const input = [
      '.c-monitor-root {',
      '  width: 100%;',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
      '.c-monitor-chart-section {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    // root 保留 height:100%
    const rootBlock = out.match(/\.c-monitor-root \{[^}]*\}/)?.[0] ?? ''
    expect(rootBlock).toContain('height: 100%')
    expect(rootBlock).not.toContain('flex: 1 1 0')
    // section 仍被改写
    const sectionBlock = out.match(/\.c-monitor-chart-section \{[^}]*\}/)?.[0] ?? ''
    expect(sectionBlock).toContain('flex: 1 1 0')
    expect(sectionBlock).not.toContain('height: 100%')
  })

  it('不误豁免：类名含 -rooter 等「-root 非结尾」的选择器仍按普通规则改写', () => {
    // `-root\b` 词边界保证 .c-x-rooter 不被误判为组件根
    const input = [
      '.c-monitor-rooter {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
  })
})

describe('fixSectionHeightsForResource 规则② A4 加权（2026-09-04 实锤 mc-max-1788454423557）', () => {
  // sectionHeights 映射：子组件根 class → Figma 高度 px（真值 65:317，非 50/50 均分）
  const CTX = {
    path: 'package/components/OverviewCards.vue',
    sectionHeights: {
      'c-monitor-overview-cards': 65,
      'c-monitor-device-list': 317,
    },
  }

  it('⭐ 命中映射的 section 根：height:100% → flex: <px> 1 0（非盲注 1 1 0），并补 min-height:0', () => {
    const input = [
      '.c-monitor-overview-cards {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: row;',
      '  gap: 10px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 65 1 0')
    expect(out).toContain('min-height: 0')
    expect(out).not.toContain('flex: 1 1 0')
    expect(out).not.toContain('height: 100%')
  })

  it('⭐ 升级分支：已被盲注 flex: 1 1 0 的存量产物（无 height:100%）改写为真值 px', () => {
    // 25e40782 产物实景：OverviewCards.vue scoped 第一行曾被盲注 flex: 1 1 0 → 50/50 均分
    const input = [
      '.c-monitor-overview-cards {',
      'flex: 1 1 0;',
      '',
      '  display: flex;',
      '  flex-direction: row;',
      '  flex-shrink: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 65 1 0')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('未命中映射的 section 维持旧行为（flex: 1 1 0），映射缺省时完全不变', () => {
    const input = [
      '.c-monitor-other-section {',
      '  height: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    // 有映射但未命中 → 旧行为
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    // 无映射 → 同样旧行为（fail-open）
    const out2 = fixSectionHeightsForResource(input, { path: 'x.less' })
    expect(out2).toContain('flex: 1 1 0')
  })

  it('组件根豁免优先于 A4 加权：-root 类即使碰巧在映射中也不改写', () => {
    const input = [
      '.c-monitor-root {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, {
      path: 'x.vue',
      sectionHeights: { 'c-monitor-root': 425 },
    })
    expect(out).toContain('height: 100%')
    expect(out).not.toContain('flex: 425 1 0')
  })
})

describe('fixSectionHeightsForResource 升级分支治本（2026-09-14 真机 c-traffic-monitor-3147d679）', () => {
  // 🎯 事故：一对 Figma 高度同为 131px 的等高柱状图，vision 自报系数 3.73 / 0.952
  // （3.9 倍失配）被 LLM 直接写进 common.less。旧的升级分支**只认字面量** `flex: 1 1 0`，
  // 遇到已经写错的 `flex: 3.73 1 0` 完全不匹配 → 错误比例原样落盘 → 高度塔状失衡。
  // 治本：命中映射的 section 根类，其 ratio 量级 flex 声明一律改写为权威系数。
  const CTX = {
    path: 'resources/styles/common.less',
    sectionHeights: {
      'c-traffic-monitor-chart-tunnel': 1.327,
      'c-traffic-monitor-chart-bridge': 1.327,
    },
  }

  it('⭐ LLM 写了错误的小数系数 flex: 3.73 1 0 → 改写为权威系数（旧逻辑会因小数不匹配而漏改）', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex-direction: column;',
      '  flex: 3.73 1 0;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1.327 1 0')
    expect(out).not.toContain('3.73')
  })

  it('第二张等高图 0.952 同样被改写（两图最终等高，符合 Figma 真值 131px/131px）', () => {
    const input = [
      '.c-traffic-monitor-chart-bridge {',
      '  display: flex;',
      '  flex-direction: column;',
      '  flex: 0.952 1 0;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1.327 1 0')
    expect(out).not.toContain('0.952')
  })

  it('防误伤：grow=0 的附属区（flex: 0 0 46px）不被改写', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex-direction: column;',
      '  flex: 0 0 46px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 46px')
  })

  it('幂等：改写后再跑一次值不变（重复执行不产生二次漂移）', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex: 3.73 1 0;',
      '}',
    ].join('\n')
    const once = fixSectionHeightsForResource(input, CTX)
    const twice = fixSectionHeightsForResource(once, CTX)
    expect(twice).toBe(once)
  })

  it('🎯 2026-09-15 真机：单值 flex: 1 / 双值 flex: 1 1 简写也改写（旧正则只认三值 → tabs 比例失真）', () => {
    // c-device-monitor-44384241 实锤：.c-device-monitor-tabs-section 的 CSS 是单值 `flex: 1`
    // （等价 flex: 1 1 0）。旧正则只匹配三值 `flex: X Y Z` → tabs grow 保持 1 而非权威系数
    // 1.661 → switch/tab 比例 1:2.95 而非 1:4.9。治本：扩展正则覆盖单/双值，缺省 shrink/basis
    // 按 CSS 规范默认补齐（单值=1 1 0，双值=<grow> <shrink> 0）。
    const single = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex: 1;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const out1 = fixSectionHeightsForResource(single, CTX)
    expect(out1).toContain('flex: 1.327 1 0')

    const double = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex: 1 1;',
      '}',
    ].join('\n')
    const out2 = fixSectionHeightsForResource(double, CTX)
    expect(out2).toContain('flex: 1.327 1 0')
  })
})

describe('fixSectionHeightsForResource 规则⑤ 补 flexGrow / inline-row（2026-09-15 真机 c-traffic-monitor-933cbc4b）', () => {
  // 🎯 事故：LLM 给 section 根只写 width/min-height，不写 display:flex。规则② 因
  // display 门槛整块跳过；规则⑤ 后补 display 却不写 flexGrow → 高度比例恒丢。
  // 治本：规则⑤ 在补完 display 后同步写入 facts.flexGrow（缺则补），规则② 门槛保留。
  const CTX = {
    path: 'resources/styles/common.less',
    sectionLayoutFacts: {
      'c-traffic-monitor-chart-tunnel': {
        flexGrow: 3.73,
        heightPx: 556,
        display: 'flex',
        gridColumns: null,
        flexDirection: 'column',
      },
      'c-traffic-monitor-header': {
        flexGrow: 0.204,
        heightPx: 30,
        display: 'flex',
        gridColumns: null,
        flexDirection: 'row',
      },
    },
  }

  it('⭐ 无 display、无 flex 的 section 根 → 补 display:flex + flex: <grow> 1 0', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  width: 100%;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('display: flex')
    expect(out).toContain('flex-direction: column')
    expect(out).toContain('flex: 3.73 1 0')
    expect(out).toContain('min-height: 0')
  })

  it('已有正确 flex: 1.327 1 0 不覆盖', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex: 1.327 1 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1.327 1 0')
    expect(out).not.toContain('flex: 3.73 1 0')
  })

  it('防误伤：flex: 0 0 46px 不碰', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  display: flex;',
      '  flex: 0 0 46px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 46px')
    expect(out).not.toContain('flex: 3.73 1 0')
  })

  it('幂等：无 display 块补完后再跑一次值不变', () => {
    const input = [
      '.c-traffic-monitor-chart-tunnel {',
      '  width: 100%;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const once = fixSectionHeightsForResource(input, CTX)
    const twice = fixSectionHeightsForResource(once, CTX)
    expect(twice).toBe(once)
  })

  it('row 缺对齐 → 补 align-items:center + justify-content:space-between（无 gap 时）', () => {
    const input = [
      '.c-traffic-monitor-header {',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('align-items: center')
    expect(out).toContain('justify-content: space-between')
    // 🛡️ 2026-09-16 收窄：row 容器不写 flexGrow（防止固定高度内容被压缩）
    expect(out).not.toContain('flex: 0.204 1 0')
  })

  it('🛡️ 2026-09-16：row 容器不写 flexGrow（防止 c-device-monitor-switch 被压扁）', () => {
    const input = [
      '.c-device-monitor-switch {',
      '  display: flex;',
      '  flex-direction: row;',
      '  gap: 12px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: {
        'c-device-monitor-switch': {
          flexGrow: 0.472,
          display: 'flex',
          flexDirection: 'row',
        },
      },
    })
    expect(out).not.toContain('flex: 0.472 1 0')
    expect(out).toContain('gap: 12px')
  })

  it('🛡️ 2026-09-16：已有 gap 的 row 容器不注入 justify-content（防止破坏自然间距）', () => {
    const input = [
      '.c-traffic-monitor-header {',
      '  display: flex;',
      '  gap: 24px;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('align-items: center')
    expect(out).not.toContain('justify-content: space-between')
    expect(out).toContain('gap: 24px')
  })

  it('已有 align/justify 不覆盖', () => {
    const input = [
      '.c-traffic-monitor-header {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  justify-content: flex-start;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('align-items: flex-start')
    expect(out).toContain('justify-content: flex-start')
    expect(out).not.toContain('align-items: center')
    expect(out).not.toContain('justify-content: space-between')
  })

  it('组件根 -slot-con 即使命中 facts 也不写 flexGrow（父级是 block）', () => {
    const input = [
      '.c-traffic-monitor-slot-con {',
      '  width: 100%;',
      '  height: 100%;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: {
        'c-traffic-monitor-slot-con': {
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
        },
      },
    })
    expect(out).not.toContain('flex: 1 1 0')
    expect(out).toContain('height: 100%')
  })

  it('⭐ 2026-09-16 兜底（c-vehicle-monitor-54c256c7）：facts 对齐失败（layoutFacts=null）时，flex 比例缺 display → 补 display:flex + row', () => {
    // vision 5 个 section vs 4 个子组件 → alignSectionClasses 数量不等 → sectionLayoutFacts=null
    // → 旧逻辑规则⑤整段空转 → section 根容器只有 flex 比例无 display → 全纵向。
    const input = [
      '.c-vehicle-monitor-content-section {',
      '  width: 100%;',
      '  flex: 2.142 1 0;',
      '  min-height: 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: null,
    })
    expect(out).toContain('display: flex')
    expect(out).toContain('flex-direction: row')
  })

  it('兜底不误伤：无 flex 比例、或已有 display 的块不补', () => {
    const noFlex = [
      '.c-monitor-plain {',
      '  width: 100%;',
      '  height: 50px;',
      '}',
    ].join('\n')
    expect(fixSectionHeightsForResource(noFlex, { path: 'resources/styles/common.less', sectionLayoutFacts: null })).toBe(noFlex)

    const hasDisplay = [
      '.c-monitor-x {',
      '  display: flex;',
      '  flex-direction: column;',
      '  flex: 1 1 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(hasDisplay, { path: 'resources/styles/common.less', sectionLayoutFacts: null })
    expect(out).toContain('flex-direction: column')
    expect(out).not.toContain('flex-direction: row')
  })

  it('⭐ 2026-09-16（c-vehicle-monitor-b82c9d84）：gap 但无 display 的卡片容器 → 补 display:flex + row', () => {
    // stat-cards 有 gap:8px（暗示 flex/grid），但没 display:flex → 卡片纵向堆叠。
    const input = '.c-vehicle-monitor-stat-cards {width: 100%;\n  gap: 8px}'
    const out = fixSectionHeightsForResource(input, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: null,
    })
    expect(out).toContain('display: flex')
    expect(out).toContain('flex-direction: row')
  })

  it('⭐ 2026-09-16（c-vehicle-monitor-b82c9d84）：flex-direction/align 等 flex 专属属性但无 display → 补 display（保留已有 direction）', () => {
    // stat-card 有 flex-direction:row 但无 display → 补 display 让已有 direction 生效。
    const card = '.c-vehicle-monitor-stat-card {min-width: 0;\n  flex-direction: row;\n  box-sizing: border-box}'
    const outCard = fixSectionHeightsForResource(card, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: null,
    })
    expect(outCard).toContain('display: flex')
    expect(outCard).toContain('flex-direction: row')

    // 已有 flex-direction:column 的块 → 只补 display，不覆盖 column
    const col = '.c-monitor-y {flex-direction: column; gap: 4px}'
    const outCol = fixSectionHeightsForResource(col, {
      path: 'resources/styles/common.less',
      sectionLayoutFacts: null,
    })
    expect(outCol).toContain('display: flex')
    expect(outCol).toContain('flex-direction: column')
    expect(outCol).not.toContain('flex-direction: row')
  })
})

describe('fixSectionHeightsForResource 规则④：固定 px 尺寸区块禁 flex-grow（2026-09-02 实锤）', () => {
  const CTX = { path: 'resources/styles/common.less' }

  it('⭐ width:46px + flex:1 1 0 → flex: 0 0 auto（CategoryNav 实锤：186px 撑满）', () => {
    // 🛡️ 2026-09-28 轴判定：需要**父容器方向**才能判「固定 px 是否落在主轴」——
    //   CategoryNav 的父是 row（grow 沿宽扩 → 与定宽 46px 冲突）。故 fixture 补上父规则。
    const input = [
      // 父类名须与子类同前缀（本仓命名惯例：父 `c-x-tab` → 子 `c-x-tab-bg`）
      '.c-monitor-category {',
      '  display: flex;',
      '  flex-direction: row;',
      '}',
      '.c-monitor-category-nav {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  width: 46px;',
      '  flex: 1 1 0;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 auto')
    expect(out).toContain('width: 46px')
    expect(out).not.toContain('flex: 1 1 0')
  })

  it('防误伤：无 px 尺寸的 flex:1（自适应区块）→ 不动', () => {
    const input = [
      '.c-monitor-main-layout {',
      '  flex: 1;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1')
  })

  it('防误伤：width:100% + flex:1 1 0 → 不动（行父等价/列父不可静态判定）', () => {
    const input = [
      '.c-monitor-stats-header {',
      '  flex: 1 1 0;',
      '  width: 100%;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
  })

  it('防误伤：min-height:120px + flex:131 1 0（图表 section 合法组合）→ 不动', () => {
    const input = [
      '.c-monitor-chart-section {',
      '  flex: 131 1 0;',
      '  min-height: 120px;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 131 1 0')
  })

  it('height:100px + flex:1 1 0（单块内）→ flex: 0 0 auto（保留显式高）', () => {
    // 🛡️ 2026-09-28 轴判定：定高(主轴)冲突需父容器为 column。补父规则。
    const input = [
      '.c-monitor-stats {',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
      '.c-monitor-stats-header {',
      '  height: 100px;',
      '  flex: 1 1 0;',
      '  display: flex;',
      '}',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 auto')
    expect(out).toContain('height: 100px')
  })
})

describe('ensureHeaderSlots P1-3: headerSlots/sections 重叠去重', () => {
  // 多行 baseCode 匹配注入正则 `/<base-panel[^>]*>\s*\n/`
  const baseCode = [
    '<template>',
    '  <base-panel>',
    '    <div>content</div>',
    '  </base-panel>',
    '</template>',
  ].join('\n')

  it('当 headerSlot content 与子组件文本完全匹配时，跳过注入', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 重叠 → 跳过注入，code 不变
    expect(result).toBe(baseCode)
  })

  it('当 headerSlot content 与子组件无重叠时，正常注入', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/OtherWidget.vue':
        '<template><div><span>其他内容</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 无重叠 → 注入 DOM
    expect(result).not.toBe(baseCode)
    expect(result).toContain('设备类型 28')
  })

  it('无 files 时不做去重，保持原有注入行为', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const result = ensureHeaderSlots(baseCode, input, {})
    expect(result).not.toBe(baseCode)
    expect(result).toContain('设备类型 28')
  })

  it('部分重叠：只跳过匹配的 slot，保留不匹配的', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
        { slotType: 'title-right', content: '完好率 98%', figmaNodeId: 'node2' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // 第一个 slot 被跳过（重叠），第二个应该注入
    expect(result).toContain('完好率 98%')
    // header-right 被跳过 → 不应注入
    expect(result).not.toContain('#header-right')
  })

  it('数字片段匹配：子组件包含数字 "28" 时，"设备类型 28" 被跳过', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files })
    // "28" 是片段之一，匹配 → 跳过
    expect(result).toBe(baseCode)
  })

  it('vue3 组件跳过整个 ensureHeaderSlots 逻辑', () => {
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const files = {
      'package/components/HeaderStats.vue':
        '<template><div><span>设备类型 28</span></div></template>',
    }
    const result = ensureHeaderSlots(baseCode, input, { files, componentType: 'vue3' })
    // vue3 直接返回原 code
    expect(result).toBe(baseCode)
  })

  it('无 base-panel 时跳过注入', () => {
    const plainCode = '<template><div>plain</div></template>'
    const input = {
      headerSlots: [
        { slotType: 'header-right', content: '设备类型 28', figmaNodeId: 'node1' },
      ],
    }
    const result = ensureHeaderSlots(plainCode, input, {})
    expect(result).toBe(plainCode)
  })
})

/**
 * 🛡️ B2（2026-09-07）：下载失败背景资源的 CSS 渐变/纯色兜底注入。
 *
 * 背景：traffic 组件根背景 bg-[m] downloadStatus='missing'，skipMount 后无替代方案 → 容器无背景。
 * 现有 resolveCssSubstituteRefs 只处理 downloadStatus='css'，healUnavailableResourceRefs
 * 只剥离引用（→ none），未注入任何视觉替代。
 *
 * 测试覆盖：
 *  1) template 内 :style 绑定 url(${var}) → 静态 fallback 色值
 *  2) <style> 内 url(@var) → fallback 值
 *  3) <style> 内 url(none)（heal 已剥离引用）→ fallback 值
 *  4) 兜底 CSS 类注入（template 引用已被 heal 剥离）
 *  5) 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变
 *  6) 仅处理 previewAnalysisRole='bg'（icon/img 不处理）
 *  7) env BG_AUTO_MOUNT=false 时关闭
 */
describe('injectFailedResourceFallbacks: B2 下载失败背景 CSS 兜底', () => {
  const makeMapping = (overrides = {}) => ({
    previewAnalysisRole: 'bg',
    downloadStatus: 'missing',
    assignedVarName: 'bg1',
    semanticVarName: null,
    visualMeta: { fillsSummary: null },
    cssValue: null,
    mountTarget: 'traffic-root',
    name: 'bg-[m]',
    targetDomHint: 'traffic container',
    figmaPath: 'traffic/bg-[m]',
    ...overrides,
  })

  it('① template :style 绑定 url(${var}) → 静态 fallback 色值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="traffic-root" :style="\`url(\${bg1})\`"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#ff0000' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('tpl-style')
    expect(allFiles['package/index.vue']).toContain("backgroundImage: '#ff0000'")
  })

  it('② <style> 内 url(@var) → fallback 值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="trafficroot"></div>
</template>
<style>
.trafficroot { background-image: url(@bg1); }
</style>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: 'linear-gradient(180deg, #000 0%, #fff 100%)' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('style-url')
    expect(allFiles['package/index.vue']).toContain("url('linear-gradient(180deg, #000 0%, #fff 100%)')")
  })

  it('③ <style> 内 url(none)（heal 已剥离引用）→ fallback 值', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="trafficroot"></div>
</template>
<style>
.trafficroot { background-image: url(none); }
</style>
<script>const bg1 = 'xxx';</script>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#00ff00' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('style-none')
    expect(allFiles['package/index.vue']).toContain("url('#00ff00')")
  })

  it('④ 兜底 CSS 类注入（template 引用已被 heal 剥离）', () => {
    // 🛡️ ①（2026-09-29）：夹具原先写 `class="trafficroot"`（无连字符拼接），与本组 ①②③ 的
    //   `class="traffic-root"` 不一致。`findTagByClassKeyword` 改为 **class 片段边界**匹配后，
    //   关键词 `traffic`/`root` 都不再对 `trafficroot` 成立（这正是词边界要挡的「前缀粘连」形态）。
    //   本仓约定是 `c-<prefix>-<role>`（连字符），故夹具统一为 `traffic-root`，
    //   功能覆盖不变；劫持防护另见下方 `findTagByClassKeyword：class 片段边界` 用例组。
    const allFiles = {
      'package/index.vue': `<template>
  <div class="traffic-root"></div>
</template>
<style></style>
<script>const bg1 = 'xxx';</script>`,
    }
    const mapping = [makeMapping({ visualMeta: { fillsSummary: '#0000ff' } })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(1)
    expect(fixes[0].method).toContain('class-inject')
    expect(allFiles['package/index.vue']).toContain('fb-bg-bg1')
    expect(allFiles['package/index.vue']).toContain("background-image: #0000ff")
  })

  it('⑤ 颜色来源优先级：visualMeta.fillsSummary > cssValue > 默认渐变', () => {
    // 优先级 1: visualMeta.fillsSummary
    const m1 = [makeMapping({ visualMeta: { fillsSummary: '#111' }, cssValue: '#222' })]
    const f1 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f1, m1)
    expect(f1['package/index.vue']).toContain("backgroundImage: '#111'")

    // 优先级 2: cssValue（fillsSummary 为空）
    const m2 = [makeMapping({ visualMeta: { fillsSummary: null }, cssValue: '#333' })]
    const f2 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f2, m2)
    expect(f2['package/index.vue']).toContain("backgroundImage: '#333'")

    // 优先级 3: 默认渐变（fillsSummary 和 cssValue 都为空）
    const m3 = [makeMapping({ visualMeta: { fillsSummary: null }, cssValue: null })]
    const f3 = { 'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>` }
    injectFailedResourceFallbacks(f3, m3)
    expect(f3['package/index.vue']).toContain('linear-gradient(180deg, #edf4fb, #d6e8f5)')
  })

  it('⑥ 仅处理 previewAnalysisRole="bg"（icon/img 不处理）', () => {
    const allFiles = {
      'package/index.vue': `<template><div class="x" :style="\`url(\${icon1})\`"></div></template><style></style><script>const icon1='x';</script>`,
    }
    const mapping = [makeMapping({ previewAnalysisRole: 'icon', assignedVarName: 'icon1' })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(0)
  })

  it('⑦ env BG_AUTO_MOUNT=false 时关闭', () => {
    const orig = process.env.BG_AUTO_MOUNT
    process.env.BG_AUTO_MOUNT = 'false'
    try {
      const allFiles = {
        'package/index.vue': `<template><div class="x" :style="\`url(\${bg1})\`"></div></template><style></style><script>const bg1='x';</script>`,
      }
      const mapping = [makeMapping()]
      const fixes = injectFailedResourceFallbacks(allFiles, mapping)
      expect(fixes.length).toBe(0)
    } finally {
      if (orig === undefined) delete process.env.BG_AUTO_MOUNT
      else process.env.BG_AUTO_MOUNT = orig
    }
  })

  it('无失败资源时返回空数组', () => {
    const allFiles = { 'package/index.vue': '<template><div></div></template>' }
    const mapping = [makeMapping({ downloadStatus: 'success' })]
    const fixes = injectFailedResourceFallbacks(allFiles, mapping)
    expect(fixes.length).toBe(0)
  })
})

/**
 * 🛡️ C2（2026-09-07，#568）：空壳解绑。
 *
 * 背景：T1 标题剥离后，原父容器 div 残留 `:style="{ backgroundImage: \`url(${bg4})\` }"`
 * 绑定变成空壳（只有 background 引用，无 class/子内容），导致运行时 ReferenceError。
 *
 * 修复策略：扫描所有 .vue 文件的 template 段，匹配只有 :style 绑定的 div 标签
 * （无 class），检查 :style 内是否仅含 background 相关属性且引用了死变量，
 * 是则删除整个 :style 属性。
 */
describe('stripEmptyShellBindings: C2 空壳解绑', () => {
  const makeMapping = (overrides: Record<string, any> = {}) => ({
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    semanticVarName: null,
    resourceFile: 'resources/images/bg.png',
    mountTarget: 'container-root',
    targetDomHint: 'container',
    figmaPath: 'frame/bg',
    name: 'bg-[m]',
    ...overrides,
  })

  it('⭐ 空壳 div（只有 :style 无 class，引用死变量）→ :style 被删除', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg4})\` }"></div>
</template>
<style></style>`,
    }
    // bg4 不在 mapping 中（死变量）
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(1)
    expect(result.fixes[0].file).toBe('package/index.vue')
    expect(result.fixes[0].vars).toContain('bg4')
    expect(result.files['package/index.vue']).not.toContain(':style')
  })

  it('有 class 的 div 不处理', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div class="shell" :style="{ backgroundImage: \`url(\${bg4})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it(':style 含非 background 属性时保留', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg4})\`, color: 'red' }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it('所有变量都可用时不清理', () => {
    const allFiles = {
      'package/index.vue': `<template>
  <div :style="{ backgroundImage: \`url(\${bg1})\` }"></div>
</template>
<style></style>`,
    }
    const mapping = [makeMapping({ assignedVarName: 'bg1' })]
    const result = stripEmptyShellBindings(allFiles, mapping)
    expect(result.fixes.length).toBe(0)
    expect(result.files['package/index.vue']).toContain(':style')
  })

  it('空 mapping 返回空 fixes', () => {
    const allFiles = { 'package/index.vue': '<template><div></div></template>' }
    const result = stripEmptyShellBindings(allFiles, [])
    expect(result.fixes.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 🛡️ 刀 7b（2026-09-13）：ensureResourceImportInVue 撞名复核
// 实锤 mc-max-1789279605053-c9e4a435（c-device-monitor-6ajwy8yn-c9e4a435）：
// MainSection.vue 被注入 import bg6 而文件内已有 `const bg6 = bg3`
// → Identifier 'bg6' has already been declared → P1-4 隔离降级 → 主内容区整体消失。
// ══════════════════════════════════════════════════════════════
describe('ensureResourceImportInVue 刀 7b: 撞名复核（防重复声明毁掉整个子组件）', () => {
  const mapping = {
    assignedVarName: 'bg6',
    resourceFile: 'resources/images/bg-8439.png',
  }
  const filePath = 'package/components/MainSection.vue'

  it('⭐ 已有 const 别名声明 → 不注入 import（实锤：const bg6 = bg3）', () => {
    const content = `<template><div :style="{ backgroundImage: 'url(' + bg6 + ')' }"></div></template>
<script setup>
import bg3 from '../../resources/images/bg-8439.png'
const bg6 = bg3
const deviceItems = [{ bg: bg6 }]
</script>`
    const out = ensureResourceImportInVue(content, 'bg6', mapping, filePath)
    expect(out).toBe(content)
    expect(out).not.toMatch(/import\s+bg6\s+from/)
  })

  it('已有 const 解构声明 → 不注入', () => {
    const content = `<script setup>
const { bg6 } = defineProps(['bg6'])
</script>`
    expect(ensureResourceImportInVue(content, 'bg6', mapping, filePath)).toBe(content)
  })

  it('已有 let 裸声明 → 不注入', () => {
    const content = `<script setup>
let bg6;
</script>`
    expect(ensureResourceImportInVue(content, 'bg6', mapping, filePath)).toBe(content)
  })

  it('已有 import → 不重复注入（原有行为保留）', () => {
    const content = `<script setup>
import bg6 from '../../resources/images/bg-8439.png'
</script>`
    expect(ensureResourceImportInVue(content, 'bg6', mapping, filePath)).toBe(content)
  })

  it('⭐ 无任何声明 → 正常注入 import（真实缺失场景不被放过）', () => {
    const content = `<template><div :style="{ backgroundImage: 'url(' + bg6 + ')' }"></div></template>
<script setup>
import { ref } from 'vue'
</script>`
    const out = ensureResourceImportInVue(content, 'bg6', mapping, filePath)
    expect(out).toMatch(/import\s+bg6\s+from\s+'\.\.\/\.\.\/resources\/images\/bg-8439\.png'/)
  })
})

describe('mountSubStateBackground：激活态背景挂载（2026-09-15 刀24-A/D）', () => {
  const m = { bgRole: 'sub-state', mountTarget: null }

  it('认 `active` 字面量键 → 挂载 + 走 inferBackgroundStyle 尺寸（不再硬编码 100% 100%）', () => {
    const files = {
      'package/index.vue': `<template><div :class="{ active: isOn }">x</div></template>\n<script setup>\nimport { ref } from 'vue'\n</script>`,
    }
    const r = mountSubStateBackground(files, 'bgActive', m)
    expect(r).toBeTruthy()
    // 无 figmaBox/parentBox → 兜底 100% 100%（与旧行为一致），但 position/repeat 也走推断
    expect(files['package/index.vue']).toMatch(/backgroundSize:\s*'100% 100%'/)
    expect(files['package/index.vue']).toMatch(/backgroundRepeat:\s*'no-repeat'/)
  })

  it('认 `is-active` 前缀键（带引号）→ 挂载', () => {
    const files = {
      'package/index.vue': `<template><div :class="['c-tab', {'is-active': activeTab === tab }]">x</div></template>\n<script setup>\nimport { ref } from 'vue'\n</script>`,
    }
    const r = mountSubStateBackground(files, 'bgActive', m)
    expect(r).toBeTruthy()
    expect(files['package/index.vue']).toMatch(/backgroundImage/)
  })

  it('认 `c-xxx--active` BEM 类名键（旧正则漏挂，2026-09-15 实锤）→ 挂载', () => {
    const files = {
      'package/index.vue': `<template><div :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.value }]">x</div></template>\n<script setup>\nimport { ref } from 'vue'\n</script>`,
    }
    const r = mountSubStateBackground(files, 'bgActive', m)
    expect(r).toBeTruthy()
    expect(files['package/index.vue']).toMatch(/backgroundImage/)
  })

  it('`inactive` 反义键 → 不误挂', () => {
    const files = {
      'package/index.vue': `<template><div :class="{ 'inactive': !isOn }">x</div></template>\n<script setup>\nimport { ref } from 'vue'\n</script>`,
    }
    expect(mountSubStateBackground(files, 'bgActive', m)).toBeNull()
  })

  it('无 active 键 → 返回 null（不挂）', () => {
    const files = {
      'package/index.vue': `<template><div class="static">x</div></template>\n<script setup>\nimport { ref } from 'vue'\n</script>`,
    }
    expect(mountSubStateBackground(files, 'bgActive', m)).toBeNull()
  })
})

describe('findVForItemTag：识别 v-for 重复单元（阶段3）', () => {
  it('识别 v-for item 的 class（12 卡共享背景挂载点）', () => {
    const content = `<template>
  <div class="c-device-monitor-cons">
    <div v-for="(device, index) in deviceList" :key="index" class="c-device-monitor-device-card">
      <span>{{ device.name }}</span>
    </div>
  </div>
</template>`
    const tag = findVForItemTag(content)
    expect(tag).toBeDefined()
    expect(tag).toContain('v-for')
    expect(tag).toContain('c-device-monitor-device-card')
  })

  it('无 v-for 时返回 null', () => {
    const content = `<template>
  <div class="c-root">
    <div class="static-card">静态卡片</div>
  </div>
</template>`
    expect(findVForItemTag(content)).toBeNull()
  })

  it('v-for 无静态 class 时返回 null（动态 :class 不算可挂载单元）', () => {
    const content = `<template><div v-for="x in list" :class="dynClass">{{ x }}</div></template>`
    expect(findVForItemTag(content)).toBeNull()
  })
})

describe('dedupeBgMultiRefs：共享背景保留 v-for item（阶段3）', () => {
  it('共享背景（sharedBy=12）的 v-for item 引用被保留，容器引用被移除', () => {
    const files = {
      'package/components/ContentCons.vue': `<template>
  <div class="c-device-monitor-cons" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div v-for="item in deviceList" :key="item.id" class="c-device-monitor-device-card" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span>{{ item.name }}</span>
    </div>
  </div>
</template>`,
    }
    const rdm = [
      {
        assignedVarName: 'bg3',
        previewAnalysisRole: 'bg',
        bgRole: 'container',
        resourceFile: '../resources/images/bg-8439.png',
        mountTarget: 'cons',
        figmaBox: { width: 117, height: 64 },
        sharedBy: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      },
    ]
    const out = dedupeBgMultiRefs(files, rdm, { logger: { warn() {}, info() {} } })
    const c = out['package/components/ContentCons.vue']
    // 容器引用被移除（不再有 cons 上的 bg3）
    expect(c).not.toMatch(/c-device-monitor-cons[^>]*bg3/)
    // v-for item 引用保留
    expect(c).toMatch(/v-for[^>]*bg3/)
  })

  it('非共享背景（无 sharedBy）走原评分去重', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-x-header" :style="{ backgroundImage: 'url(' + bg1 + ')' }"></div>
  <div class="c-x-body" :style="{ backgroundImage: 'url(' + bg1 + ')' }"></div>
</template>`,
    }
    const rdm = [
      {
        assignedVarName: 'bg1',
        previewAnalysisRole: 'bg',
        bgRole: 'container',
        resourceFile: '../resources/images/bg-x.png',
        mountTarget: 'header',
        figmaBox: { width: 100, height: 100 },
      },
    ]
    const out = dedupeBgMultiRefs(files, rdm, { logger: { warn() {}, info() {} } })
    const c = out['package/index.vue']
    // 两个引用被去重为 1 个（header 语义命中保留，body 移除）
    const cnt = (c.match(/bg1/g) || []).length
    expect(cnt).toBe(1)
  })
})

/**
 * 🛡️ 2026-09-29 治本（c-traffic-monitor-f0c05ecc 实锤「当日总流量背景图消失」）
 *
 * 事故形态（server.log 同一任务内相隔 42ms 两条日志）：
 *   🎯 [资源挂载] bg3 经事实链 data-section-id=2:8023 精确挂载       ← 先精确挂到正确父容器
 *   🛡️ P2-3 已去重：kept=c-vehicle-monitor-slot-con (2.5)            ← 再被名字相似度删掉
 *                   removed=c-vehicle-monitor-group-2136639043-con
 * 根因：去重器的 refs 曾用**自有 tag 正则 + 窄对象**构造，`isHostShell` / `dataSectionId`
 * 全部缺失 ⇒ 确定性锚短路读不到锚、宿主外壳禁用也失效 ⇒ 评分制得以推翻确定性事实。
 */
describe('dedupeBgMultiRefs：确定性锚优先于语义评分（2026-09-29 治本）', () => {
  /** 事故原形：LLM 把 bg 写在无语义的「整槽容器」上；真父容器带 data-section-id（426×91） */
  const ACCIDENT_FILES = {
    'package/index.vue': `<template>
  <div class="c-traffic-monitor-slot-con" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div class="c-traffic-monitor-group-2136636802-con" data-section-id="2:3660" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span>当日总流量</span>
    </div>
  </div>
</template>`,
  }
  const ACCIDENT_RDM = [
    {
      assignedVarName: 'bg1',
      previewAnalysisRole: 'bg',
      bgRole: 'container',
      resourceFile: '../resources/images/bg-_m-34.png',
      // ⚠️ 被 figma-connector 的 E1 回退成语义祖先名 → 语义评分反而偏向整槽容器
      mountTarget: 'slot-当日总流量',
      figmaNodeId: '88:34',
      ownerSectionId: '2:3660',
      figmaBox: { width: 426, height: 91 },
      parentBox: { width: 426, height: 91 },
    },
  ]

  it('⭐ 真父容器（带 data-section-id）必须胜出，整槽容器上的引用被移除', () => {
    const out = dedupeBgMultiRefs(
      { ...ACCIDENT_FILES },
      ACCIDENT_RDM as any,
      { logger: { warn() {}, info() {} } },
    )
    const c = out['package/index.vue']
    // 整槽容器不再持有 bg1（防 420×807 被 100% 100% 拉满 → 视觉上背景消失）
    expect(c).not.toMatch(/c-traffic-monitor-slot-con[^>]*bg1/)
    // 真父容器保留 bg1
    expect(c).toMatch(/c-traffic-monitor-group-2136636802-con[^>]*bg1/)
  })

  it('边界：ownerSectionId 缺失 ⇒ 不触发短路，保留者 = 纯语义评分最优者', () => {
    const rdm = [{ ...ACCIDENT_RDM[0], ownerSectionId: undefined }]
    const out = dedupeBgMultiRefs({ ...ACCIDENT_FILES }, rdm as any, {
      logger: { warn() {}, info() {} },
    })
    const c = out['package/index.vue']
    // 仍然去重为 1 个引用（不崩、不放大）
    expect((c.match(/bg1/g) || []).length).toBe(1)
    // 用**同一口径**算出「无锚时的语义最优」，断言保留的就是它 —— 证明短路未参与
    const prefix = inferComponentPrefix({ ...ACCIDENT_FILES })
    const pool = collectMountCandidates({ 'package/index.vue': ACCIDENT_FILES['package/index.vue'] })
    const best = pickBestMountTarget(rdm[0] as any, pool, { componentPrefix: prefix })
    expect(best).not.toBeNull()
    expect(best!.score).toBeLessThan(DETERMINISTIC_ANCHOR_SCORE)
    expect(c).toContain(best!.tag)
  })

  it('幂等：已去重产物再跑一次不再变化', () => {
    const once = dedupeBgMultiRefs({ ...ACCIDENT_FILES }, ACCIDENT_RDM as any, {
      logger: { warn() {}, info() {} },
    })
    const twice = dedupeBgMultiRefs({ ...once }, ACCIDENT_RDM as any, {
      logger: { warn() {}, info() {} },
    })
    expect(twice['package/index.vue']).toBe(once['package/index.vue'])
  })
})

/**
 * 🛡️ 2026-09-29：`collectMountCandidates` 模板区提取改走单一事实源 `extractSfcTemplate`。
 * 旧 lazy 正则 `/<template>([\s\S]*?)<\/template>/i` 撞上根 template 内嵌的**具名插槽**
 * （`<template #header-right>`）会提前闭合 —— 实测 index.vue 76 行只匹配到 5 行 ⇒
 * 全部锚点/容器不进候选池 ⇒ 去重与兜底双双丧失纠错能力。
 */
describe('collectMountCandidates：具名插槽不得截断候选池', () => {
  it('⭐ 内嵌 <template #header-right> 之后的数据锚点/容器仍被收集', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-traffic-monitor-slot-con">
      <div class="c-traffic-monitor-group-2136636802-con" data-section-id="2:3660"></div>
      <div class="c-traffic-monitor-container" data-section-id="88:33"></div>
    </div>
  </base-panel>
</template>`,
    }
    const pool = collectMountCandidates(files)
    const anchors = pool.map((c) => c.dataSectionId).filter(Boolean)
    expect(anchors).toContain('2:3660')
    expect(anchors).toContain('88:33')
    // 插槽内的组件标签同样是合法候选（刻意不剥具名插槽）
    expect(pool.some((c) => c.tagName === 'HeaderSection')).toBe(true)
  })
})

describe('healAbsoluteOverlayParents：absolute 遮罩层父容器补 relative（阶段4）', () => {
  it('card-bg absolute + 父容器 device-card 无 position → 补 relative（一片蓝根治）', () => {
    const files = {
      'package/components/ContentCons.vue': `<template>
  <div class="c-device-monitor-device-card">
    <div class="c-device-monitor-card-bg"></div>
    <div class="c-device-monitor-card-content">x</div>
  </div>
</template>
<style lang="less" scoped>
.c-device-monitor-card-bg { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
.c-device-monitor-card-content { z-index: 1; }
</style>`,
    }
    const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(1)
    expect(fixed[0].parentClass).toBe('c-device-monitor-device-card')
    // device-card 被补了 position: relative
    expect(files['package/components/ContentCons.vue']).toMatch(/c-device-monitor-device-card\s*\{[^}]*position:\s*relative/s)
  })

  it('父容器已有 position 声明 → 不重复补', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="a"><div class="b-mask"></div></div>
</template>
<style>
.a { position: relative; }
.b-mask { position: absolute; }
</style>`,
    }
    const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(0)
  })

  it('无 absolute 元素 → 不改动', () => {
    const files = {
      'package/index.vue': `<template><div class="a"><span>x</span></div></template><style>.a { display: flex; }</style>`,
    }
    const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } })
    expect(fixed.length).toBe(0)
  })
})

describe('healAbsoluteOverlayParents：:class 动态绑定边界（2026-09-17 回归）', () => {
  it('父容器 :class 动态绑定不应被误判（TabsSection 编译崩溃根治）', () => {
    const files = {
      'package/components/TabsSection.vue': `<template>
  <div v-for="tab in tabs" :key="tab.key" :class="['c-device-monitor-tab-item', { 'c-device-monitor-tab-item--active': active === tab.key }]">
    <div class="c-device-monitor-tab-badge"></div>
  </div>
</template>
<style lang="less" scoped>
.c-device-monitor-tab-badge { position: absolute; top: 0; right: 0; }
.c-device-monitor-tab-item { display: flex; }
</style>`,
    }
    const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } })
    const c = files['package/components/TabsSection.vue']
    // 不能生成非法规则（. 开头的数组内容）
    expect(c).not.toMatch(/\.\[|\.\{/)
    // 若 tab-item 有静态 class 且有样式块，才可能补 relative（此处 :class 动态，cls 为空，不应补到非法处）
  })

  it(':class 动态绑定元素即使含 absolute 子元素，也不生成非法 . 规则', () => {
    const files = {
      'package/a.vue': `<template>
  <div :class="['x', {'y': true}]">
    <div class="mask"></div>
  </div>
</template>
<style>
.mask { position: absolute; }
.x { display: block; }
</style>`,
    }
    const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } })
    expect(files['package/a.vue']).not.toMatch(/\.\[|\.\{/)
  })
})

describe('fixSectionHeightsForResource 规则④轴判定（2026-09-28 · c-device-monitor-18de33dd 实锤）', () => {
  const CTX = { path: 'resources/styles/common.less' }

  it('父=column + 定宽(交叉轴) + flex:1 1 0 → 不改（tab-bg 必须撑高）', () => {
    const input = [
      '.c-x-tab { display: flex; flex-direction: column; }',
      '.c-x-tab-bg { display: flex; flex-direction: column; width: 34px; flex: 1 1 0; min-height: 0; }',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    expect(out).not.toContain('flex: 0 0 auto')
  })

  it('父=row + 定宽(主轴) + flex:1 1 0 → 改写为 flex: 0 0 auto（原事故不回归）', () => {
    const input = [
      '.c-x-nav { display: flex; flex-direction: row; }',
      '.c-x-nav-item { display: flex; width: 46px; flex: 1 1 0; }',
    ].join('\n')
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 0 0 auto')
  })

  it('父轴向未知 → 不改（宁可少改，不可误伤）', () => {
    const input = '.c-x-orphan { display: flex; width: 46px; flex: 1 1 0; }'
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
    expect(out).not.toContain('flex: 0 0 auto')
  })
})

describe('findTagByClassKeyword 词形归一（2026-09-28 · c-env-monitor-efe76c26 实锤）', () => {
  it('关键字复数 tabs-list 命中单数类 tab-list（防误落 S7 错挂父容器）', () => {
    const c = '<template><div class="c-env-monitor-tab-list"><span></span></div></template>'
    expect(findTagByClassKeyword(c, 'tabs-list')).toContain('c-env-monitor-tab-list')
  })

  it('反向：关键字单数 tab-list 命中复数列 tabs-list', () => {
    const c = '<template><div class="c-env-monitor-tabs-list"></div></template>'
    expect(findTagByClassKeyword(c, 'tab-list')).toContain('c-env-monitor-tabs-list')
  })

  it('无匹配 → null（不臆造挂载点）', () => {
    expect(findTagByClassKeyword('<template><div class="c-x-icon"></div></template>', 'tabs-list')).toBeNull()
  })
})

describe('fixSectionHeightsForResource §六 #1 收口（§七 P2 · 2026-09-28）', () => {
  const CTX = { path: 'resources/styles/common.less' }
  it('⭐ section 根（-con 结尾）+ 无权威比例 → 跳过（不再等分 flex:1 1 0；保留 height:100%）', () => {
    const warns = []
    const input = '.c-x-con-con {\n  display: flex;\n  height: 100%;\n}\n'
    const out = fixSectionHeightsForResource(input, CTX, {
      logger: { warn: (m) => warns.push(String(m)), info() {} },
    })
    expect(warns.some((w) => w.includes('§六 #1') && w.includes('c-x-con-con'))).toBe(true)
    expect(out).toContain('height: 100%')    // 不再被改写
    expect(out).not.toContain('flex: 1 1 0') // 不再等分抹平比例
  })
  it('-con 结尾但有权威比例（sectionHeights 命中）→ 仍按权威系数改写（不跳过）', () => {
    const input = '.c-x-con-con {\n  display: flex;\n  height: 100%;\n}\n'
    const out = fixSectionHeightsForResource(input, {
      path: 'package/components/OverviewCards.vue',
      sectionHeights: { 'c-x-con-con': 88 },
    })
    expect(out).toContain('flex: 88 1 0')
    expect(out).not.toContain('height: 100%')
  })
  it('非 section 根（-item 结尾）→ 维持旧行为（flex: 1 1 0，不告警）', () => {
    const warns = []
    const input = '.c-x-item {\n  display: flex;\n  height: 100%;\n}\n'
    const out = fixSectionHeightsForResource(input, CTX, {
      logger: { warn: (m) => warns.push(String(m)), info() {} },
    })
    expect(warns.some((w) => w.includes('§六 #1'))).toBe(false)
    expect(out).toContain('flex: 1 1 0')
  })
  it('-section 结尾（非 section 根形态）→ 维持旧行为（仍改写为 flex: 1 1 0）', () => {
    const input = '.c-x-chart-section {\n  display: flex;\n  height: 100%;\n}\n'
    const out = fixSectionHeightsForResource(input, CTX)
    expect(out).toContain('flex: 1 1 0')
  })
})

/**
 * 🛡️ ①（2026-09-29 治本）：`findTagByClassKeyword` 必须按 **class 片段边界** 匹配。
 *
 * 旧实现用 `cls.includes(kw)` 裸子串 ⇒ 两族劫持（全语料差分审计：2095 条资源条目里
 * 2095 → 命中相同 917 / 换宿主 1086 / 变为 null 18（全是劫持被纠正）/ 恢复命中 74）：
 *   1. 单字符 mountTarget：Figma 卡片内标题行图层名就叫 `t` ⇒ `"c-traffic-monitor-card".includes('t')`
 *      ⇒ 标题背景 `2:3475`(bg2) 被挂到**卡片根**，与卡片自身背景 `88:36`(bg4) 抢同一 `:style`。
 *   2. 去复数后再裸子串：`mountTarget='cons'` → `dePlural` → `'con'` ⇒
 *      `"c-device-monitor-active-icon".includes('con')`（i**con**）⇒ 背景挂到图标上。
 */
describe('findTagByClassKeyword：class 片段边界（① 词边界）', () => {
  const CARD = `<template>
  <div class="c-traffic-monitor-card" data-section-id="2:3446">
    <div class="c-traffic-monitor-card-title"><span>车型分布</span></div>
  </div>
</template>`

  it('⛔ 单字符 mountTarget "t" 不得劫持 c-traffic-monitor-card（旧劫持）', () => {
    expect(findTagByClassKeyword(CARD, 't')).toBeNull()
  })

  it('✅ 单字符 mountTarget "t" 仍匹配真正的片段：class="t" / c-x-t-y', () => {
    expect(findTagByClassKeyword('<template><div class="t"></div></template>', 't')).toContain('class="t"')
    expect(findTagByClassKeyword('<template><div class="c-x-t-y"></div></template>', 't')).toContain('c-x-t-y')
  })

  it('⛔ "cons" 不得命中 c-device-monitor-active-icon（旧 dePlural→con ⊂ icon 劫持）', () => {
    const tpl = '<template><div class="c-device-monitor-active-icon"></div></template>'
    expect(findTagByClassKeyword(tpl, 'cons')).toBeNull()
  })

  it('✅ "cons" 命中真正的片段 c-device-monitor-cons-grid', () => {
    const tpl = '<template><div class="c-device-monitor-cons-grid"></div></template>'
    expect(findTagByClassKeyword(tpl, 'cons')).toContain('c-device-monitor-cons-grid')
  })

  it('✅ "card" 命中 c-traffic-monitor-card（正常片段匹配不受影响）', () => {
    expect(findTagByClassKeyword(CARD, 'card')).toContain('class="c-traffic-monitor-card"')
  })

  it('✅ 动态 :class 里的激活态类名仍可命中（…--active）', () => {
    const tpl = `<template><div :class="['c-device-monitor-switch-item', item.active ? 'c-device-monitor-switch-item--active' : 'c-device-monitor-switch-item--default']"></div></template>`
    expect(findTagByClassKeyword(tpl, 'active')).not.toBeNull()
  })

  it('✅ 中文 mountTarget（图层次层名）仍可命中（点背景 / 默认 / 激活）', () => {
    const tpl = '<template><div class="c-377b6f-点背景"></div></template>'
    expect(findTagByClassKeyword(tpl, '点背景')).toContain('c-377b6f-点背景')
  })

  it('✅ 复数归一仍生效：tabs-list → c-x-tab-list', () => {
    const tpl = '<template><div class="c-env-monitor-tab-list"></div></template>'
    expect(findTagByClassKeyword(tpl, 'tabs-list')).toContain('c-env-monitor-tab-list')
  })

  it('⛔ 前缀粘连不匹配：root 不得命中 trafficroot（词边界）', () => {
    expect(findTagByClassKeyword('<template><div class="trafficroot"></div></template>', 'root')).toBeNull()
    expect(findTagByClassKeyword('<template><div class="traffic-root"></div></template>', 'root')).not.toBeNull()
  })
})

/**
 * 🛡️ healStandaloneBgLayers（2026-09-30 · a6d2e5e1 车型分布撕裂实锤，用户确认契约）：
 *   方案 A：空壳 bg div（无子内容）→ 背景键值迁移到直接父元素 + 删 div；
 *   方案 B：有内容 bg 层缺 absolute → 补 position:absolute + inset:0（宿主 relative 由
 *   healAbsoluteOverlayParents 在其后接管）。
 *   撕裂实锤形态：容器 :style 挂精确四件套（figmaBox 真值），内层 bg-m div 单独挂
 *   backgroundImage 且 100% 100%，且无 absolute 占文档流 → 标题挤下移、内容区塌高。
 */
describe('healStandaloneBgLayers 背景形态契约', () => {
  it('⭐ 方案A：空壳 bg div → 背景四件套原文迁移到父元素，div 删除', () => {
    const input = `<template>
  <div class="card">
    <div class="bg-m" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"></div>
    <span class="title">车型分布</span>
  </div>
</template>
<style scoped>
.card { display: flex; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    expect(report.collapsed).toHaveLength(1)
    expect(report.collapsed[0]).toMatchObject({ varName: 'bg4', mode: 'drop' })
    const out = files['package/components/X.vue']
    expect(out).not.toContain('bg-m')
    expect(out).toContain("backgroundImage: 'url(' + bg4 + ')'")
    expect(out).toContain("backgroundSize: '100% 100%'")
    // 迁移挂到父元素（card 的 :style）
    expect(out).toMatch(/class="card" :style=/)
  })

  it('⭐ 方案A-self：父已绑定同资源（撕裂形态）→ 直接删空壳 div，父零改动', () => {
    const input = `<template>
  <div class="card" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '191px 80px', backgroundPosition: '1px 31px' }">
    <div class="bg-m" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%' }"></div>
    <span class="title">车型分布</span>
  </div>
</template>
<style scoped>
.card { display: flex; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    expect(report.collapsed).toHaveLength(1)
    expect(report.collapsed[0]).toMatchObject({ varName: 'bg4', mode: 'drop' })
    const out = files['package/components/X.vue']
    expect(out).not.toContain('bg-m')
    // 父的四件套真值不被覆盖
    expect(out).toContain("backgroundSize: '191px 80px'")
    expect(out).not.toContain("backgroundSize: '100% 100%'")
  })

  it('方案A-fail-closed：父被外来背景占用 → 不迁移不删，空壳退化方案 B 补 absolute', () => {
    // 收紧后（f8116aa6）：父须有精确 px size 真值才认定撕裂（父无 size/% 兜底 → fail-open 不动）
    const input = `<template>
  <div class="card" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '191px 80px' }">
    <div class="bg-m" :style="{ backgroundImage: 'url(' + bg4 + ')' }"></div>
  </div>
</template>
<style scoped>
.card { display: flex; }
.bg-m { width: 103px; height: 80px; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    expect(report.collapsed).toHaveLength(0)
    expect(report.absoluteFixed).toHaveLength(1)
    const out = files['package/components/X.vue']
    expect(out).toContain('bg-m')
    expect(out).toMatch(/\.bg-m\s*\{[^}]*position:\s*absolute/)
    expect(out).toMatch(/\.bg-m\s*\{[^}]*inset:\s*0/)
  })

  it('方案B：有子内容的 bg 层缺 absolute → 补 position:absolute + inset:0', () => {
    // 收紧后（f8116aa6）：父须有精确 px size 真值才认定撕裂
    const input = `<template>
  <div class="card" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '300px 120px' }">
    <div class="bg-deco" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
      <span class="badge">HOT</span>
    </div>
    <span class="title">总流量</span>
  </div>
</template>
<style scoped>
.bg-deco { width: 100%; height: 40px; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    expect(report.collapsed).toHaveLength(0)
    expect(report.absoluteFixed).toEqual([{ file: 'package/components/X.vue', cls: 'bg-deco' }])
    const out = files['package/components/X.vue']
    expect(out).toMatch(/\.bg-deco\s*\{[^}]*position:\s*absolute/)
    expect(out).toMatch(/\.bg-deco\s*\{[^}]*inset:\s*0/)
  })

  it('防误伤：父无背景绑定的独立 bg 内容块（正常文档流布局）不补 absolute', () => {
    const input = `<template>
  <div class="card">
    <div class="bg-deco" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
      <span class="badge">HOT</span>
    </div>
  </div>
</template>
<style scoped>
.bg-deco { width: 100%; height: 40px; }
</style>`
    const files = { 'package/components/X.vue': input }
    const before = files['package/components/X.vue']
    const report = healStandaloneBgLayers(files, {})
    expect(report.absoluteFixed).toHaveLength(0)
    expect(files['package/components/X.vue']).toBe(before)
  })

  it('收紧（f8116aa6 误伤）：父 size 也是 % 兜底 → 层叠标签设计不补 absolute', () => {
    // 实锤：slot-tag-text（bg1 文字层）叠 slot-tag（bg2 标签底图），父子 size 均 100%
    // —— 合法层叠设计，误补 absolute+inset:0 会把文字层撑满整行压住面板标题
    const input = `<template>
  <div class="tag" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%' }">
    <span class="tag-text" :style="{ backgroundImage: \`url(\${bg1})\`, backgroundSize: '100% 100%' }">场区污水</span>
  </div>
</template>
<style scoped>
.tag-text { width: 100%; font-weight: 700; }
</style>`
    const files = { 'package/components/X.vue': input }
    const before = files['package/components/X.vue']
    const report = healStandaloneBgLayers(files, {})
    expect(report.absoluteFixed).toHaveLength(0)
    expect(files['package/components/X.vue']).toBe(before)
  })

  it('对照：父 size 精确像素 + 子 % 兜底 → 撕裂仍补 absolute（a6d2e5e1 判据不回归）', () => {
    const input = `<template>
  <div class="tag" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '191px 80px' }">
    <span class="tag-text" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }">场区污水</span>
  </div>
</template>
<style scoped>
.tag-text { width: 100%; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    expect(report.absoluteFixed).toEqual([{ file: 'package/components/X.vue', cls: 'tag-text' }])
  })

  it('幂等：已有 absolute 的 bg 层不动；无 bg 绑定的普通 div 不受影响', () => {
    const input = `<template>
  <div class="card">
    <div class="bg-deco" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
      <span>deco</span>
    </div>
    <div class="plain"></div>
  </div>
</template>
<style scoped>
.bg-deco { position: absolute; inset: 0; }
.plain { margin: 0; }
</style>`
    const files = { 'package/components/X.vue': input }
    const before = files['package/components/X.vue']
    const report = healStandaloneBgLayers(files, {})
    expect(report.collapsed).toHaveLength(0)
    expect(report.absoluteFixed).toHaveLength(0)
    expect(files['package/components/X.vue']).toBe(before)
  })

  it('宿主 relative 成对契约：healStandaloneBgLayers 后跑 healAbsoluteOverlayParents，宿主补 relative', () => {
    const input = `<template>
  <div class="card" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '300px 120px' }">
    <div class="bg-deco" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
      <span>deco</span>
    </div>
  </div>
</template>
<style scoped>
.card { display: flex; }
.bg-deco { width: 100%; }
</style>`
    const files = { 'package/components/X.vue': input }
    healStandaloneBgLayers(files, {})
    healAbsoluteOverlayParents(files, {})
    const out = files['package/components/X.vue']
    expect(out).toMatch(/\.bg-deco\s*\{[^}]*position:\s*absolute/)
    expect(out).toMatch(/\.card\s*\{[^}]*position:\s*relative/)
  })
})

/**
 * 🛡️ 透明度归属契约（2026-09-30 · mc-max-1790723575234-d368e7d8 实锤，用户质询
 * 「cons 的透明度是不是挂错了」）：Figma 中 bg 子层 GROUP opacity=0.5、卡片容器
 * opacity=1；产物链路把 0.5 提升到容器 class → 图标/文字一并半透明。
 * 治本：① healStandaloneBgLayers 方案A守门（空壳层含非背景声明禁删）；
 *      ② fixMisplacedContainerOpacity 真值驱动修正（容器 opacity → 独立半透明背景层）。
 */
describe('透明度归属契约（d368e7d8）', () => {
  const NODE_DATA = {
    children: [{
      name: '卡片', type: 'GROUP', opacity: 1,
      children: [{ name: 'bg', type: 'GROUP', opacity: 0.5 }],
    }],
  };

  it('守门：空壳 bg 层 :style 含 opacity → 方案A不删（删层会丢透明度语义）', () => {
    const input = `<template>
  <div class="card">
    <div class="card-bg" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', opacity: 0.5 }"></div>
    <span class="title">标题</span>
  </div>
</template>
<style scoped>
.card { position: relative; }
.card-bg { position: absolute; inset: 0; opacity: 0.5; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = healStandaloneBgLayers(files, {})
    // opacity 不是背景键：合并会静默丢语义 → 该层不得被折叠删除
    expect(files['package/components/X.vue']).toContain('card-bg')
    expect(report.collapsed).toHaveLength(0)
  })

  it('⭐ 修正器：容器挂了 bg 层透明度 → 独立层 + inline 定位/透明度（d368e7d8 主形态）', () => {
    const input = `<template>
  <div>
    <div class="c-x-group-1" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div class="c-x-icon"><img :src="icon1" /></div>
      <div class="c-x-text"><span>标签</span></div>
    </div>
  </div>
</template>
<style scoped>
.c-x-group-1 {
  position: relative;
  display: flex;
  opacity: 0.5;
}
.c-x-icon { display: flex; }
</style>`
    const files = {
      'package/components/X.vue': input,
      'resources/styles/common.less': '.c-x-group-1 {\n  opacity: 0.5;\n}',
    }
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(1)
    const out = files['package/components/X.vue']
    // 容器不再带透明度（scoped + common.less 同名块都清）
    expect(out).not.toMatch(/\.c-x-group-1\s*\{[^}]*opacity/)
    expect(files['resources/styles/common.less']).not.toMatch(/\.c-x-group-1\s*\{[^}]*opacity/)
    // 独立层：背景四件套迁入 + **inline** 定位/透明度（不依赖任何 CSS 注入链）
    expect(out).toMatch(/class="c-x-group-1-bg"/)
    expect(out).toMatch(/c-x-group-1-bg"[^>]*:style="\{[^"]*backgroundImage/)
    expect(out).toMatch(/c-x-group-1-bg"[^>]*:style="\{[^"]*position:\s*'absolute'/)
    expect(out).toMatch(/c-x-group-1-bg"[^>]*:style="\{[^"]*opacity:\s*0\.5/)
    // 容器 inline relative（absolute 层的定位参照）
    expect(out).toMatch(/class="c-x-group-1" style="position: relative;"/)
    // 内容子元素补 relative（防半透明层盖住内容）
    expect(out).toMatch(/style="position: relative;" class="c-x-icon"/)
    // 容器 :style 背景四件套已移除（迁到独立层，不再冗余）
    expect(out).not.toMatch(/c-x-group-1"[^>]*:style=/)
  })

  it('fail-open：真值无低透明度节点 → 容器透明度可能是合法设计，不动', () => {
    const input = `<template>
  <div class="c-x-card disabled" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }">
    <span>禁用卡</span>
  </div>
</template>
<style scoped>
.c-x-card { opacity: 0.5; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = fixMisplacedContainerOpacity(files, { children: [{ name: 'root', type: 'FRAME' }] }, {})
    expect(report.fixed).toHaveLength(0)
    expect(files['package/components/X.vue']).toContain('opacity: 0.5')
  })

  it('fail-open：容器 opacity 值与真值不符（0.3 vs 真值 0.5）→ 可能是有意设计，不动', () => {
    const input = `<template>
  <div class="c-x-card" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }">
    <span>x</span>
  </div>
</template>
<style scoped>
.c-x-card { opacity: 0.3; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(0)
  })

  it('幂等：已有 -bg 层且其 :style 带 inline position → 跳过', () => {
    const input = `<template>
  <div class="c-x-group-1" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
    <div class="c-x-group-1-bg" :style="{ backgroundImage: 'url(' + bg3 + ')', position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }"></div>
    <span class="title">x</span>
  </div>
</template>
<style scoped>
.c-x-group-1 { position: relative; }
</style>`
    const files = { 'package/components/X.vue': input }
    const before = input
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(0)
    expect(files['package/components/X.vue']).toBe(before)
  })

  it('已有 -bg 层但容器仍挂 opacity（挂错残留）→ 清容器 opacity + 层补 inline，不重复插元素', () => {
    const input = `<template>
  <div class="c-x-group-1" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
    <div class="c-x-group-1-bg" :style="{ backgroundImage: 'url(' + bg3 + ')' }"></div>
    <span class="title">x</span>
  </div>
</template>
<style scoped>
.c-x-group-1 { position: relative; opacity: 0.5; }
</style>`
    const files = { 'package/components/X.vue': input }
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(1)
    const out = files['package/components/X.vue']
    // 容器 opacity 清除
    expect(out).not.toMatch(/\.c-x-group-1\s*\{[^}]*opacity/)
    // 层补 inline 定位/透明度
    expect(out).toMatch(/c-x-group-1-bg"[^>]*:style="\{[^"]*position:\s*'absolute'/)
    expect(out).toMatch(/c-x-group-1-bg"[^>]*:style="\{[^"]*opacity:\s*0\.5/)
    // 不重复插 -bg 元素
    expect((out.match(/class="c-x-group-1-bg"/g) || []).length).toBe(1)
  })

  it('⭐ 容器规则只在 common.less（scoped 无）→ 仍能修（inline 不依赖 CSS 落点）', () => {
    // d368e7d8 实锤：容器规则常在 common.less、scoped 里没有；把层规则写进任何
    // CSS 文件都可能落空（预览 static/opacity:1）→ 定位/透明度必须 inline
    const input = `<template>
  <div>
    <div class="c-x-group-2" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
      <div class="c-x-icon"><img :src="icon1" /></div>
    </div>
  </div>
</template>
<style scoped>
.c-x-icon { display: flex; }
</style>`
    const files = {
      'package/components/X.vue': input,
      'resources/styles/common.less': '.c-x-group-2 {\n  display: flex;\n  opacity: 0.5;\n}',
    }
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(1)
    const outVue = files['package/components/X.vue']
    expect(outVue).toMatch(/class="c-x-group-2-bg"/)
    expect(outVue).toMatch(/c-x-group-2-bg"[^>]*:style="\{[^"]*position:\s*'absolute'/)
    expect(outVue).toMatch(/c-x-group-2-bg"[^>]*:style="\{[^"]*opacity:\s*0\.5/)
    // 容器 inline relative
    expect(outVue).toMatch(/class="c-x-group-2" style="position: relative;"/)
    // 容器 CSS opacity 已清（在 common.less）
    expect(files['resources/styles/common.less']).not.toMatch(/\.c-x-group-2\s*\{[^}]*opacity/)
  })

  it('⭐ 半修正态自愈：模板已有 -bg 元素但缺 inline 定位、容器 opacity 已清 → 补 inline，不重复插元素', () => {
    // r-992fa002 实锤：历史只插了元素、无任何 CSS 命中（bgLayerPos:static/opacity:1）
    // → 容器 opacity 已被清，无值可查 → 退化用真值低透明度唯一值（0.5）
    const input = `<template>
  <div>
    <div class="c-x-group-3">
      <div class="c-x-group-3-bg" :style="{ backgroundImage: 'url(' + bg3 + ')' }"></div>
      <div class="c-x-icon"><img :src="icon1" /></div>
    </div>
  </div>
</template>
<style scoped>
.c-x-icon { display: flex; }
</style>`
    const files = {
      'package/components/X.vue': input,
      'resources/styles/common.less': '.c-x-group-3 {\n  display: flex;\n}',
    }
    const report = fixMisplacedContainerOpacity(files, NODE_DATA, {})
    expect(report.fixed).toHaveLength(1)
    expect(report.fixed[0].inlineOnly).toBe(true)
    const outVue = files['package/components/X.vue']
    expect(outVue).toMatch(/c-x-group-3-bg"[^>]*:style="\{[^"]*position:\s*'absolute'/)
    expect(outVue).toMatch(/c-x-group-3-bg"[^>]*:style="\{[^"]*opacity:\s*0\.5/)
    // 容器 inline relative
    expect(outVue).toMatch(/class="c-x-group-3" style="position: relative;"/)
    // 模板不重复插入 -bg 元素（仍只 1 处）
    expect((outVue.match(/class="c-x-group-3-bg"/g) || []).length).toBe(1)
  })

  it('fail-open：半修正态但真值低透明度不唯一 → 不动（避免臆造透明度）', () => {
    const input = `<template>
  <div>
    <div class="c-x-group-4">
      <div class="c-x-group-4-bg" :style="{ backgroundImage: 'url(' + bg4 + ')' }"></div>
      <span>x</span>
    </div>
  </div>
</template>
<style scoped>
.x { color: #fff; }
</style>`
    const files = {
      'package/components/X.vue': input,
      'resources/styles/common.less': '.c-x-group-4 {\n  display: flex;\n}',
    }
    const MULTI = {
      children: [
        { name: 'a', type: 'GROUP', opacity: 0.5 },
        { name: 'b', type: 'GROUP', opacity: 0.8 },
      ],
    }
    const report = fixMisplacedContainerOpacity(files, MULTI, {})
    expect(report.fixed).toHaveLength(0)
    expect(files['resources/styles/common.less']).not.toContain('c-x-group-4-bg')
  })
})

describe("fixMisplacedContainerOpacity 遍历防护（2026-10-15 · a715fafc 爆栈实锤）", () => {
  it("循环引用 nodeData 不再爆栈（WeakSet seen）", () => {
    const a: any = { opacity: 0.5, children: [] }
    const b: any = { children: [a], parent: null }
    a.children.push(b)
    b.parent = a // a ↔ b 循环
    expect(() =>
      fixMisplacedContainerOpacity({}, b, {}),
    ).not.toThrow()
  })

  it("数组嵌套节点仍被枚举（原 else-if 死代码语义保持）", () => {
    // opacity 藏在数组嵌套里：旧代码走不到（死代码），新代码统一 object 分支递归到
    // 本用例只验证「不爆栈且正常返回」（枚举路径不炸）
    const tree: any = { children: [{ opacity: 0.3 }, [{ opacity: 0.4 }]] }
    expect(() => fixMisplacedContainerOpacity({}, tree, {})).not.toThrow()
  })

  it("正常 JSON 树行为不回归（真值 opacity 可收集）", () => {
    const files = { "package/components/Card.vue": "<template><div>t</div></template>" }
    const tree: any = { document: { opacity: 0.6, children: [{ opacity: 0.5 }] } }
    const report = fixMisplacedContainerOpacity(files, tree, {})
    expect(report.fixed).toHaveLength(0)
  })
})
