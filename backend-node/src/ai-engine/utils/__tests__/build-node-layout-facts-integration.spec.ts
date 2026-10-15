// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
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
import * as fs from 'fs'
import { buildNodeLayoutFacts } from '../figma-node-layout-facts.js'
import { buildNodeLayoutFactsReinforcement } from '../constraint-reinforcement.js'

const CACHED_PATH =
  process.cwd() +
  '/workspace/custom-components/c-env-monitor-a9m5io5z-0b8b2e1e/.mc-gen/cache/figma-node-data.json'

const figmaNodeData = JSON.parse(fs.readFileSync(CACHED_PATH, 'utf-8'))

describe("B' integration: real env-monitor Figma geometry (node 2:7889 = tabs-list)", () => {
  it('derives flex/row fact from REAL geometry (layoutMode was undefined/NONE, must NOT fall back to absolute)', () => {
    const facts = buildNodeLayoutFacts(figmaNodeData)
    const fact = facts['2:7889']
    expect(fact).toBeDefined()
    expect(fact.display).toBe('flex')
    expect(fact.flexDirection).toBe('row')
    expect(fact.source).toBe('geometric-inference')
    console.log('env-monitor 2:7889 fact =', JSON.stringify(fact))
  })

  it('emits a mandatory prompt constraint for tabs-list forcing display:flex; flex-direction:row and forbidding absolute', () => {
    const facts = buildNodeLayoutFacts(figmaNodeData)
    const block = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    expect(block).toContain('2:7889')
    expect(block).toContain('tabs-list')
    expect(block).toContain('display: flex; flex-direction: row;')
    expect(block).toContain('禁止')
    console.log('--- reinforcement block (env-monitor) ---\n' + block)
  })
})
