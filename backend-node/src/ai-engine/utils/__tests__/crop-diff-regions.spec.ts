/**
 * crop-diff-regions.spec.ts — 差异区域定位与裁剪 spec（步骤 1 · 三级回灌）
 *
 * 三组验证：
 *   A. 纯函数逻辑（聚类/格式化）——零 IO，直接 import
 *   B. locateDiffRegions 端到端（真 sharp：构造两张确知差异的 PNG）
 *   C. 接线断言（visual-comparator / 两张 max 图 / 回灌开关）
 *
 * 判据红线：
 *   - formatForRefiner 既有输出格式逐字不变（向后兼容断言）
 *   - REFINE_WITH_SHOTS=0 时输出与改动前逐字节一致（回滚锚）
 *   - report.diffRegions 为纯附加字段，overallSimilarity/issues/pass 语义不动
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import { formatDiffRegionsForRefiner, locateDiffRegions } from '../crop-diff-regions.js';

const SRC = (p: string) => readFileSync(join(__dirname, '../', p), 'utf8');

describe('A. formatDiffRegionsForRefiner 纯函数', () => {
  it('A1 ⛔ 阴性：evaluated!=1 / 空 regions / 非法输入 → 空串（formatForRefiner 不追加段落）', () => {
    expect(formatDiffRegionsForRefiner(null)).toBe('');
    expect(formatDiffRegionsForRefiner({ evaluated: 0, reason: 'disabled' })).toBe('');
    expect(formatDiffRegionsForRefiner({ evaluated: 1, regions: [] })).toBe('');
    expect(formatDiffRegionsForRefiner({ evaluated: 1, regions: undefined })).toBe('');
  });

  it('A2 ⭐ 阳性：合法 regions 输出含归一化 bbox + 像素 bbox + 小图路径', () => {
    const text = formatDiffRegionsForRefiner({
      evaluated: 1,
      diffBlockRatio: 0.0781,
      regions: [
        {
          index: 1,
          bboxNorm: { x: 0.25, y: 0.5, w: 0.25, h: 0.1875 },
          bboxPx: { x: 200, y: 400, w: 200, h: 150 },
          diffBlocks: 6,
          cropPath: '/tmp/x/diff-region-1.png',
          cropBytes: 1234,
        },
      ],
    });
    expect(text).toContain('像素级差异区域定位');
    expect(text).toContain('25.0%');
    expect(text).toContain('x=200');
    expect(text).toContain('diff-region-1.png');
    expect(text).toContain('78.1%'.replace('78.1', '7.8')); // diffBlockRatio 百分比口径
  });
});

describe('B. locateDiffRegions 端到端（真 sharp）', () => {
  it('B1 ⛔ 阴性：图片文件不存在 → evaluated=0, reason=image-not-found，绝不抛异常', async () => {
    const r = await locateDiffRegions({
      figmaImagePath: '/tmp/__mvgo_nonexistent_a.png',
      renderedImagePath: '/tmp/__mvgo_nonexistent_b.png',
      outDir: '/tmp/__mvgo_diffcrop_test',
    });
    expect(r.evaluated).toBe(0);
    expect(r.reason).toBe('image-not-found');
  });

  it('B2 ⭐ 阳性：两张确知差异的图 → evaluated=1 且 regions 含合法 bbox；小图落盘', async () => {
    const outDir = join(os.tmpdir(), `mvgo-diffcrop-spec-${Date.now()}`);
    // 左半白 / 右半黑（设计稿） vs 全白（渲染） → 右半为确定性差异区域
    const w = 128, h = 128;
    const designBuf = await sharp({
      create: { width: w, height: h, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: { create: { width: w / 2, height: h, channels: 3, background: '#000000' } }, left: w / 2, top: 0 }])
      .png()
      .toBuffer();
    const renderedBuf = await sharp({
      create: { width: w, height: h, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const designPath = join(outDir, 'design.png');
    const renderedPath = join(outDir, 'rendered.png');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(designPath, designBuf);
    writeFileSync(renderedPath, renderedBuf);

    const r = await locateDiffRegions({ figmaImagePath: designPath, renderedImagePath: renderedPath, outDir });
    expect(r.evaluated).toBe(1);
    expect((r.diffBlockRatio ?? 0) as number).toBeGreaterThan(0.1); // 右半差异 ≈ 0.5
    expect(Array.isArray(r.regions)).toBe(true);
    expect(r.regions.length).toBeGreaterThan(0);
    const top = r.regions[0];
    expect(top.bboxNorm.x).toBeGreaterThanOrEqual(0.4); // 差异集中在右半
    expect(top.cropPath).toBeTruthy();
    expect(readFileSync(top.cropPath!).length).toBeGreaterThan(0);
    // 裁剪小图尺寸应小于整图
    const cropMeta = await sharp(top.cropPath).metadata();
    expect((cropMeta.width ?? w) as number).toBeLessThan(w);
  });
});

describe('C. 接线断言（源码文本锚点）', () => {
  const comparatorSrc = SRC('../roles/visual-comparator.js');
  const phase2Src = SRC('../graphs/mc-component-graph-phase2.js');
  const vue3Src = SRC('../graphs/mc-component-graph-vue3.js');

  it('C1 ⭐ comparator：compare 内挂 diffRegions 定位（best-effort try/catch + 恒打计数行）', () => {
    expect(comparatorSrc).toContain("import { locateDiffRegions, formatDiffRegionsForRefiner } from '../utils/crop-diff-regions.js'");
    expect(comparatorSrc).toContain('options.diffRegionsOutDir');
    expect(comparatorSrc).toContain('diffRegions:evaluated=');
    expect(comparatorSrc.indexOf('catch (diffError)', comparatorSrc.indexOf('diffRegionsOutDir'))).toBeGreaterThan(-1);
  });

  it('C2 ⭐ formatForRefiner 三件套：既有格式逐字保留 + REFINE_WITH_SHOTS 开关 + 附加段在标题后', () => {
    // 既有格式锚点（改动前逐字存在）——保证向后兼容
    expect(comparatorSrc).toContain("'以下问题已通过视觉模型确认，请优先修复：\\n'");
    expect(comparatorSrc).toContain("`   修复建议: ${issue.suggestion}`");
    // 新增开关与三件套
    expect(comparatorSrc).toContain("process.env.REFINE_WITH_SHOTS !== '0'");
    expect(comparatorSrc).toContain('formatDiffRegionsForRefiner(report.diffRegions)');
    // 附加段必须在既有标题之后、severity 排序之前（位置锚点）
    const atTitle = comparatorSrc.indexOf("'以下问题已通过视觉模型确认，请优先修复：\\n'");
    const atDiff = comparatorSrc.indexOf('formatDiffRegionsForRefiner(report.diffRegions)');
    const atSort = comparatorSrc.indexOf('const severityOrder');
    expect(atDiff).toBeGreaterThan(atTitle);
    expect(atDiff).toBeLessThan(atSort);
  });

  it('C3 ⭐ 两张 max 图同点位传 diffRegionsOutDir（四象限口径：本轮仅 mc-max/vue3-max）', () => {
    expect(phase2Src).toContain('diffRegionsOutDir');
    expect(phase2Src).toContain("'diff-regions'");
    expect(vue3Src).toContain('diffRegionsOutDir');
    expect(vue3Src).toContain("'diff-regions'");
    // 都落在截图目录隔离子目录
    expect(phase2Src).toContain("'.mc-gen', 'screenshots', 'diff-regions'");
    expect(vue3Src).toContain("'.mc-gen', 'screenshots', 'diff-regions'");
  });

  it('C4 ⛔ 红线：报告既有字段语义未被触碰（dual-truth-score / 前端 0-100 契约）', () => {
    // diffRegions 必须是纯附加挂载，不得改写 overallSimilarity/issues/pass 赋值逻辑
    expect(comparatorSrc).toContain('report.diffRegions = diffResult');
    // 不得出现对既有字段的重新赋值（钳制逻辑保持原样一行）
    expect(comparatorSrc).toContain('report.overallSimilarity = Math.max(0, Math.min(100, parseInt(report.overallSimilarity) || 0))');
  });
});
