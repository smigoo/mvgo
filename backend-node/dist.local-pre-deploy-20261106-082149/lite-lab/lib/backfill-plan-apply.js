"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeStyle = mergeStyle;
exports.applyBackfillPlan = applyBackfillPlan;
exports.reconcileBgPlan = reconcileBgPlan;
const truth_matcher_1 = require("./truth-matcher");
const e2n_map_1 = require("./e2n-map");
const BG_TAIL = 'center / 100% 100% no-repeat';
function beforeOfDecl(d) {
    if (d.kind === 'background')
        return d.value.trim();
    if (d.kind === 'background-color')
        return d.match.trim();
    return '(无背景声明)';
}
function mergeStyle(existing, incoming) {
    const parse = (s) => s
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
        const i = x.indexOf(':');
        return i < 0 ? { k: x, v: '' } : { k: x.slice(0, i).trim(), v: x.slice(i + 1).trim() };
    })
        .filter((d) => d.k);
    const map = new Map();
    const order = [];
    for (const d of [...parse(existing), ...parse(incoming)]) {
        if (!map.has(d.k))
            order.push(d.k);
        map.set(d.k, d.v);
    }
    return order.map((k) => `${k}:${map.get(k)}`).join(';');
}
function applyBackfillPlan(files, plan, opts = {}) {
    const kinds = new Set(opts.kinds ?? ['bg-image', 'fill-color', 'text-truth']);
    const stats = {
        entries: 0,
        appliedEntries: 0,
        ruleEdits: 0,
        bgInserted: 0,
        bgReplacedGradient: 0,
        bgReplacedColor: 0,
        bgReplacedUrl: 0,
        bgLayered: 0,
        fillApplied: 0,
        textApplied: 0,
        noop: 0,
        stale: 0,
    };
    const contentByPath = new Map(files.map((f) => [f.path, f.content]));
    const rulesByPath = new Map();
    const ruleAt = (path, bodyStart) => {
        let list = rulesByPath.get(path);
        if (!list) {
            const c = contentByPath.get(path);
            if (c == null)
                return undefined;
            list = (0, truth_matcher_1.collectStyleRulesFromContent)(c);
            rulesByPath.set(path, list);
        }
        return list.find((r) => r.bodyStart === bodyStart);
    };
    const edits = [];
    const consumedRules = new Set();
    const consumedAssets = [];
    for (const entry of plan.entries) {
        if (entry.decision !== 'apply')
            continue;
        if (!kinds.has(entry.kind))
            continue;
        stats.entries += 1;
        let touched = false;
        for (const t of entry.targets) {
            if (t.action === 'noop' || t.satisfied) {
                if (t.action === 'noop')
                    stats.noop += 1;
                continue;
            }
            if (entry.kind === 'text-truth') {
                const hashAt = t.key.lastIndexOf('#');
                const textPath = hashAt > 0 ? t.key.slice(0, hashAt) : '';
                const start = Number(t.key.slice(hashAt + 1));
                const content = contentByPath.get(textPath);
                const tag = String(entry.prod?.tag ?? '');
                if (!textPath || content == null || !Number.isFinite(start)) {
                    stats.stale += 1;
                    continue;
                }
                if (tag && !content.startsWith(`<${tag}`, start)) {
                    stats.stale += 1;
                    continue;
                }
                const gt = content.indexOf('>', start);
                const decls = String(t.after ?? '').trim();
                if (gt < 0 || !decls) {
                    stats.stale += 1;
                    continue;
                }
                const openTag = content.slice(start, gt + 1);
                const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
                if (styleM) {
                    const merged = mergeStyle(styleM[1], decls);
                    if (merged === styleM[1])
                        continue;
                    const ins = start + styleM.index + styleM[0].length - 1 - styleM[1].length;
                    edits.push({
                        path: textPath,
                        pos: ins,
                        end: ins + styleM[1].length,
                        text: merged,
                        desc: `planText:${entry.id}→<${tag}>.${(entry.prod?.classes ?? []).join('.')}(merge)`,
                    });
                }
                else {
                    const insertAt = openTag.endsWith('/>') ? gt - 1 : gt;
                    edits.push({
                        path: textPath,
                        pos: insertAt,
                        end: insertAt,
                        text: ` style="${mergeStyle('', decls)}"`,
                        desc: `planText:${entry.id}→<${tag}>.${(entry.prod?.classes ?? []).join('.')}(new-style)`,
                    });
                }
                touched = true;
                stats.ruleEdits += 1;
                stats.textApplied += 1;
                continue;
            }
            const sepAt = t.key.indexOf('::');
            if (sepAt < 0) {
                stats.stale += 1;
                continue;
            }
            const path = t.key.slice(0, sepAt);
            const bodyStart = Number(t.key.slice(sepAt + 2));
            const content = contentByPath.get(path);
            if (content == null || !Number.isFinite(bodyStart)) {
                stats.stale += 1;
                continue;
            }
            const rule = ruleAt(path, bodyStart);
            if (!rule) {
                stats.stale += 1;
                continue;
            }
            const dedupeKey = `${path}::${rule.bodyStart}`;
            if (consumedRules.has(dedupeKey))
                continue;
            const body = content.slice(rule.bodyStart, rule.bodyEnd);
            const d = (0, e2n_map_1.readBgDecl)(body);
            if (t.before != null && beforeOfDecl(d) !== t.before) {
                stats.stale += 1;
                continue;
            }
            if (entry.kind === 'bg-image') {
                const fileName = String(entry.payload?.fileName ?? '') || inferFileName(entry);
                const after = t.after ?? (fileName ? `url('${fileName}') ${BG_TAIL}` : '');
                if (!after) {
                    stats.stale += 1;
                    continue;
                }
                if (d.kind === 'background') {
                    const isGrad = d.isGradient;
                    const hadUrl = d.hasUrl;
                    edits.push({
                        path,
                        pos: rule.bodyStart + d.index,
                        end: rule.bodyStart + d.end,
                        text: after,
                        desc: `planBg:${entry.id}→${t.cls ?? t.selector}(${t.action}${hadUrl ? '/cleanup' : ''})`,
                    });
                    if (t.action === 'layer-url')
                        stats.bgLayered += 1;
                    else if (hadUrl)
                        stats.bgReplacedUrl += 1;
                    else if (isGrad)
                        stats.bgReplacedGradient += 1;
                    else
                        stats.bgReplacedColor += 1;
                }
                else if (d.kind === 'background-color') {
                    edits.push({
                        path,
                        pos: rule.bodyStart + d.index,
                        end: rule.bodyStart + d.end,
                        text: `background: ${after}`,
                        desc: `planBg:${entry.id}→${t.cls ?? t.selector}(${t.action === 'layer-url' ? 'layer-url' : 'replace-bg-color'})`,
                    });
                    if (t.action === 'layer-url')
                        stats.bgLayered += 1;
                    else
                        stats.bgReplacedColor += 1;
                }
                else {
                    const pad = body.endsWith('\n') ? '' : '\n  ';
                    edits.push({
                        path,
                        pos: rule.bodyStart + body.length,
                        end: rule.bodyStart + body.length,
                        text: `${pad}background: ${after};\n`,
                        desc: `planBg:${entry.id}→${t.cls ?? t.selector}(insert)`,
                    });
                    stats.bgInserted += 1;
                }
                touched = true;
                stats.ruleEdits += 1;
                consumedRules.add(dedupeKey);
                if (fileName) {
                    consumedAssets.push({
                        fileName,
                        figmaId: entry.figma.nodeId,
                        cls: t.cls ?? t.selector ?? '',
                        action: t.action,
                    });
                }
            }
            else if (entry.kind === 'fill-color') {
                const color = String(entry.payload?.color ?? '') || String(t.after ?? '');
                if (!color) {
                    stats.stale += 1;
                    continue;
                }
                if (d.kind === 'background' && d.hasUrl) {
                    stats.stale += 1;
                    continue;
                }
                if (d.kind === 'background') {
                    edits.push({
                        path,
                        pos: rule.bodyStart + d.index,
                        end: rule.bodyStart + d.end,
                        text: color,
                        desc: `planFill:${entry.id}→${t.cls ?? t.selector}(replace-color)`,
                    });
                }
                else if (d.kind === 'background-color') {
                    const valueStart = rule.bodyStart + d.index + d.match.length - d.value.length;
                    edits.push({
                        path,
                        pos: valueStart,
                        end: rule.bodyStart + d.end,
                        text: color,
                        desc: `planFill:${entry.id}→${t.cls ?? t.selector}(replace-bg-color)`,
                    });
                }
                else {
                    const pad = body.endsWith('\n') ? '' : '\n  ';
                    edits.push({
                        path,
                        pos: rule.bodyStart + body.length,
                        end: rule.bodyStart + body.length,
                        text: `${pad}background: ${color};\n`,
                        desc: `planFill:${entry.id}→${t.cls ?? t.selector}(insert)`,
                    });
                }
                touched = true;
                stats.ruleEdits += 1;
                stats.fillApplied += 1;
                consumedRules.add(dedupeKey);
            }
        }
        if (touched)
            stats.appliedEntries += 1;
    }
    const out = files.map((f) => {
        const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
        let content = f.content;
        for (const e of mine)
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        return { path: f.path, changed: mine.length > 0, content, edits: mine };
    });
    return { files: out, stats, consumedAssets };
}
function inferFileName(entry) {
    for (const t of entry.targets) {
        const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(t.after ?? '');
        if (m)
            return m[1].split('/').pop() ?? '';
    }
    return '';
}
function reconcileBgPlan(plan, legacyAnchored) {
    const keyOf = (fileName, cls) => `${fileName}→${cls.replace(/^\./, '')}`;
    const planKeys = new Set();
    for (const e of plan.entries) {
        if (e.kind !== 'bg-image' || e.decision !== 'apply')
            continue;
        const fileName = String(e.payload?.fileName ?? '') || inferFileName(e);
        if (!fileName)
            continue;
        const cls = e.targets.find((t) => t.action !== 'noop')?.cls ?? e.targets[0]?.cls ?? '';
        if (!cls)
            continue;
        planKeys.add(keyOf(fileName, cls));
    }
    const legacyKeys = new Set(legacyAnchored.map((a) => keyOf(a.fileName, a.cls)));
    const planOnly = [...planKeys].filter((k) => !legacyKeys.has(k));
    const legacyOnly = [...legacyKeys].filter((k) => !planKeys.has(k));
    const both = [...planKeys].filter((k) => legacyKeys.has(k));
    return { planOnly, legacyOnly, both, agree: planOnly.length === 0 && legacyOnly.length === 0 };
}
//# sourceMappingURL=backfill-plan-apply.js.map