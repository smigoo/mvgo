/**
 * @file section-contract-bleed-guard.js — 🧬 刀70 T3（2026-11-06）
 *
 * 「段级布局契约下放子元素」写盘前守卫（病灶②兜底）。
 *
 * ## 病灶（c-a03fe-7a03fee9 实锤）
 * prompt 既有强契约「块必须 `repeat(N,1fr)`」+ 门禁「每块 `flex:<系数> 1 0`」无适用域限定
 * ⇒ LLM 复读到**深层子元素选择器**上（`.content-section3 .vendor-item` 等 7 处）：
 * 卡片内部被切成 4 列 grid 轨道（轨道定义空间划分、与内容份数无关）⇒ 厂商名占第 1 格
 * （25% 宽）⇒ ellipsis 截断。刀41（契约自愈仅管段 wrapper）/css-sanitizer（只补不删）/
 * flex-sibling-guard（仅兄弟根级）判据域均不覆盖此处。
 *
 * ## 判据（四重指纹，全部命中才剥；fail-open）
 * 对 `resources/styles/**.less` 的每个顶层规则块：
 *   ① 选择器含后代组合器（空白）——非单一段根类；
 *   ② 块体含 `flex: <num> 1 0`（段比例形态）；
 *   ③ 该 flex 值与文件内**段根块**（单类选择器 + 同形态 flex）的值相同（0.001 容差）
 *      ——复读证据：拿不到段根块（无同值）⇒ 不剥；
 *   ④ 块体含 `grid-template-columns: repeat(N, 1fr[, 1fr…])`（全 1fr 轨道，契约复读形态）。
 * 命中 → **只删布局属性组**（display:grid / grid-template-* / grid-auto-* / flex / min-height:0），
 * 保留 color/background 等真值（c-a03fe 人工直改已验证此口径安全）。
 *
 * 为什么④限定「全 1fr」：合法段网格容器（如 c-a03fe `.content-section .vendor-grid`）
 * 写的是 Figma 真值固定轨道 `repeat(4, 126px)`，不算契约复读，不得误伤。
 *
 * ## 间距 Phase 1 下限钳制（同出口，保守子集）
 * 仅钳「贴太近」，不吸附规范档位（档位吸附归 Phase 2 vision 置信度）：
 *   a. 纵向 flex 容器（同块有 `flex-direction: column`）`gap: Npx` 且 `0 < N < 6` → 6px
 *      （0 是有意紧贴/覆盖语义，不动；横向 column-gap 是 tag 组常见紧凑形态，不动）；
 *   b. 类名含 `title`（不区分大小写）的选择器块 `margin-bottom: Npx` 且 `0 < N < 8` → 8px
 *      （标题-内容距下限；padding 域无语义锚点、badge/button 紧凑合法 ⇒ **不钳**）。
 *
 * ## 护栏
 *   - 只扫 `resources/styles/**.less`（.vue 内嵌 style 后续扩展）；不碰 index.css（编译产物）；
 *   - 幂等：剥离/钳制后不再匹配指纹，重复跑零变化；
 *   - fail-open：块解析异常 / 拿不准 ⇒ 不动，只留痕；
 *   - 无 bg/backgroundImage 分支 —— bg 域兜底全权归刀68（`collapseBgMultiAnchor`）+ 刀39
 *     时序（resource-mounter），本守卫禁止第二套 bg 口径（刀70 查重裁决）。
 *
 * ## 观测
 * 计数行（file-writer 接线处恒打含 0）：
 *   `🧾 段契约剥离: contractBleedStripped=N evaluated=M gapClamped=G titleGapClamped=T`
 *   - T3 计数归零 ⇒ T2 提示词收窄生效（双通道归因·通道 A）；
 *   - 计数非零 ⇒ 提示词失效，但产物仍被守住（通道 B），有数据归因不静默。
 *
 * jest 安全：纯函数、无 IO、无 import.meta。
 */

import { splitTopLevelClassBlocks } from './style-class-consolidator.js';

/** 只扫业务样式目录下的 .less（与刀 53h 同范围）。 */
const STYLE_LESS_RE = /(^|\/)resources\/styles\/.*\.less$/i;

/** 段比例 flex 形态：`flex: <num> 1 0`。 */
const SECTION_FLEX_RX = /flex:\s*([\d.]+)\s+1\s+0/;
/** 契约复读网格形态：`repeat(N, 1fr[, 1fr…])` —— 全 1fr 轨道。 */
const FULL_1FR_REPEAT_RX = /grid-template-columns:\s*repeat\(\s*\d+\s*,\s*1fr(\s*,\s*1fr)*\s*\)/;

/** 污染块内要剥离的布局声明行（逐行整行匹配，保守起见逐条白名单形态）。 */
const BLEED_DECL_RXS = [
  /^\s*display\s*:\s*grid\s*;?\s*$/,
  /^\s*grid-template-columns\s*:[^;]*;\s*$/,
  /^\s*grid-template-rows\s*:[^;]*;\s*$/,
  /^\s*grid-auto-rows\s*:[^;]*;\s*$/,
  /^\s*grid-auto-flow\s*:[^;]*;\s*$/,
  /^\s*flex\s*:\s*[\d.]+\s+1\s+0\s*;\s*$/,
  /^\s*min-height\s*:\s*0\s*;\s*$/,
];

/** 段根 flex 值数值容差。 */
const FLEX_EPS = 0.001;
/** 纵向容器 gap 下限（px）。 */
const GAP_FLOOR = 6;
/** 标题 margin-bottom 下限（px）。 */
const TITLE_MARGIN_FLOOR = 8;

/** 选择器是否含后代组合器（非单一段根类）。 */
function hasDescendant(selector = '') {
  return /\s/.test(String(selector || '').trim());
}

/** 从块文本头部（首个 `{` 之前）提取完整选择器 —— splitTopLevelClassBlocks 的
 *  selector 字段只取头行首个类名，不含后代组合，必须从 text 重取。 */
function blockSelector(blockText = '') {
  const t = String(blockText || '');
  const idx = t.indexOf('{');
  return idx === -1 ? '' : t.slice(0, idx).trim();
}

/** 选择器是否单一段根类（无空格、以 . 开头、无伪类/伪元素）。 */
function isSectionRootSelector(selector = '') {
  const s = String(selector || '').trim();
  return /^(\.[A-Za-z][\w-]*)$/.test(s);
}

/**
 * 剥离单个 LESS 文件内的段契约污染块 + 间距 Phase 1 钳制。
 *
 * @param {string} content LESS 源文本
 * @returns {{ content: string, stripped: number, evaluated: number, gapClamped: number, titleGapClamped: number }}
 */
export function stripContractBleedInLess(content = '') {
  let text = String(content || '');
  const stats = { stripped: 0, evaluated: 0, gapClamped: 0, titleGapClamped: 0 };
  if (!text.trim()) return { content: text, ...stats };

  let blocks;
  try {
    blocks = splitTopLevelClassBlocks(text);
  } catch {
    return { content: text, ...stats }; // fail-open：解析失败不动
  }

  // ① 收集段根 flex 值（单类选择器 + flex:N 1 0）
  const sectionFlexValues = [];
  for (const b of blocks) {
    const sel = blockSelector(b.text);
    if (!isSectionRootSelector(sel)) continue;
    const m = String(b.text || '').match(SECTION_FLEX_RX);
    if (m) sectionFlexValues.push(parseFloat(m[1]));
  }

  // ② 逐块判定段契约污染
  for (const b of blocks) {
    const sel = blockSelector(b.text);
    const body = String(b.text || '');
    const fm = body.match(SECTION_FLEX_RX);
    if (!fm) continue;
    if (!hasDescendant(sel)) continue; // 段根自身合法
    stats.evaluated += 1;
    const flexVal = parseFloat(fm[1]);
    const sameAsSectionRoot = sectionFlexValues.some(
      (v) => Math.abs(v - flexVal) < FLEX_EPS,
    );
    if (!sameAsSectionRoot) continue; // 无复读证据，fail-open
    if (!FULL_1FR_REPEAT_RX.test(body)) continue; // 全 1fr 轨道才算契约复读

    // 剥离布局属性组（逐行删，保留真值）
    const lines = body.split('\n');
    const kept = lines.filter((ln) => !BLEED_DECL_RXS.some((rx) => rx.test(ln)));
    const removed = lines.length - kept.length;
    if (removed > 0 && kept.join('\n').trim() !== body.trim()) {
      const next = kept.join('\n');
      // 原文替换（相同内容块全替换 = 相同结果，天然幂等）
      text = text.split(body).join(next);
      stats.stripped += 1;
    }
  }

  // ③ 间距 Phase 1：块内声明钳制（在剥离后的文本上重扫，防交错）
  let blocks2;
  try {
    blocks2 = splitTopLevelClassBlocks(text);
  } catch {
    return { content: text, ...stats };
  }
  for (const b of blocks2) {
    let body = String(b.text || '');
    let next = body;

    // a. 纵向 flex 容器 gap 下限
    if (/flex-direction\s*:\s*column\b/.test(next)) {
      next = next.replace(/(\bgap\s*:\s*)(\d+)(px)/g, (all, head, num, unit) => {
        const n = parseInt(num, 10);
        if (n > 0 && n < GAP_FLOOR) {
          stats.gapClamped += 1;
          return `${head}${GAP_FLOOR}${unit}`;
        }
        return all;
      });
    }

    // b. title 块 margin-bottom 下限
    if (/title/i.test(blockSelector(body))) {
      next = next.replace(/(\bmargin-bottom\s*:\s*)(\d+)(px)/g, (all, head, num, unit) => {
        const n = parseInt(num, 10);
        if (n > 0 && n < TITLE_MARGIN_FLOOR) {
          stats.titleGapClamped += 1;
          return `${head}${TITLE_MARGIN_FLOOR}${unit}`;
        }
        return all;
      });
    }

    if (next !== body) text = text.split(body).join(next);
  }

  return { content: text, ...stats };
}

/**
 * writeFiles 循环外整体入口（与刀 53h `dropOrphanStyleRules` 同形态）。
 *
 * @param {Map<string,string>|Object} files 路径 → 内容
 * @returns {{ map: Map<string,string>, stats: { contractBleedStripped:number, evaluated:number, gapClamped:number, titleGapClamped:number, scannedFiles:number } }}
 */
export function stripSectionContractBleed(files) {
  const stats = {
    contractBleedStripped: 0,
    evaluated: 0,
    gapClamped: 0,
    titleGapClamped: 0,
    scannedFiles: 0,
  };
  const map = new Map();
  if (!files) return { map, stats };
  const entries = files instanceof Map ? files.entries() : Object.entries(files);
  for (const [p, content] of entries) {
    if (typeof p !== 'string' || typeof content !== 'string') continue;
    if (!STYLE_LESS_RE.test(p)) continue;
    stats.scannedFiles += 1;
    try {
      const r = stripContractBleedInLess(content);
      stats.evaluated += r.evaluated;
      stats.gapClamped += r.gapClamped;
      stats.titleGapClamped += r.titleGapClamped;
      if (r.stripped > 0) stats.contractBleedStripped += r.stripped;
      if (r.content !== content) map.set(p, r.content);
    } catch {
      // fail-open：单文件异常不阻断
    }
  }
  return { map, stats };
}
