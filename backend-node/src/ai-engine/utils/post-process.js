/**
 * 后处理纯函数模块
 * 用于 TDD 测试，不依赖 MicrocodeEngineer 类的复杂依赖链
 */

import { inferBackgroundStyle } from './background-size-inference.js';

const COMPACT_CHART_RE = /(?:donut|ring|pie|gauge|radar|mini|small|compact|spark|仪表|环形|环图|小图)/i;

/**
 * 按图表 class / 上下文语义推导兜底高度。
 * - 主图（折线/柱状/面积/趋势大图）：160px
 * - 紧凑图（环形/仪表/卡片内嵌小图）：100px
 *
 * 🛡️ #577（2026-09-08）收敛后处理误伤：此前所有图表统一注入 160px，
 * 会把环形图/仪表盘/卡片内嵌小图撑裂。现在按 class / chartType / chartRole 分级。
 * 注意：这里只是缺失 min-height 时的兜底；真实比例优先由 Figma section flexGrow 决定。
 */
export function inferChartMinHeight(className = '', styles = '', options = {}) {
  const haystack = `${className} ${styles} ${options.chartType || ''} ${options.chartRole || ''}`;
  if (COMPACT_CHART_RE.test(haystack)) return 100;
  return 160;
}

/**
 * 🛡️ min-height 保护判据（2026-09-15 单一事实源）：
 * `min-height: 0` / `0px` / `auto` **不算**保护 —— LLM 按 chart-standards 示例惯写
 * `min-width: 0; min-height: 0`，旧守卫 `/min-height/` 把它当「已保护」→ 跳过注入，
 * 且后置块级联反杀兜底值（实锤 mc-1789446004258-677a6725 图表不显示）。
 *
 * ⚠️ 必须用「取值后归一比较」而非 `min-height\s*:\s*(?!0...)` 这类 lookahead 正则：
 * 后者可被 `\s*` 回溯绕过（`\s*` 退成 0 字宽后 lookahead 停在空格上即通过）→ 仍判成已保护。
 */
const CHART_MH_UNPROTECTED_VALUES = new Set([
  '0',
  '0px',
  'auto',
  'initial',
  'unset',
  'none',
]);

export function isChartMinHeightProtected(body) {
  if (!body || typeof body !== 'string') return false;
  const m = /min-height\s*:\s*([^;}]+)/i.exec(body);
  if (!m) return false;
  const v = m[1]
    .trim()
    .toLowerCase()
    .replace(/\s*!important\s*$/, '');
  return !CHART_MH_UNPROTECTED_VALUES.has(v);
}

// ⚠️ 交替顺序必须长值优先（0px 先于 0），否则 `min-height: 0px` 只吃掉 `0` 残留 `px`
export const CHART_MH_ZERO_DECL_RE =
  /(^|;)\s*min-height\s*:\s*(?:0px|0|auto|initial|unset|none)\s*;?/i;

/**
 * 剥掉指定 class 的所有块内 `min-height: 0/0px/auto` 声明（防止后置块级联反杀）。
 * 用于共享表（common.less）与 SFC 双端收口。
 */
export function stripZeroMinHeightForClass(content, chartCls) {
  if (!content || typeof content !== 'string') return content;
  if (!content.includes(`.${chartCls}`)) return content;
  return content.replace(
    new RegExp(`(\\.${chartCls}\\s*\\{)([^}]*)\\}`, 'g'),
    (m, head, body) => {
      const nb = body.replace(CHART_MH_ZERO_DECL_RE, (mm, sep) =>
        sep === ';' ? ';' : '',
      );
      return nb === body ? m : `${head}${nb}}`;
    },
  );
}

/**
 * 给指定 class 的**全部**样式块注入分级 min-height（缺失或值为 0 时）。
 * - 已有非零 min-height → 原样保留（尊重 Figma 真实尺寸）
 * - 值为 0/0px/auto → 视为未保护，剥掉 0 再补兜底值
 * - global 扫描：同一 class 出现多个块时全部收口，避免后置块反杀
 * @returns {{ code: string, injectedCount: number }}
 */
export function injectChartMinHeightIntoClass(code, chartCls, minHeight) {
  if (!code || typeof code !== 'string' || !chartCls) {
    return { code, injectedCount: 0 };
  }
  let injectedCount = 0;
  const out = code.replace(
    new RegExp(`(\\.${chartCls}\\s*\\{)([^}]*)`, 'g'),
    (m, head, body) => {
      if (isChartMinHeightProtected(body)) return m;
      injectedCount += 1;
      const nb = body.replace(CHART_MH_ZERO_DECL_RE, (mm, sep) =>
        sep === ';' ? ';' : '',
      );
      // 块内已有标记注释（如历史空块残留 `{/* 🎯 防挤压... */}`）→ 不重复追加，减噪
      const marker = nb.includes('防挤压')
        ? ''
        : ' /* 🎯 防挤压：echarts 容器最小高度（主图160/紧凑图100） */';
      return `${head}${nb.replace(/\s*$/, '')}\n  min-height: ${minHeight}px;${marker}\n`;
    },
  );
  return { code: out, injectedCount };
}

/**
 * class 规则块完全缺失时，在 <style> 段 @import 之后创建规则块并注入 min-height。
 * （实锤环境监测 ChartSection：.chart-container 在 style 段无任何规则 → 容器塌陷）
 */
export function createChartClassBlockIfAbsent(code, chartCls, minHeight) {
  if (!code || typeof code !== 'string' || !chartCls) return code;
  return code.replace(
    /(<style[^>]*>[\s\S]*?)(@import[^;]+;)/,
    (m2, pre, imp) =>
      `${pre}${imp}\n\n.${chartCls} {\n  min-height: ${minHeight}px; /* 🎯 防挤压：echarts 容器最小高度（主图160/紧凑图100） */\n}\n`,
  );
}

/**
 * T03: 图表容器 min-height 注入
 * 检测图表容器（echarts/chart-），如果没有 min-height 则注入分级兜底高度。
 *
 * 🛡️ L3 / P0-4（2026-09-07）口径三合一 + #577 分级（2026-09-08）：
 * 主图 160px / 紧凑图（环形/仪表/小图）100px；已有**非零** min-height 尊重不覆盖。
 */
export function injectChartMinHeight(code, options = {}) {
  if (!code || typeof code !== 'string') return code;

  // 检测是否包含图表相关元素（动态前缀匹配：.c-xxx-yyy 或 .chart-）
  const hasChart = /echarts|chart-|\.c-[\w-]+-[\w-]*chart[\w-]*/i.test(code);
  if (!hasChart) return code;

  const chartContainerRegex =
    /(\.c-[\w-]+-[\w-]*chart[\w-]*|\.chart-[\w-]+)\s*\{([^}]*)\}/gi;

  // 🛡️ R4-a 非容器后缀黑名单（2026-09-15，c-traffic-monitor 实锤）：
  // 这些是图表「标题/图例/图标/section 根」等非 echarts 挂载容器，此前 `chart[\w-]*`
  // 全量匹配 → 误注入 min-height:160px，把 chart-title/chart-legend/chart-bridge 等
  // 撑到 160px 撑裂布局（真机「样式几乎看不到」根因之一）。
  // 容器词（container/body/wrapper/root/box/area/canvas/panel/wrap/holder/main）、
  // 数字编号（chart1/chart2）、chart 结尾（.forecast-chart）均不在黑名单 → 照常注入。
  const CHART_NON_CONTAINER_RE =
    /-(?:title|legend|icon|text|header|bridge|section|forecast|tunnel|item|dot|label|name|value|stat)(?:-|$)/i;

  // 收集候选 class（去重）后统一走单一事实源注入
  const seen = new Map();
  const candidates = [];
  let m;
  while ((m = chartContainerRegex.exec(code)) !== null) {
    // ⚠️ 捕获组 1 带前导点号（正则以 \. 开头），下游 injectChartMinHeightIntoClass
    // 会自行拼 `\.`，必须先剥点，否则拼成 `\..c-xxx` 永不匹配（2026-09-15 回归实锤）。
    const className = m[1].replace(/^\./, '');
    if (CHART_NON_CONTAINER_RE.test(className)) continue;
    if (seen.has(className)) continue;
    seen.set(className, m[2] || '');
    candidates.push(className);
  }

  for (const className of candidates) {
    const height = inferChartMinHeight(className, seen.get(className) || '', options);
    const { code: patched, injectedCount } = injectChartMinHeightIntoClass(
      code,
      className,
      height,
    );
    if (injectedCount > 0) code = patched;
  }

  return code;
}

/**
 * T04: 背景图去重
 * 如果同一背景图在代码中出现多次，只保留第一次
 */
export function deduplicateBackgroundImages(code) {
  if (!code || typeof code !== 'string') return code;

  // 提取所有背景图引用
  const bgImages = code.match(/url\(['"]?[^'")\s]+['"]?\)/g) || [];
  if (bgImages.length === 0) return code;

  // 统计每个图片引用次数
  const imageCount = {};
  bgImages.forEach((img) => {
    imageCount[img] = (imageCount[img] || 0) + 1;
  });

  // 找出重复的图片
  const duplicates = Object.entries(imageCount).filter(
    ([_, count]) => count > 1,
  );
  if (duplicates.length === 0) return code;

  // 对重复的图片，只保留第一次出现
  duplicates.forEach(([img, _]) => {
    let firstFound = false;
    code = code.replace(
      new RegExp(
        `background[^;}\\n]*${img.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^;}\\n]*;?`,
        'g',
      ),
      (match) => {
        if (!firstFound) {
          firstFound = true;
          return match;
        }
        return '';
      },
    );
  });

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// T05: bg-size 修正（治标 Pass 1）
// 把代码里硬编码的 backgroundSize 'Xpx Ypx' 统一改为 'cover'。
// 根因：模型常从 Figma 节点 BBox（可能经过 transform/DPR 缩放/裁剪）取尺寸，
// 导致 backgroundSize 与图片真实像素或容器渲染尺寸不匹配（如 bg-7890.png 实际
// 590×54 被写成 295×27，显示为细线而非完整渐变背景）。
// 治本策略：装饰/容器型背景图语义上应"铺满容器"，'cover' 是最稳健的尺寸表达。
// 已经使用 cover/contain/百分比/auto 的不会被匹配，安全。
// ─────────────────────────────────────────────────────────────────────────────
export function fixBackgroundImageSize(code) {
  if (!code || typeof code !== 'string') return code;

  // 匹配两种语法：
  // 1. inline style 驼峰 backgroundSize: 'Xpx Ypx'（Vue :style 绑定）
  // 2. CSS/LESS 连字符 background-size: Xpx Ypx（common.less 等样式文件）
  // 修复后统一为 'cover'（背景铺满容器，不再依赖硬编码 px 尺寸）。
  const bgSizeRegex = /background-?[Ss]ize:\s*['"]?(\d+)px\s+(\d+)px['"]?/g;
  let fixedCount = 0;

  code = code.replace(bgSizeRegex, (match) => {
    fixedCount++;
    // 保留原语法风格：驼峰或连字符（Vue inline style 用驼峰，CSS 用连字符）
    const isCamel = /backgroundSize/.test(match);
    return isCamel ? `backgroundSize: 'cover'` : `background-size: cover`;
  });

  if (fixedCount > 0) {
    console.info(
      `[T05 bg-size 修正] 已将 ${fixedCount} 处硬编码 px 尺寸替换为 'cover'`,
    );
  }

  return code;
}

/**
 * 🛡️ S6（2026-09-16 · c-env-monitor-5ed7a5f8 实锤）：背景 `:style` 补全自愈。
 *
 * 根因：LLM 手写的背景 `:style` 常**只有 `backgroundImage`**，缺 `backgroundSize`/`backgroundRepeat`/
 * `backgroundPosition` → 背景图按**原尺寸平铺重复**、位置错（用户报「背景重复了 + 位置大小不对」）。
 * 对照：系统注入的背景 `:style` 是完整的（`backgroundSize: '100% 100%', backgroundPosition: '0px 0px',
 * backgroundRepeat: 'no-repeat'`）。
 *
 * `fixBackgroundImageSize`（上方）只管「已是 `Xpx Ypx` → `cover`」，**完全不管「缺失」**——本函数补这个缺口。
 * 只对「同一对象字面量内缺 size/repeat/position」的 backgroundImage 补默认值，绝不覆盖已有；幂等。
 * 逐字符扫描跳过字符串/模板字符串（`` `url(${bg1})` `` 里的 `${}` 不误判为对象边界）。
 *
 * @param {string} content .vue 文件内容
 * @returns {string} 补全后的内容（无改动时原样返回，引用相等）
 */
export function ensureBackgroundStyleComplete(content) {
  if (typeof content !== 'string' || !content) return content;
  if (!/backgroundImage\s*:/.test(content)) return content;

  const edits = [];
  const bgRe = /backgroundImage\s*:/g;
  let m;
  while ((m = bgRe.exec(content)) !== null) {
    const valStart = m.index + m[0].length;
    // ① 找 backgroundImage 值结束（下一个 , 或 }），跳过字符串/模板字符串
    let valEnd = -1;
    let inStr = null;
    for (let i = valStart; i < content.length; i++) {
      const ch = content[i];
      if (inStr) {
        if (ch === inStr && content[i - 1] !== '\\') inStr = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
      } else if (ch === ',' || ch === '}') {
        valEnd = i;
        break;
      }
    }
    if (valEnd < 0) continue;
    // ② 找所属对象开 `{`（向前，跨 `}`/`=` 即停）
    let open = -1;
    for (let j = m.index; j >= 0; j--) {
      if (content[j] === '{') { open = j; break; }
      if (content[j] === '}' || content[j] === '=') break;
    }
    if (open < 0) continue;
    // ③ 找匹配的 `}`（平衡括号，跳过字符串/模板字符串）
    let close = -1;
    let depth = 0;
    inStr = null;
    for (let j = open; j < content.length; j++) {
      const ch = content[j];
      if (inStr) {
        if (ch === inStr && content[j - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close < 0) continue;
    // ④ 检查「整个对象」内是否已有 size/repeat/position（不是只到 backgroundImage 值的逗号）
    const objSlice = content.slice(open, close);
    // 🛡️ 使用默认推断值（资源映射表暂未实现）
    const inferred = inferBackgroundStyle({});
    const patches = [];
    if (!/backgroundSize\s*:/.test(objSlice)) patches.push(`backgroundSize: '${inferred.size}'`);
    if (!/backgroundRepeat\s*:/.test(objSlice)) patches.push(`backgroundRepeat: '${inferred.repeat}'`);
    if (!/backgroundPosition\s*:/.test(objSlice)) patches.push(`backgroundPosition: '${inferred.position}'`);
    if (patches.length === 0) continue;
    edits.push({ at: valEnd, text: ', ' + patches.join(', ') });
  }

  if (edits.length === 0) return content;
  // 从后往前插入（避免位置偏移）
  edits.sort((a, b) => b.at - a.at);
  let out = content;
  for (const e of edits) {
    out = out.slice(0, e.at) + e.text + out.slice(e.at);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// T06: 容器尺寸校验 + 确定性自动修正（治标 Pass 2）
// 两阶段：
//   阶段① 自动修正：子容器 width 和 height **同时**等于根容器 → BBox fallback →
//           改为 auto（让 flex 布局自然收缩，而非错误固定整组件尺寸）。
//           三重保险防误伤根容器：
//             a. class 名不含根容器特征（root/container/panel/wrapper/content/main/page）
//             b. 块内是 flex/grid 布局（布局容器尺寸应由内容决定，固定尺寸有害）
//             c. width 和 height 都恰好等于根容器（±1px 四舍五入容差）
//   阶段② 告警：修正后仍存在的 size >= 根容器 的越界声明（如非 flex 块的越界）。
// ─────────────────────────────────────────────────────────────────────────────
export function validateContainerSize(code, rootWidth, rootHeight) {
  if (!code || typeof code !== 'string')
    return { code, warnings: [], fixed: 0 };
  if (!rootWidth || !rootHeight) return { code, warnings: [], fixed: 0 };

  const warnings = [];
  let fixed = 0;
  let result = code;

  // ── 阶段① 确定性自动修正（BBox fallback → auto）──
  const blockRegex = /\.([\w-]+)\s*\{([^{}]*)\}/g;
  let m;
  while ((m = blockRegex.exec(result)) !== null) {
    const className = m[1];
    const body = m[2];
    // 保险 a：跳过根容器特征 class
    if (/root|container|panel|wrapper|content|main|page/i.test(className))
      continue;
    // 保险 b：必须 flex/grid 布局容器
    if (!/display:\s*(flex|grid)/.test(body)) continue;
    // 保险 c：width 和 height 都恰好等于根容器
    const wm = body.match(/(?<![\w-])width:\s*(\d+)px/);
    const hm = body.match(/(?<![\w-])height:\s*(\d+)px/);
    if (!wm || !hm) continue;
    const w = parseInt(wm[1], 10);
    const h = parseInt(hm[1], 10);
    if (Math.abs(w - rootWidth) <= 1 && Math.abs(h - rootHeight) <= 1) {
      const fixedBody = body
        .replace(/(?<![\w-])width:\s*\d+px/, 'width: auto')
        .replace(/(?<![\w-])height:\s*\d+px/, 'height: auto');
      result = result.replace(m[0], `.${className} {${fixedBody}}`);
      fixed++;
      warnings.push(
        `✅ 已修正 BBox fallback：.${className} 的 width/height ${rootWidth}×${rootHeight} → auto（子容器误继承根节点尺寸）`,
      );
    }
  }

  // ── 阶段② 告警（修正后剩余的越界）──
  const seen = new Set();
  const sizeRegex = /(?<![\w-])(width|height):\s*['"]?(\d+)px['"]?/gi;
  let match;
  while ((match = sizeRegex.exec(result)) !== null) {
    const prop = match[1].toLowerCase();
    const size = parseInt(match[2], 10);
    const rootSize = prop === 'width' ? rootWidth : rootHeight;
    const key = `${match.index}:${size}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 阈值用 1.0（不含误差）：子容器 == 根容器是 BBox fallback 到根节点的典型特征
    if (size >= rootSize && size > 20) {
      warnings.push(
        `⚠️ 子容器 ${prop} (${size}px) ${size === rootSize ? '等于' : '超过'}根容器 ${rootSize}px，可能是 BBox fallback 到根节点导致`,
      );
    }
  }

  // ── 阶段③ min-width clamp（P1-2，2026-08-30）──
  // 固定 min-width 超过根容器宽度且无滚动意图（overflow 未设 auto/scroll）→ clamp 到根宽度。
  // 实锤（mc-max-1788003760938）：双卡并排 min-width 240×2 + gap 16 = 496 > 可用 388 溢出。
  {
    const blockRe = /\.([\w-]+)\s*\{([^{}]*)\}/g;
    let bm;
    while ((bm = blockRe.exec(result)) !== null) {
      const className = bm[1];
      const body = bm[2];
      const mw = body.match(/(?<![\w-])min-width:\s*(\d+)px/);
      if (!mw) continue;
      const mwVal = parseInt(mw[1], 10);
      if (mwVal <= rootWidth) continue;
      // 有滚动意图（overflow auto/scroll）→ 不 clamp，保留横向滚动
      if (/overflow(?:-x)?\s*:\s*(auto|scroll)/.test(body)) continue;
      const clamped = Math.round(rootWidth);
      const fixedBody = body.replace(
        /(?<![\w-])min-width:\s*\d+px/,
        `min-width: ${clamped}px`,
      );
      result = result.replace(bm[0], `.${className} {${fixedBody}}`);
      fixed++;
      warnings.push(
        `✅ 已 clamp 越界 min-width：.${className} 的 min-width ${mwVal}px → ${clamped}px（超过根容器宽度 ${rootWidth}px 且无滚动意图）`,
      );
    }
  }

  // ── 阶段④ align-items:center 越界 height → auto（P1-1 补充，2026-08-30）──
  // align-items:center 会把内容垂直居中到固定 height 的中点；若 height 接近/超过根容器高度
  // （套用了根尺寸或更大），内容会被顶出可视区（mc-max-1788003760938 header-stats 425px → 文字居中 y≈212，
  // 而 base-panel header 仅 38px，完全不可见）。无滚动意图时降级 height:auto，让内容按自然高度排布。
  {
    const blockRe = /\.([\w-]+)\s*\{([^{}]*)\}/g;
    let bm;
    while ((bm = blockRe.exec(result)) !== null) {
      const className = bm[1];
      const body = bm[2];
      // 跳过根容器特征 class（根容器自身 height 可等于根高度）
      if (/root|container|panel|wrapper|content|main|page/i.test(className))
        continue;
      if (!/display:\s*flex/.test(body)) continue;
      if (!/align-items:\s*center/.test(body)) continue;
      const hm = body.match(/(?<![\w-])height:\s*(\d+)px/);
      if (!hm) continue;
      const h = parseInt(hm[1], 10);
      // 越界判定：height 接近/超过根容器高度（≥80% 根高，避免精确相等边界漏判）
      if (h < rootHeight * 0.8) continue;
      // 有滚动意图（overflow auto/scroll）→ 保留固定高度
      if (/overflow(?:-y)?\s*:\s*(auto|scroll)/.test(body)) continue;
      const fixedBody = body.replace(
        /(?<![\w-])height:\s*\d+px/,
        'height: auto',
      );
      result = result.replace(bm[0], `.${className} {${fixedBody}}`);
      fixed++;
      warnings.push(
        `✅ 已降级越界 height：.${className} 的 height ${h}px → auto（≥根高度 ${rootHeight}px 且 align-items:center 会把内容居中顶出可视区）`,
      );
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `[T06 容器尺寸校验] 发现 ${warnings.length} 个异常（其中 ${fixed} 个已自动修正）:`,
    );
    warnings.forEach((w) => console.warn(`  ${w}`));
  }

  return { code: result, warnings, fixed };
}

// ─────────────────────────────────────────────────────────────────────────────
// T07: 资源引用校验（治标 Pass 3）
// 检查同一个背景图是否被多个容器复用。
// 如果 bg-xxx.png 在 tabs-container 和 chart-section 都出现，说明资源分发错误。
// ─────────────────────────────────────────────────────────────────────────────
export function validateResourceUsage(code) {
  if (!code || typeof code !== 'string') return { code, warnings: [] };

  // 提取所有 url(xxx.png) 引用，按文件名统计出现次数
  const usageMap = {};
  const urlRegex = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
  let match;
  while ((match = urlRegex.exec(code)) !== null) {
    const url = match[1];
    const fileName = url.split('/').pop(); // 取文件名
    if (!usageMap[fileName]) {
      usageMap[fileName] = { count: 0, contexts: [] };
    }
    usageMap[fileName].count++;
    // 提取上下文（前后 100 字符）
    const start = Math.max(0, match.index - 50);
    const end = Math.min(code.length, match.index + match[0].length + 50);
    usageMap[fileName].contexts.push(
      code.slice(start, end).replace(/\s+/g, ' ').trim(),
    );
  }

  const warnings = [];
  for (const [fileName, info] of Object.entries(usageMap)) {
    if (info.count > 1) {
      warnings.push(
        `⚠️ 资源 ${fileName} 被引用 ${info.count} 次，可能是资源分发错误（应只用于一个容器）`,
      );
    }
  }

  if (warnings.length > 0) {
    console.warn(`[T07 资源引用校验] 发现 ${warnings.length} 个异常:`);
    warnings.forEach((w) => console.warn(`  ${w}`));
  }

  return { code, warnings };
}

/**
 * 🎯 Phase 2 方案7: 自动修复子组件尺寸约束
 * 为子组件根元素自动注入 width: 100%; height: 100%;
 * 移除子组件根元素的 margin 属性
 *
 * @param {string} vueContent - 子组件 .vue 文件内容
 * @returns {string} 修复后的内容
 */
export function autoFixSubComponentSize(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent;

  // 提取 <style> 块
  const styleMatch = vueContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) return vueContent;

  let styleContent = styleMatch[1];

  // 提取根元素 class（通常是第一个 class）
  const templateMatch = vueContent.match(
    /<template>[\s\S]*?class=["']([^"']+)["']/i,
  );
  if (!templateMatch) return vueContent;

  const rootClass = templateMatch[1].split(/\s+/)[0];
  if (!rootClass) return vueContent;

  // 查找根 class 的样式块
  const rootClassEscaped = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootClassRegex = new RegExp(
    `(\\.${rootClassEscaped}\\s*\\{)([^}]*)(\\})`,
    'i',
  );

  const rootClassMatch = styleContent.match(rootClassRegex);
  if (!rootClassMatch) return vueContent;

  let rootStyles = rootClassMatch[2];
  let modified = false;

  // 1. 移除 margin 属性
  if (/margin\s*:/i.test(rootStyles)) {
    rootStyles = rootStyles.replace(/\s*margin[^;]*;/gi, '');
    modified = true;
  }

  // 2. 注入 width: 100%; height: 100%; 如果不存在
  if (!/width\s*:/i.test(rootStyles)) {
    rootStyles = '  width: 100%;\n' + rootStyles;
    modified = true;
  }
  if (!/height\s*:/i.test(rootStyles)) {
    rootStyles = '  height: 100%;\n' + rootStyles;
    modified = true;
  }

  if (!modified) return vueContent;

  // 重新组装根 class 样式
  const newRootClass = `${rootClassMatch[1]}\n${rootStyles.trim()}\n${rootClassMatch[3]}`;
  styleContent = styleContent.replace(rootClassRegex, newRootClass);

  // 替换原有 <style> 块
  return vueContent.replace(
    /<style[^>]*>[\s\S]*?<\/style>/i,
    `<style${styleMatch[0].match(/<style([^>]*)>/i)[1]}>${styleContent}</style>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// P3': 伪造 series 阈值线检测与改写
// 检测 LLM 伪造的阈值线 series（name 含"阈值/平均/预警" + data 恒值），
// 改写为 echarts 原生 markLine。
// ─────────────────────────────────────────────────────────────────────────────
export function rewriteFakeThresholdSeries(code) {
  if (!code || typeof code !== 'string') return code;

  // 阈值类名称关键词
  const THRESHOLD_KEYWORDS = [
    '阈值',
    '平均',
    '预警',
    '警戒',
    '临界',
    '标准线',
    '目标线',
  ];

  // 提取 series 数组内容（匹配最外层 series: [...] 结构）
  const seriesArrayMatch = code.match(
    /series\s*:\s*\[([\s\S]*?)\]\s*(?=,\s*\w|\}\s*[,;]?\s*$)/m,
  );
  if (!seriesArrayMatch) return code;

  const seriesContent = seriesArrayMatch[1];

  // 提取每个 series 对象（简化版正则，处理 name/type/data 结构）
  const seriesObjects = [];
  const seriesRegex =
    /\{\s*name\s*:\s*['"]([^'"]+)['"][\s\S]*?type\s*:\s*['"]([^'"]+)['"][\s\S]*?data\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/g;
  let match;

  while ((match = seriesRegex.exec(seriesContent)) !== null) {
    const name = match[1];
    const dataStr = match[3];

    // 解析 data 数组
    const dataValues = dataStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !isNaN(Number(s)))
      .map(Number);

    // 检测是否为恒值数组（所有值相同）
    const isConstant =
      dataValues.length > 0 && dataValues.every((v) => v === dataValues[0]);

    // 检测名称是否包含阈值关键词
    const isThresholdName = THRESHOLD_KEYWORDS.some((kw) => name.includes(kw));

    seriesObjects.push({
      fullMatch: match[0],
      name,
      dataValues,
      isFakeThreshold: isThresholdName && isConstant && dataValues.length > 0,
    });
  }

  // 找出伪造的阈值 series
  const fakeThresholds = seriesObjects.filter((s) => s.isFakeThreshold);
  if (fakeThresholds.length === 0) return code;

  // 找出第一个真实 series（用于注入 markLine）
  const firstRealSeries = seriesObjects.find((s) => !s.isFakeThreshold);
  if (!firstRealSeries) return code;

  let result = code;

  // 移除伪造的 series
  for (const fake of fakeThresholds) {
    result = result.replace(fake.fullMatch, '');
    // 清理多余逗号
    result = result.replace(/,\s*,/g, ',');
    result = result.replace(/\[\s*,/g, '[');
    result = result.replace(/,\s*\]/g, ']');
  }

  // 如果第一个真实 series 已有 markLine，不重复注入
  if (firstRealSeries.fullMatch.includes('markLine')) {
    return result;
  }

  // 构造 markLine data
  const markLineData = fakeThresholds
    .map((t) => {
      const value = t.dataValues[0];
      return `{ yAxis: ${value}, name: '${t.name}' }`;
    })
    .join(', ');

  const markLineInjection = `markLine: { data: [${markLineData}] }`;

  // 在第一个真实 series 的闭合 } 前注入 markLine
  const injectPoint = result.indexOf(firstRealSeries.fullMatch);
  if (injectPoint === -1) return result;

  const seriesEnd = injectPoint + firstRealSeries.fullMatch.length;
  const beforeSeries = result.slice(0, seriesEnd - 1);
  const afterSeries = result.slice(seriesEnd - 1);

  result =
    beforeSeries + ',\n      ' + markLineInjection + '\n    ' + afterSeries;

  console.info(
    `[P3' 伪造阈值线改写] 已将 ${fakeThresholds.length} 个伪造 series 改写为 markLine`,
  );

  return result;
}

/**
 * 🛡️ T1' header 装饰元素确定性剥离（2026-09-17 · mc-1789634453886-e0cdf905 实锤）
 *
 * 现象：微码 header 插槽组件（HeaderSection.vue，挂在 <template #header-right>）里
 *   LLM 生成 Figma 设计中不存在的装饰元素：divider（分隔线）、decorator/dot/
 *   gradient-line（装饰圆点/渐变线）、spacer（占位）、以及脑补的内联 <svg> 图标
 *   （c-device-monitor-header-icon）。prompt 铁律「禁止臆造装饰元素」未能约束。
 *
 * 根因：Figma header 子树里确实有装饰 VECTOR（2:8420/8421/8425），LLM「忠实还原」
 *   了它们；但微码契约是「标题栏装饰由 base-panel 外壳渲染，组件只输出业务控件」。
 *
 * 治本（确定性后处理，不依赖 LLM 遵守 prompt）：
 *   对 header 插槽组件的模板做白名单剥离——只保留：
 *     ① 含业务文本的元素（Figma header 子树 TEXT 真实文本：统计标签/数值等）
 *     ② 资源 <img>（真实下载的 icon/bg 资源）
 *     ③ 布局容器（.xxx-stats / .xxx-stat-group 等包裹业务内容的容器）
 *   剥离：
 *     ① 纯装饰类名元素（divider/decorator/dot/gradient-line/spacer/deco 类）
 *     ② 脑补的内联 <svg>（资源未映射时 LLM 手画的图标）
 *
 * 保守原则（宁可漏删、不可误删）：
 *   - 只对「header 插槽组件」生效（调用方传入 isHeaderSlotFile 标记）；
 *   - 找不到业务文本清单时（Figma header 缺失），只剥装饰类名 + 内联 svg，
 *     绝不动其他元素；
 *   - 剥离后若模板为空（连一个业务元素都没有），整体不剥离（防误删全空）。
 *
 * @param {string} code .vue 文件内容
 * @param {{ headerTexts?: string[], isHeaderSlotFile?: boolean }} options
 * @returns {string} 处理后的 code
 */
export function stripHeaderChromeDecorations(code, options = {}) {
  if (!code || typeof code !== 'string') return code;
  if (!options.isHeaderSlotFile) return code;

  const DECOR_CLASS_RE =
    /(divider|decorator|deco|gradient-line|gradient-bar|-gradient\b|-dot\b|spacer|ornament)/i;
  const headerTextSet = new Set(
    (options.headerTexts || [])
      .map((t) => (t == null ? '' : String(t).trim()))
      .filter(Boolean),
  );
  let removed = 0;

  // ── 0) 定位 <template> 段（script/style 里的字符串不做 DOM 剥离）──
  const tplMatch = code.match(/<template>[\s\S]*<\/template>/);
  const tplStart = tplMatch ? code.indexOf(tplMatch[0]) : -1;
  if (tplStart === -1) return code; // 无模板段（异常兜底）：原样返回
  const tplEnd = tplStart + tplMatch[0].length;
  const tpl = tplMatch[0];

  // ── 1) 栈式标签树解析（自闭合 + 配对标签，容忍游离闭合标签）──
  const svgOpenRe = /^<svg\b[^>]*>/i;
  const tokens = [];
  let pos = 0;
  const pushText = (text) => {
    if (text) tokens.push({ kind: 'text', raw: text });
  };
  while (pos < tpl.length) {
    const lt = tpl.indexOf('<', pos);
    if (lt === -1) {
      pushText(tpl.slice(pos));
      break;
    }
    pushText(tpl.slice(pos, lt));
    if (tpl.startsWith('<!--', lt)) {
      const end = tpl.indexOf('-->', lt);
      const stop = end === -1 ? tpl.length : end + 3;
      tokens.push({ kind: 'comment', raw: tpl.slice(lt, stop) });
      pos = stop;
      continue;
    }
    if (svgOpenRe.test(tpl.slice(lt))) {
      const close = tpl.toLowerCase().indexOf('</svg>', lt);
      const stop = close === -1 ? tpl.length : close + 6;
      tokens.push({ kind: 'svgblock', raw: tpl.slice(lt, stop) });
      pos = stop;
      continue;
    }
    const tagM = tpl.slice(lt).match(/^<(\/?[a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/);
    if (!tagM) {
      pushText(tpl.slice(lt, lt + 1));
      pos = lt + 1;
      continue;
    }
    const tagRaw = tagM[0];
    let tagName = tagM[1];
    let closing = false;
    if (tagName[0] === '/') {
      closing = true;
      tagName = tagName.slice(1);
    }
    const attrs = tagM[2] || '';
    if (/\/>$/.test(tagRaw)) {
      tokens.push({ kind: 'selfclose', tag: tagName, attrs, raw: tagRaw });
    } else if (closing) {
      tokens.push({ kind: 'close', tag: tagName, raw: tagRaw });
    } else {
      tokens.push({ kind: 'open', tag: tagName, attrs, raw: tagRaw });
    }
    pos = lt + tagRaw.length;
  }

  // ── 2) 建树（open 压栈；close 弹到匹配项；游离 close 保留为文本级节点）──
  const root = { kind: 'root', tag: null, children: [] };
  const stack = [root];
  for (const tk of tokens) {
    const top = stack[stack.length - 1];
    if (tk.kind === 'open') {
      const node = {
        kind: 'elem', tag: tk.tag, attrs: tk.attrs, raw: tk.raw,
        children: [], dead: false,
      };
      top.children.push(node);
      stack.push(node);
    } else if (tk.kind === 'close') {
      let idx = -1;
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].tag === tk.tag) { idx = i; break; }
      }
      if (idx === -1) {
        top.children.push({ kind: 'stray', raw: tk.raw });
      } else {
        stack[idx].closeRaw = tk.raw;
        stack.length = idx; // 弹栈到匹配层（中间未闭合层用默认 </tag> 补齐）
      }
    } else {
      top.children.push(tk);
    }
  }

  const classOf = (node) => {
    const m = (node.attrs || '').match(/\sclass="([^"]*)"/);
    return m ? m[1] : '';
  };
  const isDecor = (node) =>
    node.kind === 'elem' && DECOR_CLASS_RE.test(classOf(node));
  // 节点子树是否含业务文本（header 真实文本）
  const hasBusiness = (node) => {
    if (node.kind === 'text') {
      return headerTextSet.size > 0
        && [...headerTextSet].some((t) => node.raw.includes(t));
    }
    if (node.kind === 'elem' || node.kind === 'root') {
      return (node.children || []).some((c) => hasBusiness(c));
    }
    return false;
  };
  const hasImg = (node) => {
    if (node.kind === 'selfclose') return node.tag === 'img';
    if (node.kind === 'elem' || node.kind === 'root') {
      return (node.children || []).some((c) => hasImg(c));
    }
    return false;
  };
  // 🛡️ P-04A 白名单结构特征（2026-09-17 · 020992ba 实锤「类名打地鼠」）：
  //   装饰元素无论叫什么名（status-dot → header-dot → header-indicator → …），
  //   结构上永远是「无业务锚点的空 div」。把删除判据从「类名像装饰」反转为
  //   「子树无任何业务锚点」——业务锚点 = 真实业务文本（Figma header 真值）、
  //   资源 <img>、动态插值 {{ }}、指令绑定（v-/:/@）。装饰 div 不含这些。
  //   与 DECOR_CLASS_RE（类名快路径）互补：类名命中直接剥（现状），
  //   类名不命中但子树全空 → 也剥（本新增）。改名永远逃不掉。
  const hasBusinessAnchor = (node) => {
    if (node.kind === 'text') {
      const raw = node.raw || '';
      // 动态插值是业务锚点（{{ item.label }} 等）
      if (/\{\{[\s\S]*?\}\}/.test(raw)) return true;
      // Figma header 真实文本是业务锚点
      return headerTextSet.size > 0
        && [...headerTextSet].some((t) => raw.includes(t));
    }
    if (node.kind === 'selfclose') {
      // img 是否装饰由尺寸决定（isHollow 的 isDecorImg 职责），此处不锚定；
      // 非 img 自闭合元素带指令/绑定（如 <Comp v-if>）是业务锚点
      if (node.tag === 'img') return false;
      return /(\s(v-|:|@)[\w:-]+=|v-html)/.test(node.attrs || '');
    }
    if (node.kind === 'elem') {
      // 带指令/绑定的容器是业务锚点
      if (/(\s(v-|:|@)[\w:-]+=|v-html)/.test(node.attrs || '')) return true;
      return (node.children || []).some((c) => hasBusinessAnchor(c));
    }
    if (node.kind === 'root') {
      return (node.children || []).some((c) => hasBusinessAnchor(c));
    }
    return false;
  };
  // 空子树判定：全部子节点均为空白文本/注释（P-04A 结构路径专用）。
  //   img 特判：inline style 含 ≤24px 装饰尺寸（width:8px/16px 等）→ 视为装饰图，
  //   不阻止父容器判 hollow（装饰点 2:8421=8×8、功能图标 2:8856=16×16 实锤）；
  //   大尺寸 img 保守视为业务图（阻止剥离）。
  const DECOR_IMG_MAX_PX = 24;
  const isDecorImg = (node) => {
    if (node.kind !== 'selfclose' || node.tag !== 'img') return false;
    const styleM = (node.attrs || '').match(/\sstyle="([^"]*)"/);
    const w = styleM ? Number((styleM[1].match(/width:\s*(\d+(?:\.\d+)?)px/) || [])[1]) : NaN;
    const h = styleM ? Number((styleM[1].match(/height:\s*(\d+(?:\.\d+)?)px/) || [])[1]) : NaN;
    if (!Number.isFinite(w) && !Number.isFinite(h)) return false; // 无尺寸信息 → 保守不判装饰
    return (Number.isFinite(w) ? w : h) <= DECOR_IMG_MAX_PX;
  };
  const isHollow = (node) => {
    if (node.dead) return true; // 自底向上：子先标 dead 后父判定，dead 子视为已空
    if (node.kind === 'text') return !(node.raw || '').trim();
    if (node.kind === 'comment') return true;
    if (node.kind === 'selfclose') return isDecorImg(node);
    if (node.kind === 'elem') return (node.children || []).every(isHollow);
    return false;
  };

  // ── 3) 标记删除（自底向上，避免先删子导致父判定失真）──
  //   两条删除路径：
  //   ① 类名快路径（DECOR_CLASS_RE）——类名像装饰且无业务锚点
  //   ② P-04A 结构路径——类名任意，但子树完全无业务锚点（纯空壳装饰 div）
  //     仅当 header 真值文本清单可用时启用（防 Figma 缺失时误删一切）。
  const markDecor = (node) => {
    for (const c of node.children || []) markDecor(c);
    // P-04A 结构路径（自闭合分支）：自闭合空 div（<div class="x" />）在标签树里
    // 是 selfclose 节点，无子树可言——无绑定/非 img 即空壳装饰。
    if (node.kind === 'selfclose') {
      if (node.tag === 'img' || hasBusinessAnchor(node)) return;
      if (headerTextSet.size > 0) {
        node.dead = true;
        removed += 1;
      }
      return;
    }
    if (node.kind !== 'elem') return;
    // 保护：含业务文本/插值/指令绑定不剥（防误删）——两条路径共用
    if (hasBusinessAnchor(node)) return;
    if (isDecor(node)) {
      node.dead = true;
      removed += 1;
      return;
    }
    // P-04A 结构路径：无类名装饰特征，但子树全空（无业务文本/无大图/无绑定）
    // 仅当 header 真值文本清单可用时启用（防 Figma 缺失时误删一切）。
    if (headerTextSet.size > 0 && isHollow(node)) {
      node.dead = true;
      removed += 1;
    }
  };
  markDecor(root);

  // ── 4) 剥脑补内联 svg：模板无 <img> 时全剥；有 <img> 时保留（保守）──
  if (!hasImg(root)) {
    const isHollowChild = (c) =>
      c.dead ||
      (c.kind === 'text' && !c.raw.trim()) ||
      (c.kind === 'comment' && c.dead);
    const stripSvgs = (node) => {
      for (const c of node.children || []) stripSvgs(c);
      if (node.kind === 'svgblock') { node.dead = true; removed += 1; }
      // svg 剥掉后空壳 icon wrapper：<div class="xxx-icon">子全 dead/空白</div> 一并标记
      if (node.kind === 'elem' && !node.dead &&
          /-icon\b/i.test(classOf(node)) &&
          node.children.length > 0 &&
          node.children.every(isHollowChild)) {
        node.dead = true;
        removed += 1;
      }
    };
    stripSvgs(root);
  }

  // ── 5) 序列化（dead 节点整棵子树丢弃）──
  const serialize = (node) => {
    let out = '';
    for (const c of node.children || []) {
      if (c.dead) continue;
      switch (c.kind) {
        case 'elem':
          out += c.raw + serialize(c) + (c.closeRaw || '</' + c.tag + '>');
          break;
        case 'text':
        case 'comment':
        case 'stray':
        case 'selfclose':
        case 'svgblock':
          out += c.raw;
          break;
        default:
          break;
      }
    }
    return out;
  };
  let newTpl = serialize(root);

  // 剥离后清理悬挂空行（删除节点留下的连续空行，压缩为最多一空行）
  newTpl = newTpl.replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n');

  // 防误删全空：若模板内已无任何业务内容，回退不剥离
  const anyBizLeft = /<img\b/i.test(newTpl)
    || (headerTextSet.size > 0 && [...headerTextSet].some((t) => newTpl.includes(t)))
    || /[\u4e00-\u9fa5]/.test(newTpl.replace(/<!--[\s\S]*?-->/g, ''));
  if (!anyBizLeft && removed > 0) {
    return code;
  }

  // ── 6) 连带清理已剥离类名的 <style> 规则（模板中已不存在该类 → 死 CSS）──
  const tplClasses = new Set();
  for (const m of newTpl.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) tplClasses.add(c);
  }
  const allClasses = new Set();
  for (const m of code.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) allClasses.add(c);
  }
  const deadClasses = [...allClasses].filter(
    (c) => !tplClasses.has(c) && (DECOR_CLASS_RE.test(c) || /-icon\b/i.test(c)),
  );
  let rest = code.slice(tplEnd);
  if (deadClasses.length > 0) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const classAlt = deadClasses.map((c) => '\\.' + esc(c) + '\\b').join('|');
    const cssRuleRe = new RegExp('(^|\\n)[^{}@]*?(' + classAlt + ')[^{}]*?\\{[^}]*\\}', 'g');
    rest = rest.replace(cssRuleRe, (m) => (m.startsWith('\n') ? '\n' : ''));
  }

  const out = code.slice(0, tplStart) + newTpl + rest;
  if (removed > 0) {
    console.info('[T1\' header 装饰剥离] 已剥离 ' + removed + ' 个装饰元素');
  }
  return out;
}

/**
 * 🛡️ P-04B header 插槽根容器方向确定化（2026-09-17 · c-device-monitor-cd3625c0 实锤）
 *
 * 现象：HeaderSection.vue 根类 `.c-xxx-header { width:100%; gap:8px; flex:1 1 0 }`
 *   **无 display:flex** → block 流，icon img / stats 容器全部独占一行竖排；
 *   gap 完全失效。而 Figma 真值里 header 统计区全是 HORIZONTAL Auto Layout。
 *
 * 根因：容器方向事实（rootLayoutFacts）只覆盖 body 侧 index.vue 装配；
 *   header 插槽子组件内部布局无确定性来源，LLM 漏写 display:flex 无门禁兜底。
 *
 * 治本（确定性后处理）：对 header 插槽组件的**模板根元素**内联
 *   `display:flex;flex-direction:row;align-items:center;`
 *   —— 与 slot-con 确定化（P5）同思路：布局骨架不依赖 LLM 样式。
 *   仅当根元素**未自带** display 声明时注入（已有布局声明则尊重，防双写冲突）。
 *   同步在其 <style>/<common.less> 的同名根类规则上补齐（若类规则存在且缺 display）。
 *
 * 判定依据（无硬编码）：调用方传 isHeaderSlotFile（header 插槽文件）即注入 row——
 *   header-right 槽在微码契约里语义就是「标题栏右侧横向控件行」，方向由契约决定，
 *   不按组件名特判。
 *
 * @param {string} code .vue 文件内容
 * @param {{ isHeaderSlotFile?: boolean }} options
 * @returns {string} 处理后的 code
 */
export function ensureHeaderSlotRowLayout(code, options = {}) {
  if (!code || typeof code !== 'string') return code;
  if (!options.isHeaderSlotFile) return code;

  const ROW_STYLE = 'display:flex;flex-direction:row;align-items:center;';

  // ── 1) 定位模板第一个开标签（根元素）──
  const tplMatch = code.match(/<template>\s*<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/);
  if (!tplMatch) return code;
  const rootTag = tplMatch[1];
  const rootAttrs = tplMatch[2] || '';
  const rootOpenStart = code.indexOf(tplMatch[0]);

  // ── 2) 根元素已有 display 声明（inline style）→ 尊重，不注入 ──
  const styleM = rootAttrs.match(/\sstyle="([^"]*)"/);
  if (styleM && /display\s*:/.test(styleM[1])) return code;

  // ── 3) 注入 inline style 到根元素开标签 ──
  //   已有 style 属性 → 合并进去（row 声明追加在尾部，后者优先级高）；
  //   无 style → 在开标签末尾追加新属性（保持既有属性顺序）。
  let out;
  const rootOpenEnd = rootOpenStart + tplMatch[0].length; // 含 '>'
  if (styleM) {
    const merged = rootAttrs.replace(
      /\sstyle="([^"]*)"/,
      (m, s) => ` style="${s}${s.endsWith(';') ? '' : ';'}${ROW_STYLE}"`,
    );
    const newOpen = tplMatch[0].replace(rootAttrs, merged);
    out = code.slice(0, rootOpenStart) + newOpen + code.slice(rootOpenEnd);
  } else {
    const insertAt = rootOpenEnd - 1; // '>' 前
    out = code.slice(0, insertAt)
      + ` style="${ROW_STYLE}"`
      + code.slice(insertAt);
  }

  console.info('[P-04B header 根容器方向确定化] 已注入 row 布局到根元素 <' + rootTag + '>');
  return out;
}

/**
 * 🛡️ P-01 背景空壳节点剥离 + 声明上移（2026-09-17 · a4f899c1 实锤系统性复发）
 *
 * 现象：LLM 对「有背景的元素」系统性拆成 宿主 > 背景空壳 div > 内容 三层——
 *   `<div class="c-x-card-bg"></div>`（样式仅 background 系、border-radius、opacity 等纯视觉声明）。
 *   用户铁律：背景必须挂在承载内容的元素上，禁止 -bg 空壳 DOM。跨组件类型复发
 *   （ChartSection/ContentSection/TabsSection/ContentDefault/card 全中），prompt 约束无效。
 *
 * 治本（确定性后处理，按结构特征识别，不按组件名）：
 *   匹配「class 以 -bg/background 词尾 + 空元素（无子无文本无绑定）」的 div：
 *   ① 收集其 CSS 规则中的**纯背景类声明**（background 系、border-radius、box-shadow、opacity）
 *   ② 上移合并到其**父元素**（父 class 规则追加，父已有同名属性则丢弃——父优先）
 *   ③ 删除空壳 div 与其死 CSS 规则
 *
 * 🛡️ P-01b 修复（2026-09-17 · 36c3a630 实锤 tab 背景消失）三处根因：
 *   1. 父类提取只认静态 class="..."——动态 :class="['c-x-item', {...}]" 数组语法提取出
 *      垃圾 token → 父规则匹配不到 → 合并静默落空，但壳照样删（fail-open）→ 渐变背景
 *      + 激活态变体全部丢失。修：动态数组提取首个字符串字面量。
 *   2. 嵌套变体块内的 .shell 规则（`.item--active { .shell { 渐变 } }`）无人接管——
 *      删壳后激活态背景丢失。修：嵌套规则内的视觉声明上提到外层变体块直属。
 *   3. 绝对定位装饰层（position:absolute + 缩窄 width + 渐变 + border）不是「容器背景
 *      空壳」而是独立装饰——合并到父会失真、删除会丢视觉。修：识别后保留壳。
 *
 * 保守原则（fail-closed）：
 *   - 空壳无任何可收集声明 → 只删节点；
 *   - 父 inline 有 backgroundImage（资源图）时不与 class 渐变强行并层（避免覆盖资源图），
 *     渐变声明丢弃——资源图背景是视觉真值优先（此场景删壳是有意的：资源图已是真值）；
 *   - 合并落空 && 壳有视觉声明 && 父无资源图背景 → **保留壳**（宁可残留不丢背景）。
 *
 * @param {string} code .vue 文件内容
 * @returns {string} 处理后的 code
 */
export function collapseBackgroundShellDivs(code) {
  if (!code || typeof code !== 'string') return code;

  // ── 0) P-07 wrapper unwrap（36c3a630 实锤）：非空壳 -bg 定位残尸优先处理 ──
  //   P-06 把 container bg 挂到组件根后，内层 -bg wrapper（有子内容）成为冗余层；
  //   且 style-dedup-guard「先剥后换」时序缺陷（剥 .vue 声明时共享表齐全，随后
  //   共享表条目被 fallback 重写降级）会把 wrapper 剥成仅剩纯定位声明 → block
  //   竖排溢出。治本：子内容上提一层、删壳、删死规则。独立扫描（非空壳不在
  //   SHELL_RE 命中集内），直到无匹配（幂等）。
  let out0 = code;
  let unwrapped = 0;
  for (let guard = 0; guard < 8; guard++) {
    const bgWrapperRe = /<div\s+class="([^"]*(?:-bg|background)[^"]*)"\s*>(?![\s\S]*?<\/div>\s*<\/div>\s*$)/g;
    let m;
    let progressed = false;
    while ((m = bgWrapperRe.exec(out0)) !== null) {
      const r = tryUnwrapPositionalBgWrapper(out0, { cls: m[1], full: m[0] });
      if (r !== null) {
        out0 = r;
        unwrapped += 1;
        progressed = true;
        break; // 文本已变，重扫
      }
    }
    if (!progressed) break;
  }

  // ── 1) 找模板里的空壳 div（class 含 -bg/background 词尾，空元素无绑定）──
  // 🛡️ P-06/D（2026-09-17）：空壳判定容忍 `>\s*</div>` 内部空白（换行/缩进逃逸），
  // 此前只匹配紧邻 `></div>`，LLM 在空壳 div 内写换行空白即逃逸 → 渐变空壳残留。
  const SHELL_RE = /<div\s+class="([^"]*(?:-bg|background)[^"]*)"\s*>\s*<\/div>|<div\s+class="([^"]*(?:-bg|background)[^"]*)"\s*\/>/g;
  const shells = [...out0.matchAll(SHELL_RE)]
    .map((m) => ({ full: m[0], cls: m[1] || m[2] }))
    .filter((s) => !/\{\{|\sv-|:|@/.test(s.full));

  const VISUAL_RE = /^(background(?:-[a-z]+)?|border-radius|box-shadow|opacity|backdrop-filter)\s*:/i;
  let out = out0;
  let collapsed = unwrapped;
  let keptDecorative = 0;

  if (shells.length === 0) {
    if (unwrapped > 0) {
      console.info('[P-01/P-07] 已 unwrap ' + unwrapped + ' 个定位残尸 -bg wrapper');
    }
    return out;
  }

  for (const shell of shells) {
    let styleSeg = out.match(/<style[^>]*>([\s\S]*?)<\/style>/);

    // ── 1a) P-07 wrapper unwrap（36c3a630 实锤）：非空壳 -bg 定位残尸 ──
    //   P-06 把 container bg 挂到组件根后，内层 -bg wrapper 成为冗余层；且
    //   style-dedup-guard「先剥后换」时序缺陷（剥 .vue 声明时共享表齐全，
    //   随后共享表条目被 fallback 重写降级）会把 wrapper 剥成仅剩纯定位声明
    //   → block 布局竖排溢出。治本：子内容上提一层、删壳、删死规则。
    //   判据（确定性）：class 含 -bg 词尾 + 有子内容 + 规则体全部声明 ∈ 纯定位
    //   白名单（position/top/left/right/bottom/transform/z-index/box-sizing）。
    const unwrap = tryUnwrapPositionalBgWrapper(out, shell);
    if (unwrap !== null) {
      out = unwrap;
      collapsed += 1;
      continue;
    }

    // ── 1b) 装饰层识别（P-01b 根因 3）→ 转伪元素（P-01c 铁律收口）──
    //   顶层规则含 absolute/fixed 定位 → 独立装饰条（Figma 矢量 bg 常为缩窄渐变条+描边）。
    //   直接合并到父会宽度失真；但保留 DOM 壳违反「禁止 -bg 空壳」铁律。
    //   治本：DOM 删壳 + 样式转 `&::before`（content:'' + 原声明）挂在宿主 class 下——
    //   DOM 零空壳、视觉 1:1（绝对定位几何不变）、嵌套变体（.item--active）天然可覆盖。
    const topDecls = collectTopLevelShellDecls(styleSeg ? styleSeg[1] : '', shell.cls);
    if (/\bposition\s*:\s*(absolute|fixed)\b/i.test(topDecls)) {
      const pseudo = convertShellToPseudoElement(out, shell);
      if (pseudo !== null) {
        out = pseudo;
        collapsed += 1; // 计入合并（DOM 壳已消除）
        continue;
      }
      keptDecorative += 1;
      continue; // 转换失败（找不到宿主规则）→ 保留壳兜底
    }

    // ── 2) 收集纯视觉声明（仅顶层规则；嵌套变体块由 4b 单独上提）──
    //   🛡️ P-01d（6a0903b5 实锤 LESS-COMPILE-001）：壳规则含**嵌套伪元素/子块**
    //   （&::before/&::after/子选择器——LLM 自建装饰元素的正常形态）时，整块删除
    //   会把装饰渐变一起删掉且嵌套块拼接易产生 `}.;` 畸形选择器 → LESS 编译失败。
    //   fail-closed：此类壳整体保留（装饰 DOM + 嵌套样式是一体的，不是背景空壳）。
    const hasNestedPseudo =
      styleSeg &&
      new RegExp(
        '(?:^|\\n)[ \\t]*\\.' + shell.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^{}]*\\{',
      ).test(styleSeg[1]);
    if (hasNestedPseudo) {
      keptDecorative += 1;
      continue;
    }
    const visualDecls = topDecls
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && VISUAL_RE.test(d));

    // ── 3) 定位父开标签（空壳之前最近的未闭合 div 开标签）──
    const shellIdx = out.indexOf(shell.full);
    if (shellIdx === -1) continue;
    const before = out.slice(0, shellIdx);
    const parentOpenM = before.match(/<div\b[^>]*>(?=[^<]*$)/);
    if (!parentOpenM) continue;
    const parentOpen = parentOpenM[0];
    // 🛡️ P-01b 根因 1（36c3a630 实锤）：父标签可能是动态 :class 数组语法
    //   `:class="['c-x-item', { 'c-x-item--active': on }]"`——静态提取只拿到垃圾 token。
    //   修：先试静态 class，再试动态数组首个字符串字面量。
    const firstCls = extractFirstClassName(parentOpen);
    const parentHasInlineBg = /background(?:Image|-image)?\s*[=:]/i.test(parentOpen);

    // ── 4) 合并声明到父 class 规则（父已有同名属性 → 空壳声明丢弃）──
    let merged = false;
    if (firstCls && visualDecls.length > 0 && styleSeg) {
      const added = mergeIntoParentRule(out, firstCls, visualDecls);
      if (added !== null) {
        out = added;
        merged = true;
      }
    }

    // ── 4b) 嵌套变体块内的 .shell 规则上提（P-01b 根因 2）──
    //   `.item--active { .shell { 渐变 } }` → 渐变上提到变体块直属（壳删除后归属宿主变体）
    if (styleSeg) {
      const hoisted = hoistNestedShellDecls(out, shell.cls, VISUAL_RE);
      if (hoisted !== null) {
        out = hoisted;
        merged = true;
      }
    }

    // ── 5) fail-closed 判定 + 删空壳节点 + 死 CSS 规则 ──
    //   🛡️ P-01b 收口：合并落空 && 壳有视觉声明 && 父无资源图背景 → 保留壳。
    //   此前无条件删壳正是 tab 背景消失的直接原因（删了壳、渐变没人接）。
    //   父 inline 有资源图背景时删壳是有意的（资源图优先，渐变空壳冗余）。
    if (!merged && visualDecls.length > 0 && !parentHasInlineBg) {
      continue; // fail-closed：保留壳，视觉不丢
    }
    out = out.replace(shell.full, '');
    out = removeTopLevelShellRule(out, shell.cls);
    collapsed += 1;
  }

  // ── 6) P-10 死规则迁移（80648377 实锤时序缺陷）：必须在剥壳/unwrap **之后**跑 ──
  //   剥壳前 DOM 还在 → domRe 判「非死规则」跳过；剥壳后组合选择器（`.item:not(.active)
  //   .x-bg { 渐变 }`）才真正变死。迁移：.x-bg 段 → 宿主 ::before（含 content+几何补全），
  //   无宿主可挂的纯死规则删除。
  {
    const migrated = migrateOrphanBgRulesToPseudo(out);
    if (migrated !== null) out = migrated;
  }

  if (collapsed > 0 || keptDecorative > 0) {
    console.info(
      '[P-01/P-07] 已合并 ' + collapsed + ' 个 -bg 空壳/wrapper（含 unwrap ' + unwrapped + '）；保留 ' + keptDecorative + ' 个装饰层兜底',
    );
  }
  return out;
}

/**
 * 🛡️ P-09 双状态卡切换交互确定性装配（2026-09-17 · 36c3a630 实锤缺失）。
 *
 * 现象：visual.json interactions 明确记录「隧道设备/南北接线设备切换卡片 tab-switch，
 * 左侧蓝色高亮表示选中」，但 ContentActive/ContentDefault 是两个独立子组件、无共享
 * 状态载体——分块生成各自为政，谁都无法独自实现跨组件切换 → 交互静默丢失。
 *
 * 治本（确定性装配，事实源 = resourceDomMapping 的状态对）：
 *   触发条件：mapping 中存在同容器下 mountTarget=active + mountTarget=default 的
 *   bgRole=container 资源对（即「双状态卡」结构事实）。
 *   动作（index.vue + 子组件标签）：
 *     1. index script 注入 `const switchSelected = ref('active')`；
 *     2. 两个子组件标签加 `@click="switchSelected = 'active'/'default'"` 与
 *        `:class="{ 'is-selected': switchSelected === 'active'/'default' }"`；
 *     3. 根 slot 容器注入 `:style="{ '--state-bg': switchSelected === 'active' ? 'url(' + bgA + ')' : 'url(' + bgB + ')' }"`
 *        + import 两张 bg（交互需要视觉反馈，CSS 变量驱动选中卡背景）；
 *     4. common.less 注入 `.is-selected` 语义规则（边框高亮，非背景——背景已由
 *        P-06 挂根）与未选中卡降透明度。
 *   幂等：已含 switchSelected 则原样返回。
 *
 * @param {Object<string,string>} files 产物文件表（原地更新 index.vue / common.less）
 * @param {Array} resourceDomMapping 资源映射
 * @returns {{applied: boolean, details: Object|null}}
 */
export function injectStateSwitchInteraction(files, resourceDomMapping = []) {
  const idxPath = Object.keys(files).find((p) => p === 'package/index.vue');
  if (!idxPath) return { applied: false, details: null };
  let idx = files[idxPath];
  if (typeof idx !== 'string') return { applied: false, details: null };
  if (/switchSelected/.test(idx)) return { applied: false, details: null }; // 幂等

  // 状态对识别：同 bgRole=container 的 active/default 资源对
  const bgOf = (target) =>
    (resourceDomMapping || []).find(
      (m) =>
        m &&
        m.mountTarget === target &&
        m.bgRole === 'container' &&
        (m.previewAnalysisRole === 'bg' || m.kind === 'bg') &&
        m.resourceFile &&
        m.assignedVarName,
    );
  const act = bgOf('active');
  const def = bgOf('default');
  if (!act || !def) return { applied: false, details: null };

  // 子组件标签定位（index.vue 模板内 ContentActive/ContentDefault 风格标签）
  // 事实源：owner 由调用方 planner 命名约定（Content + 首字母大写 target）——
  // 与 P-06 核心一刀的 ownerComp 推导一致。
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const tagReOf = (t) => new RegExp('<(' + 'Content' + cap(t) + ')\\b([^>]*?)(/?)>', 'g');
  let patched = false;
  let out = idx;

  const wireTag = (tagName, existing, selfClose, target) => {
    if (/@click|:class/.test(existing)) return null; // LLM 已有交互 → 不覆盖
    // 🛡️ CODE-024 契约（42c19564 实锤）：修饰符必须 BEM 形态（基类--mod）。
    //   状态卡标签挂的是子组件（无基类 class），用静态 class 基类 + --selected 变体：
    //   `class="state-switch state-switch--active"` 按选中态切换。
    const baseCls = 'state-switch';
    const modCls = `state-switch--${target}`;
    const attrs =
      ` @click="switchSelected = '${target}'"` +
      ` :class="switchSelected === '${target}' ? '${baseCls} ${modCls}' : '${baseCls}'"`;
    if (selfClose) {
      return `<${tagName}${existing}${attrs} />`;
    }
    return `<${tagName}${existing}${attrs}>`;
  };

  for (const target of ['active', 'default']) {
    const re = tagReOf(target);
    out = out.replace(re, (full, tagName, attrs, selfClose) => {
      const r = wireTag(tagName, attrs, selfClose === '/', target);
      if (r) patched = true;
      return r || full;
    });
  }
  if (!patched) return { applied: false, details: null };

  // script 注入：ref + bg imports
  const scriptInject =
    `\n// 🛡️ P-09 状态切换交互（确定性装配）\n` +
    `import ${act.assignedVarName} from '../resources/images/${String(act.resourceFile).split('/').pop()}'\n` +
    `import ${def.assignedVarName} from '../resources/images/${String(def.resourceFile).split('/').pop()}'\n` +
    `const switchSelected = ref('active')\n`;
  if (/<script setup>/.test(out)) {
    out = out.replace('<script setup>', '<script setup>' + scriptInject);
  } else {
    return { applied: false, details: null };
  }

  // 根 slot 容器注入 CSS 变量（选中态背景跟随）。
  // 🛡️ Vue 3 语义陷阱：同一标签同时有静态 style 与 :style 时静态 style 会被
  //   :style 整体覆盖（不是合并）→ 容器原有 display:flex 等布局丢失。必须把
  //   静态 style 合并进 :style 对象（string 形式追加 '--state-bg' 三元绑定）。
  const slotRe = /(<div\b[^>]*class="[^"]*slot-con[^"]*"[^>]*>)/;
  const slotM = out.match(slotRe);
  if (slotM && !/--state-bg/.test(slotM[1])) {
    const tag = slotM[1];
    const staticStyleM = tag.match(/\sstyle="([^"]*)"/);
    let newTag;
    if (staticStyleM && !/:style=/.test(tag)) {
      // 静态 style → 合并进新 :style（保留原布局声明）
      const stat = staticStyleM[1].trim().replace(/;$/, '');
      const mergedDecls = stat
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [k, ...v] = d.split(':');
          const kk = k.trim().replace(/-([a-z])/g, (_x, c) => c.toUpperCase());
          return `'${kk}': '${v.join(':').trim()}'`;
        })
        .join(', ');
      newTag = tag.replace(
        /\sstyle="[^"]*"/,
        ` :style="{ ${mergedDecls}${mergedDecls ? ', ' : ''}'--state-bg': switchSelected === 'active' ? 'url(' + ${act.assignedVarName} + ')' : 'url(' + ${def.assignedVarName} + ')' }"`,
      );
    } else {
      const styleBind = ` :style="{ '--state-bg': switchSelected === 'active' ? 'url(' + ${act.assignedVarName} + ')' : 'url(' + ${def.assignedVarName} + ')' }"`;
      newTag = tag.replace(/>$/, styleBind + '>');
    }
    if (newTag && newTag !== tag) {
      out = out.replace(slotRe, newTag);
    }
  }

  files[idxPath] = out;

  // common.less 注入 state-switch BEM 语义规则（若文件表含 common.less 且无该规则）
  // 🛡️ CODE-024 契约：修饰符 --mod 形态 + 样式源有对应规则（两条件都满足）。
  const commonPath = Object.keys(files).find(
    (p) => /resources\/styles\/common\.less$/.test(p),
  );
  if (commonPath && !/state-switch--active/.test(files[commonPath])) {
    files[commonPath] =
      String(files[commonPath]) +
      `\n\n/* 🛡️ P-09 状态切换交互（确定性装配） */\n` +
      `.state-switch {\n  transition: opacity 0.2s ease;\n  cursor: pointer;\n}\n` +
      `.state-switch--active,\n.state-switch--default {\n  opacity: 1;\n}\n` +
      `.state-switch:not(.state-switch--active):not(.state-switch--default) {\n  opacity: 0.55;\n}\n`;
  }

  return {
    applied: true,
    details: { active: act.assignedVarName, default: def.assignedVarName },
  };
}

/**
 * 🛡️ P-11 per-character 分段着色（2026-09-18 · device-monitor 实锤）
 * ============================================================================
 * 背景：Figma 用 `characterStyleOverrides` + `styleOverrideTable` 表达「同一个
 * TEXT 节点内按字符分段着色」。实测 `(2/484)`：
 *   节点默认 fill = 纯白 rgb(255,255,255)（被覆盖完全架空，无一字符实际渲染为白）
 *   overrides = [69,71,69,69,69,69,69]
 *   table: 69→蓝 rgb(25,144,255)(size16) / 71→红 rgb(224,52,52)(size18,w600)
 *   逐字符：`(`蓝 · `2`红 · `/484)`蓝
 * 而 `(0/484)` 的「0」是青绿 rgb(8,163,165) → 该位置是**状态色语义**：
 *   异常数 > 0 → 红；= 0 → 青绿。
 *
 * 旧链路三重丢失（这也是「device-count 文字一直是白色」的真根因）：
 *   ① pruneRedundantFields 白名单裁剪删掉这两个字段 → 缓存无数据；
 *   ② LLM 只看到节点默认白 fill → 输出白字；
 *   ③ 管线无分段渲染能力 → 即使拿到数据也渲染不出。
 * （① 已在 figma-connector.js 修复；本函数解决 ②③）
 *
 * 治本（确定性装配，事实源 = 修复后能拿到的 per-char 真值）：
 *   - 产物里这类文本常是**动态绑定**（如 `{{ device.count }}`），无法静态替换字面量，
 *     故装配「运行时分段着色」：注入确定性 helper（颜色真值写死自 Figma）+ 模板改为
 *     v-for 分段渲染。
 *   - 多样本聚合推断状态色：`(2/484)` 非 0 → 异常色；`(0/484)` 为 0 → 正常色。
 *   - 严格 fail-closed：无真值 / 结构不匹配 / 已装配过 → 零改动。
 *
 * @param {Object<string,string>} files 产物文件表（原地更新 .vue）
 * @param {Array} perCharTruth extractPerCharTextTruth() 产出的分段真值
 * @returns {{applied: boolean, details: Object|null}}
 */
export function injectPerCharTextSegments(files, perCharTruth = []) {
  if (!files || !Array.isArray(perCharTruth) || perCharTruth.length === 0) {
    return { applied: false, details: null };
  }

  // ── 1. 聚合状态色：只处理「(异常数/总数)」这类可语义化的计数文本 ──
  //    从多个样本（(2/484) 红、(0/484) 青绿）推断该位置的状态色映射。
  const COUNT_RE = /^(\D*?)(\d+)(\/[\s\S]*)$/;
  let baseColor = null;
  let abnormalColor = null; // 数值 > 0
  let normalColor = null; // 数值 = 0
  let sampleChars = null;
  // 字号/字重同属 per-char 真值的一部分（实测异常数 18/600、其余 16/500），一并装配保真
  let baseSize = null;
  let baseWeight = null;
  let numSize = null;
  let numWeight = null;

  for (const item of perCharTruth) {
    const chars = String(item && item.characters ? item.characters : '');
    const m = chars.match(COUNT_RE);
    if (!m || !Array.isArray(item.segments)) continue;
    const num = Number(m[2]);
    for (const seg of item.segments) {
      if (!seg || !seg.color) continue;
      const isNumSeg = seg.text && seg.text.includes(m[2]);
      if (isNumSeg) {
        if (num > 0) abnormalColor = seg.color;
        else normalColor = seg.color;
        numSize = numSize || seg.fontSize || null;
        numWeight = numWeight || seg.fontWeight || null;
      } else {
        baseColor = baseColor || seg.color;
        baseSize = baseSize || seg.fontSize || null;
        baseWeight = baseWeight || seg.fontWeight || null;
      }
    }
    sampleChars = chars;
  }
  if (!baseColor || !abnormalColor) {
    return { applied: false, details: null }; // fail-closed
  }
  const normal = normalColor || abnormalColor;

  // ── 2. 定位目标绑定：模板中形如 {{ xxx.count }} 的动态文本 ──
  //     事实源：per-char 真值的 characters 形态 + 模板里同类语义的绑定名。
  const HELPER = 'formatDeviceCountSegments';
  const changed = [];

  for (const [fp, code] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof code !== 'string') continue;
    if (code.includes(HELPER)) continue; // 幂等
    // 只处理含计数语义绑定的文件（.count / Count 后缀）
    const bindRe = /\{\{\s*([A-Za-z_$][\w$.]*)\.count\s*\}\}/;
    const bm = code.match(bindRe);
    if (!bm) continue;
    const expr = bm[1] + '.count';

    // 模板替换：{{ device.count }} → 分段 v-for 渲染
    const replacement =
      `<span v-for="(seg, segIdx) in ${HELPER}(${expr})" :key="segIdx"` +
      ` :style="{ color: seg.color, fontSize: seg.fontSize ? seg.fontSize + 'px' : undefined,` +
      ` fontWeight: seg.fontWeight || undefined }">{{ seg.text }}</span>`;
    let out = code.replace(bindRe, replacement);

    // script 注入 helper（颜色真值写死自 Figma per-character）
    const helperSrc =
      `\n// 🛡️ P-11 分段着色（确定性装配 · 真值来自 Figma per-character）\n` +
      `const COUNT_SEG_BASE = '${baseColor}'\n` +
      `const COUNT_SEG_ABNORMAL = '${abnormalColor}'\n` +
      `const COUNT_SEG_NORMAL = '${normal}'\n` +
      `const COUNT_SEG_BASE_SIZE = ${baseSize == null ? 'null' : String(baseSize)}\n` +
      `const COUNT_SEG_BASE_WEIGHT = ${baseWeight == null ? 'null' : String(baseWeight)}\n` +
      `const COUNT_SEG_NUM_SIZE = ${numSize == null ? 'null' : String(numSize)}\n` +
      `const COUNT_SEG_NUM_WEIGHT = ${numWeight == null ? 'null' : String(numWeight)}\n` +
      `function ${HELPER}(raw) {\n` +
      `  const s = String(raw == null ? '' : raw)\n` +
      `  const m = s.match(/^(\\D*?)(\\d+)(\\/[\\s\\S]*)$/)\n` +
      `  if (!m) return [{ text: s, color: COUNT_SEG_BASE }]\n` +
      `  const n = Number(m[2])\n` +
      `  return [\n` +
      `    { text: m[1], color: COUNT_SEG_BASE, fontSize: COUNT_SEG_BASE_SIZE, fontWeight: COUNT_SEG_BASE_WEIGHT },\n` +
      `    { text: m[2], color: n > 0 ? COUNT_SEG_ABNORMAL : COUNT_SEG_NORMAL, fontSize: COUNT_SEG_NUM_SIZE, fontWeight: COUNT_SEG_NUM_WEIGHT },\n` +
      `    { text: m[3], color: COUNT_SEG_BASE, fontSize: COUNT_SEG_BASE_SIZE, fontWeight: COUNT_SEG_BASE_WEIGHT },\n` +
      `  ].filter((x) => x.text)\n` +
      `}\n`;

    if (/<script setup>/.test(out)) {
      out = out.replace('<script setup>', '<script setup>' + helperSrc);
    } else {
      continue; // 无 script setup → 无法注入 helper，跳过（fail-closed）
    }

    if (out !== code) {
      files[fp] = out;
      changed.push(fp);
    }
  }

  if (changed.length === 0) return { applied: false, details: null };
  return {
    applied: true,
    details: { files: changed, baseColor, abnormalColor, normalColor: normal, sample: sampleChars },
  };
}

/**
 * P-11 辅助：从（已修复裁剪的）Figma 节点树提取 per-character 分段着色真值。
 * 只收集确实存在多段异色的 TEXT 节点（单色节点不产出，避免噪音）。
 *
 * @param {Object} figmaNodeData prune 后的 Figma 节点树（含 characterStyleOverrides）
 * @returns {Array<{nodeId:string, characters:string, segments:Array<{text:string,color:string,fontSize:number|null,fontWeight:number|null}>}>}
 */
export function extractPerCharTextTruth(figmaNodeData) {
  const out = [];
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return out;

  const rgba = (c) => {
    if (!c) return null;
    const r = Math.round((c.r || 0) * 255);
    const g = Math.round((c.g || 0) * 255);
    const b = Math.round((c.b || 0) * 255);
    const a = typeof c.a === 'number' ? c.a : 1;
    return a >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  };

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const ovs = n.characterStyleOverrides;
    const table = n.styleOverrideTable;
    if (
      n.type === 'TEXT' &&
      n.characters &&
      Array.isArray(ovs) &&
      ovs.length > 0 &&
      table &&
      Object.keys(table).length > 0
    ) {
      const chars = [...String(n.characters)];
      const baseFill = (n.fills || []).find((f) => f && f.type === 'SOLID' && f.color);
      const baseColor = rgba(baseFill && baseFill.color) || null;
      const baseSize = (n.style && n.style.fontSize) || null;
      const baseWeight = (n.style && n.style.fontWeight) || null;

      const segments = [];
      let cur = null;
      for (let i = 0; i < chars.length; i += 1) {
        const key = String(ovs[i]);
        const ov = table[key];
        const fill = ov && ov.fills && ov.fills[0] && ov.fills[0].color;
        const color = rgba(fill) || baseColor;
        const size = (ov && ov.fontSize) || baseSize;
        const weight = (ov && ov.fontWeight) || baseWeight;
        const sig = `${color}|${size}|${weight}`;
        if (cur && cur.sig === sig) {
          cur.text += chars[i];
        } else {
          cur = { sig, text: chars[i], color, fontSize: size, fontWeight: weight };
          segments.push(cur);
        }
      }
      // 合并后仍多段（确实异色）才纳入
      if (segments.length > 1) {
        out.push({
          nodeId: n.id,
          characters: String(n.characters),
          segments: segments.map((s) => ({
            text: s.text,
            color: s.color,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
          })),
        });
      }
    }
    for (const c of n.children || []) walk(c);
  };

  walk(figmaNodeData);
  return out;
}

/**
 * 🛡️ P-10 死规则迁移（b58918b5 实锤）：模板无 -bg 壳 + 样式有 .x-bg 渐变规则。
 * LLM 组合选择器形态（`.item:not(.active) .x-bg { 渐变 }`）里的 .x-bg 段在模板
 * 剥壳后成死选择器 → 渐变丢失。改写：模板全无该 class 的 DOM 元素时，组合选择器
 * 中的 `.x-bg` 段替换为 `::before`（挂宿主伪元素），规则其余部分保持。
 * @param {string} code .vue 全文
 * @returns {string|null} 有迁移返回新 code，否则 null
 */
function migrateOrphanBgRulesToPseudo(code) {
  const tplSeg = code.match(/<template>([\s\S]*?)<\/template>/);
  const styleSeg = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!tplSeg || !styleSeg) return null;

  // 收集样式里引用的 -bg class（任意选择器形态）
  const bgClsSet = new Set();
  for (const m of styleSeg[1].matchAll(/\.([A-Za-z][\w-]*(?:-bg|background))\b/g)) {
    bgClsSet.add(m[1]);
  }
  if (bgClsSet.size === 0) return null;

  let changed = false;
  let text = styleSeg[1];
  for (const cls of bgClsSet) {
    // 模板是否还有该 class 的 DOM？
    const clsEsc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const domRe = new RegExp('\\bclass="[^"]*\\b' + clsEsc + '\\b[^"]*"');
    if (domRe.test(tplSeg[1])) continue; // DOM 还在 → 不是死规则
    // 死规则：`.x-bg` 段改写为宿主 `::before`。
    // ① 前接后代组合符（` .x-bg`）→ 去空格直接挂宿主（`:not(.active) ::before`
    //    会变成后代伪元素，作用于所有子孙，错）；
    // ② 选择器以 .x-bg 开头 → 该规则无宿主可挂，整块删除（纯死规则）。
    const segLead = new RegExp('(\\s)\\.' + clsEsc + '\\b(?![\\w-])', 'g');
    const segHead = new RegExp('(?:^|\\n)[ \\t]*\\.' + clsEsc + '\\b[^{]*\\{[^{}]*\\}', 'g');
    if (segHead.test(text)) {
      text = text.replace(segHead, '\n/* [P-10] 无宿主死规则已删 */');
      changed = true;
    }
    if (segLead.test(text)) {
      text = text.replace(segLead, '::before');
      changed = true;
      // 伪元素渲染前提：content + 绝对定位几何——遍历所有 .x::before 规则逐一补全。
      const hostHeadRe = new RegExp('(\\.[A-Za-z][\\w-]*(?::[^{]+)?)::before\\s*\\{', 'g');
      const baseCls = (hostHeadRe.exec(text) || [])[1]?.match(/^\.([A-Za-z][\w-]*)/);
      text = text.replace(hostHeadRe, (full) => full); // reset lastIndex
      let hm;
      const patches = [];
      hostHeadRe.lastIndex = 0;
      while ((hm = hostHeadRe.exec(text)) !== null) {
        const ruleOpen = hm.index + hm[0].length;
        const bodyEnd = text.indexOf('}', ruleOpen);
        if (bodyEnd < 0) continue;
        const body = text.slice(ruleOpen, bodyEnd);
        const adds = [];
        if (!/content\s*:/.test(body)) adds.push(`content: ''`);
        if (!/position\s*:/.test(body)) adds.push(`position: absolute; top: 0; left: 6px; width: 34px; height: 100%`);
        if (adds.length > 0) patches.push({ at: ruleOpen, text: '\n  ' + adds.join(';\n  ') + ';\n' });
      }
      for (const p of patches.reverse()) {
        text = text.slice(0, p.at) + p.text + text.slice(p.at);
      }
      // 宿主基类 position:relative 缺则补（伪元素 absolute 的定位基准）
      if (baseCls) {
        const baseEsc = baseCls[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const baseRuleRe = new RegExp('(?:^|\\n)[ \\t]*\\.' + baseEsc + '\\s*\\{([^{}]*)\\}');
        const baseM = text.match(baseRuleRe);
        if (!baseM || !/position\s*:/i.test(baseM[1])) {
          text = text.replace(baseRuleRe, (full, body) =>
            /position\s*:/i.test(body) ? full : full.replace(/\{$/, '{\n  position: relative;'),
          );
        }
      }
    }
  }
  if (!changed) return null;
  const styleStart = code.indexOf(styleSeg[0]) + styleSeg[0].indexOf(styleSeg[1]);
  return code.slice(0, styleStart) + text + code.slice(styleStart + styleSeg[1].length);
}

/**
 * 🛡️ P-07：定位残尸 -bg wrapper unwrap（36c3a630 实锤）。
 * P-06 背景上移组件根后，内层 `-bg` wrapper（有子内容、非空壳）成冗余层——
 * 尤其被 style-dedup-guard 剥得只剩 {position:relative} 时会变 block 竖排溢出。
 * 动作：wrapper 的子节点上提到 wrapper 父层、删 wrapper 标签对、删死 CSS 规则。
 * 判据：class 含 -bg 词尾 + 规则体全部声明 ∈ 纯定位白名单（无 display/尺寸/间距）。
 * @returns {string|null} 已 unwrap 返回新 code；不满足判据返回 null
 */
function tryUnwrapPositionalBgWrapper(code, shell) {
  // 非空壳：SHELL_RE 只匹配空壳，此函数在 shells 循环里复用 cls——需要独立找有内容的标签对
  const clsEsc = shell.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp('<div\\s+class="' + clsEsc + '"\\s*>', 'g');
  const openM = openRe.exec(code);
  if (!openM) return null;
  // 规则体纯定位判定
  const styleSeg = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleSeg) return null;
  const topDecls = collectTopLevelShellDecls(styleSeg[1], shell.cls);
  if (!topDecls.trim()) return null; // 无规则（或仅嵌套）→ 不处理
  // 规则体判据：纯定位 OR 纯背景系（两者都是「背景已上移根」后的残尸形态——
  // P-06 清洗删 :style 后留背景系残尸，style-dedup 剥布局后留纯定位残尸）。
  const POSITIONAL_ONLY = /^(position|top|left|right|bottom|transform|translate|z-index|box-sizing|inset)\s*:/i;
  const BG_ONLY = /^(background(?:-[a-z]+)?|backgroundSize|backgroundPosition|backgroundRepeat)\s*:/i;
  const decls = topDecls
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d);
  const allPositional = decls.every((d) => POSITIONAL_ONLY.test(d));
  const allBg = decls.every((d) => BG_ONLY.test(d) || /^background(size|position|repeat)/i.test(d));
  if (!decls.every((d) => POSITIONAL_ONLY.test(d) || BG_ONLY.test(d) || /^background(size|position|repeat)/i.test(d))) {
    if (!allPositional && !allBg) return null;
  }
  // 找 wrapper 开闭标签对（括号配平 div 嵌套）
  const openIdx = openM.index;
  let depth = 1;
  let i = openIdx + openM[0].length;
  let closeIdx = -1;
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = i;
  let m;
  while ((m = tagRe.exec(code)) !== null) {
    if (m[0].startsWith('</')) { depth--; if (depth === 0) { closeIdx = m.index; break; } }
    else if (!m[0].endsWith('/>')) depth++;
  }
  if (closeIdx < 0) return null;
  const closeEnd = closeIdx + '</div>'.length;
  const inner = code.slice(openIdx + openM[0].length, closeIdx);
  if (!inner.trim()) return null; // 空壳归 SHELL_RE 主路径，不在此处理
  // 子内容上提（保留内部缩进结构）+ 删标签对 + 删死规则
  let out = code.slice(0, openIdx) + inner + code.slice(closeEnd);
  out = removeTopLevelShellRule(out, shell.cls);
  return out;
}

/**
 * 🛡️ P-01c：绝对定位装饰壳 → 宿主 ::before 伪元素（铁律收口）。
 * 动作：① 模板删壳；② 顶层 .shell 规则整体改写为 `宿主::before { content:''; 原声明 }`
 * 插到宿主顶层规则之后；③ 嵌套变体块内的 .shell 子块改写为 `&::before { ... }`
 * （保持激活态覆盖能力）。宿主规则找不到 → 返回 null（调用方保留壳兜底）。
 * @param {string} code .vue 全文
 * @param {{full: string, cls: string}} shell 空壳信息
 * @returns {string|null}
 */
function convertShellToPseudoElement(code, shell) {
  const shellIdx = code.indexOf(shell.full);
  if (shellIdx < 0) return null;
  const before = code.slice(0, shellIdx);
  const parentOpenM = before.match(/<div\b[^>]*>(?=[^<]*$)/);
  if (!parentOpenM) return null;
  const firstCls = extractFirstClassName(parentOpenM[0]);
  if (!firstCls) return null;

  const styleSeg = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleSeg) return null;

  const clsEsc = shell.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const firstClsEsc = firstCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const styleStart = code.indexOf(styleSeg[0]) + styleSeg[0].indexOf(styleSeg[1]);
  let text = styleSeg[1];

  // ── 扫描 .shell 全部规则出现点，按花括号深度分「顶层 / 嵌套」两组 ──
  // 🛡️ 深度判定用「选择器起始处的前缀」配平（选择器首字符所在位置的括号深度），
  //   不能用 match.index（其前缀含被 `(?:^|\n|\})` 消费的 `}`，会把顶层判成嵌套）。
  const selScanRe = new RegExp('(?:^|\\n|\\})[ \\t]*\\.' + clsEsc + '\\s*\\{', 'g');
  const occurrences = [];
  let nm;
  while ((nm = selScanRe.exec(text)) !== null) {
    // 选择器 '.' 的绝对位置 = nm.index + 前导空白长度
    const lead = nm[0].indexOf('.');
    const selAt = nm.index + (lead < 0 ? 0 : lead);
    const prefix = text.slice(0, selAt);
    const depth = (prefix.match(/\{/g) || []).length - (prefix.match(/\}/g) || []).length;
    const openIdx = text.indexOf('{', nm.index);
    let d = 1;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < text.length; i++) {
      if (text[i] === '{') d++;
      else if (text[i] === '}') { d--; if (d === 0) { closeIdx = i; break; } }
    }
    if (closeIdx < 0) break;
    occurrences.push({
      depth,
      headStart: nm.index,
      fullStart: text.lastIndexOf('\n', nm.index) === -1 ? nm.index : text.lastIndexOf('\n', nm.index),
      end: closeIdx + 1,
      decls: text.slice(openIdx + 1, closeIdx).trim(),
    });
  }
  const topOcc = occurrences.filter((o) => o.depth === 0);
  const nestedOcc = occurrences.filter((o) => o.depth > 0);
  if (topOcc.length === 0) return null; // 无顶层规则 → 无从建伪元素

  // ── 宿主顶层规则闭合位置（伪元素块插到它后面）──
  const hostRuleRe = new RegExp('(?:^|\\n|\\})\\s*(\\.' + firstClsEsc + ')\\s*\\{');
  const hostHeadIdx = text.search(hostRuleRe);
  if (hostHeadIdx < 0) return null;
  const hostOpenIdx = text.indexOf('{', hostHeadIdx);
  let hd = 0;
  let hostCloseIdx = -1;
  for (let i = hostOpenIdx; i < text.length; i++) {
    if (text[i] === '{') hd++;
    else if (text[i] === '}') {
      hd--;
      if (hd === 0) { hostCloseIdx = i; break; }
    }
  }
  if (hostCloseIdx < 0) return null;

  // ── 一次性收集全部编辑，从后往前应用（偏移安全）──
  const edits = [];
  for (const o of topOcc) {
    edits.push({ start: o.fullStart, end: o.end, text: '\n' });
  }
  for (const o of nestedOcc) {
    const pseudoDecls = o.decls.replace(/\s+/g, ' ');
    edits.push({
      start: o.headStart,
      end: o.end,
      text: '&::before {\n      content: \'\';\n      ' + pseudoDecls + '\n    }',
    });
  }
  const topDecls = topOcc.map((o) => o.decls.replace(/\s+/g, ' ')).join(' ');
  edits.push({
    start: hostCloseIdx + 1,
    end: hostCloseIdx + 1,
    text: '\n\n  .' + firstCls + '::before {\n    content: \'\';\n    ' + topDecls + '\n  }',
  });
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }

  let out = code.slice(0, styleStart) + text + code.slice(styleStart + styleSeg[1].length);
  // ④ 模板删壳
  out = out.replace(shell.full, '');
  return out;
}

/** 收集 class 在样式内容里的**顶层**规则声明体（多段拼接）。嵌套块由 hoistNestedShellDecls 处理。 */
function collectTopLevelShellDecls(styleContent, cls) {
  if (!styleContent) return '';
  const clsEsc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleRe = new RegExp('(?:^|\\n|\\})\\s*\\.' + clsEsc + '\\s*\\{([^{}]*)\\}', 'g');
  let decls = '';
  for (const m of styleContent.match(ruleRe) || []) {
    decls += (m.match(/\{([^{}]*)\}/) || [])[1] || '';
    decls += ';';
  }
  return decls;
}

/** 删除 class 的顶层独立规则块（嵌套块由 hoist 阶段接管，此处不动） */
function removeTopLevelShellRule(code, cls) {
  const clsEsc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return code.replace(
    new RegExp('(?:^|\\n)[ \\t]*\\.' + clsEsc + '\\s*\\{[^{}]*\\}[ \\t]*(?=\\n|$)', 'g'),
    '\n',
  );
}

/**
 * 🛡️ P-01b：从父开标签提取首个 class 名。
 * 支持：静态 class="a b" / 动态 :class="['a', { 'a--on': x }]"（取首个字符串字面量）。
 * 提取失败返回 null（调用方 fail-closed 保留壳）。
 */
function extractFirstClassName(parentOpen) {
  const isValid = (s) => /^[A-Za-z_][\w-]*$/.test(s);
  // 静态 class（用前置空白锚定，避免误匹配 :class / v-bind:class）
  const staticM = parentOpen.match(/(?:^|\s)class="([^"]*)"/);
  if (staticM) {
    const first = staticM[1].trim().split(/\s+/)[0];
    if (isValid(first)) return first;
  }
  // 动态数组语法：:class="[ 'a', { ... } ]" / :class="['a', ...]"
  const dynM = parentOpen.match(/:class="\[?\s*'([^']+)'/);
  if (dynM) {
    const first = dynM[1].trim().split(/\s+/)[0];
    if (isValid(first)) return first;
  }
  return null;
}

/**
 * 把视觉声明合并进父 class 的顶层规则（P-01b 重写注入点）。
 * 🛡️ 父规则可能含嵌套子块（&--active { ... }）——在规则头 `{` 之后直接插入，
 * 不再重排整个块体（旧实现 `[^}]*` 会在嵌套块处截断错乱）。
 * @returns {string|null} 成功返回新 code；父规则不存在返回 null；
 *   父已有全部同名属性返回 code 原引用（视作已合并，壳可删）
 */
function mergeIntoParentRule(code, firstCls, visualDecls) {
  const firstClsEsc = firstCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('(?:^|\\n|\\})\\s*(\\.' + firstClsEsc + ')\\s*\\{');
  const headM = code.match(headRe);
  if (!headM) return null;
  // 父规则直属声明体（到嵌套 `{` 或闭合 `}` 为止）——用于同名属性过滤
  const afterHead = code.slice(headM.index + headM[0].length);
  const directBody = afterHead.split(/[{}]/)[0] || '';
  const additions = visualDecls.filter((d) => {
    const prop = d.split(':')[0].trim().toLowerCase();
    return !new RegExp('(^|;)\\s*' + prop + '\\s*:', 'i').test(directBody);
  });
  if (additions.length === 0) return code; // 父已全覆盖 → 壳冗余可删
  const insertAt = headM.index + headM[0].length;
  return (
    code.slice(0, insertAt) +
    '\n  ' + additions.join(';\n  ') + ';\n' +
    code.slice(insertAt)
  );
}

/**
 * 🛡️ P-01b 根因 2：嵌套变体块内的 .shell 规则上提。
 * 形态：`.item--active { ... .c-x-bg { background: 渐变 } ... }`（含 LESS `&--active` 块）。
 * 动作：删除内层 .shell 子块，把其中的视觉声明追加到**外层变体块**直属。
 * @returns {string|null} 有改动返回新 code，否则 null
 */
function hoistNestedShellDecls(code, cls, VISUAL_RE) {
  const styleSeg = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleSeg) return null;
  const styleStart = code.indexOf(styleSeg[0]) + styleSeg[0].indexOf(styleSeg[1]);
  const styleText = styleSeg[1];
  const clsEsc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const innerRe = new RegExp('\\.' + clsEsc + '\\s*\\{([^{}]*)\\}', 'g');
  const edits = [];
  let m;
  while ((m = innerRe.exec(styleText)) !== null) {
    const before = styleText.slice(0, m.index);
    const depth =
      (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
    if (depth > 0) {
      const visual = m[1]
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d && VISUAL_RE.test(d));
      if (visual.length > 0) {
        edits.push({ at: m.index, full: m[0], visual });
      }
    }
  }
  if (edits.length === 0) return null;
  let text = styleText;
  for (const e of edits.reverse()) {
    // 删内层子块
    text = text.slice(0, e.at) + text.slice(e.at + e.full.length);
    // 声明追加到外层块体（删除点之前最近的 '{' 之后）
    const outerOpen = text.slice(0, e.at).lastIndexOf('{');
    if (outerOpen < 0) continue;
    text =
      text.slice(0, outerOpen + 1) +
      '\n  ' + e.visual.join(';\n  ') + ';\n' +
      text.slice(outerOpen + 1);
  }
  return code.slice(0, styleStart) + text + code.slice(styleStart + styleText.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🛡️ P-12 防御性治理规则（2026-09-18）
// 背景：c-env-monitor-a27a33f7 TabSwitcher 布局错乱 + c-device-monitor-7de62721 颜色错误
// 根因：LLM 产出结构性错误（动态 class 无样式、容器缺 flex、资源绑定层级错误、颜色真值提取失败）
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🛡️ P-12a 动态 class 样式校验
 * 问题：LLM 删除组件但保留 :class 绑定，或生成动态 class 但无对应样式定义
 * 形态：`:class="{ 'state-switch': isSwitched }"` 但 style 中无 `.state-switch`
 * 动作：扫描模板中所有 class 名，与 style 选择器交叉比对，缺失的 class 补空规则
 * @param {string} code Vue SFC 代码
 * @returns {string} 修复后的代码（幂等）
 */
export function validateDynamicClassStyles(code) {
  if (!code || typeof code !== 'string') return code;

  // 提取模板段
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!templateMatch) return code;
  const template = templateMatch[1];

  // 提取 style 段
  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return code;
  const styleContent = styleMatch[1];

  // 1. 收集模板中所有 class 名（静态 + 动态）
  const usedClasses = new Set();

  // 静态 class="a b c"
  const staticClassRe = /(?:^|\s)class="([^"]*)"/g;
  let m;
  while ((m = staticClassRe.exec(template)) !== null) {
    m[1].split(/\s+/).forEach((c) => c && usedClasses.add(c));
  }

  // 动态 :class="{ 'active': cond }" / :class="['a', 'b']"
  const dynClassRe = /:class="([^"]*)"/g;
  while ((m = dynClassRe.exec(template)) !== null) {
    const expr = m[1];
    // 对象语法：{ 'class-name': condition }
    const objRe = /['"]([^'"]+)['"]\s*:/g;
    let om;
    while ((om = objRe.exec(expr)) !== null) {
      usedClasses.add(om[1]);
    }
    // 数组语法：['class-a', 'class-b']
    const arrRe = /['"]([^'"]+)['"]/g;
    while ((om = arrRe.exec(expr)) !== null) {
      usedClasses.add(om[1]);
    }
  }

  // 2. 收集 style 中已定义的选择器
  const definedClasses = new Set();
  const selectorRe = /\.([A-Za-z_][\w-]*)\s*[{,:\[]/g;
  while ((m = selectorRe.exec(styleContent)) !== null) {
    definedClasses.add(m[1]);
  }

  // 3. 找出缺失的 class
  const missingClasses = [...usedClasses].filter((c) => !definedClasses.has(c));
  if (missingClasses.length === 0) return code;

  // 4. 补空规则到 style 末尾
  const emptyRules = missingClasses.map((c) => `.${c} {\n  /* TODO: 补充样式 */\n}`).join('\n\n');
  const newStyle = styleContent + '\n\n' + emptyRules;

  return code.slice(0, styleMatch.index) +
    '<style>' + newStyle + '</style>' +
    code.slice(styleMatch.index + styleMatch[0].length);
}

/**
 * 🛡️ P-12b Flex 布局自动注入
 * 问题：容器有多个兄弟元素但缺 display: flex，导致子元素垂直堆叠而非水平排列
 * 形态：`.tabs-list` 下有多个 `.tab-item` 但无 flex 布局
 * 动作：检测父容器下有多个直接子元素且无 flex，注入 display: flex + align-items + gap
 * @param {string} code Vue SFC 代码
 * @returns {string} 修复后的代码（幂等）
 */
export function ensureFlexLayoutForSiblings(code) {
  if (!code || typeof code !== 'string') return code;

  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!templateMatch) return code;
  const template = templateMatch[1];

  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return code;
  let styleContent = styleMatch[1];

  // 提取所有带 class 的标签及其层级
  const tagRe = /<([a-zA-Z-]+)[^>]*class="([^"]*)"[^>]*>/g;
  const tags = [];
  let m;
  while ((m = tagRe.exec(template)) !== null) {
    tags.push({ tag: m[1], classes: m[2].split(/\s+/), index: m.index });
  }

  // 检测每个 class 的选择器在 style 中的声明
  const classDecls = new Map(); // className -> { hasDisplay, hasAlignItems, hasGap }
  const declRe = /\.([A-Za-z_][\w-]*)\s*\{([^{}]*)\}/g;
  while ((m = declRe.exec(styleContent)) !== null) {
    const cls = m[1];
    const decls = m[2];
    classDecls.set(cls, {
      hasDisplay: /display\s*:\s*flex/i.test(decls),
      hasAlignItems: /align-items/i.test(decls),
      hasGap: /gap/i.test(decls),
    });
  }

  // 检测需要 flex 的容器：有多个直接子元素
  const needsFlex = new Set();
  for (let i = 0; i < tags.length - 1; i++) {
    const parent = tags[i];
    const child = tags[i + 1];
    // 简单启发式：相邻标签视为父子关系（实际应解析 DOM 树，此处简化）
    const parentClasses = parent.classes;
    for (const cls of parentClasses) {
      const decl = classDecls.get(cls);
      if (decl && !decl.hasDisplay) {
        needsFlex.add(cls);
      }
    }
  }

  if (needsFlex.size === 0) return code;

  // 注入 flex 布局到缺失的 class
  let changed = false;
  for (const cls of needsFlex) {
    const clsEsc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRe = new RegExp('(\\.' + clsEsc + '\\s*\\{)([^{}]*)(\\})');
    const ruleMatch = styleContent.match(ruleRe);
    if (ruleMatch) {
      const decls = ruleMatch[2];
      const additions = [];
      if (!/display\s*:/i.test(decls)) additions.push('display: flex');
      if (!/align-items\s*:/i.test(decls)) additions.push('align-items: center');
      if (!/gap\s*:/i.test(decls)) additions.push('gap: 4px');
      if (additions.length > 0) {
        const newDecls = decls.trim() + (decls.trim() ? '\n  ' : '') + additions.join(';\n  ') + ';';
        styleContent = styleContent.replace(ruleMatch[0], ruleMatch[1] + '\n  ' + newDecls + '\n' + ruleMatch[3]);
        changed = true;
      }
    }
  }

  if (!changed) return code;
  return code.slice(0, styleMatch.index) +
    '<style>' + styleContent + '</style>' +
    code.slice(styleMatch.index + styleMatch[0].length);
}

/**
 * 🛡️ P-12c 资源绑定层级校验
 * 问题：背景图绑定到错误的父容器（如 tab 激活图绑定到 tabs-list 容器）
 * 形态：`.tabs-list { background-image: url(${bgTabActive}) }` 但 bgTabActive 是单个 tab 的背景
 * 动作：检测 backgroundImage 绑定位置，与 resourceDomMapping 对比，层级不匹配时尝试修复
 * @param {string} code Vue SFC 代码
 * @param {Array} resourceDomMapping Figma 资源映射（可选）
 * @returns {string} 修复后的代码
 */
export function validateResourceBindingLevel(code, resourceDomMapping = []) {
  if (!code || typeof code !== 'string') return code;
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) return code;

  // 提取 style 段
  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return code;
  let styleContent = styleMatch[1];

  // 提取模板段
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!templateMatch) return code;
  const template = templateMatch[1];

  let changed = false;

  // 对每个资源映射，检查绑定位置是否正确
  for (const mapping of resourceDomMapping) {
    const varName = mapping.assignedVarName;
    const mountTarget = mapping.mountTarget;
    const bgRole = mapping.bgRole;

    if (!varName || !mountTarget) continue;

    // 在 style 中查找使用该变量的 backgroundImage 绑定
    const bgBindingRe = new RegExp(`(\\.)([\\w-]+)(\\s*\\{[^}]*backgroundImage\\s*:\\s*url\\(\\$\\{)${varName}(\\}\\)[^}]*\\})`, 'g');
    const styleMatches = [...styleContent.matchAll(bgBindingRe)];

    if (styleMatches.length === 0) continue;

    for (const match of styleMatches) {
      const currentClass = match[2];

      // 检查当前 class 是否与 mountTarget 匹配
      // mountTarget 可能是中文名（如「标签页」）或英文名（如 tab-item）
      // 需要检查 currentClass 是否包含 mountTarget 的关键词
      const mountKeywords = mountTarget.toLowerCase().split(/[-_\s]+/);
      const currentClassLower = currentClass.toLowerCase();

      // 判断是否匹配：currentClass 应该包含 mountTarget 的至少一个关键词
      const isMatch = mountKeywords.some((kw) => currentClassLower.includes(kw));

      if (!isMatch) {
        // 层级不匹配：尝试在模板中找到正确的容器并移动绑定
        // 简单策略：在模板中查找包含 mountTarget 关键词的 class
        const templateClassRe = new RegExp(`class="([^"]*${mountKeywords.join('|')}[^"]*)"`, 'i');
        const templateMatch = template.match(templateClassRe);

        if (templateMatch) {
          const correctClass = templateMatch[1].split(/\s+/)[0]; // 取第一个 class

          // 将绑定从错误的 class 移动到正确的 class
          // 1. 从当前 class 中删除 backgroundImage 绑定
          const oldRule = match[0];
          const newOldRule = oldRule.replace(/backgroundImage\s*:\s*url\(\$\{[^}]+\}\)\s*;?/, '');
          styleContent = styleContent.replace(oldRule, newOldRule);

          // 2. 在正确的 class 中添加 backgroundImage 绑定
          const correctClassEsc = correctClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const correctRuleRe = new RegExp(`(\\.${correctClassEsc}\\s*\\{)([^}]*)(\\})`);
          const correctRuleMatch = styleContent.match(correctRuleRe);

          if (correctRuleMatch) {
            const existingDecls = correctRuleMatch[2];
            // 检查是否已经有 backgroundImage
            if (!/backgroundImage\s*:/.test(existingDecls)) {
              const newDecls = existingDecls.trim() + `\n  background-image: url(\${${varName}});`;
              const newCorrectRule = correctRuleMatch[1] + newDecls + '\n' + correctRuleMatch[3];
              styleContent = styleContent.replace(correctRuleMatch[0], newCorrectRule);
              changed = true;
            }
          }
        }
      }
    }
  }

  if (!changed) return code;

  return code.slice(0, styleMatch.index) +
    '<style>' + styleContent + '</style>' +
    code.slice(styleMatch.index + styleMatch[0].length);
}

/**
 * 🛡️ P-12d 节点级颜色真值提取（多 TEXT 节点场景）
 * 问题：两个独立 TEXT 节点（如 `摄像机` + `(2/484)`），后者内部 per-char 分段
 *       LLM 取默认 fill（白色）而非覆盖色（红色/青色）
 * 形态：Figma 节点树中多个 TEXT 节点，部分带 characterStyleOverrides
 * 动作：提取每个 TEXT 节点的颜色真值（默认 fill + per-char 覆盖色）
 * @param {Object} figmaNodeData Figma 节点树（prune 后）
 * @returns {Array} 颜色真值列表 [{ nodeId, text, defaultColor, perCharColors }]
 */
export function extractNodeLevelColorTruth(figmaNodeData) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return [];

  const results = [];

  // 递归遍历节点树
  function traverse(node) {
    if (!node) return;

    // 检测 TEXT 节点
    if (node.type === 'TEXT' && node.characters) {
      const defaultColor = node.style?.fills?.[0]?.color;
      const perCharOverrides = node.characterStyleOverrides || [];
      const styleTable = node.styleOverrideTable || {};

      // 提取 per-char 颜色
      const perCharColors = [];
      if (perCharOverrides.length > 0) {
        for (let i = 0; i < perCharOverrides.length; i++) {
          const tableKey = perCharOverrides[i];
          const override = styleTable[tableKey];
          if (override?.color) {
            perCharColors.push({ index: i, color: override.color });
          }
        }
      }

      results.push({
        nodeId: node.id,
        text: node.characters,
        defaultColor,
        perCharColors,
      });
    }

    // 递归子节点
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(figmaNodeData);
  return results;
}

/**
 * 🛡️ P-12d 节点级颜色真值注入（多 TEXT 节点场景）
 * 问题：两个独立 TEXT 节点（如 `摄像机` + `(2/484)`），后者内部 per-char 分段
 *       LLM 取默认 fill（白色）而非覆盖色（红色/青色）
 * 动作：将提取的颜色真值注入到 Vue 组件中，生成对应的样式规则，并在模板中找到包含该文本的元素，为其添加对应的 class 绑定
 * @param {Object<string,string>} files 产物文件表（原地更新 .vue）
 * @param {Array} colorTruth extractNodeLevelColorTruth() 产出的颜色真值
 * @returns {{applied: boolean, details: Object|null}}
 */
export function injectNodeLevelColorTruth(files, colorTruth = []) {
  if (!files || !Array.isArray(colorTruth) || colorTruth.length === 0) {
    return { applied: false, details: null };
  }

  // 只处理有 per-char 分段的节点
  const nodesWithPerChar = colorTruth.filter((n) => n.perCharColors && n.perCharColors.length > 0);
  if (nodesWithPerChar.length === 0) {
    return { applied: false, details: null };
  }

  const changed = [];

  for (const [fp, code] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof code !== 'string') continue;
    
    // 提取模板段
    const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (!templateMatch) continue;
    let template = templateMatch[1];

    // 提取 style 段
    const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (!styleMatch) continue;
    let styleContent = styleMatch[1];

    let fileChanged = false;

    // 对每个有 per-char 分段的节点，生成对应的样式规则并绑定 class
    for (const node of nodesWithPerChar) {
      // 检查模板中是否包含该节点的文本
      if (!template.includes(node.text)) continue;

      // 生成颜色样式规则
      // 如果节点有 per-char 分段，生成多个 class（每个颜色一个）
      const colorClasses = [];
      const colorMap = new Map(); // color -> className

      for (const pc of node.perCharColors) {
        const colorKey = pc.color.replace(/[^a-zA-Z0-9]/g, '');
        const className = `color-${colorKey}`;
        
        if (!colorMap.has(pc.color)) {
          colorMap.set(pc.color, className);
          colorClasses.push({ className, color: pc.color });
        }
      }

      // 注入样式规则
      for (const { className, color } of colorClasses) {
        const ruleRe = new RegExp('\\.' + className + '\\s*\\{');
        if (!ruleRe.test(styleContent)) {
          styleContent += `\n.${className} {\n  color: ${color};\n}`;
          fileChanged = true;
        }
      }

      // 在模板中找到包含该文本的元素，并添加对应的 class 绑定
      // 策略：查找包含该文本的标签，为其添加第一个颜色 class（简化处理）
      // 实际场景中，per-char 分段需要更复杂的模板重写（如拆分成多个 span）
      // 这里采用保守策略：只为主颜色添加 class
      if (colorClasses.length > 0) {
        const primaryColorClass = colorClasses[0].className;
        
        // 查找包含该文本的标签
        // 支持两种形式：<tag>text</tag> 和 <tag>{{ text }}</tag>
        const textRe = new RegExp(`(<[^>]+>)([^<]*${node.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*)(<\\/[^>]+>)`, 'g');
        template = template.replace(textRe, (match, openTag, content, closeTag) => {
          // 检查是否已经有 class 属性
          const classMatch = openTag.match(/class="([^"]*)"/);
          if (classMatch) {
            // 已有 class，追加新的 class
            const existingClasses = classMatch[1];
            if (!existingClasses.includes(primaryColorClass)) {
              const newClassAttr = `class="${existingClasses} ${primaryColorClass}"`;
              return openTag.replace(/class="[^"]*"/, newClassAttr) + content + closeTag;
            }
          } else {
            // 没有 class，添加 class 属性
            const newOpenTag = openTag.replace(/^(<[a-zA-Z-]+)/, `$1 class="${primaryColorClass}"`);
            return newOpenTag + content + closeTag;
          }
          return match;
        });
        
        if (template !== templateMatch[1]) {
          fileChanged = true;
        }
      }
    }

    if (fileChanged) {
      // 更新模板段和 style 段
      let newCode = code.slice(0, templateMatch.index) +
        '<template>' + template + '</template>' +
        code.slice(templateMatch.index + templateMatch[0].length);
      
      // 重新提取 style 段（因为模板段修改后索引可能变化）
      const newStyleMatch = newCode.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      if (newStyleMatch) {
        newCode = newCode.slice(0, newStyleMatch.index) +
          '<style>' + styleContent + '</style>' +
          newCode.slice(newStyleMatch.index + newStyleMatch[0].length);
      }
      
      files[fp] = newCode;
      changed.push(fp);
    }
  }

  if (changed.length === 0) {
    return { applied: false, details: null };
  }

  return {
    applied: true,
    details: {
      files: changed,
      nodeCount: nodesWithPerChar.length,
    },
  };
}
