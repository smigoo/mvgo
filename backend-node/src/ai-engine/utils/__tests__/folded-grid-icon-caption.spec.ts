/**
 * 🧱 icon 伴随文本（caption）单测（2026-11-15 · mc-max-1794746516643-2348cf5c 实锤）
 *
 * 病灶真值（89:38 活动卡 2:8787，卡 193×65 @1486,475）：
 *   左列 = icon(rel 18,8 35×28) + 「隧道设备」(rel 14,39 45×16)
 *   右侧 = line1/line2（HORIZONTAL FRAME，label 列 rel x64 + value 列 rel x111，两行对齐）
 *
 * 既有模型只有「icon 前缀 + 一维文本流」，没有「左列伴随文本」这一维 ⇒「隧道设备」
 * 混进文本流 ⇒ 两行 run 数变 2/3 ⇒ analyzeColumnPair「各行列数须一致」fail-open ⇒
 * textDir 退回 single-row ⇒ 5 段（真值合计 149px）挤进 129px nowrap flex row ⇒
 * flex-shrink 把 span 盒压到内容宽以下（「总数:」46→31.7px），文字画出盒外互压
 * ⇒ RUNTIME-016「5」×「总数:」=0.70。
 *
 * 判据：run 的 x 区间与 icon x 区间相交 ∧ y 区间与 icon 不相交 ⇒ 伴随文本；恰命中 1 条才认。
 */
import { cardTruth, renderFoldedGridLeafVue } from '../folded-grid-section-takeover.js';

const CARD = { x: 1486, y: 475, width: 193, height: 65 };
const ICON_ID = 'test:icon';
/** icon 真值：rel (18,8) 35×28 */
const ICON_BOX = { x: CARD.x + 18, y: CARD.y + 8, width: 35, height: 28 };

const MAPPING = [
  {
    figmaNodeId: ICON_ID,
    resourceFile: '../resources/images/icon-8798.png',
    assignedVarName: 'icon8798',
    downloadStatus: 'ok',
  },
];

/** 一个 TEXT 子节点（绝对坐标） */
function text(id, chars, x, y, w, h, fontSize = 14) {
  return {
    id,
    type: 'TEXT',
    characters: chars,
    absoluteBoundingBox: { x, y, width: w, height: h },
    style: { fontSize, fontWeight: 400 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
  };
}

function cardNode(children, box = CARD) {
  return {
    id: 'test:card',
    name: 'active',
    type: 'GROUP',
    absoluteBoundingBox: box,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.28, g: 0.65, b: 0.98, a: 1 } }],
    children,
  };
}

function iconNode() {
  return {
    id: ICON_ID,
    name: 'icon',
    type: 'GROUP',
    absoluteBoundingBox: ICON_BOX,
    children: [],
  };
}

/** 真值复刻：caption + 2 行 × 2 列（label 列 x64 / value 列 x111） */
function truthCard(overrides: { caption?: boolean } = {}) {
  const kids = [
    text('t:unit', '隧道设备', CARD.x + 14, CARD.y + 39, 45, 16, 12),
    text('t:l1', '总数:', CARD.x + 64, CARD.y + 7, 46, 21, 14),
    text('t:d1', '56302', CARD.x + 111, CARD.y + 6, 58, 23, 20),
    text('t:l2', '异常数:', CARD.x + 64, CARD.y + 36, 46, 21, 14),
    text('t:d2', '5', CARD.x + 111, CARD.y + 35, 12, 23, 20),
    iconNode(),
  ];
  if (overrides.caption === false) {
    return cardNode(kids.filter((k) => k.id !== 't:unit'));
  }
  return cardNode(kids);
}

describe('cardTruth ⇒ icon 伴随文本（caption）', () => {
  it('阳性（2348cf5c 真值）：单位文本归左列，不进文本流；文本流恢复 2×2 ⇒ column-pair', () => {
    const t = cardTruth(truthCard(), MAPPING);
    expect(t).not.toBeNull();
    // caption 抽取
    expect(t.icon.caption?.text).toBe('隧道设备');
    expect(t.icon.caption?.colW).toBe(45); // max(icon.w 35, caption 45)
    expect(t.icon.caption?.gapTop).toBe(3); // caption 上缘 39 − icon 下缘 36
    // 文本流只剩 4 段，且不再是单行横排
    expect(t.runs.map((r: any) => r.text)).toEqual(['总数:', '56302', '异常数:', '5']);
    expect(t.textDir).toBe('column-pair');
    expect(t.columns.map((c: any[]) => c.map((x: any) => x.text))).toEqual([
      ['总数:', '异常数:'],
      ['56302', '5'],
    ]);
    // 左列几何：起点 = min(icon 18, caption 14) = 14；右缘 = max(53, 59) = 59
    expect(t.pad).toBe(14);
    expect(t.gap).toBe(5); // 文本流首 run 绝对 x 1550 − (卡左 1486 + 59)
    expect(t.padRight).toBe(24); // 193 − 169（末列右缘）
  });

  it('阴性：无 caption（单位文本不在 icon 的 x 带内）⇒ 退回既有单行 row，字段零新增', () => {
    const t = cardTruth(truthCard({ caption: false }), MAPPING);
    expect(t).not.toBeNull();
    expect(t.icon.caption).toBeUndefined();
    // 无 caption ⇒ pad/gap 走既有 icon 通道（icon 左缘 18 / icon 右缘→首文本 11）
    expect(t.pad).toBe(18);
    expect(t.gap).toBe(11);
    // 2 行 × 2 列仍可聚 ⇒ column-pair（本形态与 caption 无关）
    expect(t.textDir).toBe('column-pair');
  });

  it('阴性：run 与 icon 同一水平带（y 相交）⇒ 不是 caption（是同行成员）', () => {
    // 「总数:」rel x64 与 icon x[18,53] 不相交；把一条文本挪到 icon 正上方同行
    const kids = [
      text('t:l1', '总数:', CARD.x + 64, CARD.y + 7, 46, 21, 14),
      text('t:d1', '56302', CARD.x + 111, CARD.y + 6, 58, 23, 20),
      text('t:l2', '异常数:', CARD.x + 64, CARD.y + 36, 46, 21, 14),
      text('t:d2', '5', CARD.x + 111, CARD.y + 35, 12, 23, 20),
      // x 与 icon 重叠且 y 与 icon 重叠（rel y 10..25 落在 icon 8..36 内）
      text('t:ov', '叠', CARD.x + 20, CARD.y + 10, 12, 15, 12),
      iconNode(),
    ];
    const t = cardTruth(cardNode(kids), MAPPING);
    expect(t).not.toBeNull();
    expect(t.icon.caption).toBeUndefined();
  });

  it('阴性：命中 ≥2 条 ⇒ 结构可疑不猜（不抽取、字段零新增）', () => {
    const kids = [
      text('t:l1', '总数:', CARD.x + 64, CARD.y + 7, 46, 21, 14),
      text('t:d1', '56302', CARD.x + 111, CARD.y + 6, 58, 23, 20),
      text('t:l2', '异常数:', CARD.x + 64, CARD.y + 36, 46, 21, 14),
      text('t:d2', '5', CARD.x + 111, CARD.y + 35, 12, 23, 20),
      text('t:u1', '隧道', CARD.x + 14, CARD.y + 39, 20, 16, 12),
      text('t:u2', '设备', CARD.x + 36, CARD.y + 55, 20, 16, 12),
      iconNode(),
    ];
    const t = cardTruth(cardNode(kids), MAPPING);
    expect(t).not.toBeNull();
    expect(t.icon.caption).toBeUndefined();
    expect(t.runs.map((r: any) => r.text)).toContain('隧道');
  });

  it('阴性：无 icon ⇒ 不做 caption 抽取（pad/gap 保持既有文本流真值）', () => {
    const kids = [
      text('t:unit', '隧道设备', CARD.x + 14, CARD.y + 39, 45, 16, 12),
      text('t:l1', '总数:', CARD.x + 64, CARD.y + 7, 46, 21, 14),
      text('t:d1', '56302', CARD.x + 111, CARD.y + 6, 58, 23, 20),
      text('t:l2', '异常数:', CARD.x + 64, CARD.y + 36, 46, 21, 14),
      text('t:d2', '5', CARD.x + 111, CARD.y + 35, 12, 23, 20),
    ];
    const t = cardTruth(cardNode(kids), MAPPING);
    expect(t).not.toBeNull();
    expect(t.icon).toBeNull();
    expect(t.runs).toHaveLength(5);
  });
});

describe('渲染接线：icon 列竖排 + iconCap 透传', () => {
  function buildTr() {
    const items = [cardTruth(truthCard(), MAPPING), cardTruth(truthCard(), MAPPING)];
    return {
      ok: true,
      kind: 'grid',
      sectionId: '89:38',
      baseId: '89:38',
      cols: 2,
      cardW: 193,
      cardH: 65,
      colGap: 10,
      rowGap: null,
      rows: 1,
      items,
    };
  }

  it('有 caption ⇒ icon 与单位文本包成竖排列，iconCap 字段落到 items', () => {
    const vue = renderFoldedGridLeafVue(buildTr() as any, 'component');
    // icon 列：竖排 + 真值列宽 45px
    expect(vue).toContain('flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto;width:45px');
    // caption 文本走 pre（只认 Figma 显式换行，不按列宽自动折行）+ 真值行距 marginTop
    expect(vue).toContain("whiteSpace: 'pre'");
    expect(vue).not.toContain('pre-line');
    expect(vue).toContain("marginTop: it.iconCap.gapTop + 'px'");
    expect(vue).toContain('"iconCap"');
    expect(vue).toContain('"text": "隧道设备"');
    // 文本流只剩 4 段（caption 不在 runs 里）
    expect(vue).toContain('"runs": [');
    expect((vue.match(/"text": "隧道设备"/g) || []).length).toBe(2); // 只出现在 iconCap（两张卡各 1）
  });

  it('无 caption ⇒ `<img>` 单元素形态逐字不变（阴性零回归）', () => {
    const items = [
      cardTruth(truthCard({ caption: false }), MAPPING),
      cardTruth(truthCard({ caption: false }), MAPPING),
    ];
    const tr = { ...buildTr(), items };
    const vue = renderFoldedGridLeafVue(tr as any, 'component');
    expect(vue).toContain('<img v-if="it.icon != null" :src="FG_GRID_ICONS[it.icon]"');
    expect(vue).not.toContain('iconCap');
    expect(vue).not.toContain("whiteSpace: 'pre'");
  });
});
