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

import {
  collectLeafSections,
  findSectionById,
  dedupeDuplicateSections,
} from './section-tree.js';

/**
 * 解析「子组件规划」（subComponentPlan）的单一事实源。
 *
 * 背景（2026-09-16 · c-vehicle-monitor-f177f631 实锤）：generateCode 与 execute 两处各自
 * 内联了「generationInput.componentPlan → subComponentPlan → 空兜底」的优先级选择，逻辑重复。
 * 且 execute 曾因迁移时变量名（input/subPlan/effectiveSections）未同步，导致运行时
 * `input is not defined` 被 catch 吞掉 → N1 数字剥离 + 清洗层 + 确定性修复（含 fix-section-heights）
 * 整段静默失败 → section 根 height:100% 未改写 → 多区块各占 100% 高互相溢出、仅首块可见。
 * 此处收口为纯函数，两处复用 + 可单测。
 *
 * @param {object|null} [generationInput] Context Assembler 裁决事实（优先取 .componentPlan）
 * @param {object|null} [subComponentPlan] graph 直传的子组件规划（fallback）
 * @returns {object} 规划对象，恒有 effectiveSections 数组
 */
export function resolveSubComponentPlan(generationInput, subComponentPlan) {
  const plan = generationInput?.componentPlan;
  if (plan && typeof plan === 'object') return plan;
  if (subComponentPlan && typeof subComponentPlan === 'object') {
    return subComponentPlan;
  }
  return {
    effectiveSections: [],
    isForced: false,
    minFiles: 0,
    reason: '未传入 subComponentPlan',
  };
}

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
 * 提取根 <template> 内容里「根元素」的直接子元素 class 列表（按文档顺序）。
 *
 * 用途（2026-09-15）：单文件组件（无 package/components/ 子组件目录）时，section 根是
 * 模板里根 div 的直接子 div（LLM 自由命名，如 title-section / tab-section / chart-section），
 * 而非大写子组件标签。buildSectionHeightsMap 的多子组件对齐路径（大写标签 ↔ plan 叶子）
 * 对单文件组件天然失效（tags.length === 0 → fail-open null）。
 * 此处按「直接子元素 class 文档顺序 ↔ vision sections 顺序」做保守 1:1 对齐，
 * 数量不等/无 class 时返回 null 由调用方 fail-open。
 *
 * 只认根元素的第一层子元素（depth===1）；孙辈（嵌套 div）不参与。
 * 自闭合标签（<img/>）与注释/DOCTYPE 跳过。纯函数、无副作用。
 *
 * @param {string} tpl 根 template 内容（extractRootTemplate 产出）
 * @returns {Array<string>} 直接子元素的首 class（无 class 记空串占位以保序）；无法解析返回 []
 */
function extractRootDirectChildClasses(tpl) {
  const s = String(tpl || '');
  if (!s) return [];
  const out = [];
  let depth = 0;
  let rootSeen = false;
  // 开/闭标签统一匹配；attrs 用「引号内不截断」的段匹配，避免 class="a b" 被空格切开
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2];
    const attrs = m[3] || '';
    const selfClose = m[4] === '/';
    if (tag[0] === '!' || tag[0] === '?') continue; // 注释 / DOCTYPE
    if (!rootSeen) {
      if (!closing) {
        rootSeen = true;
        depth = 1; // 进入根元素
        if (selfClose) return []; // 根元素自闭合，无子元素
      }
      continue;
    }
    if (closing) {
      depth -= 1;
      if (depth === 0) break; // 根元素闭合，结束
      continue;
    }
    if (depth === 1) {
      // 根元素的直接子元素：取首 class（无 class 记空串占位，保持顺序语义）
      const clsMatch =
        attrs.match(/class\s*=\s*"([^"]*)"/) || attrs.match(/class\s*=\s*'([^']*)'/);
      out.push(clsMatch ? clsMatch[1].trim().split(/\s+/)[0] : '');
    }
    if (!selfClose) depth += 1;
  }
  return out;
}

/**
 * 对齐「plan.effectiveSections 顺序 ↔ 主组件模板子组件标签顺序 ↔ 各子组件根 class」。
 *
 * 批次 3（2026-09-14）：从 buildSectionHeightsMap 抽出，供 buildSectionLayoutFacts 共用；
 * 单一事实源，避免高度与布局两套对齐逻辑漂移。
 *
 * @returns {Array<{cls:string, sec:object}>|null} 全对齐才返回，否则 null（fail-open）
 */
export function alignSectionClasses(modelFiles, layoutStructure, params = {}) {
  const rawSections =
    layoutStructure?.layout?.sections || layoutStructure?.sections || [];
  const plan =
    params?.subComponentPlan || params?.generationInput?.componentPlan || null;
  // 🛡️ 治本（2026-09-16 · c-vehicle-monitor-b82c9d84）：reuseCache 时 layoutStructure 为空 →
  // rawSections=[]，但 plan.effectiveSections 仍有视觉真值（layout/layoutMetadata.flexGrow）。
  // 此时不应提前 return null，而是继续走 secOf（回退 eff 本身）。仅当「rawSections 与 plan 都空」才 fail-open。
  if (
    (!Array.isArray(rawSections) || rawSections.length < 2) &&
    !(Array.isArray(plan?.effectiveSections) && plan.effectiveSections.length >= 2)
  ) {
    return null;
  }
  // 🛡️ 治本（2026-09-15 · c-device-monitor-44384241 实锤）：与 code-generator 的
  // resolvePlanSections 同源——先 dedupeDuplicateSections 再 collectLeafSections。
  // 原实现直接用 plan.effectiveSections（未去重，含「设备网格」8438 这类 @antd/tab 的
  // 冗余切片）→ 叶子数(4) ≠ 产物子组件数(3) → 对齐失败 → fail-open 返回 null →
  // sectionHeights 映射丢失 → switch/tab 高度比例退化为 flex:1 平分（实锤 1:1 而非 1:4.9）。
  const planLeaves = collectLeafSections(
    dedupeDuplicateSections(plan?.effectiveSections || []),
  );
  const secOf = (eff) => {
    const found =
      findSectionById(rawSections, eff?.id) ||
      rawSections.find((s) => String(s?.id || '') === String(eff?.id || ''));
    if (found) return found;
    // 🛡️ 治本（2026-09-16 · c-vehicle-monitor-b82c9d84 实锤）：reuseCache 场景下 layoutStructure
    // 为空（context-shadow.generationInput 无 layoutStructure 字段）→ rawSections=[] → secOf 找不到
    // → ordered 兜底空 → `tags(4) !== ordered(0)` → 对齐失败 → 规则⑤失去 facts，只能靠「flex 属性信号」猜。
    // 而 effectiveSections 的 section 本身就有 layout/layoutMetadata.flexGrow（视觉真值），只是字段结构
    // 与 rawSections 不同（flexGrow 在 layoutMetadata 而非 styles）。此处回退 eff 本身 + 补 styles 包装，
    // 使 buildSectionLayoutFacts 能从同一份视觉真值确定性读出 layout/flexGrow，不再依赖 layoutStructure。
    if (eff && (eff.layout || eff.body?.layout || eff.layoutMetadata)) {
      return {
        ...eff,
        styles: {
          flexGrow: Number(eff.layoutMetadata?.flexGrow) || 0,
          figmaHeightPx: Number(eff.layoutMetadata?.height) || null,
        },
      };
    }
    return null;
  };

  let ordered = null;
  if (planLeaves.length >= 2) {
    const list = planLeaves.map((eff) => {
      const sec = secOf(eff);
      return sec ? { eff, sec } : null;
    });
    if (list.every(Boolean)) ordered = list;
  }
  if (!ordered) {
    ordered = rawSections.map((sec) => ({ eff: sec, sec }));
  }

  const mainVue = modelFiles['package/index.vue'] || '';
  const tpl = extractRootTemplate(mainVue);
  const tags = [];
  for (const m of tpl.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
    const tag = m[1];
    if (tags.includes(tag)) continue;
    if (modelFiles[`package/components/${tag}.vue`]) tags.push(tag);
  }
  if (tags.length < 2 || tags.length !== ordered.length) return null;

  const out = [];
  for (let i = 0; i < tags.length; i++) {
    const sub = modelFiles[`package/components/${tags[i]}.vue`] || '';
    const stpl = extractRootTemplate(sub);
    const cls = stpl
      .match(/<[^>]+?class\s*=\s*["']([^"']+)["']/)?.[1]
      ?.trim()
      .split(/\s+/)[0];
    if (!cls) return null;
    out.push({ cls, sec: ordered[i].sec, tag: tags[i] });
  }
  return out;
}

/**
 * 🛡️ 删减法批次 3 loop 3a（2026-09-14 · 914 §13 实锤）：布局事实单一事实源。
 *
 * 动机：`healGridContainer`（flex-sibling-guard）与 `ensureGridDisplay`（css-sanitizer）
 * 都是「LLM 写 grid-template-* 却漏 display:grid」「子组件根漏 display:flex」的事后修补。
 * 与其事后猜，不如把布局事实（display / gridColumns / flexDirection / flexGrow / 高度）
 * 从 vision JSON 一次性落表，由 mounter 规则确定性写入 section 根规则 → 修补器触发归零。
 *
 * 事实来源（全部为已存在的视觉真值，非新造）：
 *   - `sections[].styles.flexGrow`（A4 归一化系数）
 *   - `sections[].styles.figmaHeightPx`（审计用像素）
 *   - `sections[].layout`（'grid'|'horizontal'|'vertical'）+ `sections[].gridColumns` / `body.gridColumns`
 *
 * @returns {Record<string,{flexGrow:number,heightPx:number|null,display:string,gridColumns:number|null,flexDirection:('row'|'column'|null)}>|null}
 *   注：`flexDirection` 为 null 表示「设计稿未给出明确方向」（非 'horizontal'/'vertical'），
 *   下游写盘可兜底为 column，但方向类门禁（FLEX-006）必须跳过 null，不可当作 column 校验。
 */
export function buildSectionLayoutFacts(modelFiles, layoutStructure, params = {}) {
  try {
    if (!modelFiles || typeof modelFiles !== 'object') return null;
    const aligned = alignSectionClasses(modelFiles, layoutStructure, params);
    if (!aligned) return null;
    const map = {};
    for (const { cls, sec } of aligned) {
      const flexGrow = Number(sec?.styles?.flexGrow) || 0;
      const heightPxRaw = Number(sec?.styles?.figmaHeightPx);
      const layout = String(sec?.layout || sec?.body?.layout || '').toLowerCase();
      const gridColumnsRaw = Number(
        sec?.gridColumns ?? sec?.body?.gridColumns ?? NaN,
      );
      const hasGrid = Number.isFinite(gridColumnsRaw) && gridColumnsRaw > 1;
      const display = hasGrid || layout === 'grid' ? 'grid' : 'flex';
      // 🎯 M2.1-A（2026-09-16 治本）：旧式 `layout === 'horizontal' ? 'row' : 'column'` 对
      // **任何非 'horizontal' 的值**（含 undefined / 'grid' / 未知串）一律产 'column' ——
      // 既静默写错方向，又让下游 FLEX-006 无法区分「真值就是 column」与「压根没有真值」。
      // 现只认明确值：horizontal→row、vertical→column；其余一律 null（= 无真值）。
      // 写盘行为不变（resource-mounter 用 `facts.flexDirection || 'column'` 兜底），
      // 但 FLEX-006 见 null 即跳过不判（阈值纪律：宁可漏报，不误杀）。
      const flexDirection =
        layout === 'horizontal'
          ? 'row'
          : layout === 'vertical'
            ? 'column'
            : null;
      map[cls] = {
        flexGrow,
        heightPx: Number.isFinite(heightPxRaw) && heightPxRaw > 0 ? Math.round(heightPxRaw) : null,
        display,
        gridColumns: hasGrid ? Math.round(gridColumnsRaw) : null,
        flexDirection,
      };
    }
    return map;
  } catch {
    return null;
  }
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
    // 🛡️ 治本（2026-09-15）：与 code-generator resolvePlanSections 同源——先 dedupe 再取叶子，
    // 避免「设备网格」冗余切片（flexGrow=0 被 filter）导致叶子数(3)≠planLeaves(4) → fail-open null。
    const planLeaves = collectLeafSections(
      dedupeDuplicateSections(plan?.effectiveSections || []),
    );
    // 🎯 治本（2026-09-14 · c-traffic-monitor-3147d679 真机实锤）：flexGrow 消费断链。
    // 原实现「顺序取 repaired plan.effectiveSections、数值取 raw vision 的 styles.flexGrow」，
    // 两处不同源：vision 自报系数是猜测（一对 Figma 高度同为 131px 的等高柱状图被报成
    // 3.73 / 0.952，3.9 倍失配），planner 的 applyFigmaHeightGrow 已按 Figma 实测高度
    // 归一改写并为 1.327 / 1.327，但值本身读不到 → 错误系数一路写进 common.less
    // （塔状高度失衡 → 大空白/区块挤压重叠），且全部门禁放行（BLOCK=0）。
    // 铁律：**同一概念只允许一处事实源**——顺序与数值必须同源于 repaired plan leaf。
    const pxOfAuthoritative = (eff, sec) => {
      const repaired = Number(eff?.layoutMetadata?.flexGrow);
      if (Number.isFinite(repaired) && repaired > 0) return repaired;
      return pxOf(sec);
    };
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
          // 🎯 2026-09-14：数值源改为 pxOfAuthoritative（repaired plan leaf 优先），
          // pxOf(raw vision) 仅作「该 leaf 没修过」时的兜底。
          const px = pxOfAuthoritative(eff, sec);
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

    // 🆕 单文件组件（无子组件目录，2026-09-15）：section 根是根模板直接子 div（LLM 自由命名），
    // 无大写子组件标签 → 多子组件对齐路径天然失效。此处按「直接子元素 class 文档顺序 ↔
    // vision sections 顺序」保守 1:1 对齐；数量不等 / 有元素缺 class / 无法解析 → fail-open null。
    // 与 figma-height-ratio.applyFigmaSectionRatios 的「数量相等才顺序配对」同口径（不猜）。
    if (tags.length === 0) {
      const directClasses = extractRootDirectChildClasses(tpl);
      if (
        directClasses.length >= 2 &&
        directClasses.length === orderedSections.length &&
        directClasses.every((cls) => typeof cls === 'string' && cls.length > 0)
      ) {
        const mono = {};
        for (let i = 0; i < directClasses.length; i++) {
          mono[directClasses[i]] = orderedSections[i];
        }
        return mono;
      }
      return null;
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
