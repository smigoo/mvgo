// Mock 全链路统一入口
// 页面用 createRun() 逐步推进（可见阶段进度），Node 冒烟脚本用 runMockPipeline() 一次跑完。

import { fixtures, fixtureList } from '../fixtures/transcripts.js'
import { STAGES, createRun } from './run.js'

export { fixtures, fixtureList }
export { STAGES, createRun }
export { mockAudioAdapter } from './audio-adapter.js'
export { mockGenerationAdapter } from './generation-adapter.js'
export { validateDraft } from './validator.js'
export {
  composeArticle,
  validateArticle,
  buildCompositionFingerprint,
  isCompositionCurrent,
  localCompositionAdapter,
  cloudCompositionAdapter,
  cloudCompositionReadiness,
  compositionAdapterContractCheck
} from './composition-adapter.js'
export { REQUIRED_FIELDS, detectInjection, splitBackground, MAX_CONTEXT_CHARS } from './constraint-composer.js'
export { EXPECTATIONS, COMMON_EXPECTATIONS } from '../fixtures/expectations.js'

export const defaultConfig = () => ({
  meetingType: '',
  primaryLanguage: 'zh-CN',
  outputLanguage: 'meeting_primary',
  background: '',
  instruction: ''
})

export function runMockPipeline(fixtureId, config = {}, options = {}) {
  // meetingType 留空时按 fixture 自带类型走，避免模板与转写稿错配
  // options.runSeq 供 FR-12 版本留痕：相同输入 + 不同序号 = 新版本，旧版本人工作业不覆盖
  const effective = { ...defaultConfig(), ...config }
  const runner = createRun(fixtureId, effective, options)
  const run = runner.runToEnd()
  if (run.status !== 'done') {
    throw new Error(`Mock 链路未正常结束：${run.status} ${run.error?.message || ''}`)
  }
  return run
}

export function fixtureOf(fixtureId) {
  return fixtures[fixtureId]
}
