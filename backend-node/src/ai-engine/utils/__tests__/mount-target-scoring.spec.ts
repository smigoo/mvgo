/**
 * 挂载点评分测试（P1-3，2026-08-30）
 *
 * 覆盖 R8 修复：去重（_dedupeBgMultiRefs）与兜底（_autoMountUnusedBackgrounds）
 * 此前用两套互不兼容的选型逻辑，导致「去重删掉、兜底挂回」互相打架。
 * 本模块是两者共用的唯一评分真相源。
 */
import { describe, it, expect } from '@jest/globals'
import {
  scoreMountTarget,
  inferComponentPrefix,
  mountClsTokens,
  tokenOverlapRatio,
  figmaPathContext,
  boxAreaRatio,
  stripMountClsPrefix,
  stripInstanceClsPrefix,
  isSemanticMountTarget,
} from '../mount-target-scoring.js'

const LONG = 'c-mc-max-1788065970150-62e42150-c-env-monitor-'
const PREFIX = 'c-env-monitor-'

/** 组件一 bg-7890：295×27，与父框完全重合 → 整块背景 */
const BG_7890 = {
  name: 'bg',
  mountTarget: 'tabs-list',
  figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg',
  figmaBox: { x: 1495, y: 903, width: 295, height: 27 },
  parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  bgRole: 'container',
  assignedVarName: 'bg2',
}

/** 组件一 bg-tab-active-7891：78×21 局部小图 */
const BG_TAB_ACTIVE = {
  name: 'bg-tab-active',
  mountTarget: 'tabs-list',
  figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg-tab-active',
  figmaBox: { x: 1500, y: 906, width: 78, height: 21 },
  parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  bgRole: 'sub-state',
  assignedVarName: 'bg3',
}

describe('scoreMountTarget（P1-3 统一评分）', () => {
  it('组件一实锤：整块背景 bg-7890 应优先挂 tabs-bg 而非 tabs-section', () => {
    const section = scoreMountTarget(BG_7890, { cls: `${LONG}tabs-section`, depth: 1 }, { componentPrefix: PREFIX })
    const tabBg = scoreMountTarget(BG_7890, { cls: `${LONG}tabs-bg`, depth: 2 }, { componentPrefix: PREFIX })
    expect(tabBg).toBeGreaterThan(section)
  })

  it('长短类名形态评分一致（实例 ID 前缀被归一化）', () => {
    expect(
      scoreMountTarget(BG_7890, { cls: 'c-env-monitor-tabs-bg', depth: 2 }, { componentPrefix: PREFIX }),
    ).toBe(
      scoreMountTarget(BG_7890, { cls: `${LONG}tabs-bg`, depth: 2 }, { componentPrefix: PREFIX }),
    )
  })

  it('宿主外壳（base-panel / mc-panel）禁止挂载', () => {
    expect(
      scoreMountTarget(BG_7890, { cls: 'base-panel', depth: 0, isHostShell: true }, { componentPrefix: PREFIX }),
    ).toBe(-Infinity)
  })

  it('无 class / 空入参不可挂载', () => {
    expect(scoreMountTarget(BG_7890, { cls: '', depth: 1 }, { componentPrefix: PREFIX })).toBe(-Infinity)
    expect(scoreMountTarget(BG_7890, {}, {})).toBe(-Infinity)
    expect(scoreMountTarget(null as any, { cls: 'x', depth: 1 }, {})).toBe(-Infinity)
  })

  it('局部小图偏好浅层元素，整块背景偏好深层元素', () => {
    const m = { cls: 'c-env-monitor-bg-tab-active', depth: 0 }
    expect(
      scoreMountTarget(BG_TAB_ACTIVE, { ...m, depth: 1 }, { componentPrefix: PREFIX }),
    ).toBeGreaterThan(scoreMountTarget(BG_TAB_ACTIVE, { ...m, depth: 4 }, { componentPrefix: PREFIX }))

    const b = { cls: 'c-env-monitor-bg', depth: 0 }
    expect(
      scoreMountTarget(BG_7890, { ...b, depth: 4 }, { componentPrefix: PREFIX }),
    ).toBeGreaterThan(scoreMountTarget(BG_7890, { ...b, depth: 1 }, { componentPrefix: PREFIX }))
  })

  it('语义优先级：资源名 > mountTarget > figmaPath 上下文；无关 class 得 0 分', () => {
    const s = (cls: string) => scoreMountTarget(BG_7890, { cls, depth: 0 }, { componentPrefix: 'c-x-' })
    expect(s('c-x-bg')).toBeGreaterThan(s('c-x-tabs-list'))
    expect(s('c-x-tabs-list')).toBeGreaterThan(s('c-x-sub'))
    expect(s('c-x-legend')).toBe(0)
  })

  it('幂等：同一输入重复评分结果一致', () => {
    const c = { cls: `${LONG}tabs-bg`, depth: 2 }
    expect(scoreMountTarget(BG_7890, c, { componentPrefix: PREFIX })).toBe(
      scoreMountTarget(BG_7890, c, { componentPrefix: PREFIX }),
    )
  })
})

describe('辅助纯函数', () => {
  it('inferComponentPrefix 由根容器 class 推断组件名前缀', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <div class="${LONG}root"><span class="${LONG}tabs-bg"></span></div>
  </base-panel>
</template>`,
    }
    expect(inferComponentPrefix(files)).toBe('c-env-monitor-')
    expect(inferComponentPrefix({})).toBe('')
  })

  it('stripInstanceClsPrefix / stripMountClsPrefix', () => {
    expect(stripInstanceClsPrefix(`${LONG}tabs-bg`)).toBe('c-env-monitor-tabs-bg')
    expect(stripMountClsPrefix(`${LONG}tabs-bg`, 'c-env-monitor-')).toBe('tabs-bg')
    expect(stripMountClsPrefix('c-other-tabs-bg', 'c-env-monitor-')).toBe('c-other-tabs-bg')
  })

  it('mountClsTokens 支持连字符 / 驼峰 / 中文，过滤纯数字', () => {
    expect(mountClsTokens('tabs-bg')).toEqual(['tabs', 'bg'])
    expect(mountClsTokens('chartHeader')).toEqual(['chart', 'header'])
    expect(mountClsTokens('bg-7890')).toEqual(['bg'])
    expect(mountClsTokens('区块-1')).toEqual(['区块'])
    expect(mountClsTokens('')).toEqual([])
  })

  it('tokenOverlapRatio：被比集合为空返回 0（防止除零产生伪高分）', () => {
    expect(tokenOverlapRatio(['a', 'b'], [])).toBe(0)
    expect(tokenOverlapRatio(['a'], ['a', 'b'])).toBe(0.5)
    expect(tokenOverlapRatio(['a', 'b'], ['a', 'b'])).toBe(1)
  })

  it('figmaPathContext 去掉设计页名与资源自身节点名', () => {
    expect(figmaPathContext('cp-环境监测/slot-con/sub-t/tabs-list/bg')).toBe('slot-con sub-t tabs-list')
    expect(figmaPathContext('page/bg')).toBe('')
    expect(figmaPathContext('')).toBe('')
  })

  it('boxAreaRatio 计算与边界', () => {
    expect(boxAreaRatio(BG_7890)).toBe(1)
    expect(boxAreaRatio(BG_TAB_ACTIVE)).toBeLessThan(0.9)
    expect(boxAreaRatio({})).toBe(0)
    expect(boxAreaRatio({ figmaBox: { width: 10, height: 10 }, parentBox: {} })).toBe(0)
  })

  it('isSemanticMountTarget（F3）：单字符 / 纯类型编号 / 纯数字 → 无语义；实词 → 有语义', () => {
    // 无语义（F3 应清空挂载目标）
    expect(isSemanticMountTarget('t')).toBe(false)
    expect(isSemanticMountTarget('Group 2136636802')).toBe(false)
    expect(isSemanticMountTarget('Frame 1280')).toBe(false)
    expect(isSemanticMountTarget('Component 1')).toBe(false)
    expect(isSemanticMountTarget('Ellipse 3')).toBe(false)
    expect(isSemanticMountTarget('123')).toBe(false)
    expect(isSemanticMountTarget('')).toBe(false)
    expect(isSemanticMountTarget(null)).toBe(false)
    // 有语义（保留挂载目标）
    expect(isSemanticMountTarget('tabs-list')).toBe(true)
    expect(isSemanticMountTarget('bg')).toBe(true)
    expect(isSemanticMountTarget('stat-item')).toBe(true)
    expect(isSemanticMountTarget('bg-tab-active')).toBe(true)
  })
})
