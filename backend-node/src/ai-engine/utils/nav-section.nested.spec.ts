import { injectNavSectionIfMissing } from './nav-section.js'

describe('injectNavSectionIfMissing 嵌套容器', () => {
  const sources = {
    figmaNodeData: { name: '导航菜单', children: [] },
    elementStyleMap: { '左侧导航': {} },
  }

  it('叶子已有 nav 时不重复注入，minFiles 仍按叶子计', () => {
    const plan = {
      isForced: true,
      minFiles: 2,
      effectiveSections: [
        {
          id: '89:40',
          title: 'slot-con',
          isLayoutContainer: true,
          layoutSource: 'container-rebuild',
          children: [
            { id: 'nav', title: '导航', responsibility: '竖向导航区' },
            { id: '89:37', title: 'tab' },
          ],
        },
      ],
    }
    const next = injectNavSectionIfMissing(plan, true, sources)
    expect(next).toBe(plan)
    expect(next.effectiveSections).toHaveLength(1)
  })

  it('容器下无 nav 叶子时注入顶层 nav，minFiles=叶子数', () => {
    const plan = {
      isForced: false,
      minFiles: 2,
      effectiveSections: [
        {
          id: '89:40',
          title: 'slot-con',
          isLayoutContainer: true,
          layoutSource: 'container-rebuild',
          children: [
            { id: '89:38', title: 'switch' },
            { id: '89:37', title: 'tab' },
          ],
        },
      ],
    }
    const next = injectNavSectionIfMissing(plan, true, sources)
    expect(next).not.toBe(plan)
    expect(next.effectiveSections.map((s: any) => s.id)).toEqual(['89:40', 'nav'])
    expect(next.minFiles).toBe(3)
    expect(next.isForced).toBe(true)
  })
})
