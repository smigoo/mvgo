/**
 * 🛡️ Phase C（2026-10-31 治理方案）：vision 形态回归库 + 标签扰动测试。
 *
 * 治理方案 §Phase C：
 *  - 每次真机事故的 vision 形态固化为 fixture（`__fixtures__/vision-forms/`，
 *    按语义命名、记录来源任务，**单一来源目录**）；
 *  - 判据必须在所有已知形态 + 任意标签扰动下结论一致（或显式 fail-open），
 *    禁止静默产出空壳；
 *  - 分工（评审定界）：跨形态不变量 + 扰动一致性归本 spec；
 *    单形态具体数值断言（vfs/vc/cardH/gaps 等）留各刀 spec，不迁移不复写。
 *
 * 消费者口径：fixture 经其语义的**公共消费者**跑真实判据
 *（declaredTableHeaders / deriveSectionType / detectListLeaf /
 *  applyHeaderGeometryFallback / footerGeometryRecoveryAllowed），
 * 不另写影子实现。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSectionType, declaredTableHeaders } from '../section-type-derive.js';
import { footerGeometryRecoveryAllowed } from '../vision-facts.js';
import { detectListLeaf } from '../folded-grid-section-takeover.js';
import { applyHeaderGeometryFallback } from '../header-geometry-fallback.js';
import { indexFigmaNodes } from '../section-tree.js';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'vision-forms');

/** 共享最小 figma 树（与 folded-grid-list-takeover.spec 同款几何：卡 72 / 间距 20 / 左内距 20） */
const FIGMA = {
  id: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  children: [
    { id: '10:2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 72 }, children: [
      { id: '10:3', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 16, width: 40, height: 40 }, children: [] },
    ] },
    { id: '10:5', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 92, width: 400, height: 72 }, children: [
      { id: '10:6', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 108, width: 40, height: 40 }, children: [] },
    ] },
  ],
};
const FIGMA_INDEX = indexFigmaNodes(FIGMA);

// ─────────────────────────────────────────────────────────────────────────────
// 深工具
// ─────────────────────────────────────────────────────────────────────────────

const clone = <T,>(o: T): T => (o === undefined ? o : JSON.parse(JSON.stringify(o)));

/** 断言 expect 中的每个键都等于 actual 的对应值（子集匹配；undefined 键跳过）。 */
function subsetMatch(actual: any, expect: Record<string, any>): string | null {
  for (const [k, v] of Object.entries(expect)) {
    if (JSON.stringify(actual?.[k]) !== JSON.stringify(v)) {
      return `key "${k}": expected ${JSON.stringify(v)}, got ${JSON.stringify(actual?.[k])}`;
    }
  }
  return null;
}

/** 深删除所有 `role` 键（标签扰动：删 role）。 */
function deleteRole(o: any): void {
  if (Array.isArray(o)) { o.forEach(deleteRole); return; }
  if (o && typeof o === 'object') {
    delete o.role;
    Object.values(o).forEach(deleteRole);
  }
}

/** 顶层 section.type 置 null（标签扰动：type 发言置空）。 */
function typeNullTop(o: any): void {
  if (Array.isArray(o)) { typeNullTop(o[0]); return; }
  if (o && typeof o === 'object') o.type = null;
}

/** 深互换 `styles` ↔ `style` 键（标签扰动：样式载体键名漂移）。 */
function swapStyleKeys(o: any): void {
  if (Array.isArray(o)) { o.forEach(swapStyleKeys); return; }
  if (o && typeof o === 'object') {
    if ('styles' in o && !('style' in o)) { o.style = o.styles; delete o.styles; }
    else if ('style' in o && !('styles' in o)) { o.styles = o.style; delete o.style; }
    Object.values(o).forEach(swapStyleKeys);
  }
}

/** 深互换 `items` ↔ `children` 键（标签扰动：容器键名漂移）。 */
function swapItemKeys(o: any): void {
  if (Array.isArray(o)) { o.forEach(swapItemKeys); return; }
  if (o && typeof o === 'object') {
    if ('items' in o && !('children' in o)) { o.children = o.items; delete o.items; }
    else if ('children' in o && !('items' in o)) { o.items = o.children; delete o.children; }
    Object.values(o).forEach(swapItemKeys);
  }
}

/** 顶层 id 换成纯数字 id（标签扰动：语义 id → 数字 id，可能摧毁唯一证据载体）。 */
function idToNumeric(o: any): void {
  const sec = Array.isArray(o) ? o[0] : o;
  if (sec && typeof sec === 'object') sec.id = '43:9999';
}

const PERTURB_OPS: Record<string, (o: any) => void> = {
  deleteRole,
  typeNullTop,
  stylesToStyle: swapStyleKeys,
  itemsToChildren: swapItemKeys,
  idToNumeric,
};

// ─────────────────────────────────────────────────────────────────────────────
// 消费者 harness（kind → 结论提取；真实公共消费者，零影子实现）
// ─────────────────────────────────────────────────────────────────────────────

function runConsumer(kind: string, form: any): Record<string, any> {
  switch (kind) {
    case 'table-headers':
      return { headers: declaredTableHeaders(form), sectionType: deriveSectionType(form) };
    case 'semantic-table-section':
      return { headers: declaredTableHeaders(form), sectionType: deriveSectionType(form) };
    case 'semantic-footer':
      return {
        sectionType: deriveSectionType(form),
        recoveryAllowed: footerGeometryRecoveryAllowed(form),
      };
    case 'stat-right-value': {
      const r: any = detectListLeaf(form, FIGMA_INDEX);
      const it0 = r?.items?.[0] || {};
      return {
        ok: r?.ok === true,
        statsV: (it0.stats || []).map((s: any) => s.v),
        statsL: (it0.stats || []).map((s: any) => s.l),
        texts: (it0.texts || []).map((t: any) => t.t),
      };
    }
    case 'header-fallback': {
      const sections = clone(form);
      const hit: any = applyHeaderGeometryFallback(sections);
      return {
        hit: !!hit,
        hitId: hit?.id ?? null,
        firstSectionType: sections[0]?.type ?? null,
      };
    }
    default:
      throw new Error(`vision-forms: 未知 kind "${kind}"（需要登记 harness）`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 套件
// ─────────────────────────────────────────────────────────────────────────────

const fixtureFiles = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();

describe(`vision 形态回归库（${fixtureFiles.length} 形态）· 形态断言`, () => {
  it('fixture 库规模 ≥ 10（治理方案首批门槛）', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of fixtureFiles) {
    const fx = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));

    it(`[${fx.id}]（${fx.source}）⇒ 结论与记录一致`, () => {
      const actual = runConsumer(fx.kind, clone(fx.form));
      const mismatch = subsetMatch(actual, fx.expect);
      expect(mismatch).toBeNull();
    });
  }
});

describe('vision 形态回归库 · 标签扰动断言', () => {
  for (const file of fixtureFiles) {
    const fx = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));
    const ops = fx.perturbations || [];

    it(`[${fx.id}] ${ops.length} 个扰动`, () => {
      if (ops.length === 0) return; // 语义即标签的 fixture（如 header-relation）允许零扰动

      let mutated = 0;
      const failures: string[] = [];
      for (const p of ops) {
        const op = PERTURB_OPS[p.op];
        if (!op) { failures.push(`未知扰动算子 "${p.op}"`); continue; }
        const before = JSON.stringify(fx.form);
        const perturbed = clone(fx.form);
        op(perturbed);
        // 空扰动 = 假覆盖：算子没改到任何键 ⇒ fixture 的扰动声明失真，必须修 fixture
        if (JSON.stringify(perturbed) === before) continue;
        mutated++;
        const actual = runConsumer(fx.kind, perturbed);
        const mismatch = subsetMatch(actual, p.expect);
        if (mismatch) failures.push(`${p.op}: ${mismatch}${p.knownGap ? `（knownGap: ${p.knownGap}）` : ''}`);
      }
      // 至少 1 个扰动真实生效（全空 ⇒ 扰动列表失真）
      expect(mutated).toBeGreaterThanOrEqual(1);
      expect(failures).toEqual([]);
    });
  }
});

describe('vision 形态回归库 · 跨形态不变量（同一语义 N 形态 ⇒ 同一结论）', () => {
  const load = (id: string) =>
    JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), 'utf8'));

  it('表格语义 5 形态 ⇒ declaredTableHeaders 与 sectionType 结论同构', () => {
    const ids = [
      'table-headers-inline',
      'table-headers-tablestyle',
      'table-headers-body',
      'table-column-headers',
      'semantic-table-section-tabs',
    ];
    const conclusions = ids.map((id) => {
      const fx = load(id);
      const c = runConsumer('table-headers', clone(fx.form));
      return { id, sectionType: c.sectionType, headers: c.headers };
    });
    for (const c of conclusions) {
      expect(c.sectionType).toBe('table');
      expect(Array.isArray(c.headers)).toBe(true);
      expect(c.headers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('统计右值语义 4 形态 ⇒ detectListLeaf 全接管、stats 双条、texts 不混数值', () => {
    const ids = ['stat-stats-array', 'stat-valuegroup-pairs', 'stat-value-parts', 'stat-value-elements-parts', 'stat-parts-unit-top-string'];
    for (const id of ids) {
      const fx = load(id);
      const c = runConsumer('stat-right-value', clone(fx.form));
      const mismatch = subsetMatch(c, {
        ok: true,
        statsV: fx.expect.statsV,
        statsL: fx.expect.statsL,
        texts: fx.expect.texts,
      });
      if (mismatch) throw new Error(`${id}: ${mismatch}`);
      // 数值不得混进 texts 纵堆（跨形态共性：texts 只收 content 标签）
      for (const v of fx.expect.statsV) {
        expect(fx.expect.texts).not.toContain(v);
      }
    }
  });
});
