/**
 * 刀21 角标脱离文档流改写 spec（2026-11-18 · D5 实锤）
 * 真值 overlay 契约存在 ⇒ 宿主 relative + 角标 absolute（真值 dx/dy）。
 */
import { applyOverlayPositioning } from '../../roles/microcode/code-healer.js';

function makeFigmaTree() {
  return {
    document: {
      id: '0:0', type: 'FRAME',
      children: [
        {
          id: '2:9020', name: 'tabs', type: 'GROUP',
          children: [
            { id: '2:9023', name: 'tab-active', type: 'FRAME' },
            { id: '2:9033', name: 'badge-count-01', type: 'GROUP', overlay: { hostId: '2:9023', dx: 28, dy: 0 } },
          ],
        },
      ],
    },
  };
}

const BAD_INDEX = `<template>
  <div data-section-id="2:9020" style="display:flex;flex-direction:row;">
    <div data-section-id="2:9023" class="tab">全部</div>
    <div data-section-id="2:9033" class="badge">6</div>
  </div>
</template>`;

describe('刀21 applyOverlayPositioning', () => {
  test('P1 overlay 契约 ⇒ 宿主补 relative + 角标改 absolute（真值 dx/dy）', () => {
    const files = { 'package/index.vue': BAD_INDEX };
    const r = applyOverlayPositioning(files as any, makeFigmaTree() as any);
    expect(r.changed).toBe(1);
    const out = r.files['package/index.vue'];
    expect(out).toContain('position:relative;');
    expect(out).toContain('position:absolute;left:28px;top:0px;');
  });

  test('P2 已有 absolute ⇒ 幂等不重复注入', () => {
    const files = {
      'package/index.vue': BAD_INDEX
        .replace('class="badge"', 'style="position:absolute;" class="badge"'),
    };
    const r = applyOverlayPositioning(files as any, makeFigmaTree() as any);
    expect((r.files['package/index.vue'].match(/position:absolute/g) || []).length).toBe(1);
  });

  test('N1 无 overlay 契约 ⇒ 零改动', () => {
    const figma = makeFigmaTree();
    figma.document.children[0].children[1].overlay = undefined as any;
    const files = { 'package/index.vue': BAD_INDEX };
    const r = applyOverlayPositioning(files as any, figma as any);
    expect(r.changed).toBe(0);
    expect(r.files['package/index.vue']).toBe(BAD_INDEX);
  });

  test('N2 宿主与角标不在同一文件 ⇒ fail-open 不动', () => {
    const files = {
      'package/index.vue': '<template><div data-section-id="2:9020"></div></template>',
      'package/components/Badge.vue': '<template><div data-section-id="2:9033">6</div></template>',
    };
    const r = applyOverlayPositioning(files as any, makeFigmaTree() as any);
    expect(r.changed).toBe(0);
  });
});
