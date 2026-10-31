/**
 * 🛡️ Phase A-1（2026-10-31 治理方案）：section-semantics 结构语义归一层判据。
 *
 * 治理方案 §Phase A：同一语义只在一处识别；下游只读规范结论。
 *  - `canonicalSectionType`：优先级链唯一实现（显式 type > 表格契约 > id 前缀 > 关键词兜底），
 *    词表消费 vision-facts 单一来源；
 *  - `canonicalTableHeaders` / `canonicalHeaderRelation`：vision-facts 薄壳；
 *  - `canonicalListItem` / `canonicalItemStats`：列表项内容归一唯一实现
 *    （统计 5+ 形态收拢；takeover 薄壳引用；collapser 轨无私有统计分支——结构判据防回潮）；
 *  - `isBusinessContent`：header 兜底业务内容判据唯一实现。
 *
 * 迁移纪律：全部实现**逐字迁入**（零行为漂移由既有各刀 spec 全绿证明）；
 * 本 spec 只锁「单一来源 + 跨形态规范结论」。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalSectionType,
  canonicalTableHeaders,
  canonicalHeaderRelation,
  canonicalListItem,
  canonicalItemStats,
  isBusinessContent,
} from '../section-semantics.js';
import { deriveSectionType, declaredTableHeaders } from '../section-type-derive.js';
import { declaredHeaderRelation } from '../vision-facts.js';

const UTILS = join(__dirname, '..');
const readSrc = (rel) => readFileSync(join(UTILS, rel), 'utf8');

describe('Phase A · canonicalSectionType 优先级链（唯一实现）', () => {
  it('显式 type 优先', () => {
    expect(canonicalSectionType({ id: 'x', type: 'header' })).toBe('header');
    expect(canonicalSectionType({ id: 'x', type: 'stats', name: '标题区' })).toBe('stats');
  });

  it('表格契约 > 显式 type（刀5c 裁决）', () => {
    expect(canonicalSectionType({
      id: 'table-section', type: 'tabs',
      body: { headers: ['设备名称', '电量'] },
    })).toBe('table');
  });

  it('id 结构前缀 > 关键词子串（a100e890：footer-summary 不落 stats）', () => {
    expect(canonicalSectionType({ id: 'footer-summary', name: '底部汇总' })).toBe('footer');
  });

  it('内容区小标题不判 header（刀5a 负向表）', () => {
    expect(canonicalSectionType({ id: '2:7959', name: '小标题' })).not.toBe('header');
  });

  it('与 deriveSectionType 结论全等（薄壳 re-export 证明）', () => {
    const samples = [
      { id: 'x', type: 'header' },
      { id: 'footer-summary', name: '底部汇总' },
      { id: 'table-section', type: 'tabs', body: { headers: ['a', 'b'] } },
      { id: 'x', name: '数据统计指标区' },
      { id: 'section-table', name: '设备列表', role: 'table' },
      {},
    ];
    for (const s of samples) {
      expect(canonicalSectionType(s)).toBe(deriveSectionType(s));
    }
  });
});

describe('Phase A · 薄壳同一性（vision-facts 单一来源不复制）', () => {
  it('canonicalTableHeaders ≡ declaredTableHeaders（含按列声明形态）', () => {
    const perColumn = {
      id: '43:4788',
      body: { children: [
        { role: 'table-column', header: '设备名称' },
        { role: 'table-column', header: '电量' },
      ] },
    };
    expect(canonicalTableHeaders(perColumn)).toEqual(declaredTableHeaders(perColumn));
    expect(canonicalTableHeaders(perColumn)).toEqual(['设备名称', '电量']);
    expect(canonicalTableHeaders({})).toBeNull();
  });

  it('canonicalHeaderRelation ≡ declaredHeaderRelation', () => {
    expect(canonicalHeaderRelation({ headerRelation: 'No-Header' })).toBe('no-header');
    expect(canonicalHeaderRelation({})).toBeNull();
    expect(canonicalHeaderRelation({ headerRelation: 'title-itself' }))
      .toBe(declaredHeaderRelation({ headerRelation: 'title-itself' }));
  });
});

describe('Phase A · isBusinessContent（header 兜底业务判据唯一实现）', () => {
  it('顶层 type/role 命中业务词表', () => {
    expect(isBusinessContent({ type: 'stats' })).toBe(true);
    expect(isBusinessContent({ role: 'stat-card' })).toBe(true);
    expect(isBusinessContent({ type: 'header' })).toBe(false);
  });

  it('嵌套 children/items/body 递归命中（4851eedd 闸门同口径）', () => {
    expect(isBusinessContent({
      body: { items: [{ content: { elements: [{ type: 'value', text: '8' }] } }] },
    })).toBe(false); // value 元素不在 isBusinessContent 口径（另有 hasStatValueElement）
    expect(isBusinessContent({ children: [{ type: 'list' }] })).toBe(true);
    expect(isBusinessContent({ items: [{ role: 'list-item' }] })).toBe(true);
    expect(isBusinessContent({ body: { type: 'chart' } })).toBe(true);
  });
});

describe('Phase A · canonicalListItem 统计形态收拢（跨形态规范结论）', () => {
  const els = (v, l) => ({ type: 'value', text: String(v), styles: { fontSize: 18, color: '#0a0' } })
    .valueOf();

  it('形态①：item.stats[] 数组（值/样式真值）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      stats: [
        { value: '100', label: '在线', styles: { fontSize: 18, color: '#52c41a' } },
        { value: '6', label: '离线', styles: { fontSize: 18, color: '#f30' } },
      ],
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['100', '在线'], ['6', '离线']]);
    expect(n.stats[0].vc).toBe('#52c41a');
    expect(n.texts.map((t) => t.t)).toEqual(['甲']);
  });

  it('形态②：stat 对象映射（label 取 unit 真值，不拿键名冒充）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      stat: {
        online: { value: '100', unit: { text: '在线', styles: { fontSize: 12 } }, styles: { fontSize: 24 } },
        offline: { value: '6', unit: { text: '离线', styles: { fontSize: 12 } }, styles: { fontSize: 24 } },
      },
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['100', '在线'], ['6', '离线']]);
  });

  it('形态③：value.parts + offline.parts 顶层对', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      value: { parts: [
        { type: 'number', text: '3,792', styles: { fontSize: 18, color: '#25ce3c' } },
        { type: 'unit', text: '在线', styles: { fontSize: 12, color: '#546881' } },
      ] },
      offline: { parts: [
        { type: 'number', text: '28', styles: { fontSize: 18, color: '#f80' } },
        { type: 'unit', text: '离线', styles: { fontSize: 12, color: '#546881' } },
      ] },
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['3,792', '在线'], ['28', '离线']]);
  });

  it('形态④：value.elements[].parts 容器（769789af；px 字符串字号）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', style: { fontSize: '16px' } }] },
      value: {
        elements: [
          { type: 'value', parts: [
            { text: '128', type: 'number', style: { fontSize: '18px', color: 'rgba(0,180,42,1)' } },
            { text: '在线', type: 'unit', style: { fontSize: '12px' } },
          ] },
          { type: 'value', parts: [
            { text: '6', type: 'number', style: { fontSize: '18px', color: 'rgba(255,0,0,1)' } },
            { text: '离线', type: 'unit', style: { fontSize: '12px' } },
          ] },
        ],
      },
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['128', '在线'], ['6', '离线']]);
    expect(n.stats[0].vfs).toBe(18);
  });

  it('形态④严格性：容器残缺组（无 parts 项）不落 text 兜底', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      value: {
        elements: [
          { type: 'value', parts: [
            { text: '128', type: 'number', style: { fontSize: '18px' } },
            { text: '在线', type: 'unit', style: { fontSize: '12px' } },
          ] },
          { type: 'value', text: '残缺项' },
        ],
      },
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => s.v)).toEqual(['128']);
  });

  it('形态⑤：valueGroup 成对右值区（8200b273）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      valueGroup: { elements: [
        { type: 'value', text: '3,792', styles: { fontSize: 18, color: '#2e1' } },
        { type: 'label', text: '在线', styles: { fontSize: 12 } },
        { type: 'value', text: '• 28', styles: { fontSize: 14, color: '#e43' } },
        { type: 'label', text: '离线', styles: { fontSize: 12 } },
      ] },
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['3,792', '在线'], ['• 28', '离线']]);
  });

  it('形态⑤断组：奇序列整组 fail-open（不交叉错配）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      valueGroup: { elements: [
        { type: 'value', text: '100', styles: { fontSize: 18 } },
        { type: 'label', text: '在线', styles: { fontSize: 12 } },
        { type: 'value', text: '28', styles: { fontSize: 14 } },
      ] },
    };
    expect(canonicalListItem(it).stats).toEqual([]);
  });

  // 🛡️ 形态⑤'（mc-max-1793454777941-85ec897d 真机实锤）：parts 内仅 number、
  //    标签在顶层 unit 字符串——normListPartsStat 旧读法只扫 parts 内部 ⇒ l=""。
  it('形态⑤\'：stats 项 parts 仅 number + 顶层 unit 字符串 ⇒ 标签补位', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: { fontSize: 16 } }] },
      stats: [
        { type: 'value', parts: [{ text: '3,792', type: 'number', styles: { fontSize: 16, color: '#1890ff' } }], unit: '在线' },
        { type: 'value', parts: [{ text: '28', type: 'number', styles: { fontSize: 16, color: '#ff4d4f' } }], unit: '离线' },
      ],
    };
    const n = canonicalListItem(it);
    expect(n.stats.map((s) => [s.v, s.l])).toEqual([['3,792', '在线'], ['28', '离线']]);
    expect(n.stats[0].vc).toBe('#1890ff');
  });

  it('形态⑤\' 变体：顶层 unit 为 {text,styles} 对象 ⇒ 取 text 与样式', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: {} }] },
      stats: [
        { type: 'value', parts: [{ text: '3,792', type: 'number', styles: { fontSize: 16 } }], unit: { text: '在线', styles: { fontSize: 12, color: '#88f' } } },
      ],
    };
    const n = canonicalListItem(it);
    expect(n.stats[0].l).toBe('在线');
    expect(n.stats[0].lc).toBe('#88f');
    expect(n.stats[0].lfs).toBe(12);
  });

  it('形态⑤\' 优先级：parts 内 label 节点优先于顶层 unit（就近事实优先，不双份）', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: {} }] },
      stats: [
        { type: 'value', parts: [
          { text: '3,792', type: 'number', styles: {} },
          { text: 'PartsLabel', type: 'unit', styles: {} },
        ], unit: 'TopString' },
      ],
    };
    expect(canonicalListItem(it).stats[0].l).toBe('PartsLabel');
  });

  it('显式 stats 优先：不与 content.parts/valueGroup 双份追加', () => {
    const it = {
      content: { elements: [
        { type: 'label', text: '甲', styles: { fontSize: 16 } },
        { type: 'value', parts: [
          { type: 'number', text: '9', styles: { fontSize: 12 } },
          { type: 'unit', text: '干扰', styles: { fontSize: 12 } },
        ] },
      ] },
      stats: [{ value: '7', label: '自定义', styles: { fontSize: 16 } }],
      valueGroup: { elements: [
        { type: 'value', text: '1', styles: {} },
        { type: 'label', text: '干扰', styles: {} },
      ] },
    };
    expect(canonicalListItem(it).stats.map((s) => [s.v, s.l])).toEqual([['7', '自定义']]);
  });

  it('canonicalItemStats 派生访问器 ≡ canonicalListItem().stats', () => {
    const it = {
      content: { elements: [{ type: 'label', text: '甲', styles: {} }] },
      stats: [{ value: '7', label: '自定义', styles: {} }],
    };
    expect(canonicalItemStats(it)).toEqual(canonicalListItem(it).stats);
  });
});

describe('Phase A · 结构判据：双轨同源，防私有统计分支回潮', () => {
  it('takeover 薄壳引用 section-semantics（normListItem 家族不再本地定义）', () => {
    const src = readSrc('folded-grid-section-takeover.js');
    expect(src).toMatch(/section-semantics/);
    expect(src).not.toMatch(/function normListItem\(/);
    expect(src).not.toMatch(/function normListText\(/);
    expect(src).not.toMatch(/function normListPartsStat\(/);
    expect(src).not.toMatch(/function normListValueGroupStats\(/);
  });

  it('collapser 轨无私有统计语义分支（唯一允许差异 = E1 几何优先）', () => {
    const src = readSrc('repeated-section-collapser.js');
    expect(src).not.toMatch(/function\s+\w*[Ss]tats?\w*\(/);
    expect(src).not.toMatch(/valueGroup/);
    expect(src).not.toMatch(/canonicalListItem\(/);
  });

  it('header-geometry-fallback 业务判据收拢（本地不再内联 hasBusinessContent 定义）', () => {
    const src = readSrc('header-geometry-fallback.js');
    expect(src).toMatch(/section-semantics/);
    expect(src).not.toMatch(/const hasBusinessContent = /);
  });
});
