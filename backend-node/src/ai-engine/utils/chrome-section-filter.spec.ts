import { isChromeOnlySection, stripChromeSectionsInPlace } from './chrome-section-filter.js'

describe('chrome-section-filter：base-panel chrome/content 分流', () => {
  it('title-itself / panel-title / title-note / sub-header 不进入业务 sections', () => {
    const parsed: any = {
      layout: {
        sections: [
          { id: 'panel-title', name: '环境监测', headerRelation: 'title-itself' },
          { id: 'daily-total', name: '当日总流量', role: 'stat', body: { children: [{ type: 'card', name: '68109' }] } },
          { id: 'note', name: '更新时间', headerRelation: 'title-note' },
          { id: 'sub-header-traffic', name: 'sub-header', headerRelation: 'sub-header' },
          { id: 'vehicle', name: '车型分布', role: 'chart', body: { children: [{ type: 'pie-chart', name: '车型环图' }] } },
        ],
      },
    }

    const removed = stripChromeSectionsInPlace(parsed)

    expect(removed.map((r) => r.id)).toEqual(['panel-title', 'note', 'sub-header-traffic'])
    expect(parsed.layout.sections.map((s: any) => s.id)).toEqual(['daily-total', 'vehicle'])
  })

  it('同时清理 layoutStructure.sections / layoutStructure.layout.sections / 顶层 sections', () => {
    const parsed: any = {
      sections: [
        { id: 'top-title', name: 'panel-title' },
        { id: 'content-a', name: '设备列表', body: { children: [{ type: 'grid', name: '设备卡片' }] } },
      ],
      layoutStructure: {
        sections: [
          { id: 'ls-title', name: 'title-note' },
          { id: 'ls-content', name: '告警标签', role: 'list', body: { children: [{ type: 'item', name: '严重告警' }] } },
        ],
        layout: {
          sections: [
            { id: 'nested-title', name: 'sub-header' },
            { id: 'nested-content', name: '流量预测', role: 'chart', body: { children: [{ type: 'line-chart', name: '预测曲线' }] } },
          ],
        },
      },
    }

    const removed = stripChromeSectionsInPlace(parsed)

    expect(removed.map((r) => r.id)).toEqual(['top-title', 'ls-title', 'nested-title'])
    expect(parsed.sections.map((s: any) => s.id)).toEqual(['content-a'])
    expect(parsed.layoutStructure.sections.map((s: any) => s.id)).toEqual(['ls-content'])
    expect(parsed.layoutStructure.layout.sections.map((s: any) => s.id)).toEqual(['nested-content'])
  })

  it('负面对照：含业务 body 的 header-like section 不误删', () => {
    const section = {
      id: 'header-stats',
      name: '顶部统计',
      role: 'header',
      body: { children: [{ type: 'stat-card', name: '设备总数' }, { type: 'button', name: '刷新' }] },
    }

    expect(isChromeOnlySection(section)).toBe(false)
    const parsed: any = { layout: { sections: [section] } }
    expect(stripChromeSectionsInPlace(parsed)).toHaveLength(0)
    expect(parsed.layout.sections).toHaveLength(1)
  })

  // 🛡️ P1-1（2026-09-08）：header 区有 controls（tab-switch / stat-item）的 section 不判定为 chrome
  it('P1-1: header 区含业务 controls 的 section 不判定 chrome-only', () => {
    const section = {
      id: 'traffic-header',
      name: '流量监测标题栏',
      role: 'header',
      header: {
        controls: [
          { type: 'tab-switch', label: '实时数据', name: '实时数据' },
          { type: 'icon-group', label: '设置', name: '设置' },
        ],
      },
    }

    expect(isChromeOnlySection(section)).toBe(false)
    const parsed: any = { layout: { sections: [section] } }
    const removed = stripChromeSectionsInPlace(parsed)
    expect(removed).toHaveLength(0)
    expect(parsed.layout.sections).toHaveLength(1)
    expect(parsed.layout.sections[0].id).toBe('traffic-header')
  })

  it('P1-1: header 区含 stat-item 统计控件的 section 不判定 chrome-only', () => {
    const section = {
      id: 'stats-header',
      name: '统计面板标题',
      role: 'header',
      header: {
        controls: [
          { type: 'stat-item', name: '设备类型', value: '28' },
          { type: 'statistic', name: '完好率', value: '98%' },
        ],
      },
    }

    expect(isChromeOnlySection(section)).toBe(false)
    const parsed: any = { layout: { sections: [section] } }
    const removed = stripChromeSectionsInPlace(parsed)
    expect(removed).toHaveLength(0)
    expect(parsed.layout.sections).toHaveLength(1)
  })

  it('P1-1: 纯 chrome header（无 controls、无 body）仍然被剥离', () => {
    // 纯 title-itself，没有 controls，没有 body → 仍是 chrome
    const section = {
      id: 'panel-title',
      name: '环境监测',
      headerRelation: 'title-itself',
    }

    expect(isChromeOnlySection(section)).toBe(true)
    const parsed: any = { layout: { sections: [section] } }
    const removed = stripChromeSectionsInPlace(parsed)
    expect(removed).toHaveLength(1)
    expect(removed[0].id).toBe('panel-title')
    expect(parsed.layout.sections).toHaveLength(0)
  })

  it('P1-1: 非 header role 的 section 不受影响（业务 section 正常保留）', () => {
    const section = {
      id: 'vehicle-chart',
      name: '车型分布',
      role: 'chart',
      body: { children: [{ type: 'pie-chart', name: '车型环图' }] },
    }

    expect(isChromeOnlySection(section)).toBe(false)
  })
})
