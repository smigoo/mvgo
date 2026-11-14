/**
 * 🛡️ S1（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：takeover 段头渲染。
 *
 * 病灶：副标题条（`4sub-header` 24px / `6sub-header` 24px）是段锚点的兄弟，takeover 产物
 *   **没有任何 header 落点** ⇒ 即使 plan 已把标题并进 `section.header`（P0-8b），产物依旧
 *   只有卡片/图表，「车型分布 / 流量预测」两个副标题消失。
 *
 * 判据（本文件只测渲染包装这一层）：
 *   ① 有 header 事实 ⇒ 模板外包 flex column 一层，头部按真值高/字色/字号/左内距/gap 渲染，
 *      原根降为 `flex:1;min-height:0`；
 *   ② 无 header 事实 ⇒ **逐字不变**（零回归的硬约束）；
 *   ③ kind 不在白名单（S1 先开 grid/list）⇒ 逐字不变。
 */
import { applySectionHeader } from './folded-grid-section-takeover.js';

const BODY = [
  '<template>',
  '  <div data-section-id="1263:38" class="c-x-fg-grid-126338" style="display:grid;justify-content:start;">',
  '    <div class="c-x-fg-grid-126338-card"></div>',
  '  </div>',
  '</template>',
  '',
  '<script setup>',
  'const items = []',
  '</script>',
  '',
].join('\n');

const HDR = {
  title: '车型分布',
  height: 24,
  gap: 4,
  fontSize: 16,
  fontWeight: 500,
  color: 'rgba(51, 51, 51, 1)',
  paddingLeft: 26,
  stripId: '2:3439',
};

describe('S1 段头渲染（grid/list）', () => {
  it('有 header ⇒ 外包 flex column + 头部真值（高/字号/字重/色/左内距/gap）', () => {
    const out = applySectionHeader(BODY, { kind: 'grid', sectionId: '1263:38', header: HDR }, 'x');
    expect(out).toContain('display:flex;flex-direction:column;height:100%;min-height:0;');
    expect(out).toContain('data-section-header="1263:38"');
    expect(out).toContain('height:24px');
    expect(out).toContain('margin-bottom:4px');
    expect(out).toContain('padding-left:26px');
    expect(out).toContain('font-size:16px;font-weight:500;color:rgba(51, 51, 51, 1)');
    expect(out).toContain('车型分布');
    // 原根降为 body
    expect(out).toContain('style="flex:1;min-height:0;display:grid');
  });

  it('无 header ⇒ 产物逐字不变（零回归）', () => {
    const out = applySectionHeader(BODY, { kind: 'grid', sectionId: '1263:38' }, 'x');
    expect(out).toBe(BODY);
    expect(out).not.toContain('data-section-header');
  });

  it('kind 不在白名单（regions/table/…）⇒ 逐字不变', () => {
    for (const kind of ['regions', 'table', 'statrow', 'kvgrid', 'text', 'icon']) {
      const out = applySectionHeader(BODY, { kind, sectionId: '1263:38', header: HDR }, 'x');
      expect(out).toBe(BODY);
    }
  });

  it('header 缺关键事实（高度非正）⇒ 逐字不变（fail-open 不画半截）', () => {
    const out = applySectionHeader(
      BODY,
      { kind: 'grid', sectionId: '1263:38', header: { ...HDR, height: 0 } },
      'x',
    );
    expect(out).toBe(BODY);
  });

  it('list 形态同样生效，且 gap 缺失时按 0 处理', () => {
    const out = applySectionHeader(
      BODY,
      { kind: 'list', sectionId: '1263:38', header: { ...HDR, gap: undefined } },
      'x',
    );
    expect(out).toContain('data-section-header="1263:38"');
    expect(out).toContain('margin-bottom:0px');
  });
});
