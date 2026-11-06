import {
  resolveHeaderTabModels,
  renderHeaderTabTemplate,
  renderHeaderTabScript,
} from './header-tab-slots.js'

const ACTIVE = {
  fontSize: 13,
  color: '#ffffff',
  backgroundColor: 'rgba(25,144,255,1)',
  borderRadius: '10px',
  padding: '2px 10px',
  width: '380px',
}
const INACTIVE = {
  fontSize: 13,
  color: '#6680A0',
  backgroundColor: 'rgba(102,128,160,0.34)',
  borderRadius: '10px',
  padding: '2px 10px',
  width: '380px',
}

function fixture() {
  return {
    headerSlots: [
      { slotType: 'header-right', elementType: 'label', figmaNodeId: '2:7954', content: '江阴靖江长江隧道 江阴大桥' },
    ],
    interactions: [
      { target: '标题右侧Tab切换栏', type: 'tab-switch', defaultState: '江阴靖江长江隧道为激活态' },
    ],
    layoutStructure: {
      layout: {
        sections: [
          {
            id: '2:7959',
            headerSlots: [
              { slotType: 'header-right', elementType: 'tab', figmaNodeId: '2:7954', content: '江阴靖江长江隧道（激活）/ 江阴大桥' },
            ],
            body: {
              children: [
                { id: '2:7955', type: 'tab', role: 'tab', text: '江阴靖江长江隧道', active: true, styles: ACTIVE },
                { id: '2:7957', type: 'tab', role: 'tab', text: '江阴大桥', active: false, styles: INACTIVE },
              ],
            },
          },
        ],
      },
    },
  }
}

describe('header-tab-slots：结构化模型解析', () => {
  it('⭐ fe2b79ed 真机同构：同 nodeId 关联，直接消费逐项 active/styles', () => {
    const { byNodeId, stats } = resolveHeaderTabModels(fixture())
    expect(stats).toEqual({ evaluated: 1, resolved: 1, skippedNoStructure: 0, skippedAmbiguous: 0 })
    const model = byNodeId.get('2:7954')!
    expect(model.activeId).toBe('2:7955')
    expect(model.items.map((i) => i.text)).toEqual(['江阴靖江长江隧道', '江阴大桥'])
    expect(model.activeStyle).toMatchObject({ fontSize: '13px', color: '#ffffff', borderRadius: '10px' })
    expect(model.activeStyle.width).toBeUndefined()
    expect(model.items[0].inactiveStyle.color).toBe('#6680A0')
    expect(model.items[1].inactiveStyle.color).toBe('#6680A0')
  })

  it('无 tab-switch 时不解析、不升级', () => {
    const input = fixture()
    input.interactions = []
    const { byNodeId, stats } = resolveHeaderTabModels(input)
    expect(byNodeId.size).toBe(0)
    expect(stats.evaluated).toBe(0)
  })

  it('没有结构化 tab children 时诚实弃权', () => {
    const input = fixture()
    input.layoutStructure.layout.sections[0].body.children = []
    const { byNodeId, stats } = resolveHeaderTabModels(input)
    expect(byNodeId.size).toBe(0)
    expect(stats.skippedNoStructure).toBe(1)
  })

  it('0 个或多个 active 均不猜默认项', () => {
    for (const activeValues of [[false, false], [true, true]]) {
      const input = fixture()
      const children = input.layoutStructure.layout.sections[0].body.children
      children[0].active = activeValues[0]
      children[1].active = activeValues[1]
      const { byNodeId, stats } = resolveHeaderTabModels(input)
      expect(byNodeId.size).toBe(0)
      expect(stats.skippedAmbiguous).toBe(1)
    }
  })
})

describe('header-tab-slots：确定性模板与 script', () => {
  it('生成真实 v-for/click/ref，不生成业务 API 或伪造刷新事件', () => {
    const model = resolveHeaderTabModels(fixture()).byNodeId.get('2:7954')!
    const template = renderHeaderTabTemplate(model)
    const script = renderHeaderTabScript(model)
    expect(template).toContain('v-for="tab in __mcHeaderTabs_2_7954"')
    expect(template).toContain('@click="__mcActiveHeaderTab_2_7954 = tab.id"')
    expect(template).toContain('{{ tab.text }}')
    expect(script).toContain("const __mcActiveHeaderTab_2_7954 = ref(\"2:7955\")")
    expect(script).toContain('tab.activeStyle : tab.inactiveStyle')
    expect(script).not.toContain('runtimeBuilder')
    expect(script).not.toContain('fetch(')
  })

  it('模型文本不能闭合 script；nodeId 派生合法变量名', () => {
    const model = resolveHeaderTabModels(fixture()).byNodeId.get('2:7954')!
    model.nodeId = '2:7954/x-y'
    model.items[0].text = '</script><script>alert(1)</script>'
    const template = renderHeaderTabTemplate(model)
    const script = renderHeaderTabScript(model)
    expect(template).toContain('__mcHeaderTabs_2_7954_x_y')
    expect(script).toContain('\\u003c/script>')
    expect(script).not.toContain('</script><script>')
  })
})
