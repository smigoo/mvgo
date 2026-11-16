/**
 * P0-a 资源归属上溯单测（2026-11-15 · mc-max-1794714093985-c60fbe6f 实锤）
 *
 * 真值锚（该任务 resource-dom-mapping.json 实录）：
 *   - 2:3552  ownerSectionId=2:3550  而产物 section=88:32   → 必须上溯到 88:32
 *   - 2:3561  ownerSectionId=2:3559  而产物 section=88:32   → 必须上溯到 88:32
 *   - 2:3573  ownerSectionId=2:3571  而产物 section=2:3565   → 必须上溯到 2:3565
 *   - 2:3441  ownerSectionId=2:3439 已命中                 → 保持不动
 */
import {
  collectSectionIds,
  resolveOwnerSectionToNearestSection,
  formatResourceOwnershipLog,
  ownerKeyCandidates,
  ownerMatchesIds,
} from '../resource-ownership-normalize';

const SECTIONS = ['88:32', '2:3565', '2:3439', '1744:127', '1744:128', '2:3566'];

describe('collectSectionIds', () => {
  it('合并多来源并去重去空', () => {
    const set = collectSectionIds(
      [{ id: '88:32' }, { id: '2:3565' }, { id: '' }],
      ['88:32', '1744:127', null],
      null,
    );
    expect([...set].sort()).toEqual(['1744:127', '2:3565', '88:32'].sort());
  });

  it('支持字符串与对象混排（sectionId/nodeId 别名）', () => {
    const set = collectSectionIds([{ sectionId: 'A' }, { nodeId: 'B' }, 'C']);
    expect([...set].sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('resolveOwnerSectionToNearestSection', () => {
  it('阳性：中间容器 owner 沿 ancestorIds 上溯到最近 section', () => {
    const mappings = [
      // 2:3552 的直接父是 2:3550（标题组），祖先链里 88:32 才是 section
      { figmaNodeId: '2:3552', ownerSectionId: '2:3550', ancestorIds: ['2:3550', '88:32', '2:9778'] },
    ];
    const r = resolveOwnerSectionToNearestSection(mappings, collectSectionIds(SECTIONS), { silent: true });
    expect(r.mappings[0].ownerSectionId).toBe('88:32');
    expect(r.stats.resolved).toBe(1);
    expect(r.stats.verdict).toBe('normalized');
  });

  it('阳性：ancestorIds 取「最近父」优先（不是任意命中）', () => {
    const mappings = [
      { figmaNodeId: 'x', ownerSectionId: '2:3571', ancestorIds: ['2:3571', '2:3565', '88:32'] },
    ];
    const r = resolveOwnerSectionToNearestSection(mappings, collectSectionIds(SECTIONS), { silent: true });
    expect(r.mappings[0].ownerSectionId).toBe('2:3565');
  });

  it('幂等：owner 已在集合内原样保留，不改字段', () => {
    const m = { figmaNodeId: '2:3441', ownerSectionId: '2:3439', ancestorIds: ['2:3439'] };
    const r = resolveOwnerSectionToNearestSection([m], collectSectionIds(SECTIONS), { silent: true });
    expect(r.mappings[0]).toBe(m);
    expect(r.stats.keptInSet).toBe(1);
    expect(r.stats.verdict).toBe('clean');
    expect(r.changes).toHaveLength(0);
  });

  it('幂等：连续两次调用结果一致（第二次 zero resolved）', () => {
    const mappings = [
      { figmaNodeId: '2:3552', ownerSectionId: '2:3550', ancestorIds: ['2:3550', '88:32'] },
    ];
    const set = collectSectionIds(SECTIONS);
    const first = resolveOwnerSectionToNearestSection(mappings, set, { silent: true });
    const second = resolveOwnerSectionToNearestSection(first.mappings, set, { silent: true });
    expect(second.mappings[0].ownerSectionId).toBe('88:32');
    expect(second.stats.resolved).toBe(0);
    expect(second.stats.keptInSet).toBe(1);
  });

  it('阴/边界：非 Figma id 形态（slot-*）一律不碰', () => {
    const m = { figmaNodeId: 'x', ownerSectionId: 'slot-con', ancestorIds: ['88:32'] };
    const r = resolveOwnerSectionToNearestSection([m], collectSectionIds(SECTIONS), { silent: true });
    expect(r.mappings[0]).toBe(m);
    expect(r.stats.skippedNonFigma).toBe(1);
    expect(r.stats.resolved).toBe(0);
  });

  it('阴：祖先链无命中 ⇒ 原样保留并计 unresolved（不猜）', () => {
    const m = { figmaNodeId: 'x', ownerSectionId: '9:9', ancestorIds: ['9:9', '9:8'] };
    const r = resolveOwnerSectionToNearestSection([m], collectSectionIds(SECTIONS), { silent: true });
    expect(r.mappings[0]).toBe(m);
    expect(r.stats.unresolved).toBe(1);
    expect(r.stats.resolved).toBe(0);
  });

  it('fail-open：无 section 集合证据 ⇒ no-evidence 且原数组返回', () => {
    const mappings = [{ figmaNodeId: 'x', ownerSectionId: '2:3550' }];
    const r = resolveOwnerSectionToNearestSection(mappings, [], { silent: true });
    expect(r.stats.verdict).toBe('no-evidence');
    expect(r.stats.reason).toBe('no-section-ids');
    expect(r.mappings).toBe(mappings);
  });

  it('不改其他字段，仅补 2 个观测字段', () => {
    const m = {
      figmaNodeId: '2:3573',
      ownerSectionId: '2:3571',
      ancestorIds: ['2:3571', '2:3565'],
      resourceFile: '/resources/images/icon-3561.png',
      usage: '<img :src="iconX">',
      previewAnalysisRole: 'icon',
    };
    const r = resolveOwnerSectionToNearestSection([m], collectSectionIds(SECTIONS), { silent: true });
    const out = r.mappings[0];
    expect(out.ownerSectionId).toBe('2:3565');
    expect(out.ownerSectionOriginal).toBe('2:3571');
    expect(out.ownerSectionOrigin).toBe('ancestor');
    // 其余字段逐字不变
    expect(out.resourceFile).toBe(m.resourceFile);
    expect(out.usage).toBe(m.usage);
    expect(out.previewAnalysisRole).toBe('icon');
    expect(out.figmaNodeId).toBe(m.figmaNodeId);
    expect(out.ancestorIds).toBe(m.ancestorIds);
  });

  it('真实形态回放：三处中间容器 owner 全部落到正确 section', () => {
    const mappings = [
      { figmaNodeId: '2:3552', ownerSectionId: '2:3550', ancestorIds: ['2:3550', '88:32', '2:9778'] },
      { figmaNodeId: '2:3561', ownerSectionId: '2:3559', ancestorIds: ['2:3559', '88:32', '2:9778'] },
      { figmaNodeId: '2:3573', ownerSectionId: '2:3571', ancestorIds: ['2:3571', '2:3565', '2:9778'] },
      { figmaNodeId: '2:3441', ownerSectionId: '2:3439', ancestorIds: ['2:3439', '2:9778'] },
      { figmaNodeId: '2:7626', ownerSectionId: '2:7625', ancestorIds: ['2:7625', '1744:127'] },
    ];
    const r = resolveOwnerSectionToNearestSection(mappings, collectSectionIds(SECTIONS), { silent: true });
    const byId = Object.fromEntries(r.mappings.map((m) => [m.figmaNodeId, m.ownerSectionId]));
    expect(byId['2:3552']).toBe('88:32');
    expect(byId['2:3561']).toBe('88:32');
    expect(byId['2:3573']).toBe('2:3565');
    expect(byId['2:3441']).toBe('2:3439');
    expect(byId['2:7626']).toBe('1744:127');
    expect(r.stats.resolved).toBe(4);
    expect(r.stats.keptInSet).toBe(1);
  });

  it('脏输入不抛：null / 非对象混入', () => {
    const r = resolveOwnerSectionToNearestSection(
      [null, 42, { figmaNodeId: 'x', ownerSectionId: '2:3550', ancestorIds: ['88:32'] }],
      collectSectionIds(SECTIONS),
      { silent: true },
    );
    expect(r.mappings[2].ownerSectionId).toBe('88:32');
    expect(r.stats.resolved).toBe(1);
  });
});

describe('formatResourceOwnershipLog', () => {
  it('计数行字段齐全（真机日志与单测共用唯一格式）', () => {
    const r = resolveOwnerSectionToNearestSection(
      [{ figmaNodeId: 'x', ownerSectionId: '2:3550', ancestorIds: ['88:32'] }],
      collectSectionIds(SECTIONS),
      { silent: true },
    );
    const line = formatResourceOwnershipLog(r.stats);
    expect(line.message).toContain('resourceOwnership:');
    expect(line.message).toContain('total=1');
    expect(line.message).toContain('resolved=1');
    expect(line.message).toContain('verdict=normalized');
  });

  it('no-evidence 也恒打（0 也打），并带 reason', () => {
    const line = formatResourceOwnershipLog({ verdict: 'no-evidence', reason: 'no-section-ids' });
    expect(line.message).toContain('verdict=no-evidence');
    expect(line.message).toContain('reason=no-section-ids');
  });
});

describe('P0-b 归属键判据（单一来源 · 2026-11-15 c019cd88）', () => {
  it('ownerKeyCandidates：同时给出 ownerSectionId 与 ownerSectionOriginal（去空去 null）', () => {
    expect(ownerKeyCandidates({ ownerSectionId: '2016:219', ownerSectionOriginal: '1:377' })).toEqual([
      '2016:219',
      '1:377',
    ]);
    expect(ownerKeyCandidates({ ownerSectionId: 'A', ownerSectionOriginal: null })).toEqual(['A']);
    expect(ownerKeyCandidates({ ownerSectionId: null })).toEqual([]);
    expect(ownerKeyCandidates(null as any)).toEqual([]);
  });

  it('ownerMatchesIds：任一键命中即真（上溯后的 section 与原值都认）', () => {
    const ids = new Set(['1:377', '1:388']);
    const e = { ownerSectionId: '2016:219', ownerSectionOriginal: '1:377' };
    expect(ownerMatchesIds(ids, e)).toBe(true);
    // 只认 section（上溯前值缺失）⇒ 不命中
    expect(ownerMatchesIds(ids, { ownerSectionId: '2016:219' })).toBe(false);
    // 无 owner 键 ⇒ 不命中（「无 owner 视为通配」由调用方自行决定）
    expect(ownerMatchesIds(ids, {})).toBe(false);
    expect(ownerMatchesIds(null as any, e)).toBe(false);
  });

  it('与本模块上溯联动：上溯产物能被 item 锚点集合命中', () => {
    const r = resolveOwnerSectionToNearestSection(
      [{ figmaNodeId: '1:375', ownerSectionId: '1:377', ancestorIds: ['1:376', '2016:219'] }],
      collectSectionIds(['2016:219']),
      { silent: true },
    );
    const m = r.mappings[0];
    expect(m.ownerSectionId).toBe('2016:219');
    expect(m.ownerSectionOriginal).toBe('1:377');
    // DOM 锚点侧：认 section
    expect(ownerMatchesIds(new Set(['2016:219']), m)).toBe(true);
    // 折叠卡项侧：认原值
    expect(ownerMatchesIds(new Set(['1:377']), m)).toBe(true);
  });
});
