/**
 * 自适应策略单一事实源 —— 离线验证探针
 * ------------------------------------------------------------
 * 用法（cwd = backend-node）：
 *   env -i PATH="<node>/bin:/usr/local/bin:/usr/bin:/bin" HOME="$HOME" \
 *     node scripts/check-fit-strategy.mjs
 *
 * 为什么单独一个脚本：`outputScaleMode` 过去是**死字段**（UI 选了不影响产物）。
 * 这条链路一旦再断，用户看到的就是"假选项"——必须能一条命令验证。
 * 本脚本零 LLM、零网络、零数据库。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  FIT_MODES,
  DEFAULT_FIT_MODE,
  normalizeFitMode,
  readFitMode,
  getFitSpec,
  describeFitMode,
  buildFitConstraint,
  buildPreviewAppCss,
  checkFitHonored,
} from '../src/ai-engine/utils/layout-fit-strategy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log('  ✅ ' + name)
  } else {
    fail++
    failures.push(name + (extra ? '  → ' + extra : ''))
    console.log('  ❌ ' + name + (extra ? '  → ' + extra : ''))
  }
}

const mkLayout = (mode, w = 1920, h = 1080) => ({
  canvas: { width: w, height: h, outputScaleMode: mode },
})

console.log('='.repeat(72))
console.log('1) 枚举与归一化')
ok('FIT_MODES 恰好 6 项', FIT_MODES.length === 6, '实际 ' + FIT_MODES.length)
ok('默认策略 = fluid', DEFAULT_FIT_MODE === 'fluid')
for (const m of FIT_MODES) ok('合法值透传: ' + m, normalizeFitMode(m) === m)
ok('undefined → fluid', normalizeFitMode(undefined) === 'fluid')
ok('null → fluid', normalizeFitMode(null) === 'fluid')
ok('历史非法值 stretch → fluid', normalizeFitMode('stretch') === 'fluid')
ok('旧枚举 contain 仍透传（向后兼容）', normalizeFitMode('contain') === 'contain')
ok('readFitMode 从 canvas 读取', readFitMode(mkLayout('hybrid')) === 'hybrid')
ok('readFitMode 空对象 → fluid', readFitMode({}) === 'fluid')
ok('getFitSpec 未知值走 fluid', getFitSpec('nope').name === getFitSpec('fluid').name)

console.log('='.repeat(72))
console.log('2) 注入 LLM 的强约束文本')
{
  const txt = buildFitConstraint(mkLayout('fluid', 2560, 1440))
  ok('含策略标识 fluid', txt.includes('`fluid`'))
  ok('含设计稿基准 2560 × 1440', txt.includes('2560 × 1440'))
  ok('含"强约束"纪律段', txt.includes('不得') && txt.includes('强约束'))
  ok('含逐条实现要求', txt.includes('不做任何整体 transform 缩放'))
  const txtNone = buildFitConstraint(mkLayout('none'))
  ok('none 策略要求固定尺寸', txtNone.includes('固定 `px`'))
  const txtHybrid = buildFitConstraint(mkLayout('hybrid'))
  ok('hybrid 策略禁止非等比', txtHybrid.includes('scaleX 与 scaleY 必须相等'))
  const txtUnknown = buildFitConstraint(mkLayout(undefined))
  ok('未声明策略时按 fluid 注入', txtUnknown.includes('`fluid`'))
}

console.log('='.repeat(72))
console.log('3) 预览缩放跟随策略（设计稿 1920×1080 → 断点 1440×900）')
{
  const bp = { width: 1440, height: 900, label: '1440x900' }
  const css = (mode) => buildPreviewAppCss(mkLayout(mode), bp)

  const fluid = css('fluid')
  ok('fluid: 盒子 = 断点视口（1440px）', /width:\s*1440px/.test(fluid))
  ok('fluid: 不做整体缩放', !/transform/.test(fluid))

  const none = css('none')
  ok('none: 盒子 = 设计稿（1920px）', /width:\s*1920px/.test(none))
  ok('none: 不做整体缩放', !/transform/.test(none))

  // min(1440/1920, 900/1080) = min(0.75, 0.8333) = 0.75
  ok('contain: scale(0.75)', /transform:\s*scale\(0\.75\)/.test(css('contain')), css('contain'))
  ok('hybrid: scale(0.75)', /transform:\s*scale\(0\.75\)/.test(css('hybrid')), css('hybrid'))
  ok('fillWidth: scale(0.75)', /transform:\s*scale\(0\.75\)/.test(css('fillWidth')), css('fillWidth'))
  ok('fillHeight: scale(0.833333)', /transform:\s*scale\(0\.833333\)/.test(css('fillHeight')), css('fillHeight'))

  // 断点缺省时回落设计稿尺寸，不应崩
  const noBp = buildPreviewAppCss(mkLayout('contain'), undefined)
  ok('断点缺省不崩且为 1:1', /transform:\s*scale\(1\)/.test(noBp), noBp)
}

console.log('='.repeat(72))
console.log('4) 产物一致性校验 checkFitHonored')
{
  ok('fluid + 无 transform → 通过', checkFitHonored('fluid', '.a{display:flex}') === true)
  ok('fluid + scale(0.5) → 判不遵守', checkFitHonored('fluid', '.a{transform: scale(0.5)}') === false)
  ok('fluid + scale(1) → 视为无操作，通过', checkFitHonored('fluid', '.a{transform: scale(1)}') === true)
  ok('hybrid + 等比 scale → 通过', checkFitHonored('hybrid', '.a{transform: scale(0.8)}') === true)
  ok('hybrid + scaleX/scaleY 不等 → 判不遵守', checkFitHonored('hybrid', '.a{transform: scaleX(1.2) scaleY(0.8)}') === false)
  ok('hybrid + scaleX/scaleY 相等 → 通过', checkFitHonored('hybrid', '.a{transform: scaleX(0.8) scaleY(0.8)}') === true)
  ok('contain + 任意 scale → 通过（合法）', checkFitHonored('contain', '.a{transform: scale(0.5,0.7)}') === true)
  ok('空代码不误判', checkFitHonored('fluid', '') === true)
  ok('非字符串输入不抛异常', checkFitHonored('fluid', null) === true)
}

console.log('='.repeat(72))
console.log('5) prompt 模板接线（占位符真的存在且能被替换）')
{
  const promptPath = path.resolve(
    __dirname,
    '../src/ai-engine/prompts/layout-responsive-prompt.md',
  )
  const tpl = fs.readFileSync(promptPath, 'utf8')
  const occurrences = tpl.split('{{fitStrategy}}').length - 1
  ok('模板含 {{fitStrategy}} 恰好 1 处', occurrences === 1, '实际 ' + occurrences)
  ok('模板声明了策略优先级规则', tpl.includes('自适应策略优先于一切'))
  ok('模板输出块要求回填 fitMode', tpl.includes('"fitMode"'))

  const rendered = tpl.replace('{{fitStrategy}}', buildFitConstraint(mkLayout('fillWidth')))
  ok('替换后无残留占位符', !rendered.includes('{{fitStrategy}}'))
  ok('替换后注入内容可见', rendered.includes('`fillWidth`') && rendered.includes('宽度铺满容器'))
}

console.log('='.repeat(72))
console.log('6) agent / graph 已接线（文本级检查，防回退）')
{
  const agentSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/ai-engine/agents/layout-responsive-agent.js'),
    'utf8',
  )
  ok('agent 注入了 fitStrategy', agentSrc.includes("prompt.replace('{{fitStrategy}}'"))

  const graphSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/ai-engine/graphs/layout-responsive-graph.js'),
    'utf8',
  )
  ok('graph 使用 buildPreviewAppCss', graphSrc.includes('buildPreviewAppCss('))
  ok('graph 使用 checkFitHonored', graphSrc.includes('checkFitHonored('))
  ok('graph 已移除写死的 scale(calc(100vw', !graphSrc.includes('scale(calc(100vw'))
  ok('summary 带 fitMode', graphSrc.includes('fitMode,') || graphSrc.includes('fitMode:'))
}

console.log('='.repeat(72))
console.log('7) describeFitMode 可读性')
{
  const d = describeFitMode(mkLayout('hybrid'))
  ok('含名称与标识', d.includes('等比 + 弹性混合') && d.includes('hybrid'), d)
}

console.log('\n' + '='.repeat(72))
console.log(`断言结果: ${pass} 通过 / ${fail} 失败`)
if (failures.length) {
  console.log('失败项:')
  for (const f of failures) console.log('  - ' + f)
}
process.exit(fail > 0 ? 1 : 0)
