/**
 * 🛡️ 2026-11-15（mc-max-1794751473723-92612fc0 实锤）：装配层 **elem 级排版事实** 透传 + 对账。
 *
 * 病灶：vision 对 `2:8787` 已给 `styles:{fontSize:14,color:'#ffffff'}`（真值 fs14/20 + 白字），
 *   但 `BODY_NODE_PASSTHROUGH_KEYS` 不含 styles ⇒ 全被剥（该单 `bodyDroppedKeys:{styles:42}`）
 *   ⇒ prompt 只剩裸文本 ⇒ 模型字号落 `var(--fontSize)`=12、颜色落主题基色 `rgb(15,23,42)`
 *   ⇒ 截图「蓝卡上暗字」「总数: 竖折两行」。
 *
 * 修法（三件）：
 *   ① 只放**排版四件套**（fontSize/color/fontWeight/lineHeight），backgroundColor/padding 等
 *      仍不放行（属资源层/几何层，重复下发会让模型手写卡底与 bg 图双重上色）；
 *   ② 值**丢弃不截断**（`linear-gradient(...)` 切成 40 字符会变成非法 CSS）；
 *   ③ 对账计数 `typographySeen/Passed/Dropped`（reportOnly：同批输出，二者不等即断层红灯）。
 */
import { normalizeComponentPlan } from './generation-context-assembler.js';

jest.mock('../logger/index.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}), { virtual: true });

const PLAN = {
  effectiveSections: [
    {
      id: '2:8787',
      type: 'stat-card',
      body: {
        elements: [
          {
            id: '2:8793',
            role: 'label',
            text: '总数:',
            styles: {
              fontSize: 14,
              color: '#ffffff',
              fontWeight: 'bold',
              // 以下三项必须**不**透传（资源层/几何层已有通道）
              backgroundColor: 'linear-gradient(270deg, #318aff 0%, #70bfff 100%)',
              borderRadius: '6px',
              padding: '8px 12px',
            },
          },
          {
            id: '2:8794',
            role: 'value',
            text: '56302',
            styles: { fontSize: 20, color: 'rgba(255,255,255,0.8)' },
          },
        ],
      },
    },
    {
      id: '89:39',
      type: 'tab',
      body: {
        children: [
          { id: '2:8827', text: '监控', figmaNode: '2:8827' },
          { id: '2:8848', text: '交通诱导', figmaNode: '2:8848' },
        ],
      },
    },
  ],
};

/** 真值树最小形态：2:8787 两带 + 竖排 tab 文本。 */
const FIGMA_ROOT = {
  id: '2:8417',
  type: 'FRAME',
  absoluteBoundingBox: { x: 1475, y: 433, width: 420, height: 425 },
  children: [
    {
      id: '2:8787',
      type: 'GROUP',
      absoluteBoundingBox: { x: 1480.5, y: 475, width: 193.4, height: 64.8 },
      children: [
        {
          id: '2:8788',
          type: 'GROUP',
          absoluteBoundingBox: { x: 1480.5, y: 475, width: 193.4, height: 64.8 },
          children: [],
        },
        {
          id: '2:8792',
          type: 'FRAME',
          absoluteBoundingBox: { x: 1544.5, y: 481, width: 105, height: 23 },
          children: [{ id: '2:8793', type: 'TEXT', characters: '总数:', style: { fontSize: 14 }, absoluteBoundingBox: { x: 1544.5, y: 482, width: 46, height: 21 } }],
        },
        {
          id: '2:8795',
          type: 'FRAME',
          absoluteBoundingBox: { x: 1544.5, y: 510, width: 59, height: 23 },
          children: [{ id: '2:8796', type: 'TEXT', characters: '异常数:', style: { fontSize: 14 }, absoluteBoundingBox: { x: 1544.5, y: 511, width: 46, height: 21 } }],
        },
        {
          id: '2:8798',
          type: 'GROUP',
          absoluteBoundingBox: { x: 1498.5, y: 483, width: 35.2, height: 28.3 },
          children: [{ id: '2:8803', type: 'VECTOR', absoluteBoundingBox: { x: 1502.6, y: 483.7, width: 27.1, height: 27.1 } }],
        },
        {
          id: '2:8791',
          type: 'TEXT',
          characters: '隧道设备',
          style: { fontSize: 12 },
          absoluteBoundingBox: { x: 1494.5, y: 514, width: 45, height: 16 },
        },
      ],
    },
    {
      id: '2:8827',
      type: 'TEXT',
      characters: '监控',
      style: { fontSize: 14 },
      absoluteBoundingBox: { x: 1484, y: 553.8, width: 15, height: 36 },
    },
    {
      id: '2:8848',
      type: 'TEXT',
      characters: '交通诱导',
      style: { fontSize: 14 },
      absoluteBoundingBox: { x: 1483, y: 787.8, width: 17, height: 64 },
    },
  ],
};

describe('装配层排版四件套透传', () => {
  it('阳性：fontSize/color/fontWeight 透传，backgroundColor/borderRadius/padding 不透传', () => {
    const plan = normalizeComponentPlan(JSON.parse(JSON.stringify(PLAN)))!;
    const els = plan.effectiveSections[0].declaredContent.elements;
    expect(els[0].styles).toEqual({ fontSize: 14, color: '#ffffff', fontWeight: 'bold' });
    expect(els[0].styles.backgroundColor).toBeUndefined();
    expect(els[0].styles.borderRadius).toBeUndefined();
    expect(els[0].styles.padding).toBeUndefined();
    expect(els[1].styles).toEqual({ fontSize: 20, color: 'rgba(255,255,255,0.8)' });
  });

  it('对账计数：typographySeen === typographyPassed（无丢弃时）', () => {
    const plan = normalizeComponentPlan(JSON.parse(JSON.stringify(PLAN)))!;
    const n = plan.normalization!;
    expect(n.typographySeen).toBe(2);
    expect(n.typographyPassed).toBe(2);
    expect(n.typographyDropped).toBe(0);
    // 已放行的键不得再计入 droppedKeys（否则同一事实被重复统计）
    expect(n.bodyDroppedKeys.styles).toBeUndefined();
  });

  it('超长合法色值**丢弃不截断**，并计数 typographyDropped', () => {
    const plan = normalizeComponentPlan({
      effectiveSections: [
        {
          id: 'x',
          body: {
            elements: [
              {
                id: 'e1',
                text: '甲',
                styles: { fontSize: 12, color: 'linear-gradient(270deg, #318aff 0%, #70bfff 100%, #ffffff 200%)' },
              },
            ],
          },
        },
      ],
    })!;
    const el = plan.effectiveSections[0].declaredContent.elements[0];
    expect(el.styles.fontSize).toBe(12);
    expect(el.styles.color).toBeUndefined();
    expect(plan.normalization!.typographyDropped).toBe(1);
    expect(plan.normalization!.typographyPassed).toBe(1);
  });

  it('非法 fontWeight（如 medium 之外的任意串）不透传', () => {
    const plan = normalizeComponentPlan({
      effectiveSections: [{ id: 'x', body: { elements: [{ id: 'e', text: '甲', styles: { fontWeight: 'super-bold' } }] } }],
    })!;
    const el = plan.effectiveSections[0].declaredContent.elements[0];
    expect(el.styles).toBeUndefined();
  });

  it('无要素样式的节点不产 styles 键（零副作用）', () => {
    const plan = normalizeComponentPlan({
      effectiveSections: [{ id: 'x', body: { elements: [{ id: 'e', text: '甲' }] } }],
    })!;
    const el = plan.effectiveSections[0].declaredContent.elements[0];
    expect(el.styles).toBeUndefined();
    expect(plan.normalization!.typographySeen).toBe(0);
  });
});

describe('几何派生事实（vision 缺测项）', () => {
  it('无 figmaRoot ⇒ 不产 innerRows / textOrientation（零副作用）', () => {
    const plan = normalizeComponentPlan(JSON.parse(JSON.stringify(PLAN)))!;
    expect(plan.effectiveSections[0].innerRows).toBeUndefined();
    const tab = plan.effectiveSections[1].declaredContent.children;
    expect(tab.every((c: any) => c.textOrientation === undefined)).toBe(true);
    expect(plan.normalization!.verticalTexts).toBe(0);
    expect(plan.normalization!.innerRowSections).toBe(0);
  });

  it('有 figmaRoot ⇒ stat-card 产 innerRows（2 组）、竖排 tab 产 textOrientation=vertical', () => {
    const plan = normalizeComponentPlan(JSON.parse(JSON.stringify(PLAN)), {
      figmaRoot: JSON.parse(JSON.stringify(FIGMA_ROOT)),
    })!;
    const innerRows = plan.effectiveSections[0].innerRows;
    expect(innerRows).toBeDefined();
    expect(innerRows.rows).toHaveLength(2);
    expect(innerRows.axis).toBe('column');
    const tabChildren = plan.effectiveSections[1].declaredContent.children;
    expect(tabChildren[0].textOrientation).toBe('vertical');
    expect(tabChildren[1].textOrientation).toBe('vertical');
    expect(plan.normalization!.verticalTexts).toBe(2);
    expect(plan.normalization!.innerRowSections).toBe(1);
  });

  it('normalization 不泄漏 figmaIndex（不可序列化运行期对象）', () => {
    const plan = normalizeComponentPlan(JSON.parse(JSON.stringify(PLAN)), {
      figmaRoot: JSON.parse(JSON.stringify(FIGMA_ROOT)),
    })!;
    expect((plan.normalization as any).figmaIndex).toBeUndefined();
    expect(() => JSON.stringify(plan.normalization)).not.toThrow();
  });
});
