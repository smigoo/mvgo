import {
  detectRepeatUnitIssues,
  healRepeatUnitIssues,
  buildGeometryIndex,
} from './vfor-repeat-unit-guard.js'

/**
 * 🛡️ 刀 31 spec（2026-10-20 · 47647fae 实锤）：v-for 重复单元几何真值纠偏。
 * fixtures 复刻真实前提：E1 未折叠（无 -list 段）、v-for item 无 sid、
 * 类名是 Figma 原名（group-2136638414 数字段，不吃类名三明治）、同名 class 双份定义。
 */

// figma 节点 fixture
const node = (id, name, x, y, w, h, children = []) => ({
  id,
  name,
  absoluteBoundingBox: { x, y, width: w, height: h },
  children,
})
// 6 个同名同尺寸卡（同 x、y 递增 92 ⇒ 纵向列表；单卡 430×41）
const verticalTree = () =>
  node('0:1', 'root', 0, 0, 500, 600, [
    node('48:5798', 'Group 2136638415', 20, 89, 470, 72, [
      node('48:5801', 'Group 2136638414', 40, 89, 430, 41),
    ]),
    node('48:5815', 'Group 2136638416', 20, 181, 470, 72, [
      node('48:5816', 'Group 2136638414', 40, 181, 430, 41),
    ]),
    node('48:5830', 'Group 2136638417', 20, 273, 470, 72, [
      node('48:5831', 'Group 2136638414', 40, 273, 430, 41),
    ]),
  ])
// 横向列表（3 卡横排）
const horizontalTree = () =>
  node('0:1', 'root', 0, 0, 900, 200, [
    node('9:1', 'row-con', 0, 0, 900, 200, [
      node('9:2', 'card', 0, 0, 280, 160),
      node('9:3', 'card', 300, 0, 280, 160),
      node('9:4', 'card', 600, 0, 280, 160),
    ]),
  ])

// 产物 fixture：47647fae 形态——根锚定卡原型段、v-for item 无 sid、类同名双份
const product47647fae = () => ({
  'package/components/ContentSection.vue': `<template>
  <div data-section-id="48:5801" class="c-x-content-section">
    <div v-for="(node, index) in nodeList" :key="node.name" class="c-x-group-2136638414">
      <span>{{ node.name }}</span>
    </div>
  </div>
</template>
<style scoped>
.c-x-group-2136638414 { width: 100%; height: 100%; display: flex; flex-direction: row; }
</style>`,
  'resources/styles/common.less': `.c-x-content-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
}
.c-x-group-2136638414 { width: 100%;
height: 100%;
  display: flex;
  flex-direction: row;
}`,
})

describe('detectRepeatUnitIssues — v-for 重复单元几何检出', () => {
  it('47647fae 形态：锚=卡原型（同名兄弟×3 纵向）⇒ item height:100% HIT + wrapper row HIT', () => {
    const { issues, stats } = detectRepeatUnitIssues(product47647fae(), {
      figmaRoot: verticalTree(),
    })
    expect(stats.groupFound).toBe(1)
    const item = issues.find((i) => i.id === 'VFOR-UNIT-HEIGHT')
    expect(item).toBeTruthy()
    expect(item.truthPx).toBe(41)
    expect(item.direction).toBe('vertical')
    expect(item.itemCount).toBe(3)
    const wrap = issues.find((i) => i.id === 'VFOR-UNIT-WRAPPER-DIR')
    expect(wrap).toBeTruthy()
    expect(wrap.expected).toBe('column')
    expect(wrap.actual).toBe('row')
  })

  it('横向列表 + item width:100% ⇒ VFOR-UNIT-WIDTH HIT（宽改真值定值）', () => {
    const files = {
      'package/components/List.vue': `<template>
  <div data-section-id="9:1" class="c-l-row">
    <div v-for="c in cards" :key="c.id" class="c-l-card" />
  </div>
</template>`,
      'resources/styles/common.less': `.c-l-row { display: flex; flex-direction: row; }
.c-l-card { width: 100%; height: 100%; }`,
    }
    const { issues } = detectRepeatUnitIssues(files, { figmaRoot: horizontalTree() })
    const w = issues.find((i) => i.id === 'VFOR-UNIT-WIDTH')
    expect(w).toBeTruthy()
    expect(w.truthPx).toBe(280)
    // 横向 + height:100% = 合法（撑满行高）⇒ 不报
    expect(issues.find((i) => i.id === 'VFOR-UNIT-HEIGHT')).toBeFalsy()
  })

  it('交叉方向合法不判：vertical 列表 + item width:100%（撑满行宽天经地义）', () => {
    const files = {
      'package/components/L.vue': `<template>
  <div data-section-id="48:5801" class="c-v-list">
    <div v-for="n in list" :key="n" class="c-v-item" />
  </div>
</template>`,
      'resources/styles/common.less': `.c-v-list { display: flex; flex-direction: column; }
.c-v-item { width: 100%; }`,
    }
    const { issues } = detectRepeatUnitIssues(files, { figmaRoot: verticalTree() })
    expect(issues).toHaveLength(0)
  })

  it('🩺 阳性对照：重复组不存在（单实例）⇒ 不判（fail-open）', () => {
    const single = node('0:1', 'root', 0, 0, 500, 600, [
      node('48:5801', 'Group 2136638414', 40, 89, 430, 41),
    ])
    const { issues, stats } = detectRepeatUnitIssues(product47647fae(), { figmaRoot: single })
    expect(stats.groupFound).toBe(0)
    expect(issues).toHaveLength(0)
  })

  it('🩺 阳性对照：无 figmaRoot / 无锚 sid ⇒ 不判', () => {
    expect(detectRepeatUnitIssues(product47647fae(), {}).issues).toHaveLength(0)
    const noSid = {
      'package/components/X.vue': `<template>
  <div class="c-n-list"><div v-for="i in l" :key="i" class="c-n-item" /></div>
</template>`,
      'resources/styles/common.less': '.c-n-item { height: 100%; }',
    }
    const r = detectRepeatUnitIssues(noSid, { figmaRoot: verticalTree() })
    expect(r.issues).toHaveLength(0)
    expect(r.stats.skippedNoAnchor).toBe(1)
  })

  it('情形乙：锚=列表容器（children 里同名重复组）⇒ 同样可判', () => {
    const tree = node('0:1', 'root', 0, 0, 500, 600, [
      node('5:1', 'list', 0, 0, 470, 300, [
        node('5:2', 'row', 0, 0, 430, 41),
        node('5:3', 'row', 0, 50, 430, 41),
        node('5:4', 'row', 0, 100, 430, 41),
      ]),
    ])
    const files = {
      'package/components/L.vue': `<template>
  <div data-section-id="5:1" class="c-e-list">
    <div v-for="i in l" :key="i" class="c-e-row" />
  </div>
</template>`,
      'resources/styles/common.less': '.c-e-list { display: flex; flex-direction: column; }\n.c-e-row { height: 100%; }',
    }
    const { issues } = detectRepeatUnitIssues(files, { figmaRoot: tree })
    const hit = issues.find((i) => i.id === 'VFOR-UNIT-HEIGHT')
    expect(hit).toBeTruthy()
    expect(hit.truthPx).toBe(41)
  })
})

describe('healRepeatUnitIssues — 确定性自愈（全部出现点 + 幂等）', () => {
  it('item height:100% → 41px：common.less 与 SFC scoped 双份同改；wrapper row → column', () => {
    const files = product47647fae()
    const { issues } = detectRepeatUnitIssues(files, { figmaRoot: verticalTree() })
    const { files: out, healed, failed } = healRepeatUnitIssues(files, issues)
    expect(failed).toHaveLength(0)
    // item：两份规则体都改
    expect(out['resources/styles/common.less']).toContain('height: 41px')
    expect(out['package/components/ContentSection.vue']).toContain('height: 41px')
    expect(out['resources/styles/common.less']).not.toMatch(/\.c-x-group-2136638414[^{]*\{[^}]*height:\s*100%/)
    expect(out['package/components/ContentSection.vue']).not.toMatch(/height:\s*100%/)
    // wrapper：翻转 row → column
    expect(out['resources/styles/common.less']).toMatch(/\.c-x-content-section \{[^}]*flex-direction: column/)
    // 其余属性不受影响
    expect(out['resources/styles/common.less']).toContain('width: 100%') // wrapper 宽不动
    expect(healed.length).toBeGreaterThanOrEqual(3) // item×2 文件 + wrapper×1
  })

  it('幂等：heal 后复检零 issue、二次 heal 零 diff', () => {
    const files = product47647fae()
    const once = healRepeatUnitIssues(
      files,
      detectRepeatUnitIssues(files, { figmaRoot: verticalTree() }).issues,
    )
    const re = detectRepeatUnitIssues(once.files, { figmaRoot: verticalTree() })
    expect(re.issues).toHaveLength(0)
    const twice = healRepeatUnitIssues(once.files, re.issues)
    expect(twice.healed).toHaveLength(0)
    expect(twice.files).toEqual(once.files)
  })

  it('🩺 阳性对照：空 issues ⇒ 零改动', () => {
    const files = product47647fae()
    const { healed, failed, files: out } = healRepeatUnitIssues(files, [])
    expect(healed).toHaveLength(0)
    expect(failed).toHaveLength(0)
    expect(out).toEqual(files)
  })

  it('同名 class 多份规则体但仅一份含 100% ⇒ 只改含 100% 的块，不误伤', () => {
    const files = {
      'package/components/L.vue': `<template>
  <div data-section-id="48:5801" class="c-m-list">
    <div v-for="i in l" :key="i" class="c-m-item" />
  </div>
</template>`,
      'resources/styles/common.less': '.c-m-list { display: flex; flex-direction: column; }\n.c-m-item { height: 100%; }\n.c-m-item { color: red; }',
    }
    const { issues } = detectRepeatUnitIssues(files, { figmaRoot: verticalTree() })
    const { files: out } = healRepeatUnitIssues(files, issues)
    expect(out['resources/styles/common.less']).toContain('height: 41px')
    expect(out['resources/styles/common.less']).toContain('.c-m-item { color: red; }')
  })
})

describe('buildGeometryIndex — 几何索引', () => {
  it('兼容 {document} 包装与裸根；记录 name/尺寸/parentId', () => {
    const t = verticalTree()
    const a = buildGeometryIndex(t)
    const b = buildGeometryIndex({ document: t })
    expect(a.byId.get('48:5801').name).toBe('Group 2136638414')
    expect(a.byId.get('48:5801').height).toBe(41)
    expect(a.byId.get('48:5801').parentId).toBe('48:5798')
    expect(b.byId.get('48:5801').height).toBe(41)
    expect(a.byParent.get('0:1')).toContain('48:5798')
  })
})

describe('healRepeatUnitIssues · LESS 嵌套规则体盲区（2026-10-20 ee06ee24 实锤）', () => {
  // ee06ee24 形态：item 规则含 &:first-child/&:hover 嵌套块，旧实现 `[^{}]*` 整段失配
  // ⇒ heal 只打到编译产物 index.css、漏 SFC 源（特异性更高且重编译覆盖回去）。
  const ee06Product = () => ({
    'package/components/ContentSection.vue': `<template>
  <div data-section-id="48:5801" class="c-x-content-section">
    <div v-for="(n, i) in list" :key="n.name" class="c-x-group-2136638414"
      :style="i === 0 ? { backgroundImage: 'url(' + bg1 + ')' } : {}">
      <span>{{ n.name }}</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-content-section { width: 100%; height: 100%; display: flex; flex-direction: column; }
.c-x-group-2136638414 {width: 100%;
height: 100%;

  display: flex;
  flex-direction: row;
  &:first-child,
  &:hover {
    background: #eeeeee;
  }
}
</style>`,
  })

  it('嵌套规则：顶层 height:100% 改真值 41px，嵌套块原样，复检零 issue', () => {
    const files = ee06Product()
    const det = detectRepeatUnitIssues(files, { figmaRoot: verticalTree() })
    expect(det.issues.length).toBeGreaterThan(0)
    const healed = healRepeatUnitIssues(files, det.issues)
    const after = healed.files['package/components/ContentSection.vue']
    expect(after).toContain('height: 41px')
    // 计数断言：wrapper .c-x-content-section 合法持有 1 处 height:100%；item 块的 100% 必须已被治掉 ⇒ 全文件仅剩 1 处
    expect(after.match(/height:\s*100%/g)).toHaveLength(1)
    // 且这唯一一处属于 wrapper 规则块
    expect(after.match(/\.c-x-content-section\s*\{[^}]*height:\s*100%/)).toBeTruthy()
    // 嵌套块原样保留（不被破坏、不被改写）
    expect(after).toContain('&:first-child')
    expect(after).toContain('&:hover')
    expect(after).toContain("background: #eeeeee")
    // 阳性对照：heal 后复检零 issue
    expect(detectRepeatUnitIssues(healed.files, { figmaRoot: verticalTree() }).issues).toHaveLength(0)
    // 幂等：再 heal 一次零改动
    const again = healRepeatUnitIssues(healed.files, det.issues)
    expect(again.healed).toHaveLength(0)
  })

  it('wrapper 嵌套规则：方向翻转只动顶层声明，嵌套块内 flex-direction 不动', () => {
    // verticalTree 真值 = 纵向；产物 wrapper=row ⇒ 矛盾 ⇒ 应翻转为 column
    const files = {
      'package/components/List.vue': `<template>
  <div data-section-id="48:5801" class="c-x-row-con">
    <div v-for="c in cards" :key="c" class="c-x-card">{{ c }}</div>
  </div>
</template>
<style lang="less" scoped>
.c-x-row-con {
  display: flex;
  flex-direction: row;
  .inner {
    flex-direction: row;
  }
}
.c-x-card { width: 100%; }
</style>`,
    }
    const det = detectRepeatUnitIssues(files, { figmaRoot: verticalTree() })
    const wrapperIssue = det.issues.find((i) => i.role === 'wrapper')
    expect(wrapperIssue).toBeTruthy()
    const healed = healRepeatUnitIssues(files, det.issues)
    const after = healed.files['package/components/List.vue']
    // 顶层翻转为 column
    expect(after).toMatch(/\.c-x-row-con\s*\{[^}]*flex-direction:\s*column/)
    // 嵌套 .inner 的 row 保留
    expect(after).toMatch(/\.inner\s*\{\s*flex-direction:\s*row/)
  })
})
