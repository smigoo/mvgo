/**
 * 🛡️ F1b headerSlots 落地审计（2026-11-10 · 方案 v4 §3-F1b / §5）
 *
 * fixture 口径：
 * - 重点车辆 31a9bb41 阳性：产物无 <template #header-right> ⇒ slotAbsent=1
 * - 环境监测阴性：插槽存在且内容证据命中 ⇒ landed，slotAbsent=0
 * - unverified 路径：结构锚在、无内容证据 ⇒ 不计为未落地（防误报）
 */
import { auditHeaderSlotLanding } from './header-slot-landing-audit.js';

const VEHICLE_SLOTS = [
  { slotType: 'header-right', figmaNodeId: '2:7954', content: '今日累计 86' },
];

const ENV_SLOTS = [
  { slotType: 'header-right', figmaNodeId: '89:42', content: '设备总数' },
  { slotType: 'title-right', figmaNodeId: '90:11', content: '实时状态' },
];

describe('F1b · headerSlots 落地审计', () => {
  it('① 重点车辆阳性：产物无具名插槽 ⇒ slotAbsent=1', () => {
    const index = `<template>
  <base-panel panelKey="default-panel">
    <div data-section-id="136:122">今日累计 86</div>
  </base-panel>
</template>`;
    const r = auditHeaderSlotLanding({ headerSlots: VEHICLE_SLOTS, indexContent: index });
    expect(r.total).toBe(1);
    expect(r.slotAbsent).toBe(1);
    expect(r.landed).toBe(0);
    expect(r.absentSlotKeys).toEqual(['header-right']);
  });

  it('② 环境监测阴性：结构锚 + figmaNodeId 证据 ⇒ landed，全 0 absent', () => {
    const index = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div data-section-id="89:42" class="c-head-stats">设备总数</div>
    </template>
    <template v-slot:title-right>
      <HeaderSection />
    </template>
    <div class="body">…</div>
  </base-panel>
</template>`;
    const r = auditHeaderSlotLanding({ headerSlots: ENV_SLOTS, indexContent: index });
    expect(r.total).toBe(2);
    expect(r.slotAbsent).toBe(0);
    expect(r.landed).toBe(1); // header-right 命中 figmaNodeId
    expect(r.unverified).toBe(1); // title-right 结构锚在、块内无证据 ⇒ unverified 而非 absent
  });

  it('③ unverified 不计为未落地：结构锚在、内容文本命中插槽块 ⇒ landed', () => {
    const index = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <span class="capsule">今日累计 86</span>
    </template>
  </base-panel>
</template>`;
    const r = auditHeaderSlotLanding({ headerSlots: VEHICLE_SLOTS, indexContent: index });
    expect(r.slotAbsent).toBe(0);
    expect(r.landed).toBe(1); // content 片段「今日累计」命中插槽块
  });

  it('④ 嵌套 <template> 配平：插槽块内嵌 template 不截断判据', () => {
    const index = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="wrap">
        <template v-if="flag">
          <span data-section-id="89:42">设备总数</span>
        </template>
      </div>
    </template>
  </base-panel>
</template>`;
    const r = auditHeaderSlotLanding({
      headerSlots: [{ slotType: 'header-right', figmaNodeId: '89:42', content: '设备总数' }],
      indexContent: index,
    });
    expect(r.landed).toBe(1); // 证据在嵌套层，配平扫描能取到完整块
  });

  it('⑤ 空 headerSlots / 无产物：fail-open 全 0（计数行恒打由调用方保证）', () => {
    expect(auditHeaderSlotLanding({ headerSlots: [], indexContent: '<template></template>' })).toMatchObject({
      total: 0, slotAbsent: 0, landed: 0, unverified: 0,
    });
    expect(auditHeaderSlotLanding({ headerSlots: ENV_SLOTS, indexContent: null })).toMatchObject({
      total: 2, slotAbsent: 0, landed: 0, unverified: 0,
    });
  });

  it('⑥ slot 下划线归一：title_right → title-right', () => {
    const index = `<template><base-panel><template #title-right><span data-section-id="90:11">实时状态</span></template></base-panel></template>`;
    const r = auditHeaderSlotLanding({
      headerSlots: [{ slotType: 'title_right', figmaNodeId: '90:11', content: '' }],
      indexContent: index,
    });
    expect(r.landed).toBe(1);
  });
});
