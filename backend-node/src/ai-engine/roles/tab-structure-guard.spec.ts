/**
 * Loop 2.1.B：@antd/tab / tabs / 竖 nav 强制 {nav, panels} 二元结构，
 * nav 不得丢。纯函数校验，供 planner 在产出子组件清单前对 section 做结构约束。
 */
import { enforceTabStructure } from './tab-structure-guard.js'

describe('Loop 2.1.B enforceTabStructure', () => {
  test('@antd/tab 容器缺 nav → 补 nav 占位，保留 panels', () => {
    const sec = {
      id: 'sec-tab',
      name: '@antd/tab',
      role: 'tabs',
      body: { layout: 'horizontal', children: [{ id: 'cons-1', name: 'Group 1' }] },
    }
    const out = enforceTabStructure(sec)
    // 无 bbox → fail-closed 回退 'vertical'
    expect(out.tabStructure).toEqual({
      nav: { present: false, placeholder: true },
      panels: ['cons-1'],
      orientation: 'vertical',
    })
  })

  test('治本A：水平宽扁 @antd/tab（顶部横向）→ orientation=horizontal', () => {
    const sec = {
      id: '89:37',
      name: '@antd/tab',
      role: 'tabs',
      absoluteBoundingBox: { width: 600, height: 40 },
      body: { layout: 'horizontal', children: [{ id: 'panels-1', name: 'Group 1' }] },
    }
    const out = enforceTabStructure(sec)
    expect(out.tabStructure.orientation).toBe('horizontal')
  })

  test('治本A：窄高 nav（竖向侧栏）→ orientation=vertical', () => {
    const sec = {
      id: 'sec-nav-v',
      name: 'nav',
      role: 'nav',
      body: {
        layout: 'vertical',
        children: [
          { id: 'nav-1', name: 'nav', absoluteBoundingBox: { width: 46, height: 400 } },
          { id: 'main-1', name: 'Group 1' },
        ],
      },
    }
    const out = enforceTabStructure(sec)
    expect(out.tabStructure.orientation).toBe('vertical')
  })

  test('竖 nav 容器 → nav 保留，panels 收集右侧主内容', () => {
    const sec = {
      id: 'sec-nav',
      name: '竖向导航',
      role: 'nav',
      body: {
        layout: 'horizontal',
        children: [
          { id: 'nav-1', name: 'nav', children: [{ id: 'n1' }] },
          { id: 'main-1', name: 'Group 1' },
        ],
      },
    }
    const out = enforceTabStructure(sec)
    expect(out.tabStructure.nav.present).toBe(true)
    expect(out.tabStructure.panels).toContain('main-1')
  })

  test('非 tab/nav section 不改结构', () => {
    const sec = { id: 'sec-chart', name: '车型分布', role: 'chart', body: { children: [{ id: 'c1' }] } }
    const out = enforceTabStructure(sec)
    expect(out.tabStructure).toBeUndefined()
  })

  test('已有 nav + panels 不动', () => {
    const sec = {
      id: 'sec-tab2',
      name: 'tabs',
      role: 'tabs',
      tabStructure: { nav: { present: true }, panels: ['p1'] },
      body: { children: [{ id: 'p1' }] },
    }
    const out = enforceTabStructure(sec)
    expect(out.tabStructure.panels).toEqual(['p1'])
  })
})
