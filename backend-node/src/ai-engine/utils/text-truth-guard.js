/**
 * 🛡️ 文字真值白名单校验（TEXT-TRUTH，2026-09-02）
 *
 * 事故实证 mc-max-1788306653919-a57e4409（设备监测）：vision 把 Figma 文字 OCR 误读——
 * 「监控」→「挖掘机」、「烟道机器人」→「烟雾机器人」、「3/3740」→「3/740」、臆造「控制」。
 * 既有 do-not-invent-validator 是「黑名单」（校验 vision 声明的 X→Y 禁用对），而 vision
 * 自己读错时它声明的约束也是错的（以为「挖掘机」是对的），所以黑名单防不了 vision 自误。
 *
 * 本模块用「白名单」：Figma 的 TEXT 节点 characters 是确定性真值，产物里出现的任何
 * 「不在真值里的中文文字（≥2 字）」就是 OCR 误读 / 臆造 —— 不需要知道「挖掘机对应监控」，
 * 只需要知道「挖掘机不在真值集合里」。确定性、无 LLM 依赖、不需要位置配对。
 *
 * 防误伤约束（宁可漏报，不可误伤）：
 *   - 只匹配「连续中文 ≥2 字」，纯数字/符号/单位/英文天然不入检查（避免误杀格式文字）；
 *   - 命中判定用「子串双向覆盖」：产物文字是某个真值的子串/超串即视为命中（容错截断）；
 *   - 真值集合为空（非 Figma 任务）时 fail-open 返回空。
 */

const CHINESE_RUN_RE = /[\u4e00-\u9fa5]{2,}/g;

import { extractSfcTemplate } from './sfc-template-extractor.js';

/**
 * 收集 Figma TEXT 节点的 characters 真值集合（确定性）。
 * @param {object} figmaNodeData Figma 节点树（pruneRedundantFields 后）
 * @returns {Set<string>} 去重后的非空 characters 真值
 */
export function collectFigmaTextTruth(figmaNodeData) {
  const truth = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TEXT' && typeof node.characters === 'string') {
      const t = node.characters.trim();
      if (t) truth.add(t);
    }
    for (const c of node.children || []) walk(c);
  };
  walk(figmaNodeData);
  return truth;
}

/**
 * 判断产物文字 t 是否被真值集合「覆盖」（t 是某真值的子串，或某真值是 t 的子串）。
 * 容错：OCR 可能把「3/3740」读成「3/740」（截断），子串双向匹配能吸收这类部分丢失。
 * 🛡️ 空格归一化（2026-09-03，mc-max-1788373364090 实锤）：Figma 真值「南北接线 设备」
 * 中间带空格，LLM 生成「南北接线设备」无空格 → 子串匹配无法覆盖 → TEXT-TRUTH 误报 BLOCK，
 * 重试确定性复现 → 重试耗尽。比较时剔除双方空白，空格/换行差异不再误报。
 */
function isCoveredByTruth(text, truth) {
  const norm = String(text || '').replace(/\s+/g, '');
  if (!norm) return false;
  for (const t of truth) {
    const tn = String(t || '').replace(/\s+/g, '');
    if (!tn) continue;
    if (tn.includes(norm) || norm.includes(tn)) return true;
  }
  return false;
}

/**
 * 编辑距离（Levenshtein，标准 DP）。
 * 中文短文本（2~8 字）计算量可忽略，无需引入第三方依赖。
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * 🛡️ 为 OCR 误读文字找「最接近的 Figma 真值」（2026-09-03，mc-max-1788413658506 实锤）。
 *
 * 背景：Figma TEXT 节点 2:8816（t-南北接线 设备）同时具备 rotation=π/2（旋转 90°）、
 * 两行文本（"南北接线\n设备"）、艺术字体 YouSheBiaoTiHei 三特征 → 预览图上渲染成
 * 竖排旋转艺术字 → vision 模型 OCR 稳定误读「接」字（拦/拓/…每次不同）。
 * 错误文字进入 visual.json 后 LLM 照抄，TEXT-TRUTH 正确 BLOCK，但重试仍基于同一份
 * 错误 vision 结果 → 必然重复失败 → 重试耗尽。
 *
 * 治本：BLOCK 报错里直接给出「误读文字 → 应替换为的真值」映射，让重试有确定性修正
 * 指导，而不是让 LLM 再盲猜一次（盲猜必然复用 vision 的错误结果）。
 *
 * 相似度 = 1 - 编辑距离 / 两串最大长度。阈值 0.5：
 * 能吸收「南北拓线设备」vs「南北接线设备」（1/6 差异 → 0.83）这类单字 OCR 错，
 * 又不会把臆造文字（如「控制」）硬关联到无关真值上（臆造词建议留空 → 提示删除）。
 *
 * @param {string} text 产物里的未知文字
 * @param {Set<string>} truth Figma characters 真值集合
 * @returns {string|null} 最接近的真值；无足够相似候选时返回 null
 */
export function findClosestTruth(text, truth) {
  const norm = String(text || '').replace(/\s+/g, '');
  if (!norm || !truth || truth.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const raw of truth) {
    const tn = String(raw || '').replace(/\s+/g, '');
    if (!tn) continue;
    const dist = levenshtein(norm, tn);
    const score = 1 - dist / Math.max(norm.length, tn.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = raw;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * 🛡️ R5-dup（2026-09-15）：提取组件文件里「会渲染到界面」的文本（模板静态文本 + script 数据字段）。
 * 与 detectUnknownText 共用同一套提取口径（extractTemplateText 剥离 HTML 注释/标签/插值；
 * extractScriptDataFields 只取 label/name/text/title 数据字段）。
 * 供 section-content-guard 的「文本是否渲染在文件」判定复用，替代裸 f.content.includes(text)——
 * 后者会把 HTML 注释（如 `<!-- 当日总流量区域背景 -->`）误判为「渲染文本」→ duplicateTextIssues 假阳性。
 * @param {string} content SFC 内容
 * @returns {string} 渲染文本（空格分隔，供 includes 判定）
 */
export function extractRenderedText(content) {
  const tpl = extractTemplateText(content);
  const script = extractScriptDataFields(content);
  return `${tpl} ${script}`;
}

/**
 * 提取模板里「会渲染到界面」的文本节点。
 * 剥离 HTML 注释 / 标签（含 alt/title/aria-label 等属性值）/ 插值表达式 {{ }}，
 * 只留下标签之间的静态文字（如 `<span>监控</span>` → 「监控」）。
 * `<img alt="信号图标">` 这类属性值会被标签剥离一起移除，不误报。
 */
function extractTemplateText(content) {
  // 🛡️ 共享边界法（lazy </template> 会被具名插槽提前截断——0ca84358 家族缺陷）
  const tpl = extractSfcTemplate(String(content || ''));
  if (!tpl) return '';
  return tpl
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ');
}

/**
 * 提取 script 里「对象字面量的数据字段值」（v-for 渲染的数据，如 `label: '挖掘机'`）。
 * 只匹配 `label/name/text/title: 'xxx'` 形态，天然排除 console.log 参数、theme 变量名、
 * 代码注释等技术文案（这些不是对象数据字段）。
 */
function extractScriptDataFields(content) {
  const script = String(content || '').match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return '';
  const fields = [];
  const rx = /\b(label|name|text|title)\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = rx.exec(script[1])) !== null) {
    if (m[2] && m[2].trim()) fields.push(m[2]);
  }
  return fields.join(' ');
}

/**
 * 🛡️ L4（2026-09-07）：与 extractScriptDataFields 同源，但保留字段 key，
 * 用于标记「标题级文案」（title: 字段）——供 TEXT-TRUTH 分级判定标题篡改必 BLOCK。
 * @returns {Array<{key:string, text:string}>}
 */
function extractScriptFieldsWithKey(content) {
  const script = String(content || '').match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return [];
  const out = [];
  const rx = /\b(label|name|text|title)\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = rx.exec(script[1])) !== null) {
    if (m[2] && m[2].trim()) out.push({ key: m[1], text: m[2] });
  }
  return out;
}

/**
 * 检测产物里「不在 Figma 文字真值里」的中文文字（OCR 误读 / 臆造）。
 *
 * 只检查「会渲染的设计文字」两个来源，避免技术文案误报（2026-09-02 环境监测实锤：
 * 「组件加载完成」注释 / 「图表视图」aria-label / 「浅色主题」theme 配置等被误报）：
 *   1. 模板文本节点（标签之间的静态文字）；
 *   2. script 对象字面量的 label/name/text 字段值（v-for 渲染数据）。
 * 其余（注释、console.log、alt/title/aria-label 属性值、theme 配置）一律不查。
 * 代价：OCR 误读文字必须落在「模板文本」或「label/name/text 字段」里才抓得到，
 * 但漏报优于误报（WARN 门禁宁可漏，不污染告警）。
 *
 * @param {Array<{path:string, content:string}>} files 生成产物文件数组
 * @param {object} figmaNodeData Figma 节点树
 * @returns {Array<{text:string, file:string, suggest:string|null}>} 不在真值里的中文文字
 *   （去重）。suggest 为「最接近的 Figma 真值」，供重试确定性替换；无相似候选（臆造
 *   文字）时为 null，调用方应提示「删除该区块」而非替换。
 */
export function detectUnknownText(files, figmaNodeData) {
  const truth = collectFigmaTextTruth(figmaNodeData);
  if (truth.size === 0) return [];

  const seen = new Set();
  const unknown = [];
  for (const f of files || []) {
    if (!f || !f.content) continue;
    // 只提取「会渲染的设计文字」：模板文本节点 + script 数据字段值
    // 🛡️ L4 / P0-6（2026-09-07）：带字段上下文提取，标题级（title: 字段）文字单独标记，
    // 供 resolveTextTruthSeverity 判定「标题级核心文案篡改必 BLOCK」。
    const candidates = [];
    const templateText = extractTemplateText(f.content);
    for (const m of templateText.matchAll(CHINESE_RUN_RE)) candidates.push({ text: m[0], key: 'template' });
    for (const { key, text } of extractScriptFieldsWithKey(f.content)) {
      for (const m of text.matchAll(CHINESE_RUN_RE)) candidates.push({ text: m[0], key });
    }
    for (const c of candidates) {
      if (seen.has(c.text)) continue;
      seen.add(c.text);
      if (!isCoveredByTruth(c.text, truth)) {
        unknown.push({
          text: c.text,
          file: f.path || '',
          suggest: findClosestTruth(c.text, truth),
          titleContext: c.key === 'title',
        });
      }
    }
  }
  return unknown;
}

/**
 * 🛡️ L4 / P0-6（2026-09-07）：TEXT-TRUTH 核心文案分级
 *
 * 事故实证（device 设备监测）：vision 把标题级文案「南北接线 设备」臆造为「房屋建筑\n设备」，
 * 仅 1 处篡改，被 09-04 的「≤2 处降级 WARN」阈值静默放行 → 标题级核心文案交付错误。
 *
 * 分级策略（确定性、无 LLM）：
 * - **标题级文案**：Figma TEXT 节点名以 `t-` / `T-` 前缀（标题/标签语义）的文本。
 *   这类文案被篡改 → **必 BLOCK**（fail-closed），不受「≤2 处」阈值豁免——核心文案不容错。
 * - **普通文本**：保留 09-04 阈值策略（≤2 处 WARN，>2 处 BLOCK），允许少量 OCR 误读通过。
 * - 无标题级真值（非 Figma 任务 / 数据缺失）→ fail-open 返回 WARN，不臆断 BLOCK。
 *
 * @param {Array<{text:string, file?:string, suggest?:string|null}>} unknowns detectUnknownText 的输出
 * @param {object} figmaNodeData Figma 节点树
 * @returns {'BLOCK'|'WARN'|'PASS'} 严重度
 */
export function resolveTextTruthSeverity(unknowns, figmaNodeData) {
  if (!Array.isArray(unknowns) || unknowns.length === 0) return 'PASS'
  const norm = (s) => String(s || '').replace(/\s+/g, '')

  // 收集所有标题级（t- 前缀）Figma 真值文本
  const titleTruth = new Set()
  const walk = (n) => {
    if (
      n &&
      n.type === 'TEXT' &&
      typeof n.characters === 'string' &&
      /^(t-|T-)/.test(n.name || '')
    ) {
      titleTruth.add(norm(n.characters))
    }
    for (const c of n.children || []) walk(c)
  }
  walk(figmaNodeData)

  // 无标题级真值 → fail-open，沿用阈值策略（不在此函数臆断 BLOCK）
  if (titleTruth.size === 0) return 'WARN'

  // 标题级核心文案篡改（两条任一命中即 BLOCK，不受 ≤2 处阈值豁免）：
  //  1) 产物 title: 字段里的文字不在任何真值中（标题上下文臆造/篡改）；
  //  2) 任一 unknown 的最近真值（suggest）属于标题级 Figma TEXT 节点（t- 前缀）。
  for (const u of unknowns) {
    if (u.titleContext) return 'BLOCK'
    if (u.suggest && titleTruth.has(norm(u.suggest))) return 'BLOCK'
  }
  return 'WARN'
}
