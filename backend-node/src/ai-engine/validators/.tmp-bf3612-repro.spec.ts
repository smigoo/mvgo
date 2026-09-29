// 临时 spec：对 bf3612dc 任务目录跑 LessCompileGate.validateDirectory 复现
jest.mock('../../config/backend-root.js', () => ({ workspaceRoot: process.cwd() }), { virtual: true })
import { LessCompileGate } from './less-compile-gate.js'

const DIR = '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1790696917698-bf3612dc'

describe('bf3612dc 复现', () => {
  it('validateDirectory', async () => {
    const r = await LessCompileGate.validateDirectory(DIR)
    console.log('pass =', r.pass, 'blockCount =', r.blockCount)
    for (const d of r.diagnostics) {
      console.log(`[${d.id}] sev=${d.severity} type=${d.sourceType} file=${d.file}:${d.line}:${d.column} heal=${d.healApplied || false}`)
      console.log('   msg:', d.message)
    }
  }, 60000)
})
