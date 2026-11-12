"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectNodeStyleTruth = collectNodeStyleTruth;
exports.collectSiblingFillVariants = collectSiblingFillVariants;
exports.detectUnsourcedStyles = detectUnsourcedStyles;
exports.renderUnsourcedMarkdown = renderUnsourcedMarkdown;
exports.unsourcedStatsLine = unsourcedStatsLine;
exports.isAutoApplicable = isAutoApplicable;
exports.countAutoApplicable = countAutoApplicable;
const e2n_map_1 = require("./e2n-map");
const truth_matcher_1 = require("./truth-matcher");
const SHAPE_TYPES = new Set(['RECTANGLE', 'VECTOR', 'ELLIPSE', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON']);
function bboxOf(node) {
    const bb = node?.absoluteBoundingBox;
    if (!bb || typeof bb.width !== 'number' || typeof bb.height !== 'number')
        return undefined;
    return { x: bb.x ?? 0, y: bb.y ?? 0, width: bb.width, height: bb.height };
}
function hex255(v) {
    return Math.max(0, Math.min(255, Math.round(v * 255)));
}
function fillToCss(fill) {
    if (!fill || fill.visible === false)
        return undefined;
    if (fill.type === 'SOLID' && fill.color) {
        const { r, g, b } = fill.color;
        const a = typeof fill.opacity === 'number' ? fill.opacity : (fill.color.a ?? 1);
        const hex = `#${hex255(r).toString(16).padStart(2, '0')}${hex255(g)
            .toString(16)
            .padStart(2, '0')}${hex255(b).toString(16).padStart(2, '0')}`;
        return a < 1 ? `${hex}@${Math.round(a * 100)}%` : hex;
    }
    if (typeof fill.type === 'string' && fill.type.startsWith('GRADIENT') && Array.isArray(fill.gradientStops)) {
        const stops = fill.gradientStops
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((s) => {
            const c = s.color ?? {};
            const a = typeof s.opacity === 'number' ? s.opacity : (c.a ?? 1);
            const hex = `#${hex255(c.r ?? 0).toString(16).padStart(2, '0')}${hex255(c.g ?? 0)
                .toString(16)
                .padStart(2, '0')}${hex255(c.b ?? 0).toString(16).padStart(2, '0')}`;
            const pa = typeof fill.opacity === 'number' ? fill.opacity : a;
            return pa < 1 ? `${hex}@${Math.round(pa * 100)}%` : hex;
        });
        return `gradient(${stops.join('→')})`;
    }
    if (fill.type === 'IMAGE')
        return 'image';
    return undefined;
}
function visibleFillCssOf(node) {
    const fills = Array.isArray(node?.fills) ? node.fills : [];
    return fills.map(fillToCss).filter((x) => !!x);
}
function hasVisibleStroke(node) {
    const strokes = Array.isArray(node?.strokes) ? node.strokes : [];
    return strokes.some((s) => {
        if (!s || s.visible === false)
            return false;
        if (s.type === 'SOLID' && s.color)
            return (s.color.a ?? 1) > 0.01;
        return typeof s.type === 'string' && s.type.startsWith('GRADIENT');
    });
}
function hasVisibleShadow(node) {
    const effects = Array.isArray(node?.effects) ? node.effects : [];
    return effects.some((e) => e &&
        e.visible !== false &&
        (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') &&
        typeof e.radius === 'number' &&
        e.radius > 0);
}
function cornerRadiusOf(node) {
    if (typeof node?.cornerRadius === 'number')
        return node.cornerRadius;
    const radii = node?.rectangleCornerRadii;
    if (Array.isArray(radii) && radii.length > 0) {
        const max = Math.max(...radii.filter((n) => typeof n === 'number'));
        return Number.isFinite(max) ? max : null;
    }
    return null;
}
function findCoveringShapeLayer(parent, depth = 0, origin) {
    if (!parent || depth > 2)
        return undefined;
    const anchor = origin ?? parent;
    const pb = bboxOf(anchor);
    if (!pb)
        return undefined;
    const kids = Array.isArray(parent.children) ? parent.children : [];
    for (const c of kids) {
        if (!c || typeof c !== 'object')
            continue;
        const cb = bboxOf(c);
        const isShape = SHAPE_TYPES.has(String(c.type || '').toUpperCase());
        if (isShape && cb) {
            const tol = 2;
            const covers = Math.abs(cb.width - pb.width) <= tol &&
                Math.abs(cb.height - pb.height) <= tol &&
                Math.abs(cb.x - pb.x) <= tol &&
                Math.abs(cb.y - pb.y) <= tol;
            if (covers)
                return c;
        }
        const deep = findCoveringShapeLayer(c, depth + 1, anchor);
        if (deep)
            return deep;
    }
    return undefined;
}
function hasThinRuleShape(node, depth = 0) {
    if (!node || depth > 3)
        return false;
    const pb = bboxOf(node);
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const c of kids) {
        if (!c || typeof c !== 'object')
            continue;
        const cb = bboxOf(c);
        if (pb && cb && cb.width >= pb.width * 0.8 && cb.height <= 4 && visibleFillCssOf(c).length > 0) {
            return true;
        }
        if (hasThinRuleShape(c, depth + 1))
            return true;
    }
    return false;
}
function collectNodeStyleTruth(figmaRoot, nodeId) {
    const node = (0, truth_matcher_1.findNodeById)(figmaRoot, nodeId);
    if (!node)
        return undefined;
    const selfFills = visibleFillCssOf(node);
    const layer = selfFills.length === 0 ? findCoveringShapeLayer(node) : undefined;
    const effective = layer ?? node;
    const fills = visibleFillCssOf(effective);
    const radius = cornerRadiusOf(effective) ?? cornerRadiusOf(node);
    return {
        hasFill: fills.length > 0,
        hasStroke: hasVisibleStroke(effective) || hasVisibleStroke(node),
        cornerRadius: radius,
        hasShadow: hasVisibleShadow(effective) || hasVisibleShadow(node),
        hasRuleShape: hasThinRuleShape(node),
        sourceNodeId: effective.id ?? node.id,
        fillCss: fills.length > 0 ? fills.join(' | ') : undefined,
    };
}
function collectSiblingFillVariants(figmaRoot, nodeId) {
    const node = (0, truth_matcher_1.findNodeById)(figmaRoot, nodeId);
    const bb = bboxOf(node);
    if (!node || !bb)
        return undefined;
    let parent;
    const walk = (n) => {
        if (!n || typeof n !== 'object' || parent)
            return;
        for (const c of Array.isArray(n.children) ? n.children : []) {
            if (c?.id === nodeId) {
                parent = n;
                return;
            }
            walk(c);
        }
    };
    walk(figmaRoot);
    if (!parent)
        return undefined;
    const sibs = (Array.isArray(parent.children) ? parent.children : []).filter((c) => {
        if (!c || String(c.type || '') !== String(node.type || ''))
            return false;
        const cb = bboxOf(c);
        return cb && Math.abs(cb.width - bb.width) <= 1 && Math.abs(cb.height - bb.height) <= 1;
    });
    if (sibs.length < 2)
        return undefined;
    const variants = sibs.map((c) => {
        const self = visibleFillCssOf(c);
        if (self.length > 0)
            return self.join('|');
        const layer = findCoveringShapeLayer(c);
        const viaLayer = layer ? visibleFillCssOf(layer) : [];
        return viaLayer.length > 0 ? viaLayer.join('|') : '(none)';
    });
    return variants;
}
function readHighRiskDecls(body, baseOffset = 0) {
    const out = [];
    const declRe = /([-a-zA-Z]+)\s*:\s*([^;{}]+)(?=;|$)/g;
    let m;
    while ((m = declRe.exec(body)) !== null) {
        const rawProp = m[1].trim();
        const propLower = rawProp.toLowerCase();
        const rawValue = m[2];
        const value = rawValue.trim();
        if (!value)
            continue;
        const rawStart = m.index + m[0].length - rawValue.length;
        const lead = rawValue.length - rawValue.trimStart().length;
        const valueStart = baseOffset + rawStart + lead;
        const valueEnd = valueStart + value.length;
        let s = m.index;
        while (s > 0 && (body[s - 1] === ' ' || body[s - 1] === '\t'))
            s -= 1;
        if (s > 0 && body[s - 1] === '\n')
            s -= 1;
        let e = m.index + m[0].length;
        while (e < body.length && (body[e] === ' ' || body[e] === '\t'))
            e += 1;
        if (body[e] === ';')
            e += 1;
        let prop;
        if (propLower === 'background' || propLower === 'background-color') {
            prop = 'background';
        }
        else if (propLower === 'border-radius') {
            prop = 'border-radius';
        }
        else if (propLower === 'box-shadow') {
            prop = 'box-shadow';
        }
        else if (propLower === 'border' || propLower.startsWith('border-')) {
            prop = 'border';
        }
        else {
            continue;
        }
        out.push({
            prop,
            rawProp,
            value,
            declStart: baseOffset + s,
            declEnd: baseOffset + e,
            valueStart,
            valueEnd,
        });
    }
    return out;
}
function firstPx(value) {
    const m = value.match(/(-?\d+(?:\.\d+)?)\s*px/);
    return m ? Number(m[1]) : null;
}
function isBackgroundManagedElsewhere(value) {
    const v = value.toLowerCase();
    if (v.includes('url('))
        return true;
    if (v.includes('var('))
        return true;
    if (v.trim() === 'transparent' || v.trim() === 'none')
        return true;
    if (v.includes('gradient('))
        return true;
    return false;
}
function detectUnsourcedStyles(opts) {
    const findings = [];
    const stats = {
        classesScanned: 0,
        classesSkipped: 0,
        unmappedRiskClasses: [],
        findings: 0,
        delete: 0,
        override: 0,
        fanout: 0,
        byProp: { background: 0, border: 0, 'border-radius': 0, 'box-shadow': 0 },
    };
    const { figmaRoot, prodFiles } = opts;
    if (!figmaRoot || prodFiles.length === 0)
        return { findings, stats };
    const index = (0, e2n_map_1.buildStyleRuleIndex)(prodFiles);
    const classToFigmas = new Map();
    for (const edge of opts.e2n?.nodes ?? []) {
        const area = (() => {
            const bb = bboxOf((0, truth_matcher_1.findNodeById)(figmaRoot, edge.figmaId));
            return bb ? bb.width * bb.height : 0;
        })();
        for (const cls of edge.classes ?? []) {
            if (!cls)
                continue;
            const list = classToFigmas.get(cls) ?? [];
            if (!list.some((x) => x.figmaId === edge.figmaId)) {
                list.push({ figmaId: edge.figmaId, figmaName: edge.figmaName, area });
            }
            classToFigmas.set(cls, list);
        }
    }
    if (classToFigmas.size === 0)
        return { findings, stats };
    const truthCache = new Map();
    const variantCache = new Map();
    const realClasses = new Set();
    for (const f of prodFiles) {
        for (const m of f.content.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
            for (const t of m[1].split(/\s+/))
                if (t)
                    realClasses.add(t);
        }
        for (const m of f.content.matchAll(/:class\s*=\s*"\{([^}]*)\}"/g)) {
            for (const k of m[1].matchAll(/['"]([\w-]+)['"]\s*:/g))
                realClasses.add(k[1]);
        }
    }
    const declaredRiskClasses = new Set();
    for (const f of index.files) {
        for (const rule of f.rules) {
            const body = f.content.slice(rule.bodyStart, rule.bodyEnd);
            if (readHighRiskDecls(body).length === 0)
                continue;
            const selBase = rule.selNorm.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '');
            for (const token of selBase.match(/\.[\w-]+/g) ?? []) {
                const cls = token.slice(1);
                if (realClasses.size > 0 && !realClasses.has(cls))
                    continue;
                declaredRiskClasses.add(cls);
            }
        }
    }
    for (const [cls, candidates] of classToFigmas) {
        const hits = (0, e2n_map_1.findClassRuleHits)(index, cls);
        if (hits.length === 0)
            continue;
        stats.classesScanned += 1;
        const ranked = candidates.slice().sort((a, b) => b.area - a.area);
        const mapped = ranked[0];
        if (!truthCache.has(mapped.figmaId)) {
            truthCache.set(mapped.figmaId, collectNodeStyleTruth(figmaRoot, mapped.figmaId));
        }
        const truth = truthCache.get(mapped.figmaId);
        if (!truth) {
            stats.classesSkipped += 1;
            continue;
        }
        const instanceFills = candidates
            .map((c) => {
            if (!truthCache.has(c.figmaId)) {
                truthCache.set(c.figmaId, collectNodeStyleTruth(figmaRoot, c.figmaId));
            }
            return truthCache.get(c.figmaId)?.fillCss ?? '(none)';
        })
            .filter((x) => !!x);
        for (const hit of hits) {
            const body = hit.file.content.slice(hit.rule.bodyStart, hit.rule.bodyEnd);
            const selector = (0, e2n_map_1.selKeyOf)(hit.rule.selNorm);
            for (const decl of readHighRiskDecls(body, hit.rule.bodyStart)) {
                const finding = judge({
                    cls,
                    mapped,
                    truth,
                    decl,
                    file: hit.file.path,
                    selector,
                    bodyStart: hit.rule.bodyStart,
                    bodyEnd: hit.rule.bodyEnd,
                    figmaRoot,
                    variantCache,
                    instanceFills,
                });
                if (!finding)
                    continue;
                findings.push(finding);
                stats.findings += 1;
                stats[finding.verdict] += 1;
                stats.byProp[finding.prop] += 1;
            }
        }
    }
    stats.unmappedRiskClasses = [...declaredRiskClasses]
        .filter((c) => !classToFigmas.has(c))
        .sort();
    return { findings, stats };
}
function judge(args) {
    const { cls, mapped, truth, decl, file, selector, bodyStart, bodyEnd, figmaRoot, variantCache, instanceFills, } = args;
    const base = {
        file,
        selector,
        cls,
        figmaId: mapped.figmaId,
        figmaName: mapped.figmaName,
        prop: decl.prop,
        rawProp: decl.rawProp,
        value: decl.value,
        bodyStart,
        bodyEnd,
        declStart: decl.declStart,
        declEnd: decl.declEnd,
        valueStart: decl.valueStart,
        valueEnd: decl.valueEnd,
    };
    if (decl.prop === 'background') {
        if (isBackgroundManagedElsewhere(decl.value))
            return undefined;
        if (!truth.hasFill) {
            return {
                ...base,
                verdict: 'delete',
                evidence: `Figma 节点 ${mapped.figmaId} 自身及其覆盖形状层均无可见 fill ⇒ background 无真值来源`,
            };
        }
        const uniqInstance = [...new Set(instanceFills)];
        if (instanceFills.length >= 2 && uniqInstance.length > 1) {
            return {
                ...base,
                verdict: 'fanout',
                evidence: `同一 class 对应 ${instanceFills.length} 个 Figma 实例，fill 不一致（${uniqInstance.join(' / ')}）⇒ ` +
                    `单个 class 无法表达，当前值只对应其中一类`,
            };
        }
        if (!variantCache.has(mapped.figmaId)) {
            variantCache.set(mapped.figmaId, collectSiblingFillVariants(figmaRoot, mapped.figmaId));
        }
        const variants = variantCache.get(mapped.figmaId);
        if (variants && variants.length >= 2) {
            const uniq = [...new Set(variants)];
            if (uniq.length > 1) {
                return {
                    ...base,
                    verdict: 'fanout',
                    evidence: `同构兄弟 ${variants.length} 个实例的 fill 不一致（${uniq.join(' / ')}）⇒ ` +
                        `单个 class 无法表达，当前值只对应其中一类`,
                };
            }
        }
        return undefined;
    }
    if (decl.prop === 'border-radius') {
        const px = firstPx(decl.value);
        if (truth.cornerRadius == null) {
            return {
                ...base,
                verdict: 'delete',
                evidence: `Figma 节点 ${mapped.figmaId} 及形状层均未设置 cornerRadius ⇒ 圆角无真值来源`,
            };
        }
        if (px != null && Math.abs(px - truth.cornerRadius) > 0.5) {
            return {
                ...base,
                verdict: 'override',
                truthValue: `${truth.cornerRadius}px`,
                evidence: `真值 cornerRadius=${truth.cornerRadius}px（${truth.sourceNodeId}），产物 ${px}px`,
            };
        }
        return undefined;
    }
    if (decl.prop === 'border') {
        if (truth.hasStroke)
            return undefined;
        if (truth.hasRuleShape) {
            return undefined;
        }
        return {
            ...base,
            verdict: 'delete',
            evidence: `Figma 节点 ${mapped.figmaId} 及形状层 strokes 为空、子树亦无细长填充形状 ⇒ 边框无真值来源`,
        };
    }
    if (decl.prop === 'box-shadow') {
        if (!truth.hasShadow) {
            return {
                ...base,
                verdict: 'delete',
                evidence: `Figma 节点 ${mapped.figmaId} 及形状层无可见 DROP_SHADOW/INNER_SHADOW effect ⇒ 阴影无真值来源`,
            };
        }
        return undefined;
    }
    return undefined;
}
const VERDICT_LABEL = {
    delete: '应删除（无真值来源）',
    override: '应覆盖（真值不符）',
    fanout: '应拆类（多实例真值不一致）',
};
const PROP_LABEL = {
    background: '背景',
    border: '边框',
    'border-radius': '圆角',
    'box-shadow': '阴影',
};
function renderUnsourcedMarkdown(findings, stats) {
    const lines = [];
    lines.push('## 无源样式检测');
    lines.push('');
    lines.push(`扫描 ${stats.classesScanned} 个有映射的类名（跳过 ${stats.classesSkipped} 个未定位节点），` +
        `命中 **${stats.findings}** 处：应删除 ${stats.delete} / 应覆盖 ${stats.override} / 应拆类 ${stats.fanout}。`);
    if (findings.length === 0) {
        lines.push('');
        lines.push('未发现无真值来源的视觉声明。');
    }
    else {
        lines.push('');
        lines.push('| 类名 | 属性 | 产物值 | 判定 | 图节点 | 判据 |');
        lines.push('|---|---|---|---|---|---|');
        for (const f of findings) {
            lines.push(`| \`${f.cls}\` | ${PROP_LABEL[f.prop]} | \`${f.value.slice(0, 40)}\` | ${VERDICT_LABEL[f.verdict]} | ` +
                `${f.figmaId} ${f.figmaName} | ${f.evidence} |`);
        }
    }
    if (stats.unmappedRiskClasses.length > 0) {
        lines.push('');
        lines.push(`> ⚠️ 以下 ${stats.unmappedRiskClasses.length} 个类名声明了视觉属性但**没有 Figma 节点映射**，` +
            `本闸未覆盖（须先补 E2N 覆盖）：\`${stats.unmappedRiskClasses.join('`, `')}\``);
    }
    lines.push('');
    return lines.join('\n');
}
function unsourcedStatsLine(stats) {
    return (`unsourcedScanned=${stats.classesScanned},unsourcedFindings=${stats.findings},` +
        `unsourcedDelete=${stats.delete},unsourcedOverride=${stats.override},` +
        `unsourcedFanout=${stats.fanout},unsourcedUnmapped=${stats.unmappedRiskClasses.length}`);
}
function isAutoApplicable(f) {
    if (f.verdict === 'delete')
        return f.prop === 'box-shadow';
    if (f.verdict === 'override')
        return f.prop === 'border-radius' && !!f.truthValue;
    return false;
}
function countAutoApplicable(findings) {
    return findings.filter(isAutoApplicable).length;
}
//# sourceMappingURL=unsourced-style.js.map