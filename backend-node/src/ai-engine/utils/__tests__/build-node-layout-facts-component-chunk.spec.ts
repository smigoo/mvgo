/**
 * B' P3.5 回归：component chunk（buildCodePrompt 路径）也必须携带
 * 「布局模型确定性约束」块（Figma 几何真值），scoped 样式段 display 必写。
 *
 * 背景（实测 c-env-monitor-5c2a93d7）：
 * - style chunk（buildStyleChunkPrompt）有 B' 块 → LLM 5/5 容器全写 display:flex ✅
 * - component chunk（buildCodePrompt）无 B' 块 → chunk 2 三个 section 全漏、chunk 3/4/5 为 0 🔴
 *   → 最终产物的 scoped display 全靠收敛层规则①②事后补 → 删减法 P4 被卡。
 * P3.5：buildAllConstraintReinforcements 增 figmaNodeData/designFacts → 注入 component chunk。
 */

const NODE_FACTS = {
  '2:7889': {
    display: 'flex',
    flexDirection: 'row',
    source: 'geometric-inference',
    confidence: 'low',
  },
}

describe("B' P3.5: buildAllConstraintReinforcements 注入 component chunk", () => {
  it('传 figmaNodeData（无 designFacts）时现算 facts 并输出 B-prime 强制约束块', () => {
    const { buildAllConstraintReinforcements } = require('../constraint-reinforcement.js')
    const figmaNodeData = {
      document: {
        id: '2:7879',
        name: 'cp-环境监测',
        children: [
          {
            id: '2:7889',
            name: 'tabs-list',
            layoutMode: 'NONE',
            children: [
              { id: '89:42', name: 'sub-t', absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 20 } },
              { id: '89:43', name: 'sub-t2', absoluteBoundingBox: { x: 44, y: 0, width: 40, height: 20 } },
            ],
          },
        ],
      },
    }
    const out = buildAllConstraintReinforcements({ figmaNodeData })
    expect(out).toContain('布局模型确定性约束')
    expect(out).toContain('2:7889')
    expect(out).toContain('tabs-list')
    expect(out).toContain('display: flex; flex-direction: row;')
  })

  it('传 designFacts.nodeLayoutFacts（优先）时直接使用，不重算', () => {
    const { buildAllConstraintReinforcements } = require('../constraint-reinforcement.js')
    const out = buildAllConstraintReinforcements({
      designFacts: { nodeLayoutFacts: NODE_FACTS },
      figmaNodeData: null,
    })
    expect(out).toContain('布局模型确定性约束')
    expect(out).toContain('2:7889')
    // figmaNodeData 为 null → name 回退为 node id 本身，仍要命中
    expect(out).toContain('geometric-inference')
  })

  it('两者皆缺时 fail-open：不新增约束块（保持既有输出）', () => {
    const { buildAllConstraintReinforcements } = require('../constraint-reinforcement.js')
    const out = buildAllConstraintReinforcements({ layoutStructure: { sections: [] } })
    expect(out).not.toContain('布局模型确定性约束')
  })
})
