/**
 * 🛡️ Phase E（2026-10-31 治理方案）：拒绝原因聚合对账（纯函数，审计家族成员）。
 *
 * 问题：刀53 接管器只在 map.size>0 时打日志 ⇒「接管 0 命中」与「零问题」不可区分；
 *      接管 skip 原因（skipped[].reason）、契约审计缺失分散在各自日志里，任务级无对账视图。
 *      排障纪律「接管/兜底 0 命中必须配阳性对照」此前没有结构化数据支撑。
 *
 * 交付：任务级 summary——
 *  - `pickTakeoverAudit(takeover)`：collectFoldedGridTakeover 返回值 → 统计子集归一
 *    （role 层调用，回写 result.takeoverAudit；空/畸形输入 null，不编造零值结论）；
 *  - `buildRejectSummary({ takeoverAudit, contractAudit })`：任务级双源聚合
 *    （graph 层调用；双源皆空 → null，不落盘不刷日志）；
 *  - `formatRejectSummaryLine(summary)`：一行确定性日志（键=值可 grep）。
 *
 * 落盘：graph 生成节点完成后 `state._saveCheckpoint?.('reject-summary', s)` +
 *       logger.info 一行。只观测、不阻断（与 D1 同纪律）。
 *
 * 数据源现状（治理方案 §Phase E 交付物 1）：刀53 skipped[].reason ✅ 结构化；
 * 契约审计缺失 ✅（D1 contractAudit）；装配器剥离 / 兜底跳过 ⚠️ 无结构化记录
 * （本模块留 contract 扩展位，不硬造数据；待后续刀补结构化源再接）。
 */

/** 9 类接管命中计数键（与 collectFoldedGridTakeover 返回字段一一对应） */
const HIT_KEYS = [
  ['headerHits', 'header'],
  ['gridHits', 'grid'],
  ['textHits', 'text'],
  ['iconHits', 'icon'],
  ['legendHits', 'legend'],
  ['kvGridHits', 'kvGrid'],
  ['listHits', 'list'],
  ['statRowHits', 'statRow'],
  ['tableHits', 'table'],
];

/** skipped 截断上限（与接管器自身 slice(0,16) 同口径） */
const SKIPPED_CAP = 16;

/**
 * takeover 返回值 → 统计子集归一。
 * @param {{evaluated?:number, map?:Map, skipped?:Array, tableAnchorRepairs?:number}} takeover
 * @returns {Object|null} null = 输入无有效统计（不编造）
 */
export function pickTakeoverAudit(takeover) {
  if (!takeover || typeof takeover !== 'object' || !Number.isFinite(Number(takeover.evaluated))) {
    return null;
  }
  const skipped = Array.isArray(takeover.skipped) ? takeover.skipped : [];
  const hits = {};
  for (const [, key] of HIT_KEYS) hits[key] = 0;
  for (const [field, key] of HIT_KEYS) {
    const n = Number(takeover[field]);
    if (Number.isFinite(n)) hits[key] = n;
  }
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    evaluated: num(takeover.evaluated),
    candidates: takeover.map instanceof Map ? takeover.map.size : 0,
    hits,
    suppressed: {
      statRow: num(takeover.statRowSuppressed),
      table: num(takeover.tableSuppressed),
    },
    anchorRepairs: num(takeover.tableAnchorRepairs),
    skippedTotal: skipped.length,
    skipped: skipped.slice(0, SKIPPED_CAP).map((s) => ({
      id: String(s?.id ?? ''),
      reason: String(s?.reason ?? ''),
    })),
  };
}

/**
 * 任务级双源聚合。
 * @param {{takeoverAudit?:Object|null, contractAudit?:Object|null}} inputs
 * @returns {Object|null} 双源皆空 → null
 */
export function buildRejectSummary({ takeoverAudit, contractAudit } = {}) {
  const takeover = takeoverAudit && typeof takeoverAudit === 'object' ? takeoverAudit : null;
  let contract = null;
  if (contractAudit && typeof contractAudit === 'object') {
    const missing = Array.isArray(contractAudit.missing) ? contractAudit.missing : [];
    const conflicts = Array.isArray(contractAudit.conflicts) ? contractAudit.conflicts : [];
    const codes = [...new Set(missing.map((m) => String(m?.code ?? '')))].filter(Boolean);
    contract = {
      missingCount: missing.length,
      conflictCount: conflicts.length,
      missingCodes: codes,
    };
  }
  if (!takeover && !contract) return null;
  return { takeover, contract };
}

/**
 * takeover 统计子集单行（role 评估点用；任务级落盘行由 formatRejectSummaryLine 负责）。
 * @returns {string} 空 audit → ''
 */
export function formatTakeoverAuditLine(audit) {
  if (!audit) return '';
  return formatRejectSummaryLine({ takeover: audit, contract: null })
    .replace(/^REJECT-SUMMARY /, '');
}

/**
 * 一行确定性日志（键=值，可 grep）。
 * @returns {string} 空 summary → ''
 */
export function formatRejectSummaryLine(summary) {
  if (!summary || typeof summary !== 'object') return '';
  const parts = ['REJECT-SUMMARY'];
  const t = summary.takeover;
  if (t) {
    parts.push(`evaluated=${t.evaluated}`, `candidates=${t.candidates}`);
    const hitStr = Object.entries(t.hits || {})
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    parts.push(`hits(${hitStr})`);
    parts.push(
      `suppressed:statRow=${t.suppressed?.statRow ?? 0}`,
      `suppressed:table=${t.suppressed?.table ?? 0}`,
    );
    parts.push(`skipped=${t.skippedTotal ?? 0}`, `anchorRepairs=${t.anchorRepairs ?? 0}`);
  }
  const c = summary.contract;
  if (c) {
    parts.push(
      `contract:missing=${c.missingCount}`,
      `conflicts=${c.conflictCount}`,
      c.missingCodes?.length ? `codes=${c.missingCodes.join('|')}` : 'codes=-',
    );
  }
  return parts.join(' ');
}
