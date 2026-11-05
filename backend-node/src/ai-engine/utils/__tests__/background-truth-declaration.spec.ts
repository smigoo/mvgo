/**
 * 🛡️ F3′（2026-11-05 · 刀53 三链治本）：背景四件套「声明级真值归属」回归。
 *
 * 根因（真机 `mc-max-1793869867060-e23b0b40` / `mc-max-1793869846208-300fe0f7` 实锤）：
 * S6 自愈补缺失的 size/repeat/position 时一律用 `inferBackgroundStyle({})` 的**中性默认**
 * （`100% 100%` / `no-repeat` / `0px 0px`），但 `bg-_m-36.png`（191×81 / parent 192×114）
 * 的真值是 `191px 80px` @ `1px 31px` ⇒ 小底图被拉满整卡（环形图变巨环）。
 * 产物里 `backgroundPosition: '0px 0px'` 就是该路径的指纹。
 *
 * 本 spec 锁三件事：
 *   ① 三个解析器（索引/import 变量/值原文）口径正确；
 *   ② 有真值时按资源取真值装配（阳性）；
 *   ③ 无 mapping / 解析不到资源时**逐字等同旧行为**（阴性对照，零回归）。
 */
import {
  buildBackgroundResourceIndex,
  buildBgVarToResource,
  resolveBackgroundResourceRef,
  inferBackgroundStyle,
} from '../background-size-inference';
import { ensureBackgroundStyleComplete } from '../post-process';

/** 真机资源真值（取自 resource-dom-mapping.json，几何为 Figma 实际值） */
const MAPPING = [
  {
    resourceFile: 'resources/images/bg-_m-36.png',
    figmaBox: { x: 1, y: 31, width: 191, height: 80.267578125 },
    parentBox: { x: 0, y: 0, width: 192, height: 114 },
  },
  {
    resourceFile: 'resources/images/bg-_m-35.png',
    figmaBox: { x: 1, y: 30, width: 191, height: 81.267578125 },
    parentBox: { x: 0, y: 0, width: 192, height: 114 },
  },
  {
    // 铺满型：figmaBox === parentBox ⇒ 真值本来就是 100% 100%
    resourceFile: 'resources/images/bg-_m-34.png',
    figmaBox: { x: 0, y: 0, width: 425.8287353515625, height: 91.4396743774414 },
    parentBox: { x: 0, y: 0, width: 425.8287353515625, height: 91.4396743774414 },
  },
];

const SFC = [
  '<template>',
  '  <div class="a" :style="{ backgroundImage: `url(${bg36})` }">A</div>',
  '  <div class="b" :style="{ backgroundImage: `url(${bg34})` }">B</div>',
  '  <div class="c" :style="{ backgroundImage: `url(${unknownVar})` }">C</div>',
  '  <div class="d" :style="{ backgroundImage: `url(\'/abs/bg-_m-35.png\')` }">D</div>',
  '</template>',
  '<script setup>',
  "import bg36 from '../../resources/images/bg-_m-36.png'",
  "import bg34 from '../../resources/images/bg-_m-34.png'",
  '</script>',
].join('\n');

const styleLines = (out: string) => out.split('\n').filter((l) => l.includes(':style='));

describe('F3′ 背景声明级真值归属', () => {
  describe('解析器口径', () => {
    it('buildBackgroundResourceIndex 同时认 basename 与去扩展名 stem', () => {
      const idx = buildBackgroundResourceIndex(MAPPING);
      expect(idx.get('bg-_m-36.png')).toBe(MAPPING[0]);
      expect(idx.get('bg-_m-36')).toBe(MAPPING[0]);
      expect(idx.get('nope.png')).toBeUndefined();
    });

    it('buildBackgroundResourceIndex 容忍 {mappings:[]} 形态与空入参', () => {
      expect(buildBackgroundResourceIndex({ mappings: MAPPING }).size).toBe(6);
      expect(buildBackgroundResourceIndex(null).size).toBe(0);
      expect(buildBackgroundResourceIndex(undefined).size).toBe(0);
    });

    it('buildBgVarToResource 解析 import 与 const-require 两种绑定', () => {
      const m = buildBgVarToResource(
        [
          "import bg1 from '../../resources/images/bg-_m-36.png'",
          "const bg2 = require('./x/bg-_m-35.png')",
          'const unrelated = 1',
        ].join('\n'),
      );
      expect(m.get('bg1')).toBe('bg-_m-36.png');
      expect(m.get('bg2')).toBe('bg-_m-35.png');
      expect(m.has('unrelated')).toBe(false);
    });

    it('resolveBackgroundResourceRef 直读文件名优先，其次 import 变量', () => {
      const varToRes = new Map([['bg4', 'bg-_m-36.png']]);
      expect(resolveBackgroundResourceRef("url('/abs/bg-_m-35.png')", varToRes)).toBe('bg-_m-35.png');
      expect(resolveBackgroundResourceRef('url(${bg4})', varToRes)).toBe('bg-_m-36.png');
      expect(resolveBackgroundResourceRef('url(${nope})', varToRes)).toBe(null);
      expect(resolveBackgroundResourceRef('', varToRes)).toBe(null);
    });
  });

  describe('阳性：有真值 → 按资源装配（不再用中性默认）', () => {
    it('bg-_m-36 补出 191px 80px @ 1px 31px，而不是 100% 100% @ 0px 0px', () => {
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(SFC, MAPPING, stats);
      const [a] = styleLines(out);

      expect(a).toContain("backgroundSize: '191px 80px'");
      expect(a).toContain("backgroundPosition: '1px 31px'");
      expect(a).toContain("backgroundRepeat: 'no-repeat'");
      expect(a).not.toContain("backgroundSize: '100% 100%'");
    });

    it('铺满型 bg-_m-34 真值本就是 100% 100% @ 0px 0px（与真值一致，非兜底）', () => {
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(SFC, MAPPING, stats);
      const b = styleLines(out)[1];
      expect(b).toContain("backgroundSize: '100% 100%'");
      expect(b).toContain("backgroundPosition: '0px 0px'");
      expect(stats.bgStyleTruthUsed).toBe(3); // bg36 + bg34 + 直接文件名
    });

    it('直接写文件名（无 import）也能命中真值', () => {
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(SFC, MAPPING, stats);
      const d = styleLines(out)[3];
      expect(d).toContain("backgroundSize: '191px 81px'");
      expect(d).toContain("backgroundPosition: '1px 30px'");
    });

    it('真值装配结果与 inferBackgroundStyle 同一口径（单一事实源）', () => {
      const truth = inferBackgroundStyle({ ...MAPPING[0] });
      expect(truth.size).toBe('191px 80px');
      expect(truth.position).toBe('1px 31px');
    });
  });

  describe('阴性对照：无真值 → 逐字保留旧行为（零回归）', () => {
    it('不传 mapping 时全部回落中性默认', () => {
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(SFC, null, stats);
      for (const line of styleLines(out)) {
        expect(line).toContain("backgroundSize: '100% 100%'");
        expect(line).toContain("backgroundPosition: '0px 0px'");
        expect(line).toContain("backgroundRepeat: 'no-repeat'");
      }
      expect(stats.bgStyleTruthUsed).toBeUndefined();
      expect(stats.bgStyleNeutralFallback).toBe(4);
    });

    it('变量解析不出资源时回落中性默认（不猜）', () => {
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(SFC, MAPPING, stats);
      const c = styleLines(out)[2];
      expect(c).toContain("backgroundSize: '100% 100%'");
      expect(c).toContain("backgroundPosition: '0px 0px'");
      expect(stats.bgStyleNeutralFallback).toBe(1);
    });

    it('四件套已完整的元素不动（引用相等，不计入分母）', () => {
      const complete = [
        '<template>',
        '  <div :style="{ backgroundImage: `url(${bg4})`, backgroundSize: \'191px 80px\', backgroundRepeat: \'no-repeat\', backgroundPosition: \'1px 31px\' }">A</div>',
        '</template>',
      ].join('\n');
      const stats: Record<string, number> = {};
      const out = ensureBackgroundStyleComplete(complete, MAPPING, stats);
      expect(out).toBe(complete);
      expect(stats.bgStyleTruthUsed).toBeUndefined();
      expect(stats.bgStyleNeutralFallback).toBeUndefined();
    });

    it('无 backgroundImage 的文件直接短路返回（引用相等）', () => {
      const plain = '<template><div class="x" /></template>';
      expect(ensureBackgroundStyleComplete(plain, MAPPING, {})).toBe(plain);
    });
  });
});
