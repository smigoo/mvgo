/**
 * 🔴 2026-11-03（列表段卡内布局与卡盒填充真值治本 · 步①②③④）：列表卡盒横向几何真值。
 *
 * ## 为什么必须有本 spec
 * 全库 `folded-grid-section-takeover.spec.ts`（102 用例）**零个 list 用例** ——
 * 这正是「产物写出 `FG_LIST_GAPS=[-11,-12]` 却全绿通过」的原因。本 spec 补上
 * list 分支的**真机几何阳性对照**。
 *
 * ## 真机证据（非合成数字，2026-11-03 直读缓存复算）
 * 下列几何数值**逐字取自** `backend-node/data/figma-node-cache/
 * 1t7Dmmpsl5i0PC8BJt2QLf_2-7952_9e4c1b4f.json`（slot `136:121` 今日累计）：
 *   - 三张卡的**帧盒** `136:127/128/129`：x=273.999969/166/37 w=141.000031/120/140.481476，均 h=74.1953125；
 *     ⇒ 按 x 升序相减：`166 − (37 + 140.481476) = −11.481 → −11`、`274 − (166 + 120) = −12`
 *     —— **与产物 `FG_LIST_GAPS = [-11,-12]` 逐位吻合**（步①② 前即此值）；
 *   - 三张卡的**可见底** `2:8034/2:8047/2:8058`：x=37/166/295，均 **120×60**，cr=1.76；
 *     ⇒ 按 x 升序相减 = **`[9,9]`** —— **步④ 已落地并按此值断言**；
 *   - **树形与填充的真实分布**（这是本 spec 与「想当然夹具」的关键差别）：
 *     `136:127 FRAME` 自身 `fills=[]` ⇒ `136:126 FRAME "bg"` 也 `fills=[]`
 *       ⇒ 顶条 `2:8025 VECTOR`（h≈14.52）与卡底 `2:8058 GROUP > 2:8059 RECTANGLE`（120×60 cr=1.76）
 *          的填充均为 **两段 `GRADIENT_LINEAR`（首段 `visible:false`）** —— 可见填充**不是 SOLID**；
 *     但卡子树**并非无 SOLID**：图标 `2:8063 RECTANGLE` 是 `SOLID #ff7700`、文字是 `SOLID #333333`。
 *   - vision 声明 `repeatedFill: '#a6ceff'`。
 *
 * ## 根因（颜色轨恒 miss → 回落异宽帧盒 → row 分支照写负值）
 * ① `findFillAnchorNode`（`:2290`）用 `firstSolidFillRgba`（`:163`，**只认可见 SOLID**）逐节点
 *    与 `normalizeCssColor(declaredFill)` **比色**。真值里卡底可见填充是**渐变**（无法归一成单色），
 *    而子树内仅有的 SOLID（`#ff7700`/`#333333`）又与 `#a6ceff` **不相等**
 *    ⇒ **恒 miss**。🔴 注意：这**不是**「子树没有 SOLID」，是「**颜色匹配这条路本身走不通**」
 *    ⇒ 步④ 若要取 120×60 真值，**只能按几何选可见底**，不能靠比色（见末附断言）。
 * ② 即便比色命中，合格条件 `cb.w >= rowBox.w && cb.h >= rowBox.h`（`:2321`）要求「可见底 ⊇ 帧盒」，
 *    而真值可见底 **120 < 帧盒 140.48** ⇒ 仍判不合格回落帧盒。
 * ⇒ `cardBoxes` 回落成**异宽帧盒**，而 row 分支（`:2364`）**只看 `boxesReady`、不看 `geoReady`**
 *   ⇒ 按 x 相减得负值并直接写进产物。
 *
 * ## 本 spec 断言的是「错值不可能被写出去」
 * 也不是「把 −11 改成 9」（步④ 取真值那是另一支路）。三条判据**互补不重叠**：
 *   - 步③ **宽度守卫**（row 回退盒 + 异宽 ⇒ 横向几何不可证）：`gaps`/`cardWidths` **从未计算**
 *     ⇒ 计数落在 `widthNotUniform`；被拦下的帧盒几何经 `rawWidths`+`rawXs` 完整回溯。
 *   - 步①② **负间距总闸**（算了但为负）：`gaps` 置 `null`（**绝不 clamp 成 0**）⇒ 计数落在 `negGapClamped`。
 *   - 步④ **几何锚 + 跨度自校验**（真值可得时）：颜色锚 miss 时按几何选可见底，取到即得 `[9,9]`；
 *     选错（跨度不守恒）则**全量 fail-open**，退回上面的步③ 口径。
 * 三者皆取「让错值不可能被写出去」或「取到真值」，而非「把 −11 改成 9」。
 */
import { detectListLeaf, renderFoldedGridLeafVue } from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';
import { validateVueSfc } from '../sfc-syntax-validation.js';

/**
 * 渐变填充（真值形态：`GRADIENT_LINEAR`，与真机一致 —— **首段 `visible:false`、次段可见**）。
 * 🔴 `firstSolidFillRgba` 对渐变恒返 null ⇒ `findFillAnchorNode` 不可能比中它。
 */
const gradient = (hidden = false) => ({
  type: 'GRADIENT_LINEAR',
  visible: !hidden,
  opacity: 0.3,
  gradientStops: [
    { position: 0, color: { r: 0x1f / 255, g: 0x9e / 255, b: 0xff / 255, a: 0 } },
    { position: 1, color: { r: 0x1f / 255, g: 0x9e / 255, b: 0xff / 255, a: 1 } },
  ],
});

const solid = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

const text = (id, chars, x, y, w, h, fs, fw, hex) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: hex ? [solid(hex)] : [],
  style: { fontSize: fs, fontWeight: fw },
});

/** 统计子树内可见 SOLID 节点数（用于证「miss ≠ 子树无 SOLID」）。 */
const countSolid = (n) => {
  if (!n || typeof n !== 'object') return 0;
  const hasSolid = Array.isArray(n.fills)
    ? n.fills.some((f) => f && f.visible !== false && f.type === 'SOLID')
    : false;
  return (hasSolid ? 1 : 0) + (n.children || []).reduce((a, c) => a + countSolid(c), 0);
};

/**
 * 一张卡：**与真机同构**（帧盒 `w` 异宽 141/120/140.481476，h=74.1953125）。
 *
 * 真机层级（本夹具逐层还原）：
 *   `136:127 FRAME`（`fills:[]`）
 *     └ `136:126 FRAME "bg"`（`fills:[]`）
 *         ├ 顶条 VECTOR（h≈14.52，**渐变**）
 *         └ `GROUP`（120×60 cr=1.76，无填充）> `RECTANGLE`（120×60 cr=1.76，**渐变**）
 *     └ 图标 FRAME > RECTANGLE（**SOLID #ff7700**）—— 子树确有 SOLID
 *     └ 3 个 TEXT（名称 fs12.32 / 数值 fs20 fw700 彩 / 单位 `次` fs12.32，**SOLID #333333**）
 *
 * 🔴 `bx` = 卡底（可见底）在卡内的**水平真值位置**，**必须逐卡显式给**：
 *   真机三卡并不统一（帧 x=274/166/37、底 x=295/166/37 ⇒ **右对齐 / 相等 / 左对齐**）。
 *   若图省事写成「统一居中」，就造出真机不存在的样本 —— 跨度自校验会（正确地）拒绝它，
 *   于是「步④ 已修好」与「步④ 没修好」两种代码在该夹具下**输出相同** ⇒ 假绿。
 */
const cardFrame = (id: string, x: number, w: number, name: string, value: string, valueHex: string, bx?: number) => {
  const bxReal = Number.isFinite(bx) ? (bx as number) : x + (w - 120) / 2;
  return {
  id,
  type: 'FRAME',
  name: String(id).split(':')[1],
  absoluteBoundingBox: { x, y: 984, width: w, height: 74.1953125 },
  fills: [], // 🔴 真机帧自身无填充（不是「帧上是渐变」——那会掩盖比色失配的真因）
  children: [
    {
      id: `${id}-bg`,
      type: 'FRAME',
      name: 'bg',
      absoluteBoundingBox: { x, y: 984, width: w, height: 74.1953125 },
      fills: [],
      children: [
        {
          id: `${id}-top`,
          type: 'VECTOR',
          name: 'Rectangle 34625532',
          absoluteBoundingBox: { x, y: 984, width: w - 0.52, height: 14.515464782714844 },
          fills: [gradient(true), gradient()],
        },
        {
          id: `${id}-bot`,
          type: 'GROUP',
          name: 'Group 2136638349',
          absoluteBoundingBox: { x: bxReal, y: 998.1953125, width: 120, height: 60 },
          cornerRadius: 1.76,
          fills: [],
          children: [
            {
              id: `${id}-botrect`,
              type: 'RECTANGLE',
              name: 'Rectangle 346241502',
              absoluteBoundingBox: { x: bxReal, y: 998.1953125, width: 120, height: 60 },
              cornerRadius: 1.76,
              fills: [gradient(true), gradient()],
            },
          ],
        },
      ],
    },
    {
      id: `${id}-icon`,
      type: 'FRAME',
      name: 'icon',
      absoluteBoundingBox: { x: x + w - 60, y: 999.2277221679688, width: 47.52045822143555, height: 52.29227828979492 },
      fills: [],
      children: [
        {
          id: `${id}-iconrect`,
          type: 'RECTANGLE',
          absoluteBoundingBox: { x: x + w - 60, y: 1004, width: 47.52, height: 47.52 },
          fills: [solid('#ff7700')],
        },
      ],
    },
    text(`${id}-n`, name, x + 4, 1009, 60, 16, 12.32, 400, '#333333'),
    text(`${id}-v`, value, x + 4, 1029, 20, 24, 20, 700, valueHex),
    text(`${id}-u`, '次', x + 26, 1030, 14, 16, 12.32, 400, '#333333'),
  ],
  };
};

/**
 * 真机 slot 树：`136:121`（段）> `2:8023`（行容器）> 三张卡。
 * 注意 **items 顺序 = plan 顺序 [136:127, 136:128, 136:129]**，
 * 即 `cardWidths` 按 items 序、`gaps` 按 x 序 —— **两套序**（真机产物 `[141,120,140]` 即此序）。
 */
const docWith = (cards) => ({
  id: '136:121',
  name: '今日累计',
  type: 'GROUP',
  absoluteBoundingBox: { x: 37, y: 963, width: 377.5, height: 86 },
  children: [
    {
      id: '2:8023',
      name: 'cards',
      type: 'FRAME',
      absoluteBoundingBox: { x: 37, y: 984, width: 378, height: 74.2 },
      children: cards,
    },
  ],
});

/** 真机三卡（**宽度与卡底 x 逐字取自缓存**；顺序 = plan items 序 = [136:127, 136:128, 136:129]）。 */
const REAL_CARDS = [
  // 帧 274..415（w=141.0）、底 295..415（w=120）⇒ **右对齐**
  cardFrame('136:127', 273.9999694824219, 141.00003051757812, '超高车辆', '19', '#fa8c16', 295),
  // 帧 166..286（w=120）、底 166..286（w=120）⇒ **完全重合**
  cardFrame('136:128', 166, 120, '重型货车', '2', '#1990ff', 166),
  // 帧 37..177.48（w=140.48）、底 37..157（w=120）⇒ **左对齐**
  cardFrame('136:129', 37, 140.48147583007812, '危化品车', '51', '#e02020', 37),
];

/** 段：`collapsed:true` 是 `detectListLeaf` 的触发前提（`:2107`）。 */
const listSec = (cards, repeatedFill) => ({
  id: '136:121',
  type: 'list',
  collapsed: true,
  renderHint: 'v-for',
  itemCount: 3,
  layout: 'vertical',
  items: cards.map((c, i) => ({
    id: c.id,
    name: ['超高车辆', '重型货车', '危化品车'][i],
    figmaNodeId: c.id,
    absoluteBoundingBox: c.absoluteBoundingBox,
    repeatedFill,
    content: {
      elements: [
        { text: ['超高车辆', '重型货车', '危化品车'][i], styles: { fontSize: 12.32, color: '#333333' } },
        {
          parts: [
            { type: 'number', text: ['19', '2', '51'][i], styles: { fontSize: 20, fontWeight: 700, color: '#333333' } },
            { type: 'unit', text: '次', styles: { fontSize: 12.32 } },
          ],
        },
      ],
    },
  })),
});

describe('步①②③ · 列表卡盒横向几何真值（真机阳性 / 阴性 / 防误伤对照）', () => {
  it('阳性对照（真机复现）：渐变卡底 ⇒ 颜色锚结构性 miss ⇒ 步④ 几何锚取到 120×60 ⇒ [9,9]', () => {
    const idx = indexFigmaNodes(docWith(REAL_CARDS));
    const r: any = detectListLeaf(listSec(REAL_CARDS, '#a6ceff'), idx, []);

    // 先证「本段确实命中 list」（否则后面的断言是空转 = 假绿）
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('list');
    expect(r.direction).toBe('row');

    // ①：帧轨异宽（真值 141/120/140.4，按 items 序）—— 帧盒几何**始终**可回溯
    expect(r.listGeo.rawWidths).toEqual([141, 120, 140]);
    expect(r.listGeo.rawXs).toEqual([274, 166, 37]);

    // 🔴 步④：颜色锚（`#a6ceff` vs 渐变/其它 SOLID）结构性 miss ⇒ **几何锚**按
    //   「面积最大 + 含于帧盒 + 共享一条边 + 不含其它行」取到卡底 120×60（真值 cr=1.76）。
    expect(r.listGeo.geomPicked).toBe(3);
    expect(r.listGeo.spanRejected).toBe(false);
    expect(r.listGeo.boxWidths).toEqual([120, 120, 120]);
    expect(r.listGeo.boxXs).toEqual([295, 166, 37]); // 右对齐/重合/左对齐，逐卡真值

    // ②：卡盒同宽同高 ⇒ geoReady=true ⇒ 逐项宽度与**正**间距照发（步③ 守卫不得误触发）
    expect(r.listGeo.sameWidth).toBe(true);
    expect(r.listGeo.widthNotUniform).toBe(false);
    expect(r.listGeo.cardH).toBe(60);
    expect(r.cardWidths).toEqual([120, 120, 120]);
    // x 升序：37 → 166 → 295 ⇒ 166−(37+120)=9、295−(166+120)=9 = 真机目标真值
    expect(r.gaps).toEqual([9, 9]);
    expect(r.listGeo.negGapClamped).toBe(false);
    expect(r.listGeo.negGapValues).toEqual([]);

    // ③：产物侧闭环（不下发负值，且下发的是 120×60 那套真值）
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue.replace(/\s+/g, '')).toContain('FG_LIST_WIDTHS=[120,120,120]');
    expect(vue.replace(/\s+/g, '')).toContain('FG_LIST_GAPS=[9,9]');
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);

    // 🔴 记录一项对判据选型有决定性的事实：miss **不是**「子树没有 SOLID」——
    //   真机子树里图标/文字都是 SOLID（本夹具同构保留 3 处 TEXT + 1 处图标 SOLID）。
    //   所以不能靠「把渐变也纳入比色」，只能**按几何**选可见底（本用例即该结论的落地）。
    expect(countSolid(REAL_CARDS[0])).toBeGreaterThanOrEqual(4);
  });

  it('阴性对照：等宽帧盒 ⇒ 正间距原样保留（总闸与宽度守卫皆不得误伤）', () => {
    // 3 张等宽 120 卡 @ x=37/166/295（真机**可见底**的位置与宽度）
    const cards = [
      cardFrame('136:127', 295, 120, '超高车辆', '19', '#fa8c16'),
      cardFrame('136:128', 166, 120, '重型货车', '2', '#1990ff'),
      cardFrame('136:129', 37, 120, '危化品车', '51', '#e02020'),
    ];
    const idx = indexFigmaNodes(docWith(cards));
    // 不声明 repeatedFill ⇒ fill 轨缺 ⇒ resolveCardBox 直接回落帧盒（等宽）⇒ geoReady=true
    const r: any = detectListLeaf(listSec(cards, null), idx, []);

    expect(r.ok).toBe(true);
    expect(r.listGeo.geoReady).toBe(true);
    expect(r.listGeo.sameWidth).toBe(true);
    expect(r.listGeo.widthNotUniform).toBe(false); // 等宽 ⇒ 宽度守卫不得触发
    expect(r.gaps).toEqual([9, 9]);
    expect(r.cardWidths).toEqual([120, 120, 120]);
    expect(r.listGeo.negGapClamped).toBe(false);
    expect(r.listGeo.negGapValues).toEqual([]);
  });

  it('🔴 防误伤：逐项已证明的真异宽 ⇒ 横向几何照发（widthNotUniform=false）', () => {
    // 构造法：让每张卡**帧自身**带与声明色相等的 SOLID ⇒ `findFillAnchorNode` 命中帧
    //   ⇒ `resolveCardBox` 返回 `node` 非空 ⇒ `horizProven=true`。
    //   此时异宽是**逐项独立证明出的事实**，照发才对 —— 这是步③ 必须保留的第二支路。
    const HEX = '#123456';
    const cards = [
      { ...cardFrame('136:127', 320, 200, '超高车辆', '19', '#333333'), fills: [solid(HEX)] },
      { ...cardFrame('136:128', 190, 120, '重型货车', '2', '#333333'), fills: [solid(HEX)] },
      { ...cardFrame('136:129', 37, 140, '危化品车', '51', '#333333'), fills: [solid(HEX)] },
    ];
    const idx = indexFigmaNodes(docWith(cards));
    const r: any = detectListLeaf(listSec(cards, HEX), idx, []);

    expect(r.ok).toBe(true);
    expect(r.direction).toBe('row');
    expect(r.listGeo.sameWidth).toBe(false);       // 异宽
    expect(r.listGeo.widthNotUniform).toBe(false); // 但逐项已证明 ⇒ 不拦
    expect(r.cardWidths).toEqual([200, 120, 140]); // 照发
    // x 升序：140@37 → 120@190 → 200@320 ⇒ 190−(37+140)=13、320−(190+120)=10
    expect(r.gaps).toEqual([13, 10]);
    expect(r.listGeo.negGapClamped).toBe(false);

    // 🔴 承接覆盖（原 `folded-grid-list-takeover.spec.ts` 的 `FG_LIST_WIDTHS=[140,120,141]`
    //   已被步③ 修正为 null，故「非空逐项宽度真的渲染进产物」这条覆盖迁到本用例 ——
    //   本用例是语义正确的落点：**逐项已证 ⇒ 异宽照发**。
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('flex-direction:row;min-height:0;overflow-x:auto;');
    expect(vue.replace(/\s+/g, '')).toContain('FG_LIST_WIDTHS=[200,120,140]');
    expect(vue.replace(/\s+/g, '')).toContain('FG_LIST_GAPS=[13,10]');
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);
  });

  it('🔴 自校验阳性对照：几何锚误选（卡底居中）⇒ 跨度不守恒 ⇒ 全量 fail-open + 步③ 拦下', () => {
    // 与真机唯一差别：卡底位置用「统一居中」而非真机的 右对齐/重合/左对齐。
    // 帧轨 37..415（跨度 378）、底轨 47.24..404.5（跨度 357.26）⇒ 差 20.7 > 2 ⇒ 必须拒绝。
    // 🔴 这条用例同时守住两件事：① 几何锚**不能**无脑采信（选到卡内浮块必须拦）；
    //   ② 拦下后必须回到步③ 的「不可证 ⇒ 不下发」，而不是把帧盒负间距写出去。
    const cards = [
      cardFrame('136:127', 273.9999694824219, 141.00003051757812, '超高车辆', '19', '#fa8c16'),
      cardFrame('136:128', 166, 120, '重型货车', '2', '#1990ff'),
      cardFrame('136:129', 37, 140.48147583007812, '危化品车', '51', '#e02020'),
    ];
    const idx = indexFigmaNodes(docWith(cards));
    const r: any = detectListLeaf(listSec(cards, '#a6ceff'), idx, []);

    expect(r.ok).toBe(true);
    expect(r.listGeo.spanRejected).toBe(true);  // 自校验生效（不是故障，是判据在工作）
    expect(r.listGeo.geomPicked).toBe(3);       // 尝试数保留 ⇒ 日志可区分「未触发」与「触发了被拦」
    // 盒已回退帧轨 ⇒ 逐项宽度由 boxWidths 反映帧盒
    expect(r.listGeo.boxWidths).toEqual([141, 120, 140]);
    // 步③：回退盒 + 异宽 ⇒ 横向几何不可证 ⇒ 同门不下发（**绝不**写成 [-11,-12]）
    expect(r.cardWidths).toBeNull();
    expect(r.gaps).toBeNull();
    expect(r.listGeo.widthNotUniform).toBe(true);
    expect(r.listGeo.negGapClamped).toBe(false);
    // 帧盒几何仍完整可回溯
    expect(r.listGeo.rawWidths).toEqual([141, 120, 140]);
    expect(r.listGeo.rawXs).toEqual([274, 166, 37]);
  });

  it('fail-open：非折叠段不得进 list 判据（触发前提未放松）', () => {
    const idx = indexFigmaNodes(docWith(REAL_CARDS));
    const sec: any = listSec(REAL_CARDS, '#a6ceff');
    delete sec.collapsed;
    delete sec.renderHint;
    const r: any = detectListLeaf(sec, idx, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notCollapsedList');
  });
});

/**
 * 🔴 步⑤（P0-2）：卡内布局几何真值 —— 「名称在上 / 数值+单位同行」必须**按几何**重建结构。
 *
 * ## 病灶（设计稿 vs 产物）
 * 真机三卡是「名称在上、`51`+`次` 同一行在名称**正下方**且左对齐」，而渲染器**硬编码**
 * 「名称列 + stats 列 + `margin-left:auto`」⇒ 数值被推到**最右**、数值与单位上下两行
 * ⇒ OCR 读成「名称 …… 右对齐的 51、次」。
 * 🔴 `margin-left:auto` 是**渲染层替真值做的横向决定**（与 `cardWidths`/`gaps` 同病）：
 *    声明层没有这条事实，是渲染器替真值做了决定。
 *
 * ## 判据（与刀55 `resolveListMemberDirection` 同构：几何可证优先，不可证回落现状）
 *   - 名称盒 × 数值盒：x 重叠 > 50% 且 y **不重叠** ⇒ `stacked`（本单）；反向 ⇒ `inline`；否则不下发。
 *   - 数值盒 × 单位盒：y 重叠 > 50% 且 x 不重叠 ⇒ `inline`（本单 `51`+`次`）；反向 ⇒ `stacked`。
 *   - `valuePartsGap` = 单位盒左 − 数值盒右（真值 2px），**只在 inline 时**才是事实。
 *
 * ## 🔴 三道 fail-open 闸（缺一即「一条误判重排整段」）
 *   ① **文本配对必须唯一**：卡子树内 `characters` 与 vision 文本全等的 TEXT 恰 1 个才可用
 *      （0 个 = 取不到真值；≥2 个 = 有歧义）⇒ 该卡**不投票**，绝不按顺序猜；
 *   ② **多卡必须一致**：投票取集合，出现第二种 ⇒ `innerConflict` ⇒ 整段不下发；
 *   ③ **只用于「改变现状」的方向**：只有 `stacked` 会重排（现状是 inline）⇒ 判错的
 *      最坏后果是**保持原样**，不是把 `inline` 段错误压成纵排。
 *
 * ## 夹具保真度
 * `REAL_CARDS` 的名称盒 y1009..1025、数值盒 y1029..1053（x 与名称左对齐）、单位盒 y1030..1046
 * （x = 数值右 + 2）—— **逐位对上真机**，故它同时是「步④ 卡盒真值」与「步⑤ 卡内布局真值」
 * 的同一份阳性来源（**零合成数字**）。
 */
describe('步⑤ · 卡内布局几何真值（名称/数值堆叠 + 数值/单位同行）', () => {
  /** 按 `characters` 定位卡内 TEXT 并搬到新位置（构造「各卡不一致」的 conflict 样本）。 */
  const moveText = (card: any, chars: string, x: number, y: number) => {
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (String(n.type).toUpperCase() === 'TEXT' && n.characters === chars) {
        n.absoluteBoundingBox = { ...n.absoluteBoundingBox, x, y };
        return;
      }
      for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
    };
    walk(card);
  };

  it('阳性对照（真机）：三卡一致 ⇒ innerDir=stacked / valuePartsDir=inline / gap=2，且产物 stats 进文本列（无 margin-left:auto）', () => {
    const idx = indexFigmaNodes(docWith(REAL_CARDS));
    const r: any = detectListLeaf(listSec(REAL_CARDS, '#a6ceff'), idx, []);

    // 先证「本段确实命中 list 且取到卡盒真值」（否则后面的渲染断言是空转 = 假绿）
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('list');
    expect(r.listGeo.geomPicked).toBe(3);

    // ① 判据落点：三卡逐位同构 ⇒ 集合只有一种 ⇒ 采纳
    expect(r.innerLayout.innerDir).toBe('stacked');
    expect(r.innerLayout.innerProven).toBe(3); // 三卡都投了票（配对唯一，非「0 票平局」）
    expect(r.innerLayout.innerConflict).toBe(false);
    expect(r.innerLayout.valuePartsDir).toBe('inline');
    expect(r.innerLayout.valuePartsProven).toBe(3);
    // 真值间距：单位盒左 − 数值盒右 = (x+26) − (x+4+20) = 2（三卡同值才下发）
    expect(r.innerLayout.valuePartsGap).toBe(2);

    // ② 产物侧闭环：stats 必须**在文本列闭合之前**（= 进了 `it` 的文本列，紧接名称下方 ⇒ 天然左对齐）
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    const textsEnd = vue.indexOf('{{ t.t }}</span>');
    const statsStart = vue.indexOf('it.stats.length');
    expect(textsEnd).toBeGreaterThan(-1);
    expect(statsStart).toBeGreaterThan(textsEnd);
    // 旧结构此处**必然**先闭列（`</div>`）⇒ 这两条互为阴性对照
    expect(vue.slice(textsEnd, statsStart)).not.toContain('</div>');
    // 旧结构的横向决定必须消失
    expect(vue).not.toContain('margin-left:auto');
    // 外层：纵排 + 左对齐（不再 `flex-end`、不再 auto 右推）
    expect(vue).toContain('display:flex;flex-direction:column;align-items:flex-start;flex:none;');
    // 数值/单位同行 + baseline（校正 fs20 与 fs12.32 基线差）+ 真值间距
    expect(vue.replace(/\s+/g, '')).toContain(
      'display:flex;flex-direction:row;align-items:baseline;justify-content:center;gap:2px;',
    );
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);
  });

  it('🔴 全 miss 回落（fail-open）：名称配对不上 ⇒ innerDir=null ⇒ **旧结构逐字保留**（margin-left:auto 仍在）', () => {
    // 唯一差别：plan 名称与 Figma 文本**不等**（真机可能因文本归一/改写而失配）。
    // 判据铁律：取不到真值 ⇒ 一个字符都不改；**绝不**按顺序猜。
    const sec: any = listSec(REAL_CARDS, '#a6ceff');
    sec.items.forEach((it: any) => {
      it.content.elements[0].text = `${it.content.elements[0].text}（未匹配）`;
    });
    const idx = indexFigmaNodes(docWith(REAL_CARDS));
    const r: any = detectListLeaf(sec, idx, []);

    expect(r.ok).toBe(true);
    expect(r.innerLayout.innerDir).toBeNull();
    expect(r.innerLayout.innerProven).toBe(0); // 0 票 = 取不到真值（而非「投了但被拦」）
    expect(r.innerLayout.innerConflict).toBe(false);

    // 产物必须**原样**保留旧结构：数值仍在右侧（`margin-left:auto`），且未被搬进文本列
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('margin-left:auto');
    const textsEnd = vue.indexOf('{{ t.t }}</span>');
    const statsStart = vue.indexOf('it.stats.length');
    expect(textsEnd).toBeGreaterThan(-1);
    expect(vue.slice(textsEnd, statsStart)).toContain('</div>');
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);
  });

  it('🔴 文本歧义（≥2 个同名 TEXT）⇒ 配对不唯一 ⇒ 该卡不投票 ⇒ 全段回落（**绝不**按顺序取第一个）', () => {
    // 闸① 的另一半：0 个 = 取不到真值（上一用例）；≥2 个 = **有歧义** —— 二者都必须不投票。
    // 🔴 若把 `hit.length === 1` 放宽成 `>= 1`（「取第一个」），本用例必须失败 ——
    //    「按顺序猜」正是本闸要挡住的形态（图条/装饰文本常与名称同字）。
    const cards = REAL_CARDS.map((c) => JSON.parse(JSON.stringify(c)));
    cards.forEach((c: any, i: number) => {
      c.children.push(text(`${c.id}-ndup`, ['超高车辆', '重型货车', '危化品车'][i], 1000, 1009, 60, 16));
    });
    const idx = indexFigmaNodes(docWith(cards));
    const r: any = detectListLeaf(listSec(cards, '#a6ceff'), idx, []);

    expect(r.ok).toBe(true);
    expect(r.innerLayout.innerDir).toBeNull(); // 三卡名称皆歧义 ⇒ 0 票
    expect(r.innerLayout.innerProven).toBe(0);
    expect(r.innerLayout.innerConflict).toBe(false);
    // 数值/单位配对无歧义 ⇒ 该半条判据照常生效（两道配对各自独立，不互相牵连）
    expect(r.innerLayout.valuePartsDir).toBe('inline');

    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('margin-left:auto'); // 内层不动 ⇒ 旧结构
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);
  });

  it('🔴 多卡不一致（conflict）：一卡横排、两卡纵排 ⇒ innerConflict=true ⇒ 整段不下发 + 回落旧结构', () => {
    // 把第 0 卡改成「名称与数值同行」（真机三卡并非如此）⇒ 投票集合 {inline, stacked} 有两种。
    // 重复成员同构 ⇒ 矛盾即不可证 ⇒ 整段不下发（而不是按多数票强排）。
    const cards = REAL_CARDS.map((c) => JSON.parse(JSON.stringify(c)));
    const x0 = 273.9999694824219;
    moveText(cards[0], '超高车辆', x0 + 4, 1029);
    moveText(cards[0], '19', x0 + 90, 1029);
    moveText(cards[0], '次', x0 + 112, 1030);

    const idx = indexFigmaNodes(docWith(cards));
    const r: any = detectListLeaf(listSec(cards, '#a6ceff'), idx, []);

    expect(r.ok).toBe(true);
    expect(r.innerLayout.innerDir).toBeNull(); // 冲突 ⇒ 不下发
    expect(r.innerLayout.innerConflict).toBe(true); // 但必须**可见**（判据在工作，非故障）
    expect(r.innerLayout.innerProven).toBe(3); // 三卡都投了票

    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('margin-left:auto'); // 回落旧结构
    expect(validateVueSfc(vue, 'ListSection.vue').errors).toEqual([]);
  });
});
