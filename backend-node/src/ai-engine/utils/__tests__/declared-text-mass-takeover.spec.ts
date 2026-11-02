/**
 * R6-2 声明内容量守恒对账（2026-11-02 · mc-max-1793605825777-d30d888c 实锤立项）
 *
 * 病灶（R6 判据字段盲区的第四次变异）：同一节点 38:3134，vision 每次输出形态不同——
 *   上次（9e078c6a/f96752c8）声明 `role:"tag"` pill 列表（text 字段）⇒ R6 拦住；
 *   这次（d30d888c）声明 `kids[0]=icon + vendor-card{...}`，**文本载体在
 *   `name`/`value` 字段** ⇒ `itemHasText`（只认 text/texts/characters）判空
 *   ⇒ `declaredUnconsumed=0` ⇒ header:3+icon:1 全接管 ⇒ 三厂商段空壳（每段只剩 1 标题）。
 *
 * R6-2 治本：对账口径从「字段枚举」升维为「**内容量守恒**」——递归收集声明树中全部
 *   文本载体（字符串叶子；键黑名单排除元字段/样式键；值形态过滤排除色值/路径/var），
 *   与形态消费量对账。**不依赖 vision 把字段叫 text 还是 name、角色叫 tag 还是
 *   vendor-card** —— 符合「文本命名无关」硬约束，vision 概率性输出不再绕过。
 *
 * 阳性对照：d30d888c `.checkpoint/analysis.json` 三厂商段声明逐字复刻（当前判据漏放）。
 * 前置断言：每个阳性用例先证「本会命中」（拒绝来自 R6-2 而非检测器自身）—— 防假红/假绿。
 * 变异对照：摘 mass 口径（回退 itemHasText 枚举）⇒ 用例 ①② 必红。
 */
import {
  collectFoldedGridTakeover,
  detectHeaderRowLeaf,
  detectIconLeaf,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });
const bbox = (x, y, w, h) => ({ absoluteBoundingBox: box(x, y, w, h) });

/** Figma 真值（与 declared-unconsumed-takeover.spec 同构）：标题行组 + 2 个纯 icon 统计卡组 */
function makeFigma() {
  return {
    document: {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        {
          id: '9:9',
          name: 'container',
          type: 'GROUP',
          ...bbox(0, 0, 604, 787),
          children: [
            {
              id: '38:3137',
              name: 'vendor-strategy',
              type: 'GROUP',
              ...bbox(0, 0, 604, 120),
              children: [
                { id: '38:3140', name: 'icon', type: 'VECTOR', ...bbox(8, 8, 16, 16), children: [] },
                { id: '38:3141', name: 'title', type: 'TEXT', characters: '战略合作厂商', ...bbox(30, 8, 100, 16), fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 }, opacity: 1 }], style: { fontFamily: 'PingFang SC', fontWeight: 500, fontSize: 16 }, children: [] },
                { id: '38:3142', name: 'pill-row-1', type: 'GROUP', ...bbox(8, 40, 580, 30), children: [] },
              ],
            },
            {
              id: '38:3260',
              name: 'stat-card-1',
              type: 'GROUP',
              ...bbox(0, 130, 265, 76),
              children: [
                { id: '38:3261', name: 'bg', type: 'RECTANGLE', ...bbox(0, 130, 265, 76), children: [] },
                { id: '187:262', name: 'icon', type: 'VECTOR', ...bbox(10, 140, 53, 55), children: [] },
              ],
            },
          ],
        },
      ],
    },
  };
}

const MAPPING = [
  { figmaNodeId: '38:3140', resourceFile: 'resources/images/icon-title.png', downloadStatus: 'ok', assignedVarName: 'iconTitle' },
  { figmaNodeId: '187:262', resourceFile: 'resources/images/icon-stat.png', downloadStatus: 'ok', assignedVarName: 'iconStat' },
];

/**
 * d30d888c 厂商段声明形态逐字复刻：kids[0]=icon + vendor-card 文本在 name/value
 * （旧 itemHasText 只认 text/texts/characters ⇒ textBearing=0 ⇒ 放行 ⇒ 空壳）。
 */
const VENDOR_SECTION = {
  id: '38:3137',
  name: '战略合作厂商',
  layout: 'grid',
  body: {
    children: [
      { id: '38:3137-icon', type: 'icon', resourceFile: '../resources/images/icon-3160.png', width: 16, height: 16 },
      { id: '38:3137-item1', type: 'vendor-card', name: '华为技术', value: '8台', repeatedFill: '#F0F0F0', styles: { fontSize: 13, color: 'rgba(51,51,51,1)' } },
      { id: '38:3137-item2', type: 'vendor-card', name: '中兴通讯', value: '8台', repeatedFill: '#F0F0F0' },
    ],
  },
};

/**
 * d30d888c 统计段声明形态：2 张 stat-card **包在一层 wrapper 里深层嵌套**
 * （items.length=1 ⇒ 旧 icon 口径 items-1=0 放行；name/value 埋在两层 children 下）。
 */
const STATS_SECTION = {
  id: '38:3260',
  name: '顶部统计区',
  layout: 'grid',
  body: {
    children: [
      {
        id: '38:3260-wrap', type: 'group', layout: 'horizontal',
        children: [
          {
            id: '38:3260-stat1', name: '合作厂商', role: 'stat-card', layout: 'horizontal',
            children: [
              { type: 'icon', resourceFile: '../resources/images/icon-262.png' },
              { type: 'group', layout: 'vertical', children: [
                { type: 'text', name: '合作厂商' },
                { type: 'text', value: '33' },
              ] },
            ],
          },
          {
            id: '38:3260-stat2', name: '在线设备', role: 'stat-card', layout: 'horizontal',
            children: [
              { type: 'icon', resourceFile: '../resources/images/icon-262.png' },
              { type: 'group', layout: 'vertical', children: [
                { type: 'text', name: '在线设备' },
                { type: 'text', value: '66' },
              ] },
            ],
          },
        ],
      },
    ],
  },
};

function evalSec(sec) {
  return collectFoldedGridTakeover({
    treeSections: [sec],
    figmaNodeData: makeFigma(),
    resourceMapping: MAPPING,
    componentName: 'c-demo',
  });
}

describe('R6-2 声明内容量守恒对账（name/value 载体不被漏放）', () => {
  it('① d30d888c 复刻：vendor-card 文本在 name/value ⇒ header 接管被拒（declaredUnconsumed≥1）', () => {
    const fi = indexFigmaNodes(makeFigma().document);
    // 前置：确认「本会命中」—— 拒绝来自 R6-2 而非检测器自身
    expect(detectHeaderRowLeaf(VENDOR_SECTION, fi, MAPPING).ok).toBe(true);
    const r = evalSec(VENDOR_SECTION);
    expect(r.declaredUnconsumed).toBeGreaterThanOrEqual(1);
    expect(r.map.size).toBe(0); // 未落地任何接管组件 ⇒ 回退 LLM
    expect(r.skipped.some((s) => String(s.reason).includes('declaredUnconsumed'))).toBe(true);
  });

  it('② d30d888c 复刻：stat-card 深层嵌套 name/value ⇒ icon 接管被拒', () => {
    const fi = indexFigmaNodes(makeFigma().document);
    // 前置：icon 本会命中（items.length=1 ⇒ 旧口径 items-1=0 放行 = 病灶）
    expect(detectIconLeaf(STATS_SECTION, fi, MAPPING).ok).toBe(true);
    const r = evalSec(STATS_SECTION);
    expect(r.declaredUnconsumed).toBeGreaterThanOrEqual(1);
    expect(r.map.size).toBe(0);
  });

  it('③ 回归保护：真标题行（单 text item）header 照常命中不被误拒', () => {
    const sec = {
      id: '38:3137', name: '标题行',
      body: { children: [{ id: '38:3141', text: '设备详情' }] },
    };
    const r = evalSec(sec);
    expect(r.declaredUnconsumed).toBe(0);
    expect(r.headerHits).toBe(1);
    expect(r.map.size).toBe(1);
  });

  it('④ 回归保护：无声明 kids ⇒ fail-open 零对账（既有行为逐字不变）', () => {
    const r = evalSec({ id: '38:3137', name: '纯子树段' });
    expect(r.declaredUnconsumed).toBe(0);
    expect(r.headerHits).toBe(1); // 判据本身照常命中
    expect(r.map.size).toBe(1);
  });

  it('⑤ 值形态过滤：色值/路径/var() 不计入文本量（防 styles 泄漏误拒）', () => {
    const sec = {
      id: '38:3137', name: '健康段',
      body: { children: [
        { id: '38:3141', text: '真标题', color: 'rgba(51,51,51,1)', bg: '#F0F0F0', icon: './a.png' },
      ] },
    };
    const r = evalSec(sec);
    expect(r.declaredUnconsumed).toBe(0);
    expect(r.headerHits).toBe(1);
    expect(r.map.size).toBe(1);
  });

  it('⑥ 计数行恒在（0 也必须出现）', () => {
    const r = evalSec({ id: '38:3260' });
    expect('declaredUnconsumed' in r).toBe(true);
  });
});
