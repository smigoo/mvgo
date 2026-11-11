/**
 * SCRIPT_GLOBALS 浏览器全局白名单回归（2026-11-11 · 6a16224a 实锤误杀）
 *
 * 实锤：`TunnelFlowChart.vue` 的 `<script setup>` 里写
 *   `getComputedStyle(echartsRef.value)`（echarts 容器尺寸测量的标准写法），
 * 语义门禁把它判成「未声明的自由变量」⇒「组件文件语义不完整，拒绝产出坏文件」⇒ 整任务 failed。
 *
 * 白名单原则（见 sfc-semantics.js 文件头注释）：宁可多列、不可漏列 —— 漏列 = 误杀 = fail-closed。
 */
// 同 sfc-semantics.spec.ts 惯例：backend-root / acorn-optional-loader 用工厂 mock 绕过
// import.meta 在 ts-jest CJS 下的解析期报错。
jest.mock('../../../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })

jest.mock('../acorn-optional-loader.js', () => {
  let acornParser = null
  let acornWalker = null
  try {
    acornParser = require('acorn')
    acornWalker = require('acorn-walk')
  } catch { /* 缺失降级，与生产语义一致 */ }
  return { acornParser, acornWalker }
}, { virtual: true })

import { validateVueScriptSemantics } from '../sfc-semantics.js';

const sfc = (script) => `<template><div ref="el" /></template>\n<script setup>\n${script}\n</script>`;

const issuesOf = (r) => (Array.isArray(r?.issues) ? r.issues.join('\n') : String(r ?? ''));

describe('SCRIPT_GLOBALS 浏览器全局白名单', () => {
  it('阳性：getComputedStyle(容器) 不再被判「未声明的自由变量」（6a16224a 原形态）', () => {
    const r = validateVueScriptSemantics(
      sfc(`import { ref, onMounted } from 'vue'
const el = ref(null)
onMounted(() => {
  if (!el.value) return
  const cs = getComputedStyle(el.value)
  console.log(cs.width)
})`),
      'package/components/TunnelFlowChart.vue',
    );
    expect(issuesOf(r)).not.toContain('未声明的自由变量');
  });

  it('阳性：matchMedia / devicePixelRatio / Image / document 等规范内建同样放行', () => {
    const r = validateVueScriptSemantics(
      sfc(`const mq = matchMedia('(min-width: 600px)')
const dpr = devicePixelRatio
const img = new Image()
document.body.appendChild(img)
const t = new TextEncoder()`),
      'package/components/Globals.vue',
    );
    expect(issuesOf(r)).not.toContain('未声明的自由变量');
  });

  it('阴性（防放水）：真正的未声明变量仍被拦下', () => {
    const r = validateVueScriptSemantics(
      sfc(`const y = totallyUnknownHelper(1)`),
      'package/components/Bad.vue',
    );
    expect(issuesOf(r)).toContain('未声明的自由变量');
    expect(issuesOf(r)).toContain('totallyUnknownHelper');
  });

  it('数据驱动生效：手写清单里没有的规范全局（CSSStyleSheet/DOMTokenList/Selection/CanvasGradient）同样放行', () => {
    // 这 4 个名字从未出现在 sfc-semantics.js 的手写清单中，只可能来自 globals.browser
    // ⇒ 本用例通过即证明「数据源驱动」生效，而非又一次手写补漏。
    const r = validateVueScriptSemantics(
      sfc(`const a = new CSSStyleSheet()
const b = DOMTokenList
const c = Selection
const d = CanvasGradient`),
      'package/components/DrivenGlobals.vue',
    );
    expect(issuesOf(r)).not.toContain('未声明的自由变量');
  });
});
