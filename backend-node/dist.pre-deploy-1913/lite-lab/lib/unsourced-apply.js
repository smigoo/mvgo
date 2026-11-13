"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyUnsourcedStyles = applyUnsourcedStyles;
exports.renderUnsourcedAppliedMarkdown = renderUnsourcedAppliedMarkdown;
exports.unsourcedApplyStatsLine = unsourcedApplyStatsLine;
const unsourced_style_1 = require("./unsourced-style");
const TRUTH_PX_RE = /^-?\d+(?:\.\d+)?px$/;
const LESS_VAR_RE = /(^|[\s,(])@[A-Za-z_]/;
function bump(stats, reason) {
    stats.byReason[reason] = (stats.byReason[reason] ?? 0) + 1;
}
function applyUnsourcedStyles(opts) {
    const maxPerFile = opts.maxPerFile ?? 6;
    const maxTotal = opts.maxTotal ?? 20;
    const stats = {
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
    const applied = [];
    const skipped = [];
    const contentByPath = new Map(opts.prodFiles.map((f) => [f.path, f.content]));
    const perFileCount = new Map();
    const byRule = new Map();
    for (const f of opts.findings) {
        if (!(0, unsourced_style_1.isAutoApplicable)(f)) {
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
        let edit;
        if (f.verdict === 'delete') {
            edit = {
                start: f.declStart,
                end: f.declEnd,
                text: '',
                desc: `delete:${f.rawProp}`,
                finding: f,
            };
        }
        else {
            const truth = String(f.truthValue ?? '').trim();
            if (!truth) {
                stats.skipped += 1;
                bump(stats, 'no-truth-value');
                skipped.push({ file: f.file, cls: f.cls, rawProp: f.rawProp, verdict: f.verdict, reason: 'no-truth-value' });
                continue;
            }
            if (f.value.trim().split(/\s+/).length !== 1) {
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
    const ruleBuckets = [...byRule.values()].sort((a, b) => a.file.localeCompare(b.file) || b.bodyStart - a.bodyStart);
    const contentOut = new Map(contentByPath);
    const editsByFile = new Map();
    for (const bucket of ruleBuckets) {
        const base = contentOut.get(bucket.file);
        if (typeof base !== 'string')
            continue;
        let body = base.slice(bucket.bodyStart, bucket.bodyEnd);
        for (const e of [...bucket.edits].sort((a, b) => b.start - a.start)) {
            body = body.slice(0, e.start - bucket.bodyStart) + e.text + body.slice(e.end - bucket.bodyStart);
        }
        if (body.trim() === '')
            stats.emptyRulesLeft += 1;
        contentOut.set(bucket.file, base.slice(0, bucket.bodyStart) + body + base.slice(bucket.bodyEnd));
        stats.rulesRewritten += 1;
        const list = editsByFile.get(bucket.file) ?? [];
        list.push(...bucket.edits.map((e) => e.desc));
        editsByFile.set(bucket.file, list);
    }
    const files = opts.prodFiles.map((f) => {
        const next = contentOut.get(f.path) ?? f.content;
        const changed = next !== f.content;
        if (changed)
            stats.filesChanged += 1;
        return { path: f.path, content: next, changed, edits: changed ? editsByFile.get(f.path) ?? [] : [] };
    });
    return { files, applied, skipped, stats };
}
function renderUnsourcedAppliedMarkdown(stats, applied, skipped) {
    const lines = [];
    lines.push('## 无源样式落地（闸③ v1-lite）');
    lines.push('');
    lines.push(`检出 ${stats.considered} 处：按设计只报告 ${stats.reportOnly} 处、可落地 ${stats.applied + stats.skipped} 处 ` +
        `⇒ 已落地 **${stats.applied}**（删阴影 ${stats.delete} / 改圆角 ${stats.override}），跳过 ${stats.skipped}。`);
    if (stats.reportOnly > 0) {
        lines.push('');
        lines.push('> 只报告不落地：`fanout`（需拆类）、`background` / `border` 的删除（背景常由祖先提供；' +
            'border 长手属性删一条可能反而让边框更实）—— 见上方检出表。');
    }
    if (applied.length > 0) {
        lines.push('');
        lines.push('| 文件 | 类名 | 动作 | 原值 | 新值 | 图节点 |');
        lines.push('|---|---|---|---|---|---|');
        for (const a of applied) {
            lines.push(`| \`${a.file.split('/').pop()}\` | \`${a.cls}\` | ${a.kind === 'delete' ? '删除' : '覆盖'} \`${a.rawProp}\` | ` +
                `\`${a.from.slice(0, 30)}\` | \`${a.to.slice(0, 30) || '—'}\` | ${a.figmaId} |`);
        }
    }
    if (skipped.length > 0) {
        lines.push('');
        lines.push('跳过明细：');
        for (const s of skipped.slice(0, 20)) {
            lines.push(`- \`${s.cls}\` \`${s.rawProp}\` (${s.verdict}) — ${s.reason}`);
        }
        if (skipped.length > 20)
            lines.push(`- … 另有 ${skipped.length - 20} 条`);
    }
    lines.push('');
    return lines.join('\n');
}
function unsourcedApplyStatsLine(stats) {
    return (`unsourcedApplyConsidered=${stats.considered},unsourcedApplyReportOnly=${stats.reportOnly},` +
        `unsourcedApplyApplied=${stats.applied},unsourcedApplyDelete=${stats.delete},` +
        `unsourcedApplyOverride=${stats.override},unsourcedApplySkipped=${stats.skipped},` +
        `unsourcedApplyStale=${stats.byReason['stale-offset'] ?? 0},` +
        `unsourcedApplyCap=${stats.byReason['cap-exceeded'] ?? 0},` +
        `unsourcedApplyRules=${stats.rulesRewritten},unsourcedApplyFiles=${stats.filesChanged}`);
}
//# sourceMappingURL=unsourced-apply.js.map