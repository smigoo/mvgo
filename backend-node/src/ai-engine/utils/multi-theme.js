/**
 * 多主题 Figma 输入 —— 主题规范化与槽位装配（N 主题 · 2026-10-12）
 *
 * 背景：原双主题实现把「浅色/深色」硬编码贯穿 DTO / styleTokens / 渲染 / 前端，
 * 扩到第 3 个主题（如「黄昏模式」）时无处落脚。本模块把**主题当作数组**处理，
 * light/dark 只是「默认名 + 自动判明暗」的特例，而非数据结构本身。
 *
 * 三条设计决策（2026-10-12 与用户确认）：
 *  1. **默认名 + 用户可改**：第 1 个默认「浅色」、第 2 个「深色」，其余用用户自填名；
 *  2. **自动判明暗**：每个主题由实测明暗归入 light/dark 分组（决定用哪套底色），
 *     但**对外显示名是用户填的名字** —— 「黄昏模式」可以是深色底。
 *  3. slug 与显示名分离：`key`（CSS 类名/内部寻址，kebab-safe、唯一）
 *     与 `name`（展示用，用户原文）分开，避免中文名污染样式。
 *
 * 纯函数、无副作用 ⇒ 可离线验证（配套 scripts/verify-multi-theme.mjs）。
 */

/** 内置主题的默认显示名（前两个沿用双主题时的叫法，用户可改） */
export const DEFAULT_THEME_NAMES = ['浅色', '深色'];

/** 组装阶段的错误码（与 dual-truth-figma 命名风格一致，便于前端统一映射文案） */
export const MULTI_THEME_ERROR_CODES = {
  MISSING_NODE_ID: 'MULTI_THEME_MISSING_NODE_ID',
  INVALID_URL: 'MULTI_THEME_INVALID_URL',
  DUPLICATE_NODE: 'MULTI_THEME_DUPLICATE_NODE',
  DUPLICATE_NAME: 'MULTI_THEME_DUPLICATE_NAME',
  FETCH_FAILED: 'MULTI_THEME_FETCH_FAILED',
  FORBIDDEN: 'MULTI_THEME_FORBIDDEN',
  RATE_LIMITED: 'MULTI_THEME_RATE_LIMITED',
  NODE_NOT_FOUND: 'MULTI_THEME_NODE_NOT_FOUND',
  BRIGHTNESS_MISMATCH: 'MULTI_THEME_BRIGHTNESS_MISMATCH',
  TOO_MANY: 'MULTI_THEME_TOO_MANY',
};

/** 上限：超过则拒绝。设 8 是为编译性能留余量（每主题一套 mixin）。 */
export const MAX_THEMES = 8;

const ERROR_TITLES = {
  [MULTI_THEME_ERROR_CODES.MISSING_NODE_ID]: '主题设计稿缺少节点 ID',
  [MULTI_THEME_ERROR_CODES.INVALID_URL]: '主题设计稿链接无效',
  [MULTI_THEME_ERROR_CODES.DUPLICATE_NODE]: '重复的设计稿',
  [MULTI_THEME_ERROR_CODES.DUPLICATE_NAME]: '主题名称重复',
  [MULTI_THEME_ERROR_CODES.FETCH_FAILED]: '主题设计稿拉取失败',
  [MULTI_THEME_ERROR_CODES.FORBIDDEN]: '主题设计稿无访问权限',
  [MULTI_THEME_ERROR_CODES.RATE_LIMITED]: 'Figma 接口限流',
  [MULTI_THEME_ERROR_CODES.NODE_NOT_FOUND]: '主题设计稿节点不存在',
  [MULTI_THEME_ERROR_CODES.BRIGHTNESS_MISMATCH]: '主题设计稿明暗异常',
  [MULTI_THEME_ERROR_CODES.TOO_MANY]: '主题数量超限',
};

/**
 * 名称 → CSS/Less 安全 key（slug）。
 *
 * 🔴 **key 必须是纯 ASCII**（2026-10-12 真机实测修正）：
 *   我最初「保留中文」是错的 —— CSS 类名 `.theme-浅色` 能过，但 **Less mixin 名
 *   `.theme-浅色()` 过不了**，编译报 `Missing closing ')'`（实测：英文 mixin OK、
 *   中文 mixin FAIL）。key 会进 `.theme-<key>()` mixin 名，所以**不能有中文**。
 *   中文只保留在 `name`（显示名）里。
 *
 * 规则：去首尾空白 → 空白/下划线/点号 → `-` → **仅保留 [a-zA-Z0-9-]**
 *      → 连续 `-` 合并 → 去首尾 `-`；空则回退 `theme-<n>`。
 *   ⚠️ 若名字纯中文（如「黄昏模式」），slug 结果为空 ⇒ 回退到 `theme-<n>`。
 *      这会让 key 不体现名字，但**稳定性与可编译性优先**；显示名仍是用户填的名字。
 *
 * @param {string} name 显示名
 * @param {number} index 序号（用于空名/纯中文回退）
 * @returns {string}
 */
/**
 * 名称 → **JS 标识符 + Less mixin** 双安全 key（slug）。
 *
 * 🔴🔴 key 的字符集被**两处同时**约束（都是真机踩出来的，缺一不可）：
 *   1. **Less mixin 名** `.theme-<key>()` 不接受非 ASCII（中文）—— 报
 *      `Missing closing ')'`（实测 `.theme-light()` OK、`.theme-浅色()` FAIL）；
 *   2. **JS 标识符** `const <key> = {}` / `export { <key> }` **不接受连字符** ——
 *      `const theme-1 = {}` 被解析成减法表达式 `theme - 1` ⇒ 整个 css-vars.js
 *      语法错误 ⇒ 前端 `import()` 抛 `Missing initializer in const declaration`
 *      ⇒ **所有** CSS 变量静默注入失败（实测 2026-10-12，三套主题的变量全为空）。
 *
 *   ⇒ 取两处交集：**`[a-zA-Z][a-zA-Z0-9_]*`**（首字符必字母，后续可数字/下划线）。
 *      分隔符统一用**下划线 `_`**：JS 标识符合法，Less 类名 `.theme-a_b` 也合法。
 *      中文只保留在 `name`（显示名）。
 *
 * 纯中文名（如「黄昏模式」）slug 后为空 ⇒ 回退 `theme_<n>`，功能完整。
 *
 * @param {string} name 显示名
 * @param {number} index 序号（用于回退）
 * @returns {string}
 */
export function slugifyThemeName(name, index = 0) {
  const raw = String(name || '').trim();
  if (!raw) return `theme_${index + 1}`;
  // ⚠️ 必须剔除全部非 ASCII（含中文）与连字符 —— 见上方注释
  const slug = raw
    .replace(/[\s._-]+/g, '_') // 空白/点/下划线/连字符 → 统一分隔符 _
    .replace(/[^a-zA-Z0-9_]/g, '') // 剔除中文与特殊符号
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  // 🔴 首字符必须是字母（`const 1theme` 非法）
  return /^[a-zA-Z]/.test(slug) && slug ? slug : `theme_${index + 1}`;
}

/**
 * 🔴 2026-10-12 key 分配规则（用户决策 + mc-check M3-13）。
 *
 * 规则：
 * 1. **`light` 保留给浅色** —— 用户可占用（显示名填「浅色/亮色/light」⇒ key=light）。
 * 2. **`dark` 是系统占位，用户不得占用** —— mc-check M3-13 强制
 *    `themeConfig.list` 含 `key="dark"`，M4-10 又锁死其三核心色值；
 *    用户的深色稿**一律走自定义 key**，色值真值另存自定义变量（避开 M4-10 三个核心名）。
 * 3. 其余（更多浅色 / 任何深色系如「黄昏模式」「夜幕」）→ 用户自定义 slug，
 *    纯中文回退 `主题<N>`。
 *
 * @param {Object} p
 * @param {string} p.name        显示名
 * @param {string} [p.brightness] 用户标注的明暗（'light'|'dark'|''）
 * @param {Set<string>} p.usedKeyNames 已占用的 key
 * @param {number} p.index       序号（回退命名用）
 * @returns {string}
 */
export function resolveThemeKey({ name, brightness, usedKeyNames, index = 0 }) {
  const used = usedKeyNames instanceof Set ? usedKeyNames : new Set();
  const slug = slugifyThemeName(name, index);
  const declared = String(brightness || '').trim().toLowerCase();

  // ① 显式命中保留名：显示名本身就是 light / dark（或其大小写变体）
  const lower = String(slug).toLowerCase();
  if (lower === 'light') return 'light';
  if (lower === 'dark') {
    // ⚠️ 用户把某个主题命名为 dark —— 但 dark 归系统占位。
    //   若已有别的浅色占了 light，则按普通自定义名处理（不静默占用 dark）。
    return used.has('light') ? slugifyThemeName(`${name}_theme`, index) : 'light';
  }

  // 🔴 2026-10-12：中文显示名也要能识别浅色，否则「浅色」会被 slug 剔除中文后
  //   回退成 `theme_1`（真机 80092f38 的根因之一：用户没填 brightness 时，
  //   前端默认名「浅色/深色」被当普通名处理 ⇒ light/dark 双双丢失）。
  //   仅识别**明确**的浅色词，避免「米白/浅灰」这类浅色调被误判（它们走自定义）。
  const LIGHT_NAME_RE = /^(浅|亮|白|light)/i;
  if ((declared === 'light' || (!declared && LIGHT_NAME_RE.test(String(name).trim()))) &&
      !used.has('light')) {
    return 'light';
  }

  // ③ 其余走自定义 slug（dark 系列也走这里，天然避开 dark 保留名）
  return slug;
}

/**
 * 规范化主题输入数组。
 *
 * @param {Array<{fileKey?:string,nodeId?:string,name?:string,label?:string}>} inputs
 *        用户填的主题行（可含空行 —— 空行会被剔除，不是错误）
 * @param {Object} [opts]
 * @param {number} [opts.max=MAX_THEMES]
 * @returns {{themes:Array, errors:Array<{code:string,detail:string,index:number}>}}
 *          错误**不抛出**：只要还有有效主题就继续（部分可用），
 *          但若一个都没有则由调用方阻断（fail-closed）。
 */
export function normalizeThemeInputs(inputs = [], { max = MAX_THEMES } = {}) {
  const errors = [];
  const themes = [];
  const usedKeys = new Set();
  const usedNames = new Set();
  /** 已占用的 key 名（不含冲突后缀），供 resolveThemeKey 避开 light/dark 保留位 */
  const usedKeyNames = new Set();

  const list = Array.isArray(inputs) ? inputs : [];

  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const fileKey = String(raw.fileKey || '').trim();
    const nodeId = String(raw.nodeId || '').trim();

    // 整行为空 ⇒ 静默跳过（用户点了「+」还没填，不是错误）
    if (!fileKey && !nodeId && !String(raw.name || '').trim()) return;

    // 填了名字但没填链接 ⇒ 错误（拖到生成时才发现会白跑一次 Figma）
    if (!fileKey || !nodeId) {
      errors.push({
        code: MULTI_THEME_ERROR_CODES.MISSING_NODE_ID,
        detail: fileKey ? '缺少 node-id' : '缺少 file key',
        index,
      });
      return;
    }

    // 显示名：用户填的优先，否则取前两个默认名
    const userName = String(raw.name || raw.label || '').trim();
    const displayName =
      userName || DEFAULT_THEME_NAMES[index] || `主题 ${index + 1}`;

    // 重名拒绝（展示上无法区分），但允许不同名同稿？不 —— 同稿更致命
    if (usedNames.has(displayName)) {
      errors.push({
        code: MULTI_THEME_ERROR_CODES.DUPLICATE_NAME,
        detail: `主题名「${displayName}」重复`,
        index,
      });
      return;
    }
    usedNames.add(displayName);

    // 同稿拒绝：两主题同源 ⇒ 那一侧不是独立真值，双真值静默失效
    const nodeKey = `${fileKey}::${nodeId}`;
    if (usedKeys.has(nodeKey)) {
      errors.push({
        code: MULTI_THEME_ERROR_CODES.DUPLICATE_NODE,
        detail: '多个主题指向同一个 Figma 节点',
        index,
      });
      return;
    }
    usedKeys.add(nodeKey);

    // 🔴 2026-10-12 key 分配新规（用户决策 + mc-check M3-13 硬约束）：
    //   - `light` 保留给**浅色**主题（用户可占用）
    //   - `dark` **恒为系统占位**（mc-check M3-13 强制 `themeConfig.list` 含 key="dark"，
    //     且 M4-10 锁死其三核心色值）⇒ 用户主题**不得**使用 `dark` 作 key
    //   - 其余（更多浅色 / 任何深色系如「黄昏模式」）→ 用户自定义 slug，纯中文回退 `主题N`
    //
    //   背景：旧逻辑 `slugifyThemeName('浅色')` 因剔除中文而回退成 `theme_1`，
    //   **把 light/dark 全丢了** ⇒ 产物 `themeConfig.list` 无 `key="dark"` ⇒ M3-13 判死
    //   （真机 c-aiot-dpjh-bsjd-80092f38 实测）。
    const declaredBrightness = String(raw.brightness || '').trim();
    const preferredKey = resolveThemeKey({
      name: displayName,
      brightness: declaredBrightness,
      usedKeyNames,
      index,
    });

    // key 冲突（两个不同名 slug 成同一个）⇒ 加序号后缀，不静默覆盖
    let key = preferredKey;
    let n = 2;
    while (usedKeys.has(`key:${key}`)) {
      key = `${preferredKey}-${n++}`;
    }
    usedKeys.add(`key:${key}`);
    usedKeyNames.add(preferredKey);

    themes.push({
      key,
      name: displayName,
      fileKey,
      nodeId,
      index,
      // 供下游（style-tokens / declare.json）判定该 key 是不是 light/dark 保留位
      brightness: declaredBrightness || null,
      // 🔴 2026-10-12：透传该主题的预览图 URL（前端「填URL 阶段强制预览」的产物）。
      //   ⚠️ **这里若不显式透传，字段会被静默丢弃、零报错**（normalizeThemeInputs
      //   是白名单式构造对象，不 spread 原始 raw）—— 与 2026-10-10 `secondaryNode`
      //   丢失是同一类坑，务必保持同步。
      previewImageUrl: String(raw.previewImageUrl || '').trim() || null,
    });
  });

  if (themes.length > max) {
    errors.push({
      code: MULTI_THEME_ERROR_CODES.TOO_MANY,
      detail: `最多支持 ${max} 个主题，当前 ${themes.length} 个`,
      index: -1,
    });
  }

  return { themes: themes.slice(0, max), errors };
}

/**
 * 按**实测明暗**把主题分组（决策 2）。
 *
 * 注意：分组只决定「这个主题用哪套结构底色」，显示名仍是用户的。
 * 同一明暗组内的多个主题（如两个深色主题）共享底色，但各自取自己的三核心真值。
 *
 * @param {Array} themes normalizeThemeInputs 的 themes
 * @param {(nodeData:Object, fallback:'light'|'dark') => 'light'|'dark'} resolveBrightness
 * @param {Array<Object>} nodeDataByKey 各主题的 Figma 节点树（key → nodeData）
 * @returns {{light:Array, dark:Array, entries:Array}}
 */
export function groupThemesByBrightness(themes = [], resolveBrightness, nodeDataByKey = {}) {
  const entries = themes.map((t) => {
    const brightness = resolveBrightness(nodeDataByKey[t.key], 'dark');
    return { ...t, brightness };
  });
  return {
    entries,
    light: entries.filter((e) => e.brightness === 'light'),
    dark: entries.filter((e) => e.brightness === 'dark'),
  };
}

/**
 * 选择默认主题（`themeConfig.default` 用）。
 *
 * 规则：用户显式指定的主稿 > 第一份设计稿实测明暗对应的那类 > 第一个主题。
 * 理由：主稿决定结构，用户最熟悉它，把它设为默认最符合直觉。
 *
 * @param {Array} entries groupThemesByBrightness 的 entries
 * @param {string|null} preferredKey 用户指定的主稿 key（可选）
 * @returns {{key:string, brightness:string, name:string}}
 */
export function pickDefaultTheme(entries = [], preferredKey = null) {
  if (entries.length === 0) {
    return { key: 'dark', brightness: 'dark', name: '深色' };
  }
  if (preferredKey) {
    const hit = entries.find((e) => e.key === preferredKey);
    if (hit) return { key: hit.key, brightness: hit.brightness, name: hit.name };
  }
  const first = entries[0];
  return { key: first.key, brightness: first.brightness, name: first.name };
}

/**
 * 组装 `themeConfig` 写入 declare.json（前端 R12/R11 据此渲染切换控件与徽标）。
 *
 * 形状约定（**刻意与既有 light/dark 保持同构**，让存量前端读取代码不必分叉）：
 *  - `default`  = 默认主题 key
 *  - `list[]`   = { key, name, brightness }
 *  - `multiTheme: true` + `themeCount` 供前端识别「这是 N 主题模式」
 *  - `dualTruth: true` 保留 —— 语义被推广为「全部主题均为设计真值」，
 *    这样既有的双真值徽标/渲染开关对 N 主题同样生效，无需改判定式。
 *
 * @param {Array} entries groupThemesByBrightness 的 entries
 * @param {{key:string,brightness:string}} defaultTheme
 * @returns {Object}
 */
export function buildThemeConfig(entries = [], defaultTheme = null) {
  const list = entries.map((e) => ({
    key: e.key,
    name: e.name,
    brightness: e.brightness,
  }));
  const def =
    defaultTheme && defaultTheme.key
      ? defaultTheme
      : { key: list[0]?.key || 'dark', brightness: entries[0]?.brightness || 'dark' };
  return {
    default: def.key,
    list,
    multiTheme: true,
    themeCount: list.length,
    // 语义推广：>1 个主题且全部来自设计稿 ⇒ 全部为真值
    dualTruth: list.length > 1,
    primaryBrightness: def.brightness,
  };
}

/**
 * 迁移旧结构 → 新结构（兼容既有 `dualTruth: {lightNodeData, darkNodeData}` 调用方）。
 *
 * 让 `buildStyleTokens` 能同时吃新旧两种输入，避免一次性改穿 5 个模块。
 *
 * @param {Object|null} dualTruth 旧双真值对象
 * @returns {Array|null} 新的 themes 描述（未拉节点前只有 key/name）
 */
export function themesFromLegacyDualTruth(dualTruth) {
  if (!dualTruth) return null;
  if (Array.isArray(dualTruth.themes)) return dualTruth.themes; // 已是新结构
  const out = [];
  if (dualTruth.lightNodeData) {
    out.push({ key: 'light', name: '浅色', brightness: 'light', nodeData: dualTruth.lightNodeData });
  }
  if (dualTruth.darkNodeData) {
    out.push({ key: 'dark', name: '深色', brightness: 'dark', nodeData: dualTruth.darkNodeData });
  }
  return out.length ? out : null;
}