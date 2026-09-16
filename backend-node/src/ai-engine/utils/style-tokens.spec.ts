import { resolveBackgroundBrightness } from './style-tokens.js';

/**
 * resolveBackgroundBrightness（2026-09-16 治本，c-traffic-monitor-a9a8edc9 黑白叠字）。
 * 验证「Figma 实测背景色覆盖 vision 亮度误判」。
 */

// 浅色背景（#edf4fb，Figma 真值：bg-[m] rgb(237,244,251)）
function lightBgFigma() {
  return {
    name: 'root',
    type: 'FRAME',
    children: [
      {
        name: 'bg-[m]',
        type: 'FRAME',
        fills: [{ type: 'SOLID', color: { r: 237 / 255, g: 244 / 255, b: 251 / 255 } }],
        absoluteBoundingBox: { width: 400, height: 300 },
        children: [
          {
            name: '车型分布',
            type: 'TEXT',
            fills: [{ type: 'SOLID', color: { r: 51 / 255, g: 51 / 255, b: 51 / 255 } }],
            absoluteBoundingBox: { width: 100, height: 20 },
          },
        ],
      },
    ],
  };
}

// 深色背景（rgb(26,35,50)）
function darkBgFigma() {
  return {
    name: 'root',
    type: 'FRAME',
    children: [
      {
        name: 'bg',
        type: 'FRAME',
        fills: [{ type: 'SOLID', color: { r: 26 / 255, g: 35 / 255, b: 50 / 255 } }],
        absoluteBoundingBox: { width: 400, height: 300 },
      },
    ],
  };
}

describe('resolveBackgroundBrightness：Figma 实测覆盖 vision 亮度误判', () => {
  it('浅色背景 + vision=dark → 纠正为 light（a9a8edc9 黑白叠字场景）', () => {
    expect(resolveBackgroundBrightness(lightBgFigma(), 'dark')).toBe('light');
  });
  it('浅色背景 + vision=light → 保持 light', () => {
    expect(resolveBackgroundBrightness(lightBgFigma(), 'light')).toBe('light');
  });
  it('深色背景 + vision=dark → 保持 dark', () => {
    expect(resolveBackgroundBrightness(darkBgFigma(), 'dark')).toBe('dark');
  });
  it('深色背景 + vision=light → 纠正为 dark', () => {
    expect(resolveBackgroundBrightness(darkBgFigma(), 'light')).toBe('dark');
  });
  it('无 figmaNodeData → 保持 vision 判定（fail-open）', () => {
    expect(resolveBackgroundBrightness(null, 'dark')).toBe('dark');
    expect(resolveBackgroundBrightness(undefined, 'light')).toBe('light');
  });
  it('无背景填充色 → 保持 vision 判定', () => {
    expect(resolveBackgroundBrightness({ name: 'x', children: [] }, 'dark')).toBe('dark');
  });
});
