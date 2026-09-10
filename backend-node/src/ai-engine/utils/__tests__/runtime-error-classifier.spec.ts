import {
  hasDeterministicRuntimeMissing,
  DETERMINISTIC_MISSING_PATTERNS,
  DETERMINISTIC_RENDER_ERROR_TYPES,
} from '../runtime-error-classifier.js'

const mkIssue = (id, evidence) => ({ id, evidence })

describe('hasDeterministicRuntimeMissing — 确定性运行时错误判定（立项统一治理 G1）', () => {
  it('空 / 无 issues → false', () => {
    expect(hasDeterministicRuntimeMissing(null)).toBe(false)
    expect(hasDeterministicRuntimeMissing({})).toBe(false)
    expect(hasDeterministicRuntimeMissing({ issues: [] })).toBe(false)
  })

  it('引用型 TDZ：Cannot access X before initialization → true（env 样本 mc-max-1789019718053-fb0a0de7）', () => {
    const gate = {
      issues: [
        mkIssue('RUNTIME-009', {
          errors: [{ message: "Cannot access 'activeTab' before initialization" }],
        }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(true)
  })

  it('E 类：Cannot read properties of undefined → true', () => {
    const gate = {
      issues: [
        mkIssue('RUNTIME-010', {
          errors: [{ text: 'Uncaught (in promise) Cannot read properties of undefined (reading "length")' }],
        }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(true)
  })

  it('X is not defined (ReferenceError) → true', () => {
    const gate = {
      issues: [
        mkIssue('RUNTIME-009', { errors: [{ message: 'echarts is not defined' }] }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(true)
  })

  it('结构化信号：RUNTIME-004 + errorType=vue-render → true（不依赖文本正则）', () => {
    const gate = {
      issues: [mkIssue('RUNTIME-004', { errorType: 'vue-render', status: 'render-error' })],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(true)
  })

  it('非确定性 RUNTIME-004（load-error / 无 errorType）→ false（环境类不升级）', () => {
    const gate = {
      issues: [mkIssue('RUNTIME-004', { errorType: 'load-error', status: 'load-error' })],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(false)
  })

  it('环境类 RUNTIME-007（资源缺失）即使带 console 也不命中', () => {
    const gate = {
      issues: [
        mkIssue('RUNTIME-007', { responses: [{ status: 404 }] }),
        mkIssue('RUNTIME-010', { errors: [{ text: 'Failed to load resource: 404' }] }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(false)
  })

  it('仅 ID 不在 RUNTIME-004/009/010 的 issue → false（不误伤环境类）', () => {
    const gate = {
      issues: [
        mkIssue('RUNTIME-012', { note: '截图全白' }),
        mkIssue('RUNTIME-001', { note: '导航不可达' }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(gate)).toBe(false)
  })

  it('降级发布分支条件：isGenerateMode && !isDeterministicMissing 时 TDZ 不再被放行', () => {
    // 直接验证「此前被降级的 TDZ」现在会被判定为确定性缺失，
    // 配合 graphs/mc-component-graph-phase2.js:4184 的 isDeterministicMissing 即可走硬 BLOCK。
    const tdzGate = {
      issues: [
        mkIssue('RUNTIME-009', { errors: [{ message: "Cannot access 'activeTab' before initialization" }] }),
      ],
    }
    expect(hasDeterministicRuntimeMissing(tdzGate)).toBe(true)
  })
})

describe('导出物与扩展白名单一致', () => {
  it('DETERMINISTIC_MISSING_PATTERNS 含 TDZ 与 vue-render 相关模式', () => {
    const src = DETERMINISTIC_MISSING_PATTERNS.map((r) => r.source).join('\n')
    expect(src).toMatch(/Cannot access .*? before initialization/)
    expect(src).toMatch(/is not defined/)
    expect(src).toMatch(/Cannot read properties of undefined/)
  })
  it('DETERMINISTIC_RENDER_ERROR_TYPES 含 vue-render', () => {
    expect(DETERMINISTIC_RENDER_ERROR_TYPES.has('vue-render')).toBe(true)
  })
})
