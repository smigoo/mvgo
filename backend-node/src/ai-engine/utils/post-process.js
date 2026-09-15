/**
 * 后处理纯函数模块
 * 用于 TDD 测试，不依赖 MicrocodeEngineer 类的复杂依赖链
 */

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
