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
 * 保守原则：
 *   - 空壳无任何可收集声明 → 只删节点；
 *   - 父 inline 有 backgroundImage（资源图）时不与 class 渐变强行并层（避免覆盖资源图），
 *     渐变声明丢弃——资源图背景是视觉真值优先。
 *
 * @param {string} code .vue 文件内容
 * @returns {string} 处理后的 code
 */
export function collapseBackgroundShellDivs(code) {
  if (!code || typeof code !== 'string') return code;

  // ── 1) 找模板里的空壳 div（class 含 -bg/background 词尾，空元素无绑定）──
  // 🛡️ P-06/D（2026-09-17）：空壳判定容忍 `>\s*</div>` 内部空白（换行/缩进逃逸），
  // 此前只匹配紧邻 `></div>`，LLM 在空壳 div 内写换行空白即逃逸 → 渐变空壳残留。
  const SHELL_RE = /<div\s+class="([^"]*(?:-bg|background)[^"]*)"\s*>\s*<\/div>|<div\s+class="([^"]*(?:-bg|background)[^"]*)"\s*\/>/g;
  const shells = [...code.matchAll(SHELL_RE)]
    .map((m) => ({ full: m[0], cls: m[1] || m[2] }))
    .filter((s) => !/\{\{|\sv-|:|@/.test(s.full));
  if (shells.length === 0) return code;

  let out = code;
  let collapsed = 0;

  for (const shell of shells) {
    // ── 2) 从 <style> 收集该 class 的纯视觉声明（无 style 段 → 无声明可并，仅删节点）──
    const clsEsc = shell.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const styleSeg = out.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const ruleRe = new RegExp('\\.' + clsEsc + '\\s*\\{([^}]*)\\}', 'g');
    let decls = '';
    if (styleSeg) {
      for (const rm of styleSeg[1].match(ruleRe) || []) {
        decls += (rm.match(/\{([^}]*)\}/) || [])[1] || '';
        decls += ';';
      }
    }
    const VISUAL_RE = /^(background(?:-[a-z]+)?|border-radius|box-shadow|opacity|backdrop-filter)\s*:/i;
    const visualDecls = decls
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
    const parentClsM = parentOpen.match(/class="([^"]*)"/);
    const firstCls = parentClsM ? parentClsM[1].trim().split(/\s+/)[0] : null;

    // ── 4) 合并声明到父 class 规则（父已有同名属性 → 空壳声明丢弃）──
    let merged = false;
    if (firstCls && visualDecls.length > 0) {
      const firstClsEsc = firstCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parentRuleRe = new RegExp('(\\.' + firstClsEsc + '\\s*\\{)([^}]*)\\}');
      const searchFrom = out.indexOf(styleSeg[0]);
      const seg = out.slice(searchFrom);
      const parentRuleM = seg.match(parentRuleRe);
      if (parentRuleM) {
        const existingBody = parentRuleM[2];
        const additions = visualDecls.filter((d) => {
          const prop = d.split(':')[0].trim().toLowerCase();
          return !new RegExp('(^|;)\\s*' + prop + '\\s*:', 'i').test(existingBody);
        });
        if (additions.length > 0) {
          const newSeg = seg.replace(
            parentRuleRe,
            (_m, open, body) => open + body.replace(/\s*$/, '') + (body.trim().endsWith(';') || !body.trim() ? '' : ';') + ' ' + additions.join('; ') + ' }',
          );
          out = out.slice(0, searchFrom) + newSeg;
          merged = true;
        }
      }
    }

    // ── 5) 删空壳节点 + 死 CSS 规则 ──
    out = out.replace(shell.full, '');
    out = out.replace(new RegExp('[^{}@]*?\\.' + clsEsc + '\\s*\\{[^}]*\\}\\s*', 'g'), '');
    collapsed += 1;
    void merged;
  }

  if (collapsed > 0) {
    console.info('[P-01 背景空壳剥离] 已合并 ' + collapsed + ' 个 -bg 空壳节点到父元素');
  }
  return out;
}
