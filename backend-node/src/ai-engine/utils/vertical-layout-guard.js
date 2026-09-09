/**
 * 🛡️ 竖排布局护栏（VERT-001 / VERT-002 / VERT-003 / VERT-004，2026-09-04/09 治理）
 *
 * 背景：竖排侧栏按钮（sidebar tab / nav）生成后出现「只显示单字 / 文字断列」，
 * 且该问题在 L0-B code-validator 后处理期间没有任何兜底——LLM 一旦写出
 * 「固定小高度 + overflow 截断」或「竖排文字缺 nowrap」，产物即静默劣化，
 * 与 P0-4「竖排文字按钮必须 nowrap + 高度按最长标签预算，禁止裁切」的
 * prompt 铁律（lite.service.ts buildMicrocodeCodegenPrompt）失守面完全重合。
 *
 * 实锤（mc-max-1788499007313-6ac539e0 SidebarTabs）：
 *   - 窄栏导航文本带 text-overflow:ellipsis + overflow:hidden + min-width:0
 *     → 容器宽度不足时被截成「交…」，整组语义丢失（只显示单字）；
 *   - 按钮固定 height（如 20px）且无 min-height → 长标签只显示首行
 *     （交通诱导只显示「交通」），无任何后处理能还原。
 *
 * 实锤（mv-lite-1788950662809-38d185bb equipment-monitoring 环形图消失）：
 *   - flex-direction: column 容器（.equipment-monitoring-left）内有 flex:1 子元素
 *     （.equipment-monitoring-chart-wrapper），但容器自身缺 min-height:0
 *     → echarts ResizeObserver 检测 clientHeight 始终为 0，图表永不初始化
 *     → 视觉分析 brief 正确识别「圆环完好率指示器」，代码也生成了 echarts 初始化，
 *       但渲染层 CSS 布局导致 chart 容器尺寸为 0，环形图「消失」。
 *
 * 本模块是纯文本后处理（zero-dep、ESM .js、可单测），在 L0-B 后处理阶段对
 * common.less 全文与各 .vue <style> 体执行，修复语义为「反截断护栏」：
 *
 *   VERT-001：writing-mode 竖排（vertical-rl/lr/tb-*）块缺 white-space:nowrap → 补 nowrap。
 *             竖排文字不 nowrap 会在排满一列后自动折行续列，破坏阅读顺序
 *             （供配电→电供/配、交通诱导→诱交/导通 实锤）。
 *   VERT-002：按钮/导航语义文本块（selector 命中 -tab/-nav/-sidebar/-menu/-btn 等）
 *             带 text-overflow:ellipsis / overflow:hidden / min-width:0 截断三件套
 *             → 移除截断，让文字完整溢出可见（竖排窄栏的「省略号截断」是缺陷而非设计）。
 *   VERT-003：按钮/导航语义块固定 height 且无 min-height → height 降级为 min-height，
 *             杜绝「固定小高度把文字裁成单行」（交通诱导在 20px 按钮里只显示「交通」实锤）。
 *   VERT-004：flex-direction: column 容器缺 min-height:0 → 补 min-height:0。
 *             防止 column flex 容器内 flex:1 子元素（如图表容器）因父容器高度计算异常
 *             导致尺寸为 0（equipment-monitoring 环形图消失实锤）。
 *
 * 判定纪律（宁可漏报不可误杀，与 FLEX-005 一致）：
 *   1. 所有修复仅作用于「按钮/导航语义」selector（-tab/-nav/-sidebar/-menu/-btn/-item），
 *      普通文本省略（.xxx-text/.xxx-desc 等）不在 VERT-002/003 触发面内；
 *   2. VERT-001 仅作用于含 writing-mode 竖排值的块，横向文本零影响；
 *   3. VERT-003 仅当块内无 min-height 才降级，已有 min-height 的规范写法不触碰；
 *   4. VERT-004 仅作用于 flex-direction: column 容器，且块内无 min-height 才补。
 */

const VERTICAL_RULES = Object.freeze({
  VERT_001: 'VERT-001',
  VERT_002: 'VERT-002',
  VERT_003: 'VERT-003',
  VERT_004: 'VERT-004',
});

const WRITING_MODE_VERTICAL_RX = /writing-mode\s*:\s*(vertical-(?:rl|lr)|tb(?:-rl|-lr)?)\b/i;
const NOWRAP_RX = /white-space\s*:\s*nowrap\b/i;
const TEXT_OVERFLOW_ELLIPSIS_RX = /text-overflow\s*:\s*ellipsis\b/i;
const OVERFLOW_HIDDEN_RX = /overflow\s*:\s*hidden\b/i;
const MIN_WIDTH_ZERO_RX = /min-width\s*:\s*0\b/i;
const HEIGHT_PX_RX = /height\s*:\s*(\d+(?:\.\d+)?)px\b/i;
const MIN_HEIGHT_RX = /min-height\s*:/i;
// VERT-004：检测 flex-direction: column（含 flex 简写形式）
const FLEX_DIRECTION_COLUMN_RX = /flex-direction\s*:\s*column\b/i;
// 按钮/导航语义 selector 判定（命中即视为「导航项」，截断是缺陷而非设计）
const BUTTON_NAV_SELECTOR_RX =
  /[.-][A-Za-z0-9-]*(?:sidebar|side-nav|nav-tab|nav-item|menu-item|tab-bar|tab-item|-tab\b|btn|button|toolbar|tool-group)[A-Za-z0-9-]*/i;

/**
 * 提取 CSS/LESS 文本中的叶子块（body 内不再含 '{'），返回
 * [{ selector, body, bodyStart, close }]，bodyStart/close 为原始文本下标
 * （bodyStart 指向第一个声明起始，close 指向配对 '}' 下标）。
 * 嵌套父块因 body 含 '{' 被跳过，其叶子子块会独立命中（各块独立修复互不干扰）。
 * 顶层非块内容（@var 定义、@import 等）自然忽略。
 */
export function extractLeafBlocks(cssText) {
  const blocks = [];
  if (typeof cssText !== 'string' || !cssText || !cssText.includes('{')) return blocks;
  const n = cssText.length;
  let i = 0;
  while (i < n) {
    const open = cssText.indexOf('{', i);
    if (open < 0) break;
    // 配对 '}'
    let depth = 0;
    let close = -1;
    let bodyStart = -1;
    for (let j = open; j < n; j++) {
      const ch = cssText[j];
      if (ch === '{') {
        depth++;
        if (depth === 1) bodyStart = j + 1;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close < 0) break;
    const body = cssText.slice(bodyStart, close);
    if (!body.includes('{')) {
      // selector：从上一个块结束标记（'}' / ';'）到 '{' 之间，取最后一段干净选择器
      let selStart = open;
      while (selStart > 0) {
        const c = cssText[selStart - 1];
        if (c === '}' || c === ';') break;
        selStart--;
      }
      let selector = cssText.slice(selStart, open).trim();
      selector = selector.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      blocks.push({ selector, body, bodyStart, close });
      i = close + 1;
    } else {
      // 非叶子（嵌套父块）：跳到父块 body 起点向内继续扫描，让内层叶子块独立命中
      i = bodyStart;
    }
  }
  return blocks;
}

/** 判定选择器是否为按钮/导航语义（VERT-002/003 触发面） */
export function isButtonNavSelector(selector) {
  if (!selector || selector.startsWith('@')) return false; // @media/@keyframes 等跳过
  return BUTTON_NAV_SELECTOR_RX.test(selector);
}

/**
 * 删除 body 中首个匹配 attrRx 的「属性: 值;」段（到分号或 body 尾）。
 * @returns {{newBody:string, removed:boolean}}
 */
function removeDecl(body, attrRx) {
  const m = attrRx.exec(body);
  if (!m) return { newBody: body, removed: false };
  const segEnd = body.indexOf(';', m.index);
  if (segEnd < 0) return { newBody: body, removed: false }; // 无分号终止则保守跳过
  return {
    newBody: body.slice(0, m.index) + body.slice(segEnd + 1),
    removed: true,
  };
}

/**
 * 对单块 body 应用全部竖排反截断修复。
 * 顺序：002（删截断声明，可能多处）→ 003（height→min-height）→ 001（补 nowrap 插头）。
 * 003 与 002 删除互不冲突（height 非 002 目标）；001 插在 body 头部，
 * 若头部声明已被 002 删除，则 nowrap 自然前移到新头部，仍合法。
 * @returns {{newBody:string, fixes:Array<{code:string, detail:string}>}}
 */
export function fixVerticalBody(body, selector) {
  let newBody = body;
  const fixes = [];
  const isNav = isButtonNavSelector(selector);
  const isVertical = WRITING_MODE_VERTICAL_RX.test(newBody);

  // VERT-002：导航语义截断三件套 → 删除（可多处：text-overflow / overflow:hidden / min-width:0）
  if (isNav) {
    const removedDecls = [];
    for (const rx of [TEXT_OVERFLOW_ELLIPSIS_RX, OVERFLOW_HIDDEN_RX, MIN_WIDTH_ZERO_RX]) {
      let guard = 0;
      while (guard++ < 4) {
        const r = removeDecl(newBody, rx);
        if (!r.removed) break;
        newBody = r.newBody;
        removedDecls.push(rx.source.replace(/\\s\*:/, ':').split(':')[0].trim());
      }
    }
    if (removedDecls.length > 0) {
      fixes.push({
        code: VERTICAL_RULES.VERT_002,
        detail: `导航项截断声明已移除（${removedDecls.join('、')}），文字完整溢出可见`,
      });
    }
  }

  // VERT-003：导航块固定 height 且无 min-height → 降级 min-height（防按钮高裁切文字）
  if (isNav && !MIN_HEIGHT_RX.test(newBody)) {
    const hm = HEIGHT_PX_RX.exec(newBody);
    if (hm) {
      newBody =
        newBody.slice(0, hm.index) +
        `min-height: ${hm[1]}px` +
        newBody.slice(hm.index + hm[0].length);
      fixes.push({
        code: VERTICAL_RULES.VERT_003,
        detail: `固定 height:${hm[1]}px 降级为 min-height（防按钮文字被高度裁切，交通诱导只显示「交通」实锤）`,
      });
    }
  }

  // VERT-001：竖排文字缺 nowrap → 补（放块体头部，防断列）
  if (isVertical && !NOWRAP_RX.test(newBody)) {
    let i = 0;
    while (i < newBody.length && /\s/.test(newBody[i])) i++;
    newBody = newBody.slice(0, i) + 'white-space: nowrap;\n  ' + newBody.slice(i);
    fixes.push({
      code: VERTICAL_RULES.VERT_001,
      detail: 'writing-mode 竖排元素缺 white-space:nowrap，已补（防断列：供配电→电供/配）',
    });
  }

  // VERT-004：flex-direction: column 容器缺 min-height:0 → 补（防图表容器高度为 0）
  // 实锤：equipment-monitoring 环形图消失，因 column flex 容器内 flex:1 子元素
  // 因父容器高度计算异常导致尺寸为 0，echarts ResizeObserver 永不初始化
  if (FLEX_DIRECTION_COLUMN_RX.test(body) && !MIN_HEIGHT_RX.test(body)) {
    // 在块体末尾追加 min-height: 0
    const trimmedEnd = newBody.replace(/\s+$/, '');
    newBody = trimmedEnd + '\n  min-height: 0; /* VERT-004: 防 column flex 容器高度计算异常 */\n';
    fixes.push({
      code: VERTICAL_RULES.VERT_004,
      detail: 'flex-direction: column 容器缺 min-height:0，已补（防图表容器高度为 0，equipment-monitoring 环形图消失实锤）',
    });
  }

  return { newBody, fixes };
}

/**
 * 对单段 CSS/LESS 文本做竖排反截断 autoFix（逐叶子块重建，坐标安全）。
 * @param {string} cssText 样式文本（common.less 全文或 .vue <style> 体）
 * @param {{filePath?: string}} [options]
 * @returns {{content: string, fixes: Array<{code:string, selector:string, detail:string}>}}
 */
export function autoFixVerticalLayout(cssText, options = {}) {
  const filePath = options?.filePath || '';
  if (typeof cssText !== 'string' || !cssText) {
    return { content: cssText, fixes: [] };
  }
  const blocks = extractLeafBlocks(cssText);
  if (blocks.length === 0) return { content: cssText, fixes: [] };

  const allFixes = [];
  let content = cssText;
  // 从后往前重建，避免块区间因前序替换漂移
  for (let b = blocks.length - 1; b >= 0; b--) {
    const blk = blocks[b];
    const { newBody, fixes } = fixVerticalBody(blk.body, blk.selector);
    if (newBody === blk.body) continue;
    content = content.slice(0, blk.bodyStart) + newBody + content.slice(blk.close);
    for (const f of fixes) {
      allFixes.push({ ...f, selector: blk.selector, filePath });
    }
  }
  return { content, fixes: allFixes };
}

export { VERTICAL_RULES };
