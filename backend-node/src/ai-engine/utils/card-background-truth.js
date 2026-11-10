/**
 * 🛡️ ⑥-i v2（2026-11-10 · 用户验收裁决）：重复卡组「卡底背景图」精确挂载
 *
 * 🔴 用户裁决（批次 2 验收）：三张统计卡**应该只用背景图**（bg-125/124/126.png），
 *   上一版注入的 CSS 渐变 + 圆角是 **AI 臆造**（设计里卡底就是这张半透明发光 bg 图，
 *   PIL 实测 alpha 全 ≤200 属正常半透明素材，不是"空图"）。本版：
 *   ① 撤销 CSS 渐变/圆角注入（新版不再产出，且清除历史注入块）；
 *   ② 按 resource-dom-mapping 的 ownerSectionId 把各卡 bg 图**逐实例**挂到产物卡容器
 *      （Figma 子项按 x 序 ↔ 产物同 class 元素按 DOM 序一一对应）；
 *   ③ 资源路径按文件深度归一（与 normalizeResourceRelativePaths 同口径）。
 *
 * 判据零硬编码：卡组=几何（≥2 等高子项）；bg 归属=mapping 的 ownerSectionId + figmaPath 以 `/bg` 结尾。
 */
import { indexFigmaNodes } from './section-tree.js';

/** 重复卡组：容器 id → 按 x 排序的子项 id 数组（含祖先链登记） */
export function collectCardGroups(figmaNodeData) {
  const out = new Map();
  const root = figmaNodeData?.document ?? figmaNodeData;
  if (!root || typeof root !== 'object') return out;
  const walk = (n, chain) => {
    if (!n || typeof n !== 'object') return;
    const kids = Array.isArray(n.children) ? n.children : [];
    if (n.id && kids.length >= 2) {
      const boxes = kids
        .map((k) => ({ id: String(k.id), bb: k.absoluteBoundingBox || null }))
        .filter((k) => k.bb && Number(k.bb.height) > 0);
      if (boxes.length >= 2) {
        const hs = boxes.map((b) => Math.round(b.bb.height));
        const xs = boxes.slice().sort((a, b) => a.bb.x - b.bb.x).map((b) => b.id);
        if (Math.max(...hs) - Math.min(...hs) <= 2) {
          for (const id of [String(n.id), ...chain]) if (!out.has(id)) out.set(id, xs);
        }
      }
    }
    const nextChain = n.id ? [String(n.id), ...chain] : chain;
    for (const c of kids) walk(c, nextChain);
  };
  walk(root, []);
  return out;
}

/** ownerSectionId → 该卡的 bg 资源相对路径（figmaPath 以 `/bg` 结尾优先，其次资源名以 bg- 开头） */
export function collectCardBgByOwner(resourceDomMapping) {
  const out = new Map();
  const items = Array.isArray(resourceDomMapping)
    ? resourceDomMapping
    : (resourceDomMapping?.mappings || []);
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const owner = String(it.ownerSectionId || '');
    const file = String(it.resourceFile || '');
    const path = String(it.figmaPath || '');
    if (!owner || !file) continue;
    const isBg = /\/bg$/.test(path) || /(^|\/)bg-/.test(file.split('/').pop() || '');
    if (!isBg) continue;
    if (!out.has(owner)) out.set(owner, file);
  }
  return out;
}

/** 相对路径按文件深度归一（与 normalizeResourceRelativePaths 同口径） */
function depthAware(file, filePath) {
  const depth = Math.max(0, String(filePath).split('/').length - 1);
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  const stripped = file.replace(/^(\.\.\/)+/, '');
  return `${prefix}${stripped}`;
}

/** 清除历史 ⑥-i 渐变注入块（上一版产物） */
function stripLegacyGradientRule(content) {
  return content.replace(
    /\/\* 卡底渐变真值（⑥-i 注入） \*\/\n\.[\w-]+ \{[^}]*\}\n?/g,
    '',
  );
}

/** 给模板中同 class 的第 i 个元素合并 background 声明 */
function mountBgOnInstance(full, attrs, tag, bg) {
  if (/background-image/.test(attrs)) return full;
  const decl = `background-image:url('${bg}');background-size:100% 100%;background-repeat:no-repeat;`;
  const styleM = /\sstyle="([^"]*)"/.exec(attrs);
  if (styleM) {
    const merged = attrs.replace(styleM[0], ` style="${styleM[1].replace(/;?$/, ';')}${decl}"`);
    return `<${tag}${merged}>`;
  }
  return `<${tag}${attrs} style="${decl}">`;
}

/**
 * @param {Array<{path:string,content:string}>} contents
 * @param {{cardGroups: Map<string,string[]>, bgByOwner: Map<string,string>}} options
 */
export function injectCardBgImages(contents, { cardGroups, bgByOwner } = {}) {
  const stats = { scanned: 0, matched: 0, mounted: 0, missingBg: 0, skipped: 0 };
  let changed = false;
  if (!Array.isArray(contents) || !(cardGroups instanceof Map) || !(bgByOwner instanceof Map)) {
    return { contents: contents || [], changed: false, stats };
  }
  const out = contents.map((f) => {
    if (!f || typeof f.content !== 'string' || !String(f.path || '').endsWith('.vue')) return f;
    stats.scanned += 1;
    let src = stripLegacyGradientRule(f.content);
    const sids = [...src.matchAll(/data-section-id="([^"]+)"/g)].map((m) => m[1]);
    const hitSid = sids.find((sid) => cardGroups.has(sid));
    if (!hitSid) return src === f.content ? f : { ...f, content: src };
    stats.matched += 1;
    const cardIds = cardGroups.get(hitSid);
    const tplEnd = src.indexOf('</template>');
    if (tplEnd === -1) { stats.skipped += 1; return { ...f, content: src }; }
    const template = src.slice(0, tplEnd);
    // 重复 class（首次出现最靠前 = 外层卡容器）
    const counts = new Map();
    for (const m of template.matchAll(/class="([^"]+)"/g)) {
      const at = m.index ?? 0;
      for (const cls of m[1].split(/\s+/)) {
        if (!cls || cls.length < 3) continue;
        const cur = counts.get(cls);
        if (cur) cur.count += 1;
        else counts.set(cls, { count: 1, first: at });
      }
    }
    const repeated = [...counts.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => a[1].first - b[1].first);
    if (!repeated.length) { stats.skipped += 1; return { ...f, content: src }; }
    const cls = repeated[0][0];
    const clsRe = new RegExp(
      `<([a-z]+)([^>]*class="[^"]*\\b${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^"]*"[^>]*)>`,
      'g',
    );
    let idx = 0;
    let touched = false;
    const nextTemplate = template.replace(clsRe, (full, tag, attrs) => {
      const cardId = cardIds[idx];
      idx += 1;
      if (!cardId) return full;
      const bg = bgByOwner.get(cardId);
      if (!bg) { stats.missingBg += 1; return full; }
      const rel = depthAware(bg, f.path);
      const mounted = mountBgOnInstance(full, attrs, tag, rel);
      if (mounted !== full) { stats.mounted += 1; touched = true; }
      return mounted;
    });
    if (!touched) return src === f.content ? f : { ...f, content: src };
    changed = true;
    return { ...f, content: nextTemplate + src.slice(tplEnd) };
  });
  return { contents: out, changed, stats };
}

export default injectCardBgImages;
