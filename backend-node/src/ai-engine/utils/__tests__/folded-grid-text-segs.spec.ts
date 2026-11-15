/**
 * 🧱 卡内文本「字符级样式」单测（P-12 · 2026-11-15 · mc-max-1794747509141-9fad7892 实锤）
 *
 * 病灶真值（2:8437「设备监测数据卡片」内的 TEXT 2:8443）：
 *   节点级 fills = #ffffff（**从不显示的兜底色**），7 个字符全被覆盖：
 *     `(` `/484)` = #1990ff / 16px / 500
 *     `2`        = #e03434 / 18px / 600
 *   旧实现只读节点级 fills/style ⇒ 产物渲染成「纯白 16px」，白字落白底不可见。
 *   同一组件里 tabs 段（P-11）却正确 —— 因为那条线走了确定性分段着色。
 *
 * 治法：字符级求值收敛到单一来源 `utils/text-runs.js#runsOfTextNode`（禁止本模块另写），
 *   拆出的 `segs` 作为**纯附加字段**挂在 run 上，只在发射层展开内层 span：
 *   ① 无 per-char 覆盖 ⇒ 字段不存在，产物逐字不变（阴性零回归）；
 *   ② 段文本拼接必须与节点 characters 逐字一致，否则 fail-open（不猜）。
 */
import { textRun, cardTruth, renderFoldedGridLeafVue } from '../folded-grid-section-takeover.js';

const CARD = { x: 0, y: 0, width: 117, height: 64 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/** `2:8443` 的真实形态：节点级白色兜底 + 7 字符全覆盖 */
const OV_69 = {
  fontSize: 16,
  fills: [{ type: 'SOLID', color: { r: 0.09803921729326248, g: 0.5647059082984924, b: 1, a: 1 } }],
};
const OV_71 = {
  fontFamily: 'Roboto',
  fontStyle: 'SemiBold',
  fontWeight: 600,
  fontSize: 18,
  fills: [{ type: 'SOLID', color: { r: 0.8793663382530212, g: 0.20229023694992065, b: 0.20229023694992065, a: 1 } }],
};

function textNode(id, chars, x, y, w, h, extra = {}) {
  return {
    id,
    type: 'TEXT',
    characters: chars,
    absoluteBoundingBox: { x: CARD.x + x, y: CARD.y + y, width: w, height: h },
    style: { fontSize: 16, fontWeight: 500 },
    fills: [{ type: 'SOLID', visible: true, color: WHITE }],
    ...extra,
  };
}

/** 真值形态：白色兜底 + 三段覆盖 */
function counterNode() {
  return textNode('t:counter', '(2/484)', 6, 34, 58, 18, {
    characterStyleOverrides: [69, 71, 69, 69, 69, 69, 69],
    styleOverrideTable: { 69: OV_69, 71: OV_71 },
  });
}

describe('textRun · 字符级分段（segs）', () => {
  it('阳性：7 字符三段覆盖 ⇒ 拆出 3 段，颜色/字号/字重逐段命中真值', () => {
    const run = textRun(counterNode());
    expect(run).not.toBeNull();
    expect(run.text).toBe('(2/484)');
    // 节点级字段保持原样（几何聚类零扰动）
    expect(run.color).toBe('rgba(255,255,255,1)');
    expect(run.fs).toBe(16);
    expect(run.fw).toBe(500);

    expect(Array.isArray(run.segs)).toBe(true);
    expect(run.segs.map((s) => s.text)).toEqual(['(', '2', '/484)']);
    expect(run.segs.map((s) => s.color)).toEqual([
      'rgb(25,144,255)',
      'rgb(224,52,52)',
      'rgb(25,144,255)',
    ]);
    expect(run.segs.map((s) => s.fs)).toEqual([16, 18, 16]);
    expect(run.segs.map((s) => s.fw)).toEqual([500, 600, 500]);
  });

  it('阳性：段文本按序拼接逐字等于节点文本（不丢字、不重字）', () => {
    const node = counterNode();
    const run = textRun(node);
    expect(run.segs.map((s) => s.text).join('')).toBe(node.characters);
  });

  it('阴性：无 characterStyleOverrides ⇒ **不产生** segs 字段（产物逐字不变）', () => {
    const run = textRun(textNode('t:plain', '摄像机', 6, 6, 36, 14, {
      style: { fontSize: 12, fontWeight: 400 },
    }));
    expect(run).not.toBeNull();
    expect('segs' in run).toBe(false);
  });

  it('阴性：覆盖表为空对象 ⇒ 不产生 segs（等同无覆盖）', () => {
    const run = textRun(textNode('t:empty', '(0/484)', 6, 34, 58, 18, {
      characterStyleOverrides: [1, 1, 1, 1, 1, 1, 1],
      styleOverrideTable: {},
    }));
    expect('segs' in run).toBe(false);
  });

  it('阴性：全部字符同一样式（合并后仅 1 段）⇒ 不产生 segs', () => {
    const same = { fontSize: 16, fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }] };
    const run = textRun(textNode('t:same', 'abc', 6, 34, 30, 18, {
      characterStyleOverrides: [9, 9, 9],
      styleOverrideTable: { 9: same },
    }));
    expect('segs' in run).toBe(false);
  });

  it('fail-open：覆盖段缺 fontSize/color ⇒ 用节点级值兜底，不臆造新值', () => {
    const run = textRun(textNode('t:bare', 'ab', 6, 34, 20, 18, {
      characterStyleOverrides: [1, 2],
      styleOverrideTable: { 1: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }, 2: {} },
    }));
    expect(run.segs.map((s) => s.color)).toEqual(['rgb(255,0,0)', 'rgb(255,255,255)']);
    expect(run.segs.map((s) => s.fs)).toEqual([16, 16]);
    expect(run.segs.map((s) => s.fw)).toEqual([500, 500]);
  });
});

describe('cardTruth → 渲染 · segs 贯通', () => {
  function cardWith(children) {
    return {
      id: 'card',
      name: 'default',
      type: 'GROUP',
      absoluteBoundingBox: CARD,
      fills: [{ type: 'SOLID', visible: true, color: WHITE }],
      children,
    };
  }

  const LABEL = () => textNode('t:label', '摄像机', 6, 6, 36, 14, {
    style: { fontSize: 12, fontWeight: 400 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
  });

  it('阳性：卡内计数串的 segs 出现在 runs 上，且 label 仍无 segs', () => {
    const tr = cardTruth(cardWith([LABEL(), counterNode()]), []);
    expect(tr).not.toBeNull();
    const counter = tr.runs.find((r) => r.text === '(2/484)');
    const label = tr.runs.find((r) => r.text === '摄像机');
    expect(counter.segs.map((s) => s.color)).toEqual(['rgb(25,144,255)', 'rgb(224,52,52)', 'rgb(25,144,255)']);
    expect('segs' in label).toBe(false);
  });

  it('阳性：渲染产物带 segs 分支（内层 span 逐段着色）', () => {
    const tr = {
      ok: true, kind: 'grid', sectionId: 's1', baseId: 's1',
      cols: 1, cardW: 117, cardH: 64, colGap: 8, rowGap: null, rows: 1,
      items: [cardTruth(cardWith([LABEL(), counterNode()]), [])],
    };
    const vue = renderFoldedGridLeafVue(tr, 'component');
    expect(vue).toContain('t.segs');
    expect(vue).toContain('s.color');
    expect(vue).toContain('"segs"');
  });

  it('阴性：卡内无字符级覆盖 ⇒ 产物不含 segs 数据（逐字不变）', () => {
    const plain = textNode('t:plain', '(0/484)', 6, 34, 58, 18);
    const tr = {
      ok: true, kind: 'grid', sectionId: 's1', baseId: 's1',
      cols: 1, cardW: 117, cardH: 64, colGap: 8, rowGap: null, rows: 1,
      items: [cardTruth(cardWith([LABEL(), plain]), [])],
    };
    const vue = renderFoldedGridLeafVue(tr, 'component');
    expect(vue).not.toContain('"segs"');
  });
});

describe('column-pair · 标题行也走字符级分段', () => {
  const BIG = { x: 0, y: 0, width: 260, height: 96 };

  function t(id, chars, x, y, w, h, fs, extra = {}) {
    return {
      id,
      type: 'TEXT',
      characters: chars,
      absoluteBoundingBox: { x, y, width: w, height: h },
      style: { fontSize: fs, fontWeight: 400 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
      ...extra,
    }
  }

  it('阳性：标题含 per-char 混合色 ⇒ title.segs 透传', () => {
    const card = {
      id: 'card:pair',
      name: 'default',
      type: 'GROUP',
      absoluteBoundingBox: BIG,
      fills: [{ type: 'SOLID', visible: true, color: WHITE }],
      children: [
        // 标题行：横跨两列，含「设备总数:5」的红色数字
        t('t:title', '设备总数:5', 6, 4, 166, 20, 14, {
          characterStyleOverrides: [1, 1, 1, 1, 1, 2, 2],
          styleOverrideTable: {
            1: { fontSize: 14, fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }] },
            2: { fontSize: 14, fills: [{ type: 'SOLID', color: { r: 0.879, g: 0.202, b: 0.202, a: 1 } }] },
          },
        }),
        // 两行各两列
        t('t:r1c1', '总数:', 6, 34, 46, 21, 14),
        t('t:r1c2', '56302', 120, 34, 58, 21, 14),
        t('t:r2c1', '异常数:', 6, 60, 46, 21, 14),
        t('t:r2c2', '5', 120, 60, 12, 21, 14),
      ],
    }
    const tr = cardTruth(card, [])
    expect(tr).not.toBeNull()
    expect(tr.textDir).toBe('column-pair')
    expect(tr.title).not.toBeNull()
    expect(tr.title.segs.map((s) => s.color)).toEqual([
      'rgb(51,51,51)',
      'rgb(224,52,52)',
    ])
  })

  it('阴性：标题无覆盖 ⇒ title 不含 segs 字段', () => {
    const card = {
      id: 'card:pair2',
      name: 'default',
      type: 'GROUP',
      absoluteBoundingBox: BIG,
      fills: [{ type: 'SOLID', visible: true, color: WHITE }],
      children: [
        t('t:title', '设备总数', 6, 4, 166, 20, 14),
        t('t:r1c1', '总数:', 6, 34, 46, 21, 14),
        t('t:r1c2', '56302', 120, 34, 58, 21, 14),
        t('t:r2c1', '异常数:', 6, 60, 46, 21, 14),
        t('t:r2c2', '5', 120, 60, 12, 21, 14),
      ],
    }
    const tr = cardTruth(card, [])
    expect(tr.title).not.toBeNull()
    expect('segs' in tr.title).toBe(false)
  })
})
