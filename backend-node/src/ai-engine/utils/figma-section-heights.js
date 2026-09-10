/**
 * figma-section-heights.js
 *
 * 确定性后处理：把 Figma 真值「区块高度比例」从 vision JSON 落到 CSS。
 *
 * 背景（A4 比例确定性落到 CSS）：
 *   - A4（figma-height-ratio.js）会把 Figma 区块高度比例系数写进 vision JSON
 *     `sections[].styles.flexGrow`（以及审计用 figmaHeightPx）。
 *   - 但 LLM 并不总是把 flexGrow 转录进产物 CSS（对照组已证：tab-item flexGrow
 *     在 JSON 里，但产物 CSS 全是 `flex:1`），导致子组件根被 mounter 规则② 盲注
 *     `flex:1 1 0` → 50/50，与 Figma 1:4.9 不符。
 *   - 因此这里在不依赖 LLM 的前提下，把「子组件根 class → flexGrow 系数」直接建表，
 *     由 mounter 规则② 加权改写（`flex: <系数> 1 0`），确定性治本。系数来自 A4 归一化
 *     （avg=1 量纲，如 0.978 / 1.061），与 FLEX-005 校验器系数阈值兼容。
 *
 * 该函数为纯函数，可单独单测（避免拖入 langchain 链）。
 * 🛡️ A′ Phase 5：plan 走叶子 section，布局容器不占高度槽。
 */

import { collectLeafSections, findSectionById } from './section-tree.js';

/**
 * 取 SFC 根 <template> 内容（跳过 #header-right / v-slot 等具名插槽）。
 *
 * 为什么不能直接 /<template>([\s\S]*?)<\/template>/：非贪婪会停在第一个 </template>，
 * 把根模板截断到具名插槽（如 <template #header-right>…</template>）为止，漏掉真正的
 * 组件体（含大写自定义子组件标签）。正确做法是「第一个非插槽 <template> 开标签 →
 * 文件最后一个 </template>」之间的内容（根模板必然包裹所有插槽，其闭合标签在最后）。
 */
function extractRootTemplate(src) {
  const s = String(src || '');
  const openRe = /<template(\s[^>]*)?>/g;
  let rootOpenEnd = -1;
  let m;
  while ((m = openRe.exec(s))) {
    const attr = m[1] || '';
    const isSlot = /[#]|v-slot|v-if\b|v-else|v-for\b|v-show\b|v-bind\b|:/.test(attr);
    if (!isSlot) {
      rootOpenEnd = m.index + m[0].length;
      break;
    }
  }
  if (rootOpenEnd < 0) return '';
  const lastClose = s.lastIndexOf('</template>');
  if (lastClose < rootOpenEnd) return '';
  return s.slice(rootOpenEnd, lastClose);
}

/**
 * 由 modelFiles + layoutStructure 构建 { 子组件根 class: flexGrow 系数 } 映射。
 *
 * @param {Record<string,string>} modelFiles 组件产物文件集合（key 形如 'package/index.vue'）
 * @param {object} layoutStructure vision JSON 的 layoutStructure
 * @param {object} [params] 可选：{ subComponentPlan?: { effectiveSections }, generationInput?: { componentPlan } }
 * @returns {Record<string,number>|null} 映射；任何序列无法对齐则 fail-open 返回 null
 */
export function buildSectionHeightsMap(modelFiles, layoutStructure, params = {}) {
  try {
    if (!modelFiles || typeof modelFiles !== 'object') return null;
    const rawSections =
      layoutStructure?.layout?.sections || layoutStructure?.sections || [];
    if (!Array.isArray(rawSections) || rawSections.length < 2) return null;

    // ① section 序列（视觉顺序）：优先 plan.effectiveSections（与强制拆分同源、已滤 header）
    const plan =
      params?.subComponentPlan || params?.generationInput?.componentPlan || null;
    // 读 flexGrow 系数（A4 归一化 avg=1 量纲，如 0.978 / 1.061），
    // 而非 figmaHeightPx（像素，仅审计用），flexGrow 与 FLEX-005 系数阈值兼容
    const pxOf = (sec) => {
      const a4 = Number(sec?.styles?.flexGrow);
      if (Number.isFinite(a4) && a4 > 0) return a4;
      return 0;
    };
    let orderedSections = null;
    const planLeaves = collectLeafSections(plan?.effectiveSections);
    if (planLeaves.length >= 2) {
      orderedSections = planLeaves.map((eff) => {
          const sec =
            findSectionById(rawSections, eff?.id) ||
            rawSections.find(
              (s) => String(s?.id || '') === String(eff?.id || ''),
            );
          if (!sec) return null;
          // 🎯 量纲修复（2026-09-09）：pxOf 返回 A4 归一化 flexGrow 系数（avg=1 量纲，
          // 如 0.978/1.061）。旧实现 `pxOf(sec) || Math.round(layoutMetadata.height)` 在
          // section 缺 flexGrow 时把**像素**高度（如 800）混进**系数**数组 → mounter 写入
          // `flex: 800 1 0` 与同组 `flex: 0.978 1 0` 量纲冲突、比例失真（FLEX-005/规则③ 病灶）。
          // layoutMetadata.height 是像素（仅 prompt 展示用），与系数不同量纲，禁止混排。
          // 无系数 → 返回 null，由下方「数量缩水」判定整体 fail-open（与顶层分支同契约）。
          const px = pxOf(sec);
          return px > 0 ? px : null;
        })
        .filter((px) => px > 0);
      // 有叶子对不上原 section 时数量会缩水——必须全对齐才可信
      if (orderedSections.length !== planLeaves.length) {
        orderedSections = null;
      }
    }
    if (!orderedSections) {
      orderedSections = rawSections.map(pxOf).filter((px) => px > 0);
      if (orderedSections.length !== rawSections.length) return null;
    }

    // ② 子组件序列：主组件模板中大写标签出现顺序（保持重复首次）
    const mainVue = modelFiles['package/index.vue'] || '';
    const tpl = extractRootTemplate(mainVue);
    const tags = [];
    for (const m of tpl.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
      const tag = m[1];
      if (tags.includes(tag)) continue;
      if (modelFiles[`package/components/${tag}.vue`]) tags.push(tag);
    }
    if (tags.length < 2 || tags.length !== orderedSections.length) return null;

    // ③ 各子组件模板根 class → px
    const map = {};
    for (let i = 0; i < tags.length; i++) {
      const sub = modelFiles[`package/components/${tags[i]}.vue`] || '';
      const stpl = extractRootTemplate(sub);
      const cls = stpl
        .match(/<[^>]+?class\s*=\s*["']([^"']+)["']/)?.[1]
        ?.trim()
        .split(/\s+/)[0];
      if (!cls) return null;
      map[cls] = orderedSections[i];
    }
    return map;
  } catch {
    return null;
  }
}

export default buildSectionHeightsMap;
