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
exports.componentRel = componentRel;
exports.pascalizeTag = pascalizeTag;
exports.kebabizeName = kebabizeName;
exports.findCommonCss = findCommonCss;
exports.scanPrototypeAssets = scanPrototypeAssets;
exports.classesInTemplate = classesInTemplate;
exports.extractCssRules = extractCssRules;
exports.findTagGt = findTagGt;
exports.findCustomTags = findCustomTags;
exports.rewriteComponentTags = rewriteComponentTags;
exports.buildComponentRegistry = buildComponentRegistry;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
function componentRel(name) {
    return `frontend/src/components/${name}.vue`;
}
function pascalizeTag(tag) {
    return tag
        .trim()
        .replace(/^[^A-Za-z]+/, '')
        .split(/[-_]+/)
        .filter(Boolean)
        .map((p) => (/^[A-Z]/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join('');
}
function kebabizeName(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
const HTML_SVG_HYPHENATED = new Set([
    'annotation-xml',
    'color-profile',
    'font-face',
    'font-face-src',
    'font-face-uri',
    'font-face-format',
    'font-face-name',
    'missing-glyph',
]);
function readIfExists(p) {
    try {
        return fs.readFileSync(p, 'utf8');
    }
    catch {
        return '';
    }
}
function walkFiles(root, pred, maxDepth = 6) {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > maxDepth)
            return;
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e.name === 'node_modules' || e.name === 'libs')
                continue;
            if (e.name.startsWith('.') && e.name !== '.')
                continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory())
                walk(full, depth + 1);
            else if (e.isFile() && pred(full))
                out.push(full);
        }
    };
    walk(root, 0);
    return out.sort();
}
function findCommonCss(root) {
    if (!root)
        return '';
    const candidates = [
        path.join(root, 'html/模块1/common/common.css'),
        path.join(root, 'html/common/common.css'),
        path.join(root, 'common/common.css'),
    ];
    for (const c of candidates) {
        const s = readIfExists(c);
        if (s)
            return s;
    }
    const hits = walkFiles(root, (f) => /(^|[\\/])common\.css$/i.test(f));
    return hits.length ? readIfExists(hits[0]) : '';
}
function sliceBalanced(src, start, open, close) {
    let depth = 0;
    let q = '';
    for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (q) {
            if (c === '\\') {
                i++;
                continue;
            }
            if (c === q)
                q = '';
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            q = c;
            continue;
        }
        if (c === open)
            depth++;
        else if (c === close) {
            depth--;
            if (depth === 0)
                return src.slice(start, i + 1);
        }
    }
    return '';
}
function extractBraceLiteral(src, varName) {
    const re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*\\{');
    const m = re.exec(src);
    if (!m)
        return '';
    return sliceBalanced(src, m.index + m[0].length - 1, '{', '}');
}
function extractBracketLiteral(src, varName) {
    const re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*\\[');
    const m = re.exec(src);
    if (!m)
        return '';
    return sliceBalanced(src, m.index + m[0].length - 1, '[', ']');
}
function extractStringMap(literal) {
    const out = {};
    const re = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(literal)))
        out[m[1]] = m[2];
    return out;
}
function extractObjectArray(literal) {
    const out = [];
    for (const chunk of literal.match(/\{[^{}]*\}/g) || []) {
        const pick = (f) => {
            const m = new RegExp(f + "\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'").exec(chunk);
            return m ? m[1] : '';
        };
        const key = pick('key');
        const label = pick('label');
        if (!key && !label)
            continue;
        const row = { key, label };
        const file = pick('file');
        const icon = pick('icon');
        if (file)
            row.file = file;
        if (icon)
            row.icon = icon;
        out.push(row);
    }
    return out;
}
function scanPrototypeAssets(root) {
    const assets = { registered: new Map(), icons: {}, modules: [], files: [] };
    if (!root)
        return assets;
    const files = walkFiles(root, (f) => /\.js$/i.test(f) && /[\\/]common[\\/][^\\/]*\.js$/i.test(f));
    assets.files = files;
    for (const f of files) {
        const src = readIfExists(f);
        if (!src)
            continue;
        const re = /\.component\(\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g;
        let m;
        while ((m = re.exec(src))) {
            const name = m[1];
            if (!assets.registered.has(name))
                assets.registered.set(name, { name, tag: kebabizeName(name) });
        }
        if (!Object.keys(assets.icons).length) {
            const lit = extractBraceLiteral(src, 'ICONS');
            if (lit)
                assets.icons = extractStringMap(lit);
        }
        if (!assets.modules.length) {
            const arr = extractBracketLiteral(src, 'MODULES');
            if (arr)
                assets.modules = extractObjectArray(arr);
        }
    }
    return assets;
}
function classesInTemplate(tpl) {
    const out = new Set();
    const re = /(?::class|class)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tpl))) {
        for (const tok of m[1].match(/[A-Za-z_-][-\w]*/g) || []) {
            if (tok.includes('-') || /^[a-z]{3,}$/.test(tok))
                out.add(tok);
        }
    }
    return [...out].sort();
}
function extractCssRules(css, classes) {
    const want = new Set(classes);
    if (!css || !want.size)
        return '';
    const out = [];
    let i = 0;
    while (i < css.length) {
        const brace = css.indexOf('{', i);
        if (brace === -1)
            break;
        const selector = css
            .slice(i, brace)
            .replace(/^(\s*\/\*[\s\S]*?\*\/)+/, '')
            .trim();
        const body = sliceBalanced(css, brace, '{', '}');
        if (!body)
            break;
        i = brace + body.length;
        if (!selector || selector.startsWith('@'))
            continue;
        const cls = selector.match(/\.[A-Za-z_][-\w]*/g) || [];
        if (cls.some((c) => want.has(c.slice(1))))
            out.push(`${selector} ${body}`);
    }
    return out.length ? out.join('\n') + '\n' : '';
}
function pickCss(ctx, template, fallback) {
    const fromPrototype = extractCssRules(ctx.commonCss, classesInTemplate(template));
    return fromPrototype || fallback;
}
function findTagGt(raw, start) {
    let j = start + 1;
    let q = '';
    while (j < raw.length) {
        const c = raw[j];
        if (q) {
            if (c === q)
                q = '';
        }
        else if (c === '"' || c === "'") {
            q = c;
        }
        else if (c === '>') {
            return j;
        }
        j++;
    }
    return -1;
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function findCustomTags(tpl) {
    const body = tpl.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
    const out = [];
    const re = /<\s*\/?\s*([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/g;
    let m;
    while ((m = re.exec(body))) {
        const tag = m[1].toLowerCase();
        if (HTML_SVG_HYPHENATED.has(tag))
            continue;
        if (!out.includes(tag))
            out.push(tag);
    }
    return out;
}
function rewriteComponentTags(tpl, specs) {
    const byTag = new Map(specs.map((s) => [s.tag, s]));
    const used = new Set();
    let out = '';
    let i = 0;
    while (i < tpl.length) {
        const lt = tpl.indexOf('<', i);
        if (lt === -1) {
            out += tpl.slice(i);
            break;
        }
        out += tpl.slice(i, lt);
        if (tpl.startsWith('<!--', lt)) {
            const e = tpl.indexOf('-->', lt + 4);
            const end = e === -1 ? tpl.length : e + 3;
            out += tpl.slice(lt, end);
            i = end;
            continue;
        }
        const head = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/.exec(tpl.slice(lt));
        const gt = findTagGt(tpl, lt);
        if (!head || gt === -1) {
            out += tpl.slice(lt);
            break;
        }
        const raw = tpl.slice(lt, gt + 1);
        const spec = byTag.get(head[2].toLowerCase());
        if (!spec) {
            out += raw;
            i = gt + 1;
            continue;
        }
        used.add(spec.name);
        if (head[1] === '/') {
            out += '</' + spec.name + '>';
        }
        else {
            const selfClosing = /\/\s*>$/.test(raw);
            const attrs = raw.slice(head[0].length, raw.length - 1).replace(/\/\s*$/, '').replace(/\s+$/, '');
            const hasClose = selfClosing || new RegExp('</\\s*' + escapeRe(head[2]) + '\\s*>', 'i').test(tpl.slice(gt + 1));
            out += '<' + spec.name + attrs + (selfClosing || !hasClose ? ' />' : '>');
        }
        i = gt + 1;
    }
    const order = specs.map((s) => s.name).filter((n) => used.has(n));
    return { tpl: out, used: order };
}
const CIconSpec = {
    name: 'CIcon',
    tag: 'c-icon',
    props: ['name', 'size'],
    slots: [],
    deps: [],
    source: 'builtin',
    make: (ctx) => {
        const keys = Object.keys(ctx.assets.icons);
        const table = keys.length
            ? '// 图标表：自原型 common/*.js 的 ICONS 对象确定性抽取（' + keys.length + ' 项）\nconst ICONS = ' +
                JSON.stringify(ctx.assets.icons, null, 2) + ';'
            : '// 原型未抽取到 ICONS 图标表，全部落到占位图（下方 FALLBACK）\nconst ICONS = {};';
        const template = '  <span class="c-icon" v-html="html" style="display:inline-flex;flex-shrink:0"></span>';
        const css = pickCss(ctx, template, '.c-icon {\n  display: inline-flex;\n  flex-shrink: 0;\n  vertical-align: middle;\n  color: inherit;\n}\n');
        return `<template>
${template}
</template>

<script setup lang="js">
import { computed } from 'vue';

${table}

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
});

// 未知图标名退化占位（原型为 ICONS.more，缺失时再退到通用矩形）
const FALLBACK = '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8"/>';
const html = computed(() => {
  const body = ICONS[props.name] || ICONS.more || FALLBACK;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:' + props.size + 'px;height:' + props.size + 'px;display:block">' + body + '</svg>';
});
</script>

<style scoped>
${css}</style>
`;
    },
};
const TopBarSpec = {
    name: 'TopBar',
    tag: 'top-bar',
    props: ['mode', 'pageTitle', 'snapshotTime', 'userName'],
    slots: [],
    deps: ['CIcon'],
    source: 'builtin',
    make: (ctx) => {
        const template = `  <div class="top-bar" :class="'tb-' + mode">
    <!-- default 模式：左日期天气 + 中平台标题 + 右访问量用户 -->
    <template v-if="mode==='default'">
      <div class="top-bar-left">
        <div class="datetime"><span>{{ now }}</span></div>
        <div class="weather">南京 多云 25℃~32℃</div>
      </div>
      <div class="top-bar-center">
        <div class="platform-title">江苏交控养护综合管理平台 3.0</div>
        <div class="platform-subtitle"><span>苏智</span><span class="brand-dot">·</span><span>慧养</span></div>
      </div>
      <div class="top-bar-right">
        <div class="visitor-count">平台访问量：<strong class="num" style="color:#69adff;">1237424</strong></div>
        <div class="visitor-count">当日访问量：<strong class="num" style="color:#69adff;">224</strong></div>
        <div class="user-info">
          <CIcon name="user" :size="18" style="opacity:.8" />
          <span>{{ userName }}</span>
          <CIcon name="power" class="power-icon" :size="20" title="退出登录" />
        </div>
      </div>
    </template>
    <!-- page 模式：左侧模块名称 + 快照时间，右侧用户 + 退出 -->
    <template v-else>
      <div class="tb-page-left">
        <CIcon name="dashboard" :size="18" style="color:var(--accent)" />
        <span class="tb-page-title">监控运维</span>
        <span class="tb-page-snap" v-if="snapshotTime">
          <CIcon name="clock" :size="13" style="opacity:.7" />
          快照时间：{{ snapshotTime }}
        </span>
      </div>
      <div class="tb-page-right">
        <div class="visitor-count">平台访问量：<strong class="num" style="color:#69adff;">1237424</strong></div>
        <div class="visitor-count">当日访问量：<strong class="num" style="color:#69adff;">224</strong></div>
        <div class="tb-user-avatar">
          <CIcon name="user" :size="20" style="color:#fff;opacity:.9" />
        </div>
        <span class="tb-user-name">{{ userName }}</span>
        <CIcon name="power" class="power-icon" :size="20" title="退出登录" @click="logout" />
      </div>
    </template>
  </div>`;
        const css = pickCss(ctx, template, '.top-bar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  width: 100%;\n}\n');
        return `<template>
${template}
</template>

<script setup lang="js">
import { ref, onMounted, onUnmounted } from 'vue';
import CIcon from '@/components/CIcon.vue';

defineProps({
  mode: { type: String, default: 'default' },
  pageTitle: { type: String, default: '' },
  snapshotTime: { type: String, default: '' },
  userName: { type: String, default: '杨毅' },
});

const now = ref('');
const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
let timer = null;
const pad = (n) => String(n).padStart(2, '0');
const tick = () => {
  const d = new Date();
  now.value = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' 星期' + weekMap[d.getDay()];
};
onMounted(() => { tick(); timer = setInterval(tick, 1000); });
onUnmounted(() => { if (timer) clearInterval(timer); });

const logout = () => { if (typeof window !== 'undefined') window.alert('退出登录'); };
</script>

<style scoped>
${css}</style>
`;
    },
};
const ModuleNavSpec = {
    name: 'ModuleNav',
    tag: 'module-nav',
    props: ['active', 'tabLabel', 'showCfg', 'showClose', 'hideTabs'],
    slots: ['nav-title', 'nav-actions'],
    deps: ['CIcon'],
    source: 'builtin',
    make: (ctx) => {
        const modules = ctx.assets.modules.length ? ctx.assets.modules : [];
        const template = `  <div class="role-tab-nav" :class="{'nav-actions-only': hideTabs}">
    <template v-if="!hideTabs">
      <a v-for="m in modules" :key="m.key" :href="m.file" class="role-tab-btn" :class="{ active: m.key === active }">
        <CIcon class="tab-ico" :name="m.icon" :size="16" />{{ tabLabel || m.label }}
      </a>
    </template>
    <slot name="nav-title"></slot>
    <div class="nav-right-spacer" v-if="hideTabs"></div>
    <button v-if="showCfg" class="cfg-btn" @click="emit('config')" title="设置">
      <CIcon name="setting" :size="14" style="opacity:.75" /> 设置
    </button>
    <slot name="nav-actions"></slot>
    <button v-if="showClose" class="tab-close-btn" @click="closePage" title="关闭页面">×</button>
  </div>`;
        const css = pickCss(ctx, template, '.role-tab-nav {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n');
        return `<template>
${template}
</template>

<script setup lang="js">
import CIcon from '@/components/CIcon.vue';

defineProps({
  active: { type: String, required: true },
  tabLabel: { type: String, default: '' },
  showCfg: { type: Boolean, default: true },
  showClose: { type: Boolean, default: true },
  hideTabs: { type: Boolean, default: false },
});
const emit = defineEmits(['config']);

// 模块导航数据：自原型 common/*.js 的 MODULES 数组确定性抽取（未抽到则为空列表）
const modules = ${JSON.stringify(modules, null, 2)};

// 原型的 window.close() 在预览/宿主环境可能被限制，加存在性守卫，行为等价
const closePage = () => { if (typeof window !== 'undefined') window.close(); };
</script>

<style scoped>
${css}</style>
`;
    },
};
const BUILTINS = [CIconSpec, TopBarSpec, ModuleNavSpec];
function makeFallbackSpec(name, tag, source) {
    return {
        name,
        tag,
        props: [],
        slots: [],
        deps: [],
        source,
        make: () => `<template>
  <!-- 通用占位：${source === 'prototype' ? '原型已注册但缺专用生成器' : '页面引用但原型未注册'}，
       仅透传插槽内容以保持结构与布局（display:contents 不产生额外盒） -->
  <div style="display:contents" data-s4-fallback="${name}"><slot /></div>
</template>
`,
    };
}
function buildComponentRegistry(root, commonCss, observedTags) {
    const assets = scanPrototypeAssets(root);
    const ctx = { projectRoot: root, commonCss, assets };
    const notes = [];
    const byTag = new Map();
    for (const b of BUILTINS)
        byTag.set(b.tag, b);
    const want = [...new Set(observedTags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
    const specs = [];
    const fallbackTags = [];
    for (const tag of want) {
        if (HTML_SVG_HYPHENATED.has(tag) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag))
            continue;
        const known = byTag.get(tag);
        if (known) {
            specs.push(known);
            continue;
        }
        const name = pascalizeTag(tag);
        const isRegistered = assets.registered.has(name);
        specs.push(makeFallbackSpec(name, tag, isRegistered ? 'prototype' : 'observed'));
        fallbackTags.push(`<${tag}>`);
    }
    for (const s of [...specs]) {
        for (const d of s.deps) {
            if (specs.some((x) => x.name === d))
                continue;
            const builtin = BUILTINS.find((b) => b.name === d);
            if (builtin)
                specs.push(builtin);
        }
    }
    specs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (specs.length) {
        notes.push(`S4 组件 registry：页面引用组件 ${specs.length} 个（${specs.map((s) => s.name).join(' / ')}）——` +
            `内置生成器 ${specs.filter((s) => s.source === 'builtin').length} 个、` +
            `原型注册 ${specs.filter((s) => s.source === 'prototype').length} 个、` +
            `仅观测到 ${specs.filter((s) => s.source === 'observed').length} 个；` +
            '模板改名 / import / 组件文件产出 / 组件样式同读此 registry。');
        const iconCount = Object.keys(assets.icons).length;
        if (iconCount) {
            notes.push(`CIcon 图标表：自原型 common/*.js 抽取 ${iconCount} 个图标（不再一律用占位图）。`);
        }
        else {
            notes.push('CIcon 图标表：原型 common/*.js 未抽到 ICONS，退化为占位图。');
        }
    }
    if (fallbackTags.length) {
        notes.push(`以下自定义标签无专用生成器，已产出通用占位组件（透传插槽、不阻断渲染）：${fallbackTags.join('、')}。`);
    }
    const unused = [...assets.registered.keys()].filter((n) => !specs.some((s) => s.name === n));
    if (unused.length) {
        notes.push(`原型已注册但页面未引用的组件（不产出产物，避免死代码）：${unused.join('、')}。`);
    }
    if (!assets.registered.size && !assets.files.length) {
        notes.push('未在原型 common/*.js 中找到 app.component 注册项，组件清单仅依据页面实际标签。');
    }
    return { specs, notes, ctx };
}
//# sourceMappingURL=s4-component-registry.js.map