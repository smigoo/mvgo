/**
 * 🛡️ 2026-11-17 判据同源化回归：findMissingChartTypes 单一来源
 *
 * 覆盖：
 * ① 判据函数阴阳对照（缺类型命中 / 已存在放行 / line 缺省 series 豁免 / 文字卡承载豁免 / null 类型跳过）
 * ② 门禁 validator 2.5 段已切换调用单一来源（源码契约）
 * ③ mc + vue3 两侧 N2 触发判据 + 注入类型口径已切换（源码契约，四象限同步）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findMissingChartTypes, findChartHolderFile } from '../chart-missing-types.js';
import { validateDoNotInvent } from '../../validators/do-not-invent-validator.js';

const SRC = join(__dirname, '../../..');

const vueWith = (seriesType: string) =>
  `<template><div class="c-root"><div ref="chartRef"></div></div></template>` +
  `<script>import * as echarts from 'echarts'; export default { setup() { echarts.init(chartRef.value).setOption({ series: [{ type: '${seriesType}', data: [] }] }) } }</script>`;

describe('findMissingChartTypes —— 缺失类型判据单一来源', () => {
  it('①阳：vision 有 pie，产物只有 line series ⇒ missing=[pie]', () => {
    const r = findMissingChartTypes({
      charts: [{ type: 'doughnut' }],
      files: { 'package/index.vue': vueWith('line') },
    });
    expect(r.missing.map((m) => m.type)).toEqual(['pie']);
    expect(r.generatedTypes.has('line')).toBe(true);
  });

  it('①阳：vision 有 pie+bar，产物无 echarts ⇒ 两个都 missing', () => {
    const r = findMissingChartTypes({
      charts: [{ type: 'pie' }, { type: 'bar' }],
      files: { 'package/index.vue': '<template><div/></template>' },
    });
    expect(r.missing.map((m) => m.type).sort()).toEqual(['bar', 'pie']);
  });

  it('①阴：vision 有 pie，产物已有 pie series ⇒ missing=[]（含 doughnut 归一）', () => {
    const r = findMissingChartTypes({
      charts: [{ type: 'doughnut' }],
      files: { 'package/index.vue': vueWith('pie') },
    });
    expect(r.missing).toEqual([]);
  });

  it('①阴：vision 有 line，产物有 series 声明但无显式 type ⇒ 豁免，missing=[]', () => {
    const content =
      '<script>setOption({ series: [{ data: [1] }] })</script>';
    const r = findMissingChartTypes({
      charts: [{ type: 'line' }],
      files: { 'package/index.vue': content },
    });
    expect(r.hasSeriesDecl).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('①阴：vision chart.type=multiple（无法归一）⇒ 跳过，missing=[]', () => {
    const r = findMissingChartTypes({
      charts: [{ type: 'multiple' }],
      files: {},
    });
    expect(r.missing).toEqual([]);
  });

  it('①阳：缺失类型带出对应 vision chart（供注入器取 legend/series 真值）', () => {
    const pieChart = { type: 'pie', series: ['客车', '货车'], legend: { items: ['客车', '货车'] } };
    const r = findMissingChartTypes({
      charts: [{ type: 'line' }, pieChart],
      files: { 'package/index.vue': vueWith('line') },
    });
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].chart).toBe(pieChart);
  });
});

describe('判据同源化接线（源码契约，四象限同步）', () => {
  const VALIDATOR = readFileSync(
    join(SRC, 'ai-engine/validators/do-not-invent-validator.js'),
    'utf-8',
  );
  const MC = readFileSync(join(SRC, 'ai-engine/roles/microcode-engineer.js'), 'utf-8');
  const VUE3 = readFileSync(join(SRC, 'ai-engine/roles/vue3-engineer.js'), 'utf-8');
  const LEAF = readFileSync(join(SRC, 'ai-engine/utils/chart-type-detection.js'), 'utf-8');

  it('②底层纯函数下沉到无依赖叶子模块，validator re-export 零回归', () => {
    expect(LEAF).toMatch(/export function normalizeChartType/);
    expect(LEAF).toMatch(/export function collectChartSeriesTypes/);
    expect(LEAF).toMatch(/export function collectTextCarriedChartTypes/);
    expect(VALIDATOR).toMatch(/export \{\s*normalizeChartType,/);
  });

  it('②门禁 2.5 段已切换到 findMissingChartTypes 单一来源', () => {
    expect(VALIDATOR).toMatch(/findMissingChartTypes\(\{[\s\S]{0,120}charts: analysisCharts/);
    // 旧的本地组装判据不得残留
    expect(VALIDATOR).not.toMatch(/const requiredTypes = new Set\(/);
  });

  it('②mc N2：触发判据用 missing、注入类型用缺失类型（非 charts[0]）', () => {
    expect(MC).toMatch(/const \{ missing: missingCharts, exemptBlocked \} = findMissingChartTypes\(\{/);
    expect(MC).toMatch(/if \(missingCharts\.length > 0\)/);
    expect(MC).toMatch(/resolveEchartsType\(firstMissing\.type\)/);
    expect(MC).not.toMatch(/!hasEcharts/);
  });

  it('②vue3 N2：与 mc 同款接线（四象限同步）', () => {
    expect(VUE3).toMatch(/const \{ missing: missingCharts, exemptBlocked \} = findMissingChartTypes\(\{/);
    expect(VUE3).toMatch(/if \(missingCharts\.length > 0\)/);
    expect(VUE3).toMatch(/resolveEchartsType\(firstMissing\.type\)/);
    expect(VUE3).not.toMatch(/!hasEcharts/);
  });

  it('②注入器早退保留为安全边界（缺类型但目标文件已有 echarts 时不强行覆盖）', () => {
    const HEALER = readFileSync(
      join(SRC, 'ai-engine/roles/microcode/code-healer.js'),
      'utf-8',
    );
    expect(HEALER).toMatch(/content\.includes\('echarts\.init\('\)/);
    // N2 计数行（2026-11-18）：早退次数以「注入器未改动产物」为事实计数，不修改早退行为
    for (const [name, src] of [
      ['mc', readFileSync(join(SRC, 'ai-engine/roles/microcode-engineer.js'), 'utf-8')],
      ['vue3', readFileSync(join(SRC, 'ai-engine/roles/vue3-engineer.js'), 'utf-8')],
    ] as const) {
      expect(src).toMatch(/n2SkippedByExistingChart \+= 1;/) // name
      expect(src).toMatch(/🛡️ N2 图表兜底·已评估/) // name
    }
  });
});

describe('findChartHolderFile —— 承载文件定位（可观测性，零注入）', () => {
  const files = {
    'package/index.vue': '<template><div class="root">root</div></template>',
    'package/components/ContentForecast.vue':
      '<template><div data-section-id="83:30">forecast</div></template>',
    'package/components/Other.vue': '<template><div>no anchor</div></template>',
  };

  it('①阳：section 命中子组件锚点 ⇒ 返回真实路径（非硬编码 index.vue）', () => {
    const hit = findChartHolderFile(files, '83:30');
    expect(hit).toEqual({
      path: 'package/components/ContentForecast.vue',
      content: files['package/components/ContentForecast.vue'],
    });
  });

  it('①阴：section 不存在 ⇒ null（fail-open，不虚构位置）', () => {
    expect(findChartHolderFile(files, '999:999')).toBeNull();
  });

  it('①阴：section 为空/null/undefined ⇒ null', () => {
    expect(findChartHolderFile(files, '')).toBeNull();
    expect(findChartHolderFile(files, null)).toBeNull();
    expect(findChartHolderFile(files, undefined)).toBeNull();
  });

  it('①阴：非 .vue 文件即使带锚点也不认（定位范围严格限定 .vue）', () => {
    expect(findChartHolderFile({ 'foo.json': 'data-section-id="83:30"' }, '83:30')).toBeNull();
  });
});

describe('2.5 段承载路径上报（端到端，零注入）', () => {
  const charts = [{ section: '83:30', type: 'bar' }];

  it('②阳：WARN 写清「哪个文件/哪个段/缺什么类型」，file 指向真实承载文件', () => {
    const r = validateDoNotInvent({
      files: {
        'package/index.vue': '<template><div>root</div></template>',
        'package/components/ContentForecast.vue':
          '<template><div data-section-id="83:30">forecast</div></template>',
      },
      analysis: { charts },
    });
    const issue = r.issues.find((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
    expect(issue!.file).toBe('package/components/ContentForecast.vue');
    expect(issue!.message).toContain('图表类型缺失'); // 旧 spec 锚保留
    expect(issue!.message).toContain('bar');
    expect(issue!.message).toContain('83:30');
    expect(issue!.message).toContain('ContentForecast.vue');
    expect((issue as any)._sectionId).toBe('83:30');
    // 零注入：message 不得出现任何注入动作措辞
    expect(issue!.message).not.toMatch(/已注入|auto[- ]?inject/);
  });

  it('②阴：找不到承载文件时 fail-open —— 仍报 WARN、file 回落 index.vue、注明未定位', () => {
    const r = validateDoNotInvent({
      files: { 'package/index.vue': '<template><div/></template>' },
      analysis: { charts },
    });
    const issue = r.issues.find((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
    expect(issue!.file).toBe('package/index.vue');
    expect(issue!.message).toContain('未定位到承载文件');
    expect(issue!.message).toContain('83:30');
  });

  it('②阴：产物确有对应类型 series ⇒ 无 WARN（判据未被可观测性改动污染）', () => {
    const r = validateDoNotInvent({
      files: {
        'package/index.vue': '<template><div>root</div></template>',
        'package/components/ContentForecast.vue':
          '<template><div data-section-id="83:30">forecast</div></template>' +
          '<script>setOption({ series: [{ type: "bar", data: [1] }] })</script>',
      },
      analysis: { charts },
    });
    expect(r.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART-MISSING')).toBe(false);
  });

  it('②契约：2.7 段 G12b 用同源 findChartHolderFile，message/file 口径不变', () => {
    const validatorSrc = readFileSync(
      join(SRC, 'ai-engine/validators/do-not-invent-validator.js'),
      'utf-8',
    );
    expect(validatorSrc).toMatch(/findChartHolderFile\(files, sid\)/);
    expect(validatorSrc).toMatch(/承载文件 \$\{holderPath\} 内无对应类型 series/);
    expect(validatorSrc).toMatch(/id: 'DO-NOT-INVENT-CHART-SECTION-MISSING'/);
  });
});
