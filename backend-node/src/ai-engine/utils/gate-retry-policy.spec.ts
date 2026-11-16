import {
  isRetryWorthyIssue,
  shouldRetryL0B,
  pickRetryWorthyIssues,
  resolveAcceptanceMaxRetry,
  isLegacyRetryPolicy,
  summarizeNoiseIssues,
  RETRY_WORTHY_PATTERNS,
} from './gate-retry-policy.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 接线锚点（回归锁）：判据做出来但没接线 = 零生效。
 * 本项目已有「只改 mc-max 就报四象限已支持」的历史事故，故把接线写成断言：
 * 两张 max 图（phase2 / vue3）都必须消费同一份 gate-retry-policy，且 acceptance 的
 * 硬编码轮次 2 必须已被 env 化 —— 任何一处回退本 spec 即红。
 */
describe('接线锚点：两张 max 图同源消费分级判据', () => {
  const readSrc = (rel: string) =>
    fs.readFileSync(path.join(__dirname, rel), 'utf8');

  test('mc-max（phase2）：L0-B 条件边消费 shouldRetryL0B', () => {
    const src = readSrc('../graphs/mc-component-graph-phase2.js');
    expect(src).toContain('shouldRetryL0B(r.issues)');
    expect(src).toContain("from '../utils/gate-retry-policy.js'");
  });

  test('vu3-max（vue3）：L0-B 条件边消费 shouldRetryL0B（不得只改一张图）', () => {
    const src = readSrc('../graphs/mc-component-graph-vue3.js');
    expect(src).toContain('shouldRetryL0B(r.issues)');
    expect(src).toContain("from '../utils/gate-retry-policy.js'");
  });

  test('acceptance 轮次上限已 env 化（原 const _accMaxRetry = 2 不得复活）', () => {
    const src = readSrc('../graphs/mc-component-graph-phase2.js');
    expect(src).toContain('resolveAcceptanceMaxRetry(process.env)');
    expect(src).not.toMatch(/_accMaxRetry\s*=\s*2\s*;/);
    expect(src).not.toMatch(/retry=\$\{retryNo\}\/2/);
  });

  test('acceptance 初检「全可降级 ⇒ 零重试」分支存在', () => {
    const src = readSrc('../graphs/mc-component-graph-phase2.js');
    expect(src).toContain('零重试直接降级交付');
  });

  test('P3 噪声聚合：两图修复指导都只列 A 档 + 汇总行', () => {
    for (const rel of [
      '../graphs/mc-component-graph-phase2.js',
      '../graphs/mc-component-graph-vue3.js',
    ]) {
      const src = readSrc(rel);
      expect(src).toContain('pickRetryWorthyIssues(blockIssues)');
      expect(src).toContain('summarizeNoiseIssues(result.issues');
    }
  });
});


describe('isRetryWorthyIssue（A 档才配花重试预算）', () => {
  test('阳性对照：真硬伤 → true', () => {
    // 空产物 / 白屏 / 运行时崩 / 语法 / 整层缺失 / 打不开
    for (const id of [
      'EMPTY_ARTIFACT',
      'EMPTY_SHELL',
      'EMPTY_BODY',
      'ARTIFACT_INCOMPLETE',
      'RUNTIME-001',
      'RUNTIME-004',
      'RUNTIME-016',
      'RUNTIME-017',
      'CLASS-MUST-EXIST',
      'CODE-029-UNDECLARED-RUNTIME-IDENT',
      'RES-URL-UNDECLARED',
      'RESOURCE-003',
      'CODE-015',
      'LESS-COMPILE-001',
      'TEXT-COVERAGE-GATE',
      'SECTION-ANCHOR-MISSING',
      'Dangling',
    ]) {
      expect([id, isRetryWorthyIssue({ id, severity: 'BLOCK' })]).toEqual([id, true]);
    }
  });

  test('阴性对照：形态/语义/几何欠佳 → false（不占预算，直接降级交付）', () => {
    for (const id of [
      'CODE-001',
      'CODE-002',
      'CODE-004',
      'CODE-005',
      'CODE-011',
      'CODE-012',
      'CODE-017',
      'CODE-020',
      'CODE-021',
      'CODE-022',
      'CODE-023',
      'CODE-024',
      'CODE-025',
      'CODE-026',
      'COMP-001',
      'COMP-002',
      'PROP-BIND',
      'SEMANTIC-BINDING',
      'TEXT-001',
      'TEXT-TRUTH',
      'FLEX-001',
      'FLEX-003',
      'INLINE-GEOM-PX',
      'INLINE-GEOM-DUP',
      'VERT-004',
      'FLEX-002',
      'LAYOUT-001',
      'VISUAL-002',
      'RUNTIME-018',
    ]) {
      expect([id, isRetryWorthyIssue({ id, severity: 'BLOCK' })]).toEqual([id, false]);
    }
  });

  test('非 BLOCK 一律 false（WARN 不占预算）', () => {
    expect(isRetryWorthyIssue({ id: 'RUNTIME-016', severity: 'WARN' })).toBe(false);
    expect(isRetryWorthyIssue({ id: 'EMPTY_BODY', severity: 'INFO' })).toBe(false);
  });

  test('WARN 升级合成的 -ESCALATED 不占重试预算（它只负责禁止发布）', () => {
    expect(
      isRetryWorthyIssue({ id: 'FLEX-004-ESCALATED', severity: 'BLOCK' }),
    ).toBe(false);
    expect(
      isRetryWorthyIssue({ id: 'TEXT-AXIS-ESCALATED', severity: 'BLOCK' }),
    ).toBe(false);
  });

  test('空 id / 空对象 / null 不炸且 false', () => {
    expect(isRetryWorthyIssue({})).toBe(false);
    expect(isRetryWorthyIssue({ id: '', severity: 'BLOCK' })).toBe(false);
    expect(isRetryWorthyIssue(null)).toBe(false);
    expect(isRetryWorthyIssue(undefined)).toBe(false);
  });

  test('不误吞前缀相近项（RUNTIME-018 是几何欠佳，不是 001-006 家族）', () => {
    expect(isRetryWorthyIssue({ id: 'RUNTIME-018', severity: 'BLOCK' })).toBe(false);
    expect(isRetryWorthyIssue({ id: 'RUNTIME-010', severity: 'BLOCK' })).toBe(false);
  });
});

describe('shouldRetryL0B / pickRetryWorthyIssues', () => {
  test('空列表 → false（绝不因空数组空转一轮）', () => {
    expect(shouldRetryL0B([])).toBe(false);
    expect(shouldRetryL0B()).toBe(false);
    expect(shouldRetryL0B(null)).toBe(false);
  });

  test('只有 B/C 档 → false（这是本次改造的核心收益：零重试）', () => {
    expect(
      shouldRetryL0B([
        { id: 'CODE-021', severity: 'BLOCK' },
        { id: 'FLEX-003', severity: 'BLOCK' },
        { id: 'VERT-004', severity: 'WARN' },
      ]),
    ).toBe(false);
  });

  test('混入任一 A 档 → true', () => {
    expect(
      shouldRetryL0B([
        { id: 'CODE-021', severity: 'BLOCK' },
        { id: 'RUNTIME-004', severity: 'BLOCK' },
      ]),
    ).toBe(true);
  });

  test('pickRetryWorthyIssues 只留 A 档且保序', () => {
    const out = pickRetryWorthyIssues([
      { id: 'CODE-020', severity: 'BLOCK' },
      { id: 'EMPTY_BODY', severity: 'BLOCK' },
      { id: 'CODE-024', severity: 'BLOCK' },
      { id: 'RUNTIME-016', severity: 'BLOCK' },
    ]);
    expect(out.map((i) => i.id)).toEqual(['EMPTY_BODY', 'RUNTIME-016']);
  });
});

describe('resolveAcceptanceMaxRetry（原硬编码 2）', () => {
  const KEY = 'ACCEPTANCE_MAX_RETRY';
  afterEach(() => {
    delete process.env[KEY];
  });

  test('未配置 → 默认 1（实测第二轮 effective=false 占多数）', () => {
    delete process.env[KEY];
    expect(resolveAcceptanceMaxRetry({})).toBe(1);
    expect(resolveAcceptanceMaxRetry()).toBe(1);
  });

  test('显式配置生效，且钳制在 0..3', () => {
    expect(resolveAcceptanceMaxRetry({ [KEY]: '0' })).toBe(0);
    expect(resolveAcceptanceMaxRetry({ [KEY]: '2' })).toBe(2);
    expect(resolveAcceptanceMaxRetry({ [KEY]: '99' })).toBe(3);
  });

  test('非法值回落默认，不返回 NaN（否则 retry=n/NaN 且条件恒真）', () => {
    expect(resolveAcceptanceMaxRetry({ [KEY]: 'abc' })).toBe(1);
    expect(resolveAcceptanceMaxRetry({ [KEY]: '-1' })).toBe(1);
    expect(resolveAcceptanceMaxRetry({ [KEY]: '' })).toBe(1);
  });

  test('=0 表示「只判不修」（压测用）', () => {
    expect(Number.isFinite(resolveAcceptanceMaxRetry({ [KEY]: '0' }))).toBe(true);
    expect(resolveAcceptanceMaxRetry({ [KEY]: '0' })).toBe(0);
  });
});

describe('isLegacyRetryPolicy（旧口径回退开关）', () => {
  test('未设置 / 其他值 → false（新口径）', () => {
    expect(isLegacyRetryPolicy({})).toBe(false);
    expect(isLegacyRetryPolicy({ MVGO_GATE_RETRY_POLICY: 'new' })).toBe(false);
  });

  test('legacy（大小写/空格不敏感）→ true', () => {
    expect(isLegacyRetryPolicy({ MVGO_GATE_RETRY_POLICY: 'legacy' })).toBe(true);
    expect(isLegacyRetryPolicy({ MVGO_GATE_RETRY_POLICY: ' LEGACY ' })).toBe(true);
  });
});

describe('summarizeNoiseIssues（P3 噪声聚合）', () => {
  test('只有 A 档 → 无汇总行（noise=0）', () => {
    const r = summarizeNoiseIssues([
      { id: 'EMPTY_BODY', severity: 'BLOCK' },
      { id: 'RUNTIME-004', severity: 'BLOCK' },
    ]);
    expect(r.noise).toBe(0);
    expect(r.line).toBe('');
  });

  test('B/C 档按维度计数，且不把 A 档算进噪声', () => {
    const r = summarizeNoiseIssues([
      { id: 'CODE-021', severity: 'BLOCK' }, // 结构
      { id: 'FLEX-003', severity: 'BLOCK' }, // 结构
      { id: 'CODE-022', severity: 'BLOCK' }, // 资源
      { id: 'CODE-020', severity: 'BLOCK' }, // 类名
      { id: 'TEXT-001', severity: 'BLOCK' }, // 语义
      { id: 'RUNTIME-016', severity: 'BLOCK' }, // A 档，不计
    ]);
    expect(r.noise).toBe(5);
    expect(r.counts).toEqual({ 结构: 2, 资源: 1, 类名: 1, 语义: 1 });
    expect(r.line).toContain('其余 5 项');
    expect(r.line).toContain('结构=2');
  });

  test('空列表 → 空行，不产出噪声文案', () => {
    expect(summarizeNoiseIssues([]).line).toBe('');
    expect(summarizeNoiseIssues(null).line).toBe('');
  });
});

describe('判据单一来源：模式表非空且无重复', () => {
  test('RETRY_WORTHY_PATTERNS 至少覆盖空产物/运行时/语法三类', () => {
    const src = RETRY_WORTHY_PATTERNS.map(String).join('|');
    expect(src).toContain('EMPTY_ARTIFACT');
    expect(src).toContain('RUNTIME-');
    expect(src).toContain('SFC-');
  });
});
