"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildE2nMap = buildE2nMap;
exports.findE2nEdge = findE2nEdge;
exports.anchorByCoveredTexts = anchorByCoveredTexts;
exports.selKeyOf = selKeyOf;
exports.buildStyleRuleIndex = buildStyleRuleIndex;
exports.findClassRuleHits = findClassRuleHits;
exports.isSingleClassSelector = isSingleClassSelector;
exports.bgUrlFor = bgUrlFor;
exports.readBgDecl = readBgDecl;
exports.mountBgByE2n = mountBgByE2n;
const truth_matcher_1 = require("./truth-matcher");
function skipWs(src, i) {
    while (i < src.length && /\s/.test(src[i]))
        i += 1;
    return i;
}
function parseLiteral(src, i) {
    i = skipWs(src, i);
    const ch = src[i];
    if (ch === undefined)
        return { lit: { k: 'unknown' }, next: i };
    if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let j = i + 1;
        let out = '';
        while (j < src.length && src[j] !== quote) {
            if (src[j] === '\\' && j + 1 < src.length) {
                out += src[j + 1];
                j += 2;
                continue;
            }
            out += src[j];
            j += 1;
        }
        return { lit: { k: 'str', v: out }, next: j + 1 };
    }
    if (ch === '[') {
        const arr = [];
        let j = i + 1;
        for (;;) {
            j = skipWs(src, j);
            if (src[j] === ']' || src[j] === undefined)
                return { lit: { k: 'arr', v: arr }, next: j + 1 };
            const r = parseLiteral(src, j);
            arr.push(r.lit);
            j = skipWs(src, r.next);
            if (src[j] === ',')
                j += 1;
        }
    }
    if (ch === '{') {
        const obj = {};
        let j = i + 1;
        for (;;) {
            j = skipWs(src, j);
            if (src[j] === '}' || src[j] === undefined)
                return { lit: { k: 'obj', v: obj }, next: j + 1 };
            let key = '';
            if (src[j] === '"' || src[j] === "'") {
                const r = parseLiteral(src, j);
                key = r.lit.k === 'str' ? r.lit.v : '';
                j = r.next;
            }
            else {
                const m = /^[\w$]+/.exec(src.slice(j));
                key = m ? m[0] : '';
                j += key.length;
            }
            j = skipWs(src, j);
            if (src[j] === ':')
                j += 1;
            const r = parseLiteral(src, j);
            if (key)
                obj[key] = r.lit;
            j = skipWs(src, r.next);
            if (src[j] === ',')
                j += 1;
        }
    }
    const numM = /^-?\d+(?:\.\d+)?/.exec(src.slice(i));
    if (numM)
        return { lit: { k: 'num', v: Number(numM[0]) }, next: i + numM[0].length };
    const idM = /^[\w$.]+/.exec(src.slice(i));
    if (idM) {
        const word = idM[0];
        if (word === 'true')
            return { lit: { k: 'bool', v: true }, next: i + 4 };
        if (word === 'false')
            return { lit: { k: 'bool', v: false }, next: i + 5 };
        if (word === 'null')
            return { lit: { k: 'null' }, next: i + 4 };
        return { lit: { k: 'ref', v: word }, next: i + word.length };
    }
    return { lit: { k: 'unknown' }, next: i + 1 };
}
function litScalar(l) {
    if (!l)
        return undefined;
    if (l.k === 'str')
        return l.v;
    if (l.k === 'num')
        return String(l.v);
    if (l.k === 'bool')
        return String(l.v);
    return undefined;
}
function extractScriptBindings(src) {
    const map = new Map();
    const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let sm;
    while ((sm = scriptRe.exec(src)) !== null) {
        const body = sm[1];
        const re = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:ref\s*\(\s*|reactive\s*\(\s*)?/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            const start = m.index + m[0].length;
            if (!/[\[{"']/.test(body[start] ?? ''))
                continue;
            const r = parseLiteral(body, start);
            map.set(m[1], r.lit);
        }
    }
    return map;
}
function classesFromAttrs(attrs) {
    const out = [];
    const staticM = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
    if (staticM) {
        for (const c of staticM[1].split(/\s+/))
            if (c && !out.includes(c))
                out.push(c);
    }
    const dynM = /:class\s*=\s*"([^"]*)"/.exec(attrs);
    if (dynM) {
        for (const cm of dynM[1].matchAll(/'([\w-]+)'/g)) {
            if (!out.includes(cm[1]))
                out.push(cm[1]);
        }
    }
    return out;
}
function vforOf(attrs) {
    const m = /v-for\s*=\s*"\s*\(?\s*([\w$]+)(?:\s*,\s*[\w$]+)?\s*\)?\s+(?:in|of)\s+([\w$.]+)\s*"/.exec(attrs);
    if (!m)
        return undefined;
    return { alias: m[1], list: m[2] };
}
function evalInterp(expr, scopes, bindings) {
    const path = expr.trim().replace(/^\((.*)\)$/, '$1');
    const parts = path.split('.');
    const head = parts[0];
    const scope = [...scopes].reverse().find((s) => s.alias === head);
    const listName = scope?.list;
    const list = listName ? bindings.get(listName) : undefined;
    const pick = (l) => {
        if (parts.length === 1)
            return litScalar(l) !== undefined ? [litScalar(l)] : [];
        const out = [];
        let cur = l;
        for (let i = 1; i < parts.length; i += 1) {
            cur = cur && cur.k === 'obj' ? cur.v[parts[i]] : undefined;
        }
        const s = litScalar(cur);
        return s !== undefined ? [s] : [];
    };
    if (scope && list?.k === 'arr') {
        const all = [];
        const singles = [];
        for (const item of list.v) {
            const got = pick(item);
            if (got.length === 0)
                continue;
            for (const g of got)
                if (!all.includes(g))
                    all.push(g);
            if (singles.length === 0)
                singles.push(...got);
        }
        return { values: all, single: singles };
    }
    const root = bindings.get(head);
    if (!root)
        return { values: [], single: [] };
    const got = pick(root);
    return { values: got, single: got };
}
function instantiateProd(files) {
    const all = [];
    for (const f of files) {
        if (!/\.vue$/.test(f.path))
            continue;
        let tree;
        try {
            tree = (0, truth_matcher_1.parseTemplateTree)(f.content);
        }
        catch {
            continue;
        }
        const bindings = extractScriptBindings(f.content);
        const byNode = new Map();
        const NAMED_SLOT_RE = /(?:^|\s)(?:#[\w-]+|v-slot(?::[\w-]+)?\s*=)/;
        const isSkipped = (n) => n.tag === 'template' && !NAMED_SLOT_RE.test(n.attrs);
        const effectiveParent = (n) => {
            let cur = n;
            while (cur && cur.tag !== '#root' && isSkipped(cur))
                cur = cur.parent;
            return !cur || cur.tag === '#root' ? null : cur;
        };
        const inheritedTexts = new Map();
        for (const n of tree.nodes) {
            if (!isSkipped(n))
                continue;
            const raw = n.ownText ?? '';
            const own = (0, truth_matcher_1.normalizeAnchorText)(raw);
            if (!own || /[{}]/.test(raw))
                continue;
            const p = effectiveParent(n.parent);
            if (!p)
                continue;
            const arr = inheritedTexts.get(p.start) ?? [];
            arr.push(own);
            inheritedTexts.set(p.start, arr);
        }
        const scopesOf = (n) => {
            const chain = [];
            for (let cur = n; cur; cur = cur.parent) {
                const vf = vforOf(cur.attrs);
                if (vf)
                    chain.unshift({ alias: vf.alias, list: vf.list });
            }
            return chain;
        };
        const ordered = [...tree.nodes].sort((a, b) => b.start - a.start);
        for (const node of ordered) {
            if (node.tag === '#root' || isSkipped(node))
                continue;
            const scopes = scopesOf(node);
            const vf = vforOf(node.attrs);
            const listName = vf?.list;
            const listLit = listName ? bindings.get(listName) : undefined;
            const vforCount = listLit?.k === 'arr' && listLit.v.length > 1 ? listLit.v.length : 1;
            const ownStatic = [...(inheritedTexts.get(node.start) ?? [])];
            const ownInterp = [];
            const ownInterpSingle = [];
            const textSrc = node.ownText ?? '';
            const rx = /\{\{\s*([^}]+?)\s*\}\}/g;
            let last = 0;
            let m;
            while ((m = rx.exec(textSrc)) !== null) {
                const before = (0, truth_matcher_1.normalizeAnchorText)(textSrc.slice(last, m.index));
                if (before.length >= 1)
                    ownStatic.push(before);
                last = m.index + m[0].length;
                const ev = evalInterp(m[1], scopes, bindings);
                for (const v of ev.values) {
                    const nv = (0, truth_matcher_1.normalizeAnchorText)(v);
                    if (nv && !ownInterp.includes(nv))
                        ownInterp.push(nv);
                }
                for (const v of ev.single) {
                    const nv = (0, truth_matcher_1.normalizeAnchorText)(v);
                    if (nv && !ownInterpSingle.includes(nv))
                        ownInterpSingle.push(nv);
                }
            }
            const tail = (0, truth_matcher_1.normalizeAnchorText)(textSrc.slice(last));
            if (tail.length >= 1)
                ownStatic.push(tail);
            const childKeys = [];
            for (const c of tree.nodes) {
                if (c.tag === '#root' || isSkipped(c))
                    continue;
                if (effectiveParent(c.parent) === node)
                    childKeys.push(`${f.path}#${c.start}`);
            }
            const children = childKeys.map((k) => all.find((x) => x.key === k)).filter(Boolean);
            const childRender = children.flatMap((c) => c.renderTexts);
            const childInst = children.flatMap((c) => c.instanceTexts);
            const dedupe = (arr) => {
                const out = [];
                for (const x of arr)
                    if (x && !out.includes(x))
                        out.push(x);
                return out;
            };
            const renderTexts = dedupe([...ownStatic, ...ownInterp, ...childRender]);
            const instTextNodes = (ownStatic.length > 0 || ownInterp.length > 0 ? 1 : 0) +
                children.reduce((s, c) => s + c.instTextNodes, 0);
            const entry = {
                key: `${f.path}#${node.start}`,
                path: f.path,
                tag: node.tag,
                classes: classesFromAttrs(node.attrs),
                start: node.start,
                end: node.end,
                ...(effectiveParent(node.parent)
                    ? { parentKey: `${f.path}#${effectiveParent(node.parent).start}` }
                    : {}),
                ownStatic,
                ownInterp,
                ownInterpSingle,
                renderTexts,
                instanceTexts: scopes.length > 0
                    ? dedupe([...ownStatic, ...ownInterpSingle, ...childInst])
                    : renderTexts,
                vforCount,
                instTextNodes,
                ...(vf ? { vforAlias: vf.alias } : {}),
                ...(vf?.list ? { vforList: vf.list } : {}),
            };
            byNode.set(node, entry);
            all.push(entry);
        }
    }
    return all;
}
function collectFigmaNodes(root) {
    const nodes = [];
    const byId = new Map();
    const rec = (n) => {
        if (!n || typeof n !== 'object' || typeof n.id !== 'string')
            return undefined;
        const info = {
            id: n.id,
            type: String(n.type ?? ''),
            name: String(n.name ?? ''),
            ownText: n.type === 'TEXT' ? (0, truth_matcher_1.normalizeAnchorText)(String(n.characters ?? '')) : '',
            texts: [],
            childIds: [],
        };
        const kids = [];
        for (const c of n.children ?? []) {
            const ci = rec(c);
            if (ci) {
                kids.push(ci);
                info.childIds.push(ci.id);
            }
        }
        const set = [];
        if (info.ownText)
            set.push(info.ownText);
        for (const k of kids)
            for (const t of k.texts)
                if (t && !set.includes(t))
                    set.push(t);
        info.texts = set;
        nodes.push(info);
        byId.set(info.id, info);
        return info;
    };
    rec(root);
    return { nodes, byId };
}
function outermostOf(cands, prodNodes) {
    const byKey = new Map(prodNodes.map((p) => [p.key, p]));
    const isAncestor = (a, b) => {
        for (let cur = byKey.get(b.parentKey ?? ''); cur; cur = byKey.get(cur.parentKey ?? '')) {
            if (cur.key === a.key)
                return true;
        }
        return false;
    };
    for (const a of cands) {
        if (cands.every((b) => b === a || isAncestor(a, b)))
            return a;
    }
    return undefined;
}
function buildE2nMap(figmaRoot, prodFiles, opts = {}) {
    const files = opts.files ? prodFiles.filter((f) => opts.files.includes(f.path)) : prodFiles;
    const prodNodes = instantiateProd(files);
    const { nodes: figmaNodes, byId } = collectFigmaNodes(figmaRoot);
    const textIndex = new Map();
    for (const p of prodNodes) {
        for (const t of [...p.ownStatic, ...p.ownInterp]) {
            const k = (0, truth_matcher_1.normalizeAnchorText)(t);
            if (!k)
                continue;
            if (!textIndex.has(k))
                textIndex.set(k, new Set());
            textIndex.get(k).add(p.key);
        }
    }
    const seeds = [];
    const seedByFigma = new Map();
    const usedProd = new Set();
    const figmaTexts = figmaNodes.filter((n) => n.type === 'TEXT' && n.ownText);
    let ambiguousSeeds = 0;
    let partialSeeds = 0;
    let missSeeds = 0;
    for (const ft of figmaTexts) {
        const cands = [...(textIndex.get(ft.ownText) ?? [])];
        if (cands.length === 1) {
            const s = { figmaId: ft.id, text: ft.ownText, prodKey: cands[0], how: 'text-exact', candidates: 1 };
            seeds.push(s);
            seedByFigma.set(ft.id, s);
            usedProd.add(cands[0]);
            continue;
        }
        if (cands.length > 1) {
            ambiguousSeeds += 1;
            continue;
        }
        let hit;
        for (const [text, keys] of textIndex) {
            if (text.length < 3)
                continue;
            if (text.includes(ft.ownText) || ft.ownText.includes(text)) {
                const free = [...keys].filter((k) => !usedProd.has(k));
                if (free.length === 1) {
                    hit = free[0];
                    break;
                }
            }
        }
        if (hit) {
            const s = { figmaId: ft.id, text: ft.ownText, prodKey: hit, how: 'text-partial', candidates: 1 };
            seeds.push(s);
            seedByFigma.set(ft.id, s);
            usedProd.add(hit);
            partialSeeds += 1;
        }
        else {
            missSeeds += 1;
        }
    }
    const figmaSeeded = new Map();
    for (const n of [...figmaNodes].sort((a, b) => a.texts.length - b.texts.length)) {
        const set = new Set();
        if (seedByFigma.has(n.id))
            set.add(n.id);
        for (const cid of n.childIds)
            for (const k of figmaSeeded.get(cid) ?? [])
                set.add(k);
        figmaSeeded.set(n.id, set);
    }
    const seededTextSet = new Set(seeds.map((s) => s.text));
    const prodSeeded = new Map();
    for (const p of prodNodes) {
        prodSeeded.set(p.key, {
            render: p.renderTexts.filter((t) => seededTextSet.has(t)),
            inst: p.instanceTexts.filter((t) => seededTextSet.has(t)),
        });
    }
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const edges = [];
    const multi = [];
    const unmapped = [];
    let figmaContainers = 0;
    let depthResolved = 0;
    for (const fn of figmaNodes) {
        if (fn.type === 'TEXT')
            continue;
        const seedIds = figmaSeeded.get(fn.id);
        if (!seedIds || seedIds.size === 0)
            continue;
        figmaContainers += 1;
        const sTexts = [];
        for (const fid of seedIds) {
            const s = seedByFigma.get(fid);
            if (s && !sTexts.includes(s.text))
                sTexts.push(s.text);
        }
        const hits = [];
        for (const p of prodNodes) {
            const ps = prodSeeded.get(p.key);
            if (p.vforCount > 1) {
                const sr = sTexts.filter((t) => p.renderTexts.includes(t));
                if (sr.length > 0 && sTexts.length <= p.instTextNodes)
                    hits.push({ p, how: 'vfor-unit' });
                continue;
            }
            if (ps.render.length > 0 && sameSet(ps.render, sTexts))
                hits.push({ p, how: 'subtree-set-equal' });
        }
        if (hits.length === 0) {
            unmapped.push({ figmaId: fn.id, reason: 'no-prod-container' });
            continue;
        }
        hits.sort((a, b) => a.p.renderTexts.length - b.p.renderTexts.length);
        const bestLen = hits[0].p.renderTexts.length;
        const tie = hits.filter((h) => h.p.renderTexts.length === bestLen);
        if (tie.length > 1) {
            const outer = outermostOf(tie.map((h) => h.p), prodNodes);
            if (outer) {
                depthResolved += 1;
                edges.push({
                    figmaId: fn.id,
                    figmaType: fn.type,
                    figmaName: fn.name,
                    prodKey: outer.key,
                    prodPath: outer.path,
                    classes: outer.classes,
                    how: 'subtree-set-equal',
                    matched: seedIds.size,
                    instCount: outer.vforCount,
                    unique: true,
                });
            }
            else {
                multi.push({ figmaId: fn.id, figmaName: fn.name, prodKeys: tie.map((h) => h.p.key) });
            }
            continue;
        }
        edges.push({
            figmaId: fn.id,
            figmaType: fn.type,
            figmaName: fn.name,
            prodKey: hits[0].p.key,
            prodPath: hits[0].p.path,
            classes: hits[0].p.classes,
            how: hits[0].how,
            matched: seedIds.size,
            instCount: hits[0].p.vforCount,
            unique: true,
        });
    }
    return {
        seeds,
        nodes: edges,
        multi,
        unmapped,
        prodNodes,
        stats: {
            prodNodes: prodNodes.length,
            figmaTexts: figmaTexts.length,
            seeds: seeds.length,
            ambiguousSeeds,
            partialSeeds,
            missSeeds,
            nodes: edges.length,
            multi: multi.length,
            depthResolved,
            figmaContainers,
        },
    };
}
function findE2nEdge(e2n, figmaId) {
    if (!figmaId)
        return undefined;
    return e2n.nodes.find((n) => n.figmaId === figmaId);
}
function anchorByCoveredTexts(e2n, coveredTexts) {
    if (!coveredTexts.length)
        return undefined;
    const byKey = new Map(e2n.prodNodes.map((p) => [p.key, p]));
    const want = new Set(coveredTexts.map((t) => (0, truth_matcher_1.normalizeAnchorText)(t)));
    const seedKeys = [];
    for (const s of e2n.seeds) {
        if (want.has((0, truth_matcher_1.normalizeAnchorText)(s.text)) && !seedKeys.includes(s.prodKey))
            seedKeys.push(s.prodKey);
    }
    if (seedKeys.length === 0)
        return undefined;
    const chainOf = (key) => {
        const chain = [];
        for (let cur = byKey.get(key); cur; cur = byKey.get(cur.parentKey ?? ''))
            chain.push(cur.key);
        return chain;
    };
    const chains = seedKeys.map(chainOf).filter((c) => c.length > 0);
    if (chains.length === 0)
        return undefined;
    let lcaKey = chains[0].find((k) => chains.every((c) => c.includes(k)));
    if (!lcaKey)
        return undefined;
    if (chains.length === 1 && lcaKey === chains[0][0])
        lcaKey = chains[0][1] ?? lcaKey;
    const node = byKey.get(lcaKey);
    if (!node)
        return undefined;
    return {
        figmaId: '',
        figmaType: 'FILL_RECT',
        figmaName: '',
        prodKey: node.key,
        prodPath: node.path,
        classes: node.classes,
        how: 'fill-rect-cover',
        matched: seedKeys.length,
        instCount: node.vforCount,
        unique: true,
    };
}
const BG_URL_TAIL = 'center / 100% 100% no-repeat';
function selKeyOf(sel) {
    return (sel
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[\r\n])[ \t]*\/\/[^\r\n]*/g, ' ')
        .split(';').pop() ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(\.(?:dark|light)\s+)+/, '');
}
function buildStyleRuleIndex(files) {
    return {
        files: files.map((f) => ({ path: f.path, content: f.content, rules: (0, truth_matcher_1.collectStyleRulesFromContent)(f.content) })),
    };
}
function findClassRuleHits(index, cls) {
    const hits = [];
    const esc = cls.replace(/--/g, '-').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const endRe = new RegExp(`(^|[^\\w-])${esc}([^\\w-]*)$`);
    for (const f of index.files) {
        for (const rule of f.rules) {
            if (!(0, truth_matcher_1.classMatchesSelector)(rule.selNorm, cls))
                continue;
            if (!endRe.test(selKeyOf(rule.selNorm)))
                continue;
            hits.push({ file: f, rule });
        }
    }
    return hits;
}
function isSingleClassSelector(selNorm) {
    const selBase = selNorm.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '').trim();
    return (selBase.match(/\.[\w-]+/g) ?? []).length === 1;
}
function bgUrlFor(filePath, fileName) {
    const depth = filePath.startsWith('resources/')
        ? `${'../'.repeat(Math.max(0, filePath.split('/').length - 2))}images/`
        : `${(0, truth_matcher_1.importDepthFor)(filePath)}resources/images/`;
    return `url('${depth}${fileName}') ${BG_URL_TAIL}`;
}
function readBgDecl(body) {
    const bgRe = /(^|[;{\s])background\s*:\s*([^;{}]+)/;
    const bm = bgRe.exec(body);
    if (bm) {
        const value = bm[2];
        const valueStart = bm.index + bm[0].length - value.length;
        return {
            kind: 'background',
            value,
            isGradient: /gradient\s*\(/i.test(value),
            hasUrl: /url\s*\(/i.test(value),
            index: valueStart,
            end: valueStart + value.length,
            match: bm[0],
        };
    }
    const cm = /(^|[;{\s])background-color\s*:\s*([^;{}]+)/.exec(body);
    if (cm) {
        return {
            kind: 'background-color',
            value: cm[2],
            index: cm.index + cm[1].length,
            end: cm.index + cm[0].length,
            match: cm[0],
        };
    }
    return { kind: 'none' };
}
function mountBgByE2n(files, assets, e2n) {
    const stats = {
        candidates: 0, anchored: 0, inserted: 0, mergedColor: 0, replacedGradient: 0, replacedColor: 0,
        skipNoEdge: 0, skipNoClass: 0, skipNoRule: 0, skipMultiClass: 0,
        skipRuleAmbiguous: 0, skipAlreadyUrl: 0,
    };
    const edits = [];
    const consumed = new Set();
    const anchoredAssets = [];
    const index = buildStyleRuleIndex(files);
    for (const a of assets) {
        if (!a.fileName || !(0, truth_matcher_1.isBgClassAsset)(a))
            continue;
        if (!a.containerLevel || !a.parentId)
            continue;
        stats.candidates += 1;
        const edge = findE2nEdge(e2n, a.parentId);
        if (!edge) {
            stats.skipNoEdge += 1;
            continue;
        }
        const clsList = edge.classes.filter((c) => c && !/^_/.test(c));
        if (clsList.length === 0) {
            stats.skipNoClass += 1;
            continue;
        }
        let applied = false;
        let rejected = false;
        for (const cls of [...clsList].reverse()) {
            const hits = findClassRuleHits(index, cls);
            if (hits.length === 0)
                continue;
            const selSet = new Set(hits.map((h) => selKeyOf(h.rule.selNorm)));
            if (selSet.size > 1) {
                stats.skipRuleAmbiguous += 1;
                rejected = true;
                break;
            }
            if (!isSingleClassSelector(selKeyOf(hits[0].rule.selNorm))) {
                stats.skipMultiClass += 1;
                rejected = true;
                break;
            }
            const bodies = hits.map((h) => h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd));
            const decls = bodies.map((b) => readBgDecl(b));
            const hitHasUrl = decls.map((d) => d.kind === 'background' && d.hasUrl);
            if (hitHasUrl.length > 0 && hitHasUrl.every(Boolean)) {
                stats.skipAlreadyUrl += 1;
                rejected = true;
                break;
            }
            let editedAny = false;
            let howKind = 'value';
            for (let i = 0; i < hits.length; i += 1) {
                const h = hits[i];
                if (hitHasUrl[i])
                    continue;
                const key = `${h.file.path}:${h.rule.bodyStart}`;
                if (consumed.has(key))
                    continue;
                const url = bgUrlFor(h.file.path, a.fileName);
                const body = bodies[i];
                const d = decls[i];
                if (d.kind === 'background') {
                    edits.push({
                        path: h.file.path,
                        pos: h.rule.bodyStart + d.index,
                        end: h.rule.bodyStart + d.end,
                        text: url,
                        desc: `e2nBg:${a.fileName}→.${cls}(${d.isGradient ? 'replace-gradient' : 'replace-color'})`,
                    });
                    if (d.isGradient) {
                        stats.replacedGradient += 1;
                        howKind = 'replace-gradient';
                    }
                    else {
                        stats.replacedColor += 1;
                        howKind = 'replace-color';
                    }
                    editedAny = true;
                }
                else if (d.kind === 'background-color') {
                    edits.push({
                        path: h.file.path,
                        pos: h.rule.bodyStart + d.index,
                        end: h.rule.bodyStart + d.end,
                        text: `background: ${url}`,
                        desc: `e2nBg:${a.fileName}→.${cls}(replace-color)`,
                    });
                    stats.replacedColor += 1;
                    editedAny = true;
                    howKind = 'replace-color';
                }
                else {
                    const pad = body.endsWith('\n') ? '' : '\n  ';
                    edits.push({
                        path: h.file.path,
                        pos: h.rule.bodyStart + body.length,
                        end: h.rule.bodyStart + body.length,
                        text: `${pad}background: ${url};\n`,
                        desc: `e2nBg:${a.fileName}→.${cls}(insert)`,
                        inserted: true,
                    });
                    stats.inserted += 1;
                    editedAny = true;
                    howKind = 'insert';
                }
                consumed.add(key);
            }
            if (editedAny) {
                stats.anchored += 1;
                applied = true;
                anchoredAssets.push({ fileName: a.fileName, figmaId: a.parentId, cls, how: howKind });
                break;
            }
        }
        if (!applied && !rejected)
            stats.skipNoRule += 1;
    }
    const out = files.map((f) => {
        const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
        let content = f.content;
        for (const e of mine)
            content = content.slice(0, e.pos) + e.text + content.slice(e.end);
        return { path: f.path, changed: mine.length > 0, content, edits: mine.map((e) => ({ desc: e.desc })) };
    });
    return { files: out, stats, anchoredAssets };
}
//# sourceMappingURL=e2n-map.js.map