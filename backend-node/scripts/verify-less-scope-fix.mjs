/**
 * 验证 2026-08-26 治本修复（LESS 根作用域 + headerSlots 兜底 + 资源臆造剥离）
 * 运行：node scripts/verify-less-scope-fix.mjs
 */
import less from 'less'
import { MicrocodeEngineer } from '../dist/ai-engine/roles/microcode-engineer.js'

const eng = Object.create(MicrocodeEngineer.prototype)
eng.logger = { info: () => {}, warn: () => {}, error: () => {} }
eng.componentType = 'microcode'
let pass = 0
let fail = 0
const t = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[1] _buildIndexLessTemplate：根作用域 + 默认主题跟随明暗')
const darkLess = eng._buildIndexLessTemplate('dark')
const lightLess = eng._buildIndexLessTemplate('light')
t('dark 面板调用 .theme-dark()', /^\.theme-dark\(\);$/m.test(darkLess))
t('light 面板调用 .theme-light()', /^\.theme-light\(\);$/m.test(lightLess))
t('根级导入 common.less', /^@import \(multiple\) '\.\/common\.less';$/m.test(darkLess))
t('默认不引入 dark.less/light.less 覆盖层', !/@import '\.\/themes\/(dark|light)\.less'/.test(darkLess))

// ─────────────────────────────────────────────────────────────
console.log('\n[2] 真实 LESS 编译：规则必须落在根作用域（不带 .dark 前缀）')
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const themeVars = `.common(){@font-cn:Arial;}
.theme-dark(){@bg:#0b1e2d;@fg:#fff;}
.theme-light(){@bg:#fff;@fg:#333;}`
const commonLess = `.c-monitor-root{width:100%;height:100%;background:@bg;color:@fg;font-family:@font-cn;}
.c-monitor-tab-item{border-radius:4px;background:rgba(24,255,206,.12);}`
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'less-scope-'))
fs.mkdirSync(path.join(tmpDir, 'themes'))
fs.writeFileSync(path.join(tmpDir, 'themes', 'theme-vars.less'), themeVars)
fs.writeFileSync(path.join(tmpDir, 'common.less'), commonLess)
fs.writeFileSync(path.join(tmpDir, 'index.less'), darkLess)

const out = await less.render(darkLess, { paths: [tmpDir], filename: path.join(tmpDir, 'index.less') })
const rules = (out.css.match(/\{/g) || []).length
const darkScoped = (out.css.match(/^\.dark\s/gm) || []).length
t(`编译成功且有规则 (rules=${rules})`, rules >= 2, out.css.slice(0, 200))
t('无 .dark 作用域前缀的死规则', darkScoped === 0)
t('根级 .c-monitor-root 存在', /^\.c-monitor-root\s*\{/m.test(out.css))
t('变量正确解析（背景 #0b1e2d）', /background:\s*#0b1e2d/.test(out.css), out.css.slice(0, 300))
fs.rmSync(tmpDir, { recursive: true, force: true })

// ─────────────────────────────────────────────────────────────
console.log('\n[3] _unwrapThemeScopedCommonLess：剥离外层主题包裹')
const wrapped = `// biz
.dark {
  .theme-dark();
  .c-monitor-root { background: @bg; }
  .c-monitor-tab { color: @fg; }
}`
const r3 = eng._unwrapThemeScopedCommonLess(wrapped)
t('检测到包裹并剥离', r3.changed && r3.wrapper === '.dark', JSON.stringify(r3).slice(0, 200))
t('剥离后 class 顶格', /^\.c-monitor-root\s*\{/m.test(r3.source), r3.source)
t('剥离时去掉内部主题 mixin 调用', !/\.theme-dark\(\)/.test(r3.source))

const normal = `.c-monitor-root { background: @bg; }\n.c-monitor-tab { color: @fg; }`
t('正常 common.less 不被误改', eng._unwrapThemeScopedCommonLess(normal).changed === false)

const singleRoot = `.c-monitor-root {\n  .c-monitor-tab { color: red; }\n}`
t('单一业务根 class 不被误剥（只剥主题选择器）', eng._unwrapThemeScopedCommonLess(singleRoot).changed === false)

// ─────────────────────────────────────────────────────────────
console.log('\n[4] _stripUndefinedResourceRefs：剥离臆造 bg4/bg5')
const vueWithFakeBg = `<template>
  <div class="root">
    <span :style="{ backgroundImage: \`url(\${bg4})\` }">全部</span>
    <span :style="{ backgroundImage: \`url(\${bg1})\` }">在线</span>
    <img :src="icon9" />
    <img :src="icon1" />
  </div>
</template>
<script setup>
import bg1 from '../resources/images/bg-1.png'
import icon1 from '../resources/images/icon-1.png'
</script>`
const r4 = eng._stripUndefinedResourceRefs(vueWithFakeBg)
t('删除臆造 bg4 引用', !r4.includes('bg4'), r4)
t('保留真实 bg1 引用', r4.includes('bg1'))
t('删除臆造 icon9 的 :src', !r4.includes('icon9'))
t('保留真实 icon1 的 :src', r4.includes(':src="icon1"'))
t('清理空 :style 绑定', !/:style="\{\s*\}"/.test(r4))

// ─────────────────────────────────────────────────────────────
console.log('\n[5] _ensureHeaderSlots：模型只写注释时确定性补齐')
const headerSlots = [
  { slotType: 'header-right', elementType: 'statistic', content: '设备类型 28' },
  { slotType: 'header-right', elementType: 'statistic', content: '设备总数 68562' },
  { slotType: 'title-right', elementType: 'label', content: '更新于 10:24' }
]
const vueEmptySlot = `<template>
  <base-panel class="c-mc-x" panelKey="default-panel">
    <template #header_right>
      <!-- 右侧统计指标 -->
    </template>
    <div class="body">x</div>
  </base-panel>
</template>`
const r5 = eng._ensureHeaderSlots(vueEmptySlot, { headerSlots, componentName: 'mc-x' })
t('空 header_right 被填充真实文案', r5.includes('设备类型 28') && r5.includes('设备总数 68562'), r5)
t('缺失的 title_right 被新建', /<template #title_right>/.test(r5) && r5.includes('更新于 10:24'), r5)
t('注入内容带内联样式保证可见', /<span style="[^"]*font-size:13px/.test(r5))

const vueRealSlot = `<template>
  <base-panel panelKey="default-panel">
    <template #header_right><div class="c-monitor-stats">设备类型 28</div></template>
    <template #title_right><span>更新于 10:24</span></template>
  </base-panel>
</template>`
t('已有真实内容不重复注入', eng._ensureHeaderSlots(vueRealSlot, { headerSlots }) === vueRealSlot)
t('无 headerSlots 时不动代码', eng._ensureHeaderSlots(vueEmptySlot, { headerSlots: [] }) === vueEmptySlot)

// ─────────────────────────────────────────────────────────────
console.log('\n[6] _generateFallbackCssRule：elementStyleMap 键已是 CSS 属性名（#266 修复）')
const esmStyles = {
  'font-size': '20px',
  'background-image': 'url(bg-1.png)',
  'background-size': 'cover',
  'border-radius': '4px',
  'background-color': 'rgba(24,255,206,.12)',
  'align-items': 'center',
  'justify-content': 'space-between',
  'box-shadow': '0 2px 8px rgba(0,0,0,.3)'
}
const r6 = eng._generateFallbackCssRule('c-mc-x-tab', esmStyles)
t('保留 font-size', /font-size:\s*20px/.test(r6), r6)
t('保留 background-image（旧实现会丢弃）', /background-image:\s*url\(bg-1\.png\)/.test(r6), r6)
t('保留 border-radius（旧实现会丢弃）', /border-radius:\s*4px/.test(r6), r6)
t('保留 background-color（旧实现会丢弃）', /background-color:\s*rgba\(24,255,206,\.12\)/.test(r6), r6)
t('保留 align-items（旧实现会丢弃）', /align-items:\s*center/.test(r6), r6)
t('保留 justify-content（旧实现会丢弃）', /justify-content:\s*space-between/.test(r6), r6)
t('保留 box-shadow（旧实现会丢弃）', /box-shadow:\s*0 2px 8px/.test(r6), r6)
t('无样式时回退 TODO', /TODO/.test(eng._generateFallbackCssRule('c-mc-x-empty', {})))

// ─────────────────────────────────────────────────────────────
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
