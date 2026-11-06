"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRIP_MIN_WIDTH_PX = void 0;
exports.normalizeAnchorText = normalizeAnchorText;
exports.gradientFillToCss = gradientFillToCss;
exports.findParentFillById = findParentFillById;
exports.subtreeTextsOf = subtreeTextsOf;
exports.collectAncestorTexts = collectAncestorTexts;
exports.collectAssetParentMeta = collectAssetParentMeta;
exports.collectFigmaTruth = collectFigmaTruth;
exports.findNodeIdBySuffix = findNodeIdBySuffix;
exports.findNodeById = findNodeById;
exports.buildNodeTextContext = buildNodeTextContext;
exports.buildImageRefIndex = buildImageRefIndex;
exports.extractTemplateRange = extractTemplateRange;
exports.backfillSfcFiles = backfillSfcFiles;
exports.importDepthFor = importDepthFor;
exports.mountAssetIcons = mountAssetIcons;
exports.bgFileNameCore = bgFileNameCore;
exports.collectStyleRulesFromContent = collectStyleRulesFromContent;
exports.aiAnchorBackgroundAssets = aiAnchorBackgroundAssets;
exports.parseTemplateTree = parseTemplateTree;
exports.classMatchesSelector = classMatchesSelector;
exports.backfillContainerFill = backfillContainerFill;
exports.byVisualOrder = byVisualOrder;
exports.classifyAsset = classifyAsset;
exports.isBgClassAsset = isBgClassAsset;
exports.isIconClassAsset = isIconClassAsset;
exports.backfillScriptOptionTruth = backfillScriptOptionTruth;
exports.relocatePanelTitle = relocatePanelTitle;
exports.clearRootContentBackground = clearRootContentBackground;
function normalizeAnchorText(s) {
    return String(s || '')
        .replace(/[\s\u3000]+/g, '')
        .trim();
}
function figmaColorToCss(fill) {
    if (!fill || fill.type !== 'SOLID' || !fill.color)
        return undefined;
    const { r, g, b } = fill.color;
    const a = typeof fill.opacity === 'number' ? fill.opacity : fill.color.a ?? 1;
    const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    if (a >= 0.99) {
        const hex = (v) => to255(v).toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }
    return `rgba(${to255(r)},${to255(g)},${to255(b)},${Number(a.toFixed(2))})`;
}
function solidFillOfNode(node) {
    const fill = Array.isArray(node.fills)
        ? node.fills.find((f) => f.type === 'SOLID' && f.visible !== false)
        : undefined;
    if (!fill)
        return undefined;
    const opacity = typeof fill.opacity === 'number' ? fill.opacity : 1;
    if (opacity < 0.05)
        return undefined;
    const color = figmaColorToCss(fill);
    return color ? { color, opacity } : undefined;
}
function gradientFillToCss(node) {
    const fill = Array.isArray(node?.fills)
        ? node.fills.find((f) => typeof f?.type === 'string' && f.type.startsWith('GRADIENT_') && f.visible !== false)
        : undefined;
    if (!fill)
        return undefined;
    const stops = (fill.gradientStops ?? [])
        .map((s) => {
        const c = figmaColorToCss({ type: 'SOLID', color: s?.color });
        if (!c)
            return undefined;
        const p = Number(s?.position);
        return `${c} ${Math.round((Number.isFinite(p) ? p : 0) * 100)}%`;
    })
        .filter((x) => !!x);
    if (stops.length < 2)
        return undefined;
    const h = fill.gradientHandlePositions;
    let deg = 180;
    if (Array.isArray(h) && h.length >= 2) {
        const dx = Number(h[1]?.x) - Number(h[0]?.x);
        const dy = Number(h[1]?.y) - Number(h[0]?.y);
        if (Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0)) {
            deg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
        }
    }
    if (fill.type === 'GRADIENT_RADIAL')
        return `radial-gradient(circle, ${stops.join(', ')})`;
    if (fill.type === 'GRADIENT_ANGULAR')
        return `conic-gradient(from ${deg}deg, ${stops.join(', ')})`;
    return `linear-gradient(${deg}deg, ${stops.join(', ')})`;
}
function findParentFillById(root, nodeId) {
    const dfs = (node, parent) => {
        if (!node || typeof node !== 'object')
            return undefined;
        if (node.id === nodeId) {
            if (!parent)
                return null;
            return solidFillOfNode(parent) ?? null;
        }
        for (const c of node.children ?? []) {
            const r = dfs(c, node);
            if (r !== undefined)
                return r;
        }
        return undefined;
    };
    return dfs(root, undefined);
}
function subtreeTextsOf(root) {
    const out = [];
    const rec = (n) => {
        if (!n || typeof n !== 'object')
            return;
        if (n.type === 'TEXT' && typeof n.characters === 'string') {
            const t = n.characters.trim();
            if (t && !out.includes(t))
                out.push(t);
        }
        for (const c of n.children ?? [])
            rec(c);
    };
    rec(root);
    return out;
}
const nodeIndexCache = new WeakMap();
function nodeIndexOf(root) {
    const cached = nodeIndexCache.get(root);
    if (cached)
        return cached;
    const parentOf = new Map();
    const byId = new Map();
    const stack = [root];
    while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object')
            continue;
        if (typeof n.id === 'string')
            byId.set(n.id, n);
        for (const c of n.children ?? []) {
            if (c && typeof c === 'object') {
                parentOf.set(c, n);
                stack.push(c);
            }
        }
    }
    const idx = { parentOf, byId };
    nodeIndexCache.set(root, idx);
    return idx;
}
function collectAncestorTexts(root, nodeId, opts = {}) {
    const hops = opts.hops ?? 3;
    const cap = opts.cap ?? 12;
    const { parentOf, byId } = nodeIndexOf(root);
    let cur = parentOf.get(byId.get(nodeId));
    for (let hop = 0; hop < hops && cur; hop += 1) {
        const t = subtreeTextsOf(cur);
        if (t.length > 0)
            return t.slice(0, cap);
        cur = parentOf.get(cur);
    }
    return [];
}
function collectAssetParentMeta(root, nodeId, opts = {}) {
    const tol = opts.tolPx ?? 1;
    const { parentOf, byId } = nodeIndexOf(root);
    const node = byId.get(nodeId);
    const parent = node ? parentOf.get(node) : undefined;
    const parentTexts = collectAncestorTexts(root, nodeId);
    if (!parent)
        return { containerLevel: false, parentTexts };
    const nb = node.absoluteBoundingBox ?? {};
    const pb = parent.absoluteBoundingBox ?? {};
    const containerLevel = typeof nb.width === 'number' && typeof nb.height === 'number' &&
        typeof pb.width === 'number' && typeof pb.height === 'number' &&
        Math.abs(nb.width - pb.width) <= tol &&
        Math.abs(nb.height - pb.height) <= tol;
    return {
        parentId: typeof parent.id === 'string' ? parent.id : undefined,
        parentBox: typeof pb.width === 'number' && typeof pb.height === 'number'
            ? { width: pb.width, height: pb.height }
            : undefined,
        containerLevel,
        parentTexts,
    };
}
function collectFigmaTruth(root) {
    const texts = [];
    const assets = [];
    const containers = [];
    const pendingContainers = [];
    let containerCount = 0;
    const siblingTextsOf = (parent) => Array.isArray(parent?.children)
        ? parent.children
            .filter((c) => c?.type === 'TEXT' && typeof c.characters === 'string')
            .map((c) => c.characters)
        : [];
    const solidFillOf = (node) => solidFillOfNode(node);
    const walk = (node, parent, grandparent) => {
        if (!node || typeof node !== 'object')
            return;
        const bbox = node.absoluteBoundingBox;
        if (node.type === 'TEXT') {
            const t = {
                nodeId: node.id,
                characters: String(node.characters ?? ''),
            };
            const fontSize = node.style?.fontSize;
            if (typeof fontSize === 'number' && fontSize > 0)
                t.fontSize = fontSize;
            const fill = Array.isArray(node.fills)
                ? node.fills.find((f) => f.type === 'SOLID' && f.visible !== false)
                : undefined;
            const color = figmaColorToCss(fill);
            if (color)
                t.color = color;
            if (bbox) {
                t.width = Math.round(bbox.width);
                t.height = Math.round(bbox.height);
                t.x = Math.round(bbox.x);
                t.y = Math.round(bbox.y);
            }
            texts.push(t);
            return;
        }
        const imageFill = Array.isArray(node.fills)
            ? node.fills.find((f) => f.type === 'IMAGE' && f.visible !== false)
            : undefined;
        if (imageFill) {
            const sib = siblingTextsOf(parent);
            const a = {
                nodeId: node.id,
                name: String(node.name ?? ''),
                imageRef: imageFill.imageRef,
                width: bbox ? Math.round(bbox.width) : undefined,
                height: bbox ? Math.round(bbox.height) : undefined,
                siblingTexts: sib.length > 0 ? sib : siblingTextsOf(grandparent),
                parentFill: parent ? solidFillOf(parent) ?? null : undefined,
            };
            const pMeta = node.id ? collectAssetParentMeta(root, String(node.id)) : undefined;
            if (pMeta?.parentTexts.length)
                a.parentTexts = pMeta.parentTexts;
            if (pMeta?.parentId)
                a.parentId = pMeta.parentId;
            if (pMeta)
                a.containerLevel = pMeta.containerLevel;
            if (pMeta?.parentBox)
                a.parentBox = pMeta.parentBox;
            if (bbox) {
                a.x = Math.round(bbox.x);
                a.y = Math.round(bbox.y);
            }
            assets.push(a);
        }
        containerCount += 1;
        if (node.id) {
            const fill = solidFillOf(node);
            if (fill) {
                const entry = {
                    nodeId: node.id,
                    name: String(node.name ?? ''),
                    color: fill.color,
                    childTexts: [],
                };
                containers.push(entry);
                pendingContainers.push({ entry, node });
            }
        }
        if (Array.isArray(node.children)) {
            for (const c of node.children)
                walk(c, node, parent);
        }
    };
    walk(root, undefined, undefined);
    for (const { entry, node } of pendingContainers) {
        for (const c of node.children ?? []) {
            if (c?.type === 'TEXT' && typeof c.characters === 'string') {
                const t = normalizeAnchorText(c.characters);
                if (t.length >= 2)
                    entry.childTexts.push(t);
            }
        }
    }
    return { texts, assets, containerCount, containers: containers.filter((c) => c.childTexts.length > 0), fillRects: collectFillRects(root, texts) };
}
function collectFillRects(root, texts) {
    const leaves = [];
    const walkLeaf = (n) => {
        if (!n || typeof n !== 'object')
            return;
        const bbox = n.absoluteBoundingBox;
        const isLeaf = !Array.isArray(n.children) || n.children.length === 0;
        if (isLeaf &&
            n.type !== 'TEXT' &&
            bbox &&
            Number(bbox.width) > 0 &&
            Number(bbox.height) > 0) {
            const gradient = gradientFillToCss(n);
            const solid = solidFillOfNode(n);
            if (gradient || solid?.color) {
                leaves.push({
                    node: n,
                    bbox: { x: Number(bbox.x), y: Number(bbox.y), width: Number(bbox.width), height: Number(bbox.height) },
                    color: solid?.color,
                    gradient,
                });
            }
        }
        for (const c of n.children ?? [])
            walkLeaf(c);
    };
    walkLeaf(root);
    if (leaves.length === 0)
        return [];
    const areas = leaves.map((l) => l.bbox.width * l.bbox.height);
    const covered = leaves.map(() => []);
    for (const t of texts) {
        if (typeof t.x !== 'number' || typeof t.y !== 'number')
            continue;
        const cx = t.x + (t.width ?? 0) / 2;
        const cy = t.y + (t.height ?? 0) / 2;
        let best = -1;
        for (let i = 0; i < leaves.length; i += 1) {
            const b = leaves[i].bbox;
            if (cx < b.x || cx > b.x + b.width || cy < b.y || cy > b.y + b.height)
                continue;
            if (best < 0 || areas[i] < areas[best])
                best = i;
        }
        if (best < 0)
            continue;
        const key = normalizeAnchorText(t.characters);
        if (key.length >= 2 && !covered[best].includes(key))
            covered[best].push(key);
    }
    const out = [];
    leaves.forEach((l, i) => {
        if (covered[i].length === 0)
            return;
        out.push({
            nodeId: String(l.node.id ?? ''),
            name: String(l.node.name ?? ''),
            bbox: l.bbox,
            ...(l.color ? { color: l.color } : {}),
            ...(l.gradient ? { gradient: l.gradient } : {}),
            coveredTexts: covered[i],
        });
    });
    return out;
}
function findNodeIdBySuffix(root, suffix) {
    if (!suffix)
        return undefined;
    let hit;
    const walk = (node) => {
        if (hit || !node || typeof node !== 'object')
            return;
        if (typeof node.id === 'string' && node.id.endsWith(`:${suffix}`)) {
            hit = node.id;
            return;
        }
        for (const c of node.children ?? [])
            walk(c);
    };
    walk(root);
    return hit;
}
function findNodeById(root, id) {
    if (!root || typeof root !== 'object')
        return undefined;
    if (root.id === id)
        return root;
    for (const c of root.children ?? []) {
        const hit = findNodeById(c, id);
        if (hit)
            return hit;
    }
    return undefined;
}
function buildNodeTextContext(root) {
    const ctx = new Map();
    const textsOf = (n) => Array.isArray(n?.children)
        ? n.children
            .filter((c) => c?.type === 'TEXT' && typeof c.characters === 'string')
            .map((c) => c.characters)
        : [];
    const walk = (node, parent, grandparent) => {
        if (!node || typeof node !== 'object')
            return;
        if (node.type !== 'TEXT' && node.id) {
            const sib = textsOf(parent);
            const texts = sib.length > 0 ? sib : textsOf(grandparent);
            if (texts.length > 0)
                ctx.set(String(node.id), texts);
        }
        for (const c of node.children ?? [])
            walk(c, node, parent);
    };
    walk(root, undefined, undefined);
    return ctx;
}
function buildImageRefIndex(root) {
    const idx = new Map();
    const walk = (node) => {
        if (!node || typeof node !== 'object')
            return undefined;
        let own;
        if (Array.isArray(node.fills)) {
            const f = node.fills.find((x) => x.type === 'IMAGE' && x.visible !== false && x.imageRef);
            if (f)
                own = f.imageRef;
        }
        let sub;
        if (Array.isArray(node.children)) {
            for (const c of node.children) {
                const r = walk(c);
                if (r && !sub)
                    sub = r;
            }
        }
        const ref = own ?? sub;
        if (ref && node.id)
            idx.set(String(node.id), ref);
        return ref;
    };
    walk(root);
    return idx;
}
const LEAF_RX = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)>([^<>]+)<\/\1>/g;
function extractTemplateRange(content) {
    const s = content.indexOf('<template');
    const e = content.lastIndexOf('</template>');
    if (s === -1 || e === -1)
        return { start: 0, end: content.length };
    return { start: s, end: e + '</template>'.length };
}
function parseLeafElements(content) {
    const leaves = [];
    let interpCount = 0;
    let m;
    LEAF_RX.lastIndex = 0;
    while ((m = LEAF_RX.exec(content)) !== null) {
        const inner = m[3];
        if (inner.includes('{{')) {
            interpCount += 1;
            continue;
        }
        const attrs = m[2] || '';
        const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
        leaves.push({
            tag: m[1],
            attrs,
            inner,
            openStart: m.index,
            openEnd: m.index + m[0].indexOf('>') + 1,
            styleValue: styleMatch ? styleMatch[1] : null,
        });
    }
    return { leaves, interpCount };
}
function mergeStyleAttrs(attrs, additions) {
    const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
    const before = styleMatch ? styleMatch[1] : null;
    const base = {};
    if (before) {
        for (const decl of before.split(';')) {
            const i = decl.indexOf(':');
            if (i > 0)
                base[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
        }
    }
    Object.assign(base, additions);
    const merged = Object.entries(base)
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
    if (styleMatch) {
        return { attrs: attrs.replace(/\sstyle="[^"]*"/, ` style="${merged}"`), before };
    }
    return { attrs: `${attrs} style="${merged}"`, before };
}
function buildStyleAdditions(truth, opts, existingStyle) {
    const additions = {};
    const has = (prop) => !!existingStyle && new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(existingStyle);
    if (opts.applyFontSize && typeof truth.fontSize === 'number' && !has('font-size')) {
        additions['font-size'] = `${truth.fontSize}px`;
    }
    if (opts.applyColor && truth.color && !has('color')) {
        additions['color'] = truth.color;
    }
    if (opts.applySizes && truth.width && !has('width')) {
        additions['width'] = `${truth.width}px`;
    }
    if (opts.applySizes && truth.height && !has('height')) {
        additions['height'] = `${truth.height}px`;
    }
    return additions;
}
function backfillSfcFiles(files, truth, options = {}) {
    const opts = {
        applyColor: options.applyColor !== false,
        applyFontSize: options.applyFontSize !== false,
        applySizes: options.applySizes === true,
    };
    const stats = {
        evaluated: 0,
        shortSkipped: 0,
        interpSkipped: 0,
        exact: 0,
        substr: 0,
        miss: 0,
        colorApplied: 0,
        fontSizeApplied: 0,
        sizeApplied: 0,
    };
    const parsed = files.map((f) => {
        const range = extractTemplateRange(f.content);
        return {
            ...f,
            range,
            ...parseLeafElements(f.content.slice(range.start, range.end)),
            edits: [],
            consumed: new Map(),
        };
    });
    stats.interpSkipped = parsed.reduce((s, p) => s + p.interpCount, 0);
    for (const t of truth.texts) {
        stats.evaluated += 1;
        const key = normalizeAnchorText(t.characters);
        if (key.length < 2) {
            stats.shortSkipped += 1;
            continue;
        }
        let hit;
        for (let i = 0; i < parsed.length; i++) {
            const pf = parsed[i];
            if (pf.consumed.get(key))
                break;
            const exact = pf.leaves.find((l) => normalizeAnchorText(l.inner) === key && !pf.consumed.get(`${l.openStart}`));
            if (exact) {
                hit = { fileIdx: i, leaf: exact, matchType: 'exact' };
                break;
            }
        }
        if (!hit) {
            for (let i = 0; i < parsed.length; i++) {
                const pf = parsed[i];
                let best;
                for (const l of pf.leaves) {
                    if (pf.consumed.get(`${l.openStart}`))
                        continue;
                    const nk = normalizeAnchorText(l.inner);
                    if (nk.includes(key) && (!best || l.inner.length < best.inner.length))
                        best = l;
                }
                if (best) {
                    hit = { fileIdx: i, leaf: best, matchType: 'substr' };
                    break;
                }
            }
        }
        if (!hit) {
            stats.miss += 1;
            continue;
        }
        const pf = parsed[hit.fileIdx];
        const additions = buildStyleAdditions(t, opts, hit.leaf.styleValue);
        if (Object.keys(additions).length === 0) {
            pf.consumed.set(`${hit.leaf.openStart}`, true);
            if (hit.matchType === 'exact')
                stats.exact += 1;
            else
                stats.substr += 1;
            continue;
        }
        const { attrs, before } = mergeStyleAttrs(hit.leaf.attrs, additions);
        pf.edits.push({
            tag: hit.leaf.tag,
            anchorText: t.characters,
            figmaNodeId: t.nodeId,
            matchType: hit.matchType,
            applied: additions,
            beforeStyle: before,
            _pos: hit.leaf.openStart,
            _oldLen: hit.leaf.openEnd - hit.leaf.openStart,
            _newOpenTag: `<${hit.leaf.tag}${attrs}>`,
        });
        pf.consumed.set(`${hit.leaf.openStart}`, true);
        if (hit.matchType === 'exact')
            stats.exact += 1;
        else
            stats.substr += 1;
        for (const [k, v] of Object.entries(additions)) {
            if (k === 'color')
                stats.colorApplied += 1;
            else if (k === 'font-size')
                stats.fontSizeApplied += 1;
            else
                stats.sizeApplied += 1;
        }
    }
    const filesOut = parsed.map((pf) => {
        let content = files.find((f) => f.path === pf.path).content;
        const sorted = [...pf.edits].sort((a, b) => (b._pos ?? 0) - (a._pos ?? 0));
        for (const e of sorted) {
            const abs = pf.range.start + (e._pos ?? 0);
            content = content.slice(0, abs) + e._newOpenTag + content.slice(abs + e._oldLen);
        }
        return {
            path: pf.path,
            changed: pf.edits.length > 0,
            content,
            edits: pf.edits.map(({ tag, anchorText, figmaNodeId, matchType, applied, beforeStyle }) => ({
                tag,
                anchorText,
                figmaNodeId,
                matchType,
                applied,
                beforeStyle,
            })),
        };
    });
    return { files: filesOut, stats };
}
function assetVarName(nodeId) {
    return `labAsset_${nodeId.replace(/[^0-9a-zA-Z]/g, '_')}`;
}
function importDepthFor(path) {
    return path === 'package/index.vue' ? '../' : '../../';
}
function findAnchorLeaf(parsed, siblingTexts) {
    const keys = siblingTexts
        .map((s) => normalizeAnchorText(s))
        .filter((k) => k.length >= 2);
    if (keys.length === 0)
        return undefined;
    for (const key of keys) {
        for (let i = 0; i < parsed.length; i++) {
            const hit = parsed[i].leaves.find((l) => normalizeAnchorText(l.inner) === key && !parsed[i].consumed.has(`${i}:${l.openStart}`));
            if (hit)
                return { fileIdx: i, leaf: hit };
        }
    }
    for (const key of keys) {
        for (let i = 0; i < parsed.length; i++) {
            let best;
            for (const l of parsed[i].leaves) {
                const nk = normalizeAnchorText(l.inner);
                if (nk.includes(key) && (!best || l.inner.length < best.inner.length))
                    best = l;
            }
            if (best)
                return { fileIdx: i, leaf: best };
        }
    }
    return undefined;
}
function mountAssetIcons(files, assets) {
    const stats = {
        assetsTotal: assets.length,
        uniqueImageRefs: 0,
        mounted: 0,
        noSiblingTexts: 0,
        noAnchor: 0,
        noFile: 0,
        svgReplaced: 0,
        dataUriReplaced: 0,
        iconClassReplaced: 0,
        emptyIconVarsReplaced: 0,
        emptyIconFieldsReplaced: 0,
        emptyObjPropsReplaced: 0,
        newElementInserted: 0,
        newElSkipNoAnchor: 0,
        newElSkipAmbiguous: 0,
        svgSkipped: 0,
        bgAnchored: 0,
        bgSkipNoClass: 0,
        bgSkipAmbiguous: 0,
        bgSkipNoBgKey: 0,
        bgSkipAlreadyUrl: 0,
        sizeRestored: 0,
        containerSizeFixed: 0,
        parentBoxRelaxed: 0,
    };
    const byRef = new Map();
    for (const a of assets) {
        if (!a.imageRef && !a.fileName) {
            stats.noFile += 1;
            continue;
        }
        const key = a.imageRef || `nid:${a.nodeId}`;
        const prev = byRef.get(key);
        if (!prev || (!prev.fileName && a.fileName))
            byRef.set(key, a);
    }
    stats.uniqueImageRefs = byRef.size;
    const parsed = files.map((f) => {
        const range = extractTemplateRange(f.content);
        return {
            path: f.path,
            content: f.content,
            range,
            inputChanged: f.changed === true,
            inputEdits: f.edits ?? [],
            ...parseLeafElements(f.content.slice(range.start, range.end)),
            imports: new Set(),
            insertions: [],
            svgEdits: [],
            consumed: new Set(),
        };
    });
    const svgPathAssets = [];
    const bgPathAssets = [];
    rewriteStaticTemplateSrc(parsed, byRef, stats);
    for (const a of byRef.values()) {
        if (!a.fileName) {
            stats.noFile += 1;
            continue;
        }
        const cls = classifyAsset(a);
        if (cls === 'bg' || cls === 'strip') {
            bgPathAssets.push(a);
            continue;
        }
        if (cls === 'decor') {
            stats.noSiblingTexts += 1;
            svgPathAssets.push(a);
            continue;
        }
        const sibs = (a.siblingTexts || []).filter((s) => normalizeAnchorText(s).length >= 2);
        if (sibs.length === 0) {
            stats.noSiblingTexts += 1;
            svgPathAssets.push(a);
            continue;
        }
        const hit = findAnchorLeaf(parsed, sibs);
        if (!hit) {
            stats.noAnchor += 1;
            continue;
        }
        const pf = parsed[hit.fileIdx];
        const varName = assetVarName(a.nodeId);
        const rel = `${importDepthFor(pf.path)}resources/images/${a.fileName}`;
        pf.imports.add(`import ${varName} from '${rel}'`);
        const sizeStyle = a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
        pf.insertions.push({
            pos: pf.range.start + hit.leaf.openStart,
            text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
        });
        pf.consumed.add(`${hit.fileIdx}:${hit.leaf.openStart}`);
        stats.mounted += 1;
    }
    if (svgPathAssets.length > 0) {
        mountBySvgPlaceholder(parsed, svgPathAssets, stats);
    }
    if (bgPathAssets.length > 0) {
        mountBackgroundAssets(parsed, bgPathAssets, stats);
    }
    const filesOut = parsed.map((pf) => {
        let content = pf.content;
        const all = [...pf.insertions, ...pf.svgEdits].sort((a, b) => b.pos - a.pos);
        for (const ins of all) {
            content = content.slice(0, ins.pos) + ins.text + content.slice(ins.end ?? ins.pos);
        }
        if (pf.imports.size > 0) {
            const importBlock = `\n${[...pf.imports].join('\n')}\n`;
            const scriptClose = content.indexOf('</script>');
            if (scriptClose !== -1) {
                content = content.slice(0, scriptClose) + importBlock + content.slice(scriptClose);
            }
            else {
                const tplStart = content.indexOf('<template');
                content =
                    `<script setup>\n${[...pf.imports].join('\n')}\n</script>\n` +
                        (tplStart === -1 ? content : content.slice(tplStart));
            }
        }
        return {
            path: pf.path,
            changed: pf.insertions.length > 0 || pf.svgEdits.length > 0 || pf.imports.size > 0 || pf.inputChanged,
            content,
            edits: [...pf.inputEdits],
        };
    });
    return { files: filesOut, stats };
}
function rewriteStaticTemplateSrc(parsed, byRef, stats) {
    const byFileName = new Map();
    for (const a of byRef.values()) {
        if (a.fileName && !byFileName.has(a.fileName))
            byFileName.set(a.fileName, a);
    }
    const existingImportRe = /import\s+(labAsset_\d+_\d+)\s+from\s+['"][^'"]*\/([^'"/]+)['"]/g;
    const declaredByFile = new Map();
    for (const pf of parsed) {
        let dm;
        existingImportRe.lastIndex = 0;
        while ((dm = existingImportRe.exec(pf.content)) !== null) {
            const fn = dm[2];
            if (!declaredByFile.has(fn))
                declaredByFile.set(fn, dm[1]);
        }
    }
    const srcRe = /\ssrc="(\.\.?\/resources\/images\/([^"]+))"/g;
    const exprLitRe = /(\|\|\s*)(['"])(\.\.?\/resources\/images\/([^'"]+))\2/g;
    for (const pf of parsed) {
        const edits = [];
        let m;
        while ((m = srcRe.exec(pf.content)) !== null) {
            const fileName = m[2];
            const canonical = declaredByFile.get(fileName);
            const asset = byFileName.get(fileName);
            let varName;
            if (canonical) {
                varName = canonical;
                if (asset)
                    asset._consumed = true;
            }
            else {
                if (!asset || !asset.nodeId)
                    continue;
                if (pf.consumed.has(`nid:${asset.nodeId}`))
                    continue;
                varName = assetVarName(asset.nodeId);
                const depth = importDepthFor(pf.path);
                pf.imports.add(`import ${varName} from '${depth}resources/images/${fileName}'`);
                pf.consumed.add(`nid:${asset.nodeId}`);
                asset._consumed = true;
            }
            edits.push({
                pos: m.index,
                end: m.index + m[0].length,
                text: ` :src="${varName}"`,
            });
            stats.mounted += 1;
            stats.staticSrcRewritten = (stats.staticSrcRewritten ?? 0) + 1;
        }
        while ((m = exprLitRe.exec(pf.content)) !== null) {
            const fileName = m[4];
            const canonical = declaredByFile.get(fileName);
            const asset = byFileName.get(fileName);
            let varName;
            if (canonical) {
                varName = canonical;
                if (asset)
                    asset._consumed = true;
            }
            else {
                if (!asset || !asset.nodeId)
                    continue;
                if (pf.consumed.has(`nid:${asset.nodeId}`))
                    continue;
                varName = assetVarName(asset.nodeId);
                const depth = importDepthFor(pf.path);
                pf.imports.add(`import ${varName} from '${depth}resources/images/${fileName}'`);
                pf.consumed.add(`nid:${asset.nodeId}`);
                asset._consumed = true;
            }
            edits.push({
                pos: m.index,
                end: m.index + m[0].length,
                text: `${m[1]}${varName}`,
            });
            stats.mounted += 1;
            stats.staticSrcRewritten = (stats.staticSrcRewritten ?? 0) + 1;
        }
        if (edits.length > 0)
            pf.svgEdits.push(...edits);
    }
}
function bgFileNameCore(fileName) {
    const core = String(fileName ?? '')
        .replace(/^bg-/, '')
        .replace(/[-_]\d+(\.\w+)?$|\.png$/g, '')
        .trim();
    return /^\d+$/.test(core) ? '' : core;
}
function collectStyleRulesFromContent(content) {
    const rules = [];
    const collect = (css, cssStart) => {
        const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
        let rm;
        while ((rm = ruleRe.exec(css)) !== null) {
            rules.push({
                bodyStart: cssStart + rm.index + rm[1].length + 1,
                bodyEnd: cssStart + rm.index + rm[1].length + 1 + rm[2].length,
                selNorm: rm[1].replace(/--/g, '-'),
            });
        }
    };
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let sm;
    let anyStyle = false;
    while ((sm = styleRe.exec(content)) !== null) {
        anyStyle = true;
        const cssStart = sm.index + sm[0].indexOf(sm[1]);
        collect(sm[1], cssStart);
    }
    if (!anyStyle && !/<template[\s>]/.test(content)) {
        collect(content, 0);
    }
    return rules;
}
function projectionAmbiguous(items, pathOf, selOf) {
    const themePrefixRe = /^(\.(?:dark|light)\s+)+/;
    const logic = new Set(items.map((t) => selOf(t).trim().replace(themePrefixRe, '')));
    if (logic.size > 1)
        return true;
    const byRaw = new Map();
    for (const t of items) {
        const key = `${pathOf(t)}::${selOf(t).trim()}`;
        byRaw.set(key, (byRaw.get(key) ?? 0) + 1);
    }
    return [...byRaw.values()].some((n) => n > 1);
}
function mountBackgroundAssets(parsed, assets, stats) {
    const rulesByFile = parsed.map((pf) => collectStyleRulesFromContent(pf.content));
    const rules = [];
    for (let i = 0; i < parsed.length; i++) {
        for (const r of rulesByFile[i])
            rules.push({ ...r, pf: parsed[i] });
    }
    const consumedRules = new Set();
    const tryMountBySize = (a) => {
        const ah = Math.round(Number(a.height));
        const aw = Number(a.width);
        if (!ah || ah <= 0)
            return 'miss';
        const sizeHits = rules.filter((r) => {
            if (consumedRules.has(r))
                return false;
            const body = r.pf.content.slice(r.bodyStart, r.bodyEnd);
            const hm = /(?<![-\w])height\s*:\s*(\d+(?:\.\d+)?)px/.exec(body);
            if (!hm || Math.abs(Math.round(Number(hm[1])) - ah) > 1)
                return false;
            const wm = /(?<![-\w])width\s*:\s*(\d+(?:\.\d+)?)px/.exec(body);
            if (wm && Math.abs(Number(wm[1]) - aw) > 2)
                return false;
            return /\bbackground\s*:/.test(body);
        });
        if (sizeHits.length === 0)
            return 'miss';
        if (sizeHits.length > 1)
            return 'ambiguous';
        const rule = sizeHits[0];
        const body = rule.pf.content.slice(rule.bodyStart, rule.bodyEnd);
        const bgM = /\bbackground\s*:\s*[^;{}]+/.exec(body);
        if (!bgM)
            return 'miss';
        const depth = importDepthFor(rule.pf.path);
        const text = `${bgM[0].replace(/\s*$/, '')} url('${depth}resources/images/${a.fileName}') center / 100% 100% no-repeat`;
        rule.pf.svgEdits.push({
            pos: rule.bodyStart + bgM.index,
            end: rule.bodyStart + bgM.index + bgM[0].length,
            text,
        });
        consumedRules.add(rule);
        return 'mounted';
    };
    for (const a of assets) {
        const core = bgFileNameCore(a.fileName);
        if (!core) {
            const bySize = tryMountBySize(a);
            if (bySize === 'mounted') {
                stats.bgAnchored += 1;
                continue;
            }
            if (bySize === 'ambiguous') {
                stats.bgSkipAmbiguous += 1;
                continue;
            }
            stats.bgSkipNoClass += 1;
            continue;
        }
        const hits = rules.filter((r) => r.selNorm.includes(core) && !consumedRules.has(r));
        if (hits.length === 0) {
            const bySize = tryMountBySize(a);
            if (bySize === 'mounted') {
                stats.bgAnchored += 1;
                continue;
            }
            if (bySize === 'ambiguous') {
                stats.bgSkipAmbiguous += 1;
                continue;
            }
            stats.bgSkipNoClass += 1;
            continue;
        }
        if (projectionAmbiguous(hits, (r) => r.pf.path, (r) => r.selNorm)) {
            stats.bgSkipAmbiguous += 1;
            continue;
        }
        const bgMs = hits.map((rule) => {
            const body = rule.pf.content.slice(rule.bodyStart, rule.bodyEnd);
            const bgM = /\bbackground\s*:\s*[^;{}]+/.exec(body);
            return bgM ? { rule, bgM } : undefined;
        });
        if (bgMs.some((m) => !m)) {
            stats.bgSkipNoBgKey += 1;
            continue;
        }
        if (bgMs.some((m) => m && /url\s*\(/i.test(m.bgM[0]))) {
            stats.bgSkipAlreadyUrl += 1;
            continue;
        }
        for (const m of bgMs) {
            const { rule, bgM } = m;
            const depth = importDepthFor(rule.pf.path);
            const text = `${bgM[0].replace(/\s*$/, '')} url('${depth}resources/images/${a.fileName}') center / 100% 100% no-repeat`;
            rule.pf.svgEdits.push({
                pos: rule.bodyStart + bgM.index,
                end: rule.bodyStart + bgM.index + bgM[0].length,
                text,
            });
        }
        for (const r of hits)
            consumedRules.add(r);
        stats.bgAnchored += 1;
        continue;
    }
}
function aiAnchorBackgroundAssets(files, candidates) {
    const stats = {
        candidates: candidates.length,
        structCandidates: 0,
        structOverrides: 0,
        anchored: 0,
        skipNoLabelHit: 0,
        skipNoClass: 0,
        skipClassAmbiguous: 0,
        skipNoRule: 0,
        skipRuleAmbiguous: 0,
        skipNoBgKey: 0,
        skipAlreadyUrl: 0,
        errors: 0,
        totalTokens: 0,
    };
    const edits = [];
    const consumedRules = new Set();
    const parsed0 = files.map((f) => ({ f, tree: parseTemplateTree(f.content) }));
    for (const cand of candidates) {
        const key = normalizeAnchorText(cand.label);
        if (key.length < 2) {
            stats.skipNoLabelHit += 1;
            continue;
        }
        const words = cand.label.split(/\s+/).map((w) => normalizeAnchorText(w)).filter((w) => w.length >= 2);
        if (words.length === 0) {
            stats.skipNoLabelHit += 1;
            continue;
        }
        const literalsCache = new Map();
        const literalsOf = (pf, path) => {
            let m = literalsCache.get(pf);
            if (!m) {
                m = new Map();
                literalsCache.set(pf, m);
            }
            let s = m.get(path);
            if (!s) {
                s = new Set();
                const parts = path.split('.');
                const top = parts[0];
                const field = parts[parts.length - 1];
                const collectFrom = (block) => {
                    const fre = new RegExp(`${field}\\s*:\\s*(?:['\"]([^'\"]+)['\"]|([\\d.]+))`, 'g');
                    let fm;
                    while ((fm = fre.exec(block)) !== null) {
                        const t = normalizeAnchorText(String(fm[1] ?? fm[2] ?? ''));
                        if (t.length >= 2)
                            s.add(t);
                    }
                };
                const objRe = new RegExp(`(?:const|let|var)\\s+${top}\\s*=\\s*(?:ref\\s*\\(\\s*)?\\{([^{}]*)\\}`, 'g');
                let om;
                while ((om = objRe.exec(pf.f.content)) !== null)
                    collectFrom(om[1]);
                if (s.size === 0)
                    collectFrom(pf.f.content);
                m.set(path, s);
            }
            return s;
        };
        const wordsMatch = (a, b, strictDigit = false) => {
            if (a === b)
                return true;
            const contained = (a.includes(b) || b.includes(a)) &&
                Math.min(a.length, b.length) >= 2 &&
                Math.max(a.length, b.length) >= 4;
            if (!contained)
                return false;
            const short = a.length <= b.length ? a : b;
            const long = a.length <= b.length ? b : a;
            if (/^\d+$/.test(short)) {
                const digits = long.match(/\d+/g) ?? [];
                return digits.includes(short);
            }
            if (strictDigit) {
                const ad = a.match(/\d+/g) ?? [];
                const bd = b.match(/\d+/g) ?? [];
                if (ad.length > 0 || bd.length > 0) {
                    if (ad.length === 0 || bd.length === 0)
                        return false;
                    return ad.some((d) => bd.includes(d));
                }
            }
            return true;
        };
        const leafNodes = new Set();
        for (const pf of parsed0) {
            for (const n of pf.tree.nodes) {
                if (n.parent && n.parent.tag !== '#root')
                    leafNodes.add(n.parent);
            }
        }
        const collectHits = (strictDigit) => {
            const hits = [];
            for (const pf of parsed0) {
                for (const node of pf.tree.nodes) {
                    if (node.tag === '#root')
                        continue;
                    let matched = false;
                    const nk = normalizeAnchorText(node.ownText);
                    if (nk.length >= 2) {
                        for (const w of words) {
                            if (wordsMatch(nk, w, strictDigit)) {
                                matched = true;
                                break;
                            }
                        }
                    }
                    if (!matched && !leafNodes.has(node) && (nk.includes('{{') || nk.length < 2)) {
                        const seg = pf.f.content.slice(node.afterOpen, node.end);
                        const interpRe = /\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g;
                        let im;
                        while (!matched && (im = interpRe.exec(seg)) !== null) {
                            for (const lit of literalsOf(pf, im[1])) {
                                for (const w of words) {
                                    if (wordsMatch(lit, w, strictDigit)) {
                                        matched = true;
                                        break;
                                    }
                                }
                                if (matched)
                                    break;
                            }
                        }
                    }
                    if (matched)
                        hits.push({ node, pf });
                }
            }
            return hits;
        };
        let hitNodes = collectHits(true);
        if (hitNodes.length === 0)
            hitNodes = collectHits(false);
        if (hitNodes.length === 0) {
            stats.skipNoLabelHit += 1;
            continue;
        }
        const digitWords = words.filter((w) => /\d{4,}/.test(w));
        if (digitWords.length > 0) {
            const seeds = hitNodes.filter((h) => {
                const nk = normalizeAnchorText(h.node.ownText);
                return digitWords.some((w) => wordsMatch(nk, w, true));
            });
            if (seeds.length > 0)
                hitNodes = seeds;
        }
        const ancestorsOf = (n) => {
            const chain = [];
            for (let cur = n; cur; cur = cur.parent)
                chain.push(cur);
            return chain;
        };
        const lcaChainLen = (nodes) => {
            let l = nodes[0].node;
            for (let i = 1; i < nodes.length; i++) {
                const a = ancestorsOf(l);
                const bSet = new Set(ancestorsOf(nodes[i].node));
                l = a.find((x) => bSet.has(x)) ?? l;
            }
            return ancestorsOf(l).length;
        };
        if (hitNodes.length >= 3) {
            let changed = true;
            while (changed && hitNodes.length >= 3) {
                changed = false;
                const d0 = lcaChainLen(hitNodes);
                for (let i = 0; i < hitNodes.length; i++) {
                    const rest = hitNodes.filter((_, j) => j !== i);
                    if (lcaChainLen(rest) > d0) {
                        hitNodes.splice(i, 1);
                        changed = true;
                        break;
                    }
                }
            }
        }
        let lca = hitNodes[0].node;
        for (let i = 1; i < hitNodes.length; i++) {
            const a = ancestorsOf(lca);
            const bSet = new Set(ancestorsOf(hitNodes[i].node));
            lca = a.find((x) => bSet.has(x)) ?? lca;
        }
        if (!lca || lca.tag === '#root') {
            stats.skipNoClass += 1;
            continue;
        }
        const findBgRuleForClasses = (clsList) => {
            for (const cls of clsList) {
                const hits = [];
                const c = cls.replace(/--/g, '-');
                const escEnd = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const endRe = new RegExp(`(^|[^\\w-])${escEnd}([^\\w-]*)$`);
                for (const f of files) {
                    for (const rule of collectStyleRulesFromContent(f.content)) {
                        if (classMatchesSelector(rule.selNorm, cls) && endRe.test(rule.selNorm.trim())) {
                            hits.push({ file: f, rule });
                        }
                    }
                }
                if (hits.length === 0)
                    continue;
                if (projectionAmbiguous(hits, (h) => h.file.path, (h) => h.rule.selNorm))
                    continue;
                const bodies = hits.map((h) => h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd));
                const bgMs = bodies.map((body) => /\bbackground\s*:\s*([^;{}]+)/.exec(body));
                if (bgMs.some((m) => !m))
                    continue;
                if (bgMs.some((m) => /url\s*\(/i.test(m[1])))
                    continue;
                return {
                    cls,
                    hits,
                    bodies,
                    bgMs: bgMs,
                    isGradient: /gradient\s*\(/i.test(bgMs[0][1]),
                };
            }
            return undefined;
        };
        let ruleHit;
        for (let cur = lca; cur && cur.tag !== '#root'; cur = cur.parent) {
            const clsList = classesFromAttrs(cur.attrs);
            if (clsList.length === 0)
                continue;
            ruleHit = findBgRuleForClasses(clsList);
            if (ruleHit)
                break;
        }
        if (!ruleHit) {
            stats.skipNoBgKey += 1;
            continue;
        }
        if (ruleHit.hits.some((h) => consumedRules.has(`${h.file.path}:${h.rule.bodyStart}`))) {
            stats.skipRuleAmbiguous += 1;
            continue;
        }
        for (let i = 0; i < ruleHit.hits.length; i++) {
            const h = ruleHit.hits[i];
            const bgM = ruleHit.bgMs[i];
            const imgBase = h.file.path === 'resources/styles/index.css'
                ? '../images/'
                : `${importDepthFor(h.file.path)}resources/images/`;
            const imgUrl = `url('${imgBase}${cand.fileName}') center / 100% 100% no-repeat`;
            const text = ruleHit.isGradient
                ? `background: ${imgUrl}, ${bgM[1].trim()}`
                : `${bgM[0].replace(/\s*$/, '')} ${imgUrl}`;
            edits.push({
                path: h.file.path,
                pos: h.rule.bodyStart + bgM.index,
                end: h.rule.bodyStart + bgM.index + bgM[0].length,
                text,
                desc: `bgAi:${cand.fileName}→.${ruleHit.cls}`,
            });
            consumedRules.add(`${h.file.path}:${h.rule.bodyStart}`);
        }
        stats.anchored += 1;
    }
    const filesOut = files.map((f) => {
        const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
        let content = f.content;
        for (const e of mine) {
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        }
        return {
            path: f.path,
            changed: mine.length > 0,
            content,
            edits: mine.map((e) => ({ desc: e.desc })),
        };
    });
    return { files: filesOut, stats };
}
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
function parseTemplateTree(content) {
    const tplRange = extractTemplateRange(content);
    const tpl = content.slice(tplRange.start, tplRange.end);
    const base = tplRange.start;
    const sentinel = {
        tag: '#root', attrs: '', start: base, afterOpen: base, end: base + tpl.length,
        ownText: '', parent: null, selfClosed: false,
    };
    const stack = [sentinel];
    const nodes = [];
    const tagRe = /<(\/?)([\w-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let last = 0;
    let m;
    while ((m = tagRe.exec(tpl)) !== null) {
        const [full, closing, tag, attrs, selfClose] = m;
        const absStart = base + m.index;
        if (m.index > last) {
            stack[stack.length - 1].ownText += tpl.slice(last, m.index).replace(/<[^>]*$/g, '');
        }
        last = m.index + full.length;
        if (closing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag === tag) {
                    for (let j = stack.length - 1; j >= i; j--)
                        stack[j].end = absStart;
                    stack.length = i;
                    break;
                }
            }
            continue;
        }
        const node = {
            tag,
            attrs: attrs || '',
            start: absStart,
            afterOpen: absStart + full.length,
            end: absStart + full.length,
            ownText: '',
            parent: stack[stack.length - 1],
            selfClosed: selfClose === '/' || VOID_TAGS.has(tag),
        };
        nodes.push(node);
        if (!node.selfClosed)
            stack.push(node);
    }
    return { root: sentinel, nodes };
}
function classesFromAttrs(attrs) {
    const out = [];
    const pushToks = (s) => {
        for (const tok of s.split(/\s+/)) {
            if (/^[a-zA-Z][\w-]*$/.test(tok))
                out.push(tok);
        }
    };
    const staticRe = /(?<![:"'\w-])class\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = staticRe.exec(attrs)) !== null)
        pushToks(m[1]);
    const dynRe = /(?::class|v-bind:class)\s*=\s*"([^"]*)"/g;
    while ((m = dynRe.exec(attrs)) !== null) {
        const litRe = /['"]([^'"]+)['"]/g;
        let lm;
        while ((lm = litRe.exec(m[1])) !== null)
            pushToks(lm[1]);
    }
    return out;
}
function classMatchesSelector(selNorm, cls) {
    const c = cls.replace(/--/g, '-');
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\w-])${esc}($|[^\\w-])`);
    return re.test(selNorm);
}
function plainBackgroundDecl(body) {
    const m = /\bbackground\s*:\s*([^;{}]+)/.exec(body);
    if (!m)
        return null;
    const value = m[1].trim();
    if (/url\s*\(/i.test(value))
        return null;
    if (/gradient\s*\(/i.test(value))
        return null;
    return { match: m[0], index: m.index, value };
}
function backfillContainerFill(files, truth) {
    const stats = {
        wrapTransparentized: 0,
        wrapColorFixed: 0,
        containerColorFixed: 0,
        skipNoRule: 0,
        skipAmbiguous: 0,
        skipUrlOrGradient: 0,
        skipSameColor: 0,
        wrapGroupsEvaluated: 0,
        containerRulesEvaluated: 0,
    };
    const edits = [];
    const consumedRules = new Set();
    const parsed = files.map((f) => ({
        f,
        tree: parseTemplateTree(f.content),
        rules: collectStyleRulesFromContent(f.content),
    }));
    const findRuleGroupByClass = (cls) => {
        const hits = [];
        for (const pf of parsed) {
            for (const rule of pf.rules) {
                if (classMatchesSelector(rule.selNorm, cls)) {
                    hits.push({ pf, rule, body: pf.f.content.slice(rule.bodyStart, rule.bodyEnd) });
                }
            }
        }
        if (hits.length === 0)
            return undefined;
        const byFile = new Map();
        for (const h of hits)
            byFile.set(h.pf.f.path, (byFile.get(h.pf.f.path) ?? 0) + 1);
        if ([...byFile.values()].some((n) => n > 1))
            return undefined;
        return hits;
    };
    const groups = new Map();
    for (const pf of parsed) {
        for (const n of pf.tree.nodes) {
            if (n.tag !== 'img')
                continue;
            const p = n.parent;
            if (!p || p.tag === '#root')
                continue;
            const cls = classesFromAttrs(p.attrs)[0];
            if (!cls)
                continue;
            const key = `${cls}`;
            if (!groups.has(key))
                groups.set(key, { cls, pf, node: p });
        }
    }
    for (const g of groups.values()) {
        stats.wrapGroupsEvaluated += 1;
        const ruleGroup = findRuleGroupByClass(g.cls);
        if (!ruleGroup) {
            stats.skipNoRule += 1;
            continue;
        }
        if (ruleGroup.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
            stats.skipAmbiguous += 1;
            continue;
        }
        const decl = plainBackgroundDecl(ruleGroup[0].body);
        if (!decl) {
            stats.skipUrlOrGradient += 1;
            continue;
        }
        const directIds = new Set();
        const indirectIds = new Set();
        for (const n of parsed) {
            for (const node of n.tree.nodes) {
                if (node.tag !== 'img')
                    continue;
                const p = node.parent;
                const pcls = p ? classesFromAttrs(p.attrs)[0] : undefined;
                if (pcls !== g.cls)
                    continue;
                const srcM = /:src="([^"]+)"/.exec(node.attrs);
                const val = srcM?.[1] ?? '';
                const dm = /^labAsset_([\w]+)$/.exec(val);
                if (dm)
                    directIds.add(dm[1]);
            }
            const scriptM = n.f.content.match(/icon\s*:\s*labAsset_([\w]+)/g);
            if (scriptM) {
                for (const s of scriptM) {
                    const im = /labAsset_([\w]+)/.exec(s);
                    if (im)
                        indirectIds.add(im[1]);
                }
            }
        }
        const idSets = directIds.size > 0 ? [directIds] : indirectIds.size > 0 ? [indirectIds] : [];
        if (idSets.length === 0) {
            stats.skipAmbiguous += 1;
            continue;
        }
        const ids = idSets[0];
        const relAssets = truth.assets.filter((a) => ids.has(String(a.nodeId).replace(/[^0-9a-zA-Z]/g, '_')));
        if (relAssets.length === 0) {
            stats.skipAmbiguous += 1;
            continue;
        }
        const fills = relAssets.map((a) => a.parentFill);
        const first = fills[0];
        const unanimousFill = first === undefined
            ? undefined
            : fills.every((f) => f && first && f.color === first.color && f.opacity === first.opacity)
                ? first
                : fills.every((f) => f === null)
                    ? null
                    : undefined;
        if (unanimousFill === undefined) {
            stats.skipAmbiguous += 1;
            continue;
        }
        const target = unanimousFill === null ? 'transparent' : unanimousFill.color;
        if (decl.value === target) {
            stats.skipSameColor += 1;
            continue;
        }
        for (const h of ruleGroup) {
            const d = plainBackgroundDecl(h.body);
            if (!d || d.value === target)
                continue;
            const absPos = h.rule.bodyStart + d.index;
            edits.push({
                path: h.pf.f.path,
                pos: absPos,
                end: absPos + d.match.length,
                text: `background: ${target}`,
                desc: `containerFill:${g.cls}→${target}`,
            });
            consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
        }
        if (unanimousFill === null)
            stats.wrapTransparentized += 1;
        else
            stats.wrapColorFixed += 1;
    }
    if ((truth.containers ?? []).length > 0) {
        const normContainers = (truth.containers ?? []).map((c) => ({
            color: c.color,
            texts: new Set(c.childTexts.map((t) => normalizeAnchorText(t)).filter((t) => t.length >= 2)),
        }));
        for (const pf of parsed) {
            for (const node of pf.tree.nodes) {
                if (node.tag === '#root' || node.tag === 'img')
                    continue;
                const clsList = classesFromAttrs(node.attrs);
                if (clsList.length === 0)
                    continue;
                let ownT = normalizeAnchorText(node.ownText);
                if (ownT.includes('{{') || ownT.length < 2) {
                    const seg = pf.f.content.slice(node.afterOpen, node.end);
                    const interpM = /\{\{\s*\w+\.(\w+)\s*\}\}/.exec(seg);
                    if (!interpM)
                        continue;
                    const prop = interpM[1];
                    const literals = new Set();
                    const scriptM = pf.f.content.match(new RegExp(`${prop}\\s*:\\s*['\"]([^'\"]+)['\"]`, 'g'));
                    if (!scriptM)
                        continue;
                    for (const s of scriptM) {
                        const lm = new RegExp(`${prop}\\s*:\\s*['\"]([^'\"]+)['\"]`).exec(s);
                        const t = lm ? normalizeAnchorText(lm[1]) : '';
                        if (t.length >= 2)
                            literals.add(t);
                    }
                    if (literals.size === 0)
                        continue;
                    const fillCount = new Map();
                    for (const lit of literals) {
                        for (const c of normContainers) {
                            if (c.texts.size === 1 && c.texts.has(lit)) {
                                fillCount.set(c.color, (fillCount.get(c.color) ?? 0) + 1);
                            }
                        }
                    }
                    if (fillCount.size === 0 || fillCount.size > 2)
                        continue;
                    const entries = [...fillCount.entries()].sort((a, b) => b[1] - a[1]);
                    const plan = [];
                    if (fillCount.size === 1) {
                        plan.push({ cls: clsList[0], color: entries[0][0] });
                    }
                    else {
                        const baseCls = clsList[0];
                        const modCls = clsList.find((c) => c.startsWith(`${baseCls}--`));
                        if (!modCls)
                            plan.push({ cls: baseCls, color: entries[0][0] });
                        else {
                            plan.push({ cls: baseCls, color: entries[0][0] });
                            plan.push({ cls: modCls, color: entries[1][0] });
                        }
                    }
                    for (const { cls, color } of plan) {
                        stats.containerRulesEvaluated += 1;
                        const ruleGroup2 = findRuleGroupByClass(cls);
                        if (!ruleGroup2) {
                            stats.skipNoRule += 1;
                            continue;
                        }
                        if (ruleGroup2.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
                            continue;
                        }
                        const decl2 = plainBackgroundDecl(ruleGroup2[0].body);
                        if (!decl2) {
                            stats.skipUrlOrGradient += 1;
                            continue;
                        }
                        if (decl2.value === color) {
                            stats.skipSameColor += 1;
                            continue;
                        }
                        for (const h of ruleGroup2) {
                            const d = plainBackgroundDecl(h.body);
                            if (!d || d.value === color)
                                continue;
                            const absPos = h.rule.bodyStart + d.index;
                            edits.push({
                                path: h.pf.f.path,
                                pos: absPos,
                                end: absPos + d.match.length,
                                text: `background: ${color}`,
                                desc: `containerFill:${cls}→${color} (interp)`,
                            });
                            consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
                        }
                        stats.containerColorFixed += 1;
                    }
                    continue;
                }
                if (ownT.length < 2)
                    continue;
                const segTexts = new Set([ownT]);
                let best;
                let tie = false;
                for (const c of normContainers) {
                    if (c.texts.size !== segTexts.size)
                        continue;
                    let overlap = 0;
                    for (const t of segTexts)
                        if (c.texts.has(t))
                            overlap += 1;
                    if (overlap !== segTexts.size)
                        continue;
                    if (!best) {
                        best = { color: c.color, overlap };
                        tie = false;
                    }
                    else {
                        tie = true;
                    }
                }
                if (!best || tie)
                    continue;
                for (const cls of clsList) {
                    stats.containerRulesEvaluated += 1;
                    const ruleGroup = findRuleGroupByClass(cls);
                    if (!ruleGroup)
                        continue;
                    if (ruleGroup.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
                        continue;
                    }
                    const decl = plainBackgroundDecl(ruleGroup[0].body);
                    if (!decl) {
                        stats.skipUrlOrGradient += 1;
                        continue;
                    }
                    if (decl.value === best.color) {
                        stats.skipSameColor += 1;
                        continue;
                    }
                    for (const h of ruleGroup) {
                        const d = plainBackgroundDecl(h.body);
                        if (!d || d.value === best.color)
                            continue;
                        const absPos = h.rule.bodyStart + d.index;
                        edits.push({
                            path: h.pf.f.path,
                            pos: absPos,
                            end: absPos + d.match.length,
                            text: `background: ${best.color}`,
                            desc: `containerFill:${cls}→${best.color}`,
                        });
                        consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
                    }
                    stats.containerColorFixed += 1;
                }
            }
        }
    }
    const filesOut = files.map((f) => {
        const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
        let content = f.content;
        for (const e of mine) {
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        }
        return {
            path: f.path,
            changed: mine.length > 0,
            content,
            edits: mine.map((e) => ({ desc: e.desc })),
        };
    });
    return { files: filesOut, stats };
}
function unanimousSize(assets) {
    if (assets.length === 0)
        return undefined;
    const w = assets[0].width;
    const h = assets[0].height;
    if (!w || !h)
        return undefined;
    return assets.every((a) => a.width === w && a.height === h) ? { w, h } : undefined;
}
function injectImgSize(pf, tagRe, size, stats) {
    const m = tagRe.exec(pf.content);
    if (!m || /\bwidth\s*:/.test(m[0]))
        return false;
    const isSelfClose = /\/>$/.test(m[0]);
    const pos = m.index + m[0].length - (isSelfClose ? 3 : 1);
    pf.svgEdits.push({ pos, text: ` style="width:${size.w}px;height:${size.h}px"` });
    stats.sizeRestored += 1;
    return true;
}
function injectWrapperBox(pf, tagRe, asset, stats) {
    const w = asset.width;
    const h = asset.height;
    if (!w || !h)
        return false;
    if (asset.containerLevel !== true)
        return false;
    const m = tagRe.exec(pf.content);
    if (!m)
        return false;
    const { nodes } = parseTemplateTree(pf.content);
    const imgNode = nodes.find((n) => n.tag === 'img' && n.start === m.index);
    const wrap = imgNode?.parent;
    if (!imgNode || !wrap || wrap.tag === '#root')
        return false;
    if (nodes.filter((n) => n.parent === wrap).length !== 1)
        return false;
    const openTag = pf.content.slice(wrap.start, wrap.afterOpen);
    const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
    const decls = `width:${Math.round(w)}px;height:${Math.round(h)}px`;
    if (styleM) {
        const merged = upsertBoxDecls(styleM[1], Math.round(w), Math.round(h));
        if (merged === styleM[1])
            return false;
        const ins = wrap.start + styleM.index + styleM[0].length - 1 - styleM[1].length;
        pf.svgEdits.push({ pos: ins, end: ins + styleM[1].length, text: merged });
    }
    else {
        pf.svgEdits.push({ pos: wrap.afterOpen - 1, text: ` style="${decls}"` });
    }
    stats.containerSizeFixed += 1;
    ensureParentFits(pf, wrap, Math.round(h), stats);
    return true;
}
function ensureParentFits(pf, wrap, h, stats) {
    const parent = wrap.parent;
    if (!parent || parent.tag === '#root')
        return false;
    const openTag = pf.content.slice(parent.start, parent.afterOpen);
    const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
    const fixed = fixedPxOf(pf, parent, 'height', styleM?.[1]);
    if (fixed == null || fixed >= h)
        return false;
    const minH = /(?:^|;)\s*min-height\s*:\s*([\d.]+)px/i.exec(styleM?.[1] ?? '');
    if (minH && parseFloat(minH[1]) >= h)
        return false;
    const decls = `min-height:${h}px`;
    if (styleM) {
        const merged = mergeStyleDecls(styleM[1], decls);
        const ins = parent.start + styleM.index + styleM[0].length - 1 - styleM[1].length;
        pf.svgEdits.push({ pos: ins, end: ins + styleM[1].length, text: merged });
    }
    else {
        pf.svgEdits.push({ pos: parent.afterOpen - 1, text: ` style="${decls}"` });
    }
    stats.parentBoxRelaxed += 1;
    return true;
}
function fixedPxOf(pf, node, prop, inlineCss) {
    const read = (css) => {
        const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)px`, 'i').exec(css);
        return m ? parseFloat(m[1]) : undefined;
    };
    const fromInline = inlineCss ? read(inlineCss) : undefined;
    if (fromInline != null)
        return fromInline;
    const classes = [...node.attrs.matchAll(/class\s*=\s*"([^"]*)"/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter(Boolean);
    if (classes.length === 0)
        return undefined;
    for (const rule of collectStyleRulesFromContent(pf.content)) {
        if (!classes.some((c) => classMatchesSelector(rule.selNorm, c)))
            continue;
        const v = read(pf.content.slice(rule.bodyStart, rule.bodyEnd));
        if (v != null)
            return v;
    }
    return undefined;
}
function mergeStyleDecls(css, decls) {
    const parts = css.split(';').map((s) => s.trim()).filter(Boolean);
    for (const d of decls.split(';').map((s) => s.trim()).filter(Boolean)) {
        const name = d.split(':')[0].trim().toLowerCase();
        const i = parts.findIndex((p) => p.split(':')[0].trim().toLowerCase() === name);
        if (i >= 0)
            parts[i] = d;
        else
            parts.push(d);
    }
    return parts.join(';');
}
function upsertBoxDecls(css, w, h) {
    const setOne = (src, prop, val) => {
        const rx = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
        const m = rx.exec(src);
        if (m) {
            const num = parseFloat(m[2]);
            const isPx = /^\s*-?[\d.]+px\s*$/i.test(m[2]);
            if (isPx && Math.round(num) === val)
                return src;
            return src.slice(0, m.index) + `${m[1]}${prop}:${val}px` + src.slice(m.index + m[0].length);
        }
        const body = src.replace(/;\s*$/, '');
        return `${body}${body ? ';' : ''}${prop}:${val}px`;
    };
    return setOne(setOne(css, 'width', w), 'height', h);
}
const SVG_RX = /<svg[\s\S]*?<\/svg>/g;
const VFOR_RX = /v-for="\s*\(?(\w+)(?:\s*,[^)]*)?\)?\s+in\s+(\w+)[^"]*"/;
function collectSvgBlocks(pf) {
    const blocks = [];
    SVG_RX.lastIndex = 0;
    let m;
    while ((m = SVG_RX.exec(pf.content)) !== null) {
        if (m.index < pf.range.start || m.index >= pf.range.end)
            continue;
        const before = pf.content.slice(pf.range.start, m.index);
        let vf = null;
        for (const v of before.matchAll(new RegExp(VFOR_RX.source, 'g')))
            vf = v;
        blocks.push({
            pf,
            start: m.index,
            end: m.index + m[0].length,
            vforAlias: vf?.[1],
            vforSrc: vf?.[2],
        });
    }
    return blocks;
}
function findArrayLiteralSpan(script, varName) {
    const re = new RegExp(`const\\s+${varName}\\s*=\\s*(?:ref\\s*\\()?\\s*\\[`);
    const m = re.exec(script);
    if (!m)
        return undefined;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let inStr = null;
    let esc = false;
    for (let i = open; i < script.length; i++) {
        const ch = script[i];
        if (inStr) {
            if (esc) {
                esc = false;
                continue;
            }
            if (ch === '\\') {
                esc = true;
                continue;
            }
            if (ch === inStr)
                inStr = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            inStr = ch;
            continue;
        }
        if (ch === '[' || ch === '{')
            depth++;
        else if (ch === ']' || ch === '}') {
            depth--;
            if (depth === 0)
                return { open, close: i };
        }
    }
    return undefined;
}
function injectIconsIntoScriptArray(script, srcVar, assets) {
    const span = findArrayLiteralSpan(script, srcVar);
    if (!span)
        return undefined;
    const groups = [];
    let depth = 0;
    let inStr = null;
    let esc = false;
    let curStart = -1;
    for (let i = span.open + 1; i < span.close; i++) {
        const ch = script[i];
        if (inStr) {
            if (esc) {
                esc = false;
                continue;
            }
            if (ch === '\\') {
                esc = true;
                continue;
            }
            if (ch === inStr)
                inStr = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            inStr = ch;
            continue;
        }
        if (ch === '{') {
            depth++;
            if (depth === 1)
                curStart = i;
        }
        else if (ch === '}') {
            if (depth === 1 && curStart >= 0)
                groups.push({ start: curStart, end: i });
            depth--;
        }
    }
    if (groups.length !== assets.length)
        return undefined;
    const replacements = [];
    for (let i = 0; i < groups.length; i++) {
        const varName = assetVarName(assets[i].nodeId);
        replacements.push({ pos: groups[i].end, text: `, labIcon: ${varName}` });
    }
    return replacements;
}
function byVisualOrder(arr) {
    return [...arr].sort((a, b) => {
        const ax = typeof a.x === 'number' && typeof a.y === 'number';
        const bx = typeof b.x === 'number' && typeof b.y === 'number';
        if (ax && bx)
            return a.y - b.y || a.x - b.x;
        if (ax)
            return -1;
        if (bx)
            return 1;
        return 0;
    });
}
exports.STRIP_MIN_WIDTH_PX = 120;
function classifyAsset(a) {
    const fn = String(a.fileName ?? '');
    if (/^bg-/.test(fn))
        return 'bg';
    if (/^(?:icon|img)-/.test(fn))
        return 'icon';
    const w = a.width ?? 0;
    const h = a.height ?? 0;
    if (w >= exports.STRIP_MIN_WIDTH_PX && w > h * 2)
        return 'strip';
    if (a.containerLevel === true)
        return 'bg';
    return 'decor';
}
function isBgClassAsset(a) {
    const c = classifyAsset(a);
    return c === 'bg' || c === 'strip';
}
function isIconClassAsset(a) {
    return classifyAsset(a) === 'icon';
}
function mountBySvgPlaceholder(parsed, assets, stats) {
    const sorted = byVisualOrder(assets);
    const blocks = [];
    for (const pf of parsed)
        blocks.push(...collectSvgBlocks(pf));
    if (blocks.length === 0) {
        replaceDataUriIcons(parsed, sorted, stats);
        if (stats.dataUriReplaced === 0) {
            replaceIconClassPlaceholders(parsed, sorted, stats);
            if (stats.iconClassReplaced === 0) {
                fillEmptyIconFields(parsed, sorted, stats);
                replaceEmptyIconVars(parsed, sorted, stats);
                fillEmptyObjectProps(parsed, sorted, stats);
                insertNewElementAssets(parsed, sorted, stats);
                if (stats.emptyIconVarsReplaced === 0 &&
                    stats.emptyIconFieldsReplaced === 0 &&
                    stats.emptyObjPropsReplaced === 0 &&
                    stats.newElementInserted === 0) {
                    stats.svgSkipped += sorted.length;
                }
            }
        }
        return;
    }
    const allSameVfor = blocks.every((b) => b.vforSrc) &&
        new Set(blocks.map((b) => `${b.vforAlias}:${b.vforSrc}`)).size === 1;
    if (allSameVfor) {
        const { pf } = blocks[0];
        const alias = blocks[0].vforAlias;
        const srcVar = blocks[0].vforSrc;
        const injections = injectIconsIntoScriptArray(pf.content, srcVar, sorted);
        if (!injections) {
            stats.svgSkipped += sorted.length;
            return;
        }
        for (const a of sorted) {
            const rel = `${importDepthFor(pf.path)}resources/images/${a.fileName}`;
            pf.imports.add(`import ${assetVarName(a.nodeId)} from '${rel}'`);
        }
        const sz = unanimousSize(sorted);
        const sizeStyle0 = sz ? ` style="width:${sz.w}px;height:${sz.h}px"` : '';
        pf.svgEdits.push(...injections);
        for (const b of blocks) {
            pf.svgEdits.push({
                pos: b.start,
                end: b.end,
                text: `<img class="lab-asset-img" :src="${alias}.labIcon"${sizeStyle0} />`,
            });
        }
        stats.svgReplaced += blocks.length;
        stats.mounted += blocks.length;
        return;
    }
    const anyVfor = blocks.some((b) => b.vforSrc);
    if (anyVfor || blocks.length !== sorted.length) {
        stats.svgSkipped += sorted.length;
        return;
    }
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const a = sorted[i];
        const varName = assetVarName(a.nodeId);
        b.pf.imports.add(`import ${varName} from '${importDepthFor(b.pf.path)}resources/images/${a.fileName}'`);
        const sizeStyle = a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
        b.pf.svgEdits.push({
            pos: b.start,
            end: b.end,
            text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
        });
    }
    stats.svgReplaced += blocks.length;
    stats.mounted += blocks.length;
}
const DATA_URI_ICON_RX = /(\w+)\s*:\s*'(data:image\/svg\+xml[^']*)'/g;
function replaceDataUriIcons(parsed, sorted, stats) {
    const hits = [];
    for (const pf of parsed) {
        DATA_URI_ICON_RX.lastIndex = 0;
        let m;
        while ((m = DATA_URI_ICON_RX.exec(pf.content)) !== null) {
            hits.push({ pf, start: m.index, end: m.index + m[0].length, field: m[1] });
        }
    }
    if (hits.length === 0 || hits.length !== sorted.length) {
        return;
    }
    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        const a = sorted[i];
        const varName = assetVarName(a.nodeId);
        h.pf.imports.add(`import ${varName} from '${importDepthFor(h.pf.path)}resources/images/${a.fileName}'`);
        h.pf.svgEdits.push({ pos: h.start, end: h.end, text: `${h.field}: ${varName}` });
    }
    stats.dataUriReplaced += hits.length;
    stats.mounted += hits.length;
}
const ICON_CLASS_FIELD_RX = /(\w*[iI]conClass\w*)\s*:\s*'[^']*'/g;
const ICON_CLASS_EL_RX = /<(\w+)\b[^>]*:class="\w+\.(\w*[iI]conClass\w*)"[^>]*>\s*<\/\1>/g;
function replaceIconClassPlaceholders(parsed, sorted, stats) {
    const fieldHits = [];
    for (const pf of parsed) {
        ICON_CLASS_FIELD_RX.lastIndex = 0;
        let m;
        while ((m = ICON_CLASS_FIELD_RX.exec(pf.content)) !== null) {
            fieldHits.push({ pf, start: m.index, end: m.index + m[0].length });
        }
    }
    const elHits = [];
    for (const pf of parsed) {
        ICON_CLASS_EL_RX.lastIndex = 0;
        let m;
        while ((m = ICON_CLASS_EL_RX.exec(pf.content)) !== null) {
            if (m.index < pf.range.start || m.index >= pf.range.end)
                continue;
            const aliasM = /:class="(\w+)\./.exec(m[0]);
            elHits.push({ pf, start: m.index, end: m.index + m[0].length, alias: aliasM?.[1] ?? 'item' });
        }
    }
    const vforDriven = elHits.length === 1 && fieldHits.length > 1;
    if (fieldHits.length === 0 ||
        fieldHits.length !== sorted.length ||
        (elHits.length !== 1 && elHits.length !== sorted.length) ||
        (!vforDriven && elHits.length === 1 && sorted.length !== 1)) {
        return;
    }
    const szCls = unanimousSize(sorted);
    const sizeStyle = szCls ? ` style="width:${szCls.w}px;height:${szCls.h}px"` : '';
    for (let i = 0; i < fieldHits.length; i++) {
        const fh = fieldHits[i];
        const a = sorted[i];
        const varName = assetVarName(a.nodeId);
        fh.pf.imports.add(`import ${varName} from '${importDepthFor(fh.pf.path)}resources/images/${a.fileName}'`);
        fh.pf.svgEdits.push({ pos: fh.end, text: `, icon: ${varName}` });
    }
    if (vforDriven) {
        const eh = elHits[0];
        eh.pf.svgEdits.push({
            pos: eh.start,
            end: eh.end,
            text: `<img class="lab-asset-img" :src="${eh.alias}.icon"${sizeStyle} />`,
        });
    }
    else {
        for (let i = 0; i < elHits.length; i++) {
            const eh = elHits[i];
            const aliasM = /:class="(\w+)\./.exec(eh.pf.content.slice(eh.start, eh.end));
            const alias = aliasM?.[1] ?? 'item';
            eh.pf.svgEdits.push({
                pos: eh.start,
                end: eh.end,
                text: `<img class="lab-asset-img" :src="${alias}.icon"${sizeStyle} />`,
            });
        }
    }
    stats.iconClassReplaced += fieldHits.length;
    stats.mounted += fieldHits.length;
}
const EMPTY_ICON_VAR_RX = /const\s+(\w+)\s*=\s*(ref\(\s*)?''(\s*\))?/g;
function replaceEmptyIconVars(parsed, sorted, stats) {
    const iconAssets = sorted.filter((a) => isIconClassAsset(a) && !a._consumed);
    const vars = [];
    for (const pf of parsed) {
        EMPTY_ICON_VAR_RX.lastIndex = 0;
        let m;
        while ((m = EMPTY_ICON_VAR_RX.exec(pf.content)) !== null) {
            const name = m[1];
            const tagM = new RegExp(`<img[^>]*:src="${name}"[^>]*>`).exec(pf.content);
            const alt = tagM ? /alt="([^"]*)"/.exec(tagM[0])?.[1] : undefined;
            vars.push({
                pf,
                start: m.index,
                end: m.index + m[0].length,
                name,
                isRef: !!m[2],
                alt,
                tagStart: tagM?.index,
                tagText: tagM?.[0],
            });
        }
    }
    if (vars.length === 0 || iconAssets.length === 0)
        return;
    const used = new Set();
    const bind = (v, a) => {
        a._consumed = true;
        const varName = assetVarName(a.nodeId);
        v.pf.imports.add(`import ${varName} from '${importDepthFor(v.pf.path)}resources/images/${a.fileName}'`);
        v.pf.svgEdits.push({
            pos: v.start,
            end: v.end,
            text: v.isRef ? `const ${v.name} = ref(${varName})` : `const ${v.name} = ${varName}`,
        });
        if (v.tagStart !== undefined && v.tagText && a.width && a.height) {
            const re = new RegExp(`<img[^>]*:src="${v.name}"[^>]*>`);
            injectImgSize(v.pf, re, { w: a.width, h: a.height }, stats);
            injectWrapperBox(v.pf, re, a, stats);
        }
        used.add(a.nodeId);
        stats.emptyIconVarsReplaced += 1;
        stats.mounted += 1;
    };
    const unbound = [];
    for (const v of vars) {
        const key = v.alt ? normalizeAnchorText(v.alt) : '';
        const a = key.length >= 2
            ? iconAssets.find((x) => !used.has(x.nodeId) &&
                (x.nearbyTexts ?? []).some((t) => {
                    const nt = normalizeAnchorText(t);
                    return nt === key || (nt.length > 1 && nt.includes(key)) || (key.length > 1 && key.includes(nt));
                }))
            : undefined;
        if (a)
            bind(v, a);
        else
            unbound.push(v);
    }
    const rest = iconAssets.filter((x) => !used.has(x.nodeId));
    if (unbound.length > 0 && unbound.length === rest.length) {
        for (let i = 0; i < unbound.length; i++)
            bind(unbound[i], rest[i]);
    }
}
const EMPTY_ICON_FIELD_OBJ_RX = /\{[^{}]*\bicon\s*:\s*''[^{}]*\}/g;
const ICON_FIELD_EMPTY_RX = /\bicon\s*:\s*''/;
const NAME_FIELD_RX = /\bname\s*:\s*'([^']*)'/;
function assetSemMatch(a, key) {
    return (a.nearbyTexts ?? a.siblingTexts ?? []).some((t) => {
        const nt = normalizeAnchorText(t);
        return nt === key || (nt.length > 1 && nt.includes(key)) || (key.length > 1 && key.includes(nt));
    });
}
function fillEmptyIconFields(parsed, sorted, stats) {
    const iconAssets = sorted.filter((a) => isIconClassAsset(a));
    if (iconAssets.length === 0)
        return;
    const groups = new Map();
    const groupKeyOf = (pfIdx, tag) => `${pfIdx}|${tag}`;
    const bindField = (pf, pfIdx, objM, a, groupTag, tagVar) => {
        const objText = objM[0];
        const fieldRel = ICON_FIELD_EMPTY_RX.exec(objText);
        if (!fieldRel)
            return false;
        a._consumed = true;
        const varName = assetVarName(a.nodeId);
        pf.imports.add(`import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`);
        pf.svgEdits.push({
            pos: objM.index + (fieldRel.index ?? 0),
            end: objM.index + (fieldRel.index ?? 0) + fieldRel[0].length,
            text: `icon: ${varName}`,
        });
        const gk = groupKeyOf(pfIdx, groupTag);
        if (!groups.has(gk))
            groups.set(gk, { pf, tagVar, bound: [] });
        groups.get(gk).bound.push(a);
        stats.emptyIconFieldsReplaced += 1;
        stats.mounted += 1;
        return true;
    };
    for (let pfIdx = 0; pfIdx < parsed.length; pfIdx++) {
        const pf = parsed[pfIdx];
        const tplTagVars = [
            ...new Set([...pf.content.matchAll(/:src="(\w+)\.icon"/g)].map((x) => x[1])),
        ];
        EMPTY_ICON_FIELD_OBJ_RX.lastIndex = 0;
        let m;
        const pendingAlt = [];
        const unboundFieldNodes = [];
        while ((m = EMPTY_ICON_FIELD_OBJ_RX.exec(pf.content)) !== null) {
            const objText = m[0];
            const before = pf.content.slice(Math.max(0, m.index - 120), m.index);
            const ownVarM = /(\w+)\s*=\s*$/.exec(before);
            const ownVar = ownVarM ? ownVarM[1] : null;
            const nameM = NAME_FIELD_RX.exec(objText);
            const key = nameM ? normalizeAnchorText(nameM[1]) : '';
            let bound = false;
            if (key.length >= 2) {
                const a = iconAssets.find((x) => !x._consumed && assetSemMatch(x, key));
                if (a && a.fileName) {
                    const tagVar = ownVar && tplTagVars.includes(ownVar) ? ownVar : null;
                    bound = bindField(pf, pfIdx, m, a, ownVar ?? 'arr', tagVar);
                }
            }
            if (!bound && !nameM && ownVar) {
                pendingAlt.push({ objM: m, ownVar });
            }
            else if (!bound && nameM) {
                unboundFieldNodes.push({ objM: m, ownVar });
            }
        }
        for (const p of pendingAlt) {
            const tagM = new RegExp(`<img[^>]*:src="${p.ownVar}\\.icon"[^>]*>`).exec(pf.content);
            if (!tagM)
                continue;
            const alt = /alt="([^"]*)"/.exec(tagM[0])?.[1] ?? '';
            const altKey = normalizeAnchorText(alt);
            if (altKey.length < 2)
                continue;
            const cands = iconAssets.filter((x) => !x._consumed && assetSemMatch(x, altKey));
            if (cands.length !== 1)
                continue;
            bindField(pf, pfIdx, p.objM, cands[0], p.ownVar, p.ownVar);
        }
        const semanticBound = [...groups.values()].reduce((n, g) => n + g.bound.length, 0);
        if (unboundFieldNodes.length > 0 && semanticBound === 0) {
            const restAssets = iconAssets.filter((x) => !x._consumed);
            if (unboundFieldNodes.length === restAssets.length) {
                for (let i = 0; i < unboundFieldNodes.length; i += 1) {
                    const { objM, ownVar } = unboundFieldNodes[i];
                    const tagVar = ownVar && tplTagVars.includes(ownVar) ? ownVar : null;
                    bindField(pf, pfIdx, objM, restAssets[i], ownVar ?? 'arr', tagVar);
                }
            }
        }
    }
    for (const g of groups.values()) {
        const sz = unanimousSize(g.bound);
        if (!sz)
            continue;
        let tagVar = g.tagVar;
        if (tagVar === null) {
            const occupied = new Set([...groups.values()].filter((o) => o !== g && o.pf === g.pf && o.tagVar).map((o) => o.tagVar));
            const distinct = [
                ...new Set([...g.pf.content.matchAll(/:src="(\w+)\.icon"/g)].map((x) => x[1])),
            ].filter((v) => !occupied.has(v));
            if (distinct.length !== 1)
                continue;
            tagVar = distinct[0];
        }
        const imgRe = new RegExp(`<img[^>]*:src="${tagVar}\\.icon"[^>]*>`);
        injectImgSize(g.pf, imgRe, sz, stats);
        if (g.bound.every((a) => a.containerLevel === true && a.width && a.height)) {
            injectWrapperBox(g.pf, imgRe, g.bound[0], stats);
        }
    }
}
function fillEmptyObjectProps(parsed, sorted, stats) {
    const iconAssets = sorted.filter((a) => isIconClassAsset(a) && !a._consumed);
    if (iconAssets.length === 0)
        return;
    const propsByObj = new Map();
    for (const pf of parsed) {
        const objRx = /\{[^{}]*\}/g;
        let om;
        while ((om = objRx.exec(pf.content)) !== null) {
            const objText = om[0];
            const before = pf.content.slice(Math.max(0, om.index - 120), om.index);
            const ownVarM = /(\w+)\s*=\s*$/.exec(before) ?? /(\w+)\s*=\s*\n\s*$/.exec(before);
            if (!ownVarM)
                continue;
            const objVar = ownVarM[1];
            const emptyRx = /(\w+)\s*:\s*''/g;
            let em;
            while ((em = emptyRx.exec(objText)) !== null) {
                const prop = em[1];
                if (prop === 'icon')
                    continue;
                const tagM = new RegExp(`<img[^>]*:src="${objVar}\\.${prop}"[^>]*>`).exec(pf.content);
                if (!tagM)
                    continue;
                const alt = /alt="([^"]*)"/.exec(tagM[0])?.[1];
                const absStart = om.index + em.index;
                const map = propsByObj.get(objVar) ?? new Map();
                map.set(prop, { start: absStart, end: absStart + em[0].length, pf, alt });
                propsByObj.set(objVar, map);
            }
        }
    }
    const pending = [];
    for (const [objVar, props] of propsByObj) {
        for (const [prop, meta] of props) {
            pending.push({ objVar, prop, ...meta });
        }
    }
    if (pending.length === 0)
        return;
    const bindProp = (p, a) => {
        a._consumed = true;
        const pf = p.pf;
        const varName = assetVarName(a.nodeId);
        pf.imports.add(`import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`);
        pf.svgEdits.push({ pos: p.start, end: p.end, text: `${p.prop}: ${varName}` });
        if (a.width && a.height) {
            const re = new RegExp(`<img[^>]*:src="${p.objVar}\\.${p.prop}"[^>]*>`);
            injectImgSize(pf, re, { w: a.width, h: a.height }, stats);
            injectWrapperBox(pf, re, a, stats);
        }
        stats.emptyObjPropsReplaced += 1;
        stats.mounted += 1;
    };
    const unbound = [];
    for (const p of pending) {
        const key = p.alt ? normalizeAnchorText(p.alt) : '';
        const cands = key.length >= 2
            ? iconAssets.filter((x) => !x._consumed && assetSemMatch(x, key))
            : [];
        if (cands.length === 1)
            bindProp(p, cands[0]);
        else
            unbound.push(p);
    }
    const unboundKeys = new Set(unbound
        .map((p) => (p.alt ? normalizeAnchorText(p.alt) : ''))
        .filter((k) => k.length >= 2));
    const unconsumed = iconAssets.filter((x) => !x._consumed);
    const zipPool = unboundKeys.size > 0
        ? unconsumed.filter((x) => [...(x.nearbyTexts ?? []), ...(x.siblingTexts ?? [])].some((t) => unboundKeys.has(normalizeAnchorText(t))))
        : unconsumed;
    if (unbound.length > 0 && unbound.length === zipPool.length) {
        for (let i = 0; i < unbound.length; i++)
            bindProp(unbound[i], zipPool[i]);
    }
}
const NEW_EL_LOOKBACK = 240;
function insertNewElementAssets(parsed, sorted, stats) {
    const cands = sorted.filter((a) => a.fileName && isIconClassAsset(a) && !a._consumed);
    if (cands.length === 0)
        return;
    for (const a of cands) {
        const keys = new Set([...(a.nearbyTexts ?? []), ...(a.siblingTexts ?? [])]
            .map((t) => normalizeAnchorText(t))
            .filter((k) => k.length >= 2));
        if (keys.size === 0) {
            stats.newElSkipNoAnchor += 1;
            continue;
        }
        let hit;
        let hitCount = 0;
        for (let i = 0; i < parsed.length; i++) {
            for (const l of parsed[i].leaves) {
                if (keys.has(normalizeAnchorText(l.inner)) && !parsed[i].consumed.has(`${i}:${l.openStart}`)) {
                    hitCount += 1;
                    if (!hit)
                        hit = { pfIdx: i, leaf: l };
                }
            }
        }
        if (hitCount !== 1 || !hit) {
            if (hitCount === 0)
                stats.newElSkipNoAnchor += 1;
            else
                stats.newElSkipAmbiguous += 1;
            continue;
        }
        const pf = parsed[hit.pfIdx];
        const leaf = hit.leaf;
        const tpl = pf.content;
        const absOpen = pf.range.start + leaf.openStart;
        const windowStart = Math.max(tpl.lastIndexOf('>', Math.max(0, absOpen - NEW_EL_LOOKBACK)) + 1, 0);
        const before = tpl.slice(windowStart, absOpen);
        const emptyElM = /<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)\/>\s*$/.exec(before) ??
            /<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)><\/\1>\s*$/.exec(before);
        let insertPos = absOpen;
        let replaceEnd = undefined;
        if (emptyElM && emptyElM[1].toLowerCase() !== 'img') {
            insertPos = absOpen - emptyElM[0].length;
            replaceEnd = absOpen;
        }
        const varName = assetVarName(a.nodeId);
        pf.imports.add(`import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`);
        const sizeStyle = a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
        pf.insertions.push({
            pos: insertPos,
            ...(replaceEnd !== undefined ? { end: replaceEnd } : {}),
            text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
        });
        pf.consumed.add(`${hit.pfIdx}:${leaf.openStart}`);
        a._consumed = true;
        stats.newElementInserted += 1;
        stats.mounted += 1;
    }
}
function matchBracketFrom(s, openIdx) {
    const open = s[openIdx];
    const close = open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : undefined;
    if (!close)
        return undefined;
    let depth = 0;
    let inStr = null;
    let esc = false;
    for (let i = openIdx; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) {
                esc = false;
                continue;
            }
            if (ch === '\\') {
                esc = true;
                continue;
            }
            if (ch === inStr)
                inStr = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            inStr = ch;
            continue;
        }
        if (ch === open)
            depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return undefined;
}
function buildScriptTokenIndex(truth) {
    const idx = new Map();
    const add = (token, color, fontSize) => {
        if (!token)
            return;
        let e = idx.get(token);
        if (!e) {
            e = { colors: new Set(), fontSizes: new Set() };
            idx.set(token, e);
        }
        if (color)
            e.colors.add(color);
        if (typeof fontSize === 'number')
            e.fontSizes.add(fontSize);
    };
    for (const t of truth.texts) {
        const raw = String(t.characters ?? '');
        const lines = raw
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        for (const line of lines)
            add(line, t.color, t.fontSize);
    }
    return idx;
}
function unanimousToken(idx, token) {
    const e = idx.get(token);
    if (!e)
        return undefined;
    const color = e.colors.size === 1 ? [...e.colors][0] : undefined;
    const fontSize = e.fontSizes.size === 1 ? [...e.fontSizes][0] : undefined;
    if (color === undefined && fontSize === undefined)
        return undefined;
    return { color, fontSize };
}
function extractStringLiterals(s, open, close) {
    const out = [];
    const re = /'([^']*)'|"([^"]*)"/g;
    const seg = s.slice(open + 1, close);
    let m;
    while ((m = re.exec(seg)) !== null)
        out.push(m[1] ?? m[2] ?? '');
    return out;
}
function replacePropsInSpan(content, span, want, stats) {
    const edits = [];
    if (want.color) {
        const m = new RegExp(`\\bcolor\\s*:\\s*'[^']*'|\\bcolor\\s*:\\s*"[^"]*"`).exec(content.slice(span.open, span.close + 1));
        if (m) {
            const abs = span.open + m.index;
            const oldVal = /'([^']*)'|"([^"]*)"/.exec(m[0]);
            const oldV = oldVal?.[1] ?? oldVal?.[2] ?? '';
            if (oldV !== want.color) {
                edits.push({ pos: abs, end: abs + m[0].length, text: `color: '${want.color}'` });
                stats.scriptColorApplied += 1;
            }
        }
    }
    if (typeof want.fontSize === 'number') {
        const m = /\bfontSize\s*:\s*[\d.]+/.exec(content.slice(span.open, span.close + 1));
        if (m) {
            const abs = span.open + m.index;
            const oldN = Number(/([\d.]+)$/.exec(m[0])?.[1]);
            if (oldN !== want.fontSize) {
                edits.push({ pos: abs, end: abs + m[0].length, text: `fontSize: ${want.fontSize}` });
                stats.scriptFontSizeApplied += 1;
            }
        }
    }
    return edits;
}
function processAxis(content, axisKey, idx, stats) {
    const keyRe = new RegExp(`\\b${axisKey}\\s*:\\s*\\{`);
    const km = keyRe.exec(content);
    if (!km)
        return [];
    const axisOpen = km.index + km[0].length - 1;
    const axisClose = matchBracketFrom(content, axisOpen);
    if (axisClose === undefined)
        return [];
    const axisSrc = content.slice(axisOpen, axisClose + 1);
    let labels;
    if (axisKey === 'xAxis') {
        const dm = /\bdata\s*:\s*([A-Za-z_$][\w$]*)\s*(?:\.value)?\s*,|\bdata\s*:\s*([A-Za-z_$][\w$]*)\s*$/
            .exec(axisSrc);
        const arrM = /\bdata\s*:\s*\[/.exec(axisSrc);
        if (dm) {
            const varName = dm[1] || dm[2];
            const span = varName ? findArrayLiteralSpan(content, varName) : undefined;
            if (span)
                labels = extractStringLiterals(content, span.open, span.close);
        }
        else if (arrM) {
            const open = axisOpen + arrM.index + arrM[0].length - 1;
            const close = matchBracketFrom(content, open);
            if (close !== undefined)
                labels = extractStringLiterals(content, open, close);
        }
    }
    else {
        const mn = /\bmin\s*:\s*(\d+)/.exec(axisSrc);
        const mx = /\bmax\s*:\s*(\d+)/.exec(axisSrc);
        const iv = /\binterval\s*:\s*(\d+)/.exec(axisSrc);
        if (mn && mx && iv) {
            const start = Number(mn[1]);
            const end = Number(mx[1]);
            const step = Number(iv[1]);
            if (step > 0 && end >= start && (end - start) / step <= 16) {
                labels = [];
                for (let v = start; v <= end; v += step)
                    labels.push(String(v));
            }
        }
    }
    if (!labels || labels.length === 0) {
        stats.scriptSkipped += 1;
        return [];
    }
    let color;
    let fontSize;
    for (const l of labels) {
        const u = unanimousToken(idx, l);
        if (!u) {
            stats.scriptSkipped += 1;
            return [];
        }
        if (u.color !== undefined) {
            if (color !== undefined && color !== u.color) {
                stats.scriptSkipped += 1;
                return [];
            }
            color = u.color;
        }
        if (u.fontSize !== undefined) {
            if (fontSize !== undefined && fontSize !== u.fontSize) {
                stats.scriptSkipped += 1;
                return [];
            }
            fontSize = u.fontSize;
        }
    }
    if (color === undefined && fontSize === undefined) {
        stats.scriptSkipped += 1;
        return [];
    }
    const alm = /\baxisLabel\s*:\s*\{/.exec(axisSrc);
    if (!alm) {
        stats.scriptSkipped += 1;
        return [];
    }
    const alOpen = axisOpen + alm.index + alm[0].length - 1;
    const alClose = matchBracketFrom(content, alOpen);
    if (alClose === undefined) {
        stats.scriptSkipped += 1;
        return [];
    }
    if (axisKey === 'xAxis')
        stats.xAxisBackfilled += 1;
    else
        stats.yAxisBackfilled += 1;
    return replacePropsInSpan(content, { open: alOpen, close: alClose }, { color, fontSize }, stats);
}
function processMarkLine(content, idx, stats) {
    const edits = [];
    const re = /\bformatter\s*:\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        const token = (m[1] ?? '').trim();
        if (normalizeAnchorText(token).length < 2)
            continue;
        const u = unanimousToken(idx, token);
        if (!u || (u.color === undefined && u.fontSize === undefined)) {
            stats.scriptSkipped += 1;
            continue;
        }
        const findEnclosing = (nameRe) => {
            const name = new RegExp(nameRe.source, 'g');
            let best;
            let bm;
            while ((bm = name.exec(content.slice(0, m.index))) !== null) {
                const open = bm.index + bm[0].length - 1;
                const close = matchBracketFrom(content, open);
                if (close !== undefined && close >= m.index)
                    best = { open, close };
            }
            return best;
        };
        const labelSpan = findEnclosing(/label\s*:\s*\{/);
        const mlSpan = findEnclosing(/markLine\s*:\s*\{/);
        if (labelSpan)
            edits.push(...replacePropsInSpan(content, labelSpan, u, stats));
        if (mlSpan) {
            const lsm = /\blineStyle\s*:\s*\{/.exec(content.slice(mlSpan.open, mlSpan.close + 1));
            if (lsm && u.color) {
                const lsOpen = mlSpan.open + lsm.index + lsm[0].length - 1;
                const lsClose = matchBracketFrom(content, lsOpen);
                if (lsClose !== undefined) {
                    edits.push(...replacePropsInSpan(content, { open: lsOpen, close: lsClose }, { color: u.color }, stats));
                }
            }
        }
        if (labelSpan || mlSpan)
            stats.markLineBackfilled += 1;
        else
            stats.scriptSkipped += 1;
    }
    return edits;
}
function backfillScriptOptionTruth(files, truth) {
    const stats = {
        xAxisBackfilled: 0,
        yAxisBackfilled: 0,
        markLineBackfilled: 0,
        scriptColorApplied: 0,
        scriptFontSizeApplied: 0,
        scriptSkipped: 0,
    };
    const idx = buildScriptTokenIndex(truth);
    const filesOut = files.map((f) => {
        if (!/\bxAxis\b/.test(f.content) && !/\bmarkLine\b/.test(f.content)) {
            return { ...f, changed: f.changed === true, edits: f.edits ?? [] };
        }
        const edits = [
            ...processAxis(f.content, 'xAxis', idx, stats),
            ...processAxis(f.content, 'yAxis', idx, stats),
            ...processMarkLine(f.content, idx, stats),
        ];
        if (edits.length === 0)
            return { ...f, changed: f.changed === true, edits: f.edits ?? [] };
        let content = f.content;
        for (const e of edits.sort((a, b) => b.pos - a.pos)) {
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        }
        return { ...f, content, changed: true, edits: f.edits ?? [] };
    });
    return { files: filesOut, stats };
}
function relocatePanelTitle(files, displayName) {
    const stats = { panels: 0, titleRelocated: 0, skipNoTitle: 0 };
    const dn = normalizeAnchorText(displayName);
    const filesOut = files.map((f) => {
        if (!dn || !/<base-panel\b/.test(f.content))
            return { ...f, changed: false };
        stats.panels += 1;
        if (/@?title-left/.test(f.content) && /#title-left/.test(f.content)) {
            stats.skipNoTitle += 1;
            return { ...f, changed: false };
        }
        const tree = parseTemplateTree(f.content);
        const hit = tree.nodes.find((n) => n.tag !== '#root' &&
            !n.ownText.includes('{{') &&
            normalizeAnchorText(n.ownText) === dn);
        if (!hit) {
            stats.skipNoTitle += 1;
            return { ...f, changed: false };
        }
        const bpOpen = /<base-panel\b[^>]*>/.exec(f.content);
        if (!bpOpen) {
            stats.skipNoTitle += 1;
            return { ...f, changed: false };
        }
        const injectPos = bpOpen.index + bpOpen[0].length;
        const inject = `\n    <template #title-left>${hit.ownText.trim()}</template>`;
        const kidsOf = new Map();
        for (const n of tree.nodes) {
            if (!n.parent || n.parent.tag === '#root')
                continue;
            const arr = kidsOf.get(n.parent);
            if (arr)
                arr.push(n);
            else
                kidsOf.set(n.parent, [n]);
        }
        const subtreeText = (n) => n.ownText + (kidsOf.get(n) ?? []).map(subtreeText).join('');
        let victim = hit;
        for (let p = hit.parent; p && p.tag !== '#root'; p = p.parent) {
            if (normalizeAnchorText(subtreeText(p)) !== dn)
                break;
            victim = p;
        }
        const closeTag = `</${victim.tag}>`;
        let rmEnd = victim.end;
        if (f.content.slice(rmEnd, rmEnd + closeTag.length) !== closeTag) {
            const found = f.content.indexOf(closeTag, rmEnd);
            if (found >= 0)
                rmEnd = found + closeTag.length;
        }
        else {
            rmEnd += closeTag.length;
        }
        let rmStart = victim.start;
        while (rmStart > 0 && /[ \t]/.test(f.content[rmStart - 1]))
            rmStart -= 1;
        let content = f.content.slice(0, rmStart) + f.content.slice(rmEnd);
        const bpOpen2 = /<base-panel\b[^>]*>/.exec(content);
        if (!bpOpen2) {
            stats.skipNoTitle += 1;
            return { path: f.path, content: f.content, changed: false };
        }
        const injectPos2 = bpOpen2.index + bpOpen2[0].length;
        content = content.slice(0, injectPos2) + inject + content.slice(injectPos2);
        content = content.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
        stats.titleRelocated += 1;
        return { path: f.path, content, changed: true };
    });
    return { files: filesOut, stats };
}
const NAMED_SLOT_ATTR_RE = /(?:^|\s)(?:#[\w-]+|v-slot(?::[\w-]+)?\s*=)/;
function defaultSlotRoot(bp, nodes) {
    for (const k of nodes) {
        if (k.parent !== bp)
            continue;
        if (k.tag === 'template') {
            if (NAMED_SLOT_ATTR_RE.test(k.attrs))
                continue;
            const inner = nodes.find((n) => n.parent === k);
            if (inner)
                return inner;
            continue;
        }
        return k;
    }
    return undefined;
}
function clearRootContentBackground(files) {
    const stats = {
        panels: 0, rootClasses: 0, cleared: 0,
        skipAlreadyTransparent: 0, skipNoBackground: 0, skipNoRootClass: 0,
    };
    const rootClasses = new Set();
    for (const f of files) {
        if (!/\.vue$/.test(f.path) || !/<base-panel\b/.test(f.content))
            continue;
        stats.panels += 1;
        let tree;
        try {
            tree = parseTemplateTree(f.content);
        }
        catch {
            continue;
        }
        for (const bp of tree.nodes) {
            if (bp.tag !== 'base-panel')
                continue;
            const root = defaultSlotRoot(bp, tree.nodes);
            if (!root) {
                stats.skipNoRootClass += 1;
                continue;
            }
            const cls = classesFromAttrs(root.attrs);
            if (cls.length === 0) {
                stats.skipNoRootClass += 1;
                continue;
            }
            for (const c of cls)
                rootClasses.add(c.replace(/--/g, '-'));
        }
    }
    stats.rootClasses = rootClasses.size;
    if (rootClasses.size === 0) {
        return { files: files.map((f) => ({ ...f, changed: false, edits: [] })), stats };
    }
    const filesOut = files.map((f) => {
        const edits = [];
        for (const r of collectStyleRulesFromContent(f.content)) {
            const sel = (r.selNorm.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';').pop() ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/^(\.(?:dark|light)\s+)+/, '');
            const base = sel.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '').trim();
            const toks = base.match(/\.[\w-]+/g) ?? [];
            if (toks.length !== 1)
                continue;
            const cls = toks[0].slice(1);
            if (!rootClasses.has(cls))
                continue;
            const body = f.content.slice(r.bodyStart, r.bodyEnd);
            const bgDeclRe = /\n?[ \t]*background(?:-color|-image)?\s*:\s*[^;{}]*;?/gi;
            const decls = [...body.matchAll(bgDeclRe)];
            if (decls.length === 0) {
                stats.skipNoBackground += 1;
                continue;
            }
            if (decls.every((d) => /:\s*(?:transparent|none)\s*(?:!important)?\s*;?$/i.test(d[0].trim()))) {
                stats.skipAlreadyTransparent += 1;
                continue;
            }
            const pad = /\n([ \t]+)\S/.exec(body)?.[1] ?? '  ';
            let newBody = body.replace(bgDeclRe, '');
            if (!newBody.startsWith('\n'))
                newBody = `\n${newBody}`;
            newBody = `\n${pad}background: transparent;${newBody}`;
            edits.push({ pos: r.bodyStart, end: r.bodyEnd, text: newBody, desc: `rootBgClear:.${cls}` });
            stats.cleared += 1;
        }
        if (edits.length === 0)
            return { path: f.path, content: f.content, changed: false, edits: [] };
        let content = f.content;
        for (const e of [...edits].sort((a, b) => b.pos - a.pos)) {
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        }
        return { path: f.path, content, changed: true, edits: edits.map((e) => ({ desc: e.desc })) };
    });
    return { files: filesOut, stats };
}
//# sourceMappingURL=truth-matcher.js.map