/* ============================================================================
 * s4-component-registry.ts — S4 组件 registry（单一来源 · 确定性 · 零 LLM）
 * ----------------------------------------------------------------------------
 * 目的：S4 页面模板里的「自定义标签 → 组件」过去靠两行硬编码正则（c-icon / top-bar）
 *      实现，落点分散在三处（模板改名、import 生成、组件文件产出），任何一处新增
 *      组件都会漏 —— 实测样本的 <module-nav> 因此既未被改名、也未产出组件文件，
 *      预览时成为未解析标签。本模块把这套映射收敛为【一份 registry】：
 *
 *        registry 条目 = 原型 common/*.js 里 app.component('<Name>', X) 的注册项
 *                        ∪ 内置生成器（CIcon / TopBar / ModuleNav）
 *                        ∪ 页面实际观测到但无人认领的自定义标签（→ 通用 fallback）
 *
 *      改名（rewriteComponentTags）、import、组件文件产出、样式抽取全部读同一份
 *      registry，新增组件只需加一个条目，三处自动一致。
 *
 * 判据（真值来源，均可辩驳）：
 *   · 组件清单真值 = 原型 common/*.js 的 app.component 注册名（不靠 LLM 猜）；
 *   · 标签名 ↔ 组件名 = Vue 自身的 kebabize / pascalize 规则（c-icon ↔ CIcon）；
 *   · 图标表真值 = 原型 ICONS 对象字面量（确定性抽取，不再一律占位 rect）；
 *   · 组件级样式真值 = 原型 common.css 中「被该组件模板类名命中」的规则
 *     （样式随模板走，不做前缀白名单，故 .visitor-count 这类无共同前缀的类也不会漏）。
 *
 * 降级（永不阻断管线）：原型读不到 / 抽不到图标表 / 组件无人认领时，一律产出
 *       「结构可用」的 fallback，并把原因写进 notes，绝不静默丢组件。
 * ==========================================================================*/

import * as fs from 'node:fs';
import * as path from 'node:path';

/** 原型里的一个全局注册组件（或页面观测到但无人认领的自定义标签） */
export interface S4ComponentSpec {
  /** PascalCase 组件名（import 标识符 + .vue 文件名 + 模板标签名） */
  name: string;
  /** 原型中的 kebab 标签名（如 c-icon / top-bar / module-nav） */
  tag: string;
  /** 原型声明的 props 名（供 meta 展示与对照，不参与运行） */
  props: string[];
  /** 原型声明的具名插槽（供 meta 展示与对照） */
  slots: string[];
  /** 其自身模板内部引用到的其它 registry 组件名（保证依赖一并产出） */
  deps: string[];
  /** 生成器来源：内置手写 / 原型注册 / 仅页面观测到 */
  source: 'builtin' | 'prototype' | 'observed';
  /** 生成 SFC 源码（确定性、零 LLM） */
  make: (ctx: S4ComponentCtx) => string;
}

/** 原型资产（自 common/*.js 确定性抽取） */
export interface PrototypeAssets {
  /** app.component 注册项：PascalCase 名 → kebab 标签 */
  registered: Map<string, { name: string; tag: string }>;
  /** ICONS 图标表：图标名 → svg 内容片段 */
  icons: Record<string, string>;
  /** MODULES 模块导航数据 */
  modules: { key: string; label: string; file?: string; icon?: string }[];
  /** 参与抽取的源文件（便于排查「为什么没抽到」） */
  files: string[];
}

export interface S4ComponentCtx {
  projectRoot: string;
  /** 原型设计系统 css（组件样式真值来源） */
  commonCss: string;
  assets: PrototypeAssets;
}

export function componentRel(name: string): string {
  return `frontend/src/components/${name}.vue`;
}

/* ─── 命名归一（真值 = Vue 自身规则） ──────────────────────────────────────── */

/** kebab 标签 → PascalCase 组件名：c-icon → CIcon、module-nav → ModuleNav */
export function pascalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^[^A-Za-z]+/, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => (/^[A-Z]/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

/** PascalCase 组件名 → kebab 标签：CIcon → c-icon、MonitorSidebar → monitor-sidebar */
export function kebabizeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** SVG 里合法但含连字符的元素名（避免被误判为「自定义组件标签」） */
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

/* ─── 原型资产抽取（确定性） ──────────────────────────────────────────────── */

function readIfExists(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 递归收集文件（跳过 node_modules / libs / 隐藏目录），结果排序保证确定性 */
function walkFiles(root: string, pred: (full: string) => boolean, maxDepth = 6): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'libs') continue;
      if (e.name.startsWith('.') && e.name !== '.') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && pred(full)) out.push(full);
    }
  };
  walk(root, 0);
  return out.sort();
}

/** 原型设计系统 css：优先老路径候选，否则工程内任意 common.css */
export function findCommonCss(root: string): string {
  if (!root) return '';
  const candidates = [
    path.join(root, 'html/模块1/common/common.css'),
    path.join(root, 'html/common/common.css'),
    path.join(root, 'common/common.css'),
  ];
  for (const c of candidates) {
    const s = readIfExists(c);
    if (s) return s;
  }
  const hits = walkFiles(root, (f) => /(^|[\\/])common\.css$/i.test(f));
  return hits.length ? readIfExists(hits[0]) : '';
}

/** 取平衡切片：start 必须指向 open 字符；返回含首尾定界符的切片，失败返回 '' */
function sliceBalanced(src: string, start: number, open: string, close: string): string {
  let depth = 0;
  let q = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === q) q = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/** 取 const <varName> = { ... } 的对象字面量（含花括号） */
function extractBraceLiteral(src: string, varName: string): string {
  const re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*\\{');
  const m = re.exec(src);
  if (!m) return '';
  return sliceBalanced(src, m.index + m[0].length - 1, '{', '}');
}

/** 取 const <varName> = [ ... ] 的数组字面量（含方括号） */
function extractBracketLiteral(src: string, varName: string): string {
  const re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*\\[');
  const m = re.exec(src);
  if (!m) return '';
  return sliceBalanced(src, m.index + m[0].length - 1, '[', ']');
}

/** 从对象字面量抽取「标识符: 单引号字符串」映射（图标表用） */
function extractStringMap(literal: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(literal))) out[m[1]] = m[2];
  return out;
}

/** 从数组字面量抽取「扁平字符串字段」的对象列表（模块导航数据用） */
function extractObjectArray(
  literal: string,
): { key: string; label: string; file?: string; icon?: string }[] {
  const out: { key: string; label: string; file?: string; icon?: string }[] = [];
  for (const chunk of literal.match(/\{[^{}]*\}/g) || []) {
    const pick = (f: string): string => {
      const m = new RegExp(f + "\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'").exec(chunk);
      return m ? m[1] : '';
    };
    const key = pick('key');
    const label = pick('label');
    if (!key && !label) continue;
    const row: { key: string; label: string; file?: string; icon?: string } = { key, label };
    const file = pick('file');
    const icon = pick('icon');
    if (file) row.file = file;
    if (icon) row.icon = icon;
    out.push(row);
  }
  return out;
}

/** 扫描原型：注册组件清单 + 图标表 + 模块导航数据（全部确定性抽取） */
export function scanPrototypeAssets(root: string): PrototypeAssets {
  const assets: PrototypeAssets = { registered: new Map(), icons: {}, modules: [], files: [] };
  if (!root) return assets;
  const files = walkFiles(root, (f) => /\.js$/i.test(f) && /[\\/]common[\\/][^\\/]*\.js$/i.test(f));
  assets.files = files;
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    const re = /\.component\(\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (!assets.registered.has(name)) assets.registered.set(name, { name, tag: kebabizeName(name) });
    }
    if (!Object.keys(assets.icons).length) {
      const lit = extractBraceLiteral(src, 'ICONS');
      if (lit) assets.icons = extractStringMap(lit);
    }
    if (!assets.modules.length) {
      const arr = extractBracketLiteral(src, 'MODULES');
      if (arr) assets.modules = extractObjectArray(arr);
    }
  }
  return assets;
}

/* ─── 样式抽取（真值 = 原型 common.css 中「命中组件模板类名」的规则） ─────── */

/** 收集模板里出现的类名（静态 class 与 :class 中的字面量片段） */
export function classesInTemplate(tpl: string): string[] {
  const out = new Set<string>();
  const re = /(?::class|class)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    for (const tok of m[1].match(/[A-Za-z_-][-\w]*/g) || []) {
      if (tok.includes('-') || /^[a-z]{3,}$/.test(tok)) out.add(tok);
    }
  }
  return [...out].sort();
}

/** 按类名从原型 css 里取出相关规则（逐顶层块判定，不依赖前缀白名单） */
export function extractCssRules(css: string, classes: string[]): string {
  const want = new Set(classes);
  if (!css || !want.size) return '';
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace === -1) break;
    const selector = css
      .slice(i, brace)
      .replace(/^(\s*\/\*[\s\S]*?\*\/)+/, '')
      .trim();
    const body = sliceBalanced(css, brace, '{', '}');
    if (!body) break;
    i = brace + body.length;
    if (!selector || selector.startsWith('@')) continue;
    const cls: string[] = selector.match(/\.[A-Za-z_][-\w]*/g) || [];
    if (cls.some((c) => want.has(c.slice(1)))) out.push(`${selector} ${body}`);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

/** 组件样式：优先原型 common.css 命中规则，兜底给最小结构样式 */
function pickCss(ctx: S4ComponentCtx, template: string, fallback: string): string {
  const fromPrototype = extractCssRules(ctx.commonCss, classesInTemplate(template));
  return fromPrototype || fallback;
}

/* ─── 模板标签改写（registry 驱动，替代硬编码正则） ──────────────────────── */

/** 在 raw 串中从 start（位于 '<'）起找到匹配的 '>'，带引号感知（供本模块与 s4-vuegen 共用） */
export function findTagGt(raw: string, start: number): number {
  let j = start + 1;
  let q = '';
  while (j < raw.length) {
    const c = raw[j];
    if (q) {
      if (c === q) q = '';
    } else if (c === '"' || c === "'") {
      q = c;
    } else if (c === '>') {
      return j;
    }
    j++;
  }
  return -1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 找出模板里的自定义（含连字符）标签，去重并按出现顺序返回 */
export function findCustomTags(tpl: string): string[] {
  const body = tpl.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const out: string[] = [];
  const re = /<\s*\/?\s*([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    if (HTML_SVG_HYPHENATED.has(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * 按 registry 改写模板里的自定义标签为 PascalCase 组件标签。
 *  · 保留原有属性与内部内容（<module-nav> 这类带具名插槽的成对标签不会被自闭合）；
 *  · 仅当该标签在 registry 中时才改写（不认识的标签原样保留，不臆造组件）；
 *  · 无对应闭合标签的开放标签统一补为自闭合，保证产物模板良构。
 * 返回改写后的模板 + 本次用到的组件名（按 registry 顺序）。
 */
export function rewriteComponentTags(
  tpl: string,
  specs: S4ComponentSpec[],
): { tpl: string; used: string[] } {
  const byTag = new Map(specs.map((s) => [s.tag, s]));
  const used = new Set<string>();
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
    } else {
      const selfClosing = /\/\s*>$/.test(raw);
      // 去尾部斜杠与多余空白，保证产物标签格式归一（<CIcon name="x" /> 而非 <CIcon name="x"  />）
      const attrs = raw.slice(head[0].length, raw.length - 1).replace(/\/\s*$/, '').replace(/\s+$/, '');
      const hasClose =
        selfClosing || new RegExp('</\\s*' + escapeRe(head[2]) + '\\s*>', 'i').test(tpl.slice(gt + 1));
      out += '<' + spec.name + attrs + (selfClosing || !hasClose ? ' />' : '>');
    }
    i = gt + 1;
  }
  const order = specs.map((s) => s.name).filter((n) => used.has(n));
  return { tpl: out, used: order };
}

/* ─── 内置组件生成器 ──────────────────────────────────────────────────────── */

const CIconSpec: S4ComponentSpec = {
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
    const css = pickCss(
      ctx,
      template,
      '.c-icon {\n  display: inline-flex;\n  flex-shrink: 0;\n  vertical-align: middle;\n  color: inherit;\n}\n',
    );
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

const TopBarSpec: S4ComponentSpec = {
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
    const css = pickCss(
      ctx,
      template,
      '.top-bar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  width: 100%;\n}\n',
    );
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

const ModuleNavSpec: S4ComponentSpec = {
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
    const css = pickCss(
      ctx,
      template,
      '.role-tab-nav {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n',
    );
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

const BUILTINS: S4ComponentSpec[] = [CIconSpec, TopBarSpec, ModuleNavSpec];

/** 通用 fallback：原型注册过但无内置生成器 / 页面观测到的未知自定义标签 */
function makeFallbackSpec(name: string, tag: string, source: 'prototype' | 'observed'): S4ComponentSpec {
  return {
    name,
    tag,
    props: [],
    slots: [],
    deps: [],
    source,
    make: () =>
      `<template>
  <!-- 通用占位：${
    source === 'prototype' ? '原型已注册但缺专用生成器' : '页面引用但原型未注册'
  }，
       仅透传插槽内容以保持结构与布局（display:contents 不产生额外盒） -->
  <div style="display:contents" data-s4-fallback="${name}"><slot /></div>
</template>
`,
  };
}

export interface S4RegistryResult {
  specs: S4ComponentSpec[];
  notes: string[];
  ctx: S4ComponentCtx;
}

/**
 * 组装 registry：仅保留【被页面实际引用】的组件（含依赖闭包）。
 * 原型注册但页面未用到的组件不产出，避免死产物。
 */
export function buildComponentRegistry(
  root: string,
  commonCss: string,
  observedTags: string[],
): S4RegistryResult {
  const assets = scanPrototypeAssets(root);
  const ctx: S4ComponentCtx = { projectRoot: root, commonCss, assets };
  const notes: string[] = [];

  const byTag = new Map<string, S4ComponentSpec>();
  for (const b of BUILTINS) byTag.set(b.tag, b);

  const want = [...new Set(observedTags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
  const specs: S4ComponentSpec[] = [];
  const fallbackTags: string[] = [];
  for (const tag of want) {
    if (HTML_SVG_HYPHENATED.has(tag) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag)) continue;
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

  // 依赖闭包：内置组件模板内部引用的其它组件（如 TopBar / ModuleNav 内的 <c-icon>）
  for (const s of [...specs]) {
    for (const d of s.deps) {
      if (specs.some((x) => x.name === d)) continue;
      const builtin = BUILTINS.find((b) => b.name === d);
      if (builtin) specs.push(builtin);
    }
  }
  specs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  if (specs.length) {
    notes.push(
      `S4 组件 registry：页面引用组件 ${specs.length} 个（${specs.map((s) => s.name).join(' / ')}）——` +
        `内置生成器 ${specs.filter((s) => s.source === 'builtin').length} 个、` +
        `原型注册 ${specs.filter((s) => s.source === 'prototype').length} 个、` +
        `仅观测到 ${specs.filter((s) => s.source === 'observed').length} 个；` +
        '模板改名 / import / 组件文件产出 / 组件样式同读此 registry。',
    );
    const iconCount = Object.keys(assets.icons).length;
    if (iconCount) {
      notes.push(`CIcon 图标表：自原型 common/*.js 抽取 ${iconCount} 个图标（不再一律用占位图）。`);
    } else {
      notes.push('CIcon 图标表：原型 common/*.js 未抽到 ICONS，退化为占位图。');
    }
  }
  if (fallbackTags.length) {
    notes.push(
      `以下自定义标签无专用生成器，已产出通用占位组件（透传插槽、不阻断渲染）：${fallbackTags.join('、')}。`,
    );
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
