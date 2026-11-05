/**
 * 🛡️ 2026-11-05 G2：像素比对输入链路四态留痕（A 档、只报不改、零产物变化）
 *   方案：docs/2026-11-05-真机归因后续治理方案.md §4 G2 / §10 退役判据
 *
 * 说明：`finalizePreviewResult` 是 renderScreenshot 的内部闭包，且该模块带 Puppeteer
 * 重依赖，直接 import 进 jest 会挂（参见 console-noise-classifier 的抽离理由）。
 * 故验者采用**源码结构断言**：只读文件文本，不复用改者的任何正则，不加载重依赖。
 * 覆盖：计数行键齐全 / 每次调用恰好一行（含早退）/ compared 仅在比对成功后置位 /
 *       V15 既有判据逐字未动 / 无硬编码 / 不写进 result。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../../roles/screenshot-renderer.js'), 'utf8');
const at = (needle: string) => SRC.indexOf(needle);

describe('G2 visualFidelityInput 输入链路计数行（只报不改）', () => {
  it('⭐ 阳性：计数行含五键，全 0 也打', () => {
    expect(SRC).toContain('visualFidelityInput:preview=');
    for (const key of ['exists=', 'blank=', 'compared=', 'earlyReturn=']) {
      expect(SRC).toContain(key);
    }
  });

  it('⭐ 阳性：每次 finalizePreviewResult 恰好一行 —— 早退与正常出口各调用一次', () => {
    const calls = SRC.match(/logVisualFidelityInput\(\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const early = at('if (!result?.renderedImage)');
    const earlyLog = SRC.indexOf('logVisualFidelityInput()', early);
    const normalLog = SRC.lastIndexOf('logVisualFidelityInput()');
    expect(early).toBeGreaterThan(-1);
    expect(earlyLog).toBeGreaterThan(early);
    expect(normalLog).toBeGreaterThan(earlyLog);
    expect(SRC).toContain('vfInput.earlyReturn = 1');
    expect(SRC).toContain('return result\n    }');
  });

  it('⭐ 阳性：compared 仅在 compareRenderedVsDesign 成功后置位', () => {
    const call = at('await compareRenderedVsDesign(');
    const set = at('vfInput.compared = 1');
    expect(call).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(call);
    // blank 在 analyzeScreenshotPixels 之后、比对分支之前采集
    expect(at('vfInput.blank = pixelEvidence.blank ? 1 : 0')).toBeGreaterThan(
      at('await analyzeScreenshotPixels('),
    );
    expect(at('vfInput.blank = pixelEvidence.blank ? 1 : 0')).toBeLessThan(call);
  });

  it('阴性防误伤：V15 既有判据逐字未动', () => {
    expect(SRC).toContain('let visualFidelityDerivative = { evaluated: 0, derivative: 0, independent: 0 }');
    expect(SRC).toContain('evaluated: 1,');
    expect(SRC).toContain('insufficientEvidence: derivative');
    expect(SRC).toContain('visualFidelityDerivative:evaluated=');
    // severity / id / 阈值不得被本刀改写
    expect(SRC).toContain("id: 'VISUAL-002'");
    expect(SRC).toContain("severity: 'BLOCK'");
  });

  it('阴性防误伤：只报不改 —— vfInput 不写进 result、不改渲染结果', () => {
    expect(SRC).not.toMatch(/result\.(vfInput|visualFidelityInput)\s*=/);
    expect(SRC).not.toMatch(/visualFidelityInput:\s*result/);
  });

  it('阴性防误伤：无任务 id / 组件名 / 文件名硬编码', () => {
    const block = SRC.slice(at('const vfInput = {'), at('const pixelEvidence = await analyzeScreenshotPixels('));
    expect(block).not.toMatch(/mc-max-|c-[a-z]+-[0-9a-f]{8}|1793855|48:58/);
  });

  it('四态可区分：preview / exists / blank / earlyReturn 各自独立赋值', () => {
    expect(SRC).toContain('preview: previewImage ? 1 : 0');
    expect(SRC).toContain('exists: previewImage && existsSync(previewImage) ? 1 : 0');
    expect(SRC).toContain('vfInput.blank = pixelEvidence.blank ? 1 : 0');
    expect(SRC).toContain('vfInput.earlyReturn = 1');
  });
});
