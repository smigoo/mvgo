/**
 * 🔴 A（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）：同构列表接管必须保留
 * **段级附属文本**（直属于段、不在任何 item 子树内的 TEXT）。
 *
 * ## 病灶（真机）
 * 真值树 `48:5796 → 565:3 slot-con`（GROUP 483×571）内含 6 个 item 卡（470×72，
 * y 51606→52066）+ 段尾两条统计 TEXT：`48:5888 共 6 个节点` / `48:5889 接入设备 10810`
 * （均 y=52161，位于全部 item 底 52138 之下）。刀20b 同构接管只物化 items + v-for
 * ⇒ 这两条 TEXT 结构性缺席 ⇒ C1b「真值标签文本缺席」FAIL，且修复轮 A6 跳过该段
 * 重生成（最小 diff 契约）⇒ 三轮 FAIL 内容逐字相同 ⇒ 拒绝交付（用户体感：太严格）。
 *
 * ## 判据（结构 + 几何，双可辩驳；零语义猜测）
 * ① 段锚可取（`sec.id` 或 `sourceNodeIds` 首个 ∈ figmaIndex）；
 * ② **每个 item 锚必须可取**（否则 fail-open —— 取不到 item 子树就无法排除「item 内部
 *    文本被误当段级文本 ⇒ 同一串渲染两次」）；
 * ③ 段子树内非空 TEXT 且 id ∉ 任一 item 子树 TEXT 集；
 * ④ 位置由**几何**沿列表主轴裁决：中心 < items 最小起点 ⇒ head；> items 最大终点 ⇒ tail；
 *    夹在 items 之内 ⇒ `undecidable` ⇒ **整体 fail-open**（宁可交 LLM，不打乱纵向顺序）。
 */
import { collectSatelliteTexts, renderFoldedGridLeafVue } from './folded-grid-section-takeover.js';
import { indexFigmaNodes } from './section-tree.js';

const BOX = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
});

/** 真机结构复刻：`565:3 slot-con` = 6 个 item 卡 + 段尾 2 条统计文本 + 滚动条矩形。 */
const mkRealTree = (tailY = 52161, tailExtra: Array<any> = []) => ({
  id: '48:5796',
  name: 'cp-aiot-dpjh-bsjd',
  type: 'FRAME',
  absoluteBoundingBox: BOX(20831, 51309, 483, 1035),
  children: [
    {
      id: '565:3',
      name: 'slot-con',
      type: 'GROUP',
      absoluteBoundingBox: BOX(20831, 51606, 483, 571),
      children: [
        ...[0, 1, 2, 3, 4, 5].map((i) => ({
          id: `48:${5798 + i * 15}`,
          name: `node-card-${i + 1}`,
          type: 'FRAME',
          absoluteBoundingBox: BOX(20831, 51606 + i * 92, 470, 72),
          children: [
            {
              id: `48:${5799 + i * 15}`,
              name: 'name',
              type: 'TEXT',
              characters: `${i + 1} 号节点`,
              absoluteBoundingBox: BOX(20855, 51624 + i * 92, 90, 18),
            },
          ],
        })),
        {
          id: '48:5888',
          name: '共 6 个节点',
          type: 'TEXT',
          characters: '共 6 个节点',
          absoluteBoundingBox: BOX(20831, tailY, 60, 16),
          style: { fontSize: 11, fontWeight: 400, lineHeightPx: 14 },
          fills: [{ type: 'SOLID', visible: true, color: { r: 0.65, g: 0.77, b: 1, a: 1 } }],
        },
        {
          id: '48:5889',
          name: '接入设备 10810',
          type: 'TEXT',
          characters: '接入设备 10810',
          absoluteBoundingBox: BOX(21194, tailY, 90, 16),
          style: { fontSize: 11, fontWeight: 400, lineHeightPx: 14 },
        },
        ...tailExtra,
        {
          id: '48:5904',
          name: '滚动条',
          type: 'RECTANGLE',
          absoluteBoundingBox: BOX(21306, 51610, 4, 200),
        },
      ],
    },
  ],
});

const mkIndex = (tree: any) => indexFigmaNodes(tree);
const ITEM_ANCHORS = [0, 1, 2, 3, 4, 5].map((i) => `48:${5798 + i * 15}`);
const SEC = { id: '565:3', type: 'list', sourceNodeIds: ['565:3'] };

describe('A collectSatelliteTexts（段级附属文本裁决）', () => {
  it('① 阳性：两条段尾统计文本判 tail（几何可证，不进 item 子树）', () => {
    const idx = mkIndex(mkRealTree());
    const r = collectSatelliteTexts(SEC, ITEM_ANCHORS, idx, 'column');
    expect(r.ok).toBe(true);
    expect(r.head).toHaveLength(0);
    expect(r.tail).toHaveLength(2);
    expect(r.tail.map((e: any) => e.t)).toEqual(['共 6 个节点', '接入设备 10810']);
    // 真值内联：色/字号/行高逐字取自 Figma（缺则不写，绝不兜底）
    expect(r.tail[0].c).toBeTruthy();
    expect(r.tail[0].fs).toBe(11);
    expect(r.tail[0].lh).toBe(14);
    expect(r.tail[1].c).toBeNull();
  });

  it('② 阳性：间距按几何派生（tail 首条与最后一个 item 底的差 = 23px）', () => {
    const idx = mkIndex(mkRealTree(52161));
    const r = collectSatelliteTexts(SEC, ITEM_ANCHORS, idx, 'column');
    // 最后 item 底 = 51606 + 5*92 + 72 = 52138；52161 - 52138 = 23
    expect(r.tail[0].gap).toBe(23);
  });

  it('③ 阴性：候选夹在 items 之间 ⇒ undecidable ⇒ 整体 fail-open（不猜顺序）', () => {
    const idx = mkIndex(
      mkRealTree(52161, [
        {
          id: '48:5890',
          type: 'TEXT',
          characters: '夹在中间的文本',
          absoluteBoundingBox: BOX(20831, 51800, 60, 16),
        },
      ]),
    );
    const r = collectSatelliteTexts(SEC, ITEM_ANCHORS, idx, 'column');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('undecidable:1');
    expect(r.head).toHaveLength(0);
    expect(r.tail).toHaveLength(0);
  });

  it('④ 阴性：段头文本判 head（中心 < items 最小起点）', () => {
    const tree = mkRealTree();
    tree.children[0].absoluteBoundingBox = BOX(20831, 51560, 483, 617);
    tree.children[0].children.push({
      id: '565:4',
      type: 'TEXT',
      characters: '部署节点概览',
      absoluteBoundingBox: BOX(20831, 51570, 80, 18),
    });
    const r = collectSatelliteTexts(SEC, ITEM_ANCHORS, mkIndex(tree), 'column');
    expect(r.ok).toBe(true);
    expect(r.head.map((e: any) => e.t)).toEqual(['部署节点概览']);
    expect(r.tail.map((e: any) => e.t)).toEqual(['共 6 个节点', '接入设备 10810']);
  });

  it('⑤ 阴性闸门：item 锚取不到 ⇒ fail-open（无法排除 item 内部文本，防同串双渲染）', () => {
    const idx = mkIndex(mkRealTree());
    const r = collectSatelliteTexts(SEC, ['48:5798', '48:9999'], idx, 'column');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('itemAnchorMissing');
  });

  it('⑥ 阴性闸门：无 item 锚 / 无 figmaIndex / 段锚缺失', () => {
    const idx = mkIndex(mkRealTree());
    expect(collectSatelliteTexts(SEC, [], idx, 'column').reason).toBe('noItemAnchor');
    expect(collectSatelliteTexts(SEC, ITEM_ANCHORS, null, 'column').reason).toBe('noFigmaIndex');
    expect(collectSatelliteTexts({ id: '99:99' }, ITEM_ANCHORS, idx, 'column').reason).toBe(
      'noSectionNode',
    );
  });

  it('⑦ item 子树内的文本不得被判成段级（结构归属优先于几何）', () => {
    const idx = mkIndex(mkRealTree());
    const r = collectSatelliteTexts(SEC, ITEM_ANCHORS, idx, 'column');
    const all = [...r.head, ...r.tail].map((e: any) => e.t);
    expect(all.some((t: string) => /号节点/.test(t))).toBe(false);
  });
});

describe('A renderFoldedGridLeafVue（v-for 之外物化 head/tail）', () => {
  const mkTr = (satellite: any) => ({
    kind: 'list',
    sectionId: '565:3',
    items: [
      {
        texts: [{ t: '1 号节点', c: '#ffffff', fs: 12, fw: '400' }],
        stats: [],
        icon: null,
        fill: null,
        bg: false,
      },
    ],
    direction: 'column',
    cardH: 72,
    cardWidths: [470],
    gaps: [20],
    padL: null,
    radius: null,
    itemBgs: [],
    innerLayout: {},
    satellite,
  });

  const tail = [
    { t: '共 6 个节点', c: 'rgba(166,196,255,1)', fs: 11, fw: '400', lh: 14, gap: 23 },
    { t: '接入设备 10810', c: null, fs: 11, fw: null, lh: 14, gap: 0 },
  ];

  it('① 阳性：tail 两条文本渲染进模板，且**不在** FG_LIST_ITEMS 数据里（不进循环）', () => {
    const vue = renderFoldedGridLeafVue(mkTr({ ok: true, reason: null, head: [], tail, count: 2 }), 'mc');
    expect(vue).toContain('共 6 个节点');
    expect(vue).toContain('接入设备 10810');
    // 数据段：tail 走独立常量
    const itemsBlock = vue.slice(vue.indexOf('const FG_LIST_ITEMS = ['), vue.indexOf('const FG_LIST_GAPS'));
    expect(itemsBlock).not.toContain('共 6 个节点');
    const tailBlock = vue.slice(vue.indexOf('const FG_LIST_TAIL = ['), vue.indexOf('</script>'));
    expect(tailBlock).toContain('共 6 个节点');
  });

  it('② 阳性：tail 渲染位置在 v-for 之后（独立节点，不属于任何一项）', () => {
    const vue = renderFoldedGridLeafVue(mkTr({ ok: true, reason: null, head: [], tail, count: 2 }), 'mc');
    const tpl = vue.slice(0, vue.indexOf('</template>'));
    const vFor = tpl.indexOf('in FG_LIST_ITEMS');
    const tailBlock = tpl.indexOf('in FG_LIST_TAIL');
    expect(vFor).toBeGreaterThan(-1);
    expect(tailBlock).toBeGreaterThan(vFor);
  });

  it('③ 阴性：satellite.ok=false ⇒ 一个字符都不渲染（fail-open 交 LLM，不静默塞）', () => {
    const vue = renderFoldedGridLeafVue(
      mkTr({ ok: false, reason: 'undecidable:1', head: [], tail: [], count: 0 }),
      'mc',
    );
    expect(vue).not.toContain('共 6 个节点');
    expect(vue).toContain('const FG_LIST_TAIL = [];');
  });

  it('④ 阴性：satellite 缺失（旧调用方）⇒ 不抛、不渲染空壳', () => {
    const vue = renderFoldedGridLeafVue(mkTr(undefined), 'mc');
    expect(vue).toContain('const FG_LIST_HEAD = [];');
    expect(vue).toContain('const FG_LIST_TAIL = [];');
  });

  it('⑤ 阳性：head 渲染在 v-for 之前', () => {
    const head = [{ t: '部署节点概览', c: null, fs: 16, fw: null, lh: null, gap: 0 }];
    const vue = renderFoldedGridLeafVue(
      mkTr({ ok: true, reason: null, head, tail: [], count: 1 }),
      'mc',
    );
    const tpl = vue.slice(0, vue.indexOf('</template>'));
    expect(tpl.indexOf('in FG_LIST_HEAD')).toBeLessThan(tpl.indexOf('in FG_LIST_ITEMS'));
  });
});
