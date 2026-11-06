/**
 * 刀65-B（2026-11-06 · mc-1793897995094-b445e302 实锤）：插槽资格复核 spec。
 *
 * 病灶：vision 把 9.8×9.8 的右上角 VECTOR 角标（36:1697）判成「头部设备标识」段
 * 且标 slotCandidate=header-right → LLM 把整个头部组件（98px 图片+标题+编码）
 * 装进 #header-right 插槽 → 渲染时头部跑到面板插槽处。
 *
 * 治本：slotCandidate 只是 vision 语义假设，装配前按 Figma 真值几何复核资格：
 *   ① 锚点尺度矛盾（锚最大边 ≤ SLOT_ANCHOR_MAX_PX=24）；
 *   ② 空内容段（body/items/header.controls 全空）。
 * 任一命中即撤销（slotCandidate 置 null）。
 */
import {
  revokeUnqualifiedHeaderSlotCandidates,
  SLOT_ANCHOR_MAX_PX,
} from '../inline-header-slot-inferrer.js'

/** 真机 36:1697 形态：9.8×9.8 VECTOR 角标 + 空壳段（body=null）。 */
const FIGMA_TREE = {
  id: '36:1693',
  type: 'FRAME',
  name: 'cp-设备详情',
  absoluteBoundingBox: { x: 0, y: 0, width: 603, height: 555 },
  children: [
    {
      id: '36:1697',
      type: 'VECTOR',
      name: 'header',
      absoluteBoundingBox: { x: 571, y: 20, width: 9.86, height: 9.85 },
      children: [],
    },
    {
      id: '81:7',
      type: 'GROUP',
      name: 'Group 2136638454',
      absoluteBoundingBox: { x: 28, y: 166, width: 440, height: 135 },
      children: [],
    },
  ],
}

describe('刀65-B · 插槽资格复核', () => {
  test('阳性①·真机 36:1697 形态：9.8px 锚 + 空壳段 ⇒ 撤销（slotCandidate 置 null）', () => {
    const sections = [
      {
        id: '36:1697',
        name: '头部设备标识',
        slotCandidate: 'header-right',
        headerRelation: 'title-same-row',
        body: null,
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.evaluated).toBe(1)
    expect(r.revoked).toBe(1)
    expect(r.revokedIds).toEqual(['36:1697'])
    expect(r.reasons['36:1697']).toContain('anchorMaxEdge=9.86px<=24px')
    expect(sections[0].slotCandidate).toBeNull()
  })

  test('阳性②·查不到锚几何但 body/items/header.controls 全空 ⇒ emptyBodyAndItems 撤销', () => {
    const sections = [
      {
        id: '99:1',
        slotCandidate: { slotType: 'header-right', content: 'x' },
        body: {},
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.revoked).toBe(1)
    expect(r.reasons['99:1']).toBe('emptyBodyAndItems')
    expect(sections[0].slotCandidate).toBeNull()
  })

  test('撤销同时清 header.slotCandidate（嵌套形态，ensureHeaderSlots 第二读取口）', () => {
    const sections = [
      {
        id: '36:1697',
        slotCandidate: null,
        header: { slotCandidate: 'header-right' },
        body: null,
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.revoked).toBe(1)
    expect(sections[0].header.slotCandidate).toBeNull()
  })

  test('阴性·正常 header-right 控件（锚点够大且有内容）⇒ 不撤销', () => {
    const sections = [
      {
        id: '81:7',
        name: '设备属性',
        slotCandidate: 'header-right',
        headerRelation: 'title-same-row',
        body: { children: [{ id: 'x', type: 'statistic', width: 60, height: 30 }] },
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.evaluated).toBe(1)
    expect(r.revoked).toBe(0)
    expect(sections[0].slotCandidate).toBe('header-right')
  })

  test('阴性·非 header 槽段不进评估（evaluated=0）', () => {
    const sections = [
      { id: '36:1708', slotCandidate: null, body: null },
      { id: 'a', slotCandidate: 'body-main', body: null },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.evaluated).toBe(0)
    expect(r.revoked).toBe(0)
  })

  test('fail-open·锚点几何查不到且内容非空 ⇒ 不撤销（证据不足不动语义）', () => {
    const sections = [
      {
        id: '77:7',
        slotCandidate: 'header-right',
        body: { children: [{ id: 'c', type: 'button', width: 40, height: 24 }] },
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, FIGMA_TREE)
    expect(r.evaluated).toBe(1)
    expect(r.revoked).toBe(0)
    expect(sections[0].slotCandidate).toBe('header-right')
  })

  test('fail-open·figmaNodeData=null 时仅空内容支生效（锚点支跳过）', () => {
    const sections = [
      { id: '36:1697', slotCandidate: 'header-right', body: null },
      {
        id: 'unknown',
        slotCandidate: 'header-right',
        body: { children: [{ width: 30, height: 30 }] },
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, null)
    expect(r.revoked).toBe(1)
    expect(r.revokedIds).toEqual(['36:1697'])
  })

  test('阈值常量可辩驳：SLOT_ANCHOR_MAX_PX=24（本单 9.8px 角标命中，48px 标准 header 控件豁免）', () => {
    expect(SLOT_ANCHOR_MAX_PX).toBe(24)
  })
})
