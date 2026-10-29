import { compileDesignFacts } from './design-facts-compiler.js';

/**
 * 🛡️ 刀30a+30b（2026-10-29，mv-max-1793255130119-ab4e3051 实锤）：
 *
 * 该任务 vue3 产物照 Figma 真值落地（渐变根背景 + #a0c1ff 描边 + 4px 圆角），
 * 却被 L0-B 三 BLOCK 杀死（CODE-007/014/025 全是假阳性）：
 * - 根是 GROUP 自身无样式，装饰真值全在铺满的 bg 子节点（48:5797 RECTANGLE）上；
 * - styleEvidence 旧实现 backdrop 回退只覆盖 fills/effects，strokes/radius 漏网
 *   → border/borderRadius.allowed=false → CODE-014 把真值装饰判「臆造」；
 * - CODE-007 期望色旧来源只有 vision → colors[0] 张冠李戴成主题蓝 rgba(3,98,166,1)，
 *   真值渐变 #d4e3ff→#c1d6ff @0.9 无入口 → 照真值落地的产物被 BLOCK。
 *
 * 本 spec 锁 compileDesignFacts 的判据同构（validator 直读其输出，无第二实现）。
 */

// 根 GROUP（自身无 fills/strokes/radius）+ 全尺寸 bg 子节点（渐变 + 描边 + 圆角 4）
const buildGroupRoot = () => ({
  id: '48:5796',
  name: 'cp-aiot-dpjh-bsjd',
  type: 'GROUP',
  absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 560 },
  fills: [],
  strokes: [],
  effects: [],
  children: [
    {
      id: '48:5797',
      name: 'bg',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 560 },
      cornerRadius: 4,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          opacity: 0.8999999761581421,
          visible: true,
          gradientStops: [
            { color: { r: 0.8324632048606873, g: 0.8883088231086731, b: 1, a: 1 }, position: 0 },
            { color: { r: 0.7562913298606873, g: 0.8375275731086731, b: 1, a: 1 }, position: 1 },
          ],
        },
      ],
      strokes: [
        { type: 'SOLID', visible: true, color: { r: 0.6279296875, g: 0.7575909495353699, b: 1, a: 1 } },
      ],
      effects: [],
    },
    {
      id: '48:5798',
      name: 'node-list',
      type: 'GROUP',
      absoluteBoundingBox: { x: 20, y: 40, width: 430, height: 480 },
      fills: [],
    },
  ],
});

describe('刀30a：styleEvidence 的 backdrop 描边/圆角回退', () => {
  it('阳性：根 GROUP 无装饰 + 全尺寸 bg 子节点带 strokes/radius → border/borderRadius allowed', () => {
    const facts = compileDesignFacts({ figmaNodeData: buildGroupRoot() });
    expect(facts.root.styleEvidence.border.allowed).toBe(true);
    expect(facts.root.styleEvidence.borderRadius.allowed).toBe(true);
    expect(facts.root.styleEvidence.borderRadius.value).toBe(4);
  });

  it('反向：根自身 strokes/radius 优先于 backdrop（不被背景子节点覆盖）', () => {
    const root = buildGroupRoot();
    root.strokes = [
      { type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0, a: 1 } },
    ];
    root.cornerRadius = 12;
    const facts = compileDesignFacts({ figmaNodeData: root });
    expect(facts.root.styleEvidence.borderRadius.value).toBe(12);
  });

  it('反向：bg 子节点无装饰时不凭空给证据（covers 但全空 → 回退 null）', () => {
    const root = buildGroupRoot();
    root.children[0].strokes = [];
    root.children[0].cornerRadius = 0;
    root.children[0].fills = [];
    const facts = compileDesignFacts({ figmaNodeData: root });
    expect(facts.root.styleEvidence.border.allowed).toBe(false);
    expect(facts.root.styleEvidence.borderRadius.allowed).toBe(false);
    expect(facts.root.styleEvidence.background.allowed).toBe(false);
  });
});

describe('刀30b：backgroundTruth 真值色编译（SOLID/GRADIENT stops，数值取整）', () => {
  it('阳性：渐变 stops + 填充透明度 → rgba 取整（0.89999…→0.9）逐字可比', () => {
    const facts = compileDesignFacts({ figmaNodeData: buildGroupRoot() });
    expect(facts.root.backgroundTruth.colors).toEqual([
      'rgba(212,227,255,0.9)',
      'rgba(193,214,255,0.9)',
    ]);
  });

  it('阳性：SOLID 填充 → 单条 rgba（alpha 与 fill opacity 合成）', () => {
    const root = {
      id: '1:1',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      fills: [{ type: 'SOLID', visible: true, opacity: 0.5, color: { r: 1, g: 1, b: 1, a: 0.8 } }],
    };
    const facts = compileDesignFacts({ figmaNodeData: root });
    expect(facts.root.backgroundTruth.colors).toEqual(['rgba(255,255,255,0.4)']);
  });

  it('反向：无背景 → colors 为空（CODE-007 不凭空造期望）', () => {
    const root = buildGroupRoot();
    root.children[0].fills = [];
    const facts = compileDesignFacts({ figmaNodeData: root });
    expect(facts.root.backgroundTruth.colors).toEqual([]);
  });

  it('反向：不可见 paint 不入真值色', () => {
    const root = buildGroupRoot();
    root.children[0].fills[0].visible = false;
    const facts = compileDesignFacts({ figmaNodeData: root });
    expect(facts.root.backgroundTruth.colors).toEqual([]);
  });
});
