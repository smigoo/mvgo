/**
 * 🛡️ 2026-10-03 · 产物样式冲突检测器（mc-max-1791030024001-f7e57ac6 实锤，只报不改）。
 *
 * 两类缺陷形态（该任务同一根源：LLM 把按钮本体样式错写到包装容器 class 上）：
 *
 * ① 字号乘数换算尺寸：`width/height: calc(<字号变量> * <小数>)`。
 *    实锤：`width: calc(var(--fontSize, 14px) * 4.29)`（60/14 反推的乘数）——真值 60px 被
 *    绑到字号变量上，宿主主题注入 `--fontSize=12px`（设计稿 14px）→ 按钮渲染 51.5×34.3。
 *    判据限定「乘数含小数位」：小数乘数 = px 真值 ÷ 字号的反推残留，可辩驳；整数乘数
 *    （2 倍行高、0.5 倍间距等）合法形态太多，不拦（防误杀）。
 *    治本正解 = 控件宽高直写契约真值 px（P3-15d 控件契约已下发 width/height）。
 *
 * ② 跨文件同名 class 规则冲突：同一 class 同时在 resources/styles/*.less 与
 *    SFC scoped <style> 里定义，且**同名属性双定义**（如两处都写 width）。
 *    实锤：`.c-f7e57a-antd-button` 在 common.less:124（按钮本体样式错放，width=4.29 字号）
 *    与 HeaderSection2.vue scoped（容器规则，width:100%）双定义 → @import 后到覆盖 →
 *    容器收缩成按钮大小、按钮区露出面板底色（观感「按钮跑到组件外部」）。
 *    只比较**直接声明**（深度 1），嵌套块（:deep / & / 子选择器）内部声明不参与 —— 容器
 *    class 里嵌 :deep(.ant-btn) 是标准写法，不算冲突。
 *
 * 为什么只报不改（两个理由，缺一不可）：
 *    - ①无真值可改：自愈器拿不到「这条 calc 对应哪个控件的契约真值」（class⇄契约无确定性关联），
 *      删掉声明会让按钮落 antd 默认尺寸，同样错；
 *    - ②方向不可判定：同名双写时无法确定 common.less 侧错还是 SFC 侧错（f7e57ac6 是 less 侧错，
 *      反例完全可能存在），删错侧 = 二次破坏。防线主力是 mc-builder.md 的两条生成铁律（预防），
 *      本检测器保证复发可见（summary.styleConflicts + WARN 留痕）。
 */

// ① 判据：width/height（含 min-/max-）取值 = calc(...) 内含字号变量且乘以小数字面量。
// 左边界 (?<![a-zA-Z-])：排除 line-height / border-height 等属性名里的 height 子串。
const FONT_SIZED_DIMENSION_RX =
  /(?<![a-zA-Z-])(?:min-|max-)?(?:width|height)\s*:\s*calc\(\s*[^;}]*(?:@fontSize|var\(--fontSize[^)]*\))[^;}]*\*\s*\d+\.\d+[^;}]*\)/gi;

// 布局/外观属性白名单：只在这些属性上判「同名双定义冲突」（衬线属性如 color 双写常见且低危）
const CONFLICT_ATTRS = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'background',
  'background-color',
  'border-radius',
  'padding',
  'margin',
  'font-size',
  'display',
  'flex-direction',
]);

// LESS/CSS 顶层 class 规则提取（深度 1）：选择器行以 .class 开头 + 其直接声明。
// 用括号深度扫描而非 `[^}]*` 正则：SFC 里 `.container { :deep(.ant-btn) { ... } }`
// 的嵌套块若用朴素正则会把嵌套选择器误当声明属性。
// 值语义归一：`calc(@fontSize * 0.857)` 与 `calc(var(--fontSize, 14px) * 0.857)` 语义相同
// （@fontSize 编译后即 var(--fontSize)）—— 字面不同但渲染一致，不得报冲突。
// 归一：去空白 → var(--x, fallback) 收敛为 var(--x) → @less-var 映射为 var(--less-var)。
function normalizeCssValue(v) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // var(--camelName, fallback) 与 @kebab-name 别名语义相同（theme token 双写）：
    // 统一去连字符 → var(--colorBgContainer) / @color-bg-container 都收敛为 var(colorbgcontainer)
    .replace(/var\((--[\w-]+)[^)]*\)/g, (mm, name) => 'var(' + name.replace(/-/g, '') + ')')
    .replace(/@([a-zA-Z][\w-]*)/g, (mm, name) => 'var(' + name.replace(/-/g, '') + ')');
}

function extractTopLevelClassRules(cssText) {
  // className -> Map<attr, Set<valueNormalized>>：值也要记 —— 同属性同值的双写是
  // 无害冗余（健康产物大量存在，覆盖后语义不变），只有「值不同」才是静默覆盖冲突。
  const rules = new Map();
  const text = String(cssText || '');
  let i = 0;
  let depth = 0;
  let selector = '';
  let currentClass = null;
  let buf = '';
  const flushDecl = () => {
    if (!currentClass || !buf.includes(':')) return;
    const m = buf.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;{}]*)$/);
    if (m) {
      const attr = m[1].trim().toLowerCase();
      const value = normalizeCssValue(m[2]);
      if (!rules.has(currentClass)) rules.set(currentClass, new Map());
      const attrMap = rules.get(currentClass);
      if (!attrMap.has(attr)) attrMap.set(attr, new Set());
      attrMap.get(attr).add(value);
    }
    buf = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) {
        const cm = selector.match(/^\.([a-zA-Z][\w-]*)\s*$/);
        currentClass = cm ? cm[1] : null;
        buf = '';
      }
      depth++;
      selector = '';
    } else if (ch === '}') {
      depth--;
      flushDecl();
      if (depth === 0) currentClass = null;
      buf = '';
      selector = '';
    } else if (ch === ';') {
      flushDecl();
    } else if (depth === 0) {
      selector += ch;
      // 换行 = 新行开始（重置）；逗号 = 复合选择器（只认单 class 顶层规则，防误报）
      if (ch === '\n') {
        selector = '';
      } else if (ch === ',') {
        selector = '@@complex';
      }
    } else if (depth === 1 && currentClass) {
      buf += ch;
    }
    i++;
  }
  return rules;
}

function extractSfcStyleBlocks(source = '') {
  const blocks = [];
  const rx = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = rx.exec(String(source || ''))) !== null) blocks.push(m[1]);
  return blocks;
}

/**
 * ① 字号乘数换算尺寸检测。
 * @param {string} source CSS/LESS/SFC 全文
 * @param {string} filePath 用于告警前缀
 * @returns {{hits: Array<{file: string, decl: string}>, warnings: string[]}}
 */
export function findFontSizeMultiplierSizing(source = '', filePath = '') {
  const hits = [];
  const warnings = [];
  const text = String(source || '');
  FONT_SIZED_DIMENSION_RX.lastIndex = 0;
  let m;
  while ((m = FONT_SIZED_DIMENSION_RX.exec(text)) !== null) {
    const decl = m[0].replace(/\s+/g, ' ').trim();
    hits.push({ file: filePath, decl });
    warnings.push(
      `${filePath || '<style>'}: 控件尺寸用了字号乘数换算（${decl}）—— 乘数小数是 px 真值÷字号的反推残留，宿主主题 --fontSize 与设计稿不一致时尺寸失真。必须直写 Figma 真值 px（控件契约已下发 width/height）`
    );
  }
  return { hits, warnings };
}

/**
 * ② 跨文件同名 class 布局属性冲突检测。
 * @param {Object<string,string>} files 相对路径 → 内容
 * @returns {{conflicts: Array<{className: string, attrs: string[], lessFile: string, sfcFile: string}>, warnings: string[]}}
 */
export function findCrossFileClassRuleConflicts(files = {}) {
  const conflicts = [];
  const warnings = [];
  const lessRules = new Map(); // className -> {attrs:Set, file}
  const sfcRules = new Map();
  const mergeRules = (store, cls, attrs, file) => {
    if (!store.has(cls)) {
      store.set(cls, { attrs, file });
      return;
    }
    const prev = store.get(cls);
    for (const [attr, values] of attrs) {
      if (!prev.attrs.has(attr)) prev.attrs.set(attr, values);
      else for (const v of values) prev.attrs.get(attr).add(v);
    }
  };
  for (const [fp, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    if (/(^|\/)\.mc-gen\//.test(fp) || /(^|\/)node_modules\//.test(fp)) continue;
    const norm = String(fp).replace(/\\/g, '/');
    if (/\.less$/i.test(norm) && /resources\/styles\//.test(norm)) {
      for (const [cls, attrs] of extractTopLevelClassRules(content)) {
        mergeRules(lessRules, cls, attrs, norm);
      }
    } else if (/\.vue$/i.test(norm)) {
      for (const block of extractSfcStyleBlocks(content)) {
        for (const [cls, attrs] of extractTopLevelClassRules(block)) {
          mergeRules(sfcRules, cls, attrs, norm);
        }
      }
    }
  }
  for (const [cls, sfc] of sfcRules) {
    const less = lessRules.get(cls);
    if (!less) continue;
    const shared = [];
    for (const attr of CONFLICT_ATTRS) {
      const lv = less.attrs.get(attr);
      const sv = sfc.attrs.get(attr);
      if (!lv || !sv) continue;
      // 值集合有交集 ⇒ 双写但渲染结果一致（无害冗余）；完全不相交 ⇒ 静默覆盖冲突
      if ([...lv].some((v) => sv.has(v))) continue;
      shared.push(attr);
    }
    if (shared.length === 0) continue;
    conflicts.push({ className: cls, attrs: shared, lessFile: less.file, sfcFile: sfc.file });
    warnings.push(
      `${cls}: 布局属性 ${shared.join('/')} 在 ${less.file} 与 ${sfc.file}（scoped）取值不同 —— 同特异性下 @import 后到规则静默覆盖前者，容器/本体样式必须一处定义（本体用 SFC 内 :deep(.ant-btn)）`
    );
  }
  return { conflicts, warnings };
}

/**
 * 挂载入口（pre-write-self-healing 末步调用）：扫全部产物文件，只报不改。
 * @param {Object<string,string>} files 相对路径 → 内容
 * @returns {{warnings: string[], fontSizeSizing: number, classConflicts: number}}
 */
export function scanProductStyleIssues(files = {}) {
  const warnings = [];
  let fontSizeSizing = 0;
  let classConflicts = 0;
  for (const [fp, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    // 防御性排除：缓存/生成器内部目录不是产物本体（.mc-gen 里存有历史代码块副本，
    // 扫进去会把「产物已修复、缓存仍带病」误报成当前缺陷）
    if (/(^|\/)\.mc-gen\//.test(fp) || /(^|\/)node_modules\//.test(fp)) continue;
    if (/\.less$/i.test(fp) || /\.vue$/i.test(fp)) {
      const r = findFontSizeMultiplierSizing(content, fp);
      fontSizeSizing += r.hits.length;
      warnings.push(...r.warnings);
    }
  }
  const c = findCrossFileClassRuleConflicts(files);
  classConflicts = c.conflicts.length;
  warnings.push(...c.warnings);
  return { warnings, fontSizeSizing, classConflicts };
}
