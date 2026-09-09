// 单元测试：class 命名规范（#75）剥离/注入逻辑
//
// 背景：microcode-engineer.js 的 _stripInstanceIdPrefix / _ensureRootInstanceId /
// _getInstanceId 是被验证过的关键纯函数。它们不依赖 this，故直接通过类原型调用，
// 避免实例化整个 MicrocodeEngineer（会触发 BaseAgent / LLM 等重型依赖）。
//
// 运行（需 Node 20+，且用 stub-loader 顶掉只有 .ts 的 config/backend-root）：
//   node --experimental-loader ./stub-loader.mjs class-naming-strip.test.mjs
// 退出码 0 = 全过，1 = 有失败。

import { register } from 'node:module'
register('./stub-loader.mjs', import.meta.url)

const { MicrocodeEngineer } = await import(
  new URL('../../src/ai-engine/roles/microcode-engineer.js', import.meta.url)
)
const P = MicrocodeEngineer.prototype

let pass = 0
let fail = 0
function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.log('  ✗', name, '\n    expected:', e, '\n    actual:  ', a)
  }
}

const INST = 'mc-max-1787742124556-3c15fc26'
const ROOT = `c-${INST}`

console.log('# _getInstanceId')
eq('from outputPath last segment',
  P._getInstanceId('foo', 'custom-components/mc-max-1787742124556-3c15fc26'), INST)
eq('from componentName c- prefixed',
  P._getInstanceId(`c-${INST}`, 'x'), INST)
eq('non-matching returns empty',
  P._getInstanceId('c-monitor', 'y'), '')

console.log('# _stripInstanceIdPrefix')
eq('strips c-<id>- prefix in class',
  P._stripInstanceIdPrefix('<div class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-left">', INST),
  '<div class="c-monitor-title-left">')
eq('strips <id>- prefix in less selector',
  P._stripInstanceIdPrefix('.c-mc-max-1787742124556-3c15fc26-c-monitor-title-left { color: red; }', INST),
  '.c-monitor-title-left { color: red; }')
eq('keeps root class c-<id> untouched',
  P._stripInstanceIdPrefix('<div class="c-mc-max-1787742124556-3c15fc26">', INST),
  '<div class="c-mc-max-1787742124556-3c15fc26">')
eq('no-op when id empty',
  P._stripInstanceIdPrefix('x', ''), 'x')

console.log('# _ensureRootInstanceId')
const vue = `<template>\n  <div class="c-monitor-root">\n    <span class="c-monitor-title-left">hi</span>\n  </div>\n</template>`
eq('injects root id onto first element',
  P._ensureRootInstanceId(vue, ROOT),
  `<template>\n  <div class="c-monitor-root c-mc-max-1787742124556-3c15fc26">\n    <span class="c-monitor-title-left">hi</span>\n  </div>\n</template>`)
eq('does not duplicate if already present',
  P._ensureRootInstanceId(`<template><div class="c-mc-max-1787742124556-3c15fc26">x</div></template>`, ROOT),
  `<template><div class="c-mc-max-1787742124556-3c15fc26">x</div></template>`)
eq('adds class attr when none',
  P._ensureRootInstanceId(`<template><section>hi</section></template>`, ROOT),
  `<template><section class="c-mc-max-1787742124556-3c15fc26">hi</section></template>`)

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
