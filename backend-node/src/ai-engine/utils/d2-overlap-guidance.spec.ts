/**
 * 根治⑪ spec：D2 重叠回灌指导构造器（d2-overlap-guidance.js）
 *
 * 钉子：mc-max-1794484627470-495857b7 真机实测重叠对（2026-11-12 20:03 服务日志）：
 *   「流量监测」vs「江阴靖江长江隧道」ratio 0.24、「江阴靖江长江隧道」vs「34,620」0.66、
 *   「22350」vs「江阴大桥」0.33——2 轮旧盲修指导后仍 fail-closed。
 */
import {
  buildD2Guidance,
  suggestOverlapFix,
} from './d2-overlap-guidance.js';

describe('d2-overlap-guidance 根治⑪', () => {
  /** 495857b7 真机形态钉：大字号数值压标签 */
  const REAL_PAIR_NUMBER_OVER_LABEL = {
    a: '江阴靖江长江隧道', b: '34,620', ratio: 0.66,
    aBox: [40, 120, 180, 22], bBox: [80, 122, 120, 34],
    aFs: 14, bFs: 28, aAnc: 'card-title', bAnc: 'card-title',
  };

  describe('suggestOverlapFix 形态判定', () => {
    test('① 字号差 ≥1.5 倍 ⇒ 大字数值溢出修法（含 ellipsis/缩字号配方）', () => {
      const fix = suggestOverlapFix(REAL_PAIR_NUMBER_OVER_LABEL);
      expect(fix).toContain('max-width');
      expect(fix).toContain('ellipsis');
    });

    test('② x 投影重叠>60% 且 y 投影<60% ⇒ 上下挤压（flex column + gap）', () => {
      const fix = suggestOverlapFix({
        a: 'A', b: 'B', ratio: 0.3,
        aBox: [0, 0, 100, 30], bBox: [10, 22, 100, 30], // x 重叠 90/100，y 重叠 8/30≈27%
        aFs: 14, bFs: 14,
      });
      expect(fix).toContain('flex-direction:column');
      expect(fix).toContain('gap');
    });

    test('③ y 投影重叠>60% 且 x 投影<60% ⇒ 左右挤压（min-width:0 + ellipsis）', () => {
      const fix = suggestOverlapFix({
        a: 'A', b: 'B', ratio: 0.3,
        aBox: [0, 0, 100, 30], bBox: [85, 0, 100, 30], // y 重叠 100%，x 重叠 15/100
        aFs: 14, bFs: 14,
      });
      expect(fix).toContain('min-width:0');
    });

    test('④ 同容器兜底 ⇒ 点名容器 + 改流式布局', () => {
      const fix = suggestOverlapFix({
        a: 'A', b: 'B', ratio: 0.5,
        aBox: [0, 0, 100, 30], bBox: [50, 15, 100, 30], // xo=0.5 yo=0.5，字号接近 ⇒ 落兜底
        aFs: 14, bFs: 14, aAnc: 'sec-x', bAnc: 'sec-x',
      });
      expect(fix).toContain('sec-x');
      expect(fix).toContain('flex+gap');
    });

    test('向后兼容：老结构（无坐标无字号）不抛错，给通用修法', () => {
      const fix = suggestOverlapFix({ a: 'A', b: 'B', ratio: 0.4 });
      expect(typeof fix).toBe('string');
      expect(fix.length).toBeGreaterThan(10);
    });
  });

  describe('buildD2Guidance 指导组装', () => {
    const gate = {
      issues: [
        {
          id: 'RUNTIME-016', severity: 'BLOCK', category: 'text-overlap',
          message: '真实预览存在 2 对文本节点重叠',
          evidence: { overlaps: [REAL_PAIR_NUMBER_OVER_LABEL, { a: 'A', b: 'B', ratio: 0.3 }] },
        },
        {
          id: 'RUNTIME-007', severity: 'BLOCK', category: 'http',
          message: '组件预览存在 HTTP 资源加载错误',
          evidence: { responses: [{ url: '/static/img/bg-missing.png' }, { url: '/static/img/bg-missing.png' }] },
        },
      ],
    };

    test('含 016 重叠对坐标/字号/容器与逐对修法', () => {
      const g = buildD2Guidance(gate, 1);
      expect(g).toContain('D2 文本重叠修复指导');
      expect(g).toContain('34,620');
      expect(g).toContain('字号28px');
      expect(g).toContain('⇒ 建议:');
      expect(g).toContain('必须逐对消除'.slice(0, 4)); // 「必须逐对」措辞存在（组合在禁令行）
    });

    test('RUNTIME-007 资源清单进指导（404 去重）', () => {
      const g = buildD2Guidance(gate, 1);
      expect(g).toContain('HTTP 资源加载失败');
      expect(g).toContain('bg-missing.png');
      expect(g.match(/bg-missing\.png/g).length).toBe(1); // 去重后只出现一次
    });

    test('轮次递进：round1 微调 / round2 重构 / round3 降字号保底', () => {
      const r1 = buildD2Guidance(gate, 1);
      const r2 = buildD2Guidance(gate, 2);
      const r3 = buildD2Guidance(gate, 3);
      expect(r1).toContain('最小修复');
      expect(r2).toContain('重构');
      expect(r3).toContain('降字号');
      // round 超界钳制到 3
      expect(buildD2Guidance(gate, 99)).toContain('降字号');
    });

    test('无命中项返回空串（不产生空指导污染 prompt）', () => {
      expect(buildD2Guidance({ issues: [{ id: 'RUNTIME-004', evidence: {} }] }, 1)).toBe('');
      expect(buildD2Guidance(null, 1)).toBe('');
    });

    test('overlaps 超 8 对截断到 8 行（防 prompt 爆炸），但保留总数', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({
        a: `T${i}`, b: `U${i}`, ratio: 0.2,
        aBox: [0, i * 40, 100, 30], bBox: [5, i * 40 + 20, 100, 30], aFs: 14, bFs: 14,
      }));
      const g = buildD2Guidance({ issues: [{ id: 'RUNTIME-016', evidence: { overlaps: many } }] }, 1);
      expect(g).toContain('共 12 对');
      expect(g.match(/⇒ 建议:/g).length).toBe(8);
    });
  });
});
