/**
 * 🛡️ Phase D1（2026-10-31 治理方案）：vision 出口契约审计（观测）单测。
 *
 * 治理方案 §Phase D：形态漏网在管线最前段暴露。定位（评审修订）：
 * **既有 7 成员审计家族的新成员**，输出契约对齐 `{ evaluated, missing, conflicts }`；
 * 调用方只记日志 + 写 checkpoint，**不阻断**（软阻断两周后按数据决定）。
 *
 * 回放判据（2026-10-31 实测修正）：当天 4 单（4851eedd/a100e890/769789af/40b65d9f）
 * 的 vision 出口结构**全部健康**（缺陷在下游装配/接管层，Phase B 已修）——
 * 故 4 单形态回放判据 = **audit 零 missing（不误报健康 vision）**；
 * 每个检查项的「能标出缺失」由注入病灶的阴性 fixture 证明。
 */
import {
  auditVisionContract,
  CONTRACT_AUDIT_CHECKS,
} from '../vision-contract-audit.js';

// ─────────────────────────────────────────────────────────────────────────────
// 真实形态（自 4 单 checkpoint visual.json 最小化，字段逐字保真）
// ─────────────────────────────────────────────────────────────────────────────

/** 4851eedd：设备统计段（content.elements value+label，hR=no-header） */
const STAT_ELEMENTS_SEC = {
  id: '43:4890',
  name: '设备统计',
  role: '常驻',
  headerRelation: 'no-header',
  body: {
    layout: 'horizontal-3-columns',
    items: [
      {
        id: '43:4893', name: '总设备', layout: 'horizontal',
        content: { layout: 'horizontal', elements: [
          { type: 'value', text: '8', styles: { fontSize: 28, color: 'rgba(57,101,255,1)' } },
          { type: 'label', text: '总设备', styles: { fontSize: 14 } },
        ] },
      },
    ],
  },
};

/** a100e890：节点列表段（item.stats[]） */
const LIST_STATS_SEC = {
  id: '48:5798',
  name: '节点列表',
  headerRelation: 'content-below-title',
  body: {
    layout: 'vertical',
    items: [
      {
        id: '48:5799', layout: 'horizontal',
        content: { elements: [
          { type: 'label', text: '节点A', styles: { fontSize: 16 } },
        ] },
        stats: [
          { value: '100', label: '在线', styles: { fontSize: 16, color: '#52c41a' } },
          { value: '6', label: '离线', styles: { fontSize: 16, color: '#ff7300' } },
        ],
      },
    ],
  },
};

/** a100e890：footer 段（children text，hR=no-header） */
const FOOTER_SEC = {
  id: 'footer-summary',
  name: '底部汇总',
  role: '常驻',
  headerRelation: 'no-header',
  body: {
    children: [
      { id: 'footer-1', role: 'text', text: '共 6 个节点', styles: { fontSize: 14 } },
      { id: 'footer-2', role: 'text', text: '接入设备 10810', styles: { fontSize: 14 } },
    ],
  },
};

/** 40b65d9f：按列声明表格段 */
const TABLE_COLUMN_SEC = {
  id: '43:4788',
  name: '设备列表',
  headerRelation: 'content-below-title',
  body: {
    children: [
      { id: 'a', role: 'table-column', header: '设备名称', styles: { fontSize: 14 } },
      { id: 'b', role: 'table-column', header: '电量', styles: { fontSize: 14 } },
    ],
  },
};

const mkParsed = (sections) => ({ layoutStructure: { layout: { sections } } });

const codesOf = (r) => r.missing.map((m) => m.code);

describe('Phase D1 · vision-contract-audit 输出契约（对齐审计家族）', () => {
  it('输出 { evaluated, missing, conflicts }，evaluated 含段数与检查项清单', () => {
    const r = auditVisionContract(mkParsed([STAT_ELEMENTS_SEC]));
    expect(Object.keys(r).sort()).toEqual(['conflicts', 'evaluated', 'missing']);
    expect(r.evaluated.sections).toBe(1);
    expect(Array.isArray(r.evaluated.checks)).toBe(true);
    expect(r.evaluated.checks).toEqual(CONTRACT_AUDIT_CHECKS);
    expect(Array.isArray(r.missing)).toBe(true);
    expect(Array.isArray(r.conflicts)).toBe(true);
  });

  it('空/畸形输入 fail-open：零 missing 不抛错', () => {
    for (const input of [null, undefined, {}, { layoutStructure: {} }, { layoutStructure: { layout: {} } }]) {
      const r = auditVisionContract(input);
      expect(r.missing).toEqual([]);
      expect(r.conflicts).toEqual([]);
    }
  });
});

describe('Phase D1 · 回放判据：4 单真实形态 ⇒ 健康 vision 零 missing（不误报）', () => {
  it('4851eedd 形态（统计段 hR=no-header）⇒ 零 missing', () => {
    const r = auditVisionContract(mkParsed([STAT_ELEMENTS_SEC]));
    expect(r.missing).toEqual([]);
    expect(r.evaluated.sections).toBe(1);
  });

  it('a100e890 形态（列表 stats[] + footer text children + 全段 hR 声明）⇒ 零 missing', () => {
    const r = auditVisionContract(mkParsed([LIST_STATS_SEC, FOOTER_SEC]));
    expect(r.missing).toEqual([]);
  });

  it('40b65d9f 形态（按列声明表头）⇒ 零 missing（表头契约认按列形态）', () => {
    const r = auditVisionContract(mkParsed([TABLE_COLUMN_SEC]));
    expect(r.missing).toEqual([]);
  });

  it('4 单合流（真实段集合）⇒ 零 missing（缺陷在下游，出口全健康）', () => {
    const r = auditVisionContract(mkParsed([
      STAT_ELEMENTS_SEC, LIST_STATS_SEC, FOOTER_SEC, TABLE_COLUMN_SEC,
    ]));
    expect(r.missing).toEqual([]);
    expect(r.evaluated.sections).toBe(4);
  });
});

describe('Phase D1 · 检查项判据：注入病灶 ⇒ 精确标出（先红能力证明）', () => {
  it('病灶①：段无 type/role/control/语义 id/关键词名 ⇒ section-type-undecidable', () => {
    const r = auditVisionContract(mkParsed([
      { id: '43:9999', name: '神秘区块', body: { children: [] } },
    ]));
    expect(codesOf(r)).toContain('section-type-undecidable');
    const entry = r.missing.find((m) => m.code === 'section-type-undecidable');
    expect(entry.id).toBe('43:9999');
  });

  it('病灶②：段缺 headerRelation 声明 ⇒ header-relation-missing', () => {
    const sec = clone(STAT_ELEMENTS_SEC);
    delete sec.headerRelation;
    const r = auditVisionContract(mkParsed([sec]));
    expect(codesOf(r)).toContain('header-relation-missing');
  });

  it('病灶③：valueGroup 值/标签序列断组（奇数个）⇒ stats-pairing-broken', () => {
    const sec = {
      id: '48:5798', name: '节点列表', headerRelation: 'content-below-title',
      body: { items: [{
        id: 'it0', layout: 'horizontal',
        valueGroup: { elements: [
          { type: 'value', text: '100', styles: { fontSize: 18 } },
          { type: 'label', text: '在线', styles: { fontSize: 12 } },
          { type: 'value', text: '28', styles: { fontSize: 14 } },
          // 缺配对 label ⇒ 断组
        ] },
      }] },
    };
    const r = auditVisionContract(mkParsed([sec]));
    expect(codesOf(r)).toContain('stats-pairing-broken');
  });

  it('病灶④：表格语义段无表头契约 ⇒ table-headers-missing', () => {
    const sec = {
      id: '43:4788', name: '设备列表', headerRelation: 'content-below-title',
      body: { children: [
        { id: 'a', role: 'table-column', styles: { fontSize: 14 } },
        { id: 'b', role: 'table-column', styles: { fontSize: 14 } },
      ] },
    };
    const r = auditVisionContract(mkParsed([sec]));
    expect(codesOf(r)).toContain('table-headers-missing');
  });

  it('病灶⑤：数值元素无样式真值 ⇒ text-style-missing（带计数）', () => {
    const sec = {
      id: '43:4890', name: '设备统计', headerRelation: 'no-header',
      body: { items: [{
        id: 'it0', layout: 'horizontal',
        content: { elements: [
          { type: 'value', text: '8' }, // 无 styles/style
          { type: 'label', text: '总设备', styles: { fontSize: 14 } },
        ] },
      }] },
    };
    const r = auditVisionContract(mkParsed([sec]));
    expect(codesOf(r)).toContain('text-style-missing');
    const entry = r.missing.find((m) => m.code === 'text-style-missing');
    expect(entry.count).toBeGreaterThanOrEqual(1);
  });

  it('病灶⑥：显式 type=table 但无任何表头契约 ⇒ table-headers-missing', () => {
    const r = auditVisionContract(mkParsed([
      { id: 'x', type: 'table', headerRelation: 'no-header', body: { children: [] } },
    ]));
    expect(codesOf(r)).toContain('table-headers-missing');
  });

  it('阴性：stats 数组项残缺（无 value）⇒ stats-pairing-broken 但不抛错不误伤其他段', () => {
    const bad = {
      id: '48:5798', name: '节点列表', headerRelation: 'content-below-title',
      body: { items: [{ id: 'it0', stats: [{ label: '在线', styles: { fontSize: 16 } }] }] },
    };
    const r = auditVisionContract(mkParsed([bad, clone(STAT_ELEMENTS_SEC)]));
    expect(codesOf(r)).toContain('stats-pairing-broken');
    // 缺失项只挂病灶段，不误挂健康段
    const pairing = r.missing.filter((m) => m.code === 'stats-pairing-broken');
    expect(pairing.every((m) => m.id === '48:5798')).toBe(true);
  });

  // 🛡️ 真机修正判据（mc-max-1793452481019 实锤）：parser 内部挂载点的 parsed 就是
  //   layoutStructure 形态——旧 extractSections 在无 .layoutStructure 键时提前 return []
  //   ⇒ 在线 audit 空转（sections=0、missing=0 假健康）。两种形态都必须评测到 sections。
  it('挂载位置兼容：parsed=layoutStructure 形态（无 .layoutStructure 键）也能评测到 sections', () => {
    const inner = {
      generatedAt: 'x', componentName: 'c',
      layout: { type: 'root', direction: 'column', sections: [clone(STAT_ELEMENTS_SEC)] },
    };
    const r = auditVisionContract(inner);
    expect(r.evaluated.sections).toBe(1);
    // 顶层 result 形态（.layoutStructure.layout.sections）回归不变
    const r2 = auditVisionContract({ layoutStructure: inner });
    expect(r2.evaluated.sections).toBe(1);
  });

  // 🛡️ 真机修正判据（mc-max-1793454777941-85ec897d 实锤）：vision id 幻觉——
  //    「底部统计」段及 children 全部错标 48:5890（与「面板标题栏」同 id）⇒
  //    刀53 icon 接管按 id 回查解析到标题线节点 ⇒ footer 段被渲染成 2px 分隔线，
  //    「共 6 个节点 / 接入设备 10810」全丢。id 唯一性是全链按 id 回查机制的前提，
  //    冲突属「vision 事实自相矛盾」⇒ 记 conflicts（非 missing）。
  it('section-id-uniqueness：顶层段 id 重复 ⇒ conflicts 精确报出（85ec897d 形态注入）', () => {
    const dupA = { id: '48:5890', name: '面板标题栏', type: 'header', headerRelation: 'title-itself' };
    const dupB = { id: '48:5890', name: '底部统计', type: 'footer', headerRelation: 'no-header' };
    const ok = { id: '48:5798', name: '节点卡片列表', type: 'list', headerRelation: 'no-header' };
    const r = auditVisionContract(mkParsed([dupA, ok, dupB]));
    const idConfs = r.conflicts.filter((c) => c.code === 'section-id-uniqueness');
    expect(idConfs.length).toBe(1);
    expect(idConfs[0].id).toBe('48:5890');
    expect(idConfs[0].count).toBe(2);
    expect(idConfs[0].names).toEqual(['面板标题栏', '底部统计']);
  });

  it('section-id-uniqueness：id 唯一不报；空 id 不参与冲突计数', () => {
    const a = { id: '48:1', name: 'A', type: 'header', headerRelation: 'title-itself' };
    const b = { id: '48:2', name: 'B', type: 'list', headerRelation: 'no-header' };
    const noId = { name: 'NoId', type: 'chart', headerRelation: 'no-header' };
    for (const secs of [[a, b], [a, noId], [noId, clone(noId)]]) {
      const r = auditVisionContract(mkParsed(secs));
      expect(r.conflicts.filter((c) => c.code === 'section-id-uniqueness')).toEqual([]);
    }
  });
});

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
