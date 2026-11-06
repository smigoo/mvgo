/**
 * 闸③ · 无源样式**落地**（v1-lite）
 *
 * 闸④ 只出判据；本模块把其中**真值最硬、误删代价最低**的两类真正写进产物：
 *   · `delete`   + `box-shadow`     —— 真值确实没有阴影，删掉不改变布局
 *   · `override` + `border-radius`  —— 唯一有机器可读数值真值（`cornerRadius`）的覆盖
 *
 * 可落地集合的判据**不在这里**，在 `unsourced-style.ts#isAutoApplicable`（单一来源）——
 * 收敛断言也调它。两处各写一份判据，就会出现「落地了 A、断言只查 B」的自证假绿。
 *
 * ── 为什么不是「全量落地」────────────────────────────────────────────────────
 *   · `fanout`：单值删除会让**多数实例**一起丢掉真值（11a0ef5f 12 张卡，5 张本是
 *     `#FFFFFF@43%`）。正确解法是拆类，属结构级改动。
 *   · `background` delete：背景常由祖先/面板外壳提供，删对了没收益、删错了整块透明；
 *     且渐变底当前被 `isBackgroundManagedElsewhere` 整体豁免，真值不可比。
 *   · `border` delete：长手属性被归并，**只删一条可能让边框更实**（`border-color` 缺失
 *     回落 `currentColor`），必须整族删，需要单独设计。
 *
 * ── 实现约束（踩过的坑）──────────────────────────────────────────────────────
 *   ① 同一规则体内多条声明**必须合成一次整体重写**：逐条 splice 会让偏移失效/重叠；
 *   ② 同文件多条规则按 `bodyStart` **降序**应用，否则后续偏移全错；
 *   ③ 落地前用绝对偏移处的**原文自证**（含属性名/值），不符即 `stale-offset` 放弃 ——
 *      调用方可能在检测与落地之间改过内容（上游 Stage 会回写）；
 *   ④ 单文件/总量上限，超出降级为报告：破坏性编辑不做无界扩散。
 */

import type { UnsourcedFinding } from './unsourced-style';
import { isAutoApplicable } from './unsourced-style';

export type ApplySkipReason =
  | 'no-truth-value'
  | 'multi-value'
  | 'non-px'
  | 'less-var'
  | 'important'
  | 'stale-offset'
  | 'file-missing'
  | 'cap-exceeded';

export interface AppliedUnsourcedEdit {
  file: string;
  cls: string;
  selector: string;
  figmaId: string;
  kind: 'delete' | 'override';
  rawProp: string;
  from: string;
  to: string;
}

export interface SkippedUnsourcedEdit {
  file: string;
  cls: string;
  rawProp: string;
  verdict: string;
  reason: ApplySkipReason;
}

export interface ApplyUnsourcedStats {
  /** 输入 findings 总数 */
  considered: number;
  /** 按设计只报告、不落地的条数（fanout / background / border） */
  reportOnly: number;
  applied: number;
  delete: number;
  override: number;
  skipped: number;
  filesChanged: number;
  rulesRewritten: number;
  /** 删完变空规则体的数量（保留 `{ }`，不影响 less 编译） */
  emptyRulesLeft: number;
  byReason: Record<string, number>;
}

export interface ApplyUnsourcedResult {
  files: Array<{ path: string; content: string; changed: boolean; edits: string[] }>;
  applied: AppliedUnsourcedEdit[];
  skipped: SkippedUnsourcedEdit[];
  stats: ApplyUnsourcedStats;
}

export interface ApplyUnsourcedOptions {
  findings: UnsourcedFinding[];
  prodFiles: Array<{ path: string; content: string }>;
  /** 单文件最多落地几条（超出降级报告），默认 6 */
  maxPerFile?: number;
  /** 全产物最多落地几条，默认 20 */
  maxTotal?: number;
}

const TRUTH_PX_RE = /^-?\d+(?:\.\d+)?px$/;
/** less 变量（`@color` / `@fontSize`）—— 删掉它可能删掉真值通道本身 */
const LESS_VAR_RE = /(^|[\s,(])@[A-Za-z_]/;

function bump(stats: ApplyUnsourcedStats, reason: ApplySkipReason): void {
  stats.byReason[reason] = (stats.byReason[reason] ?? 0) + 1;
}

export function applyUnsourcedStyles(opts: ApplyUnsourcedOptions): ApplyUnsourcedResult {
  const maxPerFile = opts.maxPerFile ?? 6;
  const maxTotal = opts.maxTotal ?? 20;
  const stats: ApplyUnsourcedStats = {
    considered: opts.findings.length,
    reportOnly: 0,
    applied: 0,
    delete: 0,
    override: 0,
    skipped: 0,
    filesChanged: 0,
    rulesRewritten: 0,
    emptyRulesLeft: 0,
    byReason: {},
  };
  const applied: AppliedUnsourcedEdit[] = [];
  const skipped: SkippedUnsourcedEdit[] = [];

  const contentByPath = new Map(opts.prodFiles.map((f) => [f.path, f.content]));
  const perFileCount = new Map<string, number>();

  interface PendingEdit {
    start: number;
    end: number;
    text: string;
    desc: string;
    finding: UnsourcedFinding;
  }
  /** key = `${file}|${bodyStart}` —— 同一规则体只重写一次 */
  const byRule = new Map<string, { file: string; bodyStart: number; bodyEnd: number; edits: PendingEdit[] }>();

  for (const f of opts.findings) {
    if (!isAutoApplicable(f)) {
      stats.reportOnly += 1;
      continue;
    }
    const content = contentByPath.get(f.file);
    if (typeof content !== 'string') {
      stats.skipped += 1;
      bump(stats, 'file-missing');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'file-missing' });
      continue;
    }

    // ③ 偏移自证：原文必须仍是我们判过的那条声明
    const rawDecl = content.slice(f.declStart, f.declEnd);
    if (!rawDecl.toLowerCase().includes(f.rawProp.toLowerCase())) {
      stats.skipped += 1;
      bump(stats, 'stale-offset');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'stale-offset' });
      continue;
    }
    if (LESS_VAR_RE.test(f.value)) {
      stats.skipped += 1;
      bump(stats, 'less-var');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'less-var' });
      continue;
    }
    if (/!important/i.test(f.value)) {
      stats.skipped += 1;
      bump(stats, 'important');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'important' });
      continue;
    }

    let edit: PendingEdit | undefined;
    if (f.verdict === 'delete') {
      edit = {
        start: f.declStart,
        end: f.declEnd,
        text: '',
        desc: `delete:${f.rawProp}`,
        finding: f,
      };
    } else {
      const truth = String(f.truthValue ?? '').trim();
      if (!truth) {
        stats.skipped += 1;
        bump(stats, 'no-truth-value');
        skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'no-truth-value' });
        continue;
      }
      if (f.value.trim().split(/\s+/).length !== 1) {
        // `8px 8px 0 0` 之类的多元值，只换首个会改变语义
        stats.skipped += 1;
        bump(stats, 'multi-value');
        skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'multi-value' });
        continue;
      }
      if (!TRUTH_PX_RE.test(truth) || !/^-?\d+(?:\.\d+)?px$/.test(f.value.trim())) {
        stats.skipped += 1;
        bump(stats, 'non-px');
        skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'non-px' });
        continue;
      }
      // 值区间自证：只能替换我们判过的那个值
      if (content.slice(f.valueStart, f.valueEnd) !== f.value) {
        stats.skipped += 1;
        bump(stats, 'stale-offset');
        skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'stale-offset' });
        continue;
      }
      edit = {
        start: f.valueStart,
        end: f.valueEnd,
        text: truth,
        desc: `override:${f.rawProp}→${truth}`,
        finding: f,
      };
    }

    // ④ 上限：破坏性编辑不做无界扩散（超出的降级为报告）
    const usedInFile = perFileCount.get(f.file) ?? 0;
    if (usedInFile >= maxPerFile || stats.applied >= maxTotal) {
      stats.skipped += 1;
      bump(stats, 'cap-exceeded');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'cap-exceeded' });
      continue;
    }
    if (edit.start < f.bodyStart || edit.end > f.bodyEnd) {
      stats.skipped += 1;
      bump(stats, 'stale-offset');
      skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'stale-offset' });
      continue;
    }

    const key = `${f.file}|${f.bodyStart}`;
    const bucket = byRule.get(key) ?? { file: f.file, bodyStart: f.bodyStart, bodyEnd: f.bodyEnd, edits: [] };
    bucket.edits.push(edit);
    byRule.set(key, bucket);
    perFileCount.set(f.file, usedInFile + 1);
    stats.applied += 1;
    stats[f.verdict === 'delete' ? 'delete' : 'override'] += 1;
    applied.push({
      file: f.file,
      cls: f.cls,
      selector: f.selector,
      figmaId: f.figmaId,
      kind: f.verdict === 'delete' ? 'delete' : 'override',
      rawProp: f.rawProp,
      from: f.value,
      to: edit.text,
    });
  }

  // ① 每规则一次整体重写；② 同文件按 bodyStart 降序应用
  const ruleBuckets = [...byRule.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || b.bodyStart - a.bodyStart,
  );
  const contentOut = new Map(contentByPath);
  const editsByFile = new Map<string, string[]>();
  for (const bucket of ruleBuckets) {
    const base = contentOut.get(bucket.file);
    if (typeof base !== 'string') continue;
    let body = base.slice(bucket.bodyStart, bucket.bodyEnd);
    for (const e of [...bucket.edits].sort((a, b) => b.start - a.start)) {
      body = body.slice(0, e.start - bucket.bodyStart) + e.text + body.slice(e.end - bucket.bodyStart);
    }
    if (body.trim() === '') stats.emptyRulesLeft += 1;
    contentOut.set(bucket.file, base.slice(0, bucket.bodyStart) + body + base.slice(bucket.bodyEnd));
    stats.rulesRewritten += 1;
    const list = editsByFile.get(bucket.file) ?? [];
    list.push(...bucket.edits.map((e) => e.desc));
    editsByFile.set(bucket.file, list);
  }

  const files = opts.prodFiles.map((f) => {
    const next = contentOut.get(f.path) ?? f.content;
    const changed = next !== f.content;
    if (changed) stats.filesChanged += 1;
    return { path: f.path, content: next, changed, edits: changed ? editsByFile.get(f.path) ?? [] : [] };
  });

  return { files, applied, skipped, stats };
}

/** 渲染成 markdown 一节（接在闸④ 检出之后，明确「检出 → 落地 → 未落地」三段） */
export function renderUnsourcedAppliedMarkdown(
  stats: ApplyUnsourcedStats,
  applied: AppliedUnsourcedEdit[],
  skipped: SkippedUnsourcedEdit[],
): string {
  const lines: string[] = [];
  lines.push('## 无源样式落地（闸③ v1-lite）');
  lines.push('');
  lines.push(
    `检出 ${stats.considered} 处：按设计只报告 ${stats.reportOnly} 处、可落地 ${stats.applied + stats.skipped} 处 ` +
      `⇒ 已落地 **${stats.applied}**（删阴影 ${stats.delete} / 改圆角 ${stats.override}），跳过 ${stats.skipped}。`,
  );
  if (stats.reportOnly > 0) {
    lines.push('');
    lines.push(
      '> 只报告不落地：`fanout`（需拆类）、`background` / `border` 的删除（背景常由祖先提供；' +
        'border 长手属性删一条可能反而让边框更实）—— 见上方检出表。',
    );
  }
  if (applied.length > 0) {
    lines.push('');
    lines.push('| 文件 | 类名 | 动作 | 原值 | 新值 | 图节点 |');
    lines.push('|---|---|---|---|---|---|');
    for (const a of applied) {
      lines.push(
        `| \`${a.file.split('/').pop()}\` | \`${a.cls}\` | ${a.kind === 'delete' ? '删除' : '覆盖'} \`${a.rawProp}\` | ` +
          `\`${a.from.slice(0, 30)}\` | \`${a.to.slice(0, 30) || '—'}\` | ${a.figmaId} |`,
      );
    }
  }
  if (skipped.length > 0) {
    lines.push('');
    lines.push('跳过明细：');
    for (const s of skipped.slice(0, 20)) {
      lines.push(`- \`${s.cls}\` \`${s.rawProp}\` (${s.verdict}) — ${s.reason}`);
    }
    if (skipped.length > 20) lines.push(`- … 另有 ${skipped.length - 20} 条`);
  }
  lines.push('');
  return lines.join('\n');
}

/** 供 service 层做一行统计日志（逐字段枚举） */
export function unsourcedApplyStatsLine(stats: ApplyUnsourcedStats): string {
  return (
    `unsourcedApplyConsidered=${stats.considered},unsourcedApplyReportOnly=${stats.reportOnly},` +
    `unsourcedApplyApplied=${stats.applied},unsourcedApplyDelete=${stats.delete},` +
    `unsourcedApplyOverride=${stats.override},unsourcedApplySkipped=${stats.skipped},` +
    `unsourcedApplyStale=${stats.byReason['stale-offset'] ?? 0},` +
    `unsourcedApplyCap=${stats.byReason['cap-exceeded'] ?? 0},` +
    `unsourcedApplyRules=${stats.rulesRewritten},unsourcedApplyFiles=${stats.filesChanged}`
  );
}
