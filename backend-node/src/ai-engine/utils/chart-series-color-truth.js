/**
 * 图表系列配色真值落地（确定性后处理，纯函数）。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 病灶（2026-11-15 · mc-max-1794725297064-b532dc69 实锤）━━━━━━━━━━━━━━━━━━━━━━━━━━
 * vision 已经把每张图的系列名与配色写进 `layoutStructure.charts[].seriesColors`
 * （本例流量预测 `2:3565` = `['#388dff','#18c02e']`，实际流量/预测流量），
 * `microcode-engineer` 也把它拼进了 prompt（`颜色=[#388dff, #18c02e]`）。
 * 但 LLM 写出的 SFC 里 `series[]` **一个 color 都没有**：
 *
 *     series: [
 *       { name: '实际流量', type: 'line', lineStyle: { width: 2 }, areaStyle: { opacity: 0.3 }, data: ... },
 *       { name: '预测流量', type: 'line', lineStyle: { width: 2 }, areaStyle: { opacity: 0.3 }, data: ... }
 *     ]
 *
 * ⇒ echarts 回落**默认调色板**（大屏深色主题下是黄/橙系），设计稿的蓝+青双线双填充
 * 变成「黄单线 + 灰填充」。prompt 是建议不是契约，靠 LLM 遵守必然掉。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 判据（零命名、零窗口，全部来自真值）━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ① 文件必须含 `echarts.init(`（图表组件）；
 * ② 从 `series: [ … ]`（括号配对，非贪婪会截断）内抓 `name:` 得到**组件实际系列名**；
 * ③ 在 `charts[]` 里找「系列名集合完全一致（长度相同且逐个命中）」的条目 —— 名称不符
 *    一律不注入（防把 A 图的配色贴到 B 图上）；多个命中取第一个有 `seriesColors` 的；
 * ④ `seriesColors.length` 必须 ≥ 系列数（少了不猜、不截断）；
 * ⑤ **已有配色一律不动**：模板里出现顶层 `color: [` 数组，或任一 series 项内显式
 *    `itemStyle`/`color` ⇒ 视为作者已表达，直接跳过（幂等 + 尊重显式真值）。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 输出形态 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 在 `series:` 之前插入同层 `color: ['#388dff', '#18c02e'],`，缩进跟随 `series` 所在行。
 * 用 echarts 原生 `option.color` 而不是逐个 series 打 `itemStyle.color`：
 *  · 一处表达全部系列，顺序语义与 echarts 调色板一致；
 *  · 不打断 series 项内其它配置（lineStyle/areaStyle/data）；
 *  · 系列数变化时只需改一处。
 *
 * fail-open：任何一步不满足 ⇒ 原样返回 `applied:false` + `reason`，绝不猜色。
 *
 * @module utils/chart-series-color-truth
 */

/** 只认 `#rgb` / `#rrggbb` / `#rrggbbaa`（真值来源全是 hex，别的形态不猜） */
const HEX_RX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * 找 `key: [` 的配对右括号（字符串感知：跳过 `'`/`"`/`` ` `` 内的括号）。
 * 非贪婪正则会截断在 series 项内的 `]`（data 数组、嵌套对象），实锤会写坏 SFC。
 *
 * @param {string} src
 * @param {number} openIdx `[` 的下标
 * @returns {number} `]` 的下标；配对不上返回 -1
 */
function matchBracket(src, openIdx) {
  let depth = 0;
  let quote = '';
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 定位 `series: [ … ]` 块。
 *
 * @param {string} code
 * @returns {{start:number,end:number,text:string,indent:string}|null}
 *   `start` = `series` 关键字下标；`end` = `]` 之后；`indent` = 该行前导空白
 */
export function findSeriesBlock(code) {
  if (typeof code !== 'string' || !code) return null;
  const rx = /\bseries\s*:\s*\[/;
  const m = rx.exec(code);
  if (!m) return null;
  const openIdx = code.indexOf('[', m.index);
  if (openIdx < 0) return null;
  const closeIdx = matchBracket(code, openIdx);
  if (closeIdx < 0) return null;
  const lineStart = code.lastIndexOf('\n', m.index) + 1;
  const lead = code.slice(lineStart, m.index);
  const indent = /^[ \t]*$/.test(lead) ? lead : '';
  return { start: m.index, end: closeIdx + 1, text: code.slice(openIdx, closeIdx + 1), indent };
}

/**
 * 从 series 块内抓系列名（按出现顺序，去重）。
 *
 * @param {string} blockText `[ … ]` 原文
 * @returns {string[]}
 */
export function extractSeriesNames(blockText) {
  if (typeof blockText !== 'string') return [];
  const out = [];
  const rx = /\bname\s*:\s*(['"`])([^'"`]*)\1/g;
  let m;
  while ((m = rx.exec(blockText)) !== null) {
    const name = String(m[2] || '').trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** series 块内是否已有任何显式配色（顶层 color 数组 / itemStyle / 单项 color） */
function hasExplicitColor(code, seriesStart) {
  const head = code.slice(0, seriesStart);
  if (/\bcolor\s*:\s*\[/.test(head)) return true;
  const block = findSeriesBlock(code);
  if (!block) return false;
  const inner = block.text;
  if (/\bitemStyle\s*:/.test(inner)) return true;
  // `color:` 出现在 series 块内（单项配色）也算显式
  if (/\bcolor\s*:/.test(inner)) return true;
  return false;
}

/**
 * 把 `charts[].seriesColors` 落到 `option.color`。
 *
 * @param {string} code 单个 .vue 文件全文
 * @param {{charts?: Array<{series?: string[], seriesColors?: string[], section?: string, type?: string}>}} opts
 * @returns {{code:string, applied:boolean, reason:string, colors:string[], series:string[], chartSection:string}}
 */
export function injectSeriesColorTruth(code, { charts } = {}) {
  const base = {
    code,
    applied: false,
    reason: '',
    colors: [],
    series: [],
    chartSection: '',
  };
  if (typeof code !== 'string' || !code) return { ...base, reason: 'no-code' };
  if (!code.includes('echarts.init(')) return { ...base, reason: 'not-a-chart' };

  const block = findSeriesBlock(code);
  if (!block) return { ...base, reason: 'no-series-block' };

  const names = extractSeriesNames(block.text);
  if (names.length === 0) return { ...base, reason: 'no-series-names' };

  if (hasExplicitColor(code, block.start)) {
    return { ...base, reason: 'already-colored', series: names };
  }

  const list = Array.isArray(charts) ? charts : [];
  const hit = list.find((c) => {
    const cs = Array.isArray(c?.series) ? c.series.map((s) => String(s).trim()) : [];
    const colors = Array.isArray(c?.seriesColors) ? c.seriesColors : [];
    if (cs.length !== names.length) return false;
    if (!names.every((n) => cs.includes(n))) return false;
    return colors.length >= names.length;
  });
  if (!hit) return { ...base, reason: 'no-matching-chart', series: names };

  const colors = hit.seriesColors
    .map((c) => String(c || '').trim())
    .filter((c) => HEX_RX.test(c))
    .slice(0, Math.max(names.length, 1));
  if (colors.length < names.length) return { ...base, reason: 'colors-not-hex', series: names };

  const rule = `color: [${colors.map((c) => `'${c}'`).join(', ')}],`;
  const indent = block.indent || '';
  const insertAt = code.lastIndexOf('\n', block.start) + 1 || block.start;
  const lineHasContent = code
    .slice(insertAt, block.start)
    .replace(/[ \t]/g, '').length > 0;
  // `series:` 与别的内容同行（`{ series: [`）⇒ 原地插在 `series` 前，不新建行
  const next = lineHasContent
    ? `${code.slice(0, block.start)}${rule} ${code.slice(block.start)}`
    : `${code.slice(0, insertAt)}${indent}${rule}\n${code.slice(insertAt)}`;

  return {
    code: next,
    applied: true,
    reason: 'injected',
    colors,
    series: names,
    chartSection: String(hit.section || ''),
  };
}
