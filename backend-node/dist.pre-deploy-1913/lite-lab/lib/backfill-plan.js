"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBackfillPlan = buildBackfillPlan;
exports.renderPlanMarkdown = renderPlanMarkdown;
const truth_matcher_1 = require("./truth-matcher");
const e2n_map_1 = require("./e2n-map");
const asset_opacity_1 = require("./asset-opacity");
const KIND_PRIORITY = {
    'inline-image': 40,
    'bg-image': 30,
    'fill-color': 20,
    'text-truth': 10,
};
function normColor(v) {
    const s = String(v || '').trim().toLowerCase();
    const hex = /^#([0-9a-f]{3})$/.exec(s);
    if (hex)
        return `#${hex[1].split('').map((c) => c + c).join('')}`;
    const rgba = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+))?\)$/.exec(s);
    if (rgba) {
        const hexv = [rgba[1], rgba[2], rgba[3]]
            .map((x) => Number(x).toString(16).padStart(2, '0'))
            .join('');
        return `#${hexv}`;
    }
    return s;
}
function urlFileNameOf(cssValue) {
    const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(cssValue);
    if (!m)
        return undefined;
    const seg = m[1].split('/').pop() ?? '';
    return seg || undefined;
}
function hasExtraBgLayers(value) {
    const rest = value.replace(/url\(\s*['"]?[^'")]+['"]?\s*\)/gi, '');
    return /gradient\s*\(|rgba?\(|#[0-9a-f]{3,8}\b/i.test(rest);
}
function findAssetRefs(files, fileName) {
    const out = [];
    for (const f of files) {
        let i = f.content.indexOf(fileName);
        while (i >= 0) {
            const lineStart = f.content.lastIndexOf('\n', i) + 1;
            const nl = f.content.indexOf('\n', i);
            const line = f.content.slice(lineStart, nl < 0 ? f.content.length : nl).trim();
            out.push({
                file: f.path,
                kind: /^\s*import\s/.test(line) ? 'import' : /url\s*\(/i.test(line) ? 'css-url' : 'ref',
                snippet: line.length > 180 ? `${line.slice(0, 180)}…` : line,
            });
            if (out.length >= 8)
                return out;
            i = f.content.indexOf(fileName, i + fileName.length);
        }
    }
    return out;
}
function fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v))
        return '?';
    return (Math.round(v * 10) / 10).toString();
}
function classCandidates(edge) {
    return (edge?.classes ?? []).filter((c) => c && !/^_/.test(c)).reverse();
}
function resolveClassRules(index, edge) {
    const cands = classCandidates(edge);
    if (cands.length === 0)
        return { skip: 'no-style-rule', detail: '结构边没有可用类名' };
    for (const cls of cands) {
        const hits = (0, e2n_map_1.findClassRuleHits)(index, cls);
        if (hits.length === 0)
            continue;
        const selSet = new Set(hits.map((h) => (0, e2n_map_1.selKeyOf)(h.rule.selNorm)));
        if (selSet.size > 1) {
            return { cls, hits, skip: 'rule-ambiguous', detail: [...selSet].join('  |  ') };
        }
        const sel = [...selSet][0];
        if (!(0, e2n_map_1.isSingleClassSelector)(sel))
            return { cls, hits, skip: 'multi-class-selector', detail: sel };
        return { cls, hits };
    }
    return { skip: 'no-style-rule', detail: `类名均无规则：${cands.map((c) => `.${c}`).join(' / ')}` };
}
function declaredProp(index, file, classes, prop) {
    let best;
    for (const cls of classes) {
        for (const h of (0, e2n_map_1.findClassRuleHits)(index, cls)) {
            if (h.file.path !== file)
                continue;
            const body = h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd);
            const m = new RegExp(`(^|[;{\\s])${prop}\\s*:\\s*([^;{}]+)`).exec(body);
            if (m)
                best = { value: m[2].trim(), where: `.${cls}` };
        }
    }
    return best;
}
function themeTagOf(selNorm) {
    const s = (selNorm.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';').pop() ?? '').replace(/\s+/g, ' ').trim();
    const m = /^\.(dark|light)\s/.exec(s);
    return m ? ` (.${m[1]})` : '';
}
function isRuntimeExpr(v) {
    if (!v)
        return false;
    return /(^|[^\w-])(calc|var|clamp|min|max)\s*\(|@[\w-]+/.test(v);
}
function fillProfileOf(node) {
    let hasImage = false;
    let gradients = 0;
    let solids = 0;
    (function walk(n) {
        if (!n || typeof n !== 'object')
            return;
        for (const f of Array.isArray(n.fills) ? n.fills : []) {
            const t = String(f?.type || '');
            if (t === 'IMAGE' || t === 'VIDEO')
                hasImage = true;
            else if (t.startsWith('GRADIENT'))
                gradients += 1;
            else if (t === 'SOLID')
                solids += 1;
        }
        for (const c of n.children || [])
            walk(c);
    })(node);
    return { hasImage, gradients, solids };
}
function buildBackfillPlan(opts) {
    const figmaRoot = opts.figmaRoot?.document ?? opts.figmaRoot;
    const truth = opts.truth ?? (0, truth_matcher_1.collectFigmaTruth)(figmaRoot);
    const prodFiles = opts.prodFiles;
    const e2n = opts.e2n ?? (0, e2n_map_1.buildE2nMap)(figmaRoot, prodFiles);
    const index = (0, e2n_map_1.buildStyleRuleIndex)(prodFiles);
    const contentByPath = new Map(prodFiles.map((f) => [f.path, f.content]));
    const consumedByOther = new Set(opts.agentConsumed ?? []);
    const entries = [];
    const gaps = [];
    const byKind = {
        'bg-image': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
        'inline-image': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
        'fill-color': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
        'text-truth': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
    };
    const pushEntry = (e) => {
        entries.push(e);
        const b = byKind[e.kind];
        b.candidates += 1;
        if (e.decision === 'apply')
            b.apply += 1;
        else
            b.skip += 1;
        if (e.decision === 'apply' && e.targets.length > 0 && e.targets.every((t) => t.satisfied))
            b.satisfied += 1;
    };
    for (const a of truth.assets) {
        if (!a.fileName || !(0, truth_matcher_1.isBgClassAsset)(a))
            continue;
        const parent = a.parentId ? (0, truth_matcher_1.findNodeById)(figmaRoot, a.parentId) : undefined;
        const pb = parent?.absoluteBoundingBox;
        const evidence = [];
        evidence.push(pb
            ? `资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)} ${a.containerLevel ? '≈' : '≠'} 父容器 ${fmtNum(pb.width)}×${fmtNum(pb.height)}（±1px）⇒ ${a.containerLevel ? '容器级整块底图' : '元素级局部图'}`
            : `资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)}（父容器无 bbox，无法判容器级）`);
        if (a.parentTexts?.length) {
            evidence.push(`容器子树文本 [${a.parentTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`);
        }
        if (consumedByOther.has(a.fileName))
            evidence.push('该资源已被 AI 兜底通道消费（计划不重复规划）');
        const op = opts.assetOpacity?.[a.fileName];
        const overlay = !!op && op.meanAlpha < asset_opacity_1.OPAQUE_BG_ALPHA;
        if (op) {
            evidence.push(`资源 alpha 均值 ${op.meanAlpha}/255（可见像素 ${Math.round((op.visibleRatio ?? 0) * 100)}%）⇒ ${overlay
                ? '半透明**叠加层**：保留原底色，把图叠在上层'
                : '不透明**整块底图**：可整条替换底色'}`);
        }
        const base = {
            id: `bg/${a.nodeId}`,
            kind: 'bg-image',
            decision: 'apply',
            figma: {
                nodeId: String(a.nodeId),
                name: String(a.name ?? ''),
                type: 'IMAGE',
                w: a.width,
                h: a.height,
                parentId: a.parentId,
            },
            evidence,
            targets: [],
            conflicts: [],
            payload: {
                containerLevel: !!a.containerLevel,
                figmaNodeName: a.name,
                fileName: a.fileName,
                alpha: op?.meanAlpha,
                overlay,
            },
        };
        const bgNode = (0, truth_matcher_1.findNodeById)(figmaRoot, String(a.nodeId));
        const fillProfile = bgNode ? fillProfileOf(bgNode) : undefined;
        if (fillProfile && !fillProfile.hasImage && fillProfile.gradients > 0) {
            base.decision = 'skip';
            base.skipReason = 'gradient-render';
            evidence.push(`🔴 节点子树零 IMAGE fill、含 ${fillProfile.gradients} 条 GRADIENT_* ⇒ 该 png 是**渐变组渲染图**，不是图片资源：应以 CSS 渐变还原，不主张挂 url()`);
            pushEntry(base);
            gaps.push({
                kind: 'gradient-fill',
                figmaId: String(a.nodeId),
                detail: `渐变渲染图（${fillProfile.gradients} 条 GRADIENT_*、零 IMAGE fill）—— 待采集 colorStops/handles 还原 linear-gradient`,
            });
            continue;
        }
        if (!a.parentId) {
            base.decision = 'skip';
            base.skipReason = 'no-parent';
            evidence.push('Figma 侧无父容器 ⇒ 无法定位容器落点');
            pushEntry(base);
            gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: '资源无父容器，无法确定容器落点' });
            continue;
        }
        const edge = (0, e2n_map_1.findE2nEdge)(e2n, a.parentId);
        if (!edge) {
            base.decision = 'skip';
            base.skipReason = 'no-e2n-edge';
            evidence.push(`父容器 ${a.parentId} 在产物里没有结构映射（E2N 无边）⇒ 落点不明，需补文本/结构锚点`);
            pushEntry(base);
            gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: `父容器 ${a.parentId} 无 E2N 边` });
            continue;
        }
        evidence.push(`父容器 ${a.parentId}「${edge.figmaName}」→ ${edge.prodPath} ${edge.classes.map((c) => `.${c}`).join('')}（${edge.how}，匹配 ${edge.matched} 文本${edge.instCount > 1 ? `，v-for ×${edge.instCount}` : ''}）`);
        base.prod = { file: edge.prodPath, path: edge.prodPath, classes: edge.classes };
        if (!a.containerLevel) {
            base.decision = 'skip';
            base.skipReason = 'not-container-level';
            evidence.push('资源明显小于父容器 ⇒ 不是整块底图；当前计划不主张替换容器背景（避免吞掉兄弟元素）');
            pushEntry(base);
            gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: '元素级 bg 待定落点（容器级判据不成立）' });
            continue;
        }
        const resolved = resolveClassRules(index, edge);
        if (resolved.skip) {
            base.decision = 'skip';
            base.skipReason = resolved.skip;
            evidence.push(`落点解析失败：${resolved.detail}`);
            pushEntry(base);
            gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: `${resolved.skip}: ${resolved.detail}` });
            continue;
        }
        const cls = resolved.cls;
        const hits = resolved.hits;
        evidence.push(`落点 .${cls} 命中 ${hits.length} 处投影：${hits.map((h) => `${h.file.path}${themeTagOf(h.rule.selNorm)}`).join(' / ')}（同一逻辑规则的多份副本，必须全部替换，否则被后注入者压掉）`);
        for (const h of hits) {
            const content = contentByPath.get(h.file.path) ?? h.file.content;
            const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
            const d = (0, e2n_map_1.readBgDecl)(body);
            let after = (0, e2n_map_1.bgUrlFor)(h.file.path, a.fileName);
            const key = `${h.file.path}::${h.rule.bodyStart}`;
            let action = 'insert';
            let before;
            let satisfied = false;
            if (d.kind === 'background' && d.hasUrl) {
                const cur = urlFileNameOf(d.value);
                const leftover = hasExtraBgLayers(d.value);
                satisfied = cur === a.fileName && (overlay || !leftover);
                action = satisfied ? 'noop' : 'replace-url';
                before = d.value.trim();
                if (satisfied)
                    after = before;
                if (cur !== a.fileName) {
                    evidence.push(`⚠ ${h.file.path} 该规则已挂其他图（${cur ?? '?'}）⇒ 计划替换`);
                }
                else if (!satisfied && leftover) {
                    evidence.push(`⚠ ${h.file.path} 已挂本图但残留旧图层（渐变/纯色叠在图上）⇒ 计划清理为单层`);
                }
            }
            else if (d.kind === 'background') {
                if (overlay) {
                    action = 'layer-url';
                    before = d.value.trim();
                    after = `${after}, ${d.value.trim()}`;
                }
                else {
                    action = d.isGradient ? 'replace-gradient' : 'replace-color';
                    before = d.value.trim();
                }
            }
            else if (d.kind === 'background-color') {
                if (overlay) {
                    action = 'layer-url';
                    before = `${d.match.trim()}`;
                    after = `${after}, ${d.value.trim()}`;
                }
                else {
                    action = 'replace-bg-color';
                    before = `${d.match.trim()}`;
                }
            }
            else {
                before = '(无背景声明)';
            }
            base.targets.push({
                file: h.file.path,
                key,
                selector: (0, e2n_map_1.selKeyOf)(h.rule.selNorm),
                cls,
                action,
                before,
                after,
                satisfied,
            });
        }
        if (base.targets.length > 0 && base.targets.every((t) => t.satisfied)) {
            evidence.push('现状已全部满足（幂等空转，执行器不会写盘）');
        }
        pushEntry(base);
    }
    for (const a of truth.assets) {
        if (!a.fileName || !(0, truth_matcher_1.isIconClassAsset)(a))
            continue;
        const evidence = [];
        evidence.push(`资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)}（元素级，非容器底图）`);
        if (a.parentTexts?.length) {
            evidence.push(`容器子树文本 [${a.parentTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`);
        }
        const edge = a.parentId ? (0, e2n_map_1.findE2nEdge)(e2n, a.parentId) : undefined;
        if (edge) {
            evidence.push(`父容器 ${a.parentId}「${edge.figmaName}」→ ${edge.prodPath} ${edge.classes.map((c) => `.${c}`).join('')}`);
        }
        else if (a.parentId) {
            evidence.push(`父容器 ${a.parentId} 无 E2N 边`);
        }
        const refs = findAssetRefs(prodFiles, a.fileName);
        const entry = {
            id: `img/${a.nodeId}`,
            kind: 'inline-image',
            decision: 'apply',
            figma: { nodeId: String(a.nodeId), name: String(a.name ?? ''), type: 'IMAGE', w: a.width, h: a.height, parentId: a.parentId },
            prod: edge ? { file: edge.prodPath, path: edge.prodPath, classes: edge.classes } : undefined,
            evidence,
            targets: [],
            conflicts: [],
            payload: { refs: refs.map((r) => ({ file: r.file, kind: r.kind, snippet: r.snippet })) },
        };
        if (refs.length > 0) {
            evidence.push(`产物已引用该文件 ${refs.length} 处（${refs.map((r) => `${r.file}:${r.kind}`).join(', ')}）`);
            entry.targets = refs.map((r) => ({
                file: r.file,
                key: `${r.file}::ref:${a.fileName}`,
                action: 'noop',
                before: r.snippet,
                satisfied: true,
            }));
        }
        else {
            evidence.push('产物无任何引用 ⇒ 需要新增 <img src> / 图标变量绑定');
            entry.decision = 'skip';
            entry.skipReason = refs.length === 0 && !edge ? 'no-anchor' : 'needs-new-element';
            gaps.push({ kind: 'inline-image', figmaId: String(a.nodeId), detail: '产物无引用，需新增元素（当前计划不主张）' });
        }
        pushEntry(entry);
    }
    for (const c of truth.containers) {
        const evidence = [
            `Figma 容器「${c.name}」SOLID fill ${c.color}`,
            `子树文本 [${c.childTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`,
        ];
        const entry = {
            id: `fill/${c.nodeId}`,
            kind: 'fill-color',
            decision: 'apply',
            figma: { nodeId: String(c.nodeId), name: String(c.name ?? '') },
            evidence,
            targets: [],
            conflicts: [],
            payload: { color: c.color },
        };
        const edge = (0, e2n_map_1.findE2nEdge)(e2n, c.nodeId);
        if (!edge) {
            entry.decision = 'skip';
            entry.skipReason = 'no-e2n-edge';
            evidence.push('该容器在产物里没有结构映射');
            pushEntry(entry);
            gaps.push({ kind: 'container-fill', figmaId: String(c.nodeId), detail: '容器无 E2N 边' });
            continue;
        }
        evidence.push(`容器 → ${edge.prodPath} ${edge.classes.map((x) => `.${x}`).join('')}（${edge.how}，匹配 ${edge.matched} 文本）`);
        entry.prod = { file: edge.prodPath, classes: edge.classes };
        const resolved = resolveClassRules(index, edge);
        if (resolved.skip) {
            entry.decision = 'skip';
            entry.skipReason = resolved.skip;
            evidence.push(`落点解析失败：${resolved.detail}`);
            pushEntry(entry);
            continue;
        }
        const cls = resolved.cls;
        for (const h of resolved.hits) {
            const content = contentByPath.get(h.file.path) ?? h.file.content;
            const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
            const d = (0, e2n_map_1.readBgDecl)(body);
            const target = {
                file: h.file.path,
                key: `${h.file.path}::${h.rule.bodyStart}`,
                selector: (0, e2n_map_1.selKeyOf)(h.rule.selNorm),
                cls,
                action: 'set-background-color',
                after: c.color,
                satisfied: false,
            };
            if (d.kind === 'background' && d.hasUrl) {
                target.action = 'noop';
                target.before = d.value.trim();
                entry.conflicts.push({
                    entryId: `bg@${h.file.path}:${h.rule.bodyStart}`,
                    rule: 'background 是简写属性，只能有一个值',
                    resolution: '底图优先：本容器已由背景图通道接管，fill 色不再写入',
                });
            }
            else if (d.kind === 'none') {
                target.action = 'set-background-color';
                target.before = '(无背景声明)';
            }
            else {
                target.before = d.value.trim();
                target.satisfied = normColor(d.value) === normColor(c.color);
            }
            entry.targets.push(target);
        }
        pushEntry(entry);
    }
    for (const r of truth.fillRects ?? []) {
        const after = r.gradient ?? r.color;
        if (!after)
            continue;
        const isGradient = !!r.gradient;
        const evidence = [
            `Figma 叶子填充矩形「${r.name}」${Math.round(r.bbox.width)}×${Math.round(r.bbox.height)} ${isGradient ? '渐变' : '纯色'} ${after}`,
            `几何覆盖文本 ${r.coveredTexts.length} 条 [${r.coveredTexts.slice(0, 5).map((t) => `「${t}」`).join(' ')}${r.coveredTexts.length > 5 ? ' …' : ''}]`,
        ];
        const entry = {
            id: `fillrect/${r.nodeId}`,
            kind: 'fill-color',
            decision: 'apply',
            figma: { nodeId: String(r.nodeId), name: String(r.name ?? '') },
            evidence,
            targets: [],
            conflicts: [],
            payload: { color: after },
        };
        const edge = (0, e2n_map_1.anchorByCoveredTexts)(e2n, r.coveredTexts);
        if (!edge) {
            entry.decision = 'skip';
            entry.skipReason = 'no-anchor';
            evidence.push('覆盖文本在产物里没有共同祖先（分布在不同子树）');
            pushEntry(entry);
            gaps.push({ kind: 'container-fill', figmaId: String(r.nodeId), detail: '叶子填充矩形的覆盖文本无共同祖先' });
            continue;
        }
        evidence.push(`矩形 → ${edge.prodPath} ${edge.classes.map((x) => `.${x}`).join('')}（fill-rect-cover，覆盖 ${edge.matched} 文本）`);
        entry.prod = { file: edge.prodPath, classes: edge.classes };
        const resolved = resolveClassRules(index, edge);
        if (resolved.skip) {
            entry.decision = 'skip';
            entry.skipReason = resolved.skip;
            evidence.push(`落点解析失败：${resolved.detail}`);
            pushEntry(entry);
            continue;
        }
        const cls = resolved.cls;
        for (const h of resolved.hits) {
            const content = contentByPath.get(h.file.path) ?? h.file.content;
            const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
            const d = (0, e2n_map_1.readBgDecl)(body);
            const target = {
                file: h.file.path,
                key: `${h.file.path}::${h.rule.bodyStart}`,
                selector: (0, e2n_map_1.selKeyOf)(h.rule.selNorm),
                cls,
                action: 'set-background-color',
                after,
                satisfied: false,
            };
            if (d.kind === 'background' && d.hasUrl) {
                target.action = 'noop';
                target.before = d.value.trim();
                entry.conflicts.push({
                    entryId: `bg@${h.file.path}:${h.rule.bodyStart}`,
                    rule: 'background 是简写属性，只能有一个值',
                    resolution: '底图优先：该元素已由背景图通道接管，矩形 fill 不再写入',
                });
            }
            else if (d.kind === 'none') {
                target.before = '(无背景声明)';
            }
            else {
                target.before = d.value.trim();
                target.satisfied = isGradient
                    ? d.value.replace(/\s+/g, '') === after.replace(/\s+/g, '')
                    : normColor(d.value) === normColor(after);
                if (target.satisfied)
                    target.action = 'noop';
            }
            entry.targets.push(target);
        }
        pushEntry(entry);
    }
    {
        const seenSig = new Set();
        const handledGradIds = new Set((truth.fillRects ?? []).filter((r) => !!r.gradient).map((r) => String(r.nodeId)));
        const walkGrad = (n, parent) => {
            if (!n || typeof n !== 'object')
                return;
            const fills = Array.isArray(n.fills) ? n.fills.filter((f) => f?.visible !== false) : [];
            const isGrad = fills.some((f) => typeof f?.type === 'string' && f.type.startsWith('GRADIENT_'));
            const b = n.absoluteBoundingBox ?? {};
            const pb = parent?.absoluteBoundingBox ?? {};
            const containerLevel = typeof b.width === 'number' && typeof pb.width === 'number' &&
                Math.abs(b.width - pb.width) <= 1 && Math.abs(b.height - pb.height) <= 1;
            if (isGrad &&
                n.type !== 'TEXT' &&
                (containerLevel || /^bg$/i.test(String(n.name ?? ''))) &&
                !handledGradIds.has(String(n.id ?? ''))) {
                const sig = `${n.name}#${Math.round(Number(b.width) || 0)}x${Math.round(Number(b.height) || 0)}`;
                if (!seenSig.has(sig)) {
                    seenSig.add(sig);
                    gaps.push({
                        kind: 'gradient-fill',
                        figmaId: String(n.id ?? ''),
                        detail: `渐变 fill（${n.type}「${n.name}」${Math.round(Number(b.width) || 0)}×${Math.round(Number(b.height) || 0)}）—— 渐变真值未采集，产物里是猜的`,
                    });
                }
            }
            for (const c of n.children ?? [])
                walkGrad(c, n);
        };
        walkGrad(figmaRoot);
    }
    const seededProd = new Set();
    for (const seed of e2n.seeds) {
        const t = truth.texts.find((x) => x.nodeId === seed.figmaId);
        if (!t)
            continue;
        const hasTruth = !!(t.color || t.fontSize || (t.width && t.height));
        const node = e2n.prodNodes.find((p) => p.key === seed.prodKey);
        if (!node)
            continue;
        const content = contentByPath.get(node.path);
        if (content == null)
            continue;
        const openEnd = content.indexOf('>', node.start);
        const openTag = openEnd > node.start ? content.slice(node.start, openEnd + 1) : '';
        const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
        const style = styleM ? styleM[1] : '';
        const cssColor = t.color ? declaredProp(index, node.path, node.classes, 'color') : undefined;
        const cssFont = t.fontSize ? declaredProp(index, node.path, node.classes, 'font-size') : undefined;
        const colorOk = !t.color ||
            style.toLowerCase().includes(t.color.toLowerCase()) ||
            (!!cssColor && normColor(cssColor.value) === normColor(t.color));
        const fontOk = !t.fontSize ||
            new RegExp(`font-size\\s*:\\s*${Math.round(t.fontSize)}(?:\\.\\d+)?px`).test(style) ||
            (!!cssFont && Math.abs(parseFloat(cssFont.value) - t.fontSize) < 0.51);
        const cssProps = [
            t.color ? `color:${t.color}` : '',
            t.fontSize ? `font-size:${Math.round(t.fontSize)}px` : '',
        ].filter(Boolean);
        const wants = [...cssProps, t.width && t.height ? `size:${t.width}×${t.height}` : ''].filter(Boolean);
        const beforeParts = [];
        if (style)
            beforeParts.push(`inline: ${style}`);
        if (cssColor)
            beforeParts.push(`CSS color:${cssColor.value}`);
        if (cssFont)
            beforeParts.push(`CSS font-size:${cssFont.value}`);
        const before = beforeParts.length ? beforeParts.join(' / ') : '(无内联 style、无 CSS 声明)';
        const evidence = [`Figma TEXT「${t.characters}」真值 ${wants.join(' ')}（${seed.how}）`];
        const notStyleable = node.tag === 'template';
        const interpOnly = node.ownStatic.length === 0 && node.ownInterp.length > 0;
        if (notStyleable)
            evidence.push(`<${node.tag}> 是插槽/结构包装标签，不能写 style ⇒ 真值需落到内层元素`);
        if (interpOnly)
            evidence.push(`元素文本为插值 {{ }}，无静态锚点 ⇒ 执行器需按 seed 定位（非文本锚定）`);
        if (cssColor || cssFont) {
            evidence.push(`现状（CSS 规则）：${[cssColor && `color ${cssColor.value} @ ${cssColor.where}`, cssFont && `font-size ${cssFont.value} @ ${cssFont.where}`].filter(Boolean).join('，')}`);
        }
        if (seededProd.has(seed.prodKey))
            evidence.push('⚠ 同一产物元素被多个 Figma 文本 seed 命中（真值可能互相覆盖）');
        const colorExpr = !colorOk && isRuntimeExpr(cssColor?.value);
        const fontExpr = !fontOk && isRuntimeExpr(cssFont?.value);
        const colorBad = !colorOk && !colorExpr;
        const fontBad = !fontOk && !fontExpr;
        const undecidable = (colorExpr || fontExpr) && !colorBad && !fontBad;
        if (colorExpr || fontExpr) {
            evidence.push(`现状值不可静态判定：${[colorExpr && `color=${cssColor?.value}`, fontExpr && `font-size=${cssFont?.value}`].filter(Boolean).join('，')}（运行期表达式，需渲染后取值）`);
        }
        seededProd.add(seed.prodKey);
        const entry = {
            id: `txt/${seed.figmaId}`,
            kind: 'text-truth',
            decision: hasTruth && !notStyleable ? 'apply' : 'skip',
            skipReason: !hasTruth ? 'no-truth' : notStyleable ? 'not-styleable' : undefined,
            figma: { nodeId: seed.figmaId, name: '', type: 'TEXT', text: t.characters, w: t.width, h: t.height },
            prod: { file: node.path, tag: node.tag, classes: node.classes },
            evidence,
            targets: [
                {
                    file: node.path,
                    key: `${node.path}#${node.start}`,
                    cls: node.classes[0],
                    action: hasTruth && !notStyleable && !(colorOk && fontOk) ? 'set-inline-style' : 'noop',
                    before,
                    after: cssProps.join('; '),
                    satisfied: hasTruth ? colorOk && fontOk : true,
                    ...(undecidable ? { undecidable: true } : {}),
                },
            ],
            conflicts: [],
            payload: { truth: { color: t.color, fontSize: t.fontSize, width: t.width, height: t.height }, interpOnly, undecidable },
        };
        pushEntry(entry);
    }
    const byKey = new Map();
    for (const e of entries) {
        if (e.decision !== 'apply')
            continue;
        for (const t of e.targets) {
            if (t.action === 'noop')
                continue;
            const key = t.key;
            const arr = byKey.get(key) ?? [];
            if (!arr.includes(e))
                arr.push(e);
            byKey.set(key, arr);
        }
    }
    let conflictCount = 0;
    for (const [key, list] of byKey) {
        if (list.length < 2)
            continue;
        list.sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind]);
        const winner = list[0];
        for (const loser of list.slice(1)) {
            const prop = loser.kind === 'fill-color' ? 'background' : 'inline-style';
            conflictCount += 1;
            loser.decision = 'skip';
            loser.skipReason = 'conflict-lost';
            loser.conflicts.push({
                entryId: winner.id,
                rule: `同一落点 ${key} 争用 ${prop}（${winner.kind} vs ${loser.kind}）`,
                resolution: `${winner.kind} 优先（同属性只能有一个值），${loser.kind} 让位`,
            });
            winner.conflicts.push({
                entryId: loser.id,
                rule: `同一落点 ${key} 争用 ${prop}`,
                resolution: `${winner.kind} 胜出，${loser.kind} 让位`,
            });
            byKind[loser.kind].apply -= 1;
            byKind[loser.kind].skip += 1;
        }
    }
    const apply = entries.filter((x) => x.decision === 'apply');
    const satisfied = apply.filter((x) => x.targets.length > 0 && x.targets.every((t) => t.satisfied)).length;
    const undecidable = entries.filter((x) => x.targets.some((t) => t.undecidable)).length;
    return {
        builtAt: opts.now ?? new Date().toISOString(),
        stats: {
            entries: entries.length,
            apply: apply.length,
            skip: entries.length - apply.length,
            satisfied,
            undecidable,
            byKind,
            conflicts: conflictCount,
            gaps: gaps.length,
        },
        entries,
        gaps,
    };
}
const KIND_LABEL = {
    'bg-image': '背景图（替换背景）',
    'inline-image': '静态图（元素级）',
    'fill-color': '背景色（容器 fill）',
    'text-truth': '文本真值（颜色/字号）',
};
const ACTION_LABEL = {
    'replace-gradient': '渐变→整条替换',
    'replace-color': '纯色→整条替换',
    'replace-bg-color': 'background-color→改写',
    insert: '插入 background',
    'replace-url': '换图',
    'layer-url': '叠图（留底色）',
    'set-src': '设 src',
    'set-background-color': '换背景色',
    'set-inline-style': '写内联 style',
    noop: '已满足',
};
function renderPlanMarkdown(plan) {
    const L = [];
    const s = plan.stats;
    L.push('# 回填计划（只读）');
    L.push('');
    L.push(`生成时间：${plan.builtAt}`);
    L.push('');
    L.push(`总条目 ${s.entries}｜执行 ${s.apply}（其中已满足 ${s.satisfied}）｜跳过 ${s.skip}｜冲突 ${s.conflicts}｜事实缺口 ${s.gaps}`);
    L.push('');
    L.push('| 类别 | 候选 | 执行 | 跳过 | 已满足 |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const k of ['bg-image', 'inline-image', 'fill-color', 'text-truth']) {
        const b = s.byKind[k];
        L.push(`| ${KIND_LABEL[k]} | ${b.candidates} | ${b.apply} | ${b.skip} | ${b.satisfied} |`);
    }
    for (const kind of ['bg-image', 'fill-color', 'inline-image']) {
        const list = plan.entries.filter((e) => e.kind === kind);
        if (list.length === 0)
            continue;
        L.push('');
        L.push(`## ${KIND_LABEL[kind]}（${list.length}）`);
        L.push('');
        L.push('| Figma | 产物落点 | 动作 | 现状 → 计划 | 判定 |');
        L.push('| --- | --- | --- | --- | --- |');
        for (const e of list) {
            const fig = `${e.figma.nodeId} ${e.figma.name || ''}${e.figma.text ? `「${e.figma.text}」` : ''}`.trim();
            const groups = new Map();
            for (const t of e.targets) {
                const gk = `${t.file}::${t.cls ?? t.selector ?? ''}`;
                const arr = groups.get(gk) ?? [];
                arr.push(t);
                groups.set(gk, arr);
            }
            const prod = groups.size
                ? [...groups.values()].map((ts) => {
                    const t = ts[0];
                    const label = `${t.file}${t.cls ? ` .${t.cls}` : t.selector ? ` ${t.selector}` : ''}`;
                    return `${label}${ts.length > 1 ? ` ×${ts.length} 投影` : ''}`;
                }).join('<br>')
                : (e.prod?.classes ?? []).map((c) => `.${c}`).join('') || '—';
            const act = e.targets.length ? [...new Set(e.targets.map((t) => ACTION_LABEL[t.action]))].join(' / ') : '—';
            const flow = e.targets.length
                ? [...groups.values()]
                    .map((ts) => {
                    const befores = [...new Set(ts.map((t) => t.before ?? '—'))];
                    return `${befores.join(' ¦ ')} → ${ts[0].after ?? (ts[0].action === 'noop' ? '（已是目标态）' : '—')}`;
                })
                    .join('<br>')
                : '—';
            const allDone = e.targets.length > 0 && e.targets.every((t) => t.satisfied);
            const verdict = e.decision === 'apply' ? (allDone ? '✅ 已满足' : '🟡 待执行') : `⏭ ${e.skipReason}`;
            L.push(`| ${fig} | ${prod} | ${act} | ${flow} | ${verdict} |`);
        }
    }
    const bgList = plan.entries.filter((e) => e.kind === 'bg-image');
    if (bgList.length > 0) {
        L.push('');
        L.push('### 背景图逐条依据');
        for (const e of bgList) {
            L.push('');
            L.push(`**${e.figma.nodeId} ${e.figma.name}${e.figma.parentId ? `（父容器 ${e.figma.parentId}）` : ''}** — ${e.decision === 'apply' ? '计划执行' : `跳过：${e.skipReason}`}`);
            for (const ev of e.evidence)
                L.push(`- ${ev}`);
            for (const c of e.conflicts)
                L.push(`- 冲突：${c.rule} ⇒ ${c.resolution}`);
        }
    }
    const texts = plan.entries.filter((e) => e.kind === 'text-truth');
    if (texts.length > 0) {
        const pending = texts.filter((e) => e.decision === 'apply' && e.targets.some((t) => !t.satisfied));
        const undec = pending.filter((e) => e.targets[0]?.undecidable);
        const todo = pending.filter((e) => !e.targets[0]?.undecidable);
        const done = texts.length - pending.length;
        L.push('');
        L.push(`## ${KIND_LABEL['text-truth']}（${texts.length}：已满足 ${done} / 待写 ${todo.length} / 不可静态判定 ${undec.length}）`);
        for (const [title, list] of [
            ['待写', todo],
            ['不可静态判定（现状是 calc()/var() 表达式，需渲染后取值）', undec],
        ]) {
            if (list.length === 0)
                continue;
            L.push('');
            L.push(`**${title}**`);
            L.push('');
            L.push('| Figma 文本 | 产物元素 | 现状 → 计划 |');
            L.push('| --- | --- | --- |');
            for (const e of list.slice(0, 40)) {
                const t = e.targets[0];
                const mark = e.payload?.interpOnly ? ' ⚠插值' : '';
                L.push(`| 「${String(e.figma.text).replace(/\n/g, '⏎')}」 | ${e.prod?.file} <${e.prod?.tag}> .${(e.prod?.classes ?? []).join('.')}${mark} | ${t.before} → ${t.after} |`);
            }
        }
    }
    if (plan.gaps.length > 0) {
        L.push('');
        L.push(`## 事实缺口（${plan.gaps.length}）—— 这些没法定，需要补判据`);
        L.push('');
        for (const g of plan.gaps)
            L.push(`- \`${g.kind}\` ${g.figmaId ?? ''}：${g.detail}`);
    }
    L.push('');
    return L.join('\n');
}
//# sourceMappingURL=backfill-plan.js.map