/**
 * 🛡️ 刀 53d 外观扩维 · 卡底**图片通道**单测（2026-10-27 · 2ec8acc7 实锤）
 *
 * ── 事故 ──────────────────────────────────────────────────────────────
 * `subtreeBackground` 原先判「这节点在资源映射里 ⇒ 是图标 ⇒ 跳过」。但背景图**也是**
 * 被下载的资源（`48:5909`「bg」GROUP → `bg-5909.png`，`recommendedUsage:
 * 'backgroundBlock'`、`bgRole:'container'`、`previewAnalysisRole:'bg'`）⇒ 整卡底
 * 被当图标跳过，退回它内部**单根** VECTOR（`43:4894`，`GRADIENT op=0.5`，56px 高）
 * ⇒ 三张统计卡的底只剩 50% 那一层，顶部 10px 亮条（`43:4897`）整层丢失。
 * 用户报障「三个数据是有背景图的」即此。
 *
 * 真值（figma）：卡 134×66 = `bg` GROUP(134×66){ VECTOR 134×56 @y+10 op=0.5,
 * VECTOR 134×10 @y+0 } + TEXT(标题) + TEXT(数值)；导出 PNG 实测 134×66 RGBA，
 * 顶部行 alpha≈98、主体行 alpha≈81、底部渐隐到 0 ⇒ **PNG 才是整卡底的正确合成**，
 * 且 PNG **不含** `strokes`（左缘像素 = 中心像素）。
 */
import { detectStatRowLeaf, renderFoldedGridLeafVue } from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const solid = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

const gradient = (op: number | undefined, fromAlpha = 0, toAlpha = 1) => ({
  type: 'GRADIENT_LINEAR',
  visible: true,
  ...(op === undefined ? {} : { opacity: op }),
  gradientStops: [
    { position: 0, color: { r: 0, g: 148 / 255, b: 238 / 255, a: fromAlpha } },
    { position: 1, color: { r: 0, g: 159 / 255, b: 255 / 255, a: toAlpha } },
  ],
});

const text = (id: string, chars: string, x: number, y: number, w: number, h: number, hex: string, fs: number) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [solid(hex)],
  style: { fontSize: fs, fontWeight: 400 },
});

/**
 * 一张统计卡：卡本体 GROUP(134×66) › bg GROUP(134×66) › [主体 VECTOR 134×56 @+10, 顶部条 VECTOR 134×10]
 * + 标题 TEXT + 数值 TEXT。
 * `bgVariant`：`'image'` 正常 / `'smallImage'` 图片很小（应被面积判据挡掉）/
 *              `'missing'` 下载失败 / `'stroked'` 主体矢量带描边（验证描边继承）。
 */
const statCard = (id: string, x: number, title: string, value: string, bgVariant = 'image') => {
  const bgId = `${id}-bg`;
  return {
    id,
    type: 'GROUP',
    absoluteBoundingBox: { x, y: 51637, width: 134, height: 66 },
    children: [
      {
        id: bgId,
        type: 'GROUP',
        name: 'bg',
        absoluteBoundingBox:
          bgVariant === 'smallImage'
            ? { x, y: 51637, width: 8, height: 8 }
            : { x, y: 51637, width: 134, height: 66 },
        children: [
          {
            id: `${id}-v-main`,
            type: 'VECTOR',
            absoluteBoundingBox: { x, y: 51647, width: 134, height: 56 },
            fills: [gradient(0.5)],
            ...(bgVariant === 'stroked'
              ? { strokes: [solid('#a0c1ff')], strokeWeight: 1 }
              : {}),
          },
          {
            id: `${id}-v-top`,
            type: 'VECTOR',
            absoluteBoundingBox: { x, y: 51637, width: 134, height: 10 },
            fills: [gradient(undefined, 0, 0.5)],
          },
        ],
      },
      text(`${id}-t`, title, x + 34, 51663, 42, 21, '#333333', 14),
      text(`${id}-v`, value, x + 86, 51660, 14, 28, '#3965ff', 24),
    ],
  };
};

const docOf = (variants: string[] = ['image', 'image', 'image']) => ({
  id: 'root',
  type: 'FRAME',
  children: [
    {
      id: '43:4892',
      type: 'FRAME',
      absoluteBoundingBox: { x: 29636, y: 51637, width: 470, height: 66 },
      children: [
        statCard('43:4893', 29636, '总设备', '8', variants[0]),
        statCard('43:4898', 29804, '运行中', '2', variants[1]),
        statCard('43:4903', 29972, '离线', '1', variants[2]),
      ],
    },
  ],
});

/** 资源映射：3 张卡的 bg GROUP 都映射到同一个已下载的 bg-5909.png。 */
const mappingOf = (downloadStatus = 'success') => [
  { figmaNodeId: '43:4893-bg', resourceFile: '../resources/images/bg-5909.png', downloadStatus, recommendedUsage: 'backgroundBlock', bgRole: 'container', previewAnalysisRole: 'bg' },
  { figmaNodeId: '43:4898-bg', resourceFile: '../resources/images/bg-5909.png', downloadStatus, recommendedUsage: 'backgroundBlock', bgRole: 'container', previewAnalysisRole: 'bg' },
  { figmaNodeId: '43:4903-bg', resourceFile: '../resources/images/bg-5909.png', downloadStatus, recommendedUsage: 'backgroundBlock', bgRole: 'container', previewAnalysisRole: 'bg' },
];

const run = (variants?: string[], mapping = mappingOf(), downloadStatus?: string) => {
  const doc = docOf(variants);
  const idx = indexFigmaNodes(doc);
  const parentOf = new Map([['43:4893', '43:4892'], ['43:4898', '43:4892'], ['43:4903', '43:4892']]);
  return detectStatRowLeaf({ id: '43:4893' }, idx, parentOf, downloadStatus ? mappingOf(downloadStatus) : mapping) as any;
};

describe('刀 53d 卡底图片通道 detectStatRowLeaf', () => {
  it('阳性：bg 资源 GROUP 被采用为卡底图片（不再被当图标跳过）', () => {
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.members).toHaveLength(3);
    for (const m of r.members) {
      expect(m.bgImageFile).toBe('bg-5909.png');
      expect(m.bgImageVar).toMatch(/^fgStatBg\d+$/);
      // 🔴 图片与 CSS 互斥：命中图片时 bg 必须为 null（否则会用近似底盖掉真图）
      expect(m.bg).toBeNull();
    }
    expect(r.members.map((m: any) => m.bgImageVar)).toEqual(['fgStatBg0', 'fgStatBg1', 'fgStatBg2']);
  });

  it('🔴 回归：bg 资源不被当成图标 ⇒ 不会退到内部单根 50% 矢量', () => {
    const r = run();
    // 若仍按「在映射里就是图标」跳过，bg 会变成内部的 linear-gradient(...0.5...)
    for (const m of r.members) {
      expect(m.bg).toBeNull();
      expect(m.bgImageFile).toBe('bg-5909.png');
    }
  });

  it('阴性：下载状态 missing ⇒ 不用图片，回落到 CSS 底（内部主体矢量）', () => {
    const r = run(undefined, mappingOf('missing'));
    expect(r.ok).toBe(true);
    for (const m of r.members) {
      expect(m.bgImageFile).toBeNull();
      expect(m.bgImageVar).toBeNull();
      expect(String(m.bg)).toContain('linear-gradient');
    }
  });

  it('阴性：无资源映射 ⇒ 行为与改动前逐字等价（CSS 底通道）', () => {
    const r = run(undefined, []);
    expect(r.ok).toBe(true);
    for (const m of r.members) {
      expect(m.bgImageFile).toBeNull();
      expect(String(m.bg)).toContain('linear-gradient');
    }
  });

  it('阴性：图片面积 < CSS 候选面积 ⇒ 判为装饰、不采用（面积判据可辩驳）', () => {
    // 第 1 张卡的 bg GROUP 只有 8×8，内部主体矢量 134×56 更大
    const r = run(['smallImage', 'image', 'image']);
    expect(r.ok).toBe(true);
    const m0 = r.members.find((m: any) => m.title === '总设备');
    expect(m0.bgImageFile).toBeNull();
    expect(String(m0.bg)).toContain('linear-gradient');
    // 其余两张仍是图片
    expect(r.members.find((m: any) => m.title === '运行中').bgImageFile).toBe('bg-5909.png');
  });

  it('描边继承：导出图不含 strokes ⇒ border 必须从内部矢量继承', () => {
    const r = run(['stroked', 'stroked', 'stroked']);
    expect(r.ok).toBe(true);
    for (const m of r.members) {
      // 图片通道 + 描边并存（图片节点是 GROUP 无 strokes）
      expect(m.bgImageFile).toBe('bg-5909.png');
      expect(m.border).toBe('1px solid #a0c1ff');
    }
  });
});

describe('刀 53d 卡底图片通道 renderFoldedGridLeafVue', () => {
  it('卡底走 `:style` 绑定（而非静态 style 里的裸 url）+ size/repeat 静态，且不写近似底', () => {
    const r = run();
    const vue = renderFoldedGridLeafVue(r, 'device');
    // 🔴🔴 必须是**绑定**形态。静态 `style="..."` 是纯 CSS 文本，Vue 不做变量求值 ⇒
    //   浏览器拿到相对 URL `url(fgStatBg0)` → 404 → 整卡零背景。
    //   593cf7f 就是把这里写成静态 style，于是「三个统计卡有背景图」这个用户报障
    //   修完仍在，而 `import fgStatBg<i>` 全成死代码。
    expect(vue).toContain(":style=\"{ backgroundImage: 'url(' + fgStatBg0 + ')' }\"");
    expect(vue).toContain(":style=\"{ backgroundImage: 'url(' + fgStatBg2 + ')' }\"");
    // 静态段只留 CSS 常量（与绑定段属性不重叠 ⇒ Vue 合并不互相覆盖）
    expect(vue).toContain('background-size:100% 100%');
    expect(vue).toContain('background-repeat:no-repeat');
    // 🔴 反向断言①：病灶的确切形态不得再出现
    expect(vue).not.toContain('background-image:url(fgStatBg');
    // 🔴 反向断言②（通用，防同类复发）：`url(` 之后不得直接跟裸标识符 ——
    //   合法形态只有 `url(' + var + ')`、`url('字面量')`、`url(data:/http:/#/../)`。
    //   缺了这条，本 spec 会再次「把 bug 断言成正确」（593cf7f 的原始版本就是如此）。
    expect(vue).not.toMatch(/url\(\s*(?!['"]|\.\.?\/|data:|https?:|#)[A-Za-z_$]/);
    // 🔴 不得出现 `background:linear-gradient(` —— 那会把真图盖掉
    expect(vue).not.toContain('background:linear-gradient');
  });

  it('script setup 为每张卡 import 对应图片（变量名与 LLM 侧 bgN/iconN 命名空间隔离）', () => {
    const r = run();
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain("import fgStatBg0 from '../../resources/images/bg-5909.png'");
    expect(vue).toContain("import fgStatBg1 from '../../resources/images/bg-5909.png'");
    expect(vue).toContain("import fgStatBg2 from '../../resources/images/bg-5909.png'");
    // 三个绑定名互不相同（同文件 3 次 import 合法，但声明不得撞名）
    const vars = (vue.match(/const fgStatBg\d+/g) || []).length;
    expect(vars).toBe(0);
  });

  it('无图片时脚本不产 import（零副作用）', () => {
    const r = run(undefined, []);
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).not.toContain('fgStatBg');
    expect(vue).toContain('background:linear-gradient');
  });
});
