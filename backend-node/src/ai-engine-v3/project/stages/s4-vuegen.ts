/* ============================================================================
 * s4-vuegen.ts — S4 真·Vue 页面生成（就绪态 · 确定性、零 LLM）
 * ----------------------------------------------------------------------------
 * 输入：被扫描工程的原型 HTML 页（Vue-global 模板，含真实结构/文案/样式）
 *       + 设计系统 common.css（:root 令牌）
 * 输出：真实的 Vue3 SFC 页面（frontend/src/views/GenViewNN.vue）
 *       + 组件产物（由 s4-component-registry.ts 的 registry 驱动，如 CIcon/TopBar/ModuleNav）
 *       + manifest/README 片段
 *
 * 设计哲学（与 S2/S3 一致）：确定性、零 LLM、可重入。
 *   · 原型页模板本身是合法 Vue3 模板语法（v-for/v-model/@click/{{}}），
 *     故【结构】基本原样保留，只把自定义标签 <c-icon>/<top-bar> 改名为组件
 *     并剥离编辑器元数据（data-page-node-id、v-cloak）。
 *   · 【文案】逐文本节点抽取，作为 TEXT-TRUTH 真值；产物必须包含所有抽取文案
 *     （确定性门禁，不靠 LLM）。
 *   · 【样式】内联 <style> 原样搬入 scoped less，:root 令牌改挂到根容器 .shell
 *     下（scoped 下 :root 不生效，必须降级到根 class）。
 *   · 【数据】两级：① 占位样本（保证页面可渲染、不空白，永不失败）；
 *     ② 默认自动接线（Phase 2a）——按「数据槽名 ↔ S3 api 函数名/URL」归一化词元配对，
 *     唯一且无路径参数才绑，命中则在 onMounted 取数并回填；歧义一律退回占位样本。
 *     ③ 人工绑定侧车（Phase 2b）——binding.json 存在时后应用，覆盖自动接线。
 *
 * 范围边界（就绪态）：
 *   · 不生成图表真实数据（echarts 接入 Phase 2），但保留 .trend-chart 容器与 ref。
 *   · API 接线为「合并 S3 产物 + 确定性自动配对 + 可人工覆盖」，不引入 LLM 推断。
 *   · 视觉保真门禁当前为「结构性 + TEXT-TRUTH 轻量」，非 vision/figma 比对。
 * ==========================================================================*/

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildComponentRegistry,
  componentRel,
  findCommonCss,
  findCustomTags,
  findTagGt,
  kebabizeName,
  rewriteComponentTags,
} from './s4-component-registry';

export interface UiExtract {
  /** 原型 HTML 文件名（不含扩展名），如 服务概览 */
  pageName: string;
  /** 生成的视图组件名，如 GenView01 */
  viewName: string;
  /** <title> 文案 */
  title: string;
  /** 抽取到的可见文案 token（TEXT-TRUTH 真值） */
  textTokens: string[];
  /** 抽取到的区块/卡片标题（h1-h3） */
  sectionHeadings: string[];
  /** 抽取到的表格：列头 + 数据源标识符 */
  tables: { columns: string[]; dataSource: string }[];
  /** 引用的图标名（c-icon name） */
  icons: string[];
  /** 是否用到 top-bar 组件 */
  usesTopBar: boolean;
  /** 可绑定为「数据槽」的页面数据引用名（数组/对象类，排除循环变量与方法） */
  dataRefs: string[];
}

/** S4 接口绑定侧车：把某个 catalog API 函数接到页面某个数据槽（确定性烘焙进产物） */
export interface S4Binding {
  /** S3 生成的 api tag（对应 frontend/src/api/<tag>.ts） */
  tag: string;
  /** 该 tag 模块导出的函数名（如 getApiBridgeTrafficQuery） */
  fn: string;
  /** 调用参数（透传给 api 函数） */
  params?: Record<string, any>;
  /** 目标数据槽：本页占位脚本里声明的数据引用名（见 __dataRefs） */
  target: string;
}

/** S4 组件嵌入侧车：把一个已发布的 workspace 组件插入到指定视图（确定性烘焙进产物） */
export interface S4Embed {
  /** 目标视图名（如 GenView01），必须落在 s4-meta.json 的 views */
  view: string;
  /** workspace 组件目录名（= componentId） */
  componentId: string;
  /** 组件所属 groupId（dev 取源用，可选；缺省走候选） */
  groupId?: string;
  /** 唯一插槽键（用于 DOM 标记与稳定 key） */
  slotKey: string;
  /** 插入位置：插入到「第 pos 个区块之前」，pos === 区块数 表示末尾（默认末尾） */
  pos?: number;
}

/** 页面可插入区块（供前端「插入位置」下拉；index 为区块序号） */
export interface EmbedBlockHint {
  index: number;
  tag: string;
  hint: string;
}

export interface VueGenFile {
  rel: string;
  content: string;
}

export interface VueGenResult {
  files: VueGenFile[];
  extracts: UiExtract[];
  notes: string[];
}

export interface VueGenOptions {
  runId: string;
  projectRoot: string;
  generatedAt: string;
  /** 运行目录下的 generated/ 根（与 S3 同根）；S4 据此读回 S3 已生成的 frontend/src/api/<tag>.ts，实现 S3+S4 产物合并 */
  generatedRoot?: string;
  /** S4 接口绑定侧车（来自 data/project-runs/<runId>/binding.json）；存在时把 api 函数接到指定数据槽 */
  binding?: S4Binding;
  /** S4 组件嵌入侧车（来自 data/project-runs/<runId>/embeds.json）；存在时把 workspace 组件插入指定视图 */
  embeds?: S4Embed[];
}

/* ─── 工具 ──────────────────────────────────────────────────────────────── */
function slugifyView(index: number): string {
  return 'GenView' + String(index).padStart(2, '0');
}

/** 递归找工程下所有 .html 文件 */
function findHtmlPages(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.') && e.name !== '.') continue;
        walk(full);
      } else if (e.isFile() && e.name.endsWith('.html')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/** 取出 <style>...</style>（head 内联样式），并剥离 body/#app 全局规则（scoped 下无意义） */
function extractInlineStyle(html: string): string {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) return '';
  return m[1]
    .replace(/body\s*\{[^}]*\}/g, '')
    .replace(/#app\s*\{[^}]*\}/g, '')
    .trim();
}

/** 从 common.css 抽取 :root 令牌声明块，降级为挂到 .shell 根容器下 */
function extractTokens(commonCss: string): string {
  const m = commonCss.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) return '';
  const body = m[1].trim();
  if (!body) return '';
  // 去掉注释
  const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!cleaned) return '';
  return '.shell,\n.app-shell {\n' + cleaned + '\n}\n';
}

/**
 * 定位 #app 容器：返回 { start, end } 为其【内部】区间（不含容器自身的开/闭标签）。
 *
 * 治本点（旧实现有真 bug）：过去用 /<div id="app"[^>]*>([\s\S]*?)<\/div>\s*<script/
 * 取内容，终止符 `</div>` 被当作定界符吃掉 ⇒ #app 自己的闭合标签从产物里消失，
 * 模板根节点少一个 `</div>`。实测云资源监测 / 数据安全审计等页因此产出
 * 「Element is missing end tag」，Vue 编译不过 ⇒ 预览解析失败/空壳。
 *
 * 改用「div 配平边界」扫描（跳过注释与 script/style 块，标签内引号感知）：
 * 以 #app 内容为深度基准 0，记录每一次「内容自身恰好配平」（depth 归零）的边界，
 * 取最后一个作为容器右界。这样无论原型 #app 内是否漏写一个 `</div>`，取到的内容
 * 都自洽良构：配平的原型取到 #app 闭合标签之前；缺闭合的原型把最近的 `</div>`
 * 收进内容（否则产物必缺一个闭合标签、Vue 编译必报 Element is missing end tag）。
 * 越过 #app 自身闭合（depth < 0）即停止，避免误把 body 之后的内容算进来。
 */
function findAppBounds(html: string): { start: number; end: number } | null {
  const open = /<div\b[^>]*\bid\s*=\s*["']app["'][^>]*>/i.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const bodyEnd = html.toLowerCase().indexOf('</body>', start);
  const limit = bodyEnd === -1 ? html.length : bodyEnd;
  let depth = 0;
  let last = -1;
  let i = start;
  while (i < limit) {
    const lt = html.indexOf('<', i);
    if (lt === -1 || lt >= limit) break;
    // 注释整体跳过（注释里可能出现 <div> 字样，不得计入深度）
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4);
      if (e === -1) break;
      i = e + 3;
      continue;
    }
    // script / style 块整体跳过（内部 <div 字样同样不计深度）
    const blockM = /^<(script|style)\b/i.exec(html.slice(lt, lt + 8));
    if (blockM) {
      const close = html.toLowerCase().indexOf('</' + blockM[1].toLowerCase(), lt);
      if (close === -1) break;
      i = close;
      continue;
    }
    const gt = findTagGt(html, lt);
    if (gt === -1) break;
    const tagSrc = html.slice(lt, gt + 1);
    const nm = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/.exec(tagSrc);
    if (nm && nm[2].toLowerCase() === 'div') {
      if (nm[1] === '/') {
        depth--;
        if (depth === 0) last = gt + 1; // 内容自平衡边界（含该 </div>）
        else if (depth < 0) break; // 已越过 #app 自身闭合
      } else if (!/\/\s*>$/.test(tagSrc)) {
        depth++;
      }
    }
    i = gt + 1;
  }
  if (last === -1) return null;
  return { start, end: last };
}

/**
 * 取 #app 内部模板。
 * 注意：此处只做「提取 + 编辑器元数据剥离」，**不改写自定义标签**——
 * 标签改名统一由 registry（s4-component-registry.ts#rewriteComponentTags）负责，
 * 因为改名所需组件清单须先由全部页面的观测标签聚合得出（见 buildVueGen Pass 1/2）。
 *
 * mode：nested=深度扫描命中（正常）；legacy=回退旧正则（须在 notes 里暴露，不静默）；
 *       none=未找到 #app。
 */
function extractAppTemplate(html: string): { template: string; mode: 'nested' | 'legacy' | 'none' } {
  const clean = (tpl: string): string =>
    tpl
      .replace(/\s+v-cloak\b/g, '')
      .replace(/\s+data-service-page="[^"]*"/g, '')
      .replace(/\s+data-page-node-id="[^"]*"/g, '')
      .trim();
  const bounds = findAppBounds(html);
  if (bounds) return { template: clean(html.slice(bounds.start, bounds.end)), mode: 'nested' };
  // 兜底：极少数页面 #app 内 div 本身不配平（原型手写缺陷）时退回旧正则，并显式记录
  const m = html.match(/<div id="app"[^>]*>([\s\S]*?)<\/div>\s*<script/);
  if (!m) return { template: '', mode: 'none' };
  return { template: clean(m[1]), mode: 'legacy' };
}

/* ═══ 模板卫生（确定性、零 LLM）：良构修复 + 内联 handler 归一 ═══════════════
 * 为什么需要：原型是**浏览器容错的 HTML**（浏览器会隐式闭合、忽略游离闭合），
 * 而 Vue 模板编译器**不容错**——`Element is missing end tag` / `Invalid end tag` /
 * `v-else-if has no adjacent v-if` / `Error parsing JavaScript expression` 都会让
 * 产物 SFC 编译失败 ⇒ 预览空白。这里把「浏览器能忍、Vue 忍不了」的写法确定性归一。
 *
 * 三档变换，全部**不改可见内容、不改组件写法**：
 *   ① 良构修复：闭合标签与栈顶不匹配时，为中间未闭合元素补 `</x>`（隐式闭合）；
 *      栈中找不到匹配的游离闭合标签丢弃；末尾为残留开标签补闭合。配平的原型上是
 *      逐字节 no-op（已用 云资源监测.html 断言幂等）。
 *   ② 互斥 v-else-if 降级：`v-else-if` 与上一个同层元素不构成 if 链时（中间被别的
 *      元素隔开，原型手写缺陷），Vue 编译器直接报错；降级为 `v-if` 让面板能渲染
 *      （菜单类条件通常互斥，语义等价）。相邻的 if 链**绝不改动**（阳性对照见探针）。
 *   ③ 内联 handler 归一：`@ev="function(e){ … this.x=… }"` 这种「函数表达式 + this」
 *      写法 Vue3 模板编译器无法解析（Unexpected token）。归一为 `(e) => { … }` 并剥
 *      掉 `this.`（模板表达式的作用域即组件上下文）；若剥离后仍有裸 `this` 则原样保留
 *      并计入 skipped，由调用方在 notes 里暴露，不静默产出坏产物。
 *
 * 判据不是正则断言，而是 **@vue/compiler-sfc 真编译 errors=0**（探针 s4-sfc-compile）。
 */

/** SVG 空元素：Vue 模板里常写成自闭合，与 HTML void 元素一并视为不参与配对 */
const SVG_EMPTY_TAGS = new Set([
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'stop', 'ellipse', 'image',
]);
/** 内容不做标签解析的元素 */
const RAW_TEXT_TAGS = new Set(['script', 'style']);
/** 元素自带 v-if / v-else-if（用于 v-else-if 相邻性判定） */
const HAS_IF_RX = /(^|\s)v-if\s*=/;
const HAS_ELSE_IF_RX = /(^|\s)v-else-if\s*=/;
const ELSE_IF_TO_IF_RX = /(^|\s)v-else-if(\s*=)/;

type TagToken = { type: 'open' | 'close' | 'self' | 'other'; raw: string; name: string };

/** 把模板切成「开标签 / 闭标签 / 自闭合 / 其它（文本、注释、script 块）」流 */
function tokenizeTagStream(tpl: string): TagToken[] {
  const out: TagToken[] = [];
  const lower = tpl.toLowerCase();
  let i = 0;
  while (i < tpl.length) {
    const lt = tpl.indexOf('<', i);
    if (lt === -1) {
      out.push({ type: 'other', raw: tpl.slice(i), name: '' });
      break;
    }
    if (lt > i) out.push({ type: 'other', raw: tpl.slice(i, lt), name: '' });
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
    const gt = findTagGt(tpl, lt);
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
    if (nm[1] === '/') out.push({ type: 'close', raw, name });
    else if (/\/\s*>$/.test(raw) || VOID_TAGS.has(name) || SVG_EMPTY_TAGS.has(name)) {
      out.push({ type: 'self', raw, name });
    } else out.push({ type: 'open', raw, name });
    i = gt + 1;
  }
  return out;
}

export interface TemplateRepairLog {
  /** 因闭合标签错位而补出的隐式闭合数 */
  impliedClose: number;
  /** 栈中无匹配、被丢弃的游离闭合数 */
  strayClose: number;
  /** 末尾为残留开标签补的闭合数 */
  tailClose: number;
  /** 非相邻 v-else-if 降级为 v-if 的数量 */
  elseIfDowngrade: number;
  changed: boolean;
}

/**
 * 良构修复（幂等）：配平且结构良构的模板上，输出与输入**逐字节一致**。
 * 只在「闭合标签与栈顶不匹配」处动作，不移动、不重排任何节点。
 */
export function repairTemplateStructure(tpl: string): { tpl: string; log: TemplateRepairLog } {
  const toks = tokenizeTagStream(tpl);
  const stack: { name: string; raw: string }[] = [];
  /** 每一深度：同层上一个元素是否为 v-if / v-else-if（Vue 的 v-else-if 相邻性真值） */
  const siblingHadIf: boolean[] = [];
  const log: TemplateRepairLog = {
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
    // 闭合标签
    if (!stack.length) {
      log.strayClose++; // 整个片段里没有匹配的开标签 ⇒ 丢弃（浏览器同样忽略）
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
    stack.length = k; // 已移除 index k 处的匹配项，不可再 pop
    out += t.raw;
    siblingHadIf[stack.length] = HAS_IF_RX.test(matched.raw) || HAS_ELSE_IF_RX.test(matched.raw);
  }
  while (stack.length) {
    const t = stack.pop();
    if (!t) break;
    out += '</' + t.name + '>';
    log.tailClose++;
  }
  log.changed =
    log.impliedClose + log.strayClose + log.tailClose + log.elseIfDowngrade > 0;
  return { tpl: out, log };
}

/**
 * 内联 handler 归一：`@ev="function(e){…}"` → `@ev="(e) => {…}"`，并剥掉 `this.`。
 * 只处理以 `function(` 开头的属性值（`v-else-if="arr.some(function(x){…})"` 这类
 * 合法表达式不受影响，因为它们不是事件属性）。
 */
export function normalizeInlineHandlers(tpl: string): {
  tpl: string;
  normalized: number;
  skipped: number;
} {
  let normalized = 0;
  let skipped = 0;
  const out = tpl.replace(
    /(@[A-Za-z][\w:.-]*\s*=\s*")([\s\S]*?)(")/g,
    (whole: string, pre: string, expr: string, post: string) => {
      const m = /^\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/.exec(expr);
      if (!m) return whole;
      const body = m[2].replace(/\bthis\./g, '');
      if (/\bthis\b/.test(body)) {
        skipped++; // 裸 this（非 this.x）无法安全归一，原样保留并暴露
        return whole;
      }
      normalized++;
      return pre + '(' + m[1].trim() + ') => {' + body + '}' + post;
    },
  );
  return { tpl: out, normalized, skipped };
}

/**
 * 去标签（引号感知）：只保留标签之间的可见文本，标签位置留一个空格（避免相邻文本粘连）。
 *
 * 治本点：**不能用 `/<[^>]+>/`** —— 属性值里可能出现 `>`，例如内联 handler 归一后的
 * `@input="(e) => { … }"`，naive 正则会在 `=>` 处提前截断，把属性剩余部分当正文，
 * 污染 TEXT-TRUTH 真值（实测 本地资源监测 页多出 6 个伪 token）。标签内部一律走
 * findTagGt（单一来源、引号感知）。
 */
export function stripTags(tpl: string): string {
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
    const gt = findTagGt(tpl, lt);
    if (gt === -1) {
      out += tpl.slice(lt);
      break;
    }
    out += ' ';
    i = gt + 1;
  }
  return out;
}

/** 抽取可见文案 token（TEXT-TRUTH 真值来源） */
function extractTextTokens(html: string, template: string): string[] {
  // 从模板里抽取可见文本：去掉 <style>/<script>，再去标签，按空白/标点切分
  let body = template;
  body = body.replace(/<style[\s\S]*?<\/style>/g, ' ');
  body = body.replace(/<script[\s\S]*?<\/script>/g, ' ');
  // 去所有标签（引号感知：属性值里的 `>` 不得截断标签）
  const text = stripTags(body);
  const tokens = new Set<string>();
  // 中文按字符 + 标点切，英文按词；保留 >=2 字的中文片段与英文词
  const cn = text.match(/[一-龥]{2,}/g) || [];
  for (const t of cn) tokens.add(t);
  const en = text.match(/[A-Za-z][A-Za-z0-9 _\-]{1,}/g) || [];
  for (const t of en) {
    const s = t.trim();
    if (s.length >= 2 && !/^(div|span|button|table|thead|tbody|tr|th|td|section|aside|main|header|nav|dialog|form|label|select|option|svg|path|h1|h2|h3|h4|small|strong|em|article|input|ref)$/i.test(s)) {
      tokens.add(s);
    }
  }
  // 也把 <title> 文案纳入
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/);
  if (titleM) for (const t of (titleM[1].match(/[一-龥]{2,}/g) || [])) tokens.add(t);
  return [...tokens].sort();
}

/** 抽取区块/卡片标题（h1-h3 文本） */
function extractHeadings(template: string): string[] {
  const out: string[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    const t = stripTags(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

/** 抽取表格：列头 + 数据源标识符 */
function extractTables(template: string): { columns: string[]; dataSource: string }[] {
  const out: { columns: string[]; dataSource: string }[] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(template))) {
    const tableHtml = tm[1];
    const columns: string[] = [];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let hm: RegExpExecArray | null;
    while ((hm = thRe.exec(tableHtml))) {
      const t = stripTags(hm[1]).replace(/{{[^}]+}}/g, '').trim();
      if (t) columns.push(t);
    }
    // 数据源：tbody 里的 v-for="(row,i) in X"
    const trRe = /<tr\b[^>]*\bv-for="[^"]*?\b(?:in|of)\s+([A-Za-z_$][\w$]*)/;
    const dm = trRe.exec(tableHtml);
    out.push({ columns, dataSource: dm ? dm[1] : '' });
  }
  return out;
}

/** 抽取 c-icon 图标名 */
function extractIcons(template: string): string[] {
  const out = new Set<string>();
  const re = /<c-icon\b[^>]*\bname="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) out.add(m[1]);
  return [...out].sort();
}

/**
 * 通用「智能占位数据层」生成器（确定性、零 LLM）。
 *
 * 从原型页模板里抽取所有被绑定引用的标识符（v-for 源 / 对象索引 / 数组方法 /
 * 标量 / 方法调用），逐个给出「运行时绝不抛错」的占位默认值：
 *   · 方法调用            → function NAME(...){ return undefined; }
 *   · X[..].slice/map/... → 返回「任何 key 都给 []」的 Proxy（如 cardRankings[kind]）
 *   · v-for 源 / X.length → ref([])
 *   · X[..] / X.prop      → reactive({})（缺字段返回 undefined，不抛错）
 *   · 其余标量            → ref('')
 * 这样页面能渲染出静态结构/文案/样式（不空白），数据绑定列表为空；
 * 真实 API / 图表接线是 Phase 2。
 */

interface RefInfo {
  name: string;
  isMethod: boolean;
  loopVar: boolean;
  usedAsIndex: boolean;
  usedAsArrayMethod: boolean;
  usedAsLength: boolean;
  usedAsProp: boolean;
  usedAsVForSource: boolean;
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

/** 抽取模板绑定引用的全部标识符及其用法形态 */
function collectRefs(template: string): Map<string, RefInfo> {
  const refs = new Map<string, RefInfo>();
  const ensure = (name: string): RefInfo => {
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

  // v-for 循环变量 + 数据源根标识符
  const vforRe = /\bv-for="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = vforRe.exec(template))) {
    const expr = m[1];
    const decl = expr.match(/\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)\s+(?:in|of)\s+/)
      || expr.match(/^\s*([A-Za-z_$][\w$]*)\s+(?:in|of)\s+/);
    if (decl) {
      ensure(decl[1]).loopVar = true;
      if (decl[2]) ensure(decl[2]).loopVar = true;
    }
    const src = expr.match(/(?:in|of)\s+([A-Za-z_$][\w$]*)/);
    if (src) ensure(src[1]).usedAsVForSource = true;
  }

  // 收集所有表达式（mustache + 绑定属性值）
  const exprs: string[] = [];
  const mustache = /\{\{([\s\S]*?)\}\}/g;
  while ((m = mustache.exec(template))) exprs.push(m[1]);
  const attrRe = /(@|v-|:)[A-Za-z0-9_:-]*\s*=\s*"([^"]*)"/g;
  while ((m = attrRe.exec(template))) exprs.push(m[2]);

  const idRe = /[A-Za-z_$][\w$]*/g;
  for (const e of exprs) {
    let im: RegExpExecArray | null;
    while ((im = idRe.exec(e))) {
      const id = im[0];
      if (REF_KEYWORDS.has(id) || REF_GLOBALS.has(id) || REF_TAGS.has(id)) continue;
      const prev = im.index > 0 ? e[im.index - 1] : '';
      // 仅当它是某个对象的属性名/方法名（前面是 .）时不作为独立引用登记
      if (prev === '.') continue;
      const info = ensure(id);
      const after = e.slice(im.index + id.length);
      if (/^\s*\(/.test(after)) {
        info.isMethod = true;
        continue;
      }
      const ARRAY_METHODS = 'slice|map|filter|forEach|reduce|find|findIndex|some|every|sort|concat';
      if (/^\s*\[/.test(after)) info.usedAsIndex = true; // id[...]
      if (/^\s*\./.test(after)) info.usedAsProp = true; // id.xxx
      if (new RegExp('^\\s*\\[[^\\]]*\\]\\s*\\.(' + ARRAY_METHODS + ')\\b').test(after)) {
        info.usedAsArrayMethod = true; // id[...].slice / map / ...
      }
      if (new RegExp('^\\s*\\.(' + ARRAY_METHODS + ')\\b').test(after)) {
        info.usedAsArrayMethod = true; // id.slice / map / ...（直接数组）
      }
      if (/^\s*\.length\b/.test(after)) info.usedAsLength = true;
    }
  }
  return refs;
}

/** 抽取可绑定为「数据槽」的页面数据引用名（数组/对象类，排除循环变量与方法） */
function collectDataRefs(template: string): string[] {
  const refs = collectRefs(template);
  const out: string[] = [];
  for (const info of refs.values()) {
    if (info.loopVar || info.isMethod) continue;
    if (
      info.usedAsVForSource ||
      info.usedAsLength ||
      info.usedAsArrayMethod ||
      info.usedAsIndex ||
      info.usedAsProp
    ) {
      out.push(info.name);
    }
  }
  return [...new Set(out)].sort();
}

/** 生成「智能占位」脚本：保证所有模板引用都有定义，运行时绝不抛 ReferenceError/TypeError */
function buildPlaceholderScript(template: string): string {
  const refs = collectRefs(template);
  const lines: string[] = [];
  lines.push(
    '// 智能占位数据层（Phase 1）：保证模板引用均有定义，页面可渲染不空白；真实 API 接线为 Phase 2。',
  );
  // 数据槽注册表：合并钩子(S4 接口绑定)据此按名把 api 返回数据接到对应数据引用。
  lines.push('const __dataRefs = {};');
  lines.push('function __objOfArrays() {');
  lines.push('  const __store = {};');
  lines.push(
    "  return new Proxy(__store, { get: (_t, k) => (Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : (__store[k] = [])) });",
  );
  lines.push('}');

  const known: Record<string, string> = {
    metrics:
      "[{ title: '示例指标', icon: 'dashboard', values: [{ label: '示例', value: '0', unit: '', tone: '' }] }]",
    periods:
      "[{ key: 'today', label: '今日' }, { key: 'week', label: '本周' }, { key: 'month', label: '本月' }]",
  };

  for (const info of refs.values()) {
    if (info.loopVar) continue; // 循环变量由 v-for 自行声明
    const n = info.name;
    if (info.isMethod) {
      lines.push(`function ${n}(...args) { return undefined; }`);
      continue;
    }
    if (known[n]) {
      lines.push(`const ${n} = ref(${known[n]});`);
    } else if (info.usedAsArrayMethod) {
      lines.push(`const ${n} = __objOfArrays();`);
    } else if (info.usedAsVForSource || info.usedAsLength) {
      lines.push(`const ${n} = ref([]);`);
    } else if (info.usedAsIndex || info.usedAsProp) {
      lines.push(`const ${n} = reactive({});`);
    } else {
      lines.push(`const ${n} = ref('');`);
    }
    // 注册进数据槽表，供 S4 接口绑定合并钩子按名赋值
    lines.push(`__dataRefs['${n}'] = ${n};`);
  }
  return lines.join('\n');
}

/** 单个组件嵌入占位块：把 workspace 组件按 componentId 渲染进本页（由预览 app 全局注册解析） */
function buildEmbedSlotHtml(e: S4Embed): string {
  // 仅允许安全标识符（kebab / 下划线 / 数字），避免注入任意标签
  const safe = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(e.componentId || '') ? e.componentId : '';
  if (!safe) return '';
  const slot = (e.slotKey || '').replace(/[^A-Za-z0-9_-]/g, '');
  return `  <div class="s4-embed-slot"${slot ? ` data-embed-slot="${slot}"` : ''}>\n    <${safe} />\n  </div>`;
}

const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base',
  'col', 'embed', 'param', 'track', 'wbr',
]);

/** 标签扫描器 findTagGt 已收敛到 s4-component-registry.ts（单一来源），此处仅 import 复用 */

/**
 * 拆出单个元素原始串的 { open, inner, close }。
 * 自闭合 / void 元素返回 open=整串、inner/close 空；找不到匹配闭合则回 null（调用方降级）。
 */
function splitElement(raw: string): { open: string; inner: string; close: string } | null {
  const gt = findTagGt(raw, 0);
  if (gt === -1) return null;
  if (raw[gt - 1] === '/') return { open: raw, inner: '', close: '' };
  const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
  if (!tagM) return null;
  const tag = tagM[1].toLowerCase();
  if (VOID_TAGS.has(tag)) return { open: raw, inner: '', close: '' };
  let depth = 1;
  let j = gt + 1;
  while (j < raw.length) {
    if (raw[j] !== '<') { j++; continue; }
    if (raw.startsWith('<!--', j)) {
      const e = raw.indexOf('-->', j + 4);
      j = e === -1 ? raw.length : e + 3;
      continue;
    }
    const m = /^<\s*\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw.slice(j));
    if (!m) { j++; continue; }
    const t = m[1].toLowerCase();
    if (raw[j + 1] === '/') {
      const g2 = findTagGt(raw, j);
      if (t === tag) {
        depth--;
        if (depth === 0) { j = g2 + 1; break; }
      }
      j = g2 + 1;
    } else {
      const g2 = findTagGt(raw, j);
      const selfClose = raw[g2 - 1] === '/';
      if (t === tag && !selfClose) depth++;
      j = g2 + 1;
    }
  }
  if (depth !== 0) return null; // 未闭合，降级
  const closeStart = raw.lastIndexOf('<', j);
  return {
    open: raw.slice(0, gt + 1),
    close: raw.slice(closeStart),
    inner: raw.slice(gt + 1, closeStart),
  };
}

/** 收集一段 inner HTML 的「直接子元素」原始串（只展开到第一层，内层原样保留） */
function collectDirectChildren(inner: string): string[] {
  const children: string[] = [];
  let i = 0;
  const len = inner.length;
  const skipWs = () => { while (i < len && /\s/.test(inner[i])) i++; };
  while (i < len) {
    skipWs();
    if (i >= len) break;
    if (inner[i] !== '<') { i++; continue; } // 顶层文本节点，跳过
    if (inner.startsWith('<!--', i)) {
      const e = inner.indexOf('-->', i + 4);
      i = e === -1 ? len : e + 3;
      continue;
    }
    const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner.slice(i));
    if (!tagM) { i++; continue; }
    const tag = tagM[1].toLowerCase();
    const gt = findTagGt(inner, i);
    if (gt === -1) { i = len; break; }
    const selfClose = inner[gt - 1] === '/';
    if (VOID_TAGS.has(tag) || selfClose) {
      children.push(inner.slice(i, gt + 1));
      i = gt + 1;
      continue;
    }
    // 计数同名标签的匹配闭合
    let depth = 1;
    let j = gt + 1;
    while (j < len) {
      if (inner[j] !== '<') { j++; continue; }
      if (inner.startsWith('<!--', j)) {
        const e = inner.indexOf('-->', j + 4);
        j = e === -1 ? len : e + 3;
        continue;
      }
      const m = /^<\s*\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner.slice(j));
      if (!m) { j++; continue; }
      const t = m[1].toLowerCase();
      if (inner[j + 1] === '/') {
        const g2 = findTagGt(inner, j);
        if (t === tag) {
          depth--;
          if (depth === 0) { j = g2 + 1; break; }
        }
        j = g2 + 1;
      } else {
        const g2 = findTagGt(inner, j);
        const isSelf = inner[g2 - 1] === '/';
        if (t === tag && !isSelf) depth++;
        j = g2 + 1;
      }
    }
    children.push(inner.slice(i, j));
    i = j;
  }
  return children;
}

/**
 * 解析模板的可插入容器：
 *   · 若模板只有一个根元素 → 取其 open/close 与「直接子元素」作为插入区块
 *     （原型页通常是单根 .shell，区块内联选位才有意义）；
 *   · 否则 → 把顶层元素本身作为区块，无外层包裹（open/close 空）。
 */
function parseTemplateBlocks(tpl: string): { open: string; close: string; children: string[] } {
  const top = collectDirectChildren(tpl);
  if (top.length === 1) {
    const sp = splitElement(top[0]);
    if (sp) {
      return { open: sp.open, close: sp.close, children: collectDirectChildren(sp.inner) };
    }
  }
  return { open: '', close: '', children: top };
}

/** 给一个区块原始串生成人话提示（优先标题，其次首段文本，否则 tag+class） */
function blockHintText(raw: string): string {
  const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(raw);
  if (h) {
    const t = stripTags(h[1]).trim();
    if (t) return t.slice(0, 30);
  }
  const txt = stripTags(
    raw.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (txt) return txt.slice(0, 30);
  const cls = /\bclass="([^"]*)"/.exec(raw);
  const tag = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
  return (tag ? tag[1] : 'block') + (cls ? '.' + (cls[1].split(/\s+/)[0] || '') : '');
}

/**
 * 把组件嵌入块按 pos 注入模板：
 *   pos 语义 = 插入到「第 pos 个区块之前」；pos === 区块数 表示末尾；缺省末尾。
 *   返回注入后的新模板（不改变容器 open/close，只在区块之间/末尾插入）。
 */
function insertEmbeds(template: string, embeds?: S4Embed[]): string {
  const viewEmbeds = (embeds || []).filter((e) =>
    /^[A-Za-z_][A-Za-z0-9_-]*$/.test(e.componentId || ''),
  );
  if (!viewEmbeds.length) return template;
  const { open, close, children } = parseTemplateBlocks(template);
  const N = children.length;
  if (!N) {
    // 无区块可插 → 末尾追加（降级）
    const all = viewEmbeds.map(buildEmbedSlotHtml).filter(Boolean).join('\n');
    return `${open}${all ? '\n' + all : ''}${close}`;
  }
  const byPos = new Map<number, string[]>();
  for (const e of viewEmbeds) {
    let pos = typeof e.pos === 'number' && Number.isFinite(e.pos) ? e.pos : N;
    if (pos < 0) pos = 0;
    if (pos > N) pos = N;
    if (!byPos.has(pos)) byPos.set(pos, []);
    const html = buildEmbedSlotHtml(e);
    if (html) byPos.get(pos)!.push(html);
  }
  let inner = '';
  for (let i = 0; i < N; i++) {
    const at = byPos.get(i);
    if (at) inner += '\n' + at.join('\n');
    inner += '\n' + children[i];
  }
  const atEnd = byPos.get(N);
  if (atEnd) inner += '\n' + atEnd.join('\n');
  return open + inner + close;
}

/** 生成单个页面 SFC */
function buildPageView(
  idx: number,
  extract: UiExtract,
  template: string,
  /** 本视图模板实际用到的组件名（来自 registry 的 rewriteComponentTags 结果），据此生成 import */
  usedComponents: string[],
  commonCss: string,
  html: string,
  apiTags: string[],
  autoBindings: S4AutoBinding[],
  runId?: string,
  binding?: S4Binding,
  embeds?: S4Embed[],
): string {
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
  const imports: string[] = ["import { ref, reactive, onMounted } from 'vue';"];
  // 组件 import 完全由 registry 的「本视图实际用到」集合决定（不再硬编码 CIcon/TopBar），
  // 新增组件只需在 registry 加条目，此处零改动。
  for (const name of usedComponents) imports.push(`import ${name} from '@/components/${name}.vue';`);
  const dataScript = buildPlaceholderScript(template);
  const apiMergeScript = buildApiMergeScript(apiTags, autoBindings, runId, viewName, binding);
  // 组件嵌入块：按 pos 内联注入模板（在指定区块之前 / 末尾），由预览 app 全局注册组件后解析（无需本页 import）
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

/**
 * S3+S4 产物合并钩子（确定性、零 LLM · Phase 2 取数）。
 *
 * S3 已生成 frontend/src/api/<tag>.ts 客户端（依赖宿主 @/core/http）。
 * 本页在挂载时动态加载这些客户端并按 tag 建索引（__apiByTag）；若运行环境缺少宿主依赖
 * （如沙箱预览、@/core/http 不可达），import 失败则自动保持上方占位样本数据，
 * 页面绝不空白/抛错。
 *
 * 取数两阶段（顺序敏感）：
 *   ① 默认自动接线 __autoBindings：buildVueGen 已按「数据槽名 ↔ api 函数」确定性配对
 *      （唯一且无路径参数才绑），无 binding 侧车也取数；
 *   ② 人工绑定侧车 __s4Binding：后应用 ⇒ 显式覆盖自动接线结果。
 * 该侧车来自运行目录 binding.json，确定性烘焙进产物，再生成可复现。
 */
function buildApiMergeScript(
  apiTags: string[],
  autoBindings: S4AutoBinding[],
  runId?: string,
  viewName?: string,
  binding?: S4Binding,
): string {
  if (!apiTags.length && !binding && !autoBindings.length) return '';
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

/* ─── S3 api 产物解析（唯一解析器） ───────────────────────────────────────── */

/** 从 generated/frontend/src/api/*.ts 解析出的单个导出函数 */
export interface ApiFnExport {
  name: string;
  /** HTTP 方法（get/post/put/delete/patch） */
  method: string;
  /** 前端调用 URL（保留 :param 路由占位形态） */
  url: string;
  /** URL 是否含 :param 路径参数（含则不可无参自动调用） */
  hasPathParam: boolean;
}

/** 单个 api 模块（对应 frontend/src/api/<tag>.ts）的导出函数 */
export interface ApiModuleExports {
  tag: string;
  functions: ApiFnExport[];
}

const API_SKIP_FILES = new Set(['index.ts', 'types.ts']);

/**
 * 🔴 唯一解析器：读 generated/frontend/src/api/*.ts，抽每个模块的导出函数（名/方法/URL/路径参数）。
 * S4 默认自动接线与管线 getBinding/setBinding 的 apiTags 均由本函数派生，避免两处正则漂移。
 */
export function readApiModules(generatedRoot?: string): ApiModuleExports[] {
  if (!generatedRoot) return [];
  const apiDir = path.join(generatedRoot, 'frontend/src/api');
  let files: string[] = [];
  try {
    if (!fs.existsSync(apiDir)) return [];
    files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.ts') && !API_SKIP_FILES.has(f));
  } catch {
    return [];
  }
  const out: ApiModuleExports[] = [];
  for (const f of files) {
    let content = '';
    try {
      content = fs.readFileSync(path.join(apiDir, f), 'utf8');
    } catch {
      continue;
    }
    // 先定位全部 `export function <name>(`，再按「下一个函数起点」切段，段内取 url / 方法。
    // 不依赖函数体花括号配对，生成代码与手写代码都能解析。
    const fnRe = /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    const hits: { name: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = fnRe.exec(content))) hits.push({ name: m[1], index: m.index });
    const functions: ApiFnExport[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < hits.length; i++) {
      const { name, index } = hits[i];
      if (seen.has(name)) continue;
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

/* ─── 默认自动接线（确定性配对 · 零 LLM） ─────────────────────────────────── */

/** 一条自动接线：某 api 函数 → 某数据槽 */
export interface S4AutoBinding {
  tag: string;
  fn: string;
  target: string;
  params: Record<string, any>;
}

/** 归一化词元：驼峰/下划线/连字符切分 → 小写 */
function tokensOf(s: string): string[] {
  return String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 不具区分度的通用词（两侧都去掉）。
 * 🔴 只放「永远不区分接口语义」的词——`list/detail/info/data/page/records` 等**必须保留**，
 * 它们是 `getXxxList` vs `getXxxDetail` 的唯一区分位；误停用会造成配对退化/伪匹配。
 */
const TOKEN_STOP = new Set([
  'api', 'mvgo', 'bridge', 'vo', 'dto', 'res', 'resp', 'response', 'result',
  'the', 'and', 'with', 'by',
]);
/** 函数名前缀动词（剥掉后仍是同一语义） */
const FN_VERB = /^(get|fetch|load|read|find|search|query|create|add|post|insert|update|put|patch|modify|remove|delete|del|save|submit|export|download|do|exec)+/i;

function isSubsetOf(a: string[], b: Set<string>): boolean {
  if (!a.length) return false;
  return a.every((t) => b.has(t));
}

/**
 * 默认自动接线（确定性 · 零 LLM）：把「视图数据槽」与「S3 已生成的 api 函数」按
 * 归一化词元配对——**任一侧为另一侧的子集**（如 `trafficList` ⊆ `traffic,list`；
 * `deviceMonitor` ⊆ `operation,device,monitor`）才算候选；再要求：
 *   · 该函数 URL 不含 :param（否则无参调用必失败）；
 *   · 该槽按交集大小取最高分候选，最高分候选必须**唯一**（并列即歧义 → 放弃）；
 *   · 一个函数只接一个槽（被多槽选中 → 全部放弃）。
 * 任何歧义一律放弃 ⇒ 该槽保持占位样本数据，页面绝不空白/抛错。
 * 例：多模块都有 `xxxList` 时，通用槽 `list` 会因并列而放弃（交给人工绑定），不会瞎接。
 */
export function autoWireBindings(dataRefs: string[], modules: ApiModuleExports[]): S4AutoBinding[] {
  const slots = [...new Set(dataRefs)].sort();
  const chosen: (S4AutoBinding | undefined)[] = slots.map((slot) => {
    const stArr = [...new Set(tokensOf(slot))].filter((t) => !TOKEN_STOP.has(t));
    if (!stArr.length) return undefined;
    const stSet = new Set(stArr);
    const cands: { tag: string; fn: string; score: number }[] = [];
    for (const mod of modules) {
      for (const f of mod.functions) {
        if (f.hasPathParam) continue;
        const nameAfterVerb = f.name.replace(FN_VERB, '');
        const candSet = new Set(
          [...tokensOf(nameAfterVerb), ...tokensOf(f.url)].filter((t) => !TOKEN_STOP.has(t)),
        );
        if (!candSet.size) continue;
        const candArr = [...candSet];
        if (!isSubsetOf(stArr, candSet) && !isSubsetOf(candArr, stSet)) continue;
        cands.push({ tag: mod.tag, fn: f.name, score: stArr.filter((t) => candSet.has(t)).length });
      }
    }
    if (!cands.length) return undefined;
    const best = Math.max(...cands.map((c) => c.score));
    const top = [...new Map(cands.filter((c) => c.score === best).map((c) => [c.tag + '.' + c.fn, c])).values()];
    if (top.length !== 1) return undefined; // 并列歧义 → 放弃
    return { tag: top[0].tag, fn: top[0].fn, target: slot, params: {} };
  });
  // 一函数只接一个槽：被多个槽选中的函数全部放弃
  const fnUse = new Map<string, number>();
  for (const b of chosen) if (b) fnUse.set(b.tag + '.' + b.fn, (fnUse.get(b.tag + '.' + b.fn) || 0) + 1);
  return chosen.filter((b): b is S4AutoBinding => !!b && fnUse.get(b.tag + '.' + b.fn) === 1);
}

/* ─── 主构建函数 ────────────────────────────────────────────────────────── */
export function buildVueGen(opts: VueGenOptions): VueGenResult {
  const files: VueGenFile[] = [];
  const notes: string[] = [];
  const extracts: UiExtract[] = [];

  const root = opts.projectRoot || '';
  // 设计令牌 + 组件样式同源：common.css 的定位收敛到 s4-component-registry.ts#findCommonCss
  // （固定候选路径 + 工程内任意 common.css 兜底），页面令牌与组件样式不会各读一份而漂移。
  const commonCss = findCommonCss(root);

  const pages = root ? findHtmlPages(root) : [];
  // 过滤出含 <div id="app" 的页面模板
  const pageFiles = pages.filter((p) => {
    try {
      return fs.readFileSync(p, 'utf8').includes('id="app"');
    } catch {
      return false;
    }
  });

  if (!pageFiles.length) {
    notes.push('未在原工程中找到含 <div id="app"> 的原型页模板，S4 未生成 Vue 页面（可能该工程无前端原型）。');
    return { files, extracts, notes };
  }

  // 合并 S3 产物：从同根 generated/ 读回 S3 生成的 api 模块（tag + 导出函数 + URL）
  const apiModules = readApiModules(opts.generatedRoot);
  const apiTags = apiModules.map((m) => m.tag);

  // ── Pass 1：先读全部原型页，聚合「页面实际引用到的自定义标签」 ──────────────
  // 必须在改名前收集：registry 用「观测标签 ∪ 原型 app.component 注册项」决定产出哪些组件。
  const pageInputs: { file: string; html: string; pageTpl: string }[] = [];
  const observedTags: string[] = [];
  for (const file of pageFiles) {
    let html = '';
    try {
      html = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const pageLabel = path.basename(file);
    const { template: rawTemplate, mode } = extractAppTemplate(html);
    if (mode === 'none' || !rawTemplate) {
      notes.push(`页面 ${pageLabel} 未提取到 #app 模板，跳过。`);
      continue;
    }
    if (mode === 'legacy') {
      notes.push(
        `页面 ${pageLabel}：#app 内 div 未配平，已回退旧正则边界（模板闭合可能不完整，建议修正原型）。`,
      );
    }
    // 模板卫生（确定性、零 LLM）：先良构修复，再归一经内联 function handler。
    // 顺序敏感——handler 归一依赖属性已处在良构标签内；两步都不改可见内容。
    const repaired = repairTemplateStructure(rawTemplate);
    const handler = normalizeInlineHandlers(repaired.tpl);
    if (repaired.log.changed) {
      notes.push(
        `页面 ${pageLabel}：#app 模板标签不配平/错位（原型手写缺陷），已确定性良构修复` +
          `（补闭合 ${repaired.log.impliedClose + repaired.log.tailClose} 处、` +
          `丢弃游离闭合 ${repaired.log.strayClose} 处、` +
          `非相邻 v-else-if 降级 ${repaired.log.elseIfDowngrade} 处）→ 产物可编译；建议修正原型。`,
      );
    }
    if (handler.normalized) {
      notes.push(
        `页面 ${pageLabel}：${handler.normalized} 处内联 function(e){…} 事件处理器已归一为箭头函数表达式（剥除 this.），否则 Vue3 模板编译不通过。`,
      );
    }
    if (handler.skipped) {
      notes.push(
        `页面 ${pageLabel}：${handler.skipped} 处内联 function 处理器含裸 this，无法安全归一，已原样保留（该页可能编译失败）。`,
      );
    }
    pageInputs.push({ file, html, pageTpl: handler.tpl });
    for (const tag of findCustomTags(handler.tpl)) {
      if (!observedTags.includes(tag)) observedTags.push(tag);
    }
  }

  // ── 组件 registry（单一来源）：改名 / import / 组件文件 / 组件样式 同读此一份 ──
  const registry = buildComponentRegistry(root, commonCss, observedTags);
  notes.push(...registry.notes);
  for (const spec of registry.specs) {
    files.push({ rel: componentRel(spec.name), content: spec.make(registry.ctx) });
  }

  let idx = 0;
  let autoBindTotal = 0;
  const metaViews: {
    viewName: string;
    pageName: string;
    dataRefs: string[];
    autoBindings: S4AutoBinding[];
    blocks: EmbedBlockHint[];
  }[] = [];
  for (const { file, html, pageTpl } of pageInputs) {
    // 标签改名由 registry 驱动：成对标签（如 <module-nav>）保留内部内容与具名插槽，不自闭合
    const { tpl: template, used: usedComponents } = rewriteComponentTags(
      pageTpl,
      registry.specs,
    );
    idx++;
    const pageName = path.basename(file, '.html');
    const viewName = slugifyView(idx);
    const textTokens = extractTextTokens(html, template);
    const sectionHeadings = extractHeadings(template);
    const tables = extractTables(template);
    // icons / usesTopBar 仅作信息留档；import 已改由 registry 的 usedComponents 决定
    const icons = extractIcons(pageTpl);
    const usesTopBar = /<top-bar\b|<TopBar\b/.test(pageTpl);
    const dataRefs = collectDataRefs(template);

    const extract: UiExtract = {
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

    // 该视图的绑定侧车：仅当本视图的数据槽包含 binding.target 时才烘焙
    const viewBinding =
      opts.binding && opts.binding.target && dataRefs.includes(opts.binding.target)
        ? opts.binding
        : undefined;
    // 默认自动接线：本视图数据槽 ↔ S3 api 函数（确定性配对；歧义一律放弃）
    const viewAutoBindings = autoWireBindings(dataRefs, apiModules);
    // 该视图的组件嵌入侧车：按 view 名过滤（仅插入到指定视图）
    const viewEmbeds = (opts.embeds || []).filter((e) => e.view === viewName);
    const view = buildPageView(
      idx,
      extract,
      template,
      usedComponents,
      commonCss,
      html,
      apiTags,
      viewAutoBindings,
      opts.runId,
      viewBinding,
      viewEmbeds,
    );
    files.push({ rel: `frontend/src/views/${viewName}.vue`, content: view });

    // 该视图可插入区块（供前端「插入位置」下拉；index 为区块序号，pos = index 表示插入到该区块之前）
    const viewBlocks = parseTemplateBlocks(template).children.map((c, i) => {
      const tagM = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(c);
      const rawTag = tagM ? tagM[1] : 'div';
      // 改写后的组件标签是 PascalCase，回落成原型里的 kebab 名（ModuleNav → module-nav），
      // 让前端下拉展示与原型标签一致
      const tag = /^[A-Z]/.test(rawTag) ? kebabizeName(rawTag) : rawTag.toLowerCase();
      return { index: i, tag, hint: blockHintText(c) } as EmbedBlockHint;
    });
    metaViews.push({ viewName, pageName, dataRefs, autoBindings: viewAutoBindings, blocks: viewBlocks });
    autoBindTotal += viewAutoBindings.length;
  }

  // S4 元信息：前端 project-lab 据此列出每个视图可绑定的数据槽 + 用于对照
  files.push({
    rel: 'frontend/s4-meta.json',
    content: JSON.stringify(
      {
        runId: opts.runId,
        generatedAt: opts.generatedAt,
        views: metaViews,
        // additive：本次 run 实际产出的组件清单（名称/标签/来源/props/插槽），供前端对照与排查
        components: registry.specs.map((s) => ({
          name: s.name,
          tag: s.tag,
          source: s.source,
          props: s.props,
          slots: s.slots,
          file: componentRel(s.name),
        })),
      },
      null,
      2,
    ) + '\n',
  });

  notes.push(
    `S4 真·Vue 页面：从原工程 ${pages.length} 个 .html 中成功抽取 ${idx} 个 #app 原型页，生成 ${idx} 个 GenViewNN.vue（保留原模板 + scoped 样式 + 占位样本数据）。`,
  );
  notes.push(
    '视觉保真门禁（就绪态·轻量）：抽取文案/标题作为 TEXT-TRUTH 真值，确定性断言产物包含全部抽取文案 + 区块标题；非 vision/figma 比对。',
  );
  notes.push(
    'S4 默认自动接线（Phase 2a）：按「数据槽名 ↔ S3 api 函数名/URL」归一化词元配对，互为子集且唯一、' +
      `函数 URL 不含 :param 才绑；本 run 共自动绑定 ${autoBindTotal} 处（api 模块 ${apiTags.length} 个）。` +
      '歧义（多候选并列 / 一函数对多槽）一律放弃 → 该槽保持占位样本数据，页面绝不空白/抛错。',
  );
  notes.push(
    '人工绑定侧车（Phase 2b）：binding.json 存在时后应用，覆盖自动接线结果（见 project-lab「对接接口」）。',
  );
  notes.push(
    '未生成图表真实数据（echarts 接入 Phase 2），保留 .trend-chart 容器与 ref。',
  );
  return { files, extracts, notes };
}

/**
 * 确定性门禁（TEXT-TRUTH 轻量）：抽取文案/标题必须进产物。
 *
 * 判定粒度 =【逐视图】。旧实现把所有 .vue 拼成一串再 includes，存在假绿漏洞：
 * A 视图丢掉的文案，只要 B 视图有同名字样就照样通过（样本 5 视图实测逐视图亦全命中，
 * 故收紧不产生假红）。视图产物缺失按失败处理，不静默放行。
 */
export function verifyVueGen(
  result: VueGenResult,
  builtFiles: Record<string, string>,
): { pass: boolean; missingText: string[]; missingHeadings: string[] } {
  const missingText: string[] = [];
  const missingHeadings: string[] = [];
  for (const ex of result.extracts) {
    const rel = `frontend/src/views/${ex.viewName}.vue`;
    const own = builtFiles[rel];
    if (typeof own !== 'string') {
      missingText.push(`${ex.viewName}: (视图产物缺失 ${rel})`);
      continue;
    }
    for (const t of ex.textTokens) {
      if (!own.includes(t)) missingText.push(`${ex.viewName}: ${t}`);
    }
    for (const h of ex.sectionHeadings) {
      if (!own.includes(h)) missingHeadings.push(`${ex.viewName}: ${h}`);
    }
  }
  return { pass: missingText.length === 0 && missingHeadings.length === 0, missingText, missingHeadings };
}
