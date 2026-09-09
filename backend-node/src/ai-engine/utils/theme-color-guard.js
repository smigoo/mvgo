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

const FRAMEWORK_PRESET_NAMES = [
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

/** 颜色呈现属性（值必须主题变量化；兼容 `{ color: #x; }` 单行规则体） */
const COLOR_PROP_RE =
  /(^|[;{])\s*(?:color|background(?:-color)?|border-(?:top|right|bottom|left)-color|outline(?:-color)?|caret-color|accent-color)\s*:\s*([^;]*)/gi;

/** SVG 呈现属性（WARN 级） */
const SVG_PAINT_PROP_RE = /(^|[;{])\s*(?:fill|stroke)\s*:\s*([^;]*)/gi;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const SAMPLE_LIMIT = 3;

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
 * 从主题槽位文件提取全部 hex 槽值；文件缺失或无 hex → null（调用方据此降级）。
 * @returns {Set<string>|null}
 */
function collectSlotHexSet(files) {
  const slotFile = (files || []).find(
    (f) => f && /themes\/theme-vars\.less$/.test(String(f.path || '')) && f.content,
  );
  if (!slotFile) return null;
  const hexes = String(slotFile.content).match(HEX_RE);
  if (!hexes || hexes.length === 0) return null;
  return new Set(hexes.map((h) => h.toLowerCase()));
}

/** 行内注释剥离：/* … *\/ 与 // 之后内容不影响判定 */
function stripComments(line) {
  return String(line).replace(/\/\*[\s\S]*?\*\//g, '').split('//')[0];
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
        if (hexes.length === 0) {
          // 纯 rgba()/gradient() 值或空 → WARN 提示（半透明/渐变装饰色不精确比对）
          if (/(?:gradient|rgba?|hsla?\()/i.test(value)) {
            specialHits.push({ file: path, line: lineNo, literal: value.slice(0, 60), sample: rawLine.trim().slice(0, 90) });
          }
          continue;
        }
        for (const hx of hexes) {
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
    if (/\/themes\//.test(path) || /\/config\//.test(path)) continue;
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
  if (slotHits.length > 0) {
    // 🛡️ 2026-09-04 阈值降级：≤SLOT_WARN_UP_TO 处降 WARN（自愈后少量残留不硬失败）
    const severity = slotHits.length <= SLOT_WARN_UP_TO ? 'WARN' : 'BLOCK';
    const thresholdNote =
      severity === 'WARN'
        ? `（≤${SLOT_WARN_UP_TO} 处降级 WARN：建议在精修期改为 var(--colorX, 槽值) 引用，不阻断本次生成）`
        : '';
    issues.push({
      id: 'THEME-SLOT-COLOR',
      severity,
      file: slotHits[0].file,
      message: `主题槽位色值被抄写成样式字面量 ${slotHits.length} 处（色值与 theme-vars.less 槽值相同但直接写 #hex）→ 该元素不响应主题/颜色变量。改为变量引用：文字 → var(--colorTextBase, 槽值)；主色/强调 → var(--colorPrimary / colorPrimaryHover / colorPrimaryActive, 槽值)；主色浅底 → var(--colorPrimaryBg / colorPrimaryBgHover, 槽值)；字号 → var(--fontSize)。${fmt(slotHits)}${thresholdNote}`,
      hint: { suggestion: '抄写槽值=硬编码。颜色一律 var(--colorX, 槽位默认值) 引用' },
    });
  }
  if (specialHits.length > 0) {
    issues.push({
      id: 'THEME-SPECIAL-COLOR',
      severity: 'WARN',
      file: specialHits[0].file,
      message: `${specialHits.length} 处颜色为设计专色/渐变/SVG 填充字面量（不在主题槽值集合）——图例/功能/图表数据色可保留；UI 文字/背景/边框应就近语义化（主色系→colorPrimary 家族；无槽位时把深浅两值加进 theme-vars.less 主题槽并引用）。${fmt(specialHits)}`,
      hint: { suggestion: '专色可保留（WARN 不阻断）；UI 语义色请变量化' },
    });
  }
  return issues;
}
