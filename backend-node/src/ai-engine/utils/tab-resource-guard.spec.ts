/**
 * P1 治本（2026-09-11 · mc-max-1789097821000-c6194696）：tab 项资源引用幻觉校验。
 * 真实样本：tab「监控」resourceFile=bg-8788.png，反查 figmaNodeId=2:8788 属 switch，
 * 不在 tab 真实归属链（tabs 89:39 → tab-active 2:8825 → t-监控 2:8827）内 → 判幻觉并纠正。
 */
import { detectAndFixTabResourceHallucination } from './tab-resource-guard.js'

describe('detectAndFixTabResourceHallucination（tab 资源幻觉校验）', () => {
  // 复刻设备监测真值：tabs(89:39) 下 tab-active(2:8825) 含 TEXT "t-监控"(chars=监控)
  const figmaData = {
    document: {
      id: 'root',
      name: 'cp-设备监测',
      children: [
        {
          id: '89:38',
          name: 'switch',
          children: [
            { id: '2:8787', name: 'active', children: [{ id: '2:8788', name: 'bg', type: 'GROUP' }] },
          ],
        },
        {
          id: '89:39',
          name: 'tabs',
          children: [
            {
              id: '2:8825',
              name: 'tab-active',
              children: [
                { id: '2:8826', name: 'bg', type: 'RECTANGLE', fills: [{ type: 'GRADIENT_LINEAR', gradientStops: [{ color: { r: 0.2, g: 0.4, b: 0.9, a: 1 }, position: 0 }, { color: { r: 0.1, g: 0.2, b: 0.6, a: 1 }, position: 1 }], gradientHandlePositions: [{ x: 0, y: 0 }, { x: 0, y: 1 }] }] },
                { id: '2:8827', name: 't-监控', type: 'TEXT', characters: '监控' },
              ],
            },
          ],
        },
      ],
    },
  }

  const resourceDomMapping = [
    { resourceFile: '../resources/images/bg-8788.png', figmaNodeId: '2:8788', figmaPath: 'cp-设备监测/slot-con/switch/active/bg' },
  ]

  // Vision 语义壳：tab「监控」错引用了 switch 的 bg-8788.png
  const parsed = {
    layout: {
      sections: [
        {
          id: 'section-main',
          name: '主内容区',
          body: {
            children: [
              {
                id: 'section-left-tabs',
                name: '左侧竖向Tab切换栏',
                children: [
                  {
                    id: 'tab-monitor',
                    type: 'tab',
                    name: '监控',
                    resourceFile: '../resources/images/bg-8788.png',
                    recommendedUsage: 'backgroundBlock',
                    icon: { resourceFile: '../resources/images/bg-8788.png' },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  }

  it('tab 项 resourceFile 反查节点不在 tab 归属链 → 判幻觉', () => {
    const { hallucinations } = detectAndFixTabResourceHallucination(parsed, resourceDomMapping, figmaData, { apply: false })
    expect(hallucinations.length).toBeGreaterThan(0)
    expect(hallucinations[0].tabName).toBe('监控')
    expect(hallucinations[0].figmaNodeId).toBe('2:8788')
    expect(hallucinations[0].figmaPath).toContain('switch')
  })

  it('纠正：摘除幻觉 resourceFile + 写 CSS 渐变背景', () => {
    const out = JSON.parse(JSON.stringify(parsed))
    const { applied } = detectAndFixTabResourceHallucination(out, resourceDomMapping, figmaData)
    expect(applied).toBeGreaterThan(0)
    const tab = out.layout.sections[0].body.children[0].children[0]
    expect(tab.resourceFile).toBeUndefined()
    expect(tab.icon.resourceFile).toBeUndefined()
    expect(tab.styles.background).toMatch(/linear-gradient/)
  })

  it('tab 项 resourceFile 真属 tab 归属链 → 不纠正（不误伤）', () => {
    // bg 真实属于 tab：反查 figmaNodeId 落在 tab 归属链内
    const goodMapping = [
      { resourceFile: '../resources/images/bg-8826.png', figmaNodeId: '2:8826', figmaPath: 'cp-设备监测/slot-con/@antd/tab/tab-active/bg' },
    ]
    const goodParsed = {
      layout: {
        sections: [
          {
            id: 'tabs-1',
            body: {
              children: [
                {
                  id: 'tab-ok',
                  type: 'tab',
                  name: '监控',
                  resourceFile: '../resources/images/bg-8826.png',
                },
              ],
            },
          },
        ],
      },
    }
    const { hallucinations, applied } = detectAndFixTabResourceHallucination(goodParsed, goodMapping, figmaData)
    expect(hallucinations.length).toBe(0)
    expect(applied).toBe(0)
  })

  it('无 resourceFile / 无 mapping / 无 figma 树 → 不抛异常、不纠正', () => {
    expect(detectAndFixTabResourceHallucination(null, [], null).hallucinations).toEqual([])
    expect(detectAndFixTabResourceHallucination(parsed, [], figmaData).hallucinations).toEqual([])
    expect(detectAndFixTabResourceHallucination(parsed, resourceDomMapping, null).hallucinations).toEqual([])
  })

  it('tab 项 name 反查不到 Figma 节点 → 不误判（保守跳过）', () => {
    const unknown = {
      layout: {
        sections: [
          {
            body: {
              children: [
                { id: 't-x', type: 'tab', name: '不存在的tab名', resourceFile: '../resources/images/bg-8788.png' },
              ],
            },
          },
        ],
      },
    }
    const { hallucinations } = detectAndFixTabResourceHallucination(unknown, resourceDomMapping, figmaData)
    expect(hallucinations.length).toBe(0)
  })
})
