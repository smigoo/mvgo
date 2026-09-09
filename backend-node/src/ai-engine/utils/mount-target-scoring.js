/**
 * 🛡️ 挂载点评分（P1-3，2026-08-30）
 *
 * 背景：R8 —— 组件一 mc-max-1788065970150 日志实锤
 *   05:03:35 去重删掉 `tabs-section` 上的重复 bg2
 *   05:04:50 兜底又按关键词子串匹配把 bg2 挂回 `tabs-section`
 * 根因：**去重与兜底用了两套互不兼容的选型逻辑**
 *   - 去重按「关键词命中数」评分
 *   - 兜底按「关键词顺序 + 文件顺序」取第一个
 * 于是两者互相覆盖，整块背景永远挂在外层 section 上被拉成整条大背景。
 *
 * 本模块是**唯一**的挂载点评分真相源，`_dedupeBgMultiRefs`（去重）与
 * `_autoMountUnusedBackgrounds`（兜底）共用，杜绝打架。
 *
 * 三项信号：
 *   ① 语义距离（权重 3 / 2 / 1）：候选 class token 对 资源名 / mountTarget / figmaPath 上下文的覆盖率
 *   ② 尺寸契合：`figmaBox 面积 / parentBox 面积`，≥0.9 = 整块背景（铺满父容器）
 *   ③ 层级深度：模板嵌套深度，配合 ② 决定加减分——整块背景越深越好，局部小图越浅越好
 *
 * 抽成独立模块的目的：纯函数、可单测，不依赖 MicrocodeEngineer 实例。
 */

/** 剥离 class 上的实例 ID 前缀（`c-mc-max-<ts>-<hex>-` / `c-mv-max-...`） */
export function stripInstanceClsPrefix(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^c-(?:mc|mv)-max-\d{10,}-[a-z0-9]+-/i, '');
}

/** 剥离 class 上的组件名前缀（由根容器 class 推断，如 `c-env-monitor-`） */
export function stripMountClsPrefix(cls, componentPrefix) {
  const base = stripInstanceClsPrefix(cls);
  const p = String(componentPrefix || '').toLowerCase();
  if (p && base.startsWith(p)) return base.slice(p.length);
  return base;
}

/** class → 语义 token（按 - / _ / 驼峰切分，剔除纯数字与过短片段） */
export function mountClsTokens(s) {
  const src = String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return src
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/**
 * 两个 token 集合的覆盖率：|a ∩ b| / |b|
 * b 为空返回 0 —— 否则「空集合」会被算成满分，导致无语义线索时也乱选。
 */
export function tokenOverlapRatio(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || b.length === 0) return 0;
  const set = new Set(a);
  const hit = b.filter((t) => set.has(t)).length;
  return hit / b.length;
}

/**
 * figmaPath 的上下文段：去掉设计页名与资源自身节点名，取最近 3 段。
 * `cp-环境监测/slot-con/sub-t/tabs-list/bg` → `slot-con sub-t tabs-list`
 */
export function figmaPathContext(figmaPath) {
  const segs = String(figmaPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length <= 2) return '';
  return segs.slice(0, -1).slice(-3).join(' ');
}

/**
 * 资源 figmaBox 相对 parentBox 的面积占比（0~1）。
 * ≥0.9 视为「整块背景」——它铺满父容器，应挂在父容器对应的 DOM 元素上。
 */
export function boxAreaRatio(mapping) {
  const fb = mapping?.figmaBox;
  const pb = mapping?.parentBox;
  if (!fb || !pb) return 0;
  const pa = (pb.width || 0) * (pb.height || 0);
  if (pa <= 0) return 0;
  const fa = (fb.width || 0) * (fb.height || 0);
  return Math.max(0, Math.min(1, fa / pa));
}

/**
 * 由根容器 class 推断组件名前缀：`c-env-monitor-root` → `c-env-monitor-`
 * 评分前必须先剥离，否则所有候选 class 都带同一前缀，语义距离必然失真。
 *
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @returns {string} 以 '-' 结尾的前缀；推断不出返回 ''
 */
export function inferComponentPrefix(files) {
  const idx = files?.['package/index.vue'];
  if (typeof idx !== 'string') return '';
  const tpl = idx.match(/<template>([\s\S]*?)<\/template>/i);
  const body = tpl ? tpl[1] : idx;
  const withPanel = body.match(
    /<base-panel[^>]*>[\s\S]*?<[a-zA-Z][^>]*\bclass="([\w-]+)"/,
  );
  const cls =
    (withPanel ? withPanel[1] : (body.match(/<[a-zA-Z][^>]*\bclass="([\w-]+)"/) || [])[1]) || '';
  const base = stripInstanceClsPrefix(cls);
  const m = base.match(/^(.*)-[a-z0-9]+$/i);
  return m && m[1] ? `${m[1]}-` : '';
}

/**
 * 统一挂载点评分（唯一真相源）。
 *
 * @param {Object} mapping - resourceDomMapping 条目
 * @param {{cls?:string, depth?:number, isHostShell?:boolean}} cand - 挂载候选
 * @param {{componentPrefix?:string}} [opts]
 * @returns {number} 分数（越大越优）；`-Infinity` = 不可挂载
 */
export function scoreMountTarget(mapping, cand, opts = {}) {
  if (!mapping || !cand) return Number.NEGATIVE_INFINITY;
  // 宿主外壳（base-panel / mc-panel）禁止挂业务背景：会被 100% 100% 拉伸成整面板大背景
  if (cand.isHostShell) return Number.NEGATIVE_INFINITY;

  const prefix = opts.componentPrefix || '';
  const clsTokens = mountClsTokens(stripMountClsPrefix(cand.cls || '', prefix));
  if (clsTokens.length === 0) return Number.NEGATIVE_INFINITY;

  const nameTokens = mountClsTokens(String(mapping.name || ''));
  const mtTokens = mountClsTokens(String(mapping.mountTarget || ''));
  const pathTokens = mountClsTokens(figmaPathContext(mapping.figmaPath));

  let score =
    3 * tokenOverlapRatio(clsTokens, nameTokens) +
    2 * tokenOverlapRatio(clsTokens, mtTokens) +
    1 * tokenOverlapRatio(clsTokens, pathTokens);

  // 尺寸契合 + 层级：整块背景（铺满父框）→ 越深越好；局部图 → 越浅越好
  const areaRatio = boxAreaRatio(mapping);
  const depth = Math.max(0, Math.min(cand.depth || 0, 6));
  score += (areaRatio >= 0.9 ? 0.3 : -0.3) * depth;
  return score;
}

/**
 * F3（2026-09-01）：mountTarget 语义判定——无语义层名不参与强制挂载。
 *
 * 事故实证 mc-max-1788252098143-12469472：mapping 里两个 bg 的 mountTarget='t'
 * （Figma 作者随手命名的单字符 FRAME），下游无边界子串匹配过宽 → RESOURCE-003 误报
 * BLOCK ×2、3 轮重试耗尽（判定本身已整体移除，此处是生成侧根防）。
 *
 * 无语义形态：单字符 / 纯「类型+编号」（Group 2136636802 / Frame 1280 / Component 1）/ 纯数字。
 * 消费方 figma-connector（bg 挂载目标构造）命中 → 清空 mountTarget。
 * ⚠️ 不能置 skipMount：N4 根容器注入（vue3-engineer.js:1470 / microcode-engineer.js:5078）
 *    用 .find(skipMount bg) 选「面板整体背景」，置 skipMount 会被误选铺到根容器。
 */
export function isSemanticMountTarget(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (s.length === 0) return false;
  if (s.length < 2) return false;
  if (/^\d+$/.test(s)) return false;
  if (/^(?:group|frame|component|ellipse|rectangle|text|vector|slice|section|instance)\s*\d+$/i.test(s)) return false;
  return true;
}

export default {
  stripInstanceClsPrefix,
  stripMountClsPrefix,
  mountClsTokens,
  tokenOverlapRatio,
  figmaPathContext,
  boxAreaRatio,
  inferComponentPrefix,
  scoreMountTarget,
  isSemanticMountTarget,
};
