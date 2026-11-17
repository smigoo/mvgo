/**
 * 🛡️ 2026-11-17 · 段内成员 DOM 真值对账 · 阴阳对照
 *
 * 真机产物形态（mc-max-1794891630233-96b16ae5 · c-monitor-96b16ae5，面板 414×274）：
 *   行1 ContentSection.vue  = <img 28×28> + 空 <div class="…-icon" 28×28> + span+span
 *                             ⇒ ① label 左边界 rel 86，真值 45.4（多出 28+gap9=37）
 *                             ② 两 span 走 inline 流横排，真值 '环境温度\n15:34' 两行塌一行
 *   行2 ContentSection3.vue = <div class="…-icon"><img></div> + column label ⇒ 正确（对照）
 *   行4 ContentSection4.vue = <img> + 空槽 + 单 div 含 '降雨量\n15:34'（class 已 pre-line）
 *
 * 判据刻意不认类名/节点 id：改名后的同结构同尺寸形态必须同样命中。
 */
import {
  buildClassDeclIndex,
  collectMultilineTextTruths,
  findDuplicateIconSlots,
  findFlattenedTextGroups,
  findLiteralNewlineLeaves,
  healSectionMemberDomTruth,
  formatSectionMemberDomTruthLog,
  withInlineStyle,
} from '../section-member-dom-truth.js'

const LESS = `
.c-monitor-icon { color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; min-height: 0; }
.c-monitor-label-wrap { color: #fff; }
.c-monitor-label-text { font-size: 14px; white-space: nowrap; }
.c-monitor-label-time { font-size: 14px; white-space: nowrap; }
.c-monitor-frame-label { display: flex; flex-direction: column; justify-content: center; }
.c-monitor-warning-text { flex: 1; white-space: nowrap; }
.c-monitor-rain-label { white-space: pre-line; }
.c-chart-host { display: block; width: 28px; height: 28px; }
`

/** 行1 真机形态：空槽 + 两个 span（label 两行塌成一行）。 */
const ROW1 = `<template>
  <div class="c-monitor-content-section" data-section-id="1:377" style="display: flex; flex-direction: row; align-items: center;">
    <img :src="icon2" class="c-monitor-content-section-icon" style="width:28px;height:28px;object-fit:contain;flex:none;" alt="" />
    <div class="c-monitor-icon">
      
    </div>
    <div class="c-monitor-label-wrap">
      <span class="c-monitor-label-text">环境温度</span>
      <span class="c-monitor-label-time">15:34</span>
    </div>
    <div class="c-monitor-warning-text">枫港大桥温度到达55℃</div>
  </div>
</template>`

/** 行2 真机形态：槽内包 img（wrapper 不是空槽）+ label 已 column ⇒ 必须逐字不变。 */
const ROW2 = `<template>
  <div class="c-monitor-content-section3" data-section-id="1:388">
    <div style="display:flex;flex-direction:row;align-items:center">
      <div class="c-monitor-icon">
        <img class="c-monitor-icon-img" :src="icon1_2" alt="位移" v-if="icon1_2" style="width:28px;height:28px;object-fit:contain;flex:none" />
      </div>
      <div class="c-monitor-frame-label">
        <span class="c-monitor-label-text">位移</span>
        <span class="c-monitor-label-time">15:34</span>
      </div>
    </div>
  </div>
</template>`

/** 图表挂载点恰好 28×28 且与同父 img 同尺寸 —— ref 排除，绝不能删。 */
const CHART_REF = `<template>
  <div class="c-monitor-row" data-section-id="1:377">
    <img :src="icon2" style="width:28px;height:28px" alt="" />
    <div ref="chart" class="c-chart-host"></div>
  </div>
</template>`

const FIGMA = {
  document: {
    children: [
      {
        id: '1:377',
        type: 'FRAME',
        children: [{ id: '1:384', type: 'TEXT', characters: '环境温度\n15:34' }],
      },
      {
        id: '1:388',
        type: 'FRAME',
        children: [{ id: '1:389', type: 'TEXT', characters: '位移\n15:34' }],
      },
    ],
  },
}

/**
 * 🔴 回灌锚（2026-11-17 · mc-max-1794895488047-f785be7f 真机产物形态）：
 * 真机的 `.c-monitor-icon` **自身没有任何 width/height 声明**，图标位尺寸写在它的
 * **后代**上（`.frame .c-monitor-icon .c-monitor-icon-img{28×28}`），且是 **LESS 嵌套**写法。
 * 这正是旧实现「归因缺陷 + 不懂嵌套」双重失效的现场：F3 之所以"能命中"，全靠把后代
 * 尺寸错挂成自身尺寸。本 fixture 锁死治本后的正确路径（subject 归因 + 后代尺寸兜底）。
 */
const NESTED_LESS = `
.c-monitor-frame-2136636627 {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 9.41px;

  .c-monitor-icon {
    display: flex;
    flex-direction: column;
    margin-left: 9.41px;

    .c-monitor-icon-img {
      width: 28px;
      height: 28px;
      display: block;
    }
  }

  .c-monitor-alert-label {
    display: flex;
    flex-direction: column;
  }
}
`

/** 真机行1 形态：空槽自身零尺寸（尺寸只在后代的嵌套规则里）。 */
const ROW1_NESTED = `<template>
  <div class="c-monitor-frame-2136636625" data-section-id="1:377">
    <img :src="icon2" class="c-monitor-frame-2136636625-icon" style="width:28px;height:28px;object-fit:contain;flex:none;" alt="" />
    <div class="c-monitor-icon">
      
    </div>
    <div class="c-monitor-alert-label">
      <span class="c-monitor-alert-label-name">环境温度</span>
      <span class="c-monitor-alert-label-time">15:34</span>
    </div>
  </div>
</template>`

function nestedFilesOf(vue: string) {
  return {
    'resources/styles/common.less': NESTED_LESS,
    'package/components/ContentSection.vue': vue,
  }
}

describe('真机嵌套形态（归因治本 · 回灌锚 1794895488047）', () => {
  const nestedIndex = buildClassDeclIndex(nestedFilesOf(''))

  it('subject 归因：`.c-monitor-icon` 自身声明里**没有** 28×28（尺寸不属于它）', () => {
    const fact = nestedIndex.get('c-monitor-icon')
    expect(fact).toBeDefined()
    expect(/(?:^|[;\s])width\s*:\s*28px/.test(fact.self)).toBe(false)
    expect(/(?:^|[;\s])height\s*:\s*28px/.test(fact.self)).toBe(false)
  })

  it('祖先归因：`.c-monitor-icon` 的 desc 里**有** 28×28（它承载的图标位尺寸）', () => {
    const fact = nestedIndex.get('c-monitor-icon')
    expect(/(?:^|[;\s])width\s*:\s*28px/.test(fact.desc)).toBe(true)
  })

  it('祖先/后代尺寸不污染自身：`.c-monitor-frame-2136636627` 自身无 width/height', () => {
    const fact = nestedIndex.get('c-monitor-frame-2136636627')
    expect(fact).toBeDefined()
    expect(/(?:^|[;\s])width\s*:/.test(fact.self)).toBe(false)
    expect(fact.self).toContain('flex-direction: row')
  })

  it('F3 阳性：仅靠 desc 兜底也命中空槽（修 A 后不会静默失效）', () => {
    const body = ROW1_NESTED.slice('<template>'.length, -'</template>'.length)
    const slots = findDuplicateIconSlots(body, nestedIndex)
    expect(slots).toHaveLength(1)
    expect(slots[0].classes).toContain('c-monitor-icon')
    expect(slots[0].size).toEqual({ w: 28, h: 28 })
  })

  it('F2 阴性（不重复注入）：label 自身规则已 column ⇒ 零命中，逐字不变', () => {
    const body = ROW1_NESTED.slice('<template>'.length, -'</template>'.length)
    const groups = findFlattenedTextGroups(body, ['环境温度15:34'], nestedIndex)
    // `.c-monitor-alert-label` 作为 subject 时确有 flex-direction:column ⇒ 已竖排，不该再加 inline
    expect(groups).toEqual([])
  })

  it('F2 阳性：同一嵌套形态下 label 自身无 column ⇒ 仍须注入（不因归因修正而漏判）', () => {
    const noColumnLess = NESTED_LESS.replace(
      /\.c-monitor-alert-label \{[\s\S]*?\n  \}/,
      '.c-monitor-alert-label {\n    color: #1f1f1f;\n  }',
    )
    const idx = buildClassDeclIndex({ 'resources/styles/common.less': noColumnLess })
    const body = ROW1_NESTED.slice('<template>'.length, -'</template>'.length)
    const groups = findFlattenedTextGroups(body, ['环境温度15:34'], idx)
    expect(groups).toHaveLength(1)
    expect(groups[0].node.classes).toContain('c-monitor-alert-label')
  })
})

function filesOf(vue: string) {
  return {
    'resources/styles/common.less': LESS,
    'package/components/ContentSection.vue': vue,
  }
}

const declIndex = buildClassDeclIndex(filesOf(''))

describe('collectMultilineTextTruths（真值侧）', () => {
  it('按 data-section-id 取子树，仅返回含 \\n 的 TEXT（去空白归一）', () => {
    expect(collectMultilineTextTruths(FIGMA, ['1:377'])).toEqual(['环境温度15:34'])
    expect(collectMultilineTextTruths(FIGMA, ['1:388'])).toEqual(['位移15:34'])
  })

  it('无精确 section 命中 ⇒ 不兜全树（fail-open，避免跨段误伤）', () => {
    expect(collectMultilineTextTruths(FIGMA, ['9:999'])).toEqual([])
    expect(collectMultilineTextTruths(null, ['1:377'])).toEqual([])
  })
})

describe('F3 重复图标载体（空槽）', () => {
  it('阳性：与同父 <img> 同尺寸的零内容槽 ⇒ 命中', () => {
    const slots = findDuplicateIconSlots(
      ROW1.slice('<template>'.length, -'</template>'.length),
      declIndex,
    )
    expect(slots).toHaveLength(1)
    expect(slots[0].classes).toContain('c-monitor-icon')
    expect(slots[0].size).toEqual({ w: 28, h: 28 })
  })

  it('阴性：槽内含 <img>（wrapper）⇒ 不算空槽', () => {
    const body = ROW2.slice('<template>'.length, -'</template>'.length)
    expect(findDuplicateIconSlots(body, declIndex)).toEqual([])
  })

  it('阴性：ref 锚点（图表挂载点，尺寸恰好同 img）⇒ 不碰', () => {
    const body = CHART_REF.slice('<template>'.length, -'</template>'.length)
    expect(findDuplicateIconSlots(body, declIndex)).toEqual([])
  })
})

describe('F2 多行文本被压成一行', () => {
  it('阳性：两个纯静态文本叶子的拼接命中真值 \n TEXT ⇒ 命中', () => {
    const body = ROW1.slice('<template>'.length, -'</template>'.length)
    const groups = findFlattenedTextGroups(body, ['环境温度15:34'], declIndex)
    expect(groups).toHaveLength(1)
  })

  it('阴性：拼接不匹配任何真值 ⇒ 零命中', () => {
    const body = ROW1.slice('<template>'.length, -'</template>'.length)
    expect(findFlattenedTextGroups(body, ['枫港大桥温度到达55℃'], declIndex)).toEqual([])
  })

  it('阴性（治本验收锚）：容器已 flex-direction:column ⇒ 零命中，产物逐字不变', () => {
    const body = ROW2.slice('<template>'.length, -'</template>'.length)
    const groups = findFlattenedTextGroups(body, ['位移15:34'], declIndex)
    // frame-label 已 column ⇒ 不入 hits；若嵌套容器被误判，这里会 >0
    expect(groups).toEqual([])
  })
})

describe('F2b 模板字面量换行（纯文本叶）', () => {
  it('阳性：叶内确有第二行文本 ⇒ 追加 white-space:pre-line', () => {
    const body = `<div class="c-monitor-rain-label">降雨量
15:34</div>`
    const hits = findLiteralNewlineLeaves(body, declIndex)
    // .c-monitor-rain-label 已声明 pre-line ⇒ 不重复加
    expect(hits).toEqual([])
    const body2 = `<div class="c-monitor-x">降雨量
15:34</div>`
    expect(findLiteralNewlineLeaves(body2, declIndex)).toHaveLength(1)
  })

  it('阴性（回灌锚 · mc-max-1794893135171-f7db51db 实锤）：只有源码缩进收尾换行的单行文本 ⇒ 零命中', () => {
    // 真机产物形态：文本是一整行，`\n` 只是 </div> 前的缩进
    const body = `<div class="c-monitor-card-content">
      枫港大桥温度到达55℃枫港大桥温度到达55℃枫港大桥温度到达55℃
    </div>`
    expect(findLiteralNewlineLeaves(body, declIndex)).toEqual([])
  })

  it('阴性：纯静态单行叶子（无任何换行）⇒ 零命中', () => {
    const body = `<div class="c-monitor-card-content">枫港大桥温度到达55℃</div>`
    expect(findLiteralNewlineLeaves(body, declIndex)).toEqual([])
  })
})

describe('healSectionMemberDomTruth（整体）', () => {
  it('行1：删空槽 + label 竖排；img 与 warning 逐字不变', () => {
    const files = filesOf(ROW1)
    const res = healSectionMemberDomTruth(files, { figmaRoot: FIGMA, declIndex })
    const out = files['package/components/ContentSection.vue']

    expect(res.stats.slotRemoved).toBe(1)
    expect(res.stats.textFlips).toBe(1)
    expect(res.stats.verdict).toBe('healed')

    // 空槽节点整块消失
    expect(out).not.toContain('<div class="c-monitor-icon">')
    // label 容器被追加元素级 inline（inline 恒胜，未改 class 规则）
    expect(out).toContain('<div class="c-monitor-label-wrap" style="display:flex;flex-direction:column;">')
    // 未动的节点逐字保留（影响面锁定）
    expect(out).toContain(
      '<img :src="icon2" class="c-monitor-content-section-icon" style="width:28px;height:28px;object-fit:contain;flex:none;" alt="" />',
    )
    expect(out).toContain('<div class="c-monitor-warning-text">枫港大桥温度到达55℃</div>')
    // class 规则未被改写
    expect(files['resources/styles/common.less']).toBe(LESS)
  })

  it('行2（阳性对照）：已正确产物 ⇒ 零改动、逐字不变', () => {
    const files = filesOf(ROW2)
    const res = healSectionMemberDomTruth(files, { figmaRoot: FIGMA, declIndex })
    expect(files['package/components/ContentSection.vue']).toBe(ROW2)
    expect(res.changes).toEqual([])
    expect(res.stats.verdict).toBe('clean')
  })

  it('幂等：同一输入连跑两次，第二次零改动', () => {
    const files = filesOf(ROW1)
    healSectionMemberDomTruth(files, { figmaRoot: FIGMA, declIndex })
    const once = files['package/components/ContentSection.vue']
    const res2 = healSectionMemberDomTruth(files, { figmaRoot: FIGMA, declIndex })
    expect(files['package/components/ContentSection.vue']).toBe(once)
    expect(res2.changes).toEqual([])
  })

  it('fail-open：无 Figma 树 ⇒ F2 不动，F3 仍按结构事实生效', () => {
    const files = filesOf(ROW1)
    const res = healSectionMemberDomTruth(files, { declIndex })
    const out = files['package/components/ContentSection.vue']
    expect(res.stats.multilineTruths).toBe(0)
    expect(res.stats.textFlips).toBe(0)
    expect(res.stats.slotRemoved).toBe(1)
    expect(out).not.toContain('<div class="c-monitor-icon">')
    expect(out).toContain('<div class="c-monitor-label-wrap">')
    expect(out).not.toContain('flex-direction:column;"')
  })

  it('无已渲染 <img> ⇒ F3 不删（宁留勿丢），F2 仍独立生效', () => {
    const noImg = ROW1.replace(/<img[\s\S]*?\/>/, '')
    const files = filesOf(noImg)
    const res = healSectionMemberDomTruth(files, { figmaRoot: FIGMA, declIndex })
    // F3 前提不成立（无已渲染 img 可对账）⇒ 一个槽都不删
    expect(res.stats.slotRemoved).toBe(0)
    // F2 与 F3 判据独立：文本真值仍然成立 ⇒ 竖排照做
    expect(res.stats.textFlips).toBe(1)
    const out = files['package/components/ContentSection.vue']
    expect(out).toContain('<div class="c-monitor-icon">')
    expect(out).toContain('<div class="c-monitor-label-wrap" style="display:flex;flex-direction:column;">')
  })
})

describe('withInlineStyle（开标签改写）', () => {
  it('无 style ⇒ 追加；已有 style ⇒ 合并到末尾；只有 :style ⇒ 新建静态 style', () => {
    expect(withInlineStyle('<div class="a">', 'display:flex')).toBe(
      '<div class="a" style="display:flex;">',
    )
    expect(withInlineStyle('<div style="color:red">', 'display:flex')).toBe(
      '<div style="color:red;display:flex;">',
    )
    expect(withInlineStyle('<div :style="{color:red}">', 'display:flex')).toBe(
      '<div :style="{color:red}" style="display:flex;">',
    )
  })
})

describe('formatSectionMemberDomTruthLog（恒打计数行）', () => {
  it('0 也打，三态可分', () => {
    const zero = formatSectionMemberDomTruthLog(null)
    expect(zero.message).toContain('evaluated=0')
    expect(zero.message).toContain('verdict=no-evidence')
    expect(zero.meta.skipped).toEqual([])

    const healed = formatSectionMemberDomTruthLog({
      evaluated: 1,
      files: 12,
      multilineTruths: 2,
      textGroups: 2,
      textFlips: 2,
      iconSlots: 2,
      slotRemoved: 2,
      verdict: 'healed',
    })
    expect(healed.message).toBe(
      'sectionMemberDomTruth:evaluated=1,files=12,multilineTruths=2,textGroups=2,textFlips=2,newlineLeaves=0,iconSlots=2,slotRemoved=2,verdict=healed',
    )
  })
})
