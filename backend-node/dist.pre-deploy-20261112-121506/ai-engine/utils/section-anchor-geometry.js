/**
 * 🛡️ L1（2026-11-10 · 重点车辆 fbc0feb5 判分器实锤）：段锚几何错配（运行时判据）
 *
 * 病灶：产物把 `data-section-id="136:122"` 挂在整块内容区（DOM 405×109）上，
 *   而 Figma 里 136:122 只是 86×24 的「小标题」——锚点挂到子节点、父容器顶着它的 id。
 *   这类错配在静态校验里看不到（产物几何来自 flex/CSS，不在 inline style），
 *   只有**渲染后的真实 bbox** 才能比出来。
 *
 * 本模块 = 纯函数：输入「页面探针采到的段几何」+「Figma 节点树」，输出错配清单。
 *   - 判据只有相对偏离阈值（默认 30%）与最小尺寸（默认 10px），无段名/组件名白名单；
 *   - 合成 id（含 `-`，如 `chart-2:7898`、`-tail-text`）不参与（它们不对应单个 Figma 节点）；
 *   - 只出清单，不决定阻断级别（调用方只留痕）。
 */

/** 建 Figma 节点 bbox 索引（id → {w,h,name}） */
export function indexFigmaBoxes(figmaNodeData) {
  const map = new Map();
  const root = figmaNodeData?.document ?? figmaNodeData;
  if (!root || typeof root !== 'object') return map;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const bb = n.absoluteBoundingBox;
    if (n.id && bb && Number.isFinite(bb.width) && Number.isFinite(bb.height)) {
      map.set(String(n.id), {
        w: bb.width,
        h: bb.height,
        name: String(n.name || ''),
      });
    }
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return map;
}

/**
 * @param {Array<{sid:string,w:number,h:number}>} sectionAnchors 渲染后 DOM 采集
 * @param {object} figmaNodeData
 * @param {{tolerance?:number,minSize?:number}} [opts]
 * @returns {Array<{sid:string,dom:{w:number,h:number},truth:{w:number,h:number},dw:number,dh:number,name:string}>}
 */
export function computeSectionAnchorMismatch(sectionAnchors, figmaNodeData, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 0.3;
  const minSize = Number.isFinite(opts.minSize) ? opts.minSize : 10;
  const out = [];
  if (!Array.isArray(sectionAnchors) || sectionAnchors.length === 0) return out;
  const index = indexFigmaBoxes(figmaNodeData);
  if (index.size === 0) return out;
  const seen = new Set();
  for (const a of sectionAnchors) {
    const sid = a && typeof a.sid === 'string' ? a.sid : '';
    if (!sid || sid.includes('-')) continue;
    if (seen.has(sid)) continue;
    const truth = index.get(sid);
    if (!truth) continue;
    if (!(truth.w >= minSize) || !(truth.h >= minSize)) continue;
    const w = Number(a.w);
    const h = Number(a.h);
    // 尺寸为 0 属「未渲染」，由 RUNTIME-006 负责，这里不重复判
    if (!(w > 0) || !(h > 0)) continue;
    const dw = Math.abs(w - truth.w) / truth.w;
    const dh = Math.abs(h - truth.h) / truth.h;
    if (dw >= tolerance && dh >= tolerance) {
      seen.add(sid);
      out.push({
        sid,
        dom: { w: Math.round(w), h: Math.round(h) },
        truth: { w: Math.round(truth.w), h: Math.round(truth.h) },
        dw: Math.round(dw * 100) / 100,
        dh: Math.round(dh * 100) / 100,
        name: truth.name,
      });
    }
  }
  return out;
}

export default computeSectionAnchorMismatch;
