/**
 * theme-color-guard — 样式「主题变量化」门禁事实源（2026-09-04）
 *
 * 背景：微码/vue3 组件把主题槽位色值（theme-vars.less 中 .theme-dark()/.theme-light()
 * 定义的 #hex，或框架预设 cssVars）**抄写**进 common.less / .vue 内嵌样式 → 切主题/
 * 调颜色变量零生效（mc-max-1788485095835-e1432017 实测：81 处 #hex 硬编码、
 * var(--color*) 引用为 0）。
 *
 * 职责：确定性扫描生成产物，判定违规：
 *   1. THEME-PRESET-OVERRIDE（BLOCK，≤2 处降 WARN）：非槽位文件里本地重声明框架预设变量
 *      （`@colorTextBase: #333;` / `--colorPrimary: #fff;`）——用「变量名」掩盖硬编码，
 *      并覆盖主题 mixin 接收变量（DailyTotal.vue:69 反模式）。
 *      豁免形态：值为 var() 透传声明（`@fontSize: var(--fontSize)`，file-writer 自愈产物）
 *      = 接入主题变量而非覆盖 → 不记违规（2026-09-04）。
 *   2. THEME-SLOT-COLOR（BLOCK，≤3 处降 WARN）：颜色属性值直接**抄写主题槽位色值**
 *      （#hex 与 theme-vars.less 槽值一致却写死）——必须改为变量引用。
 *   3. THEME-SPECIAL-COLOR（WARN）：独立字面量但不属于槽位（图例/功能/渐变/SVG
 *      fill/stroke 等设计专色）——提示可变量化，不阻断（避免误杀数据可视化语义色）。
 *   4. 阈值降级（2026-09-04）：确定性自愈后少量残留不硬 BLOCK——LLM 生成路径
 *      无法稳定 0 违规时，硬 BLOCK+重试耗尽 = 任务 100% 失败（mc-max-1788505197306 实锤）。
 *
 * 豁免 / fail-open：
 *   - themes/ 目录（槽位定义处 = 唯一允许硬编码色值的位置）、config/、declare.js 等
 *   - .vue 只扫 <style> 段（script 里 echarts series.color 不在扫描范围）
 *   - 值整体为 var(...)（含 fallback var(--x, #fff)）→ 合法引用，跳过
 *   - theme-vars.less 缺 hex 槽值时无法精确比对 → 独立 hex 一律降级 WARN（保守不误杀）
 *
 * 消费：code-structure-validator（L0-B）validate() 出口前调用 detectThemeColorViolations()。
 */

export const FRAMEWORK_PRESET_NAMES = [
  'fontSize',
  'fontWeightStrong',
  'colorTextBase',
  'colorPrimary',
  'colorPrimaryHover',
  'colorPrimaryActive',
  'colorPrimaryBg',
  'colorPrimaryBgHover',
];

const PRESET_OVERRIDE_RE = new RegExp(
  `(?:^|[;{]\\s*)(?:@|--)(?:${FRAMEWORK_PRESET_NAMES.join('|')})\\s*:`,
  'i',
);

/** 预设声明值提取：`@fontSize: var(--fontSize);` → 捕获 var(--fontSize) */
const PRESET_VALUE_RE = new RegExp(
  `(?:@|--)(?:${FRAMEWORK_PRESET_NAMES.join('|')})\\s*:\\s*([^;}]+)`,
  'i',
);

// 🛡️ 2026-09-04 阈值降级（生产 mc-max-1788505197306 实锤：3 轮重试耗尽）：
// 确定性自愈（file-writer 预设透传化 + 槽 hex 变量化）后仍残留的少量违规
// 不再硬 BLOCK——LLM 生成路径无法稳定 0 违规时，硬 BLOCK = 任务 100% 失败，
// 比「少量主题不响应」更糟。超阈值仍 BLOCK（防大量抄写/覆盖）。
const PRESET_WARN_UP_TO = 2; // 预设名字面量重声明 ≤2 处 → WARN
const SLOT_WARN_UP_TO = 3;   // 槽位色值抄写 ≤3 处 → WARN
// 🛡️ 2026-09-26（0.1+0.2+0.3-a 后新增）：业务样式 var(--colorX) 直引 ≤3 处 → WARN（不硬失败）。
//   0.2 断掉「hex→var()」源、0.3-a 修好 healer 覆盖率后，语料重放残留从 80.9% 收敛到 3.1%，
//   且残留多为「名称无对应槽位、不可映射」的 1~4 处形态；超阈值仍 BLOCK（防大面积 var() 回归）。
const VAR_NAME_WARN_UP_TO = 3;

// 🛡️ 2026-09-16：文件级槽位字面量重声明（与 collectFileLevelSlotOverrides 同源，检测器/自愈共用）
const FILE_LEVEL_SLOT_OVERRIDE_RE = /^\s*@(color|shadow)-[A-Za-z0-9_-]+\s*:\s*(#|rgba?\(|hsla?\()/i;

/** 颜色呈现属性（值必须主题变量化；兼容 `{ color: #x; }` 单行规则体） */
const COLOR_PROP_RE =
  /(^|[;{])\s*(?:color|background(?:-color)?|border-(?:top|right|bottom|left)-color|outline(?:-color)?|caret-color|accent-color)\s*:\s*([^;]*)/gi;

/** SVG 呈现属性（WARN 级） */
const SVG_PAINT_PROP_RE = /(^|[;{])\s*(?:fill|stroke)\s*:\s*([^;]*)/gi;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_RE = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/gi;
const SAMPLE_LIMIT = 3;

/**
 * `var(--name[, fallback])` 的变量名引用。
 * 🛡️ 2026-09-16 新增：此前 `var(--x, #fff)` 整值被直接判为「合法引用」跳过（见文件头豁免说明），
 * 但**名字不存在**时它其实等价于硬编码——运行期永远注入不进去，fallback 恒生效。
 */
const VAR_USE_RE = /var\(\s*--([A-Za-z0-9_-]+)/g;

/**
 * 🛡️ 2026-09-16 新增：`var(...)` 后面拼接非法后缀（如 `var(--color-bg, #fff)-card`）。
 * 这类写法是「非法 CSS 值」——浏览器会忽略整条声明（背景/边框不生效），比「主题不响应」
 * 更严重。实锤：healThemeMixinVarRefs 正则 `\b` 边界 bug 把 `@color-bg-card` 误改写成
 * `var(--color-bg, rgba(237,244,251,1))-card`（c-vehicle-monitor-71dd6494 stat-card 背景失效）。
 * 用 `[^;{}]*` 跨过 var() 内部嵌套括号，再断言 `)` 后紧跟 `-` 或字母。
 */
const VAR_SUFFIX_RE = /var\(\s*--[A-Za-z0-9_-]+[^;{}]*\)\s*[-a-zA-Z]/g;

/**
 * rgba(r,g,b) / rgba(r,g,b,a) → #rrggbb / #rrggbbaa
 * @param {string} rgba
 * @returns {string|null}
 */
function rgbaToHex(rgba) {
  const m = rgba.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!m) return null;
  const r = Math.min(255, Math.max(0, parseInt(m[1], 10)));
  const g = Math.min(255, Math.max(0, parseInt(m[2], 10)));
  const b = Math.min(255, Math.max(0, parseInt(m[3], 10)));
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  // alpha=1 → 6位 hex；alpha<1 → 8位 hex（含 alpha 通道）
  if (a < 1) {
    const aa = Math.round(a * 255).toString(16).padStart(2, '0');
    return hex + aa;
  }
  return hex;
}

/**
 * 剥离 CSS 函数调用块（var(...) / linear-gradient(...) / rgba(...) / url(...)），
 * 返回「块外残余文本」。栈式括号配对，支持任意嵌套。
 * @param {string} value
 * @returns {string}
 */
function stripFnBlocks(value) {
  const s = String(value || '');
  const n = s.length;
  const drop = new Array(n).fill(false);
  const stack = [];
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    if (ch === '(') {
      // 函数名起点 = '(' 前连续 [a-zA-Z0-9-]（如 var / linear-gradient）
      let nameStart = i;
      while (nameStart > 0 && /[a-zA-Z0-9-]/.test(s[nameStart - 1])) nameStart--;
      for (let k = nameStart; k <= i; k++) drop[k] = true;
      stack.push(i);
    } else if (ch === ')') {
      const open = stack.pop();
      if (open !== undefined) {
        for (let k = open; k <= i; k++) drop[k] = true;
      }
    }
  }
  let out = '';
  for (let i = 0; i < n; i++) if (!drop[i]) out += s[i];
  return out;
}

/**
 * 提取样式文本：.vue 只取 <style> 段（防 script 内 echarts 配色误报），.less 取全文。
 */
function extractStyleText(file) {
  const path = String(file?.path || '');
  const content = String(file?.content || '');
  if (path.endsWith('.less')) return content;
  if (!path.endsWith('.vue')) return '';
  const parts = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(content)) !== null) parts.push(m[1]);
  return parts.join('\n');
}

/**
 * 从主题槽位文件提取全部 hex 槽值（含 rgba 转 hex）；文件缺失或无槽值 → null（调用方据此降级）。
 * @returns {Set<string>|null}
 */
function collectSlotHexSet(files) {
  const slotFile = (files || []).find(
    (f) => f && /themes\/theme-vars\.less$/.test(String(f.path || '')) && f.content,
  );
  if (!slotFile) return null;
  const content = String(slotFile.content);
  const hexes = content.match(HEX_RE) || [];
  // 2026-09-15 治本：rgba() 也要收集（LLM 常写 rgba(51,51,51,1) 而非 #333）
  const rgbaMatches = content.match(RGBA_RE) || [];
  for (const rgba of rgbaMatches) {
    const hex = rgbaToHex(rgba);
    if (hex) hexes.push(hex);
  }
  if (hexes.length === 0) return null;
  return new Set(hexes.map((h) => h.toLowerCase()));
}

/** 行内注释剥离：/* … *\/ 与 // 之后内容不影响判定 */
function stripComments(line) {
  return String(line).replace(/\/\*[\s\S]*?\*\//g, '').split('//')[0];
}

/** 颜色语义变量名（.common() 内出现即疑似槽位色值本地定义） */
const COLOR_VAR_NAME_RE =
  /color|bg|background|border|fill|stroke|shadow|primary|secondary|danger|success|warning|error/i;
/** 几何/尺寸类令牌（名字含 border 时勿误判为颜色，如 @border-radius-base / @bg-size） */
const GEOMETRY_TOKEN_RE =
  /radius|size|width|height|space|gap|padding|margin|weight|opacity|alpha|duration|delay|z-?index/i;
/** 颜色字面量（hex / rgb() / rgba() / hsl() / hsla()） */
const COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i;

/** 变量名是否指向颜色槽位（供 less-variable-checker 确定性自愈复用，保证判定同源） */
export function isColorVarName(name) {
  if (!COLOR_VAR_NAME_RE.test(name)) return false;
  // 名字显式含 color → 必为颜色（@border-color / @color-bg-base）
  if (/color/i.test(name)) return true;
  // 否则若含几何语义（@border-radius-base / @bg-size）→ 不是颜色
  return !GEOMETRY_TOKEN_RE.test(name);
}

/**
 * 🛡️ 2026-09-15 治本：检测 theme-vars.less 的 `.common()` 块内是否定义了颜色变量。
 *
 * 根因：LESS 的 mixin 变量**不覆盖** caller 作用域已存在的同名变量。
 * index.less / dark.less / light.less 均为 `.common(); .theme-X();` 顺序调用，
 * 若 `.common()` 先定义了 @colorX，随后 `.theme-dark()` 的同名定义被**静默忽略**
 * → `.dark` 与 `.light` 编译结果完全相同 → 切主题零生效
 * （c-env-monitor-1cffd7ce 实锤：7 处颜色零响应，`.common()` 里 12 个颜色变量是元凶）。
 *
 * 颜色槽值只能定义在 `.theme-light()` / `.theme-dark()` 内。
 * @returns {Array<{name:string, value:string}>}
 */
function collectCommonMixinColorVars(files) {
  const slotFile = (files || []).find(
    (f) => f && /themes\/theme-vars\.less$/.test(String(f.path || '')) && f.content,
  );
  if (!slotFile) return [];
  const content = String(slotFile.content);
  const block = content.match(/\.common\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/);
  if (!block) return [];
  const hits = [];
  const re = /@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    const name = m[1];
    const value = m[2].trim();
    // var() 透传是「接入主题变量」形态（如 @fontSize: var(--fontSize)）→ 不算违规
    if (/^var\(/i.test(value)) continue;
    if (isColorVarName(name) || COLOR_LITERAL_RE.test(value)) {
      hits.push({ name: `@${name}`, value: value.slice(0, 40) });
    }
  }
  return hits;
}

/**
 * 收集「组件实际提供的」CSS 变量名（事实源）——三者并集：
 *   ① `resources/config/css-vars.js` 的对象键（`common` 与各主题对象）= 主题变量唯一事实源
 *   ② `FRAMEWORK_PRESET_NAMES` = 框架预设（平台必定注入）
 *   ③ `declare.json` 的 `cssVariableConfig[].key` = 业务可配变量（运行期同样会注入）
 *
 * 并集之外的名字运行期不会被注入 → `var(--x, fallback)` 恒等于硬编码。
 * 返回 `null` 表示拿不到 css-vars.js（信息不足）→ fail-open，由调用方跳过不判违规。
 *
 * 🛡️ 2026-09-16：c-env-monitor 系列实测——产物只引用 `--colorWhite`/`--colorError`，
 * 而 css-vars.js 提供的是 `colorTextBase`/`colorDanger` 等，名字对不上 → 切主题零生效。
 */
/**
 * 🛡️ 2026-09-16 模式 B（skill 规范主推，`style-guide.md` L161-241）新增：
 * 检测 `.theme-dark()` 与 `.theme-light()` 的槽位值是否**逐字完全相同**。
 *
 * 模式 B 是**编译期差异化**：深浅差异 100% 来自这两套槽位值，由 `&.dark` / `&.light`
 * 作用域在编译期展开。两套值相同 → `.dark` 与 `.light` 编译结果逐字一致 →
 * 主题开关彻底失效（且不像模式 A 那样还能靠运行期注入补救）。
 *
 * 全语料审计（2026-09-16）：247 个组件中 **102 个命中（41%）**。
 *
 * @param {Array<{path:string, content:string}>} files
 * @returns {null | {slotCount:number}} null = 未命中/无法判定；否则返回相同槽位个数
 */
export function collectIdenticalThemeMixins(files) {
  const list = Array.isArray(files) ? files : [];
  const themeFile = list.find((f) =>
    /themes\/theme-vars\.less$/.test(String(f?.path || '')),
  );
  if (!themeFile) return null;
  const src = String(themeFile.content || '');

  // 抓取某个 mixin 块的正文（mixin 内无嵌套花括号，深度计数即可，勿用跨块正则）
  const grab = (name) => {
    const i = src.indexOf(name);
    if (i < 0) return null;
    const s = src.indexOf('{', i);
    if (s < 0) return null;
    let depth = 0;
    for (let j = s; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return src.slice(s + 1, j);
      }
    }
    return null;
  };
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const dark = grab('.theme-dark()');
  const light = grab('.theme-light()');
  // 缺任一 mixin 属「结构缺失」，由 less-variable-checker 的补变量逻辑负责，此处不重复报
  if (dark === null || light === null) return null;
  if (norm(dark) !== norm(light)) return null; // 有差异 → 正常

  const slotCount = (norm(dark).match(/@[A-Za-z0-9_-]+\s*:/g) || []).length;
  return { slotCount };
}

/**
 * 🛡️ 2026-09-16 新增：检测业务样式里的**文件级**槽位变量字面量重声明。
 *
 * 根因（LESS 语义）：mixin 变量**首个定义者胜出**。common.less 若在文件顶层写
 *   `@color-text-base: rgba(51,51,51,1);`
 * 会抢在 `.theme-dark()` / `.theme-light()` 之前定义同名变量 → 两套槽位值被**静默忽略**
 * → `&.dark` 与 `&.light` 编译结果逐字相同，主题开关彻底失效。
 *
 * 实测（`c-vehicle-monitor-326051b2`，2026-09-16）：common.less 仅 **2 行**顶部重声明，
 * 就让 9 个正确配置过的深浅槽位全部作废；删掉这 2 行后 `.dark`/`.light` 立刻出现 6 处差异。
 *
 * 与既有检查的关系（互补，不重叠）：
 *   - `THEME-COMMON-COLOR-VAR` 查 `.common()` mixin 内
 *   - `PRESET_OVERRIDE_RE`     查框架预设名 **camelCase**（`@colorTextBase`）
 *   - 本函数                   查 common.less / .vue 的**文件级 kebab 槽位名**（`@color-text-base`）
 *
 * 判定「文件级」的方式：逐行累计花括号深度，仅深度为 0 时的赋值算文件级。
 *
 * @param {Array<{path:string, content:string}>} files
 * @returns {Array<{file:string, line:number, sample:string}>}
 */
export function collectFileLevelSlotOverrides(files) {
  const hits = [];
  const list = Array.isArray(files) ? files : [];
  // 仅认颜色/阴影槽位名，且值必须是字面量（var() / 引用其它变量不算）
  const RE = /^\s*@(color|shadow)-[A-Za-z0-9_-]+\s*:\s*(#|rgba?\(|hsla?\()/i;

  for (const file of list) {
    const p = String(file?.path || '');
    if (/\/themes\//.test(p) || /\/config\//.test(p)) continue;
    if (!p.endsWith('.less') && !p.endsWith('.vue')) continue;
    const styleText = extractStyleText(file);
    if (!styleText) continue;

    let depth = 0;
    const lines = styleText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = stripComments(raw);
      if (depth === 0 && RE.test(line)) {
        hits.push({ file: p, line: i + 1, sample: raw.trim().slice(0, 90) });
      }
      // 累计深度（基于剥离注释后的文本，避免注释里的花括号干扰）
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth < 0) depth = 0;
        }
      }
    }
  }
  return hits;
}

/**
 * 🛡️ 2026-09-16 确定性自愈：从 `generatedFiles`（内存 content）中删除文件级
 * `@color-*` / `@shadow-*` 的【字面量】重声明行。
 *
 * 与 `collectFileLevelSlotOverrides` 同源、互逆 —— 检测器报什么，自愈删什么。
 * 直接 mutate `file.content`（不改 path），调用方写盘即落干净产物；重试时
 * 内存 content 已是干净版，门禁 `THEME-SLOT-LOCAL-OVERRIDE` 不再 BLOCK → 不会重试耗尽。
 *
 * 安全性（与检测器一致）：
 *  - 仅删 depth 0 的【字面量】赋值（#hex / rgba() / hsla()），var()/变量引用不删（合法透传）。
 *  - 规则块内（depth>0）一律不删（局部作用域，不污染主题 mixin）。
 *  - themes/ 与 config/ 豁免。
 *
 * @param {Array<{path:string, content:string}>} files
 * @returns {boolean} 是否修改过
 */
export function healFileLevelSlotOverrides(files) {
  const list = Array.isArray(files) ? files : [];
  let changed = false;
  let removed = 0;
  for (const file of list) {
    const p = String(file?.path || '');
    if (/\/themes\//.test(p) || /\/config\//.test(p)) continue;
    if (!p.endsWith('.less') && !p.endsWith('.vue')) continue;
    const content = String(file?.content || '');
    const r = healStyleContent(content, p.endsWith('.vue'));
    if (r.changed) {
      file.content = r.content;
      changed = true;
      removed += r.removed;
    }
  }
  return { changed, removed };
}

/** 逐行扫描样式文本，删文件级（depth 0）槽位字面量重声明；.vue 仅样式段内生效。 */
function healStyleContent(content, isVue) {
  const lines = String(content).split(/\r?\n/);
  let depth = 0;
  let inStyle = !isVue;
  let changed = false;
  let removed = 0;
  const out = [];
  for (const line of lines) {
    if (isVue) {
      const enter = /<style\b[^>]*>/i.test(line) && !/<\/style>/i.test(line);
      const exit = /<\/style>/i.test(line) && !/<style\b[^>]*>/i.test(line);
      if (enter) { inStyle = true; out.push(line); continue; }
      if (exit) { inStyle = false; depth = 0; out.push(line); continue; }
    }
    const isTop = inStyle && depth === 0;
    if (isTop && FILE_LEVEL_SLOT_OVERRIDE_RE.test(stripComments(line))) {
      changed = true;
      removed += 1; // 删除该行
      continue;
    }
    out.push(line);
    if (inStyle) {
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth = Math.max(0, depth - 1);
      }
    }
  }
  return { content: out.join('\n'), changed, removed };
}

export function collectProvidedVarNames(generatedFiles) {
  const files = Array.isArray(generatedFiles) ? generatedFiles : [];

  const cssVarsFile = files.find(
    (f) => f && /config[\\/]css-vars\.js$/.test(String(f.path || '')) && f.content,
  );
  // 拿不到事实源 → 不判（避免把「无法取证」误报成违规）
  if (!cssVarsFile) return null;

  const provided = new Set(FRAMEWORK_PRESET_NAMES);

  // ① css-vars.js：对象字面量键（含带引号的 kebab 名）
  const objRe = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{([^}]*)\}/g;
  let om;
  while ((om = objRe.exec(String(cssVarsFile.content))) !== null) {
    const keyRe = /(?:^|[,{\s])(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:/g;
    let km;
    while ((km = keyRe.exec(om[1])) !== null) {
      const name = km[1] || km[2] || km[3];
      if (name) provided.add(name);
    }
  }

  // ③ declare.json / declare.js：cssVariableConfig 的 key
  for (const f of files) {
    const p = String(f?.path || '');
    if (!/declare\.(json|js)$/.test(p) || !f.content) continue;
    const body = String(f.content);
    const cfgIdx = body.indexOf('cssVariableConfig');
    const scope = cfgIdx >= 0 ? body.slice(cfgIdx) : body;
    const keyRe = /"key"\s*:\s*"([^"]+)"/g;
    let km;
    while ((km = keyRe.exec(scope)) !== null) provided.add(km[1]);
  }

  return provided;
}

/**
 * 主检测入口。
 * @param {Array<{path:string, content:string}>} generatedFiles
 * @returns {Array<{id:string, severity:'BLOCK'|'WARN', file:string, message:string, hint?:Object}>}
 */
export function detectThemeColorViolations(generatedFiles) {
  const files = Array.isArray(generatedFiles) ? generatedFiles : [];
  const slotHex = collectSlotHexSet(files);
  const slotAware = slotHex !== null;

  const presets = [];
  const slotHits = [];
  const specialHits = [];
  // 🛡️ 2026-09-15：.common() 内本地定义颜色变量 → 静默挡住主题 mixin 覆盖
  const commonColorVars = collectCommonMixinColorVars(files);
  // 🛡️ 2026-09-16：var(--name) 名字存在性 —— 名字不在提供集里 = 运行期注入不到 = 恒走 fallback
  const providedVars = collectProvidedVarNames(files);
  const varNameHits = [];
  // 🛡️ 2026-09-16：var()-后缀非法拼接（声明失效，比主题不响应更严重）
  const varSuffixHits = [];
  // 🛡️ 2026-09-16 模式 B：两套 theme mixin 槽位值逐字相同 → 编译期无差异 → 主题开关彻底失效
  const identicalMixins = collectIdenticalThemeMixins(files);
  // 🛡️ 2026-09-16：common.less/.vue 文件级槽位字面量重声明 → 抢先定义 → 两套槽位值被静默忽略
  const slotOverrides = collectFileLevelSlotOverrides(files);

  const collect = (line, rawLine, path, lineNo) => {
    // ── ① 预设变量本地重声明 ──
    const trimmed = line.trim();
    if (PRESET_OVERRIDE_RE.test(trimmed)) {
      // 🛡️ 2026-09-04 值形态识别：`@fontSize: var(--fontSize)` 是「接入主题变量」的
      // 透传声明（file-writer 写盘门禁自愈补全的合法形态），非字面量覆盖 → 豁免。
      // 仅字面量/其它非 var 值（`@colorPrimary: #409EFF`）视为覆盖 → 记违规。
      const valueMatch = trimmed.match(PRESET_VALUE_RE);
      const declaredValue = valueMatch ? valueMatch[1].trim() : '';
      if (!/^var\(/i.test(declaredValue)) {
        presets.push({ file: path, line: lineNo, sample: trimmed.slice(0, 90) });
      }
      return;
    }

    // ── ③ 业务样式直引 var()（2026-09-16 新增；同日晚改模式 B）──
    // 模式 B：`var()` 只允许出现在 theme-vars.less 的 `.common()` 透传映射里。
    // 本循环已排除 themes/ 与 config/，故命中的都是 common.less / .vue <style>，
    // 一律属**模式 A 残留** —— 颜色差异化本该由编译期两套槽位承担，写 var() 反而退化成
    // 「依赖运行期注入」，而平台并不注入这些名字（`--colorTextLight` / `--colorCardBg`…）
    // → fallback 恒生效且多写死字面量 → 深浅两侧渲染完全相同。
    // 注意 VAR_USE_RE 是 /g，逐行复用必须重置 lastIndex。
    VAR_USE_RE.lastIndex = 0;
    let vu;
    while ((vu = VAR_USE_RE.exec(line)) !== null) {
      const name = vu[1];
      // 仅拦截颜色/阴影/背景/边框类；--fontSize 等尺寸类暂放行（历史产物可能合法映射）
      if (!/^(color|shadow|bg|border|text)/i.test(name)) continue;
      varNameHits.push({
        file: path,
        line: lineNo,
        name: `--${name}`,
        provided: providedVars ? providedVars.has(name) : null,
        sample: rawLine.trim().slice(0, 90),
      });
    }

    // ── ④ var()-后缀非法拼接（2026-09-16 · c-vehicle-monitor-71dd6494 实锤）──
    // `var(--x, #fff)-card` 这类「var() 结束后又拼 -后缀」是非法 CSS 值 → 浏览器忽略整条声明。
    // ③ 只查「变量名存在性」、② 以 /^var\(/ 直接豁免，都拦不住这种写法。
    VAR_SUFFIX_RE.lastIndex = 0;
    let vs;
    while ((vs = VAR_SUFFIX_RE.exec(line)) !== null) {
      varSuffixHits.push({
        file: path,
        line: lineNo,
        sample: rawLine.trim().slice(0, 90),
      });
    }

    // ── ② 颜色呈现属性 ──
    const examine = (regex, isSvgPaint) => {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(line)) !== null) {
        const value = (m[2] || '').trim();
        if (!value) continue;
        // var(--x[, fallback]) 整值 = 合法变量引用
        if (/^var\(/i.test(value)) continue;
        // 剥离所有函数块：若整体都是函数块（var/gradient/rgba/url…）→ 无独立字面量
        const outside = stripFnBlocks(value).trim();
        const hexes = outside.match(HEX_RE) || [];
        // 🛡️ 2026-09-15 治本：rgba(r,g,b[,a]) 等价 hex 一并参与槽位比对。
        // 此前只认 #hex，LLM 写 rgba(51,51,51,1) 时被当成「半透明装饰色」降 WARN，
        // 导致 .theme-light()/.theme-dark() 槽值被抄写却零拦截（c-env-monitor 实锤）。
        const rgbaHexes = (value.match(RGBA_RE) || [])
          .map((x) => rgbaToHex(x))
          .filter(Boolean);
        const allHexes = hexes.concat(rgbaHexes);
        if (allHexes.length === 0) {
          // 纯 gradient()/hsl() 值或空 → WARN 提示（渐变装饰色不精确比对）
          if (/(?:gradient|hsla?\()/i.test(value)) {
            specialHits.push({ file: path, line: lineNo, literal: value.slice(0, 60), sample: rawLine.trim().slice(0, 90) });
          }
          continue;
        }
        for (const hx of allHexes) {
          const low = hx.toLowerCase();
          if (slotAware && slotHex.has(low)) {
            // 槽位色值抄写
            if (isSvgPaint) specialHits.push({ file: path, line: lineNo, literal: hx, sample: rawLine.trim().slice(0, 90) });
            else slotHits.push({ file: path, line: lineNo, literal: hx, sample: rawLine.trim().slice(0, 90) });
          } else {
            // 独立字面量但非槽位（含 slotAware=false 时的所有独立 hex）→ WARN
            specialHits.push({ file: path, line: lineNo, literal: hx, sample: rawLine.trim().slice(0, 90) });
          }
        }
      }
    };
    examine(COLOR_PROP_RE, false);
    examine(SVG_PAINT_PROP_RE, true);
  };

  for (const file of files) {
    const path = String(file?.path || '');
    // 🛡️ 2026-09-17：主题变量定义文件一律排除——微码在 themes/ 子目录，
    // vue3 在根（resources/styles/theme-vars.less，无 themes/ 子目录）。此前只排除 /\/themes\//，
    // vue3 的系统生成 theme-vars 被当业务样式扫描 → .theme-dark() 里 @colorTextBase:#ffffff
    // 硬编码槽位值被误判 THEME-PRESET-OVERRIDE BLOCK（重试耗尽实锤）。
    if (/\/themes\//.test(path) || /\/config\//.test(path)) continue;
    if (/theme-vars\.less$/.test(path)) continue;
    if (!path.endsWith('.less') && !path.endsWith('.vue')) continue;
    const styleText = extractStyleText(file);
    if (!styleText) continue;
    styleText.split(/\r?\n/).forEach((raw, idx) => {
      const line = stripComments(raw);
      if (!line.trim()) return;
      collect(line, raw, path, idx + 1);
    });
  }

  const issues = [];
  const fmt = (arr) => {
    const shown = arr.slice(0, SAMPLE_LIMIT);
    const body = shown.map((s) => `${s.file}:${s.line} ${s.sample}`).join('；');
    return `${body}${arr.length > SAMPLE_LIMIT ? ` 等 ${arr.length} 处` : ''}`;
  };

  if (commonColorVars.length > 0) {
    // ⚠️ 2026-09-15 全语料审计：244 个存量组件中 172 个命中（70%），属**系统性**形态，
    // 且后果是「主题静默失效」而非「编译失败」。若设 BLOCK 会让大批任务重试耗尽
    // （参照 mc-max-1788505197306 教训）→ 统一 WARN，配合 less-variable-checker 的
    // 确定性自愈（变量已在两个主题 mixin 定义时从 .common() 移除）渐进收敛。
    const varList = commonColorVars.map((v) => `${v.name}: ${v.value}`).join('、');
    issues.push({
      id: 'THEME-COMMON-COLOR-VAR',
      severity: 'WARN',
      file: 'resources/styles/themes/theme-vars.less',
      message: `.common() 内定义了 ${commonColorVars.length} 个颜色变量（${varList}）→ LESS 的 mixin 变量不覆盖 caller 已有同名变量，.common() 抢先定义后 .theme-light()/.theme-dark() 被静默忽略 → .dark/.light 编译结果完全相同、切主题零生效。请把这些颜色变量移入 .theme-light() 与 .theme-dark() 各自定义，.common() 只保留字号/圆角等跨主题共享令牌。`,
      hint: {
        suggestion:
          '删除 .common() 内的 @colorX 定义，分别写进 .theme-light() / .theme-dark()（两处都要有，避免其中一个主题缺值编译失败）',
      },
    });
  }

  if (presets.length > 0) {
    // 🛡️ 2026-09-04 阈值降级：≤PRESET_WARN_UP_TO 处降 WARN（少量残留不硬失败），超阈值仍 BLOCK
    const severity = presets.length <= PRESET_WARN_UP_TO ? 'WARN' : 'BLOCK';
    const thresholdNote =
      severity === 'WARN'
        ? `（≤${PRESET_WARN_UP_TO} 处降级 WARN：建议在精修期删除本地声明或改 var(--preset, 值) 透传，不阻断本次生成）`
        : '';
    issues.push({
      id: 'THEME-PRESET-OVERRIDE',
      severity,
      file: presets[0].file,
      message: `本地重声明框架主题变量 ${presets.length} 处（@colorTextBase: #xxx / --colorPrimary: #xxx），违反主题变量化规范：该写法以字面量覆盖主题色、且会盖掉 theme-vars.less .common() mixin 的接收变量 → 切主题/调色零生效。删除本地声明，改变量引用（microcode：color: var(--colorTextBase, <默认>)；vue3：color: @colorTextBase）。${fmt(presets)}${thresholdNote}`,
      hint: { suggestion: '删除样式内的 @colorTextBase/@colorPrimary 等本地声明；直接 var(--colorX)（microcode）或 @colorX（vue3）' },
    });
  }
  if (identicalMixins) {
    // ⚠️ 全语料审计（2026-09-16）：247 个组件中 102 个命中（41%），属系统性形态。
    // 🛡️ 2026-09-26 升级 WARN→BLOCK：前置已治本——
    //   0.1 让 §3 核心槽位由 buildStyleTokens 确定性产出（设计主题=提取、缺的主题=派生），
    //   0.3-b 对专属槽位做确定性深浅派生 → 两套 mixin 必然不同。
    //   全语料按「整块 mixin 逐字相同」口径复测：基线 23/451=5.1% → 模拟 0.1+0.3-b 后 **0/451=0.0%**。
    issues.push({
      id: 'THEME-MIXINS-IDENTICAL',
      severity: 'BLOCK',
      file: 'resources/styles/themes/theme-vars.less',
      message: `.theme-dark() 与 .theme-light() 的 ${identicalMixins.slotCount} 个槽位值完全相同 → 模式 B（编译期差异化）下 &.dark 与 &.light 展开出的 CSS 完全一致，主题开关彻底失效，且不像模式 A 那样还有运行期注入可补救。请分别为两套 mixin 填入深色稿 / 浅色稿的真实色值。`,
      hint: {
        suggestion:
          '从 Figma 深色稿取一套色值写进 .theme-dark()，浅色稿取一套写进 .theme-light()；两者不得逐字相同（如文字色 #ffffff vs #333333、主色 #44E4FF vs #0c9d60）',
      },
    });
  }

  if (slotOverrides.length > 0) {
    // 🔴 与其它主题门禁不同，本项设 **BLOCK**：
    //   ① 后果最重 —— 直接让 .theme-dark()/.theme-light() 两套槽位全部作废，
    //      .dark 与 .light 编译结果逐字相同，主题开关彻底失效；
    //   ② 修复最轻 —— 纯删除即可，且可由 less-variable-checker 确定性自愈，
    //      不需要 LLM 重新生成；
    //   ③ 命中面可控 —— 全语料 53/254（20%），远低于 THEME-MIXINS-IDENTICAL 的 41%。
    const nameList = slotOverrides
      .map((h) => String(h.sample).split(':')[0].trim())
      .slice(0, 6)
      .join('、');
    issues.push({
      id: 'THEME-SLOT-LOCAL-OVERRIDE',
      severity: 'BLOCK',
      file: slotOverrides[0].file,
      message: `业务样式里有 ${slotOverrides.length} 处**文件级**槽位变量字面量重声明（${nameList}）→ LESS 变量「首个定义者胜出」，会在 .theme-dark()/.theme-light() 之前抢先定义同名变量，导致两套槽位值被静默忽略 → .dark 与 .light 编译结果逐字相同，主题开关彻底失效。删除这些声明即可恢复（实测：删 2 行就让 9 个槽位恢复生效）。${fmt(slotOverrides)}`,
      hint: {
        suggestion:
          '删除 common.less / .vue <style> 文件顶层的 @color-*: <字面量> 声明；需要该颜色时直接引用槽位变量（值由 .theme-dark()/.theme-light() 提供）。色值只允许出现在 theme-vars.less 的主题 mixin 里',
      },
    });
  }

  if (varNameHits.length > 0) {
    // ⚠️ 2026-09-16：与 THEME-COMMON-COLOR-VAR 同策略**统一 WARN**——
    // 命中的是「变量名错配」这一系统性形态（c-env-monitor 系列实测 7/8 命中），
    // 后果是「主题静默失效」而非编译失败；硬 BLOCK 会让大批任务重试耗尽
    // （参照 mc-max-1788505197306 教训）。
    const nameList = [...new Set(varNameHits.map((v) => v.name))].slice(0, 6).join('、');
    // 🛡️ 2026-09-26：由「统一 WARN」升级为**阈值 BLOCK**（>3 处 BLOCK，≤3 处 WARN）。
    //   前置已治本：0.2 断 hex→var() 源、0.3-a 修 healer 覆盖率（80.9%→3.1%）+ 补框架语义色槽位。
    const varNameSeverity = varNameHits.length <= VAR_NAME_WARN_UP_TO ? 'WARN' : 'BLOCK';
    issues.push({
      id: 'THEME-VAR-NAME-MISMATCH',
      severity: varNameSeverity,
      file: varNameHits[0].file,
      message: `${varNameSeverity === 'WARN' ? `（≤${VAR_NAME_WARN_UP_TO} 处降级 WARN：不阻断本次生成，建议精修期清理）` : ''}业务样式（common.less / .vue <style>）里直引了 ${varNameHits.length} 处 CSS 变量（${nameList}）→ 模式 A 残留。模式 B 下颜色差异化由 .theme-dark()/.theme-light() 两套槽位在**编译期**决定，业务样式应写 @color-xxx 槽位变量；直引 var() 会退化成依赖运行期注入，而平台并不注入这些名字 → fallback 恒生效（且多为写死字面量）→ 切主题零生效。${fmt(varNameHits)}`,
      hint: {
        suggestion:
          '删除业务样式里的 var(--colorX, ...)，改为引用 theme-vars.less 中 .theme-dark()/.theme-light() 已定义的 @color-xxx 槽位变量；var() 只保留在 .common() 的透传映射里（如 @fontSize: var(--fontSize)）',
      },
    });
  }
  if (varSuffixHits.length > 0) {
    // 🔴 设 BLOCK：`var(...)-card` 是**非法 CSS 值**，浏览器忽略整条声明（背景/边框不生效），
    // 且不是「主题不响应」而是「样式完全不生效」。源头（healThemeMixinVarRefs \b bug）已修，
    // 正常情况下不应再产出；若仍命中说明有新的改写器 bug，应 BLOCK 逼出重试/定位。
    issues.push({
      id: 'VAR-SUFFIX-ILLEGAL',
      severity: 'BLOCK',
      file: varSuffixHits[0].file,
      message: `检测到 ${varSuffixHits.length} 处 var() 后拼接非法后缀（如 var(--x, #fff)-card）→ 这是**非法 CSS 值**，浏览器会忽略整条声明（背景/边框不生效），比主题不响应更严重。请改为完整槽位变量引用（如 @color-bg-card）或正确命名（var(--colorBgCard, #fff)）。${fmt(varSuffixHits)}`,
      hint: {
        suggestion:
          '把 var(--color-bg, #fff)-card 改为 @color-bg-card（模式 B 槽位）或 var(--colorBgCard, #fff)；var() 结束后禁止再拼 -xxx 后缀',
      },
    });
  }
  if (slotHits.length > 0) {
    // 🛡️ 2026-09-04 阈值降级：≤SLOT_WARN_UP_TO 处降 WARN（自愈后少量残留不硬失败）
    const severity = slotHits.length <= SLOT_WARN_UP_TO ? 'WARN' : 'BLOCK';
    const thresholdNote =
      severity === 'WARN'
        ? `（≤${SLOT_WARN_UP_TO} 处降级 WARN：建议在精修期改为 @color-xxx 槽位变量引用，不阻断本次生成）`
        : '';
    issues.push({
      id: 'THEME-SLOT-COLOR',
      severity,
      file: slotHits[0].file,
      message: `主题槽位色值被抄写成样式字面量 ${slotHits.length} 处（色值与 theme-vars.less 槽值相同但直接写 #hex）→ 该元素不响应主题。改为槽位变量引用（模式 B）：文字 → @color-text-base；主色/强调 → @color-primary / @color-primary-hover / @color-primary-active；主色浅底 → @color-primary-bg / @color-primary-bg-hover；字号 → @fontSize。${fmt(slotHits)}${thresholdNote}`,
      hint: { suggestion: '抄写槽值=硬编码。颜色一律用 @color-xxx 槽位变量引用（模式 B：值在 .theme-dark()/.theme-light() 各给一份）' },
    });
  }
  if (specialHits.length > 0) {    issues.push({
      id: 'THEME-SPECIAL-COLOR',
      severity: 'WARN',
      file: specialHits[0].file,
      message: `${specialHits.length} 处颜色为设计专色/渐变/SVG 填充字面量（不在主题槽值集合）——图例/功能/图表数据色可保留；UI 文字/背景/边框应就近语义化（主色系→colorPrimary 家族；无槽位时把深浅两值加进 theme-vars.less 主题槽并引用）。${fmt(specialHits)}`,
      hint: { suggestion: '专色可保留（WARN 不阻断）；UI 语义色请变量化' },
    });
  }
  return issues;
}

/**
 * camelCase → kebab-case（colorTextBase → color-text-base）。
 */
function camelToKebab(s) {
  return String(s || '').replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/**
 * 🛡️ 2026-09-17 治本：业务样式 var() 直引自愈（模式 A → 模式 B）。
 *
 * 背景：设备监测「文字白色、设计黑色」实锤——业务样式写了
 * `color: var(--colorTextBase, rgba(230,237,245,1))`，平台并不注入 `--colorTextBase`
 * → 浅色 fallback 恒生效 → 文字与浅色背景融为一体看不清。THEME-VAR-NAME-MISMATCH
 * 门禁只报 WARN 不阻断，var() 残留。
 *
 * 治本：把业务样式里的 `var(--xxx, fallback)` 确定性转成 Less 槽位引用：
 *   - `--colorTextBase` → `@color-text-base`（theme-vars.less 的 .theme-light()/.theme-dark()
 *     已定义对应槽位，模式 B 编译期差异化，深浅主题各有真值）
 *   - 槽位不存在时 → 回退 fallback 字面量（丢弃 var，避免 undefined）
 *
 * 只处理 .vue <style> 与 common.less（theme-vars.less 自身透传 `@x: var(--x)` 保留）。
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {Object} [options] { logger }
 * @returns {Array<{file:string}>} 修复清单
 */
export function healBusinessStyleVarRefs(files, options = {}) {
  const logger = options.logger || { warn() {} };
  const fixed = [];
  if (!files || typeof files !== 'object') return fixed;

  // 1. 收集 theme-vars.less 里已定义的槽位名（@xxx）
  const slotNames = new Set();
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string' || !/theme-vars\.less$/.test(p)) continue;
    for (const m of c.matchAll(/@([a-zA-Z][\w-]*)\s*:/g)) slotNames.add(m[1]);
  }
  if (slotNames.size === 0) return fixed;

  // 2. 扫描业务样式，把颜色 var 直引转成 Less 槽位
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    const isVue = path.endsWith('.vue');
    const isLess = path.endsWith('.less') && !/theme-vars\.less$/.test(path);
    if (!isVue && !isLess) continue;
    const updated = content.replace(
      // 🛡️ fallback 可能含嵌套括号（rgba(230, 237, 245, 1)），专门按颜色字面量形态匹配。
      // 🛡️ 2026-09-26 治本 0.3-a：把「, fallback」改为**可选**——此前正则强制要求 fallback，
      //   导致 **无 fallback 的 `var(--x)` 完全不匹配**（实测残留正是 `var(--fontSize)` /
      //   `var(--colorWhite)` / `var(--colorTextBase)` 这类形态，占残留的大头）。
      /var\(\s*--([a-zA-Z][\w-]*)\s*(?:,\s*((?:rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[^)]+?))\s*)?\)/g,
      (m, varName, fallback) => {
        const kebab = camelToKebab(varName);
        if (slotNames.has(kebab)) return '@' + kebab;
        // 🛡️ 2026-09-26 治本 0.3-a：`.common()` 里的槽名是 **camelCase**（@fontSize / @fontWeightStrong），
        // 而 camelToKebab 会得到 `font-size` → 槽名实为 `fontSize` → 旧逻辑查不到 →
        // **退化成 fallback 字面量**（实测 `var(--fontSize, 14px)` → `14px`，丢掉宿主 font-size 响应式）。
        // 补「原样名」查找（exact-name），命中即转 `@fontSize`（编译期值 = `var(--fontSize)`，响应式保留）。
        if (slotNames.has(varName)) return '@' + varName;
        if (fallback !== undefined && String(fallback).trim()) return String(fallback).trim();
        return m;
      },
    );
    if (updated !== content) {
      files[path] = updated;
      fixed.push({ file: path });
    }
  }
  if (fixed.length > 0) {
    logger.warn('🛡️ 业务样式 var() 直引自愈为 Less 槽位（模式 A→B）', {
      fixedCount: fixed.length,
    });
  }
  return fixed;
}
