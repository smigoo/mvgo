/**
 * 空壳图标位回灌 spec（路线 B · 2026-11-17）
 *
 * 判据与 resource-mounter.backfillUnconsumedIconsIntoEmptyDivs 单一事实源：
 * 硬门槛 C1(success 前景资源/非装饰) C2(零消费) C3(成对空壳 div 仅空白无绑定)
 * 三级证据 T1(语义词元) T2(通用 icon 词元 + owner/ancestor 锚点在产物存在 + 候选唯一)
 * T3(仅通用词元) ⇒ 弃权。
 * 病根：mc-max-1794925030759-386c3291 icon-statistics-477.png 零消费被可降级白名单放行。
 */
import { backfillUnconsumedIconsIntoEmptyDivs } from '../resource-mounter.js';

// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（ensure-subcomponent-import 同款惯例）。
jest.mock('../../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true });

/** 386c3291 真实产物形态（ContentSection.vue 缩样） */
const CONTENT_SECTION_386C = `<template>
  <div class="c-monitor-content-section" data-section-id="1:377">
    <img :src="icon2" class="c-monitor-content-section-icon" style="width:28px;height:28px;" alt="" />
    <div class="c-monitor-frame-2136636625">
      <div class="c-monitor-icon"></div>
      <div class="c-monitor-warning-label">
        <span class="c-monitor-warning-label-text">环境温度</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-1-385.png'
</script>
`;

/** 1:477 资源（owner 已按 :2613 resolveOwnerSectionToNearestSection 归一） */
const MAPPING_477 = [
  {
    figmaNodeId: '1:385',
    resourceFile: '../resources/images/icon-1-385.png',
    name: 'icon-1',
    previewAnalysisRole: 'icon',
    downloadStatus: 'success',
    isTinyDecoration: false,
    ownerSectionId: '1:377',
    figmaBox: { x: 1800, y: 130, width: 28, height: 28 },
    semanticVarName: 'icon1',
    assignedVarName: 'icon1',
  },
  {
    figmaNodeId: '1:477',
    resourceFile: '../resources/images/icon-statistics-477.png',
    name: 'icon-statistics',
    previewAnalysisRole: 'icon',
    downloadStatus: 'success',
    isTinyDecoration: false,
    ownerSectionId: '1:377',
    ancestorIds: ['1:377', '73:3'],
    figmaBox: { x: 2134, y: 172, width: 24, height: 24 },
    figmaPath: 'cp-监测预警/icon-statistics',
    semanticVarName: 'iconstatistics',
    assignedVarName: 'iconstatistics',
    targetDomSelector: '.statistics-container',
  },
];

describe('backfillUnconsumedIconsIntoEmptyDivs · 路线B 阴阳', () => {
  const run = (files, mapping = MAPPING_477) =>
    backfillUnconsumedIconsIntoEmptyDivs(files, mapping, { logger: null });

  test('P1 阳性：真机靶 386c3291 形态 ⇒ 注入 import+img 到空壳 c-monitor-icon', () => {
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    const r = run(files);
    expect(r.fixes).toHaveLength(1);
    const out = files['package/components/ContentSection.vue'];
    expect(out).toContain('icon-statistics-477.png');
    expect(out).toMatch(/class="c-monitor-icon"><img :src="iconstatistics"/);
    expect(out).toMatch(/width:24px;height:24px/);
    // 顶包图不误删、原 img 不动
    expect(out).toContain('icon-1-385.png');
    expect(out.match(/icon-1-385\.png/g)).toHaveLength(1);
    expect(r.fixes[0]).toMatchObject({
      file: 'package/components/ContentSection.vue',
      fname: 'icon-statistics-477.png',
      matchLevel: 'T2-owner-segment',
    });
  });

  test('P2 幂等：注入后再跑 ⇒ fixes=0 产物逐字不变', () => {
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    run(files);
    const snap = files['package/components/ContentSection.vue'];
    const r2 = run(files);
    expect(r2.fixes).toHaveLength(0);
    expect(files['package/components/ContentSection.vue']).toBe(snap);
  });

  test('N1 已消费（文件名已出现在任意 .vue）⇒ 不注入', () => {
    const files = {
      'package/components/ContentSection.vue': CONTENT_SECTION_386C,
      'package/index.vue': `import iconstatistics from '../resources/images/icon-statistics-477.png'\n<template><div/></template>`,
    };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
    expect(files['package/components/ContentSection.vue']).toBe(CONTENT_SECTION_386C);
  });

  test('N2 非空壳（div 内有子内容）⇒ 不注入', () => {
    const tpl = CONTENT_SECTION_386C.replace(
      '<div class="c-monitor-icon"></div>',
      '<div class="c-monitor-icon"><span>x</span></div>',
    );
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
  });

  test('N2b div 带绑定（:style/v-if）⇒ 不认空壳，不注入', () => {
    const tpl = CONTENT_SECTION_386C.replace(
      '<div class="c-monitor-icon"></div>',
      '<div class="c-monitor-icon" :style="s"></div>',
    );
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
  });

  test('N3 装饰豁免（isTinyDecoration）⇒ 不注入', () => {
    const mapping = MAPPING_477.map((m) =>
      m.figmaNodeId === '1:477' ? { ...m, isTinyDecoration: true } : m,
    );
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    const r = run(files, mapping);
    expect(r.fixes).toHaveLength(0);
  });

  test('N4 词元不匹配（footer-spacer vs icon-statistics）⇒ 弃权不注入', () => {
    const tpl = CONTENT_SECTION_386C.replace('c-monitor-icon', 'footer-spacer');
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
    expect(r.skipped.some((s) => s.fname === 'icon-statistics-477.png')).toBe(true);
  });

  test('N5 无 mapping ⇒ fail-open 逐字不变', () => {
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    const r = run(files, []);
    expect(r.fixes).toHaveLength(0);
    expect(files['package/components/ContentSection.vue']).toBe(CONTENT_SECTION_386C);
  });

  test('N6 顶包图合法多节点（1:385+1:397 共用 icon-1-385）⇒ 都不动', () => {
    const mapping = [
      ...MAPPING_477,
      {
        figmaNodeId: '1:397',
        resourceFile: '../resources/images/icon-1-385.png',
        name: 'icon-1',
        previewAnalysisRole: 'icon',
        downloadStatus: 'success',
        isTinyDecoration: false,
        ownerSectionId: '1:388',
        figmaBox: { width: 28, height: 28 },
        semanticVarName: 'icon1',
      },
    ];
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    const r = run(files, mapping);
    // icon-1-385 已消费（C2）不命中；477 正常注入
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0].fname).toBe('icon-statistics-477.png');
    expect(files['package/components/ContentSection.vue']).toContain('icon-1-385.png');
  });

  test('N7 无 class 空 div（裸 <div></div>）⇒ known-limitation 不注入', () => {
    const tpl = CONTENT_SECTION_386C.replace(
      '<div class="c-monitor-icon"></div>',
      '<div></div>',
    );
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
  });

  test('N8 同级候选不唯一（两个 c-monitor-icon 空壳）⇒ 弃权防猜错', () => {
    const tpl = CONTENT_SECTION_386C.replace(
      '<div class="c-monitor-icon"></div>',
      '<div class="c-monitor-icon"></div><div class="c-monitor-icon2"></div>',
    );
    // c-monitor-icon2：icon 词元 + owner 锚命中 ⇒ 与 c-monitor-icon 同级候选 ×2
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files);
    expect(r.fixes).toHaveLength(0);
    expect(
      r.skipped.some((s) => /ambiguous/.test(String(s.reason))),
    ).toBe(true);
  });

  test('N9 bg role 不在 C1 范围 ⇒ 不注入（背景归 E3-v4/mountBg 链管）', () => {
    const mapping = MAPPING_477.map((m) =>
      m.figmaNodeId === '1:477' ? { ...m, previewAnalysisRole: 'bg' } : m,
    );
    const files = { 'package/components/ContentSection.vue': CONTENT_SECTION_386C };
    const r = run(files, mapping);
    expect(r.fixes).toHaveLength(0);
  });

  test('N10 T1 语义词元命中：class 含 statistics ⇒ T1-token', () => {
    const tpl = CONTENT_SECTION_386C.replace(
      'c-monitor-icon',
      'c-monitor-statistics',
    );
    const mapping = MAPPING_477.map((m) =>
      m.figmaNodeId === '1:477' ? { ...m, ownerSectionId: '999:999' } : m, // owner 故意不存在
    );
    const files = { 'package/components/ContentSection.vue': tpl };
    const r = run(files, mapping);
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0].matchLevel).toBe('T1-token');
  });
});
