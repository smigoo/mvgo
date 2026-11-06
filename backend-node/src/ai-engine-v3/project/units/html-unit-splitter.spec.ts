/**
 * HTML 单元拆分器（非 Figma 分支）—— 纯函数判据：一页一单元、页级锚点、幂等、顺序无关。
 *
 * 🔴 为什么断言里反复出现 `deriveUnitTier('html')` 而不是字面量 'lite'：
 *    档位的单一来源是契约层；这里若写死 'lite'，将来档位规则变了本 spec 依然绿，
 *    判据就退化成「抄了一份实现」。
 */

import {
  UNIT_CONTRACT_VERSION,
  computeUnitStats,
  deriveUnitTier,
  validateUnitContract,
} from './unit-contract';
import { splitHtmlUnits, type HtmlUnitSplitParams } from './html-unit-splitter';

const PAGES5 = [
  'html/模块1/云资源监测.html',
  'html/模块1/数据安全审计.html',
  'html/模块1/服务概览.html',
  'html/模块1/本地资源监测.html',
  'html/模块1/调用日志.html',
];

function split(over: Partial<HtmlUnitSplitParams> = {}) {
  return splitHtmlUnits({
    runId: 'run-1',
    inputKey: 'html:deadbeef0000',
    pages: PAGES5,
    features: [],
    ...over,
  });
}

describe('html-unit-splitter / 一页一单元', () => {
  it('1. 5 页 → 5 单元：sourceType/tier/status/box/页级锚点 全部正确', () => {
    const c = split();
    expect(c.units.length).toBe(5);
    for (const u of c.units) {
      expect(u.sourceType).toBe('html');
      expect(u.tier).toBe('lite');
      expect(u.tier).toBe(deriveUnitTier('html')); // 档位必须来自单一来源
      expect(u.status).toBe('pending');
      expect(u.box.width).toBeNull();
      expect(u.box.height).toBeNull();
      expect(PAGES5).toContain(u.anchor.pagePath);
      // 页级锚点：只有 pagePath，不臆造 selector / shotPath
      expect(u.anchor.selector).toBeUndefined();
      expect(u.anchor.shotPath).toBeUndefined();
      expect(u.componentId).toMatch(/^u-html-/);
    }
    // 名字 = 末两段用 ' / ' 连接且去扩展名
    const yun = c.units.find((u) => u.anchor.pagePath === 'html/模块1/云资源监测.html')!;
    expect(yun.name).toBe('模块1 / 云资源监测');
  });

  it('2. source.kind=html、inputKey=传入值、degraded=null', () => {
    const c = split({ inputKey: 'html:0123456789ab' });
    expect(c.version).toBe(UNIT_CONTRACT_VERSION);
    expect(c.source.kind).toBe('html');
    expect(c.source.figmaUrl).toBeNull();
    expect(c.source.inputKey).toBe('html:0123456789ab');
    expect(c.degraded).toBeNull();
  });

  it('3. 🔴 契约自检通过（pagePath 锚点 + 必需 inputKey 自洽）', () => {
    expect(validateUnitContract(split())).toEqual([]);
  });

  it('4. 统计自洽：total / bySource.html / byTier.lite', () => {
    const c = split();
    expect(c.stats.total).toBe(c.units.length);
    expect(c.stats.bySource.html).toBe(5);
    expect(c.stats.byTier.lite).toBe(5);
  });

  it('5. 幂等：同输入两次调用 units 深度相等、componentId 序列一致（builtAt 不参与比较）', () => {
    const a = split();
    const b = split();
    expect(a.units).toEqual(b.units);
    expect(a.units.map((u) => u.componentId)).toEqual(b.units.map((u) => u.componentId));
  });

  it('6. 顺序无关：pages 打乱传入 → componentId 排序后集合相同', () => {
    const forward = split({ pages: PAGES5 });
    const shuffled = split({ pages: [...PAGES5].reverse() });
    expect([...shuffled.units.map((u) => u.componentId)].sort()).toEqual(
      [...forward.units.map((u) => u.componentId)].sort(),
    );
    // units 本身也已稳定排序 ⇒ 逐字节相等（除 builtAt）
    expect(shuffled.units).toEqual(forward.units);
  });

  it('7. 🔴 中文页名不塌 id：两页 componentId 不同且都以 u-html- 开头', () => {
    const c = split({
      pages: ['html/模块1/云资源监测.html', 'html/模块1/数据安全审计.html'],
    });
    const ids = c.units.map((u) => u.componentId);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^u-html-/.test(id))).toBe(true);
  });

  it('8. 功能点归属：命中填 feature，不命中为 null，unmatched 与 computeUnitStats 口径一致', () => {
    const hit = split({ features: ['云资源监测'] });
    const matched = hit.units.filter((u) => u.feature === '云资源监测');
    expect(matched.length).toBe(1);
    expect(matched[0].anchor.pagePath).toBe('html/模块1/云资源监测.html');
    const nullCount = hit.units.filter((u) => u.feature === null).length;
    expect(nullCount).toBe(4);
    expect(hit.stats.unmatched).toBe(nullCount);
    expect(hit.stats.unmatched).toBe(computeUnitStats(hit.units, ['云资源监测']).unmatched);

    const miss = split({ features: [] });
    expect(miss.units.every((u) => u.feature === null)).toBe(true);
    expect(miss.stats.unmatched).toBe(computeUnitStats(miss.units, []).unmatched);
  });

  it('9. 空 pages → 零单元、degraded=null（不是降级）、stats.total=0', () => {
    const c = split({ pages: [] });
    expect(c.units).toEqual([]);
    expect(c.degraded).toBeNull();
    expect(c.stats.total).toBe(0);
  });

  it("10. ['','html/a.html','html/a.html'] → 只出 1 个单元（去空、dedupe）", () => {
    const c = split({ pages: ['', 'html/a.html', 'html/a.html'] });
    expect(c.units.length).toBe(1);
    expect(c.units[0].anchor.pagePath).toBe('html/a.html');
  });

  it('11. onLog 收到 mode=html-split（真机判据，0 也要打）', () => {
    const onLog = jest.fn();
    split({ onLog });
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog.mock.calls[0][0]).toMatchObject({ mode: 'html-split', pages: 5, units: 5 });

    const onLog0 = jest.fn();
    split({ pages: [], onLog: onLog0 });
    expect(onLog0).toHaveBeenCalledTimes(1);
    expect(onLog0.mock.calls[0][0]).toMatchObject({ mode: 'html-split', pages: 0, units: 0 });
  });
});
