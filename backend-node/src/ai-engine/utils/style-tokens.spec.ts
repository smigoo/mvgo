import { resolveBackgroundBrightness, extractFigmaColorPalette } from './style-tokens.js';

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

/**
 * 主色提取排除近白/近黑（2026-09-28 · device-monitor e8c97bf8 治本）。
 * 旧实现只用 HSL 饱和度过滤：近白 `#f0f5ff` 的 HSL-S=1.0 会骗过 `>=0.15`，
 * 当选 light `@color-primary` → 近白字打在浅底上不可见。
 */
describe('extractFigmaColorPalette：主色候选排除近白/近黑', () => {
  const solid = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return [{ type: 'SOLID', visible: true, color: { r: r / 255, g: g / 255, b: b / 255 } }];
  };
  const rect = (name, hex, w, h) => ({
    name, type: 'RECTANGLE', absoluteBoundingBox: { width: w, height: h }, fills: solid(hex),
  });

  it('近白浅蓝面积大于真蓝时不被选为主色（旧实现 #f0f5ff 骗过饱和度过滤）', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [
        rect('bg', '#edf4fb', 500, 400), // 最大面积 → topBg（被排除）
        rect('pale', '#f0f5ff', 300, 200), // 次大：近白浅蓝（HSL-S=1.0 旧实现误选）
        rect('blue', '#3170aa', 200, 100), // 真饱和蓝
      ],
    };
    const p = extractFigmaColorPalette(figma);
    expect(p.topBg).toBe('#edf4fb');
    expect(p.topPrimary).not.toBe('#f0f5ff');
    expect(p.topPrimary).toBe('#3170aa');
  });

  it('纯饱和蓝照常被选为主色（不误伤）', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [rect('bg', '#edf4fb', 500, 400), rect('blue', '#1990ff', 200, 100)],
    };
    expect(extractFigmaColorPalette(figma).topPrimary).toBe('#1990ff');
  });

  it('近黑大面积色同样不被选为主色', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [
        rect('bg', '#edf4fb', 500, 400),
        rect('nearblack', '#0a0a12', 300, 200), // 近黑（HSL-S 可能虚高）
        rect('blue', '#3170aa', 200, 100),
      ],
    };
    expect(extractFigmaColorPalette(figma).topPrimary).toBe('#3170aa');
  });

  // 🛡️ 2026-10-20（5ef650ff 实锤）：低透明度罩染 tint 不入主色候选。
  //   病灶：分组面板底 #e2d084@0.20（604×161×3 块）面积碾压 ⇒ topPrimary 被抢成面板黄。
  const rectOpacity = (name, hex, w, h, opacity) => ({
    name, type: 'RECTANGLE', absoluteBoundingBox: { width: w, height: h },
    fills: [{ type: 'SOLID', visible: true, opacity, color: (() => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return { r: r / 255, g: g / 255, b: b / 255 } })() }],
  });

  it('半透明面板 tint（opacity 0.2，面积碾压）不被选为主色', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [
        rect('bg', '#ffffff', 660, 868), // topBg
        rectOpacity('panel-tint', '#e2d084', 604, 161, 0.2), // 大面积半透明面板黄
        rect('brand-blue', '#006efe', 53, 55), // 小面积不透明品牌蓝
      ],
    };
    const p = extractFigmaColorPalette(figma);
    expect(p.topBg).toBe('#ffffff'); // topBg 统计不回退（全量面积）
    expect(p.topPrimary).not.toBe('#e2d084');
    expect(p.topPrimary).toBe('#006efe');
  });

  it('阳性对照：同色但 opacity ≥0.5 仍是合法主色候选', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [
        rect('bg', '#ffffff', 660, 868),
        rectOpacity('panel-solid', '#e2d084', 604, 161, 0.6), // 不透明的黄是真实色块
      ],
    };
    expect(extractFigmaColorPalette(figma).topPrimary).toBe('#e2d084');
  });

  it('同一色半透明+不透明混用时按 maxOpacity 计（不透明出现即保留候选资格）', () => {
    const figma = {
      name: 'root', type: 'FRAME',
      children: [
        rect('bg', '#ffffff', 660, 868),
        rectOpacity('tint', '#e2d084', 604, 161, 0.2),
        rectOpacity('solid-use', '#e2d084', 40, 40, 1),
      ],
    };
    expect(extractFigmaColorPalette(figma).topPrimary).toBe('#e2d084');
  });
});
