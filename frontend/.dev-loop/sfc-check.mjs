// .dev-loop/sfc-check.mjs
// TTR「Test」环节的编译期核验：编译 meeting/index.vue，确认
//   1) template 无编译错误；2) 模板符号全部绑定到 setup（产物里不出现 _ctx.*）。
// 用法：node .dev-loop/sfc-check.mjs
// 注意：必须用 vue 包内置导出的 compiler-sfc（本项目未单独安装 @vue/compiler-sfc）。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'

const file = fileURLToPath(new URL('../src/views/meeting/index.vue', import.meta.url))
const source = readFileSync(file, 'utf8')
const { descriptor, errors } = parse(source, { filename: file })
if (errors.length) {
  console.error('❌ parse errors:', errors.map((e) => e.message))
  process.exit(1)
}

let script
try {
  script = compileScript(descriptor, { id: 'meeting' })
} catch (e) {
  console.error('❌ compileScript failed:', e.message)
  process.exit(1)
}
const bindings = Object.keys(script.bindings || {}).length
console.log('script bindings:', bindings)

const tpl = compileTemplate({
  source: descriptor.template.content,
  filename: file,
  id: 'meeting',
  compilerOptions: { bindingMetadata: script.bindings }
})
if (tpl.errors.length) {
  console.error('❌ template errors:', tpl.errors.map((e) => e.message || String(e)))
  process.exit(1)
}
console.log('template errors:', tpl.errors.length)
console.log('style blocks:', descriptor.styles.length)

const ctxHits = (tpl.code.match(/_ctx\./g) || []).length
console.log('_ctx.* 命中:', ctxHits)

// 工作台新增符号：模板引用到的，必须在 script 里有定义（否则只在运行期炸）
const NEED = [
  'recState', 'recError', 'recResult', 'recElapsedMs', 'recLevel', 'recWavUrl',
  'recStateText', 'recClock', 'recLevelPct', 'recWavName',
  'startRealRecording', 'stopRealRecording', 'resetRealRecording',
  // T-030 多轨采集（A 方案）：设备勾选 / 各轨电平 / 按「设备轨」归属结果
  'micRows', 'micSelectionText', 'micPermGranted', 'micListError',
  'refreshAudioInputs', 'toggleMicDevice', 'recTracks', 'recAttribution',
  // 本机离线转写失败出口：分类结论 + 可操作提示（describeAsrFailure / describeAsrNoAudio）
  'asrError', 'asrErrorHint',
  // FR-03 告知同意（SEC-01）：门禁 UI 已从工作台移除（见 mock-smoke「告知同意面板已下线」）
  // FR-14 数据生命周期（SEC-07）：留存期限与删除
  'DEFAULT_RETENTION_DAYS', 'RETENTION_DAYS_MIN', 'RETENTION_DAYS_MAX', 'EXPIRING_SOON_DAYS',
  'PURGE_ARTIFACTS', 'PURGE_KEEPS',
  'retentionDays', 'retentionSourceText', 'retentionSummary', 'retentionDaysDraft',
  'retentionAudit', 'retentionNotice',
  'applyRetentionDays', 'previewRetentionSweep', 'runRetentionSweep', 'deleteSavedDraft',
  // FR-03 / FR-14 服务端契约形状（debug 契约视图）
  'CONSENT_STATUS', 'consentContractCheck', 'sec01Dependency', 'q04Dependency'
]
const tplSrc = descriptor.template.content
const used = NEED.filter((name) => new RegExp(`\\b${name}\\b`).test(tplSrc))
// 以 compileScript 的 setup bindings 为准：const / function / import 进来的都算已绑定，
// 单靠 `const|function` 正则会误判 import 进来的常量（如 DISCLOSURE_ITEMS）。
const bindingNames = new Set(Object.keys(script.bindings || {}))
const missing = used.filter((name) => !bindingNames.has(name))
console.log(`模板引用新增符号: ${used.length}/${NEED.length}`)
console.log('script 未定义:', missing.length ? missing.join('、') : '无')

if (ctxHits === 0 && missing.length === 0) {
  console.log('✅ SFC 编译通过，新增符号全部绑定到 setup')
} else {
  console.log('⚠️ 存在未绑定到 setup 的模板符号')
  process.exit(1)
}
