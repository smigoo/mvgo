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
