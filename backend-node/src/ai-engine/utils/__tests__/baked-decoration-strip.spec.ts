/**
 * 静态资源节点「烘焙装饰」剥离测试（P1-1，2026-08-30）
 *
 * 背景：icon / bg / img 在 Figma 导出时整块栅格化成 PNG，fills / strokes /
 * effects / cornerRadius 已烘焙进像素，代码层再写 border / border-radius /
 * box-shadow / linear-gradient 就是二次还原。
 *
 * 组件一 mc-max-1788065970150 像素实锤：
 *   bg-tab-active-7891 边缘 2px 环近白占比 48.1%、bg-7890 达 85.6%
 *   → 白边来自 Figma strokeWeight 0.6 / CENTER，已烘进 PNG
 */
import { describe, it, expect } from '@jest/globals'
import {
  stripBakedDecorationFromFiles,
  stripBakedDecorationInStyle,
  collectResourceCarrierClasses,
} from '../../validators/code-fix-rules.js'

const MAPPING = [
  {
    resourceFile: '../resources/images/bg-7890.png',
    previewAnalysisRole: 'bg',
    bgRole: 'container',
    assignedVarName: 'bg2',
    figmaBox: { x: 1495, y: 903, width: 295, height: 27 },
    parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  },
  {
    resourceFile: '../resources/images/bg-tab-active-7891.png',
    previewAnalysisRole: 'bg',
    bgRole: 'sub-state',
    assignedVarName: 'bg3',
    figmaBox: { x: 1500, y: 906, width: 78, height: 21 },
    parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  },
  {
    resourceFile: '../resources/images/icon-7941.png',
    previewAnalysisRole: 'icon',
    assignedVarName: 'icon1',
    figmaBox: { x: 1816, y: 905, width: 24, height: 24 },
    parentBox: { x: 1816, y: 905, width: 52, height: 24 },
  },
]

/** 组件一真实产物精简版（类名/结构与磁盘产物一致） */
const FILES = {
  'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1788065970150-62e42150-c-env-monitor-root">
      <div class="c-mc-max-1788065970150-62e42150-c-env-monitor-tabs-section" :style="{ backgroundImage: \`url(\${bg2})\`, backgroundSize: '295px 27px' }">
        <div class="c-mc-max-1788065970150-62e42150-c-env-monitor-tabs-bg" :style="{ backgroundImage: \`url(\${bg2})\`, backgroundSize: '100% 100%' }">
          <div v-for="tab in tabs" :key="tab.value" class="c-env-monitor-tab-item">
            <div v-if="currentTab === tab.value" class="c-mc-max-1788065970150-62e42150-c-env-monitor-tab-active-bg" :style="{ backgroundImage: \`url(\${bg3})\`, backgroundSize: '100% 100%' }"></div>
          </div>
        </div>
        <div class="c-mc-max-1788065970150-62e42150-c-env-monitor-tabs-icon-group">
          <img :src="icon1" class="c-mc-max-1788065970150-62e42150-c-env-monitor-icon-btn" />
        </div>
      </div>
      <div class="c-mc-max-1788065970150-62e42150-c-env-monitor-chart-section"></div>
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/icon-7941.png'
const a = 1
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-tabs-bg {
  display: flex;
  gap: 4px;
  border-radius: 4px;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  z-index: 0;
}

.c-env-monitor-tab-item {
  padding: 6px 12px;
  border-radius: 4px;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
}
</style>
`,
  'resources/styles/common.less': `// 业务样式文件
.c-mc-max-1788065970150-62e42150-c-env-monitor-root {
  width: 420px;
  height: 186px;
  border-radius: 8px;
  box-shadow: 0 4px 10px #4a758d;
}

.c-mc-max-1788065970150-62e42150-c-env-monitor-tabs-bg {
  display: flex;
  gap: 4px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border-radius: 4px;
}

.c-mc-max-1788065970150-62e42150-c-env-monitor-tab-item {
  padding: 6px 16px;
  border-radius: 4px;
}

.c-mc-max-1788065970150-62e42150-c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
  border: 1px solid #ffffff;
  border-radius: 4px;
  z-index: 0;
}

.c-mc-max-1788065970150-62e42150-c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  background-image: url(../resources/images/bg-7890.png);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 4px;
  padding: 16px;
}
`,
}

const LESS = FILES['resources/styles/common.less']
const VUE = FILES['package/index.vue']

describe('stripBakedDecorationFromFiles（P1-1）', () => {
  const out = stripBakedDecorationFromFiles({ ...FILES }, MAPPING)

  it('剥离 tab-active-bg 的二次描边与臆造圆角', () => {
    const less = out['resources/styles/common.less']
    expect(less).not.toMatch(/tab-active-bg\s*\{[^}]*border\s*:/)
    expect(less).not.toMatch(/tab-active-bg\s*\{[^}]*border-radius/)
    expect(out['package/index.vue']).not.toMatch(/\.c-env-monitor-tab-active-bg\s*\{[^}]*border-radius/)
  })

  it('剥离承载元素上的烘焙渐变', () => {
    const less = out['resources/styles/common.less']
    expect(less).not.toMatch(/tab-active-bg\s*\{[^}]*linear-gradient/)
    expect(less).not.toMatch(/tabs-bg\s*\{[^}]*linear-gradient/)
  })

  it('保留背景四件套（用户原则④：bg 必须还原 size/position/repeat）', () => {
    const less = out['resources/styles/common.less']
    expect(less).toContain('background-size: 100% 100%')
    expect(less).toContain('background-position: center center')
    expect(less).toContain('background-repeat: no-repeat')
    expect(less).toContain('background-image: url(')
  })

  it('保留几何与布局属性', () => {
    const less = out['resources/styles/common.less']
    for (const decl of [
      'position: absolute',
      'top: 0',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'z-index: 0',
      'flex: 1',
      'min-height: 0',
      'padding: 16px',
      'display: flex',
      'gap: 4px',
      'width: 420px',
      'height: 186px',
    ]) {
      expect(less).toContain(decl)
    }
  })

  it('根容器豁免：root 的 border-radius / box-shadow 保留', () => {
    const less = out['resources/styles/common.less']
    expect(less).toMatch(/-root\s*\{[^}]*border-radius:\s*8px/)
    expect(less).toMatch(/-root\s*\{[^}]*box-shadow/)
  })

  it('非承载元素不误伤：tab-item 的 border-radius 保留', () => {
    expect(out['resources/styles/common.less']).toMatch(/-tab-item\s*\{[^}]*border-radius:\s*4px/)
  })

  it('模板不受影响：inline :style 绑定与 import 原样保留', () => {
    const vue = out['package/index.vue']
    expect(vue).toContain('backgroundImage: `url(${bg2})`')
    expect(vue).toContain('backgroundImage: `url(${bg3})`')
    expect(vue).toContain(':src="icon1"')
    expect(vue).toContain("import bg2 from '../resources/images/bg-7890.png'")
  })

  it('幂等：二次执行结果不变', () => {
    const twice = stripBakedDecorationFromFiles(out, MAPPING)
    expect(twice['resources/styles/common.less']).toBe(out['resources/styles/common.less'])
    expect(twice['package/index.vue']).toBe(out['package/index.vue'])
  })

  it('无资源映射时原样返回（不产生新对象）', () => {
    expect(stripBakedDecorationFromFiles(FILES, null)).toBe(FILES)
    expect(stripBakedDecorationFromFiles(FILES, [])).toBe(FILES)
  })
})

describe('collectResourceCarrierClasses 承载类识别', () => {
  it('模板信号（:style url / :src）+ 样式信号（url 命中资源）双通道', () => {
    const { carriers, rootCls } = collectResourceCarrierClasses(FILES, MAPPING)
    expect(rootCls).toBe('c-mc-max-1788065970150-62e42150-c-env-monitor-root')
    const has = (suffix: string) => [...carriers].some((c) => c.toLowerCase().endsWith(suffix))
    expect(has('c-env-monitor-tabs-section')).toBe(true)
    expect(has('c-env-monitor-tabs-bg')).toBe(true)
    expect(has('c-env-monitor-tab-active-bg')).toBe(true)
    expect(has('c-env-monitor-icon-btn')).toBe(true)
    expect(has('c-env-monitor-chart-section')).toBe(true)
    expect(has('c-env-monitor-tab-item')).toBe(false)
  })

  it('LESS 变量声明与 mixin 不产生承载类', () => {
    const files = {
      'package/index.vue': `<template><div class="c-root"><span class="c-x-a">a</span></div></template>
<style lang="less" scoped>
.c-root { width: 10px; }
</style>`,
      'resources/styles/themes/theme-vars.less': `.theme-dark() {
  @bg-image-7890: url(../resources/images/bg-7890.png);
}
.theme-light() {
  --bg: url(../resources/images/bg-7890.png);
}`,
    }
    const { carriers } = collectResourceCarrierClasses(files, MAPPING)
    expect([...carriers].some((c) => /theme-(dark|light)/.test(c))).toBe(false)
  })

  it('真实渲染的 url() 仍算承载', () => {
    const { carriers } = collectResourceCarrierClasses(
      { 'resources/styles/common.less': '.c-x-card {\n  background-image: url(../resources/images/bg-7890.png);\n}' },
      MAPPING,
    )
    expect([...carriers]).toContain('c-x-card')
  })
})

describe('stripBakedDecorationInStyle 样式层边界', () => {
  it('LESS 嵌套：父块剥离不误伤子块', () => {
    const out = stripBakedDecorationInStyle(
      `.c-a {\n  border-radius: 2px;\n  .c-b {\n    border: 1px solid #fff;\n  }\n}`,
      new Set(['c-a']),
      '',
    )
    expect(out).not.toMatch(/\.c-a\s*\{[^}]*border-radius/)
    expect(out).toMatch(/\.c-b\s*\{[^}]*border:/)
    expect(out).toContain('.c-b {')
  })

  it('注释与 @media 不破坏语法', () => {
    const style = `.c-a {
  /* border: 1px solid #000 */
  // border-radius: 9px
  border-radius: 4px;
}
@media (max-width: 100px) {
  .c-a {
    box-shadow: 0 0 1px #000;
  }
}`
    const out = stripBakedDecorationInStyle(style, new Set(['c-a']), '')
    expect(out).toContain('/* border: 1px solid #000 */')
    expect(out).toContain('// border-radius: 9px')
    expect(out).not.toMatch(/border-radius:\s*4px/)
    expect(out).not.toMatch(/box-shadow/)
    expect((out.match(/\{/g) || []).length).toBe((out.match(/\}/g) || []).length)
  })

  it('纯色背景与 url 背景不被剥离', () => {
    const out = stripBakedDecorationInStyle(
      `.c-a {\n  background: #ffffff;\n  background-image: url(../images/bg.png);\n  background-color: rgba(0,0,0,.5);\n  border-radius: 4px;\n}`,
      new Set(['c-a']),
      '',
    )
    expect(out).toContain('background: #ffffff')
    expect(out).toContain('background-image: url(')
    expect(out).toContain('background-color:')
    expect(out).not.toMatch(/border-radius/)
  })

  it('多值 box-shadow 跨行声明整条剥离', () => {
    const out = stripBakedDecorationInStyle(
      `.c-a {\n  box-shadow:\n    0 0 1px #fff,\n    0 0 2px #000;\n  width: 10px;\n}`,
      new Set(['c-a']),
      '',
    )
    expect(out).not.toMatch(/box-shadow/)
    expect(out).toContain('width: 10px')
  })
})
