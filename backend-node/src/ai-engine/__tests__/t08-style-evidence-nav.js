/**
 * T08: styleEvidence 硬性门禁（CODE-014）+ 导航必含 section（P0 修复）
 *
 * - CODE-014：designFacts.root.styleEvidence 某项 allowed:false 时，根容器严禁生成该装饰，
 *   否则 L0-B BLOCK（违反重生成）。验证「有证据可生成 / 无证据臆造即 BLOCK / transparent 不误杀」。
 * - nav-section：detectNavSignal + injectNavSectionIfMissing 确保导航进入 effectiveSections。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'
import { detectNavSignal, injectNavSectionIfMissing } from '../utils/nav-section.js'

const ROOT_ID = 'c-mc-max-1787793678799-ef15d07d'

function buildIndexVue(rootStyleBody) {
  return `<template>
  <div class="${ROOT_ID}">
    <div class="c-monitor-overview">内容</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.${ROOT_ID} {
${rootStyleBody}
}
</style>`
}

// figma 节点：无任何填充/描边/阴影/圆角 → styleEvidence 全 allowed:false
const EMPTY_FIGMA = {
  id: '1:2',
  name: 'Root',
  absoluteBoundingBox: { width: 1440, height: 900 },
  fills: [],
  strokes: [],
  effects: [],
}

// figma 节点：有填充/描边/阴影/圆角 → styleEvidence 全 allowed:true
const RICH_FIGMA = {
  id: '1:2',
  name: 'Root',
  absoluteBoundingBox: { width: 1440, height: 900 },
  fills: [{ visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
  strokes: [{ visible: true }],
  effects: [{ type: 'DROP_SHADOW', visible: true }],
  cornerRadius: 8,
}

function runCode014(figmaNodeData, rootStyleBody) {
  const files = [{ path: 'package/index.vue', content: buildIndexVue(rootStyleBody) }]
  return CodeStructureValidator.validate(files, 'c-monitor', {
    target: 'microcode',
    figmaNodeData,
  })
}

test('CODE-014: 根容器臆造背景/圆角/阴影 → BLOCK（styleEvidence 全 false）', () => {
  const res = runCode014(EMPTY_FIGMA, `  background: #edf4fb;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 6px;`)
  const c014 = res.issues.find((i) => i.id === 'CODE-014')
  assert.ok(c014, '应产生 CODE-014 BLOCK')
  assert.equal(c014.severity, 'BLOCK')
  assert.ok(/background/.test(c014.message))
  assert.ok(/box-shadow/.test(c014.message))
  assert.ok(/border-radius/.test(c014.message))
  assert.equal(res.pass, false)
})

test('CODE-014: 根容器有 Figma 证据（allowed:true）即使生成装饰也不误杀', () => {
  const res = runCode014(RICH_FIGMA, `  background: #ffffff;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);`)
  const c014 = res.issues.find((i) => i.id === 'CODE-014')
  assert.equal(c014, undefined, '有证据时不应产生 CODE-014')
  assert.equal(res.pass, true)
})

test('CODE-014: 根容器 background:transparent 不误判（避免合规组件被 BLOCK）', () => {
  const res = runCode014(EMPTY_FIGMA, `  background: transparent;
  color: #fff;`)
  const c014 = res.issues.find((i) => i.id === 'CODE-014')
  assert.equal(c014, undefined, 'transparent 背景不应触发 CODE-014')
  assert.equal(res.pass, true)
})

test('CODE-014: 仅 border（无背景/阴影）臆造且证据 false → 仅报 border', () => {
  const res = runCode014(EMPTY_FIGMA, `  border: 1px solid #ddd;`)
  const c014 = res.issues.find((i) => i.id === 'CODE-014')
  assert.ok(c014, '应产生 CODE-014')
  assert.ok(/border/.test(c014.message))
  assert.ok(!/background/.test(c014.message))
})

test('CODE-014: border:none / border-radius:0 不误杀（避免合规组件被 BLOCK）', () => {
  const res = runCode014(EMPTY_FIGMA, `  border: none;
  border-radius: 0;
  color: #fff;`)
  const c014 = res.issues.find((i) => i.id === 'CODE-014')
  assert.equal(c014, undefined, 'border:none / border-radius:0 不应触发 CODE-014')
  assert.equal(res.pass, true)
})

test('detectNavSignal: figmaNodeData 含「导航」关键词 → true', () => {
  assert.equal(detectNavSignal({ figmaNodeData: { name: '左侧导航栏', children: [] } }), true)
})

test('detectNavSignal: 无任何导航信号 → false', () => {
  assert.equal(detectNavSignal({ figmaNodeData: { name: 'Root', children: [] } }), false)
  assert.equal(detectNavSignal({}), false)
})

test('detectNavSignal: styleMappings 含 nav class → true', () => {
  assert.equal(detectNavSignal({ styleMappings: { cssClasses: ['.device-dashboard__nav'] } }), true)
})

test('injectNavSectionIfMissing: 有信号且无 nav → 注入 nav section', () => {
  const plan = { effectiveSections: [{ id: 'a', responsibility: 'x' }], isForced: false, minFiles: 0, reason: '' }
  const out = injectNavSectionIfMissing(plan, true)
  assert.equal(out.effectiveSections.length, 2)
  assert.equal(out.effectiveSections[1].id, 'nav')
  assert.equal(out.effectiveSections[1].responsibility, '竖向导航区（分类/菜单切换）')
})

test('injectNavSectionIfMissing: 无信号 → 原 plan 不变', () => {
  const plan = { effectiveSections: [{ id: 'a' }], isForced: false, minFiles: 0, reason: '' }
  const out = injectNavSectionIfMissing(plan, false)
  assert.equal(out, plan)
})

test('injectNavSectionIfMissing: 已含 nav → 不重复注入', () => {
  const plan = { effectiveSections: [{ id: 'nav', responsibility: '竖向导航区（分类/菜单切换）' }], isForced: false, minFiles: 0, reason: '' }
  const out = injectNavSectionIfMissing(plan, true)
  assert.equal(out, plan)
  assert.equal(out.effectiveSections.length, 1)
})
