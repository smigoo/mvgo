import { describe, expect, it } from '@jest/globals';
import {
  buildDocScopeGuard,
  docFieldOwnedBySection,
  filterForeignMappings,
} from '../doc-scope-guard.js';

/** 真实 fieldMappings（337f2bf2 docAnalysis.dataBinding 子集，逐字段保真） */
const FIELD_MAPPINGS = [
  { field: 'hazardousCount', element: '危化品车数量', control: '数字卡片' },
  { field: 'truckCount', element: '重型货车数量', control: '数字卡片' },
  { field: 'oversizeCount', element: '超高车辆数量', control: '数字卡片' },
];

describe('段级数据归属守卫（doc-scope-guard × P0 双渲染治本）', () => {
  it('docFieldOwnedBySection：归一归属判定（危化品车数量→危化品车 被「危化品车」段承载）', () => {
    const foldedScope = {
      id: '136:127-list',
      title: '危化品车',
      truthTexts: ['危化品车', '51次', '重型货车', '2', '超高车辆'],
    };
    expect(docFieldOwnedBySection('危化品车数量', foldedScope)).toBe(true);
    expect(docFieldOwnedBySection('重型货车数量', foldedScope)).toBe(true);
    expect(docFieldOwnedBySection('超高车辆数量', foldedScope)).toBe(true);
    expect(docFieldOwnedBySection('今日累计车流量', foldedScope)).toBe(false);
  });

  it('阳性（337f2bf2 ContentSection 形态）：纯标题段拿到全部外来字段 ⇒ 下发禁令列出字段', () => {
    const scope = { id: '136:122', title: '今日累计', componentName: 'ContentSection', truthTexts: ['今日累计'] };
    const guard = buildDocScopeGuard(scope, FIELD_MAPPINGS);
    expect(guard).not.toBe('');
    expect(guard).toContain('段级数据归属守卫');
    expect(guard).toContain('hazardousCount');
    expect(guard).toContain('truckCount');
    expect(guard).toContain('oversizeCount');
    expect(guard).toContain('136:122');
    expect(guard).toContain('今日累计');
    // 🔴 交互 carve-out：守卫绝不误禁交互（tab 事故殷鉴）
    expect(guard).toContain('tab 切换');
    expect(guard).toContain('均不受影响');
  });

  it('阴性（337f2bf2 ListSection 形态）：折叠段 truthTexts 承载全部字段 ⇒ 零守卫', () => {
    const scope = {
      id: '136:127-list',
      title: '危化品车',
      componentName: 'ListSection',
      truthTexts: ['危化品车', '51次', '重型货车', '超高车辆', '19'],
    };
    expect(buildDocScopeGuard(scope, FIELD_MAPPINGS)).toBe('');
    expect(filterForeignMappings(scope, FIELD_MAPPINGS)).toEqual([]);
  });

  it('fail-open：无 _sectionScope ⇒ 不守卫（未匹配段/整稿块/旧任务零漂移）', () => {
    expect(buildDocScopeGuard(null, FIELD_MAPPINGS)).toBe('');
    expect(buildDocScopeGuard(undefined, FIELD_MAPPINGS)).toBe('');
    expect(filterForeignMappings(null, FIELD_MAPPINGS)).toEqual([]);
  });

  it('fail-open：全部外来且本段无任何真值信号（scope 残缺）⇒ 不守卫（防整段误禁）', () => {
    const emptyScope = { id: 'x', title: '', truthTexts: [] };
    expect(buildDocScopeGuard(emptyScope, FIELD_MAPPINGS)).toBe('');
  });

  it('部分归属：只禁未归属字段（已归属的不出现在守卫里）', () => {
    const scope = { id: 's1', title: '危化品车统计', truthTexts: ['危化品车'] };
    const guard = buildDocScopeGuard(scope, FIELD_MAPPINGS);
    expect(guard).not.toBe('');
    expect(guard).not.toContain('hazardousCount');
    expect(guard).toContain('truckCount');
    expect(guard).toContain('oversizeCount');
  });

  it('filterForeignMappings：守卫与真机计数同一口径（单一来源）', () => {
    const scope = { id: '136:122', title: '今日累计', truthTexts: ['今日累计'] };
    const foreign = filterForeignMappings(scope, FIELD_MAPPINGS);
    expect(foreign.map((f) => f.field)).toEqual(['hazardousCount', 'truckCount', 'oversizeCount']);
    const guard = buildDocScopeGuard(scope, FIELD_MAPPINGS);
    for (const f of foreign) expect(guard).toContain(f.field);
  });
});
