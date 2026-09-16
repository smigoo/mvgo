import { humanizeGenerationError } from './error-humanizer.js';

/**
 * 🛡️ 2026-09-16 治本回归：错映射修复。
 *
 * 实锤（mc-max-1789490645947-e6f8687e）：真实报错是
 * 「禁止臆造校验未通过，禁止发布组件：DO-NOT-INVENT-CHART, DO-NOT-INVENT-CHART-MOUNT-MISSING」，
 * 但旧 regex `/视觉分析失败或降级|盲生成|臆造/` 因「臆造」二字误匹配到视觉降级分支，
 * 页面显示「视觉识别未完成」误导用户以为是视觉模型没跑完。治本：去掉「臆造」，
 * 把「禁止臆造」「DO-NOT-INVENT」归入代码质量门禁分支。
 */
describe('humanizeGenerationError 错映射修复', () => {
  it('「禁止臆造校验未通过」→ 代码质量门禁（不再是视觉降级）', () => {
    const msg =
      '禁止臆造校验未通过，禁止发布组件：DO-NOT-INVENT-CHART, DO-NOT-INVENT-CHART-MOUNT-MISSING';
    const out = humanizeGenerationError(msg);
    expect(out).toContain('质量检查');
    expect(out).not.toContain('视觉识别未完成');
  });

  it('DO-NOT-INVENT 关键字 → 代码质量门禁', () => {
    const out = humanizeGenerationError('图表类型缺失：DO-NOT-INVENT-CHART');
    expect(out).toContain('质量检查');
    expect(out).not.toContain('视觉识别未完成');
  });

  it('视觉分析失败/降级 → 仍是视觉降级分支（不误伤）', () => {
    const out = humanizeGenerationError('视觉分析失败或降级，中止生成');
    expect(out).toContain('视觉识别未完成');
  });

  it('盲生成 → 仍是视觉降级分支', () => {
    const out = humanizeGenerationError('盲生成保护触发');
    expect(out).toContain('视觉识别未完成');
  });
});
