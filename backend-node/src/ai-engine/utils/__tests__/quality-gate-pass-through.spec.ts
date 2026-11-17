/**
 * 🛡️ 2026-11-17 质量门禁放行策略防回退契约
 *
 * 用户指令：产物质量瑕疵（能运行）不要再 BLOCK 让用户白等最后 failed，
 * 改成放行 + WARN + 写清具体问题文字。边界：产物跑不起来的（LESS/SFC 语法错、
 * 空产物、CODE-023 白屏）仍保留 BLOCK。
 *
 * 本 spec 只锁「能运行类」的三条 DO-NOT-INVENT 与两条 graph 的放行接线：
 *   ① validator 三条 severity=WARN（不进 BLOCK）
 *   ② 两条 graph 的 throw 条件只看 BLOCK；WARN 走放行 + 写回具体问题文字
 * 判据本体（collectChartMountVerdicts / extractForbiddenPairs 等）仍由原 spec 覆盖，
 * 本 spec 不管判据放宽，只管「档位与放行接线没被回退」。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VALIDATOR = readFileSync(
  join(__dirname, '../../validators/do-not-invent-validator.js'),
  'utf8',
);
const PHASE2 = readFileSync(
  join(__dirname, '../../graphs/mc-component-graph-phase2.js'),
  'utf8',
);
const VUE3 = readFileSync(
  join(__dirname, '../../graphs/mc-component-graph-vue3.js'),
  'utf8',
);

/** 剥整行注释，避免注释里的旧符号（BLOCK 字样）造成假阳性 */
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const V = stripComments(VALIDATOR);
const P = stripComments(PHASE2);
const G = stripComments(VUE3);

/** 取某 id 的 issue 块内 severity 值（id 在前、severity 在后，窗口 200 字） */
const severityOf = (src: string, id: string): string | null => {
  const at = src.indexOf(`id: '${id}'`);
  if (at < 0) return null;
  const window = src.slice(Math.max(0, at - 160), at + 60);
  const m = /severity:\s*'(BLOCK|WARN)'/.exec(window);
  return m ? m[1] : null;
};

describe('质量门禁放行策略：三条 DO-NOT-INVENT 降 WARN（能运行即交付）', () => {
  for (const id of [
    'DO-NOT-INVENT-TEXT',
    'DO-NOT-INVENT-CHART-MISSING',
    'DO-NOT-INVENT-CHART-MOUNT-MISSING',
  ]) {
    it(`${id} 的 severity 已降 WARN（不再 BLOCK）`, () => {
      expect(severityOf(V, id)).toBe('WARN');
    });
  }

  it('阳性锚：三条判据本体仍在（不是删规则）', () => {
    expect(V).toMatch(/extractForbiddenPairs\(doNotInvent\)/);
    // 2026-11-17 判据同源化：图表类型缺失组装抽到 findMissingChartTypes 单一来源，
    // 判据本体仍在（validator 调用它 + 单一来源内部 collectChartSeriesTypes），不是删规则。
    expect(V).toMatch(/findMissingChartTypes\(\{/);
    const shared = readFileSync(
      join(__dirname, '../chart-missing-types.js'),
      'utf-8',
    );
    expect(shared).toMatch(/collectChartSeriesTypes\(content\)/);
    expect(V).toMatch(/collectChartMountVerdicts\(files\)/);
  });

  it('阳性锚：WARN message 带具体问题文字（非阻断前缀 + 判据描述）', () => {
    expect(V).toMatch(/（非阻断：质量留痕）核心文案被篡改/);
    expect(V).toMatch(/（非阻断：质量留痕）图表类型缺失/);
    expect(V).toMatch(/（非阻断：质量留痕）echarts 挂载点缺失/);
  });
});

describe('放行接线：两条 graph 只看 BLOCK throw，WARN 写回用户可见字段', () => {
  it('phase2（mc）：throw 条件为 _dniBlocks.length > 0，不再用 !res.pass', () => {
    expect(P).toMatch(/const _dniBlocks = res\.issues\.filter\(\(i\) => i\.severity === 'BLOCK'\)/);
    expect(P).toMatch(/if \(_dniBlocks\.length > 0\) \{[\s\S]{0,700}throw err/);
    expect(P).not.toMatch(/if \(!res\.pass\) \{[\s\S]{0,200}DO_NOT_INVENT_BLOCKED/);
  });

  it('phase2（mc）：WARN 写回 _acceptanceWarningText / _acceptanceWarnings', () => {
    expect(P).toMatch(/state\._acceptanceWarningText = `已交付，但仍有待补内容/);
    expect(P).toMatch(/state\._acceptanceWarnings = _dniWarns\.map/);
  });

  it('vue3：throw 条件同样只看 BLOCK，WARN 写回 _doNotInventWarningText', () => {
    expect(G).toMatch(/const _dniBlocks = res\.issues\.filter\(\(i\) => i\.severity === 'BLOCK'\)/);
    expect(G).toMatch(/state\._doNotInventWarningText = `已交付，但仍有待补内容/);
  });

  it('边界：白屏硬闸 CODE-023 未出现在放行清单（仍 BLOCK）', () => {
    const passThroughFile = readFileSync(
      join(__dirname, '../../validators/do-not-invent-validator.js'),
      'utf8',
    );
    expect(passThroughFile).not.toMatch(/id: 'CODE-023'[\s\S]{0,80}severity: 'WARN'/);
  });
});
