/**
 * 生成质量评分 v1（确定性，不含 LLM）
 *
 * specScore = clamp(0,100, 100-20×BLOCK-5×WARN)，有 BLOCK 时硬顶 79
 * styleScore 四维等权；无期望 → null（不是 0/100）
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  computeSpecScore,
  extractExpectedStyleLiterals,
  extractDeclaredStyleLiterals,
  computeStyleScore,
  mergeQualityIntoMeta,
  findFigmaNodeData,
  detectComponentType,
  scoreComponentDir,
} from '../quality-score-v1.js';

describe('computeSpecScore', () => {
  it('无问题 = 100', () => {
    expect(computeSpecScore({ blockCount: 0, warnCount: 0 }).score).toBe(100);
  });

  it('1 BLOCK 硬顶 79（不允许带阻断项显示为良好）', () => {
    expect(computeSpecScore({ blockCount: 1, warnCount: 0 }).score).toBe(79);
  });

  it('仅 WARN 扣 3', () => {
    expect(computeSpecScore({ blockCount: 0, warnCount: 1 }).score).toBe(97);
  });

  it('1 BLOCK + 1 WARN = 79（硬顶）', () => {
    expect(computeSpecScore({ blockCount: 1, warnCount: 1 }).score).toBe(79);
  });

  it('扣到 0 封底', () => {
    expect(computeSpecScore({ blockCount: 5, warnCount: 5 }).score).toBe(45);
  });

  it('可从 issues 计数', () => {
    const r = computeSpecScore({
      issues: [
        { id: 'A', severity: 'BLOCK', message: 'x' },
        { id: 'B', severity: 'WARN', message: 'y' },
      ],
    });
    expect(r.blockCount).toBe(1);
    expect(r.warnCount).toBe(1);
    expect(r.score).toBe(79);
  });
});

describe('computeStyleScore', () => {
  it('无期望时 score=null（不是 0 也不是 100）', () => {
    expect(computeStyleScore(null, { color: ['#000'] }).score).toBeNull();
    expect(computeStyleScore({ color: [], spacing: [], font: [], radius: [] }, { color: ['#000'] }).score).toBeNull();
  });

  it('四维完全匹配 = 100', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'], font: ['16px'], radius: ['4px'] };
    const actual = { color: ['#ff0000'], spacing: ['8px'], font: ['16px'], radius: ['4px'] };
    expect(computeStyleScore(expected, actual).score).toBe(100);
  });

  it('两维一半匹配 = 50', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'] };
    const actual = { color: ['#ff0000'], spacing: ['12px'] };
    expect(computeStyleScore(expected, actual).score).toBe(50);
  });

  it('颜色完全不匹配 = 0，覆盖率不足封顶 60 不影响 0', () => {
    const expected = { color: ['#ff0000'] };
    const actual = { color: ['#000000'] };
    expect(computeStyleScore(expected, actual).score).toBe(0);
  });

  it('某维无期望不进平均', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'] };
    const actual = { color: ['#ff0000'] };
    expect(computeStyleScore(expected, actual).score).toBe(50);
  });

  // 🔴 回归锁（2026-09-30 复审）：容差不得放宽。曾有一版把 tolerance 3→5 / relativeTolerance 0.15→0.2，
  //   理由是「期望 18↔16、11↔12、16↔14 被误杀」—— 实测旧档本来就匹配，属错误理由，
  //   且放宽后差 4px 会被判匹配 ⇒ 破坏「不匹配应判 50」契约、用户侧质量分虚高。
  it('spacing 容差边界：差 3px 判匹配、差 4px 判不匹配（tolerance 不得放宽）', () => {
    const scoreWith = (actualSpacing: string) =>
      computeStyleScore(
        { color: ['#ff0000'], spacing: ['8px'] },
        { color: ['#ff0000'], spacing: [actualSpacing] },
      ).score;
    expect(scoreWith('11px')).toBe(100); // 差 3 ⇒ 匹配
    expect(scoreWith('12px')).toBe(50); // 差 4 ⇒ 不匹配（放宽容差即在此失守）
  });
});

describe('extractDeclaredStyleLiterals', () => {
  it('从 CSS 声明抽 color/spacing/font/radius', () => {
    const files = [
      { content: 'background: #ff0000; margin: 8px 12px; font-size: 16px; border-radius: 4px;' },
    ];
    expect(extractDeclaredStyleLiterals(files)).toMatchObject({
      color: ['#ff0000'],
      spacing: ['8px', '12px'],
      font: ['16px'],
      radius: ['4px'],
    });
  });
});

describe('extractExpectedStyleLiterals', () => {
  it('从 Figma SOLID fill 抽出 CSS hex', () => {
    const figma = {
      document: {
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      },
    };
    expect(extractExpectedStyleLiterals(figma).color).toContain('#ff0000');
  });

  it('无节点树返回空期望', () => {
    expect(extractExpectedStyleLiterals(null).color).toEqual([]);
    expect(extractExpectedStyleLiterals({ url: 'https://figma.com' }).color).toEqual([]);
  });

  // 🔴 回归锁（2026-09-30 复审）：Math.round **只去浮点噪声**，不得改变纳入集合。
  //   曾有一版对 itemSpacing 加 `> 0` 过滤，连 0 与负值一起丢弃 ⇒ 期望分母变小 ⇒ 分数虚高
  //   （负 itemSpacing 是真实叠加排布事实，不是噪声）。
  it('spacing 去浮点噪声但不改变纳入集合（0 与负值仍纳入）', () => {
    const exp = extractExpectedStyleLiterals({
      document: {
        children: [
          { itemSpacing: 17.600000381469727, paddingLeft: 11.199999809265137 },
          { itemSpacing: 0 },
          { itemSpacing: -8 },
        ],
      },
    });
    expect(exp.spacing).toContain('18px'); // 去噪：17.600000381469727 → 18
    expect(exp.spacing).toContain('11px'); // 去噪：11.199999809265137 → 11
    expect(exp.spacing).toContain('0px'); // 0 仍纳入
    expect(exp.spacing).toContain('-8px'); // 负值仍纳入
  });
});

describe('findFigmaNodeData', () => {
  it('认得真实落盘名 .mc-gen/cache/figma-node-data.json（回归 2026-09-19）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-figma-'));
    try {
      const cacheDir = join(dir, '.mc-gen', 'cache');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'figma-node-data.json'),
        JSON.stringify({
          fileKey: 'fk',
          nodeId: '1:2',
          document: { id: '1:2', type: 'FRAME', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
        }),
      );
      const found = findFigmaNodeData(dir);
      expect(found).toBeTruthy();
      expect(extractExpectedStyleLiterals(found).color).toContain('#ff0000');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没有任何节点树候选时返回 null（styleScore 保持 null 不伪造）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-nofigma-'));
    try {
      expect(findFigmaNodeData(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('detectComponentType', () => {
  it('有 declare.json 判为 microcode', () => {
    expect(detectComponentType('/x', [{ path: 'declare.json', content: '{}' }])).toBe('microcode');
  });

  it('无 declare.json（含 common.less）判为 vue3（回归 2026-09-19：vue3 也带 common.less）', () => {
    expect(
      detectComponentType('/x', [
        { path: 'common.less', content: '.a{}' },
        { path: 'package/index.vue', content: '<template/>' },
      ]),
    ).toBe('vue3');
  });
});

describe('scoreComponentDir (vue3 分流)', () => {
  it('Vue3 剔除 CODE-008 假阳性（手写图片 import 在 vue3 合法）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-vue3-'));
    try {
      mkdirSync(join(dir, '.mc-gen', 'cache'), { recursive: true });
      writeFileSync(
        join(dir, '.mc-gen', 'cache', 'figma-node-data.json'),
        JSON.stringify({ fileKey: 'fk', nodeId: '1:2', document: { id: '1:2', type: 'FRAME' } }),
      );
      // 模拟 vue3 产物：无 declare.json，有 common.less + 手写图片 import 的 index.vue
      writeFileSync(join(dir, 'common.less'), '.c-x-root{}');
      mkdirSync(join(dir, 'package'), { recursive: true });
      writeFileSync(
        join(dir, 'package', 'index.vue'),
        '<template><div class="c-x-root"><img/></div></template>\n<script setup>\nimport bg from "../resources/images/bg.png"\n</script>',
      );
      const r = await scoreComponentDir(dir, { persist: false, componentId: 'mv-vue3-fixture' });
      expect(r.quality.spec.issues.every((i: any) => i.id !== 'CODE-008')).toBe(true);
      expect(typeof r.quality.specScore).toBe('number');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('mergeQualityIntoMeta', () => {
  it('merge 不覆盖既有 degraded 等字段', () => {
    const next = mergeQualityIntoMeta(
      { quality: { degraded: true, layoutSource: 'vision' } },
      { version: 'v1', specScore: 79, styleScore: null },
    );
    expect(next.quality.degraded).toBe(true);
    expect(next.quality.layoutSource).toBe('vision');
    expect(next.quality.specScore).toBe(79);
    expect(next.quality.styleScore).toBeNull();
  });
});

describe('scoreComponentDir', () => {
  it('无 Figma 树时 styleScore=null，且 persist:false 不写盘', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-v1-'));
    try {
      writeFileSync(join(dir, 'declare.json'), JSON.stringify({ componentId: 'c-qs-fixture' }));
      writeFileSync(join(dir, 'index.vue'), '<template><div class="c-qs-fixture">x</div></template>');
      const r = await scoreComponentDir(dir, { persist: false, componentId: 'c-qs-fixture' });
      expect(r.quality).toBeTruthy();
      expect(r.quality.version).toBe('v1');
      expect(typeof r.quality.specScore).toBe('number');
      expect(r.quality.styleScore).toBeNull();
      expect(r.quality.style.reason).toBe('no-expected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
