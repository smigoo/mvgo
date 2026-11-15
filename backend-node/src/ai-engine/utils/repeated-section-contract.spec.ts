import fs from 'fs';
import { injectRepeatedSectionContract } from './repeated-section-contract.js';
import { extractRichBodyItems, isCollapsedListSection } from './repeated-section-collapser.js';

const REAL_CACHE =
  '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/c-vehicle-monitor-dd4be3be/.mc-gen/cache/vision-cache/vision_1t7Dmmpsl5i0PC8BJt2QLf_2:7952_microcode.json';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** 造一个最小同构卡组：容器 id='grp'，3 张卡，几何证据由参数控制。 */
function mkCase(opts: {
  withRows?: boolean;
  withIso?: boolean;
  shapes?: Array<Array<{ role: string; type: string; text?: string; parts?: any[]; resourceFile?: string }>>;
  heights?: number[];
  collapsed?: boolean;
  nested?: boolean;
} = {}) {
  const els = (i: number, override?: any[]) => [
    { id: `icon-${i}`, role: '装饰', type: 'icon', resourceFile: `../resources/images/icon-${i}.png`, width: 48, height: 48 },
    ...(override || [
      { id: `label-${i}`, role: 'label', type: 'text', text: `标签${i}`, styles: { fontSize: 12, color: 'rgba(51,51,51,0.8)' } },
      {
        id: `value-${i}`, role: 'value', type: 'text', text: `${i} 次`,
        parts: [{ text: String(i), type: 'number', styles: { fontSize: 20, fontWeight: 'bold', color: '#ff0004' } }],
      },
    ]),
  ];
  const kids = [0, 1, 2].map((i) => ({
    id: `card-${i}`,
    name: `卡${i}`,
    geometryPx: { h: opts.heights?.[i] ?? 74 },
    styles: { flexGrow: 0.939, figmaHeightPx: opts.heights?.[i] ?? 74 },
    body: {
      layout: 'vertical',
      backgroundImage: { src: `../resources/images/bg-${i}.png` },
      children: els(i, opts.shapes?.[i]),
    },
  }));
  const grp: any = {
    id: 'grp',
    name: '统计卡组',
    layout: 'horizontal',
    role: 'content-container',
    ...(opts.collapsed ? { collapsed: true } : {}),
    children: kids,
    body: { layout: 'horizontal', children: [] },
  };
  const result: any = {
    layoutStructure: {
      layout: { sections: opts.nested ? [{ id: 'outer', children: [grp] }] : [grp] },
      ...(opts.withRows !== false
        ? { inlineCompositeRows: [{ id: 'grp', name: '统计卡组', layout: 'horizontal', members: ['card-0', 'card-1', 'card-2'] }] }
        : {}),
      ...(opts.withIso
        ? { isoSectionTruth: { sections: [{ id: 'grp', entryCount: 3, declaredGroups: [] }] } }
        : {}),
    },
    analysisFixes: [],
  };
  return { result, grp };
}

describe('S3 同构循环契约注入（vision 出口门禁）', () => {
  it('① 真实 dd4be3be 缓存：2:8023 三卡被补成 v-for 契约，卡面真值完整保留', () => {
    const raw = JSON.parse(fs.readFileSync(REAL_CACHE, 'utf8'));
    const data = clone(raw);
    const rc = injectRepeatedSectionContract(data);

    expect(rc.injected).toBe(1);
    expect(rc.groups[0]).toMatchObject({ id: '2:8023', source: 'inlineCompositeRows', itemCount: 3 });

    const grp = data.layoutStructure.layout.sections.find((s: any) => s.id === '2:8023');
    expect(grp.collapsed).toBe(true);
    expect(grp.renderHint).toBe('v-for');
    expect(grp.itemCount).toBe(3);
    expect(grp.items).toHaveLength(3);
    expect(grp.body.items).toHaveLength(3);
    expect(isCollapsedListSection(grp)).toBe(true);

    // 卡面差异真值（文本 / 数值配色 / 背景 / 图标 / 等宽几何）必须原样进 items
    const a = grp.items[0];
    expect(a.id).toBe('136:129');
    expect(a.label).toBe('危化品车');
    expect(a.value).toBe('51 次');
    expect(JSON.stringify(a.parts)).toContain('#ff0004');
    expect(a.backgroundImage.src).toContain('bg-125.png');
    expect(a.icon.resourceFile).toContain('icon-8036.png');
    expect(a.styles.flexGrow).toBe(0.939);
    expect(a._vforData.texts).toEqual(expect.arrayContaining(['危化品车', '51 次']));
    expect(a._vforData.resourceFiles).toEqual(expect.arrayContaining(['icon-8036.png', 'bg-125.png']));

    const b = grp.items[1];
    expect(b.label).toBe('重型货车');
    expect(JSON.stringify(b.parts)).toContain('#1990ff');
    expect(b.backgroundImage.src).toContain('bg-124.png');
    const c = grp.items[2];
    expect(c.label).toBe('超高车辆');
    expect(JSON.stringify(c.parts)).toContain('#ff7700');

    // 审计与 analysisFixes 同址留痕
    expect(data.repeatContractAudit.injected).toBe(1);
    expect(data.layoutStructure.repeatContractAudit.injected).toBe(1);
    expect(data.layoutStructure.analysisFixes.some((f: any) => f.kind === 'repeatContract')).toBe(true);

    // section 数量/顺序不变（vision-structure-guard 守恒）
    expect(data.layoutStructure.layout.sections.map((s: any) => s.id)).toEqual(
      raw.layoutStructure.layout.sections.map((s: any) => s.id),
    );
  });

  it('② 幂等：第二次调用 injected=0，不重复写 analysisFixes', () => {
    const { result, grp } = mkCase();
    expect(injectRepeatedSectionContract(result).injected).toBe(1);
    const before = JSON.stringify(grp.items);
    const second = injectRepeatedSectionContract(result);
    expect(second.injected).toBe(0);
    expect(second.skipped[0].reason).toBe('alreadyDeclared');
    expect(JSON.stringify(grp.items)).toBe(before);
    expect(result.analysisFixes.filter((f: any) => f.kind === 'repeatContract')).toHaveLength(2); // 审计行每次仍记 0
  });

  it('③ 富卡判据兼容：注入后的 body.items 能被 extractRichBodyItems 认出，且 children 全被 items 引用集吸收', () => {
    const { result, grp } = mkCase();
    injectRepeatedSectionContract(result);
    const rich = extractRichBodyItems(grp);
    expect(rich).not.toBeNull();
    expect(rich).toHaveLength(3);
    const ids = new Set<string>();
    const collect = (v: any) => {
      if (!v || typeof v !== 'object') return;
      if (typeof v.id === 'string') ids.add(v.id);
      for (const val of Object.values(v)) {
        if (Array.isArray(val)) val.forEach(collect);
        else if (val && typeof val === 'object') collect(val);
      }
    };
    rich!.forEach(collect);
    expect(grp.children.every((k: any) => ids.has(String(k.id)))).toBe(true);
  });

  it('④ 无几何证据 → 不注入（fail-open，绝不臆造循环）', () => {
    const { result, grp } = mkCase({ withRows: false, withIso: false });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(0);
    expect(rc.skipped[0].reason).toBe('noGeometricEvidence');
    expect(grp.collapsed).toBeUndefined();
    expect(grp.items).toBeUndefined();
  });

  it('⑤ 只有 isoSectionTruth.entryCount 也能命中，source 记为 isoSectionTruth', () => {
    const { result } = mkCase({ withRows: false, withIso: true });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(1);
    expect(rc.groups[0].source).toBe('isoSectionTruth');
  });

  it('⑥ 异构兄弟（语义 role 序列不同）→ 不注入', () => {
    const { result, grp } = mkCase({
      shapes: [undefined, [{ id: 'x', role: 'title', type: 'text', text: '标题' }], undefined] as any,
    });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(0);
    expect(rc.skipped[0].reason).toBe('heterogeneousShape');
    expect(grp.items).toBeUndefined();
  });

  it('⑦ 高度差异超容差 → 不注入（防把不同规格的卡折成同一模板）', () => {
    const { result } = mkCase({ heights: [74, 74, 140] });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(0);
    expect(rc.skipped[0].reason).toBe('heightMismatch');
  });

  it('⑧ 已有契约（模型自己写了 collapsed）→ 不覆盖，尊重上游声明', () => {
    const { result, grp } = mkCase({ collapsed: true });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(0);
    expect(rc.skipped[0].reason).toBe('alreadyDeclared');
    expect(grp.items).toBeUndefined();
    expect(grp.collapsed).toBe(true);
  });

  it('⑨ 深层递归：嵌套容器内的同构卡组同样能注入', () => {
    const { result, grp } = mkCase({ nested: true });
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(1);
    expect(grp.itemCount).toBe(3);
  });

  it('⑩ 缺参安全：null / 空对象 / 无 sections 不抛错', () => {
    expect(injectRepeatedSectionContract(null as any).injected).toBe(0);
    expect(injectRepeatedSectionContract({}).injected).toBe(0);
    expect(injectRepeatedSectionContract({ layoutStructure: {} }).injected).toBe(0);
    expect(injectRepeatedSectionContract({ layout: { sections: [] } }).injected).toBe(0);
  });

  it('⑪ 非卡形态（子项无 body.children）→ 不注入', () => {
    const base = mkCase();
    for (const k of base.grp.children) k.body.children = [];
    const rc = injectRepeatedSectionContract(base.result);
    expect(rc.injected).toBe(0);
    expect(rc.skipped[0].reason).toBe('notCardLike');
  });

  it('⑫ 实时形态（result.layout.sections，非缓存形态）也能命中', () => {
    const { result, grp } = mkCase();
    result.layout = { sections: [grp] };
    result.layoutStructure.layout.sections = [];
    const rc = injectRepeatedSectionContract(result);
    expect(rc.injected).toBe(1);
    expect(grp.renderHint).toBe('v-for');
  });
});
