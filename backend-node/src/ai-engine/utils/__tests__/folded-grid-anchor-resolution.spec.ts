/**
 * 🛡️ 刀 53 锚点解析收口（2026-10-27 · mc-max-1793079162063-8bbcf027 实锤）
 *
 * 病灶：`collectAnchorNodes` 原实现**逐 id**做「合成 id 剥后缀」兜底。
 *   `801:3-orphan-text-0`（sourceNodeIds=['36:1724'] 精确可解析）仍会把 sec.id 剥成
 *   父容器 `801:3`，把它 9 个直接子项全当本叶内容 ⇒ 判据在**别人**的事实上求值：
 *   真机日志 `header:texts=5(need 1)`（本叶仅 1 TEXT）、
 *   `text:hasGraphic(RECTANGLE:36:1695)`（别区域的描述卡底）、`icon:hasText(30)`
 *   （全组件 TEXT 总数）⇒ 7 叶 0 接管。
 *
 * 判据：**精确锚点命中 >0 时绝不再剥后缀**；仅当完全无精确锚点（如 sourceNodeIds
 *   全是幻影 id）时才保留原兜底（fail-open 能力不丢）。
 *
 * 本文件的 fixture 直接复刻该真机样本的父子形态（父容器含 RECTANGLE + 多 TEXT）。
 */
import {
  detectTextLeaf,
  detectHeaderRowLeaf,
  detectIconLeaf,
  renderFoldedGridLeafVue,
} from '../folded-grid-section-takeover.js';
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

const textNode = (
  id: string,
  chars: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fs: number,
  fw: number,
  lh: number,
  hex = '#333333',
) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [solid(hex)],
  style: { fontSize: fs, fontWeight: fw, lineHeightPx: lh },
});

/** 真机 801:3 的简化复刻：父容器带「描述卡底 RECTANGLE + 4 个 TEXT」。 */
const PARENT = {
  id: '801:3',
  type: 'GROUP',
  name: 'cp-设备详情',
  absoluteBoundingBox: { x: 0, y: 0, width: 547, height: 493 },
  children: [
    {
      id: '36:1695',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 300, width: 547, height: 193 },
      fills: [solid('#e1ebff')],
    },
    textNode('36:1698', '编码', 119, 57, 32, 16, 16, 400, 16),
    textNode('36:1721', '爆闪灯', 244, 57, 48, 16, 16, 400, 16, '#3965ff'),
    textNode('36:1724', 'GD-Robot-04', 119, 15, 147, 24, 24, 500, 24),
    textNode(
      '36:1719',
      '该设备为太阳能供电一体化爆闪灯，采用红蓝双色高壳LED阵列。',
      0,
      350,
      496,
      90,
      14,
      400,
      30,
    ),
  ],
};
const DOC = { id: '36:1693', type: 'FRAME', children: [PARENT] };
const idx = () => indexFigmaNodes(JSON.parse(JSON.stringify(DOC)));

describe('刀53 锚点解析：合成 id 叶不得吸收父容器', () => {
  it('阳性①：合成 orphan-text 叶 → 只取自身 sourceNodeIds（单行文本接管）', () => {
    const sec = { id: '801:3-orphan-text-0', sourceNodeIds: ['36:1724'] };
    const r = detectTextLeaf(sec, idx());
    expect(r.ok).toBe(true);
    expect(r.text).toBe('GD-Robot-04');
    expect(r.fontSize).toBe(24);
    expect(r.fontWeight).toBe(500);
    expect(r.multiline).toBe(false);
  });

  it('阳性②：同一行两段文本 → 全部接管，顺序/间距/样式逐项来自真值', () => {
    const sec = { id: '801:3-orphan-text-1', sourceNodeIds: ['36:1698', '36:1721'] };
    const r = detectTextLeaf(sec, idx());
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('text');
    expect(r.direction).toBe('row');
    expect(r.runs).toEqual([
      expect.objectContaining({ text: '编码', gapBefore: 0, color: 'rgba(51,51,51,1)', fontSize: 16 }),
      expect.objectContaining({ text: '爆闪灯', gapBefore: 93, color: 'rgba(57,101,255,1)', fontSize: 16 }),
    ]);
    const h = detectHeaderRowLeaf(sec, idx(), []);
    expect(h.reason).toBe('texts=2(need 1)');
    const ic = detectIconLeaf(sec, idx(), []);
    expect(ic.reason).toBe('hasText(2)');
  });

  it('渲染②：两段同行文本 → 两个模板 run，第二段 margin-left=93，不写统一 gap', () => {
    const tr = detectTextLeaf(
      { id: '801:3-orphan-text-1', sourceNodeIds: ['36:1698', '36:1721'] },
      idx(),
    );
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('flex-direction:row;');
    expect(vue).toContain('{{ runs[0].text }}');
    expect(vue).toContain('{{ runs[1].text }}');
    expect(vue).toContain('margin-left:93px;');
    expect(vue).toContain('color:rgba(51,51,51,1);font-size:16px;font-weight:400;');
    expect(vue).toContain('color:rgba(57,101,255,1);font-size:16px;font-weight:400;');
    expect(vue).not.toContain('gap:93px');
    expect(vue).not.toContain('const text = "undefined"');
  });

  it('阴性②a：N 段中任一 bbox 缺失 ⇒ 整叶 fail-open，不猜位置', () => {
    const doc = JSON.parse(JSON.stringify(DOC));
    delete doc.children[0].children[2].absoluteBoundingBox;
    const r = detectTextLeaf(
      { id: '801:3-orphan-text-1', sourceNodeIds: ['36:1698', '36:1721'] },
      indexFigmaNodes(doc),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('textBoxMissing');
  });

  it('阴性②b：同一行文本盒水平重叠 ⇒ 不线性化、不覆盖渲染', () => {
    const doc = JSON.parse(JSON.stringify(DOC));
    doc.children[0].children[2].absoluteBoundingBox.x = 140; // 编码右缘 151 > 140
    const r = detectTextLeaf(
      { id: '801:3-orphan-text-1', sourceNodeIds: ['36:1698', '36:1721'] },
      indexFigmaNodes(doc),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('textRunsOverlap');
  });

  it('阴性③：sourceNodeIds 全幻影 ⇒ 剥后缀兜底仍然生效（fail-open 能力不丢）', () => {
    const sec = { id: '801:3-orphan-text-9', sourceNodeIds: ['99:9999'] };
    const r = detectTextLeaf(sec, idx());
    // 兜底到父容器 ⇒ 看到描述卡底 RECTANGLE。若兜底被误删，这里会是 noAnchorNode。
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('hasGraphic(RECTANGLE:36:1695)');
  });

  it('阴性④：真实 id 的叶行为不变', () => {
    const sec = { id: '36:1724', sourceNodeIds: ['36:1724'] };
    const r = detectTextLeaf(sec, idx());
    expect(r.ok).toBe(true);
    expect(r.text).toBe('GD-Robot-04');
  });
});

describe('刀53b 纯文本渲染：多行文本必须允许换行', () => {
  it('单行：产物保持 line-height:1 + nowrap（既有形态逐字不变）', () => {
    const tr = detectTextLeaf({ id: '801:3-orphan-text-0', sourceNodeIds: ['36:1724'] }, idx());
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('const text = "GD-Robot-04"');
    expect(vue).toContain('line-height:1;white-space:nowrap;');
    expect(vue).toContain('align-items:center');
    expect(vue).not.toContain('white-space:normal');
  });

  it('多行：真值 496×90 / fs14 / lh30 ⇒ 换行 + 真值行高 + 顶端对齐', () => {
    const tr = detectTextLeaf({ id: '801:3-orphan-text-3', sourceNodeIds: ['36:1719'] }, idx());
    expect(tr.ok).toBe(true);
    expect(tr.multiline).toBe(true);
    expect(tr.lineHeight).toBe(30);
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('line-height:30px;white-space:normal;');
    expect(vue).toContain('align-items:flex-start');
    expect(vue).toContain('height:90px;');
    expect(vue).not.toContain('white-space:nowrap');
  });

  it('行高缺失 ⇒ 不多行（fail-open 回原单行形态，不臆造行高）', () => {
    const doc = JSON.parse(JSON.stringify(DOC));
    delete doc.children[0].children[4].style.lineHeightPx;
    const tr = detectTextLeaf(
      { id: '801:3-orphan-text-3', sourceNodeIds: ['36:1719'] },
      indexFigmaNodes(doc),
    );
    expect(tr.ok).toBe(true);
    expect(tr.multiline).toBe(false);
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('line-height:1;white-space:nowrap;');
  });
});
