/**
 * @file class-facts.js — 🛡️ P1.1（2026-09-11）：**类名事实的单一采集实现**。
 *
 * 背景（设计文档 docs/P1-类名结构单一事实源-方案-2026-09-11.md §0）：
 * 同一批 class 被 5 条变换链各自推导（实例前缀 / 模板前缀化 / scoped 短类↔DOM 长类重写 /
 * 结构类生成 / 修复器自造方言），互不知情 → 三例事故：
 *   ① lazy `</template>` 截断致标签丢失；② 资源占位 selector 断裂；③ `--active` 修饰符被剥。
 *
 * 本模块把「DOM 实际类集合」的采集收敛为一处，供 consolidator / class-prefix-fixer /
 * code-healer / artifact-invariants 共用（禁止各自再解析模板 class）。
 *
 * 🔴 关键语义：**修饰符（`--mod` / `-active`）逐字保留，禁止跨修饰符合并到同一键**。
 *    旧实现（style-class-consolidator#registerClassToken）用「剥修饰符的基名」做键 +
 *    first-wins → `X` 与 `X--active` 互相抢占，攻击面随模板属性书写顺序漂移。
 *
 * jest 安全：无 import.meta。
 */

/**
 * 修饰符别名表（可扩展）。未登记别名按字面处理（I7 会给 warning 提示补表）。
 * 键：别名形态（小写）；值：标准形态。
 */
export const MODIFIER_ALIASES = {
  'is-active': '--active',
  'active': '--active',
  '-active': '--active',
  '--on': '--active',
  'is-on': '--active',
  'is-selected': '--selected',
  'is-disabled': '--disabled',
};

/** 提取 tailwind 风格修饰符别名（无 -- 前缀的 active 等），仅用于归一判定 */
export function normalizeModifierSuffix(suffix = '') {
  const s = String(suffix).toLowerCase();
  if (!s) return '';
  // 先查别名表（含 `--on` 这类已登记的 BEM 别名），再落默认规则
  if (MODIFIER_ALIASES[s]) return MODIFIER_ALIASES[s];
  if (s.startsWith('--')) return s;
  // 单横线形态（-active）与布尔类（is-active / active）统一到 -- 形态
  const bare = s.replace(/^-+/, '');
  if (bare === 'active' || bare === 'on') return '--active';
  return `--${bare}`;
}

/**
 * 拆分「语义基名 + 修饰符后缀」（后缀原样保留，不做归一）。
 * 仅识别 `--mod` 形态（BEM 标准）。`-active` 单横线形态按 -active 整体视为后缀（兼容旧产物）。
 * @param {string} cls 类名（不含 . 前缀）
 * @returns {{base:string, suffix:string}}
 */
export function splitModifier(cls = '') {
  const s = String(cls);
  const i = s.indexOf('--');
  if (i > 0) return { base: s.slice(0, i), suffix: s.slice(i) };
  // 兼容单横线激活类（c-x-item-active），仅当尾段恰为 active/on/selected/disabled 时切分
  const m = s.match(/^(.*?)-(active|on|selected|disabled)$/);
  if (m && m[1]) return { base: m[1], suffix: `-${m[2]}` };
  return { base: s, suffix: '' };
}

/** 是否含修饰符（用于 I7 与统计） */
export function hasModifier(cls = '') {
  return splitModifier(cls).suffix !== '';
}

/**
 * 布尔式修饰符类（`is-active` / `active` / `is-on` …）语义：修饰符不绑定具体基名
 * （任意基名元素挂上即生效），一致性判定按「通配修饰符」处理。
 * 单一实现：门禁（CODE-024）与不变量（I7）共用。
 */
export function isAliasModifierToken(tok = '') {
  const t = String(tok).toLowerCase();
  if (MODIFIER_ALIASES[t]) return true;
  if (MODIFIER_ALIASES[t.replace(/^is-/, '')]) return true;
  return false;
}

/**
 * 归一修饰符键：BEM → `baseLower--mod`；布尔别名 → `*--mod`（通配基名）。
 * 无修饰符返回 ''。
 */
export function modifierKeyOf(tok = '') {
  const t = String(tok).toLowerCase();
  if (isAliasModifierToken(t)) {
    const bare = t.replace(/^is-/, '');
    return `*${normalizeModifierSuffix(MODIFIER_ALIASES[t] ? t : bare)}`;
  }
  const { base, suffix } = splitModifier(t);
  if (!suffix) return '';
  return `${base.toLowerCase()}${normalizeModifierSuffix(suffix)}`;
}

/**
 * 🛡️ 刀 11a（D1，2026-09-13）：提取**顶层属性键**（对象字面量 `{ k: expr, ... }`）。
 * 值位置是 JS 表达式（不是类名），必须整段丢弃——这正是「`selectedSwitch === 'active'`
 * 里的 `'active'` 被当成类名」的入口。
 * @param {string} objText 形如 `{ ... }` 的文本
 * @returns {string[]} 键列表（引号串取内容 / 计算键 `['a']` 取内层 / 裸标识符原样）
 */
function extractTopLevelObjectKeys(objText = '') {
  const raw = String(objText);
  // 剥掉最外层花括号，只扫「属性层」（否则外部 `{` 会让 depth 从 1 起算，属性永不被切分）
  const open = raw.indexOf('{');
  const close = raw.lastIndexOf('}');
  const s = open >= 0 && close > open ? raw.slice(open + 1, close) : raw;
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== ch) {
        if (s[j] === '\\') j += 1;
        j += 1;
      }
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const keys = [];
  for (const p of parts) {
    // 取该属性「深度 0 处」的第一个冒号，之前即键（值位置整段丢弃）
    let key = String(p);
    let d = 0;
    for (let i = 0; i < key.length; i++) {
      const ch = key[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < key.length && key[j] !== ch) {
          if (key[j] === '\\') j += 1;
          j += 1;
        }
        i = j;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') d += 1;
      else if (ch === '}' || ch === ']' || ch === ')') d -= 1;
      else if (ch === ':' && d === 0) {
        key = key.slice(0, i);
        break;
      }
    }
    let k = key.trim();
    const m = /^["'`]([\s\S]*)["'`]$/.exec(k);
    if (m) k = m[1];
    const m2 = /^\[\s*["'`]([\s\S]*?)["'`]\s*\]$/.exec(k.trim());
    if (m2) k = m2[1];
    k = k.trim();
    if (k) keys.push(k);
  }
  return keys;
}

/**
 * 🛡️ 刀 11a（D1）：遮掉「表达式位置」的字符串字面量（比较运算两侧 / 函数调用实参）。
 * 剩下的引号文本才是类名位置。
 * @param {string} v
 * @returns {string} 掩码后的文本（占位符不含引号）
 */
function maskExpressionLiterals(v = '') {
  let s = String(v);
  // ① 函数调用实参：`ident(...)` / `.method(...)` / `](...)`（跑两轮覆盖一层嵌套）
  for (let round = 0; round < 2; round += 1) {
    s = s.replace(/([\w$)\]])\s*\(([^()]*)\)/g, (m, head, inner) =>
      /["']/.test(inner) ? `${head}(/*expr*/)` : m,
    );
  }
  // ② 比较运算两侧的字面量（`x === 'active'` / `'a' === x`）
  s = s.replace(/(===|!==|==|!=|<=|>=|[<>])\s*(["'])([^"']*)\2/g, (m, op) => `${op}/*expr*/`);
  s = s.replace(/(["'])([^"']*)\1\s*(===|!==|==|!=|<=|>=|[<>])/g, (m, _q, _c, op) => `/*expr*/${op}`);
  return s;
}

/**
 * 🛡️ 刀 11a（D1，2026-09-13）：从 class / :class 绑定值中提取**类名位置**的 token。
 *
 * 缺陷（实测事故 `mc-1789284222821-075b13a4`）：旧实现用 `/["']([^"']+)["']/g`
 * **无差别**抓取引号内文本，把 JS 表达式里的字符串字面量也当成类名：
 *   `:class="{ 'c-…--selected': selectedSwitch === 'active' }"` → 提取出伪造 token `active`
 *   → 门禁 C1（非标准修饰符方言）+ C3（无对应样式规则）双双误报（并污染 C4 判定面）。
 * 与刀 7d「资源引用扫描把值当引用」属同一缺陷类：**扫描前必须先剥离表达式位置**。
 *
 * 判定（确定性，不引 JS 解析器）：
 *   ① 纯静态 class（无 `{ [ ] :` 结构、无引号）→ 空格拆分；
 *   ② 对象字面量 `{ ... }` → **只取顶层属性键**（裸标识符键也是类名）；
 *   ③ 其它（数组 / 三元 / 字符串字面量）→ 先遮表达式位置字面量，再取剩余引号文本
 *      （内容再按空格拆，兼容 `:class="'a b'"`）。
 * @param {string} value 属性值（不含外层引号）
 * @returns {string[]}
 */
export function extractClassTokensFromBindingValue(value = '') {
  const out = [];
  const v = String(value == null ? '' : value).trim();
  if (!v) return out;

  // ① 纯静态 class
  if (!/[{}[\]:]/.test(v) && !/["'`]/.test(v)) {
    return v.split(/\s+/).filter(Boolean);
  }
  // ② 对象字面量 → 仅键
  if (v.startsWith('{')) {
    for (const k of extractTopLevelObjectKeys(v)) {
      for (const t of k.split(/\s+/)) if (t) out.push(t);
    }
    return out;
  }
  // ③ 其它形态 → 值位置字面量
  const masked = maskExpressionLiterals(v);
  for (const sm of masked.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    for (const t of sm[1].trim().split(/\s+/)) if (t) out.push(t);
  }
  return out;
}

/**
 * 从 SFC 模板文本提取 DOM 实际出现的 class token（原样保留，含修饰符）。
 * 覆盖：静态 class 属性、:class 字符串数组、:class 对象字面量的 key、纯静态空格拆分。
 * 🛡️ 刀 11a：`:class` 的值统一改走 extractClassTokensFromBindingValue（剥离表达式位置字面量）。
 * @param {string} templateText
 * @returns {string[]} 去重后的 token 列表（保持出现顺序）
 */
export function collectDomTokensFromTemplate(templateText = '') {
  const out = [];
  const seen = new Set();
  const push = (tok) => {
    const t = String(tok || '').trim();
    if (!t || /\s/.test(t)) return;
    if (!/^-?[a-zA-Z][\w-]*$/.test(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  if (!templateText) return out;
  const attrRe = /(?:^|\s)(?:class|:class)\s*=\s*["']/gi;
  let m;
  while ((m = attrRe.exec(templateText))) {
    const quote = m[0].slice(-1);
    const start = m.index + m[0].length;
    let end = -1;
    for (let i = start; i < templateText.length; i++) {
      if (templateText[i] === '\\') {
        i += 1;
        continue;
      }
      if (templateText[i] === quote) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const value = templateText.slice(start, end);
    // 🛡️ 刀 11a：只取「类名位置」的 token（表达式里的字符串字面量一律剔除）
    for (const tok of extractClassTokensFromBindingValue(value)) push(tok);
  }
  return out;
}

/**
 * 单文件类事实。
 * @typedef {Object} FileClassFact
 * @property {string[]} exact                 所有 DOM token（原样）
 * @property {Object<string,string>} index    小写 token → 原样 token（精确命中）
 * @property {Object<string,{bare:string[],mods:Object<string,string[]>}>} bases
 *            语义基名(小写) → 无修饰符 token 与 各修饰符后缀 → token 列表（**不跨修饰符合并**）
 */

/**
 * 采集单文件类事实（唯一实现）。
 * @param {string} templateText SFC 模板块文本
 * @returns {FileClassFact}
 */
export function collectFileClassFact(templateText = '') {
  const exact = collectDomTokensFromTemplate(templateText);
  const index = {};
  const bases = {};
  const register = (tok, { alias = false, verbatim = null } = {}) => {
    const vToken = verbatim || tok;
    const lower = tok.toLowerCase();
    // 真实 token 优先：别名只在键缺失时补位（混合 DOM 时短类真实存在 → 不会被长类别名顶掉）
    if (!alias || !index[lower]) index[lower] = vToken;
    const { base, suffix } = splitModifier(tok);
    const key = base.toLowerCase();
    if (!bases[key]) bases[key] = { bare: [], mods: {} };
    if (!suffix) {
      if (!bases[key].bare.includes(vToken)) bases[key].bare.push(vToken);
    } else {
      const sk = suffix.toLowerCase();
      if (!bases[key].mods[sk]) bases[key].mods[sk] = [];
      if (!bases[key].mods[sk].includes(vToken)) bases[key].mods[sk].push(vToken);
      // 🛡️ 刀 11b（D2，2026-09-13）：单横线形态（`-active`）**有歧义**——`c-device-monitor-active`
      // 既是「语义类名（active 卡片）」，也可能被读成「`-active` 旧产物修饰符」。契约层已用
      // isContractModifier 只认 `--mod` 与布尔别名来排除误判，但 bases 分组（C2/C4 的 DOM 事实源）
      // 仍按 splitModifier 判定 → `bare` 为空 → domAllBases 缺该基名 → C2 误报「基类不在 DOM」
      // （实测 `.c-device-monitor-active--selected` 的基类被判不在 DOM）。
      // 治本：单横线形态**额外**把 token 登记为其自身基名的 bare（双登记，纯增量、不移除既有能力）。
      if (/^-[^-]/.test(suffix)) {
        const selfKey = tok.toLowerCase();
        if (!bases[selfKey]) bases[selfKey] = { bare: [], mods: {} };
        if (!bases[selfKey].bare.includes(vToken)) bases[selfKey].bare.push(vToken);
      }
    }
  };
  // ① 真实 DOM token（原样）
  for (const tok of exact) register(tok);
  // ② 实例前缀长类的「内层语义」别名：c-{instanceId}-c-x-item(--mod) → c-x-item(--mod)
  //    仅为缺失键补位；修饰符逐字保留（不跨修饰符合并）。这是 ④ #648/#649「scoped 短类
  //    对齐 DOM 长类」的匹配依据（旧 registerClassToken 的 indexOf('-c-') 语义，已收口至此）。
  for (const tok of exact) {
    const idx = tok.toLowerCase().indexOf('-c-');
    if (idx <= 0) continue;
    register(tok.slice(idx + 1), { alias: true, verbatim: tok });
  }
  return { exact, index, bases };
}

/**
 * 解析「scoped 选择器里的类」在 DOM 中应写成什么。
 * 顺序（确定性，与书写顺序无关）：
 *   ① 精确命中（DOM 有同名 token，含修饰符）→ 直接用；
 *   ② 基名 + 后缀组合命中（DOM 有该修饰符形态）→ 用 DOM 形态；
 *   ③ 基名无修饰符形态唯一 → 重组 `DOM基名 + 后缀`（保留后缀原样）；
 *   ④ 基名多形态（长短并存）→ 返回全部候选（调用方逗号双写）；
 *   ⑤ 无命中 → null（fail-open 保留原选择器）。
 * @param {FileClassFact} fact
 * @param {string} cls 选择器中的类名（不含 .）
 * @returns {{variants: string[]}|null}
 */
export function resolveDomClass(fact, cls = '') {
  if (!fact || !cls) return null;
  const lower = String(cls).toLowerCase();
  if (fact.index?.[lower]) return { variants: [fact.index[lower]] };
  const { base, suffix } = splitModifier(cls);
  const bucket = fact.bases?.[base.toLowerCase()];
  if (!bucket) return null;
  if (suffix) {
    const hit = bucket.mods?.[suffix.toLowerCase()];
    if (hit && hit.length > 0) return { variants: [...hit] };
    if (bucket.bare?.length === 1) {
      return { variants: [`${bucket.bare[0]}${suffix}`] };
    }
    if (bucket.bare?.length > 1) return { variants: bucket.bare.map((b) => `${b}${suffix}`) };
    return null;
  }
  if (bucket.bare?.length === 1) return { variants: [bucket.bare[0]] };
  if (bucket.bare?.length > 1) return { variants: [...bucket.bare] };
  return null;
}

/**
 * 采集产物级类事实（唯一入口；consolidator / prefix-fixer / invariants 共用）。
 * @param {Object<string,string>|Array<{path:string,content:string}>} files
 * @param {{instancePrefix?:string}} [options]
 * @returns {{byFile:Object<string,FileClassFact>, instancePrefix:string, source:string}}
 */
export function collectClassFacts(files, options = {}) {
  const list = Array.isArray(files)
    ? files
    : Object.entries(files || {}).map(([path, content]) => ({ path, content }));
  const byFile = {};
  for (const f of list) {
    const p = String(f?.path || '');
    const c = f?.content;
    if (!p.endsWith('.vue') || typeof c !== 'string') continue;
    const tplStart = c.search(/<template\b[^>]*>/i);
    if (tplStart < 0) continue;
    const rest = c.slice(tplStart);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    const tpl = endIdx > 0 ? rest.slice(0, endIdx) : rest;
    byFile[p] = collectFileClassFact(tpl);
  }
  return {
    byFile,
    instancePrefix: options?.instancePrefix || '',
    source: options?.source || 'collect-class-facts',
  };
}
