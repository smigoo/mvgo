"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairTemplateStructure = repairTemplateStructure;
exports.normalizeInlineHandlers = normalizeInlineHandlers;
exports.stripTags = stripTags;
exports.readApiModules = readApiModules;
exports.autoWireBindings = autoWireBindings;
exports.buildVueGen = buildVueGen;
exports.verifyVueGen = verifyVueGen;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const s4_component_registry_1 = require("./s4-component-registry");
function slugifyView(index) {
    return 'GenView' + String(index).padStart(2, '0');
}
function findHtmlPages(root) {
    const out = [];
    const walk = (dir) => {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name === 'node_modules' || e.name.startsWith('.') && e.name !== '.')
                    continue;
                walk(full);
            }
            else if (e.isFile() && e.name.endsWith('.html')) {
                out.push(full);
            }
        }
    };
    walk(root);
    return out;
}
function extractInlineStyle(html) {
    const m = html.match(/<style>([\s\S]*?)<\/style>/);
    if (!m)
        return '';
    return m[1]
        .replace(/body\s*\{[^}]*\}/g, '')
        .replace(/#app\s*\{[^}]*\}/g, '')
        .trim();
}
function extractTokens(commonCss) {
    const m = commonCss.match(/:root\s*\{([\s\S]*?)\}/);
    if (!m)
        return '';
    const body = m[1].trim();
    if (!body)
        return '';
    const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!cleaned)
        return '';
    return '.shell,\n.app-shell {\n' + cleaned + '\n}\n';
}
function findAppBounds(html) {
    const open = /<div\b[^>]*\bid\s*=\s*["']app["'][^>]*>/i.exec(html);
    if (!open)
        return null;
    const start = open.index + open[0].length;
    const bodyEnd = html.toLowerCase().indexOf('</body>', start);
    const limit = bodyEnd === -1 ? html.length : bodyEnd;
    let depth = 0;
    let last = -1;
    let i = start;
    while (i < limit) {
        const lt = html.indexOf('<', i);
        if (lt === -1 || lt >= limit)
            break;
        if (html.startsWith('<!--', lt)) {
            const e = html.indexOf('-->', lt + 4);
            if (e === -1)
                break;
            i = e + 3;
            continue;
        }
        const blockM = /^<(script|style)\b/i.exec(html.slice(lt, lt + 8));
        if (blockM) {
            const close = html.toLowerCase().indexOf('</' + blockM[1].toLowerCase(), lt);
            if (close === -1)
                break;
            i = close;
            continue;
        }
        const gt = (0, s4_component_registry_1.findTagGt)(html, lt);
        if (gt === -1)
            break;
        const tagSrc = html.slice(lt, gt + 1);
        const nm = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/.exec(tagSrc);
        if (nm && nm[2].toLowerCase() === 'div') {
            if (nm[1] === '/') {
                depth--;
                if (depth === 0)
                    last = gt + 1;
                else if (depth < 0)
                    break;
            }
            else if (!/\/\s*>$/.test(tagSrc)) {
                depth++;
            }
        }
        i = gt + 1;
    }
    if (last === -1)
        return null;
    return { start, end: last };
}
function extractAppTemplate(html) {
    const clean = (tpl) => tpl
        .replace(/\s+v-cloak\b/g, '')
        .replace(/\s+data-service-page="[^"]*"/g, '')
        .replace(/\s+data-page-node-id="[^"]*"/g, '')
        .trim();
    const bounds = findAppBounds(html);
    if (bounds)
        return { template: clean(html.slice(bounds.start, bounds.end)), mode: 'nested' };
    const m = html.match(/<div id="app"[^>]*>([\s\S]*?)<\/div>\s*<script/);
    if (!m)
        return { template: '', mode: 'none' };
    return { template: clean(m[1]), mode: 'legacy' };
}
const SVG_EMPTY_TAGS = new Set([
    'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'stop', 'ellipse', 'image',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const HAS_IF_RX = /(^|\s)v-if\s*=/;
const HAS_ELSE_IF_RX = /(^|\s)v-else-if\s*=/;
const ELSE_IF_TO_IF_RX = /(^|\s)v-else-if(\s*=)/;
function tokenizeTagStream(tpl) {
    const out = [];
    const lower = tpl.toLowerCase();
    let i = 0;
    while (i < tpl.length) {
        const lt = tpl.indexOf('<', i);
        if (lt === -1) {
            out.push({ type: 'other', raw: tpl.slice(i), name: '' });
            break;
        }
        if (lt > i)
            out.push({ type: 'other', raw: tpl.slice(i, lt), name: '' });
        if (tpl.startsWith('<!--', lt)) {
            const e = tpl.indexOf('-->', lt + 4);
            const end = e === -1 ? tpl.length : e + 3;
            out.push({ type: 'other', raw: tpl.slice(lt, end), name: '' });
            i = end;
            continue;
        }
        if (tpl.startsWith('<!', lt)) {
            const e = tpl.indexOf('>', lt);
            const end = e === -1 ? tpl.length : e + 1;
            out.push({ type: 'other', raw: tpl.slice(lt, end), name: '' });
            i = end;
            continue;
        }
        const gt = (0, s4_component_registry_1.findTagGt)(tpl, lt);
        if (gt === -1) {
            out.push({ type: 'other', raw: tpl.slice(lt), name: '' });
            break;
        }
        const raw = tpl.slice(lt, gt + 1);
        const nm = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/.exec(raw);
        if (!nm) {
            out.push({ type: 'other', raw, name: '' });
            i = gt + 1;
            continue;
        }
        const name = nm[2].toLowerCase();
        if (RAW_TEXT_TAGS.has(name) && nm[1] !== '/') {
            const c = lower.indexOf('</' + name, gt);
            const end = c === -1 ? tpl.length : lower.indexOf('>', c) + 1;
            out.push({ type: 'other', raw: tpl.slice(lt, end), name: '' });
            i = end;
            continue;
        }
        if (nm[1] === '/')
            out.push({ type: 'close', raw, name });
        else if (/\/\s*>$/.test(raw) || VOID_TAGS.has(name) || SVG_EMPTY_TAGS.has(name)) {
            out.push({ type: 'self', raw, name });
        }
        else
            out.push({ type: 'open', raw, name });
        i = gt + 1;
    }
    return out;
}
function repairTemplateStructure(tpl) {
    const toks = tokenizeTagStream(tpl);
    const stack = [];
    const siblingHadIf = [];
    const log = {
        impliedClose: 0,
        strayClose: 0,
        tailClose: 0,
        elseIfDowngrade: 0,
        changed: false,
    };
    let out = '';
    for (const t of toks) {
        if (t.type === 'other') {
            out += t.raw;
            continue;
        }
        if (t.type === 'self') {
            out += t.raw;
            siblingHadIf[stack.length] = false;
            continue;
        }
        if (t.type === 'open') {
            const depth = stack.length;
            let raw = t.raw;
            if (HAS_ELSE_IF_RX.test(raw) && !siblingHadIf[depth]) {
                raw = raw.replace(ELSE_IF_TO_IF_RX, '$1v-if$2');
                log.elseIfDowngrade++;
            }
            out += raw;
            stack.push({ name: t.name, raw });
            siblingHadIf[depth] = HAS_IF_RX.test(raw) || HAS_ELSE_IF_RX.test(raw);
            continue;
        }
        if (!stack.length) {
            log.strayClose++;
            continue;
        }
        const top = stack[stack.length - 1];
        if (top.name === t.name) {
            stack.pop();
            out += t.raw;
            siblingHadIf[stack.length] = HAS_IF_RX.test(top.raw) || HAS_ELSE_IF_RX.test(top.raw);
            continue;
        }
        let k = -1;
        for (let d = stack.length - 1; d >= 0; d--) {
            if (stack[d].name === t.name) {
                k = d;
                break;
            }
        }
        if (k === -1) {
            log.strayClose++;
            continue;
        }
        const matched = stack[k];
        for (let d = stack.length - 1; d > k; d--) {
            out += '</' + stack[d].name + '>';
            log.impliedClose++;
        }
        stack.length = k;
        out += t.raw;
        siblingHadIf[stack.length] = HAS_IF_RX.test(matched.raw) || HAS_ELSE_IF_RX.test(matched.raw);
    }
    while (stack.length) {
        const t = stack.pop();
        if (!t)
            break;
        out += '</' + t.name + '>';
        log.tailClose++;
    }
    log.changed =
        log.impliedClose + log.strayClose + log.tailClose + log.elseIfDowngrade > 0;
    return { tpl: out, log };
}
function normalizeInlineHandlers(tpl) {
    let normalized = 0;
    let skipped = 0;
    const out = tpl.replace(/(@[A-Za-z][\w:.-]*\s*=\s*")([\s\S]*?)(")/g, (whole, pre, expr, post) => {
        const m = /^\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/.exec(expr);
        if (!m)
            return whole;
        const body = m[2].replace(/\bthis\./g, '');
        if (/\bthis\b/.test(body)) {
            skipped++;
            return whole;
        }
        normalized++;
        return pre + '(' + m[1].trim() + ') => {' + body + '}' + post;
    });
    return { tpl: out, normalized, skipped };
}
function stripTags(tpl) {
    let i = 0;
    let out = '';
    while (i < tpl.length) {
        const lt = tpl.indexOf('<', i);
        if (lt === -1) {
            out += tpl.slice(i);
            break;
        }
        out += tpl.slice(i, lt);
        if (tpl.startsWith('<!--', lt)) {
            const e = tpl.indexOf('-->', lt + 4);
            i = e === -1 ? tpl.length : e + 3;
            continue;
        }
        const gt = (0, s4_component_registry_1.findTagGt)(tpl, lt);
        if (gt === -1) {
            out += tpl.slice(lt);
            break;
        }
        out += ' ';
        i = gt + 1;
    }
    return out;
}
function extractTextTokens(html, template) {
    let body = template;
    body = body.replace(/<style[\s\S]*?<\/style>/g, ' ');
    body = body.replace(/<script[\s\S]*?<\/script>/g, ' ');
    const text = stripTags(body);
    const tokens = new Set();
    const cn = text.match(/[一-龥]{2,}/g) || [];
    for (const t of cn)
        tokens.add(t);
    const en = text.match(/[A-Za-z][A-Za-z0-9 _\-]{1,}/g) || [];
    for (const t of en) {
        const s = t.trim();
        if (s.length >= 2 && !/^(div|span|button|table|thead|tbody|tr|th|td|section|aside|main|header|nav|dialog|form|label|select|option|svg|path|h1|h2|h3|h4|small|strong|em|article|input|ref)$/i.test(s)) {
            tokens.add(s);
        }
    }
    const titleM = html.match(/<title>([\s\S]*?)<\/title>/);
    if (titleM)
        for (const t of (titleM[1].match(/[一-龥]{2,}/g) || []))
            tokens.add(t);
    return [...tokens].sort();
}
function extractHeadings(template) {
    const out = [];
    const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g;
    let m;
    while ((m = re.exec(template))) {
        const t = stripTags(m[1]).trim();
        if (t)
            out.push(t);
    }
    return out;
}
function extractTables(template) {
    const out = [];
    const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/g;
    let tm;
    while ((tm = tableRe.exec(template))) {
        const tableHtml = tm[1];
        const columns = [];
        const thRe = /<th[^>]*>([\s\S]*?)<\/th>/g;
        let hm;
        while ((hm = thRe.exec(tableHtml))) {
            const t = stripTags(hm[1]).replace(/{{[^}]+}}/g, '').trim();
            if (t)
                columns.push(t);
        }
        const trRe = /<tr\b[^>]*\bv-for="[^"]*?\b(?:in|of)\s+([A-Za-z_$][\w$]*)/;
        const dm = trRe.exec(tableHtml);
        out.push({ columns, dataSource: dm ? dm[1] : '' });
    }
    return out;
}
function extractIcons(template) {
    const out = new Set();
    const re = /<c-icon\b[^>]*\bname="([^"]+)"/g;
    let m;
    while ((m = re.exec(template)))
        out.add(m[1]);
    return [...out].sort();
}
const REF_KEYWORDS = new Set([
    'true', 'false', 'null', 'undefined', 'this', 'function', 'return', 'if', 'else', 'for',
    'in', 'of', 'new', 'typeof', 'await', 'async', 'const', 'let', 'var', 'class', 'extends',
    'do', 'while', 'switch', 'case', 'break', 'continue', 'void', 'delete', 'instanceof',
]);
const REF_GLOBALS = new Set([
    'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'console',
    'parseInt', 'parseFloat', 'isNaN', 'Set', 'Map', 'Promise', 'RegExp', 'Error', 'window',
    'document', 'ref', 'reactive', 'computed', 'watch', 'onMounted', 'onUnmounted', 'nextTick',
    'defineProps', 'defineEmits', '$refs', '$event', 'event',
]);
const REF_TAGS = new Set([
    'div', 'span', 'button', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'section', 'aside',
    'main', 'header', 'nav', 'dialog', 'form', 'label', 'select', 'option', 'svg', 'path', 'h1',
    'h2', 'h3', 'h4', 'small', 'strong', 'em', 'article', 'input', 'ref', 'details', 'summary',
    'a', 'p', 'img', 'ul', 'li', 'i', 'b', 'br', 'style', 'script', 'template', 'component',
    'transition', 'keep',
]);
function collectRefs(template) {
    const refs = new Map();
    const ensure = (name) => {
        let r = refs.get(name);
        if (!r) {
            r = {
                name, isMethod: false, loopVar: false, usedAsIndex: false,
                usedAsArrayMethod: false, usedAsLength: false, usedAsProp: false,
                usedAsVForSource: false,
            };
            refs.set(name, r);
        }
        return r;
    };
    const vforRe = /\bv-for="([^"]*)"/g;
    let m;
    while ((m = vforRe.exec(template))) {
        const expr = m[1];
        const decl = expr.match(/\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)\s+(?:in|of)\s+/)
            || expr.match(/^\s*([A-Za-z_$][\w$]*)\s+(?:in|of)\s+/);
        if (decl) {
            ensure(decl[1]).loopVar = true;
            if (decl[2])
                ensure(decl[2]).loopVar = true;
        }
        const src = expr.match(/(?:in|of)\s+([A-Za-z_$][\w$]*)/);
        if (src)
            ensure(src[1]).usedAsVForSource = true;
    }
    const exprs = [];
    const mustache = /\{\{([\s\S]*?)\}\}/g;
    while ((m = mustache.exec(template)))
        exprs.push(m[1]);
    const attrRe = /(@|v-|:)[A-Za-z0-9_:-]*\s*=\s*"([^"]*)"/g;
    while ((m = attrRe.exec(template)))
        exprs.push(m[2]);
    const idRe = /[A-Za-z_$][\w$]*/g;
    for (const e of exprs) {
        let im;
        while ((im = idRe.exec(e))) {
            const id = im[0];
            if (REF_KEYWORDS.has(id) || REF_GLOBALS.has(id) || REF_TAGS.has(id))
                continue;
            const prev = im.index > 0 ? e[im.index - 1] : '';
            if (prev === '.')
                continue;
            const info = ensure(id);
            const after = e.slice(im.index + id.length);
            if (/^\s*\(/.test(after)) {
                info.isMethod = true;
                continue;
            }
            const ARRAY_METHODS = 'slice|map|filter|forEach|reduce|find|findIndex|some|every|sort|concat';
            if (/^\s*\[/.test(after))
                info.usedAsIndex = true;
            if (/^\s*\./.test(after))
                info.usedAsProp = true;
            if (new RegExp('^\\s*\\[[^\\]]*\\]\\s*\\.(' + ARRAY_METHODS + ')\\b').test(after)) {
                info.usedAsArrayMethod = true;
            }
            if (new RegExp('^\\s*\\.(' + ARRAY_METHODS + ')\\b').test(after)) {
                info.usedAsArrayMethod = true;
            }
            if (/^\s*\.length\b/.test(after))
                info.usedAsLength = true;
        }
    }
    return refs;
}
function collectDataRefs(template) {
    const refs = collectRefs(template);
    const out = [];
    for (const info of refs.values()) {
        if (info.loopVar || info.isMethod)
            continue;
        if (info.usedAsVForSource ||
            info.usedAsLength ||
            info.usedAsArrayMethod ||
            info.usedAsIndex ||
            info.usedAsProp) {
            out.push(info.name);
        }
    }
    return [...new Set(out)].sort();
}
function buildPlaceholderScript(template) {
    const refs = collectRefs(template);
    const lines = [];
    lines.push('// 智能占位数据层（Phase 1）：保证模板引用均有定义，页面可渲染不空白；真实 API 接线为 Phase 2。');
    lines.push('const __dataRefs = {};');
    lines.push('function __objOfArrays() {');
    lines.push('  const __store = {};');
    lines.push("  return new Proxy(__store, { get: (_t, k) => (Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : (__store[k] = [])) });");
    lines.push('}');
    const known = {
        metrics: "[{ title: '示例指标', icon: 'dashboard', values: [{ label: '示例', value: '0', unit: '', tone: '' }] }]",
        periods: "[{ key: 'today', label: '今日' }, { key: 'week', label: '本周' }, { key: 'month', label: '本月' }]",
    };
    for (const info of refs.values()) {
        if (info.loopVar)
            continue;
        const n = info.name;
        if (info.isMethod) {
            lines.push(`function ${n}(...args) { return undefined; }`);
            continue;
        }
        if (known[n]) {
            lines.push(`const ${n} = ref(${known[n]});`);
        }
        else if (info.usedAsArrayMethod) {
            lines.push(`const ${n} = __objOfArrays();`);
        }
        else if (info.usedAsVForSource || info.usedAsLength) {
            lines.push(`const ${n} = ref([]);`);
        }
        else if (info.usedAsIndex || info.usedAsProp) {
            lines.push(`const ${n} = reactive({});`);
        }
        else {
            lines.push(`const ${n} = ref('');`);
        }
        lines.push(`__dataRefs['${n}'] = ${n};`);
    }
    return lines.join('\n');
}
function buildEmbedSlotHtml(e) {
    const safe = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(e.componentId || '') ? e.componentId : '';
    if (!safe)
        return '';
    const slot = (e.slotKey || '').replace(/[^A-Za-z0-9_-]/g, '');
    return `  <div class="s4-embed-slot"${slot ? ` data-embed-slot="${slot}"` : ''}>\n    <${safe} />\n  </div>`;
}
const VOID_TAGS = new Set([
    'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base',
    'col', 'embed', 'param', 'track', 'wbr',
]);
function splitElement(raw) {
    const gt = (0, s4_component_registry_1.findTagGt)(raw, 0);
    if (gt === -1)
        return null;
    if (raw[gt - 1] === '/')
        return { open: raw, inner: '', close: '' };
    const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
    if (!tagM)
        return null;
    const tag = tagM[1].toLowerCase();
    if (VOID_TAGS.has(tag))
        return { open: raw, inner: '', close: '' };
    let depth = 1;
    let j = gt + 1;
    while (j < raw.length) {
        if (raw[j] !== '<') {
            j++;
            continue;
        }
        if (raw.startsWith('<!--', j)) {
            const e = raw.indexOf('-->', j + 4);
            j = e === -1 ? raw.length : e + 3;
            continue;
        }
        const m = /^<\s*\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw.slice(j));
        if (!m) {
            j++;
            continue;
        }
        const t = m[1].toLowerCase();
        if (raw[j + 1] === '/') {
            const g2 = (0, s4_component_registry_1.findTagGt)(raw, j);
            if (t === tag) {
                depth--;
                if (depth === 0) {
                    j = g2 + 1;
                    break;
                }
            }
            j = g2 + 1;
        }
        else {
            const g2 = (0, s4_component_registry_1.findTagGt)(raw, j);
            const selfClose = raw[g2 - 1] === '/';
            if (t === tag && !selfClose)
                depth++;
            j = g2 + 1;
        }
    }
    if (depth !== 0)
        return null;
    const closeStart = raw.lastIndexOf('<', j);
    return {
        open: raw.slice(0, gt + 1),
        close: raw.slice(closeStart),
        inner: raw.slice(gt + 1, closeStart),
    };
}
function collectDirectChildren(inner) {
    const children = [];
    let i = 0;
    const len = inner.length;
    const skipWs = () => { while (i < len && /\s/.test(inner[i]))
        i++; };
    while (i < len) {
        skipWs();
        if (i >= len)
            break;
        if (inner[i] !== '<') {
            i++;
            continue;
        }
        if (inner.startsWith('<!--', i)) {
            const e = inner.indexOf('-->', i + 4);
            i = e === -1 ? len : e + 3;
            continue;
        }
        const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner.slice(i));
        if (!tagM) {
            i++;
            continue;
        }
        const tag = tagM[1].toLowerCase();
        const gt = (0, s4_component_registry_1.findTagGt)(inner, i);
        if (gt === -1) {
            i = len;
            break;
        }
        const selfClose = inner[gt - 1] === '/';
        if (VOID_TAGS.has(tag) || selfClose) {
            children.push(inner.slice(i, gt + 1));
            i = gt + 1;
            continue;
        }
        let depth = 1;
        let j = gt + 1;
        while (j < len) {
            if (inner[j] !== '<') {
                j++;
                continue;
            }
            if (inner.startsWith('<!--', j)) {
                const e = inner.indexOf('-->', j + 4);
                j = e === -1 ? len : e + 3;
                continue;
            }
            const m = /^<\s*\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner.slice(j));
            if (!m) {
                j++;
                continue;
            }
            const t = m[1].toLowerCase();
            if (inner[j + 1] === '/') {
                const g2 = (0, s4_component_registry_1.findTagGt)(inner, j);
                if (t === tag) {
                    depth--;
                    if (depth === 0) {
                        j = g2 + 1;
                        break;
                    }
                }
                j = g2 + 1;
            }
            else {
                const g2 = (0, s4_component_registry_1.findTagGt)(inner, j);
                const isSelf = inner[g2 - 1] === '/';
                if (t === tag && !isSelf)
                    depth++;
                j = g2 + 1;
            }
        }
        children.push(inner.slice(i, j));
        i = j;
    }
    return children;
}
function parseTemplateBlocks(tpl) {
    const top = collectDirectChildren(tpl);
    if (top.length === 1) {
        const sp = splitElement(top[0]);
        if (sp) {
            return { open: sp.open, close: sp.close, children: collectDirectChildren(sp.inner) };
        }
    }
    return { open: '', close: '', children: top };
}
function blockHintText(raw) {
    const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(raw);
    if (h) {
        const t = stripTags(h[1]).trim();
        if (t)
            return t.slice(0, 30);
    }
    const txt = stripTags(raw.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    if (txt)
        return txt.slice(0, 30);
    const cls = /\bclass="([^"]*)"/.exec(raw);
    const tag = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
    return (tag ? tag[1] : 'block') + (cls ? '.' + (cls[1].split(/\s+/)[0] || '') : '');
}
function insertEmbeds(template, embeds) {
    const viewEmbeds = (embeds || []).filter((e) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(e.componentId || ''));
    if (!viewEmbeds.length)
        return template;
    const { open, close, children } = parseTemplateBlocks(template);
    const N = children.length;
    if (!N) {
        const all = viewEmbeds.map(buildEmbedSlotHtml).filter(Boolean).join('\n');
        return `${open}${all ? '\n' + all : ''}${close}`;
    }
    const byPos = new Map();
    for (const e of viewEmbeds) {
        let pos = typeof e.pos === 'number' && Number.isFinite(e.pos) ? e.pos : N;
        if (pos < 0)
            pos = 0;
        if (pos > N)
            pos = N;
        if (!byPos.has(pos))
            byPos.set(pos, []);
        const html = buildEmbedSlotHtml(e);
        if (html)
            byPos.get(pos).push(html);
    }
    let inner = '';
    for (let i = 0; i < N; i++) {
        const at = byPos.get(i);
        if (at)
            inner += '\n' + at.join('\n');
        inner += '\n' + children[i];
    }
    const atEnd = byPos.get(N);
    if (atEnd)
        inner += '\n' + atEnd.join('\n');
    return open + inner + close;
}
function buildPageView(idx, extract, template, usedComponents, commonCss, html, apiTags, autoBindings, runId, binding, embeds) {
    const viewName = extract.viewName;
    const inlineStyle = extractInlineStyle(html);
    const tokens = extractTokens(commonCss);
    const styleLess = [
        tokens,
        '/* 原型页内联样式（已从 head <style> 搬入，scoped；body/#app 全局规则已剥离） */',
        inlineStyle,
    ]
        .filter(Boolean)
        .join('\n');
    const imports = ["import { ref, reactive, onMounted } from 'vue';"];
    for (const name of usedComponents)
        imports.push(`import ${name} from '@/components/${name}.vue';`);
    const dataScript = buildPlaceholderScript(template);
    const apiMergeScript = buildApiMergeScript(apiTags, autoBindings, runId, viewName, binding);
    const pageTemplate = insertEmbeds(template, embeds);
    return `<template>
${pageTemplate}
</template>

<script setup lang="js">
${imports.join('\n')}
// 页面标题（来自原型页 <title>）
if (typeof document !== 'undefined') document.title = ${JSON.stringify(extract.title)};
// 占位样本数据：保证 v-for 可渲染、不空白；真实 API 接线为合并 S3 产物（见下）。
${dataScript}
${apiMergeScript}
</script>

<style scoped lang="less">
${styleLess}
</style>
`;
}
function buildApiMergeScript(apiTags, autoBindings, runId, viewName, binding) {
    if (!apiTags.length && !binding && !autoBindings.length)
        return '';
    const tagLoaders = apiTags
        .map((t) => `    '${t}': () => import('@/api/${t}.ts'),`)
        .join('\n');
    const bindingConst = binding
        ? `const __s4Binding = ${JSON.stringify(binding)};`
        : `const __s4Binding = null;`;
    const autoConst = `const __autoBindings = ${JSON.stringify(autoBindings)};`;
    return `
// ── 合并 S3 产物 + S4 接口绑定（Phase 2 取数钩子 · 见 s4-vuegen.ts）────────
const __apiModules = [];
const __apiByTag = {};
const __apiReady = ref(false);
const __runId = ${JSON.stringify(runId || null)};
const __viewName = ${JSON.stringify(viewName || null)};
${bindingConst}
${autoConst}
// 把某 tag 下某函数的返回数据接到指定数据槽（ref 赋 .value，reactive 用 Object.assign）。
// 任一环节缺失（模块未加载/函数不存在/取数抛错/槽不存在）都返回 false，调用方保持占位样本。
async function __applySlot(__tag, __fnName, __params, __target) {
  const __mod = __apiByTag[__tag];
  const __fn = __mod && __mod[__fnName];
  if (typeof __fn !== 'function') return false;
  try {
    const __res = await __fn(__params || {});
    const __data = __res && __res.data !== undefined ? __res.data : __res;
    const __slot = __dataRefs[__target];
    if (!__slot) return false;
    if (__slot && typeof __slot === 'object' && 'value' in __slot) __slot.value = __data;
    else if (__slot && typeof __slot === 'object') Object.assign(__slot, __data || {});
    return true;
  } catch (e) {
    // 取数失败 → 保持占位样本数据
    return false;
  }
}
onMounted(async () => {
  const __loaders = {
${tagLoaders}
  };
  for (const [__tag, __load] of Object.entries(__loaders)) {
    try {
      const mod = await __load();
      if (mod) { __apiModules.push(mod); __apiByTag[__tag] = mod; __apiReady.value = true; }
    } catch (e) {
      // 预览/沙箱环境无 @/core/http 等宿主依赖 → 保持占位样本数据（默认）
    }
  }
  // Phase 2a：默认自动接线（确定性配对；无侧车也取数）
  for (const __b of __autoBindings) {
    await __applySlot(__b.tag, __b.fn, __b.params, __b.target);
  }
  // Phase 2b：人工绑定侧车（后应用 → 覆盖自动接线）
  if (__s4Binding) {
    await __applySlot(__s4Binding.tag, __s4Binding.fn, __s4Binding.params, __s4Binding.target);
  }
});`;
}
const API_SKIP_FILES = new Set(['index.ts', 'types.ts']);
function readApiModules(generatedRoot) {
    if (!generatedRoot)
        return [];
    const apiDir = path.join(generatedRoot, 'frontend/src/api');
    let files = [];
    try {
        if (!fs.existsSync(apiDir))
            return [];
        files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.ts') && !API_SKIP_FILES.has(f));
    }
    catch {
        return [];
    }
    const out = [];
    for (const f of files) {
        let content = '';
        try {
            content = fs.readFileSync(path.join(apiDir, f), 'utf8');
        }
        catch {
            continue;
        }
        const fnRe = /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g;
        const hits = [];
        let m;
        while ((m = fnRe.exec(content)))
            hits.push({ name: m[1], index: m.index });
        const functions = [];
        const seen = new Set();
        for (let i = 0; i < hits.length; i++) {
            const { name, index } = hits[i];
            if (seen.has(name))
                continue;
            seen.add(name);
            const seg = content.slice(index, i + 1 < hits.length ? hits[i + 1].index : content.length);
            const url = (seg.match(/const\s+url\s*=\s*'([^']*)'/) || [])[1] || '';
            const method = (seg.match(/http\.(get|post|put|delete|patch)\s*</) || [])[1] || 'get';
            functions.push({ name, method, url, hasPathParam: /:(\w+)/.test(url) });
        }
        functions.sort((a, b) => a.name.localeCompare(b.name));
        out.push({ tag: f.replace(/\.ts$/, ''), functions });
    }
    return out.sort((a, b) => a.tag.localeCompare(b.tag));
}
function tokensOf(s) {
    return String(s || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}
const TOKEN_STOP = new Set([
    'api', 'mvgo', 'bridge', 'vo', 'dto', 'res', 'resp', 'response', 'result',
    'the', 'and', 'with', 'by',
]);
const FN_VERB = /^(get|fetch|load|read|find|search|query|create|add|post|insert|update|put|patch|modify|remove|delete|del|save|submit|export|download|do|exec)+/i;
function isSubsetOf(a, b) {
    if (!a.length)
        return false;
    return a.every((t) => b.has(t));
}
function autoWireBindings(dataRefs, modules) {
    const slots = [...new Set(dataRefs)].sort();
    const chosen = slots.map((slot) => {
        const stArr = [...new Set(tokensOf(slot))].filter((t) => !TOKEN_STOP.has(t));
        if (!stArr.length)
            return undefined;
        const stSet = new Set(stArr);
        const cands = [];
        for (const mod of modules) {
            for (const f of mod.functions) {
                if (f.hasPathParam)
                    continue;
                const nameAfterVerb = f.name.replace(FN_VERB, '');
                const candSet = new Set([...tokensOf(nameAfterVerb), ...tokensOf(f.url)].filter((t) => !TOKEN_STOP.has(t)));
                if (!candSet.size)
                    continue;
                const candArr = [...candSet];
                if (!isSubsetOf(stArr, candSet) && !isSubsetOf(candArr, stSet))
                    continue;
                cands.push({ tag: mod.tag, fn: f.name, score: stArr.filter((t) => candSet.has(t)).length });
            }
        }
        if (!cands.length)
            return undefined;
        const best = Math.max(...cands.map((c) => c.score));
        const top = [...new Map(cands.filter((c) => c.score === best).map((c) => [c.tag + '.' + c.fn, c])).values()];
        if (top.length !== 1)
            return undefined;
        return { tag: top[0].tag, fn: top[0].fn, target: slot, params: {} };
    });
    const fnUse = new Map();
    for (const b of chosen)
        if (b)
            fnUse.set(b.tag + '.' + b.fn, (fnUse.get(b.tag + '.' + b.fn) || 0) + 1);
    return chosen.filter((b) => !!b && fnUse.get(b.tag + '.' + b.fn) === 1);
}
function buildVueGen(opts) {
    const files = [];
    const notes = [];
    const extracts = [];
    const root = opts.projectRoot || '';
    const commonCss = (0, s4_component_registry_1.findCommonCss)(root);
    const pages = root ? findHtmlPages(root) : [];
    const pageFiles = pages.filter((p) => {
        try {
            return fs.readFileSync(p, 'utf8').includes('id="app"');
        }
        catch {
            return false;
        }
    });
    if (!pageFiles.length) {
        notes.push('未在原工程中找到含 <div id="app"> 的原型页模板，S4 未生成 Vue 页面（可能该工程无前端原型）。');
        return { files, extracts, notes };
    }
    const apiModules = readApiModules(opts.generatedRoot);
    const apiTags = apiModules.map((m) => m.tag);
    const pageInputs = [];
    const observedTags = [];
    for (const file of pageFiles) {
        let html = '';
        try {
            html = fs.readFileSync(file, 'utf8');
        }
        catch {
            continue;
        }
        const pageLabel = path.basename(file);
        const { template: rawTemplate, mode } = extractAppTemplate(html);
        if (mode === 'none' || !rawTemplate) {
            notes.push(`页面 ${pageLabel} 未提取到 #app 模板，跳过。`);
            continue;
        }
        if (mode === 'legacy') {
            notes.push(`页面 ${pageLabel}：#app 内 div 未配平，已回退旧正则边界（模板闭合可能不完整，建议修正原型）。`);
        }
        const repaired = repairTemplateStructure(rawTemplate);
        const handler = normalizeInlineHandlers(repaired.tpl);
        if (repaired.log.changed) {
            notes.push(`页面 ${pageLabel}：#app 模板标签不配平/错位（原型手写缺陷），已确定性良构修复` +
                `（补闭合 ${repaired.log.impliedClose + repaired.log.tailClose} 处、` +
                `丢弃游离闭合 ${repaired.log.strayClose} 处、` +
                `非相邻 v-else-if 降级 ${repaired.log.elseIfDowngrade} 处）→ 产物可编译；建议修正原型。`);
        }
        if (handler.normalized) {
            notes.push(`页面 ${pageLabel}：${handler.normalized} 处内联 function(e){…} 事件处理器已归一为箭头函数表达式（剥除 this.），否则 Vue3 模板编译不通过。`);
        }
        if (handler.skipped) {
            notes.push(`页面 ${pageLabel}：${handler.skipped} 处内联 function 处理器含裸 this，无法安全归一，已原样保留（该页可能编译失败）。`);
        }
        pageInputs.push({ file, html, pageTpl: handler.tpl });
        for (const tag of (0, s4_component_registry_1.findCustomTags)(handler.tpl)) {
            if (!observedTags.includes(tag))
                observedTags.push(tag);
        }
    }
    const registry = (0, s4_component_registry_1.buildComponentRegistry)(root, commonCss, observedTags);
    notes.push(...registry.notes);
    for (const spec of registry.specs) {
        files.push({ rel: (0, s4_component_registry_1.componentRel)(spec.name), content: spec.make(registry.ctx) });
    }
    let idx = 0;
    let autoBindTotal = 0;
    const metaViews = [];
    for (const { file, html, pageTpl } of pageInputs) {
        const { tpl: template, used: usedComponents } = (0, s4_component_registry_1.rewriteComponentTags)(pageTpl, registry.specs);
        idx++;
        const pageName = path.basename(file, '.html');
        const viewName = slugifyView(idx);
        const textTokens = extractTextTokens(html, template);
        const sectionHeadings = extractHeadings(template);
        const tables = extractTables(template);
        const icons = extractIcons(pageTpl);
        const usesTopBar = /<top-bar\b|<TopBar\b/.test(pageTpl);
        const dataRefs = collectDataRefs(template);
        const extract = {
            pageName,
            viewName,
            title: (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || pageName,
            textTokens,
            sectionHeadings,
            tables,
            icons,
            usesTopBar,
            dataRefs,
        };
        extracts.push(extract);
        const viewBinding = opts.binding && opts.binding.target && dataRefs.includes(opts.binding.target)
            ? opts.binding
            : undefined;
        const viewAutoBindings = autoWireBindings(dataRefs, apiModules);
        const viewEmbeds = (opts.embeds || []).filter((e) => e.view === viewName);
        const view = buildPageView(idx, extract, template, usedComponents, commonCss, html, apiTags, viewAutoBindings, opts.runId, viewBinding, viewEmbeds);
        files.push({ rel: `frontend/src/views/${viewName}.vue`, content: view });
        const viewBlocks = parseTemplateBlocks(template).children.map((c, i) => {
            const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(c);
            const rawTag = tagM ? tagM[1] : 'div';
            const tag = /^[A-Z]/.test(rawTag) ? (0, s4_component_registry_1.kebabizeName)(rawTag) : rawTag.toLowerCase();
            return { index: i, tag, hint: blockHintText(c) };
        });
        metaViews.push({ viewName, pageName, dataRefs, autoBindings: viewAutoBindings, blocks: viewBlocks });
        autoBindTotal += viewAutoBindings.length;
    }
    files.push({
        rel: 'frontend/s4-meta.json',
        content: JSON.stringify({
            runId: opts.runId,
            generatedAt: opts.generatedAt,
            views: metaViews,
            components: registry.specs.map((s) => ({
                name: s.name,
                tag: s.tag,
                source: s.source,
                props: s.props,
                slots: s.slots,
                file: (0, s4_component_registry_1.componentRel)(s.name),
            })),
        }, null, 2) + '\n',
    });
    notes.push(`S4 真·Vue 页面：从原工程 ${pages.length} 个 .html 中成功抽取 ${idx} 个 #app 原型页，生成 ${idx} 个 GenViewNN.vue（保留原模板 + scoped 样式 + 占位样本数据）。`);
    notes.push('视觉保真门禁（就绪态·轻量）：抽取文案/标题作为 TEXT-TRUTH 真值，确定性断言产物包含全部抽取文案 + 区块标题；非 vision/figma 比对。');
    notes.push('S4 默认自动接线（Phase 2a）：按「数据槽名 ↔ S3 api 函数名/URL」归一化词元配对，互为子集且唯一、' +
        `函数 URL 不含 :param 才绑；本 run 共自动绑定 ${autoBindTotal} 处（api 模块 ${apiTags.length} 个）。` +
        '歧义（多候选并列 / 一函数对多槽）一律放弃 → 该槽保持占位样本数据，页面绝不空白/抛错。');
    notes.push('人工绑定侧车（Phase 2b）：binding.json 存在时后应用，覆盖自动接线结果（见 project-lab「对接接口」）。');
    notes.push('未生成图表真实数据（echarts 接入 Phase 2），保留 .trend-chart 容器与 ref。');
    return { files, extracts, notes };
}
function verifyVueGen(result, builtFiles) {
    const missingText = [];
    const missingHeadings = [];
    for (const ex of result.extracts) {
        const rel = `frontend/src/views/${ex.viewName}.vue`;
        const own = builtFiles[rel];
        if (typeof own !== 'string') {
            missingText.push(`${ex.viewName}: (视图产物缺失 ${rel})`);
            continue;
        }
        for (const t of ex.textTokens) {
            if (!own.includes(t))
                missingText.push(`${ex.viewName}: ${t}`);
        }
        for (const h of ex.sectionHeadings) {
            if (!own.includes(h))
                missingHeadings.push(`${ex.viewName}: ${h}`);
        }
    }
    return { pass: missingText.length === 0 && missingHeadings.length === 0, missingText, missingHeadings };
}
//# sourceMappingURL=s4-vuegen.js.map