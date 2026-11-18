/**
 * cheap-shot-probe.spec.ts — 步骤 2 廉价截图探针 spec
 *
 * 四组验证：
 *   A. analyzeCheapPixels 阴阳对照（真 sharp 造图）：空白必判 blank / 正常图不判 blank / 超高 / 纵横比
 *   B. probeCheapShot 主入口：依赖注入（假渲染器）、观察模式不抛异常、恒打计数行、绝不写回 state
 *   C. 接线断言：mc/vue3 两图挂探针、门控不写 renderedImage、观察模式不接 retry
 *   D. 契约红线：既有 skip-screenshot 逻辑保留、diffRegions（步骤1）未被破坏
 *
 * 判据纪律：阴阳双向（好图必 PASS、坏图必 FAIL）+ 判据挂日志计数行 + 不复用改者正则。
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import {
  analyzeCheapPixels,
  probeCheapShot,
  formatCheapShotForRefiner,
  CHEAP_SHOT_DEFAULTS,
} from '../cheap-shot-probe.js';

const SRC = (p: string) => readFileSync(join(__dirname, '../', p), 'utf8');

/** 生成测试图并返回路径 */
async function makePng(w: number, h: number, bg: string): Promise<string> {
  const dir = join(os.tmpdir(), `mvgo-cheapshot-spec-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `img-${w}x${h}-${bg.replace('#', '')}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();
  writeFileSync(p, buf);
  return p;
}

describe('A. analyzeCheapPixels 阴阳对照（真 sharp）', () => {
  it('A1 ⛔ 阴性判据：纯白图必判 blank=true（空白画布探针）', async () => {
    const p = await makePng(320, 200, '#ffffff');
    const r = await analyzeCheapPixels(p);
    expect(r.probed).toBe(1);
    expect(r.blank).toBe(true);
    expect(r.signals).toContain('blank');
  });

  it('A2 ⭐ 阳性对照：黑白棋盘图不判 blank（证明探针不是恒 FAIL）', async () => {
    const dir = join(os.tmpdir(), `mvgo-cheapshot-spec-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `checker-${Date.now()}.png`);
    // 4x4 棋盘，每格 40px，黑白交错 → 方差与非白占比都足够高
    const cells = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        cells.push({
          input: { create: { width: 40, height: 40, channels: 3, background: (row + col) % 2 ? '#000000' : '#ffffff' } },
          left: col * 40,
          top: row * 40,
        });
      }
    }
    const buf = await sharp({ create: { width: 160, height: 160, channels: 3, background: '#ffffff' } })
      .composite(cells)
      .png()
      .toBuffer();
    writeFileSync(p, buf);
    const r = await analyzeCheapPixels(p);
    expect(r.probed).toBe(1);
    expect(r.blank).toBe(false);
    expect(r.signals).not.toContain('blank');
  });

  it('A3 ⛔ 超高判据：高度超过阈值必报 too-tall（flex 塌缩/死白探针）', async () => {
    const p = await makePng(300, 1600, '#ffffff');
    const r = await analyzeCheapPixels(p);
    expect(r.probed).toBe(1);
    expect(r.tooTall).toBe(true);
    expect(r.signals).toContain('too-tall');
  });

  it('A4 ⛔ 纵横比判据：极窄长条必报 aspect-abnormal', async () => {
    const p = await makePng(40, 600, '#ffffff');
    const r = await analyzeCheapPixels(p);
    expect(r.probed).toBe(1);
    expect(r.aspectAbnormal).toBe(true);
    expect(r.signals).toContain('aspect-abnormal');
  });

  it('A5 ⛔ 文件不存在 → probed=0，绝不抛异常', async () => {
    const r = await analyzeCheapPixels('/tmp/__mvgo_nonexistent_cheap.png');
    expect(r.probed).toBe(0);
    expect(r.reason).toBe('image-not-found');
  });

  it('A6 阈值单一事实源：默认纵横比区间与 maxHeight 存在且合理', () => {
    expect(CHEAP_SHOT_DEFAULTS.maxHeight).toBeGreaterThan(0);
    expect(CHEAP_SHOT_DEFAULTS.minRatio).toBeLessThan(CHEAP_SHOT_DEFAULTS.maxRatio);
  });
});

describe('B. probeCheapShot 主入口（依赖注入 + 观察模式）', () => {
  it('B1 ⭐ 假渲染器返回真图 → probed=1 + 恒打计数行 + 返回 renderedImage 事实', async () => {
    const p = await makePng(300, 200, '#ffffff');
    const lines: string[] = [];
    const logger = { info: (s: string) => lines.push(s) };
    const fakeRenderer = jest.fn(async () => ({ renderedImage: p }));
    const r = await probeCheapShot({
      renderScreenshot: fakeRenderer as any,
      renderParams: { outputPath: '/tmp/x' },
      logger,
      tag: 'mc-r0',
    });
    expect(r.probed).toBe(1);
    expect(r.blank).toBe(true);
    expect(r.renderedImage).toBe(p);
    expect(fakeRenderer).toHaveBeenCalledTimes(1);
    // 判据挂真机日志计数行：probed/signals/blank 三个字段必现
    expect(lines.some((l) => l.includes('[cheap-shot]') && l.includes('probed=1') && l.includes('blank=true'))).toBe(true);
  });

  it('B2 ⛔ 渲染器抛异常 → probed=0，不中断（观察模式 best-effort）', async () => {
    const lines: string[] = [];
    const badRenderer = async () => { throw new Error('puppeteer-down'); };
    const r = await probeCheapShot({
      renderScreenshot: badRenderer,
      renderParams: { outputPath: '/tmp/x' },
      logger: { info: (s: string) => lines.push(s) },
    });
    expect(r.probed).toBe(0);
    expect(String(r.reason)).toContain('render-failed');
    expect(lines.some((l) => l.includes('probed=0') && l.includes('render-failed'))).toBe(true);
  });

  it('B3 ⛔ 渲染器返回 null → probed=0（预览页不可达退化为浪费一次尝试，不 fail 任务）', async () => {
    const r = await probeCheapShot({
      renderScreenshot: async () => ({ renderedImage: null }),
      renderParams: { outputPath: '/tmp/x' },
    });
    expect(r.probed).toBe(0);
    expect(r.reason).toBe('no-rendered-image');
  });

  it('B4 ⛔ 缺少注入/参数 → probed=0（零副作用）', async () => {
    const r1 = await probeCheapShot({ renderParams: { outputPath: '/tmp/x' } });
    const r2 = await probeCheapShot({ renderScreenshot: async () => ({}), renderParams: {} });
    expect(r1.reason).toBe('missing-params');
    expect(r2.reason).toBe('missing-params');
  });
});

describe('C. 接线断言（源码文本锚点）', () => {
  const phase2Src = SRC('../graphs/mc-component-graph-phase2.js');
  const vue3Src = SRC('../graphs/mc-component-graph-vue3.js');
  const comparatorSrc = SRC('../roles/visual-comparator.js');

  it('C1 ⭐ mc 图中间轮改走廉价探针；旧 skip-screenshot 判据保留（不删既有逻辑）', () => {
    expect(phase2Src).toContain("import { probeCheapShot, CHEAP_SHOT_DEFAULTS } from '../utils/cheap-shot-probe.js'");
    expect(phase2Src).toContain('[skip-screenshot] 中间轮'); // 旧逻辑锚（模板字面量，无引号）
    expect(phase2Src).toContain('probeCheapShot(');
    expect(phase2Src).toContain('_cheapShotProbe');
  });

  it('C2 ⛔ 红线：廉价探针结果绝不写回 renderedImage/_screenshotPromise（防误触发 Vision）', () => {
    // cheap-shot-probe.js 源码内不得出现对 state 的写回
    const utilSrc = readFileSync(join(__dirname, '../cheap-shot-probe.js'), 'utf8');
    expect(utilSrc).not.toMatch(/state\.renderedImage\s*=/);
    expect(utilSrc).not.toMatch(/state\._screenshotPromise\s*=/);
  });

  it('C3 ⭐ vue3 图 Vision 门前挂廉价探针（落点不同但同为观察模式零行为变化）', () => {
    expect(vue3Src).toContain("import { analyzeCheapPixels, CHEAP_SHOT_DEFAULTS } from '../utils/cheap-shot-probe.js'");
    expect(vue3Src).toContain('cheapShotProbe');
    // 红线：探针结果绝不参与 Vision 条件（既有 4 条件逐字保留）
    expect(vue3Src).toContain("runtimeGate?.status === 'PASS' &&");
    expect(vue3Src).toContain('!isStaticFallback &&');
  });

  it('C4 ⛔ 观察模式：本轮不接 retry 驱动（retry-policy 零改动）', () => {
    expect(phase2Src).not.toContain('cheapShotRetryTrigger');
    expect(vue3Src).not.toContain('cheapShotRetryTrigger');
  });

  it('C5 ⛔ 步骤 1 的 diffRegions 未被步骤 2 破坏', () => {
    expect(comparatorSrc).toContain('report.diffRegions = diffResult');
    expect(phase2Src).toContain("'.mc-gen', 'screenshots', 'diff-regions'");
  });
});

describe('D. formatCheapShotForRefiner（观察模式首期不进 prompt）', () => {
  it('D1 无信号 → 空串', () => {
    expect(formatCheapShotForRefiner({ probed: 1, signals: [] })).toBe('');
    expect(formatCheapShotForRefiner({ probed: 0, signals: ['blank'] })).toBe('');
  });

  it('D2 有信号 → 输出纯文本定位段（备将来接回灌，本轮不接线）', () => {
    const text = formatCheapShotForRefiner({ probed: 1, signals: ['blank', 'too-tall'], blank: true, tooTall: true, height: 1600, aspectRatio: 0.2, aspectAbnormal: false });
    expect(text).toContain('像素检查');
    expect(text).toContain('空白');
    expect(text).toContain('1600px');
  });
});
