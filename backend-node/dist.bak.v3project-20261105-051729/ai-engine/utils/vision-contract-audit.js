/**
 * 🛡️ vision-contract-audit —— vision 出口契约审计（Phase D1，2026-10-31 治理方案）。
 *
 * 治理方案 §Phase D（评审修订版）定案：
 *  - 定位：**既有 vision 审计家族（7 成员）的新成员**，挂在 visual-parser 出口链；
 *    输出契约对齐家族的 `{ evaluated, missing, conflicts }`，不另起体系。
 *  - 纪律：**只观测、不阻断** —— 调用方只记日志 + 写 `.checkpoint/contract-audit.json`；
 *    软阻断两周后按 missing 率数据决定（D2 prompt 增补独立成步，禁与本模块同批）。
 *  - 边界：只审「vision 出口结构完整性」，不猜语义（语义判定归 vision-facts /
 *    section-semantics）；不与 anchor / coverage / textTruth 审计重复报同一事实。
 *
 * 检查项（CONTRACT_AUDIT_CHECKS，判据全部来自真机形态库 vision-forms/）：
 *  1. section-type-undecidable   顶层段类型不可判定（无 type/role/control/语义 id/关键词）
 *  2. header-relation-missing    顶层段未声明 headerRelation（兜底协议的「沉默」前提）
 *  3. stats-pairing-broken       统计值/标签断组（valueGroup 奇序列 / stats 缺 value /
 *                                parts 缺 number）
 *  4. table-headers-missing      表格语义段无 ≥2 列完整表头契约（认 vision-facts
 *                                全部 4 形态，含按列声明）
 *  5. text-style-missing         数值/文本元素无样式真值（styles/style 双载体都不在）
 *
 * 回放基线（2026-10-31 实测）：当天 4 单真机 vision 出口全部健康 ⇒ audit 零 missing；
 * 各检查项的「能标出缺失」由 spec 注入病灶证明。误报率验收（<5%）跑存量 checkpoint 抽样。
 *
 * 纯函数、零副作用（不 import logger / fs），单测直测；fail-open：畸形输入返回零 missing。
 */
import { deriveSectionType, declaredTableHeaders } from './section-type-derive.js';
import {
  declaredHeaderRelation,
  declaredRole,
  declaredControl,
} from './vision-facts.js';

/** 审计检查项清单（随 evaluated.checks 输出，观测数据按 code 聚合） */
export const CONTRACT_AUDIT_CHECKS = [
  'section-type-undecidable',
  'header-relation-missing',
  'stats-pairing-broken',
  'table-headers-missing',
  'text-style-missing',
  'section-id-uniqueness',
];

/** 从 vision 解析产物提取顶层段（兼容 visual-parser 各期挂载位置）。 */
function extractSections(parsed) {
  // 🛡️ 真机修正（mc-max-1793452481019 实锤）：parser 内部挂载点的 parsed 就是
  //   layoutStructure 形态（无 .layoutStructure 键）——旧实现此处提前 return []
  //   导致候选 3（parsed.layout.sections）是死代码，audit 空转（sections=0、
  //   missing=0 假健康）。四种挂载位置先全部探测、再取首个数组。
  const ls = parsed?.layoutStructure;
  const candidates = [
    ls?.layout?.sections,
    ls?.sections,
    parsed?.layout?.sections,
    parsed?.sections,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((s) => s && typeof s === 'object');
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查 1：类型可判定
// ─────────────────────────────────────────────────────────────────────────────

function checkTypeDecidable(sec) {
  if (deriveSectionType(sec)) return true;
  if (declaredRole(sec)) return true;
  if (declaredControl(sec)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查 3：统计值/标签成组
// ─────────────────────────────────────────────────────────────────────────────

/**
 * value+label 组完整性（观测口径 = 数量对等）：
 * 真机 vision 既有 value,label,value,label 交替（8200b273），也有 label 先组、
 * value 后组（26eb1c1e 等 R25-a 同款文案序）——两种都是合法形态；
 * 只有「值/标签数量不等」（断组、缺配对）才算病灶。配对解析归下游归一器。
 */
function isGroupedValueLabelComplete(els) {
  if (!Array.isArray(els) || els.length === 0) return true; // 非本轨
  let values = 0;
  let labels = 0;
  for (const e of els) {
    const t = String(e?.type || '').toLowerCase();
    if (t === 'value') values++;
    else if (t === 'label') labels++;
  }
  if (values === 0) return true; // 无统计语义，非本轨
  return values === labels && labels >= 1;
}

/** parts 轨：至少一个 number 部件。 */
function partsHaveNumber(entry) {
  const parts = Array.isArray(entry?.parts) ? entry.parts : [];
  return parts.some((p) => String(p?.type || '').toLowerCase() === 'number');
}

/** stats[] 轨：每项要有值载体（value / text（刀26 形态）/ parts≥number）与 label。 */
function statsEntriesWellFormed(entries) {
  return entries.every((s) => {
    const nonEmpty = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    const hasCarrier =
      nonEmpty(s?.value) || nonEmpty(s?.text) || Array.isArray(s?.parts);
    const partsOk = Array.isArray(s?.parts) ? partsHaveNumber(s) : true;
    const hasLabel = nonEmpty(s?.label);
    return hasCarrier && partsOk && hasLabel;
  });
}

/**
 * 段内统计成组审计。只对「确有统计载体」的段判；
 * 返回 null = 无统计载体（不适用），字符串 = 病灶描述。
 */
function checkStatsPairing(sec) {
  const items = [
    ...(Array.isArray(sec?.body?.items) ? sec.body.items : []),
    ...(Array.isArray(sec?.items) ? sec.items : []),
  ].filter((it) => it && typeof it === 'object');

  for (const it of items) {
    if (Array.isArray(it?.stats)) {
      if (!statsEntriesWellFormed(it.stats)) return `item "${it.id || '?'}" stats[] 项缺 value/label`;
      continue;
    }
    if (it?.valueGroup && Array.isArray(it.valueGroup.elements)) {
      if (!isGroupedValueLabelComplete(it.valueGroup.elements)) {
        return `item "${it.id || '?'}" valueGroup.elements 值/标签断组`;
      }
      continue;
    }
    if (it?.value && typeof it.value === 'object') {
      // 形态③/④：parts 或 elements[].parts（严格只认 parts 项，与接管器同口径）
      const els = Array.isArray(it.value.elements) ? it.value.elements : null;
      if (els) {
        const bad = els.filter((e) => Array.isArray(e?.parts) && !partsHaveNumber(e));
        if (bad.length > 0) return `item "${it.id || '?'}" value.elements[] 有 parts 无 number`;
      } else if (Array.isArray(it.value.parts)) {
        if (!partsHaveNumber(it.value)) return `item "${it.id || '?'}" value.parts 缺 number`;
      }
      continue;
    }
    // content.elements 内嵌 value+label 对（4851eedd 形态）
    const els = it?.content?.elements;
    if (Array.isArray(els)) {
      const hasValue = els.some((e) => String(e?.type || '').toLowerCase() === 'value');
      if (hasValue && !isGroupedValueLabelComplete(els)) {
        return `item "${it.id || '?'}" content.elements 值/标签断组`;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查 4：表头契约
// ─────────────────────────────────────────────────────────────────────────────

function isTableish(sec) {
  if (declaredTableHeaders(sec)) return true;
  if (String(sec?.type || '').toLowerCase() === 'table') return true;
  const nodes = [sec, ...(Array.isArray(sec?.body?.children) ? sec.body.children : [])];
  return nodes.some((n) =>
    [n?.role, n?.control, n?.type].some((v) => String(v || '').toLowerCase() === 'table'),
  );
}

/** 按列声明的表格语义：children 里 ≥2 个 table-column 角色列（40b65d9f 形态）。 */
function hasTableColumnChildren(sec) {
  const children = Array.isArray(sec?.body?.children) ? sec.body.children : [];
  const cols = children.filter(
    (c) => String(c?.role || '').toLowerCase() === 'table-column',
  );
  return cols.length >= 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查 5：样式真值
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_BEARING_TYPES = new Set(['text', 'label', 'value', 'number', 'stat-value', 'unit']);

function elementLacksStyleTruth(e) {
  return !e?.styles && !e?.style;
}

/**
 * 段内样式真值审计：走 items[].content.elements 与 body.children（两层），
 * 只看语义承载元素（STYLE_BEARING_TYPES）。返回缺样式元素数。
 */
function countMissingStyleTruth(sec) {
  let count = 0;
  const walkElements = (els) => {
    for (const e of els || []) {
      if (!e || typeof e !== 'object') continue;
      // parts 容器（769789af 形态④）的样式由 parts[].styles 承载，容器直查=口径误报
      const isPartsContainer = Array.isArray(e?.parts);
      if (
        !isPartsContainer &&
        STYLE_BEARING_TYPES.has(String(e?.type || '').toLowerCase()) &&
        elementLacksStyleTruth(e)
      ) {
        count++;
      }
      if (Array.isArray(e?.parts)) {
        for (const p of e.parts) {
          if (p && typeof p === 'object' && elementLacksStyleTruth(p)) count++;
        }
      }
    }
  };
  for (const it of [
    ...(Array.isArray(sec?.body?.items) ? sec.body.items : []),
    ...(Array.isArray(sec?.items) ? sec.items : []),
  ]) {
    if (!it || typeof it !== 'object') continue;
    walkElements(it?.content?.elements);
    if (Array.isArray(it?.stats)) {
      for (const s of it.stats) {
        if (!s || typeof s !== 'object') continue;
        // parts/labelStyles 子载体形态（a100e890）样式不在项级，直查=口径误报
        if (Array.isArray(s?.parts) || s?.labelStyles) continue;
        if (elementLacksStyleTruth(s)) count++;
      }
    }
    if (it?.valueGroup && Array.isArray(it.valueGroup.elements)) walkElements(it.valueGroup.elements);
    if (it?.value && Array.isArray(it.value.elements)) walkElements(it.value.elements);
  }
  for (const c of Array.isArray(sec?.body?.children) ? sec.body.children : []) {
    if (!c || typeof c !== 'object') continue;
    // children 层：文本承载节点（role=text 或自带 text）必须有样式真值
    if (
      (String(c?.role || '').toLowerCase() === 'text' || c?.text !== undefined) &&
      elementLacksStyleTruth(c)
    ) {
      count++;
    }
    walkElements(c?.content?.elements);
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 审计 vision 出口契约。纯函数、只读、不阻断。
 *
 * @param {Object} parsed visual-parser 产物（找 layoutStructure.layout.sections）
 * @returns {{evaluated: {sections: number, checks: string[]}, missing: Array<{code:string,id:string,name:string,detail?:string,count?:number}>, conflicts: Array}}
 */
export function auditVisionContract(parsed) {
  const sections = extractSections(parsed);
  const missing = [];

  for (const sec of sections) {
    const id = String(sec?.id ?? '?');
    const name = String(sec?.name ?? '');

    // 1. 类型可判定
    if (!checkTypeDecidable(sec)) {
      missing.push({ code: 'section-type-undecidable', id, name });
    }

    // 2. headerRelation 声明
    if (!declaredHeaderRelation(sec)) {
      missing.push({ code: 'header-relation-missing', id, name });
    }

    // 3. 统计成组
    const pairingIssue = checkStatsPairing(sec);
    if (pairingIssue) {
      missing.push({ code: 'stats-pairing-broken', id, name, detail: pairingIssue });
    }

    // 4. 表头契约（table 语义认 role/control/type=table 与 table-column 子列两种形态）
    if ((isTableish(sec) || hasTableColumnChildren(sec)) && !declaredTableHeaders(sec)) {
      missing.push({ code: 'table-headers-missing', id, name });
    }

    // 5. 样式真值
    const styleMissing = countMissingStyleTruth(sec);
    if (styleMissing > 0) {
      missing.push({ code: 'text-style-missing', id, name, count: styleMissing });
    }
  }

  // 🛡️ 6. 段 id 唯一性（mc-max-1793454777941-85ec897d 实锤）：vision id 幻觉——
  //    「底部统计」段错标与「面板标题栏」同 id ⇒ 刀53 icon 接管按 id 回查解析到
  //    标题线节点 ⇒ footer 段被渲染成 2px 分隔线、文本全丢。id 唯一性是全链
  //    「按 id 回查 Figma」机制的前提，冲突属 vision 事实自相矛盾 ⇒ 记 conflicts
  //    （非 missing——它不是「沉默」，是「发言自相矛盾」）。空 id（'?'/''）不参与。
  const byId = new Map();
  for (const sec of sections) {
    const id = String(sec?.id ?? '').trim();
    if (!id || id === '?') continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(String(sec?.name ?? ''));
  }
  const conflicts = [];
  for (const [id, names] of byId) {
    if (names.length > 1) {
      conflicts.push({ code: 'section-id-uniqueness', id, count: names.length, names });
    }
  }

  return {
    evaluated: { sections: sections.length, checks: CONTRACT_AUDIT_CHECKS },
    missing,
    conflicts,
  };
}
