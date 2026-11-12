/**
 * 🛡️ 2026-11-06（mc-max-1793918750638-8cfbd218 实锤）：**静态属性里不得写 `{{ }}`**。
 *
 * ## 病灶
 * 产物 `StatsSection.vue:14`：
 * ```html
 * class="c-vehicle-monitor-slot c-vehicle-monitor-slot--{{ item.key }}"
 * ```
 * Vue 的插值（mustache）**只在文本节点里生效**，属性值里的 `{{ }}` 是普通字符串 ⇒
 * 渲染出来就是字面量 `c-vehicle-monitor-slot--{{ item.key }}`：类名永远不生效
 * （首个状态项的高亮/区分色全丢），且 DOM 上出现 `{`/`}` 等非法类名。
 * LLM 把「拼接类名」写成了字符串模板，而同目录既有的类名守卫只查「类名是否存在于样式表」，
 * 对「属性内插值」是盲区（全仓 grep 零命中）。
 *
 * ## 判据（只认结构，零命名依赖）
 * 在 **template 区**内逐个静态属性扫：`name="value"` 且 `value` 含 `{{ expr }}`，且
 * `name` 不是绑定形态（不以 `:` / `@` / `#` 开头、不是 `v-*`）⇒ 改写为等价绑定：
 * ```html
 * :class="`c-vehicle-monitor-slot c-vehicle-monitor-slot--${item.key}`"
 * ```
 * 语义等价（Vue 的模板字面量插值），且不再依赖 mustache-in-attribute 这种不存在的语法。
 *
 * ## fail-open（宁不改也不改坏）
 * - 表达式里含反引号或 `${`（无法安全嵌入模板字面量）⇒ 跳过并计数；
 * - 命中 `<script>` / `<style>` 区（区间屏蔽，只在模板区改写）；
 * - 文件不是 .vue / 取值失败 ⇒ 原样返回。
 *
 * ## 与既有守卫的关系
 * 不改 `validateVueSfc`（它只报语法错，属性内 mustache 是**合法字符串**、不会报错），
 * 也不改类名补前缀/类名存在性检查（那是另一个域）。本模块是「属性值语法形态」的唯一出口。
 */

/** 标签扫描：属性值里的 `>` 不参与闭合判定（引号内整段跳过）。 */
const TAG_RX = /<([a-zA-Z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
/** 属性扫描（只在已截出的属性串里跑）。 */
const ATTR_RX = /([A-Za-z_][\w:.\-[\]$]*)(\s*=\s*)("([^"]*)"|'([^']*)')/g;
const MUSTACHE_RX = /\{\{([\s\S]*?)\}\}/g;

/** 是否绑定形态的属性名（这些本来就允许表达式，不改）。 */
function isBindingName(name) {
  return /^[:@#]/.test(name) || /^v-/.test(name);
}

/**
 * 把一个含 mustache 的静态属性值转成模板字面量表达式。
 * @returns {string|null} 表达式源码；无法安全转换返回 null
 */
export function toTemplateLiteralExpr(value) {
  let safe = true;
  const expr = String(value).replace(MUSTACHE_RX, (_m, inner) => {
    const code = String(inner).trim();
    if (!code || code.includes('`') || code.includes('${')) {
      safe = false;
      return '';
    }
    // 模板字面量里反斜杠/引号无需转义，仅 ` 与 ${ 需要（已挡）
    return `\${${code}}`;
  });
  if (!safe) return null;
  // 值里若含反引号，无法作为模板字面量载体
  if (expr.includes('`')) return null;
  return `\`${expr}\``;
}

/**
 * 改写文件表里所有「静态属性内插值」。
 *
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {{logger?:object}} [options]
 * @returns {{rewritten: Array<{file:string, attr:string, from:string, to:string}>, skipped: Array<{file:string, attr:string, reason:string}>}}
 */
export function rewriteAttributeInterpolation(files, options = {}) {
  const report = { rewritten: [], skipped: [] };
  if (!files || typeof files !== 'object') return report;

  for (const [path, content] of Object.entries(files)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;

    // 🔴 2026-11-06（自测发现）：**不要拿 extractSfcTemplate 的结果做 content.replace**
    //   —— 该函数返回的是**规范化副本**（行尾/缩进可能不同），真机文件 `includes(tpl)=false`
    //   ⇒ 替换静默失败却仍上报 rewritten（假绿）。改为「按区间替换」：
    //   先在全文上定位 `<script>/<style>` 屏蔽区，再在其余区间扫标签，从后往前写回。
    const maskedRanges = [];
    for (const m of content.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
      maskedRanges.push([m.index, m.index + m[0].length]);
    }
    const isMasked = (i) => maskedRanges.some(([a, b]) => i >= a && i < b);

    const edits = []; // {start, end, text}
    TAG_RX.lastIndex = 0;
    let tm;
    while ((tm = TAG_RX.exec(content)) !== null) {
      if (isMasked(tm.index)) continue;
      const [tag, tagName, attrs] = tm;
      let tagChanged = false;
      const nextAttrs = attrs.replace(ATTR_RX, (full, name, eq, quoted, dq, sq) => {
        if (isBindingName(name)) return full;
        const raw = dq != null ? dq : sq != null ? sq : '';
        if (!raw.includes('{{')) return full;
        const expr = toTemplateLiteralExpr(raw);
        if (!expr) {
          report.skipped.push({ file: path, attr: name, reason: 'unsafe-expr' });
          return full;
        }
        tagChanged = true;
        report.rewritten.push({ file: path, attr: name, from: raw, to: expr });
        // 用单引号定界包表达式（表达式内允许出现双引号）
        return `:${name}${eq}'${expr}'`;
      });
      if (!tagChanged) continue;
      edits.push({
        start: tm.index,
        end: tm.index + tag.length,
        text: `<${tagName}${nextAttrs}>`,
      });
    }

    if (edits.length === 0) continue;
    let next = content;
    for (let i = edits.length - 1; i >= 0; i -= 1) {
      const e = edits[i];
      next = `${next.slice(0, e.start)}${e.text}${next.slice(e.end)}`;
    }
    files[path] = next;
  }

  const logger = options.logger;
  if (logger && (report.rewritten.length > 0 || report.skipped.length > 0)) {
    // 计数行恒打（0 也打由调用方决定）：「属性内插值已修」与「判据没跑」必须可区分
    logger.info(
      `🛡️ 属性内插值归一: rewritten=${report.rewritten.length} skipped=${report.skipped.length}`,
      {
        samples: report.rewritten.slice(0, 4),
        skipped: report.skipped.slice(0, 4),
      },
    );
  }
  return report;
}
