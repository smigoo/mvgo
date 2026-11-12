/**
 * 🛡️ 删减法批次 2（2026-09-14 · c-device-monitor-485d724d 实锤）：资源挂载计划——单一事实源。
 *
 * 取代四个事后纠偏器的「猜测」职责：
 *   - autoMountUnusedBackgrounds / autoMountUnusedIcons：LLM 漏引用 → 关键词猜目标挂载；
 *   - dedupeSameImageAliases：同图多别名（12 卡 bg3~bg14 → bg-8439.png）→ 事后合并；
 *   - ensureHeaderSlots：header 资源落点修正。
 *
 * 计划层确定性产出：
 *   ① 同 resourceFile 固化单变量（首个 assignedVarName 为唯一事实）+ sharedBy 全节点；
 *   ② owner 解析：entry.figmaNodeId ∈ section.sourceNodeIds（批次 1 已锚定）→ 组件名；
 *      不直接命中则沿 figma 祖先链上溯（switch 双态 bg 是状态容器的子节点）；
 *      仍不命中 → owner=null 归 'index' 根，**不猜**；
 *   ③ skipMount / downloadStatus!=='success' 不进计划（后者走既有 CSS 兜底路径）。
 *
 * 纯函数、确定性、幂等；无 import.meta，可单测。
 *
 * @param {Array} effectiveSections 批次 1 锚定后的 sections
 * @param {Array} resourceDomMapping figma-connector 固化的映射（含 assignedVarName）
 * @param {Object} [opts]
 * @param {Object} [opts.figmaRoot] figma.json 根节点（祖先链解析；缺省时仅直接命中）
 * @returns {{byFile: Map, byComponent: Map, skipped: Array}}
 */
import {
  assignSectionComponentNames,
  collectLeafSections,
} from '../../utils/section-tree.js';
import {
  validateVueSfc,
  extractLessGlobalVars,
} from '../../utils/sfc-syntax-validation.js';
import {
  bgBindingOwnership,
  collectMountCandidates,
  ensureReferencedIconSize,
  ensureResourceImportInVue,
  findTagByClassKeyword,
  findTemplateRootTag,
  findVForItemTag,
  iconSizeFromFigmaBox,
  injectBgStyleBinding,
  injectImgChild,
  mountSubStateBackground,
  pickBestMountTarget,
} from './resource-mounter.js';

/**
 * 🛡️ 刀A（2026-11-05 · `c-env-monitor-c324a730` 实锤）：锚点**上提**的几何共位阈值。
 *
 * 背景真值盒（`parentBox` 优先、退化 `figmaBox`）与**被上提到的**锚点元素盒，在两轴上的
 * 覆盖率都必须 ≥ 本阈值，才认定为「同一层容器的背景」。
 *
 * 取值依据（非魔法数）：容器背景与容器同层时两轴覆盖率 ≈ 1.0；跨层样本实锤
 * `bg-7890.png` 295×27 被上提到 380×145 的段根 ⇒ 覆盖率 0.776 / **0.186**（min=0.186）。
 * 0.5 落在「同层≈1.0」与「跨层 0.186」之间，两侧都留有余量；
 * 对仅缺一侧真值的样本一律 fail-open（不拦），确保不劣于旧行为。
 */
const ANCHOR_PROMOTION_MIN_AXIS_RATIO = 0.5;

/**
 * 🛡️ #2（2026-09-22 · c-device-monitor-9120a940 实锤）：从单个开标签的 :style 中剥离 bg* 键。
 * 共享背景（sharedBy>1）被正确落点到 v-for item 后，需把 LLM 误挂到面板根的同一 bg 变量剔除，
 * 否则 bg 会被 background-size:100% 拉伸铺满整个容器（逐卡背景消失）。仅删 background* 键，
 * 保留其它业务样式；若 :style 仅含 bg* 键则连 :style 属性一起删。
 *
 * @param {string} tag 开标签字符串（如 <div class="x" :style="{ backgroundImage: ... }">）
 * @param {string} varName 背景资源变量名（如 bg3）
 * @returns {string} 剥离后的标签；无法安全处理时原样返回
 */
function stripBgKeysFromTag(tag, varName) {
  if (typeof tag !== 'string' || !new RegExp(`\\b${varName}\\b`).test(tag)) return tag;
  const styleMatch = tag.match(/:style="([^"]*)"/);
  if (!styleMatch) return tag;
  const inner = styleMatch[1];
  if (!/^\{[\s\S]*\}$/.test(inner.trim())) return tag;
  const bgKeyRe = /\s*(?:background(?:Image|Size|Position|Repeat)?)\s*:[^,}]+,?/g;
  const stripped = inner
    .replace(bgKeyRe, '')
    .replace(/,\s*\}/, '}')
    .replace(/\{\s*,/, '{')
    .trim();
  const body = stripped.slice(1, -1); // 去掉首尾 {}
  const hasOther = /[a-zA-Z-]+\s*:/.test(body);
  if (!hasOther) return tag.replace(/\s*:style="[^"]*"/, '');
  return tag.replace(/:style="\{[\s\S]*\}"/, `:style="${stripped}"`);
}

/**
 * 🛡️ 兄弟卡背景组识别（2026-11-11 · 重点车辆监测 mc-max-1794407888630-408d924a 实锤）。
 *
 * 病灶：折叠接管把 N 张同构兄弟卡折叠为**一个** section（锚 = 单卡 id，如 136:127）+
 * v-for 渲染。资源计划层的 owner/anchor 模型是「一节点一 owner」⇒ 兄弟卡背景里只有
 * 恰好被选为锚的那张能解析（owner=136:127 ∈ 产物锚点），其余兄弟（owner=136:128/129）
 * 的候选链 [136:128, 2:8023, 136:121, 2:7952] 与产物锚点集零交集 ⇒ 锚点 none ⇒
 * fail-closed 丢弃；LLM 又把三张散挂到 icon img / value-wrap / 段根拉伸 ⇒ E3-v4 拒交付。
 * `package/sections/StatsSection.vue` 骨架注释「背景图由系统注入」证明该确定性通道是
 * 设计内意图但从未接线 —— 本函数补上识别半边，执行半边见 `mountCardBgGroups`。
 *
 * 判据（全走 mapping 真值，逐事实缺失即跳过，不猜）：
 *   ① 同父分组：ancestorIds[1]（bg 节点的共同祖父容器）相同；
 *   ② 瓦片折叠：|Δy| ≤ 2、高比 ∈ [0.85, 1/0.85]、x 轴不重叠（前缘 ≥ 前张后缘 − 2）；
 *   ③ 锚点有据（排除「全员已锚定且锚互异」的独立建模；二选一）：
 *     a) 任一成员已锚定 ⇒ 用首个已锚成员的锚（408d924a 混合锚点态形态）；
 *     b) 全员未锚定但存在**全员公共产物祖先锚**（如折叠锚=父行 136:121，三张 bg 的
 *       ancestorIds 都含它）——锚=该父行 section 本身（2ffdaae3 形态）；
 *     c) 全员锚到同一祖先段（非各自 owner）⇒ 塌缩形态，同样轮换（2ffdaae3 真机
 *       anchorStats.ancestor=3 实锤）。
 *     ——全员未锚定且无公共产物祖先锚 ⇒ 落点无据，不猜。
 * 输出 member 按 x 升序 = v-for item 序（折叠接管按 figma 子序铺 item，网格场景即 x 序）。
 *
 * 纯函数。@returns {Array<{anchorId:string, members:Array<{file,varName,x}>}>}
 */
function groupSiblingCardBgs(records) {
  const groups = [];
  if (!Array.isArray(records)) return groups;
  const byParent = new Map();
  for (const r of records) {
    if (!r || !r.parentId) continue;
    if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
    byParent.get(r.parentId).push(r);
  }
  for (const [, arr] of byParent) {
    if (!Array.isArray(arr) || arr.length < 2) continue;
    const sorted = arr
      .filter((r) => {
        const b = r.figmaBox;
        return b && Number(b.width) > 0 && Number(b.height) > 0;
      })
      .sort((a, b) => Number(a.figmaBox.x) - Number(b.figmaBox.x));
    const tiles = [];
    let cur = [];
    for (const r of sorted) {
      if (cur.length === 0) {
        cur.push(r);
        continue;
      }
      const pb = cur[cur.length - 1].figmaBox;
      const b = r.figmaBox;
      const sameY = Math.abs(Number(b.y) - Number(pb.y)) <= 2;
      const hRatio = Number(b.height) / Number(pb.height);
      const hOK = hRatio >= 0.85 && hRatio <= 1 / 0.85;
      // 🛡️ x 判据（408d924a 真值修正）：卡片盒允许小比例重叠（真值实锤 11.5/120 ≈ 9.6%
      //   ——阴影/圆角出血），要求「前缘推进」即可：新张前缘 ≥ 前张前缘 + 70% 宽。
      //   同 x 铺叠的全幅背景（0% 推进）不满足 ⇒ 不成组（那些不是兄弟卡瓦片）。
      const xOK = Number(b.x) >= Number(pb.x) + Number(pb.width) * 0.7;
      if (sameY && hOK && xOK) cur.push(r);
      else {
        tiles.push(cur);
        cur = [r];
      }
    }
    if (cur.length > 0) tiles.push(cur);
    for (const tile of tiles) {
      if (tile.length < 2) continue;
      const anchored = tile.filter((r) => r.anchorIsProduct);
      // 🛡️ 判据③（2026-11-11 晚 · mc-max-1794409272887-2ffdaae3 实锤二次推广）：
      //   「独立建模」的标志是**锚互异**（每张卡各有自己的 owner 级锚）⇒ 轮换无必要；
      //   而全员锚到**同一个**祖先段（折叠锚=父行 136:121，anchorStats.ancestor=3 实锤）
      //   意味着三张 bg 全部塌缩到同一个段根拉伸 —— 恰是需要轮换的病灶形态。
      //   锚点来源优先级：
      //   a) 任一成员已锚定 ⇒ 用首个已锚成员的锚（408d924a 混合锚点态形态）；
      //   b) 全员未锚定 ⇒ 取全员公共产物祖先锚（ancestorIds 深→浅首条命中）。
      //   仍拒绝：无任何锚定且无公共产物祖先锚（落点无据，不猜）。
      const allAnchoredDistinct =
        anchored.length === tile.length &&
        new Set(tile.map((r) => String(r.anchorId))).size === tile.length;
      let anchorId = null;
      if (!allAnchoredDistinct) {
        if (anchored.length > 0) {
          anchorId = String(anchored[0].anchorId);
        } else {
          const first = tile[0].productAncestorAnchors || [];
          for (const cand of first) {
            if (tile.every((r) => (r.productAncestorAnchors || []).includes(cand))) {
              anchorId = cand;
              break;
            }
          }
        }
      }
      if (!anchorId) continue;
      // 同图多节点（sharedBy）会以同 varName 重复入组 ⇒ 按 varName 去重保首（x 序）
      const seen = new Set();
      const members = [];
      for (const r of tile) {
        if (!r.varName || seen.has(r.varName)) continue;
        seen.add(r.varName);
        members.push({ file: r.file, varName: r.varName, x: Number(r.figmaBox.x) });
      }
      if (members.length < 2) continue;
      groups.push({ anchorId, members });
    }
  }
  return groups;
}

/**
 * 🛡️ 兄弟卡背景组执行器：把组内背景按 x 序轮换挂到锚点 section 的 v-for item 上。
 *
 * 落点选择（确定性）：含 `data-section-id="<anchorId>"` 且被 index.vue 实际 import 的
 * 组件文件优先（`package/sections/` 确定性骨架是**死文件**——index.vue 只 import
 * `./components/*`，绝不落入死文件）；仅当 index.vue 未引用时才允许 components/ 兜底。
 *
 * 步骤：① 剥错位消费（成员 var 出现在非 item 开标签的 bg 键——根拉伸/icon img/value-wrap
 * 全剥，复用 stripBgKeysFromTag 单点判据）；② ensure import；③ v-for 补索引变量
 * （已有索引则复用）；④ item 标签注入轮换 :style（item 已有 :style ⇒ 保守放弃，不合并
 * 复杂表达式）；⑤ 注入 `const FG_CARD_BGS = [...]`（x 序真值）——该形态是 E3-v4 v2 已
 * 祝福的数据驱动消费（v4 起为独立合规形态）；⑥ validateVueSfc 自检失败即放弃（不写回）。
 * 幂等：目标文件已含 FG_CARD_BGS ⇒ 跳过。
 */
export function mountCardBgGroups(allFiles, plan, options = {}) {
  const mounted = [];
  const diagnostics = [];
  const logger = options.logger || null;
  const groups = Array.isArray(plan?.cardBgGroups) ? plan.cardBgGroups : [];
  // 计数行恒打（判据可观测；0 也打）
  logger?.info?.('🛡️ 兄弟卡背景组·已评估', { groups: groups.length });
  if (!allFiles || typeof allFiles !== 'object' || groups.length === 0) {
    return { mounted, diagnostics };
  }
  const lessGlobalVars = options.lessGlobalVars || extractLessGlobalVars(allFiles);
  for (const grp of groups) {
    const anchorSel = `data-section-id="${grp.anchorId}"`;
    const indexSrc = typeof allFiles['package/index.vue'] === 'string' ? allFiles['package/index.vue'] : '';
    const importedSet = new Set();
    for (const im of indexSrc.matchAll(/import\s+\w+\s+from\s+['"](\.[^'"]+\.vue)['"]/g)) {
      importedSet.add(im[1].replace(/^\.\//, 'package/'));
    }
    const cands = Object.keys(allFiles).filter(
      (p) => typeof allFiles[p] === 'string' && allFiles[p].includes(anchorSel),
    );
    const targetFile =
      cands.find((p) => importedSet.has(p)) ||
      cands.find((p) => /^package\/components\/[^/]+\.vue$/.test(p)) ||
      null;
    if (!targetFile) {
      diagnostics.push({ reason: 'card-bg-group-anchor-missing', anchor: grp.anchorId });
      logger?.warn?.('🛡️ 兄弟卡背景组：锚点落点文件不存在（fail-closed 不硬挂）', {
        anchor: grp.anchorId,
      });
      continue;
    }
    let content = allFiles[targetFile];
    // 🛡️ 幂等守卫拆开（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤，根治③a）：
    //   旧实现是裸 `continue` —— 已注入时连「① 剥错位消费」一起跳过。而事实链通道
    //   （锚点悬空回退祖先）在修复轮/重装配时会**重新追加**段根 :style ⇒ 无人再剥
    //   ⇒ 段根 + item 双挂永久残留（同一张图画 n 份）。
    //   正确语义：剥离幂等安全、永远执行；仅「注入」部分跳过。
    const alreadyInjected = /\bFG_CARD_BGS\b/.test(content);
    // ① 剥错位消费（先于一切注入；item 标签自身的 bg 引用不在剥除范围——它本就是落点）
    const strippedContent = content.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
      let out = tag;
      for (const mm of grp.members) out = stripBgKeysFromTag(out, mm.varName);
      return out;
    });
    if (strippedContent !== content) {
      allFiles[targetFile] = strippedContent;
      content = strippedContent;
      logger?.warn?.('🛡️ 兄弟卡背景组：已注入文件仍剥除错位 bg 消费（幂等拆分）', {
        file: targetFile,
        anchor: grp.anchorId,
      });
    }
    if (alreadyInjected) continue; // 幂等：注入零改动（剥离结果已回写）
    // ② ensure import（mapping 仅用 resourceFile 字段；已在 ⇒ 原样返回）
    for (const mm of grp.members) {
      content = ensureResourceImportInVue(content, mm.varName, { resourceFile: mm.file }, targetFile);
    }
    // ③④ v-for 索引 + item 轮换 :style
    const itemTag = findVForItemTag(content);
    if (!itemTag) {
      diagnostics.push({ reason: 'card-bg-group-no-vfor-item', file: targetFile });
      logger?.warn?.('🛡️ 兄弟卡背景组：落点无 v-for item（fail-closed 不硬挂）', { file: targetFile });
      continue;
    }
    if (/:style=/.test(itemTag)) {
      diagnostics.push({ reason: 'card-bg-group-item-style-occupied', file: targetFile });
      logger?.warn?.('🛡️ 兄弟卡背景组：v-for item 已有 :style（不合并复杂表达式，放弃）', {
        file: targetFile,
      });
      continue;
    }
    const vfM = itemTag.match(/\bv-for="([^"]*)"/);
    if (!vfM) {
      diagnostics.push({ reason: 'card-bg-group-vfor-unreadable', file: targetFile });
      continue;
    }
    const expr = vfM[1];
    let idxName = '_fgBgI';
    let newExpr = expr;
    const indexed = expr.match(/\(([^)]*,[^)]*)\)\s+(?:in|of)\s+/);
    if (indexed) {
      const parts = indexed[1].split(',').map((s) => s.trim());
      idxName = parts[parts.length - 1];
    } else {
      while (new RegExp(`\\b${idxName}\\b`).test(content)) idxName = `${idxName}I`;
      newExpr = expr.replace(/^([\s\S]*?)\s+(in|of)\s+/, `($1, ${idxName}) $2 `);
    }
    const styleBinding =
      `:style="{ backgroundImage: 'url(' + FG_CARD_BGS[${idxName} % FG_CARD_BGS.length] + ')', ` +
      `backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"`;
    const newTag = itemTag
      .replace(/\bv-for="[^"]*"/, `v-for="${newExpr}"`)
      .replace(/>$/, ` ${styleBinding}>`);
    if (newTag === itemTag || !/>$/.test(itemTag)) {
      diagnostics.push({ reason: 'card-bg-group-tag-rewrite-failed', file: targetFile });
      continue;
    }
    const at = content.indexOf(itemTag);
    content = content.slice(0, at) + newTag + content.slice(at + itemTag.length);
    // ⑤ FG_CARD_BGS 常量（x 序 = members 已按 x 升序）
    const vars = grp.members.map((mm) => mm.varName);
    const constLine =
      `\n// 🛡️ 兄弟卡背景组 x 序真值（资源计划层确定性轮换挂载）\n` +
      `const FG_CARD_BGS = [${vars.join(', ')}]`;
    let lastImportEnd = -1;
    for (const im of content.matchAll(/^import[^\n]+$/gm)) {
      lastImportEnd = im.index + im[0].length;
    }
    if (lastImportEnd < 0) {
      diagnostics.push({ reason: 'card-bg-group-no-import-section', file: targetFile });
      continue;
    }
    content = content.slice(0, lastImportEnd) + constLine + content.slice(lastImportEnd);
    // ⑥ SFC 自检（注入器自检防线同款；失败不写回）
    const check = validateVueSfc(content, targetFile, { lessGlobalVars });
    if (!check.valid) {
      diagnostics.push({
        reason: 'card-bg-group-sfc-invalid',
        file: targetFile,
        errors: (check.errors || []).slice(0, 2),
      });
      logger?.warn?.('🛡️ 兄弟卡背景组：注入后 SFC 自检失败，已放弃（不写回）', {
        file: targetFile,
        errors: (check.errors || []).slice(0, 2),
      });
      continue;
    }
    allFiles[targetFile] = content;
    mounted.push({
      var: vars.join(','),
      file: targetFile,
      role: 'bg',
      mountTarget: 'v-for-item-rotation',
      anchor: grp.anchorId,
    });
    logger?.info?.('🎯 [资源挂载] 兄弟卡背景组 → v-for item 轮换挂载', {
      file: targetFile,
      anchor: grp.anchorId,
      vars,
    });
  }
  return { mounted, diagnostics };
}

/**
 * 🛡️ 刀33 第3步（per-item 宿主存在性探测 · 2026-10-29 · mc-max-1793281736684-802b780c 实锤）：
 *   在**其它文件**里找「同时满足 ① 引用该资源变量、② 含 v-for item 模板」的文件。
 *
 * 语义：折叠段接管把列表渲染搬进独立子组件（ListSection.vue）后，本文件（index.vue）没有
 *   任何 v-for item ⇒ 事实链锚点（`data-section-id=<重复单元>`）命中的是**重复单元**本身而非
 *   列表容器，挂上去等于「整块只画一次」；而该资源的 per-item 宿主（v-for item）在别的文件里。
 *
 * 本探测只回答一个**存在性事实**：外部 per-item 宿主确实存在且已引用本资源 ⇒ 本文件应当让位。
 *   找不到 ⇒ 返回 null，调用方不得让位（行为不劣于旧实现）。
 *
 * 🔴 判据修正留痕（2026-10-29 真机取证 · mc-1793286461778-8ad1ccc1）：
 *   初版另有前置条件 `g.sharedBy.length > 1`，但该条件在真机**恒为假**——折叠 dedup 后
 *   `.mc-gen/resource-dom-mapping.json` 里 `image_313-5800.png`(bg1) **只有 1 条**；真机里
 *   条数 >1 的只有 `icon-5823.png`(×5) 且其 role 是 `icon` ⇒ `bg ∧ sharedBy>1` 是空集合，
 *   初版判据是**死代码**。故改为纯存在性判据（见调用点 :510 附近注释）。
 *
 * ⚠️ 不可收紧为「var 必须出现在 v-for item **开标签内**」：`findVForItemTag` 的正则
 *   `[^>]*?` 非贪婪，会被 item 行内的 `marginTop: __i > 0` 的 `>` 截断 ⇒ 返回的 tag 里
 *   读不到 `bg1`（离线实测）。只能按「文件级：含该 var ∧ 含 v-for item」判。
 *
 * @param {Record<string, string>} allFiles 产物文件表（路径 → 内容）
 * @param {string} varName 资源变量名（如 bg1）
 * @param {string} selfFile 当前文件路径（排除自身）
 * @returns {{ file: string, tag: string } | null}
 */
function findExternalVForItemHost(allFiles, varName, selfFile) {
  if (!allFiles || typeof allFiles !== 'object' || !varName) return null;
  const rx = new RegExp(`\\b${varName}\\b`);
  for (const [fp, fc] of Object.entries(allFiles)) {
    if (fp === selfFile || typeof fc !== 'string' || !fc) continue;
    if (!rx.test(fc)) continue;
    const tag = findVForItemTag(fc);
    if (tag) return { file: fp, tag };
  }
  return null;
}

/**
 * 🛡️ 刀33 第3步（统一 per-item 让位判据 · 2026-10-30 · mc-1793287232957-71c64e28 实锤）：
 *   封装「落点无 v-for item ∧ 外部存在 per-item 宿主 ⇒ 让位」为单一判据，
 *   供**所有 bg 写入分支**在确定落点后、写入前统一调用。
 *
 *   真机教训：初版只在「早退守卫」里检查 `content`（计划 owner 文件），
 *   但事实链分支（§六#4）的落点是**全库扫描**得到的另一个文件 ⇒ 守卫看错了文件。
 *   ⇒ 必须在每个分支的**实际落点**上重新评估，而非只看 owner 文件。
 *
 * @param {Record<string, string>} allFiles 产物文件表
 * @param {string} varName 资源变量名
 * @param {string} candidateFile 候选落点文件路径
 * @param {string} candidateContent 候选落点文件内容
 * @returns {{ file: string, tag: string } | null} 命中则返回外部宿主（应让位），否则 null
 */
function findPerItemYieldHost(allFiles, varName, candidateFile, candidateContent) {
  if (typeof candidateContent !== 'string') return null;
  if (findVForItemTag(candidateContent)) return null; // 落点本身是 per-item 宿主 ⇒ 正常挂
  return findExternalVForItemHost(allFiles, varName, candidateFile);
}

/**
 * 🛡️ 2026-09-29：按 `data-section-id="<anchor>"` 取回**开标签全文**（含属性）。
 *
 * 原实现用正则
 * `<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?\bdata-section-id="…"(?:"[^"]*"|'[^']*'|[^>"'])*)>`
 * —— 该模式含**嵌套量词** `(?:A|B|C)*?`，属典型 **ReDoS**：全语料离线遍历时直接被 OOM/Kill
 * （2026-09-29 审计进程 SIGTERM 实锤）。改为**线性扫描**（先定位 needle，再向两侧找 `<` / `>`，
 * 向后扫描时跳过引号内的 `>`），复杂度 O(n) 且行为与正则一致（取文件中**第一个**该锚点开标签）。
 *
 * 导出以便审计脚本与实现**严格同源**（不各自复刻判据）。
 *
 * @param {string} content .vue 文件内容
 * @param {string} anchor section id（如 `2:3446`）
 * @returns {string|null} 开标签全文（如 `<div class="x" data-section-id="2:3446" :style="…">`）
 */
/**
 * 🛡️ 产物开标签 → Figma 节点几何真值（S7 几何相容门的落点盒解析，2026-11-12）。
 *
 * 两条纯事实路径，命中即返回；都取不到返回 null（调用方 fail-open）：
 *   ① `data-section-id="X"` ⇒ `figmaIndex.get(X).absoluteBoundingBox`（产物段锚直连真值）；
 *   ② class 内 ≥5 位数字 ↔ Figma 节点 `name` 里的同名数字（产物类名由节点名派生，
 *      如 `c-hazard-investigation-2002-132-con` ↔ `item-inspection-stats-row-1 2002 132`）。
 *      Figma 图层名会复用 ⇒ **只在唯一命中时采用**，歧义即放弃（不猜）。
 *
 * 刻意不做「按尺寸猜最像的节点」——几何真值必须来自 id/名映射，猜出来的尺寸不能当判据。
 *
 * @param {string} tag 开标签字符串
 * @param {string} cls 该标签 class 串（缺省从 tag 里抽）
 * @param {Map|null} figmaIndex nodeId → 原始 Figma 节点
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function resolveProductTagBox(tag, cls, figmaIndex) {
  if (!figmaIndex || typeof figmaIndex.get !== 'function') return null;
  const ok = (b) => {
    if (!b) return null;
    const w = Number(b.width);
    const h = Number(b.height);
    return w > 0 && h > 0 ? { x: Number(b.x) || 0, y: Number(b.y) || 0, width: w, height: h } : null;
  };
  const t = String(tag || '');
  // ① data-section-id 直连
  const sid = (t.match(/data-section-id="([^"]+)"/) || [])[1] || (t.match(/data-section-id='([^']+)'/) || [])[1];
  if (sid) {
    const n = figmaIndex.get(String(sid));
    const b = ok(n && (n.absoluteBoundingBox || n.box));
    if (b) return b;
  }
  // ② class 数字 ↔ 节点名数字（唯一命中才用）
  const clsStr =
    cls != null && String(cls).trim()
      ? String(cls)
      : ((t.match(/\bclass="([^"]*)"/) || [])[1] || (t.match(/\bclass='([^']*)'/) || [])[1] || '');
  for (const num of clsStr.match(/\d{5,}/g) || []) {
    const hits = [];
    for (const [, n] of figmaIndex) {
      if (n && String(n.name || '').includes(num)) hits.push(n);
      if (hits.length > 1) break; // 歧义：不再收集
    }
    if (hits.length === 1) {
      const b = ok(hits[0].absoluteBoundingBox || hits[0].box);
      if (b) return b;
    }
  }
  // ③ class 词元 ↔ 节点 name 词元（无数字的中间容器，如 `…-slot-con` ↔ `slot-con`）
  //    要求节点 name 的**全部**词元都出现在 class 词元里、且匹配词元数 ≥ 2，
  //    并在「最多匹配」上唯一 —— 并列即放弃（`slot-con` 这类通用名在多组件里会重名）。
  const tokenSet = new Set((clsStr.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 2));
  if (tokenSet.size >= 2) {
    let bestN = 0;
    let bestNode = null;
    let tie = false;
    for (const [, n] of figmaIndex) {
      const nameTokens = String((n && n.name) || '')
        .toLowerCase()
        .match(/[a-z0-9]+/g) || [];
      if (nameTokens.length < 2) continue;
      if (!nameTokens.every((w) => tokenSet.has(w))) continue;
      if (nameTokens.length > bestN) {
        bestN = nameTokens.length;
        bestNode = n;
        tie = false;
      } else if (nameTokens.length === bestN) {
        tie = true;
      }
    }
    if (!tie && bestNode) {
      const b = ok(bestNode.absoluteBoundingBox || bestNode.box);
      if (b) return b;
    }
  }
  return null;
}

export function findTagBySectionAnchor(content, anchor) {
  if (typeof content !== 'string' || !content || anchor == null) return null;
  const a = String(anchor);
  // 🛡️ α3（2026-11-05）：`data-section-id` 是段身份（code-generator.js:776 红线：内层节点
  //   绝不复用）⇒ 资源宿主锚走专用属性 `data-resource-anchor`，此处**次优先级**识别。
  //   优先级：section-id 单引号 > section-id 双引号 > resource-anchor 单/双引号——
  //   前两者是既有行为保持不变，仅在其全部 miss 后才落到补标锚。
  const patterns = [
    `data-section-id="${a}"`,
    `data-section-id='${a}'`,
    `data-resource-anchor="${a}"`,
    `data-resource-anchor='${a}'`,
  ];
  let idx = -1;
  let nlen = 0;
  for (const p of patterns) {
    idx = content.indexOf(p);
    if (idx >= 0) {
      nlen = p.length;
      break;
    }
  }
  if (idx < 0) return null;
  const lt = content.lastIndexOf('<', idx);
  if (lt < 0) return null;
  // 该 `<` 必须是开标签起始（后面紧跟标签名），且 `<` 与锚点之间不能再有 `>`（否则跨标签）
  if (!/^[a-zA-Z][\w-]*/.test(content.slice(lt + 1, lt + 40))) return null;
  if (content.lastIndexOf('>', idx) > lt) return null;
  let inStr = null;
  for (let i = idx + nlen; i < content.length; i++) {
    const ch = content[i];
    if (inStr) {
      if (ch === inStr && content[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '>') return content.slice(lt, i + 1);
  }
  return null;
}

export function buildResourceMountPlan(effectiveSections, resourceDomMapping, opts = {}) {
  const byFile = new Map();
  const byComponent = new Map();
  const skipped = [];
  const plan = { byFile, byComponent, skipped };
  // 🛡️ 兄弟卡背景组影子记录（bg 专用，循环内填充，循环后折叠成组）
  const bgRecords = [];

  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) {
    return plan;
  }
  const sections = Array.isArray(effectiveSections) ? effectiveSections : [];

  // 🛡️ 2026-11-05：产物**实际存在**的 section 锚点集合（allFiles 里真实出现过的
  //   `data-section-id`）。锚点解析以它为唯一事实：命中即可精确挂载，悬空则换祖先，
  //   全不命中记 unresolved（禁回退根容器——那是历史「背景消失/错位」的根源）。
  const productAnchorIds =
    opts.productAnchorIds instanceof Set ? opts.productAnchorIds : null;

  // ① nodeId → owner 组件名（section 单一归属，批次 1 锚定后 src 完备）
  const leaves = collectLeafSections(sections);
  const nameOf = assignSectionComponentNames(sections);
  const ownerOfNode = new Map();
  for (const sec of leaves) {
    const comp = nameOf.get(String(sec?.id));
    if (!comp) continue;
    for (const id of sec.sourceNodeIds || []) {
      const key = String(id);
      if (!ownerOfNode.has(key)) ownerOfNode.set(key, comp);
    }
  }

  // ② figma 祖先链索引（bg/icon 常为状态容器/卡片的子孙节点，不直接在 section.src）
  const parentOf = new Map();
  if (opts.figmaRoot && typeof opts.figmaRoot === 'object') {
    const walk = (node, parentId) => {
      if (!node || typeof node !== 'object') return;
      const id = node.id != null ? String(node.id) : null;
      if (id) parentOf.set(id, parentId);
      for (const c of node.children || []) walk(c, id);
    };
    walk(opts.figmaRoot, null);
  }

  const resolveOwner = (entry) => {
    const nid = entry.figmaNodeId != null ? String(entry.figmaNodeId) : '';
    if (!nid) return null;
    if (ownerOfNode.has(nid)) return ownerOfNode.get(nid);
    let cur = parentOf.get(nid) || null;
    while (cur) {
      if (ownerOfNode.has(cur)) return ownerOfNode.get(cur);
      cur = parentOf.get(cur) || null;
    }
    return null; // 不猜：归 index 根由调用方决策
  };

  // 🛡️ 事实优先级表 §六 #4（2026-09-28）：**section 锚点 id**（数据事实链）。
  //   产物里 section 容器带 `data-section-id="<figmaNodeId>"` → 只要给出「资源节点最近祖先里
  //   那个**确实是 section 的 id**」，挂载就能用 `data-section-id` **精确锁定元素**，
  //   不必依赖名字/关键字（中文语义名 vs 英文类名不同源必然失配）。
  //   实锤 `c-traffic-monitor-c302ccd1`：`88:34(bg1)` owner 解析失败 → 落 index → 丢；
  //   而其祖先容器 `2:3660` 在产物里有 `data-section-id="2:3660"` → 本可精确命中。
  const allSectionIds = new Set();
  const collectIds = (sec) => {
    const id = sec?.id != null ? String(sec.id) : '';
    if (id) allSectionIds.add(id);
    for (const c of sec?.children || []) collectIds(c);
  };
  for (const s of sections) collectIds(s);

  // 🛡️ 刀A（2026-11-05 · c-env-monitor-c324a730 实锤）：锚点**盒真值**索引。
  //   服务 resolveSectionAnchor 的「上提尺度共位」判据。事实源只用 effectiveSections 自己的
  //   figmaBox / absoluteBoundingBox —— 刻意**不引 figmaRoot**：本仓调用方传入的是
  //   `{fileKey,nodeId,tokenHash,cachedAt,document}` 包裹形态，`walk(opts.figmaRoot)` 沿
  //   `children` 走会得到**空索引**（另一个假绿，见 docs 同文件 §7）。缺盒 ⇒ 判据 fail-open。
  const sectionBoxById = new Map();
  const collectBoxes = (sec) => {
    if (!sec || typeof sec !== 'object') return;
    const id = sec.id != null ? String(sec.id) : '';
    const box = sec.figmaBox || sec.absoluteBoundingBox;
    if (id && box && Number(box.width) > 0 && Number(box.height) > 0) {
      sectionBoxById.set(id, {
        width: Number(box.width),
        height: Number(box.height),
      });
    }
    for (const c of sec.children || []) collectBoxes(c);
    for (const c of (sec.body && sec.body.children) || []) collectBoxes(c);
  };
  for (const s of sections) collectBoxes(s);

  /**
   * 🛡️ 刀A：上提是否「几何共位」。
   * @param {string} anchorId 被上提命中的锚点 id
   * @param {Object} entry mapping 条目（含 parentBox / figmaBox）
   * @returns {boolean} true=同层可挂；false=跨层，必须拒绝
   */
  const isCoLocatedAnchor = (anchorId, entry) => {
    // 🔴 仅 `bg` 适用（2026-11-05 真机重放实证）：图标/图片的真值盒天然远小于宿主 section
    //   （icon-7941 52×24 vs 380×145 = 0.137），且它们不以 `background-size:100% 100%` 拉伸
    //   ⇒ 不存在「跨层拉伸」病灶。若一并套用，会把所有 icon 锚点判死（本单实测 icon2/icon3 命中）。
    if (entry?.previewAnalysisRole !== 'bg') return true;
    const anchorBox = sectionBoxById.get(String(anchorId));
    const resBox = entry.parentBox || entry.figmaBox;
    if (!anchorBox || !resBox) return true; // 缺任一真值 → fail-open，不拦
    const w = Number(resBox.width);
    const h = Number(resBox.height);
    if (!(w > 0) || !(h > 0)) return true;
    const ratio = Math.min(w / anchorBox.width, h / anchorBox.height);
    return ratio >= ANCHOR_PROMOTION_MIN_AXIS_RATIO;
  };
  // 🛡️ 2026-09-29 治本（本轮实锤：c-traffic-monitor-f0c05ecc「当日总流量」背景图整块丢失）
  //   **直接父节点优先**。`ownerSectionId` = figma-connector 固化的「bg 节点的直接父节点 id」，
  //   与 `targetDomSelector = [data-section-id="<父节点id>"]` **同源**，是 figma 树里可直接读出的
  //   父子关系 ⇒ 它就是唯一答案，不需要任何推断、更不需要上溯。
  //
  //   旧实现只认 `sections`（section-tree 输出）里的 id ⇒ 直接父节点若是普通 GROUP/FRAME
  //   （不是 section，如 `Group 2136636802` 426×91）就会被**上溯到 section 级**
  //   （`slot-当日总流量` 420×807）⇒ 下方 L403 事实链把 426×91 的卡片背景精确挂到
  //   420×807 的整槽容器上、再被 `background-size:100% 100%` 拉满 ⇒ 视觉上「背景图消失」。
  //   实测：`88:34` 上溯链 `88:34 → 2:3660 → 88:33 → 2:9778`，旧实现取到根 `2:9778`
  //   （产物里不存在该锚点 ⇒ 事实链失配 ⇒ 回退 `findTagByClassKeyword('slot-当日总流量')`
  //   命中 `.c-traffic-monitor-slot-con` = 整槽容器）。
  //
  //   ⚠️ 刻意**不做** `allSectionIds` 过滤：产物里是否有 `data-section-id="<父节点id>"` 由
  //   下游 L403 事实链**自行验证**（找不到即 `continue` 走后续分支）⇒ 锚点不存在时行为
  //   不劣于旧实现，只是「更精确的锚点先试一次」。
  // 上提拒绝标记（单次调用内传递，供计划条目留痕 ⇒ 下游 fail-closed 短路）
  let lastPromotionRejected = false;
  let lastPromotionRejectedAnchor = null;
  const resolveSectionAnchor = (entry) => {
    lastPromotionRejected = false;
    lastPromotionRejectedAnchor = null;
    const owner =
      entry.ownerSectionId != null ? String(entry.ownerSectionId) : '';
    const nid = entry.figmaNodeId != null ? String(entry.figmaNodeId) : '';
    // 🛡️ 2026-11-05 治本（c-traffic-monitor-de627a9d 实锤）：锚点必须**真实出现在产物里**。
    //   旧实现「owner 有值即返回」⇒ owner 是中间 group（2:3660）而非产物 section（88:33）
    //   时锚点悬空 ⇒ 落回名字匹配 ⇒ 中文 mountTarget 与英文 class 词集交集恒为 0 ⇒ 全部
    //   fail-closed（该单 9 条诊断）。现改为在候选序列 [owner, ...祖先链] 中取第一个
    //   ∈ 产物实际 data-section-id 集合的 id；未传该集合时保持旧行为（向后兼容）。
    const candidates = [];
    if (owner) candidates.push(owner);
    if (Array.isArray(entry.ancestorIds)) {
      for (const id of entry.ancestorIds) {
        if (id == null) continue;
        const key = String(id);
        // 去重：owner 常同时是 ancestorIds[0] ⇒ 重复项会让
        // `skippedCandidates` 诊断出现同 id 两遍（语义无影响，可读性差）
        if (!candidates.includes(key)) candidates.push(key);
      }
    }
    if (candidates.length === 0 && nid) {
      let cur = parentOf.get(nid) || null;
      while (cur) {
        candidates.push(cur);
        cur = parentOf.get(cur) || null;
      }
    }
    if (productAnchorIds) {
      const hitIdx = candidates.findIndex((id) => productAnchorIds.has(id));
      if (hitIdx < 0) return null;
      const hit = candidates[hitIdx];
      // 🛡️ 刀A（2026-11-05 · c-env-monitor-c324a730 实锤）：**上提必须几何共位**。
      //   hitIdx>0 ⇒ 候选首位（owner / 直接父节点）在产物里不存在，本次是「上提」。
      //   旧实现无条件取第一个命中者 ⇒ `2:7889`(295×27 tab 底图) 的 owner 缺失后一路退到
      //   `89:41`(380×145 整段根) 并被 `background-size:100% 100%` 拉伸 13.5×。
      //   c72bbe2 的 commit 明写「禁回退根容器」，但实现未兑现 —— 此处补齐。
      if (hitIdx > 0 && !isCoLocatedAnchor(hit, entry)) {
        lastPromotionRejected = true;
        lastPromotionRejectedAnchor = hit;
        if (!plan.anchorPromotionRejected) plan.anchorPromotionRejected = [];
        plan.anchorPromotionRejected.push({
          varName: entry.assignedVarName ?? null,
          resourceFile: entry.resourceFile ?? null,
          ownerSectionId: owner || null,
          anchor: hit,
          skippedCandidates: candidates.slice(0, hitIdx),
          box: entry.parentBox || entry.figmaBox || null,
          anchorBox: sectionBoxById.get(String(hit)) || null,
        });
        return null;
      }
      return hit;
    }
    if (owner) return owner;
    if (!nid) return null;
    if (allSectionIds.has(nid)) return nid;
    return candidates.find((id) => allSectionIds.has(id)) || null;
  };

  // ③ 计划固化：同 resourceFile 单变量 + sharedBy；owner 分组
  for (const m of resourceDomMapping) {
    if (!m || typeof m !== 'object') continue;
    if (m.downloadStatus !== 'success') continue; // 失败走 CSS 兜底，不归本计划
    if (m.skipMount) {
      skipped.push({
        figmaNodeId: m.figmaNodeId ?? null,
        resourceFile: m.resourceFile ?? null,
        reason: 'skipMount',
      });
      continue;
    }
    const file = m.resourceFile;
    if (!file || !m.assignedVarName) continue;
    const kind = m.previewAnalysisRole || 'img';
    if (!byFile.has(file)) {
      byFile.set(file, {
        varName: m.assignedVarName, // 首个（traverse 序）变量为唯一事实
        kind,
        sharedBy: [],
        mounts: [],
      });
    }
    const g = byFile.get(file);
    const nid = m.figmaNodeId != null ? String(m.figmaNodeId) : null;
    if (nid && !g.sharedBy.includes(nid)) g.sharedBy.push(nid);
    const owner = resolveOwner(m);
    const _anchorId = resolveSectionAnchor(m);
    // 🛡️ 2026-11-05：锚点来源分档计数（真机日志计数行判据；owner 悬空时 ancestor 兜底）
    const _anchorSource = _anchorId
      ? String(m.ownerSectionId != null ? m.ownerSectionId : '') === _anchorId
        ? 'owner'
        : 'ancestor'
      : 'none';
    if (!plan.anchorStats) plan.anchorStats = { owner: 0, ancestor: 0, none: 0 };
    plan.anchorStats[_anchorSource] += 1;
    g.mounts.push({
      figmaNodeId: nid,
      owner,
      sectionAnchorId: _anchorId, // §六 #4：数据事实链锚点（产物真实存在的 section id）
      // 🛡️ 刀A：本次锚点是「上提」且被尺度判据拒绝 ⇒ 下游必须 fail-closed（禁止名字兜底）
      anchorPromotionRejected: lastPromotionRejected,
      anchorPromotionRejectedAnchor: lastPromotionRejectedAnchor,
      anchorSource: _anchorSource,
      ancestorIds: Array.isArray(m.ancestorIds) ? m.ancestorIds.map(String) : null,
      mountTarget: m.mountTarget || null,
      bgRole: m.bgRole || null,
      kind,
      figmaBox: m.figmaBox || null,
      parentBox: m.parentBox || null,
    });
    // 🛡️ 兄弟卡背景组影子记录（bg 专用；groupSiblingCardBgs 消费，见其头注释）
    if (kind === 'bg') {
      // 🛡️ 产物祖先锚链（ancestorIds 序 = 深→浅；折叠锚=父行形态用，见判据③ b）
      const productAncestorAnchors = Array.isArray(m.ancestorIds)
        ? m.ancestorIds.map(String).filter((id) => productAnchorIds && productAnchorIds.has(id))
        : [];
      bgRecords.push({
        parentId:
          Array.isArray(m.ancestorIds) && m.ancestorIds[1] != null ? String(m.ancestorIds[1]) : null,
        figmaBox: m.figmaBox || null,
        anchorId: _anchorId,
        anchorIsProduct: !!(_anchorId && productAnchorIds && productAnchorIds.has(_anchorId)),
        productAncestorAnchors,
        file,
        varName: g.varName,
      });
    }
    const comp = owner || 'index';
    if (!byComponent.has(comp)) byComponent.set(comp, []);
    byComponent.get(comp).push({
      varName: g.varName,
      resourceFile: file,
      kind,
      mountTarget: m.mountTarget || null,
      bgRole: m.bgRole || null,
      figmaNodeId: nid,
    });
  }

  // 🛡️ 兄弟卡背景组折叠（识别半边；执行半边在 mountPlannedResources 末尾 mountCardBgGroups）
  plan.cardBgGroups = groupSiblingCardBgs(bgRecords);

  // 🛡️ 互斥守卫（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤，根治③b）：
  //   已入兄弟卡背景组的 var，其「锚点悬空 → 祖先上提」挂载一律废锚（fail-closed）。
  //   组通道负责轮换挂载（FG_CARD_BGS），事实链只允许 owner 精确命中；
  //   放任祖先上提 = 事实链把组锚（常是远祖段根）反复重挂回来，与组通道形成
  //   「挂载/剥离」拉锯（幂等拆分只止血，这里是源头减量）。
  //   实现走 anchorPromotionRejected（下游既有 fail-closed 判据，禁名字兜底），
  //   不新增第二份拦截逻辑。
  if (Array.isArray(plan.cardBgGroups) && plan.cardBgGroups.length > 0) {
    const groupedVars = new Set();
    for (const grp of plan.cardBgGroups) {
      for (const mem of grp.members || []) {
        if (mem && mem.varName) groupedVars.add(mem.varName);
      }
    }
    let demoted = 0;
    for (const g of byFile.values()) {
      if (!groupedVars.has(g.varName)) continue;
      for (const mt of g.mounts) {
        if (mt.anchorSource === 'ancestor') {
          mt.sectionAnchorId = null;
          mt.anchorSource = 'none';
          mt.anchorPromotionRejected = true;
          demoted += 1;
        }
      }
    }
    if (demoted > 0 && opts.logger?.warn) {
      opts.logger.warn('🛡️ 兄弟卡背景组互斥：组内 var 的祖先上提锚已废（组通道负责挂载）', {
        demoted,
        groupedVars: [...groupedVars],
      });
    }
  }

  return plan;
}

/**
 * 🛡️ 批次 2 loop 2b：计划驱动挂载——替代 autoMountUnusedBackgrounds/Icons 的关键词猜测。
 *
 * 与旧实现的三条根本区别：
 *   ① 搜索空间限定 owner 文件（计划已解析归属）——零跨文件猜测、零 region/root 回退；
 *   ② 同 var+target 去重——共享底图（12 卡 bg-8439）单绑定单 import；
 *   ③ fail-closed——目标不命中只记诊断，不乱挂（旧实现回退挂根容器正是「背景消失/错位」根源）。
 *
 * 幂等：bg 变量已被引用即跳过；icon/img 已引用但缺 px 尺寸时仍按 figmaBox 装配（不另插 img）。
 *
 * @param {Object<string,string>} allFiles 产物文件表（原地更新）
 * @param {{byFile: Map}} plan buildResourceMountPlan 产出
 * @returns {{mounted: Array, diagnostics: Array}}
 */
export function mountPlannedResources(allFiles, plan, options = {}) {
  const mounted = [];
  const diagnostics = [];
  if (!allFiles || typeof allFiles !== 'object' || !plan || !plan.byFile) {
    return { mounted, diagnostics };
  }

  // 🛡️ P-08：figma 节点索引（bg 父卡片的几何真值），由调用方传入
  const figmaIndex = options.figmaIndex || null;

  // 🛡️ 注入器自检防线（2026-09-17 · 重点车辆监测 mc-max-1789608574046 实锤）：
  //   资源挂载（bg/icon）会把 :style / <img> / import 注入目标 .vue；若注入点错配
  //   （如「超高车辆」卡背景 bg1 经 S7 回退挂到「危化品车」卡 ContentSection5），
  //   注入会破坏 SFC 表达式 → P1-4 隔离 → 整块叶子静默消失（3 卡变 2 卡）。
  //   治本：每次写盘前用真实 SFC 编译器自检，失败即回滚该文件的本次注入，
  //   让坏文件根本不进入 P1-4 隔离链路。零硬编码、通用，覆盖任意注入破坏。
  /**
   * 🛡️ S7 几何相容门（2026-11-12 · mc-1794464620608-61ca9e0b 实锤）。
   *
   * ## 病灶
   * S7 的「回退最优挂载点」只按 **类名/关键词相似度** 打分（`scoreMountTarget`），
   * 完全不看尺寸。真机三张 tab 状态背景（`bg-tab-today/month/year`，各 **52×20**）
   * 因 LLM 未给 tab 元素对应类名而 miss ⇒ 回退被评分挑中
   * `slot-con`(396×292) / `item-inspection-stats-row`(288×45) / `Frame 2136638243`(385×192)
   * ⇒ `background-size:100% 100%` 把 **52×20 小图拉伸铺满整块面板**
   * （用户实测：上半区变成一块巨大蓝色渐变，雷达区数字发虚）。
   *
   * ## 判据（纯几何，与 `buildResourceMountPlan` 的 `isCoLocatedAnchor` **同源**）
   * 资源真值盒 `parentBox || figmaBox` 与**落点容器真值盒**两轴覆盖率
   * `min(w/aw, h/ah)` 必须 ≥ `ANCHOR_PROMOTION_MIN_AXIS_RATIO(0.5)`。
   * 同层 ≈ 1.0；跨层实锤 0.186；本案 0.068~0.18 —— 0.5 两侧都留余量。
   *
   * ## 缺事实一律 fail-open（不劣于旧行为）
   * 非 bg 角色 / 资源盒缺失 / 落点盒解析不到 ⇒ 放行。与 `isCoLocatedAnchor` 同一裁决：
   * icon/img 真值盒天然远小于宿主且不做 100% 拉伸，套用会全部误杀。
   *
   * @returns {{ok:boolean, ratio:number|null, resBox:Object|null, anchorBox:Object|null}}
   */
  const checkS7FallbackGeometry = (tag, cls, mapping) => {
    const entry = mapping || {};
    if (entry.previewAnalysisRole !== 'bg') return { ok: true, ratio: null, resBox: null, anchorBox: null };
    const resBox = entry.parentBox || entry.figmaBox || null;
    const rw = Number(resBox && resBox.width);
    const rh = Number(resBox && resBox.height);
    if (!(rw > 0) || !(rh > 0)) return { ok: true, ratio: null, resBox: null, anchorBox: null };
    const anchorBox = resolveProductTagBox(tag, cls, figmaIndex);
    if (!anchorBox) return { ok: true, ratio: null, resBox, anchorBox: null };
    const ratio = Math.min(rw / anchorBox.width, rh / anchorBox.height);
    return {
      ok: ratio >= ANCHOR_PROMOTION_MIN_AXIS_RATIO,
      ratio: Number(ratio.toFixed(4)),
      resBox,
      anchorBox,
    };
  };

  const lessGlobalVars = extractLessGlobalVars(allFiles);
  const writeGuarded = (targetFile, updated, original) => {
    if (updated === original) return false;
    const check = validateVueSfc(updated, targetFile, { lessGlobalVars });
    if (check.valid) {
      allFiles[targetFile] = updated;
      return true;
    }
    options.logger?.warn?.('🛡️ 注入器自检失败，已回滚（拒绝把合格产物改坏）', {
      file: targetFile,
      errors: (check.errors || []).slice(0, 2),
    });
    return false;
  };

  const doneKeys = new Set();
  for (const [resourceFile, g] of plan.byFile) {
    const varName = g.varName;
    for (const mount of g.mounts) {
      const compFile = mount.owner
        ? `package/components/${mount.owner}.vue`
        : 'package/index.vue';
      const key = `${compFile}|${mount.mountTarget}|${varName}|${g.kind}`;
      if (doneKeys.has(key)) continue;

      let content = allFiles[compFile];
      let targetFile = compFile;
      // 🛡️ 2026-09-15（激活图 owner-file-missing 实锤）：owner 组件文件可能不存在
      //   （owner 由 section 名推导，但该 section 被 dedupe/合并后没有独立 .vue）。
      //   此时回落到 index.vue（根组件内联），激活图/背景不因组件文件缺失而漏挂。
      // 🛡️ R1（2026-09-20 · 评审修订）：owner 文件缺失说明宿主 section 的 DOM 整体不存在，
      //   回落 index.vue 后若 mountTarget 仍找不到，**不得**再按名字相似度跨 section 兜底
      //   （bg-7890 因此错挂 tabs-icon 区）。记 ownerFileMissing 供 S7 分支判定 fail-closed。
      let ownerFileMissing = false;
      // 🛡️ 禁止 container 状态背景回落到 index.vue（2026-09-21 · c-device-monitor 实锤）：
      //   bgRole=container + mountTarget=active/default 的背景必须挂到独立状态子组件，
      //   子组件不存在时回落到 index.vue 会导致「背景提升」错误（父组件 import 子组件资源）。
      const isContainerStateBgMount =
        g.kind === 'bg' &&
        mount.bgRole === 'container' &&
        (mount.mountTarget === 'active' || mount.mountTarget === 'default');
      if (typeof content !== 'string' && compFile !== 'package/index.vue') {
        // 🛡️ 事实优先级表 §六 #4（2026-09-28）：owner 文件缺失时，先按「名称同族」对齐**实际**
        //   子组件文件 —— 计划 owner 名由 `assignSectionComponentNames` 推导，可能与产物真实
        //   分解**不同源**（实测 env：owner `TabsList`/`TabsIcon`，实际只有一个 `TabsSection.vue`）
        //   → 直接回落 index.vue 会错挂父容器。同族要求：公共前缀 ≥4 且 ≥ want 一半（防乱配）。
        const want = String(mount.owner || '');
        if (want) {
          let best = null;
          let bestN = 0;
          for (const p of Object.keys(allFiles)) {
            if (!/^package\/components\/[^/]+\.vue$/.test(p)) continue;
            if (typeof allFiles[p] !== 'string') continue;
            const base = p.replace(/^package\/components\//, '').replace(/\.vue$/, '');
            let i = 0;
            while (i < base.length && i < want.length && base[i] === want[i]) i++;
            if (i > bestN) {
              bestN = i;
              best = p;
            }
          }
          if (best && bestN >= 4 && bestN >= Math.ceil(want.length / 2)) {
            content = allFiles[best];
            targetFile = best;
            options.logger?.info?.(
              `🎯 [资源挂载] owner ${want} 文件缺失 → 按名称同族对齐实际组件 ${best}（§六 #4）`,
              { var: varName },
            );
          }
        }
      }
      if (typeof content !== 'string' && compFile !== 'package/index.vue' && !ownerFileMissing) {
        if (isContainerStateBgMount) {
          // container 状态背景：不回落到 index.vue，直接标记 owner 文件缺失
          ownerFileMissing = true;
        } else {
          const fallback = allFiles['package/index.vue'];
          if (typeof fallback === 'string') {
            content = fallback;
            targetFile = 'package/index.vue';
            ownerFileMissing = true;
          }
        }
      }
      if (typeof content !== 'string') {
        diagnostics.push({ reason: 'owner-file-missing', file: compFile, var: varName });
        continue;
      }
      // 幂等：变量已被 LLM 引用（或上轮已挂）
      //   - bg：跳过，避免重复 :style
      //   - icon/img：不另插 img，但缺 px 尺寸时按 figmaBox 装配（89c245a1 巨大菱形根因）
      // 🛡️ P-06 例外（2026-09-17 · 43c19171 实锤）：container 状态背景（bgRole=container +
      //   target=active/default）的 var 可能被 LLM 挂在「内层 div」而非组件根。此时文件里已含该
      //   var，但挂载位置错误——若此处幂等早退，分支永远拿不到执行机会，背景要么消失要么错位。
      //   故对 container 状态背景不做早退，直接落到下方分支：根已有→只清洗；根没有→注入根。
      const isContainerStateBg =
        g.kind === 'bg' &&
        mount.bgRole === 'container' &&
        (mount.mountTarget === 'active' || mount.mountTarget === 'default');
      // 🛡️ #2（2026-09-22 · c-device-monitor-9120a940 实锤）：共享背景（sharedBy>1，如 cons 的
      //   12 卡 bg3）若 LLM 把变量预挂到面板根，原幂等早退会跳过下方 v-for 逐卡挂载逻辑
      //   （sharedCount>1 分支），导致 bg 拉伸铺满容器、逐卡背景缺失。共享背景必须落到 v-for
      //   item，故**挂错位置时**不早退，留给下方分支做「根→item」迁徙。
      //
      // 🛡️ 收口（2026-09-26 · resource-mount-plan.spec.ts「共享底图 3 个 mount 同 target」实锤）：
      //   原实现是「只要是共享背景就一律不早退」→ 同一张图同 target 的多条 mount（计划①已把它们
      //   固化成**同一个 varName**）会依次重复挂载（实测 mounted 变 2 条，且第二次仍写同一 :style）。
      //   正确判据只看**当前位置对不对**：
      //     · 该变量已挂在 v-for item 上 → 已是目标形态 → 照旧幂等早退（不重复挂）；
      //     · 该变量存在但**不在** v-for item 上（挂在根/内层）→ 不早退，去迁徙；
      //     · 文件里没有 v-for item 可迁 → 不去动（保守，避免把根背景剥掉后无处可挂）。
      const isSharedBg =
        g.kind === 'bg' &&
        Array.isArray(g.sharedBy) &&
        g.sharedBy.length > 1;
      let sharedNeedsMigration = false;
      if (isSharedBg && new RegExp(`\\b${varName}\\b`).test(content)) {
        const itemTagForShared = findVForItemTag(content);
        sharedNeedsMigration =
          !!itemTagForShared && !new RegExp(`\\b${varName}\\b`).test(itemTagForShared);
      }
      if (
        new RegExp(`\\b${varName}\\b`).test(content) &&
        !isContainerStateBg &&
        !sharedNeedsMigration &&
        // 🛡️ 2026-09-29（用户实锤「bg 挂到非父级 + 几乎同一背景」）：
        //   bg 且有 sectionAnchorId（事实链锚点）时不早退 —— 让下方「数据事实链优先」分支
        //   按 `data-section-id` 精确挂载/迁徙。旧逻辑：var 已被 LLM 在别处（错误位置）引用
        //   ⇒ 幂等早退 ⇒ 逐卡的正确锚点挂载被全部跳过 ⇒ 一张背景被复用/错挂。
        // 🛡️ 2026-09-29 修正（同一判据的语义矛盾）：原写作 `!mount.sectionAnchorId`，而
        //   `!null === true` ⇒ 判据退化为「**bg 一律不早退**」⇒ 已引用的 bg 被重复注入
        //   （同一 `:style` 里 backgroundImage 键写两次，违反单一赋值）+ 破坏幂等
        //   （resource-mount-plan.spec 两条幂等用例因此变红）。显式布尔化，恢复原意：
        //   **仅当确实拿到了锚点**（非 null）才去走下方数据事实链迁徙。
        !(g.kind === 'bg' && mount.sectionAnchorId != null)
      ) {
        if (g.kind === 'icon' || g.kind === 'img') {
          const size = iconSizeFromFigmaBox(mount.figmaBox);
          if (size) {
            const sized = ensureReferencedIconSize(content, varName, size);
            if (sized.patched && writeGuarded(targetFile, sized.content, content)) {
              doneKeys.add(key);
              mounted.push({
                var: varName,
                file: targetFile,
                keyword: mount.mountTarget,
                role: g.kind,
                mountTarget: mount.mountTarget,
                reason: 'referenced-icon-size',
              });
              continue;
            }
          }
        }
        doneKeys.add(key);
        continue;
      }

      const mapping = {
        assignedVarName: varName,
        resourceFile,
        mountTarget: mount.mountTarget,
        bgRole: mount.bgRole,
        previewAnalysisRole: g.kind,
        figmaBox: mount.figmaBox || null,
        parentBox: mount.parentBox || null,
      };
      let result = null;

      // 🛡️ 刀33 第3步（per-item 资源不落本文件 · 2026-10-29 · mc-max-1793281736684-802b780c 实锤）：
      //   折叠段接管把列表渲染搬进独立子组件（ListSection.vue）后，本文件（index.vue）没有
      //   任何 v-for item ⇒ 下方两条分支都会误挂到「整块只画一次」的位置：
      //     · §六#4 事实链锚点 `data-section-id=<重复单元>`（实测 48:5798）命中的是**重复单元**
      //       本身（不是列表容器）⇒ 挂 list-con；
      //     · `bgRole=sub-state` 的 `mountSubStateBackground` 失败后静态回退按关键词再挂到
      //       更外层容器（实测 slot-con）⇒ 二次误挂。
      //   实测（同任务内相隔 32ms）：
      //     🎯 [资源挂载] bg1 经事实链 data-section-id=48:5798 精确挂载 {"file":"package/index.vue"}
      //     🛡️ 独立状态组件无 :class active 绑定，已静态挂背景 {"varName":"bg1","mountTarget":"slot-con"}
      //   ⇒ bg1 同时挂 list-con + slot-con，而 v-for item 处 0 次。
      //
      //   🔴 判据修正（2026-10-29 真机取证 · mc-1793286461778-8ad1ccc1）：初版前置条件
      //   `g.sharedBy.length > 1`（同 resourceFile 被 N 个 figma 节点共享）在真机**恒为假**：
      //   折叠 dedup 后 `.mc-gen/resource-dom-mapping.json` 里 `image_313-5800.png`(bg1)
      //   **只有 1 条**（figmaNodeId 48:5800）；真机里条数 >1 的只有 `icon-5823.png`(×5)，
      //   而其 `previewAnalysisRole === 'icon'` ⇒ `bg ∧ sharedBy>1` 是**空集合** ⇒ 初版判据
      //   是死代码（bg1 照旧被事实链挂进 index.vue，产物 `:style` 仍挂）。
      //   ⇒ 改用**存在性事实**（零猜测、零阈值）：本文件无 v-for item，而产物中**确实存在**
      //   另一个文件同时 ① 引用本资源变量、② 含 v-for item ⇒ 该资源的 per-item 宿主已就绪，
      //   本文件让位（fail-closed：不挂、不猜容器）。外部宿主不存在/未引用本 var 时不拦
      //   ⇒ 行为不劣于旧实现（见 findExternalVForItemHost 的收紧陷阱留痕）。
      // 🛡️ 刀33 第3步补（2026-10-30）：统一走 findPerItemYieldHost（单一判据），
      //   本处守「计划 owner 文件」路径；事实链落点路径见下方 :580 处的同款守卫。
      if (g.kind === 'bg') {
        const host = findPerItemYieldHost(allFiles, varName, targetFile, content);
        if (host) {
          diagnostics.push({
            reason: 'per-item-host-external',
            file: targetFile,
            var: varName,
            host: host.file,
          });
          options.logger?.info?.(
            `🎯 [资源挂载] ${varName} 为 per-item 资源（外部宿主 ${host.file} 的 v-for item 已引用），本文件 ${targetFile} 无 v-for item ⇒ 不挂本文件（避免整块只画一次错位）`,
            { file: targetFile },
          );
          doneKeys.add(key);
          continue;
        }
      }

      // 🛡️ 刀A 守卫（2026-11-05 · c-env-monitor-c324a730）：锚点上提被「几何共位」判据拒绝 ⇒
      //   **必须 fail-closed 终止本条目**，不能继续走下游分支。原因：下方「容器状态根」
      //   （:689）、「名字/关键字匹配」（pickBestMountTarget）等分支在锚点缺失时会**再猜一次**，
      //   很容易又猜回段根/整槽容器 ⇒ 「拒绝上提」等于没拦（这是历史「背景铺满整块」的复现路径）。
      //   实测本单 bg1 被下游挂到 `.c-env-monitor-main`（= 段根 89:41），正是该复现。
      if (g.kind === 'bg' && mount.anchorPromotionRejected) {
        diagnostics.push({
          reason: 'anchor-promotion-rejected',
          file: targetFile,
          var: varName,
          ownerSectionId: (mount.ancestorIds && mount.ancestorIds[0]) || null,
          rejectedAnchor: mount.anchorPromotionRejectedAnchor || null,
        });
        options.logger?.warn?.(
          `🛡️ [资源挂载] ${varName} 的最近 section 锚点不在产物中，唯一可上提的祖先（${mount.anchorPromotionRejectedAnchor || '?'}）与背景真值不同层（跨层挂载会拉伸错位）⇒ 放弃挂载（fail-closed）`,
          { file: targetFile },
        );
        doneKeys.add(key);
        continue;
      }

      // 🛡️ 事实优先级表 §六 #4（2026-09-28）：**数据事实链优先** —— 资源节点最近祖先里那个
      //   「确实是 section」的 id（`mount.sectionAnchorId`）→ 在**实际产物**里找
      //   `data-section-id="<anchor>"` 的元素 → 命中即精确挂载（零名字猜测）。
      //   这优先于「owner 名推导 + 关键字匹配」——后者在中文语义名 vs 英文类名、命名漂移时
      //   必然失配（`bg1/bg3/bg4` 因此丢或错挂）。
      if (g.kind === 'bg' && mount.sectionAnchorId) {
        const anchor = String(mount.sectionAnchorId);
        for (const [fp, fc] of Object.entries(allFiles)) {
          // 🛡️ α3：预过滤必须同时认 `data-resource-anchor`（补标锚），否则补标文件
          //   在 findTagBySectionAnchor 之前就被 continue 掉（端到端实测缺口）。
          if (
            typeof fc !== 'string' ||
            (!fc.includes(`data-section-id="${anchor}"`) &&
              !fc.includes(`data-resource-anchor="${anchor}"`))
          ) {
            continue;
          }
          const tag = findTagBySectionAnchor(fc, anchor);
          if (!tag) continue;
          // 🛡️ ② 归属判据（2026-09-29 治本 · mc-max-1790688321049-447d01cc 实锤）：
          //   原判据 `/\bbackgroundImage\b/.test(tag)` 与 varName **无关** ⇒ 任何外来背景
          //   都会把本资源判成「已挂过 ⇒ 幂等」而**永久挡住**正确资源的挂载
          //   （实测：`2:3475` 标题背景的宿主 `2:3474` 缺失后退化到卡片根，把卡片自身
          //   背景 `88:36`(bg4) 挤掉）。现按「这张背景图是不是本资源的」判：
          const own = bgBindingOwnership(tag, varName);
          if (own === 'self') {
            doneKeys.add(key);
            result = null;
            break; // 已绑定本资源 → 幂等
          }
          if (own !== 'none') {
            // 🛡️ 刀①·闸门1（2026-11-05 · c-env-monitor-560fe07a 实锤）：占用分支按 bgRole 分流。
            //   锚点被**外来**背景占用（bg1 container 295×27 先经事实链占坑 tabs-list）时，
            //   sub-state 资源（bg2 激活胶囊 78×21）的合法宿主不是锚点元素本身，而是锚点文件内
            //   v-for 的 active item（mountSubStateBackground 条件绑定）⇒ 分流而非一律 fail-closed
            //   （旧行为：bg2 被 occupied-by-other-resource 拦死，激活胶囊整批丢失，c324a730 同指纹）。
            //   非 sub-state（container 等）保持旧行为：occupied fail-closed 不覆写。
            //   ⚠️ 收窄纪律（2026-11-05 实测纠正）：闸门**只在占用时**分流——锚点空闲（own==='none'）
            //   的 sub-state 照旧走让位→静态事实链（刀33 反向①②③ 已固化的「不劣化」行为）。
            //   首版把闸门独立成块插在让位/归属之后、无条件截走一切 sub-state ⇒ 刀33 让位组
            //   5 例 + 反向①②③ 回归（它们正是「锚点空闲的 sub-state 静态挂载」形态）。
            if (mount.bgRole === 'sub-state') {
              // ⚠️ 让位优先纪律：分流前先过让位判据（与下方 :860 事实链落点同款判据）——
              //   LLM 已把 var 写进外部 per-item 宿主的场景（f461f30f 形态）优先让位。
              const gateYieldHost = findPerItemYieldHost(allFiles, varName, fp, fc);
              if (gateYieldHost) {
                diagnostics.push({
                  reason: 'per-item-host-external',
                  file: fp,
                  var: varName,
                  host: gateYieldHost.file,
                });
                options.logger?.info?.(
                  `🎯 [资源挂载] ${varName} 为 per-item 资源（外部宿主 ${gateYieldHost.file} 的 v-for item 已引用），闸门1 分流前让位（避免整块只画一次错位）`,
                  { file: fp },
                );
                doneKeys.add(key);
                result = null;
                break;
              }
              const scoped = { [fp]: fc };
              const rSub = mountSubStateBackground(scoped, varName, mapping, options);
              if (rSub && writeGuarded(fp, scoped[fp], fc)) {
                result = { ...rSub, file: fp, reason: 'section-anchor-sub-state' };
                mounted.push(result);
                doneKeys.add(key);
                options.logger?.info?.(
                  `🎯 [资源挂载] ${varName}（sub-state）锚点 ${anchor} 已被外来背景占用，闸门1 分流条件绑定到 active v-for item`,
                  { file: fp },
                );
                break;
              }
              diagnostics.push({
                reason: 'sub-state-active-binding-missing',
                file: fp,
                var: varName,
                anchor,
              });
              options.logger?.warn?.(
                `🛡️ [资源挂载] ${varName}（sub-state）锚点宿主 ${fp} 无 active 条件绑定，放弃挂载（fail-closed，宁缺不错）`,
                { file: fp },
              );
              doneKeys.add(key);
              result = null;
              break;
            }
            // fail-closed：锚点元素已被**外来**背景占用 → 不覆写、不落其他分支
            diagnostics.push({
              reason: 'bg-anchor-occupied-by-other-resource',
              file: fp,
              var: varName,
              anchor,
              occupiedBy: own,
            });
            options.logger?.warn?.(
              `🛡️ [资源挂载] ${varName} 的锚点元素 data-section-id=${anchor} 已被外来背景占用（${own}），放弃挂载（fail-closed）`,
              { file: fp },
            );
            doneKeys.add(key);
            result = null;
            break;
          }
          // 🛡️ 刀33 第3步补（2026-10-30 · mc-1793287232957-71c64e28 实锤）：
          //   事实链落点 `fp` 可能 ≠ 计划 owner 文件（全库扫描 ⇒ 落点由锚点位置决定）。
          //   真机：owner=ListSection（含 v-for ⇒ 早退守卫短路），但事实链落点=index.vue
          //   （无 v-for）⇒ 必须在**实际落点**上重新执行 per-item 让位判据。
          const yieldHost = findPerItemYieldHost(allFiles, varName, fp, fc);
          if (yieldHost) {
            diagnostics.push({
              reason: 'per-item-host-external',
              file: fp,
              var: varName,
              host: yieldHost.file,
            });
            options.logger?.info?.(
              `🎯 [资源挂载] ${varName} 为 per-item 资源（外部宿主 ${yieldHost.file} 的 v-for item 已引用），事实链落点 ${fp} 无 v-for item ⇒ 不挂本文件（避免整块只画一次错位）`,
              { file: fp },
            );
            doneKeys.add(key);
            result = null;
            break;
          }
          // （刀①·闸门1 已上移至归属判据的占用分支内——锚点空闲的 sub-state 在此照旧
          //   走让位 → 静态事实链注入，刀33 反向①②③「不劣化」行为保持不变。）
          const injected = injectBgStyleBinding(fc, tag, varName, mapping, diagnostics);
          if (!injected) continue;
          const withImport = ensureResourceImportInVue(injected, varName, mapping, fp);
          if (withImport && writeGuarded(fp, withImport, fc)) {
            result = {
              var: varName,
              file: fp,
              keyword: `data-section-id=${anchor}`,
              bgRole: mount.bgRole || null,
              mountTarget: mount.mountTarget || null,
              reason: 'section-anchor-fact-chain',
            };
            mounted.push(result);
            doneKeys.add(key);
            options.logger?.info?.(
              `🎯 [资源挂载] ${varName} 经事实链 data-section-id=${anchor} 精确挂载（免关键字猜测）`,
              { file: fp },
            );
            break;
          }
        }
        if (result || doneKeys.has(key)) continue;
      }

      // 🛡️ P-06 核心一刀（2026-09-17 · 1c98bab9 实锤）：container 状态背景
      //   （bgRole=container + target=active/default）对应「独立状态子组件」（ContentActive/ContentDefault）。
      //   背景必须挂到该子组件**模板根**，再清洗该 var 在异文件 + 同文件非根标签的串用/误挂引用。
      //   单一事实源 = resourceDomMapping 的 mountTarget/owner，不再用 class 关键词猜——
      //   findTagByClassKeyword('active') 猜中内层 .active-bg 正是「双背景 / 背景错位」根因。
      // 🛡️ 禁止回落到 index.vue（2026-09-21 · c-device-monitor 实锤「bg1/bg2 挂错层级」）：
      //   子组件不存在时，挂到父组件 index.vue 会导致「状态背景提升」——父组件错误 import 资源、
      //   绑定 CSS 变量，而子组件反而没有背景。正确行为：fail-closed，记诊断 + 放弃挂载。
      if (
        g.kind === 'bg' &&
        mount.bgRole === 'container' &&
        (mount.mountTarget === 'active' || mount.mountTarget === 'default')
      ) {
        const cap = (s) =>
          String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
        const ownerComp =
          mount.owner || `Content${cap(mount.mountTarget)}`;
        const ownerFile = `package/components/${ownerComp}.vue`;
        let tgt = allFiles[ownerFile];
        let tgtFile = ownerFile;
        // 🛡️ 禁止回落到 index.vue（2026-09-21）：container 状态背景必须挂到独立状态子组件，
        //   子组件不存在时放弃挂载，避免错误提升到父组件
        if (typeof tgt !== 'string') {
          diagnostics.push({
            reason: 'container-state-file-missing',
            file: ownerFile,
            var: varName,
            message: `状态子组件 ${ownerComp}.vue 不存在，禁止回落到 index.vue（避免背景提升错误）`,
          });
          doneKeys.add(key);
          continue;
        }
        if (typeof tgt === 'string') {
          const rootTag = findTemplateRootTag(tgt);
          if (rootTag) {
            // 🛡️ 关键修正（2026-09-17 · a772a7a6 实锤）：上一版用「文件内是否含 var」判 already-at-root
            // 是错的——LLM 把 bg 挂在内层 div（如 .active-bg）时文件已含该 var，但根并未挂载，
            // 误判后只清洗不挂根 → 背景整体消失/错位（default 背景没出现 / active 错位）。
            // 正确判据：根标签本身是否含该 var。根没有 → 必须注入根；根已有 → 才是 already-at-root。
            const rootHasVar = new RegExp(`\\b${varName}\\b`).test(rootTag);
            if (!rootHasVar) {
              let upd = injectBgStyleBinding(tgt, rootTag, varName, mapping, diagnostics);
              if (upd)
                upd = ensureResourceImportInVue(upd, varName, mapping, tgtFile);
              if (upd && writeGuarded(tgtFile, upd, tgt)) {
                result = {
                  var: varName,
                  file: tgtFile,
                  keyword: mount.mountTarget,
                  bgRole: 'container',
                  mountTarget: mount.mountTarget,
                  reason: 'container-state-root',
                };
              }
            } else {
              result = {
                var: varName,
                file: tgtFile,
                keyword: mount.mountTarget,
                bgRole: 'container',
                mountTarget: mount.mountTarget,
                reason: 'already-at-root',
              };
            }
            // 🛡️ P-08 根布局确定化（2026-09-17 · 36c3a630 实锤 ContentDefault 根无 display）：
            //   状态子组件根的内部布局靠 LLM 自由发挥——ContentActive 写了 display:flex、
            //   ContentDefault 漏写 → block 竖排 + 内容溢出容器。治本：按 Figma 卡片
            //   （bg 节点的父节点）直接子节点 bbox 几何分类：x 区间两两不相交 → row、
            //   y 区间两两不相交 → column；根 class 规则无 display 声明时注入
            //   display:flex;flex-direction:<方向>;align-items:center。
            //   事实源 = figmaRoot 索引（不是 LLM 输出）。
            if (result) {
              const laidOut = ensureStateRootFlexLayout(
                allFiles[tgtFile],
                options.figmaIndex,
                mount.figmaNodeId,
              );
              if (laidOut && writeGuarded(tgtFile, laidOut, allFiles[tgtFile])) {
                allFiles[tgtFile] = laidOut;
              }
            }
            // 清洗：该 var 在异文件 + 同文件非根标签的串用/误挂引用
            if (result) {
              const cleaned = removeContainerBgOffTargetRefs(allFiles, varName, tgtFile, rootTag, {
                logger: options.logger,
                lessGlobalVars,
              });
              for (const [k, v] of Object.entries(cleaned)) allFiles[k] = v;
            }
          }
        }
        // fail-closed：未命中只记诊断，不猜不挂（与设计原则一致）
        if (!result)
          diagnostics.push({
            reason: 'container-state-root-miss',
            file: ownerFile,
            var: varName,
          });
        else mounted.push(result);
        doneKeys.add(key);
        continue;
      }

      // 🛡️ 2026-09-15（P0 修复）：mountTarget 为 'active' 或 'default' 的资源走 mountSubStateBackground 路径
      //   即使 bgRole 是 'container'（几何判断背景图填满父容器），也需要根据状态条件动态切换背景图
      if (g.kind === 'bg' && (mount.bgRole === 'sub-state' || mount.mountTarget === 'active' || mount.mountTarget === 'default')) {
        // 限定 owner 文件作用域调用既有确定性原语（active/default 条件绑定）
        const scoped = { [targetFile]: content };
        const r = mountSubStateBackground(scoped, varName, mapping, options);
        if (r && writeGuarded(targetFile, scoped[targetFile], content)) {
          result = { ...r, file: targetFile };
        } else {
          // 🛡️ P2（2026-09-17 · e4709ad0 实锤）：active/default 被拆成独立子组件
          //   （ContentActive / ContentDefault）时模板没有 :class="{ active: ... }" 条件绑定，
          //   mountSubStateBackground 必然失败 → bg1 静默丢失。
          //   回退：静态挂到 owner 文件根/关键词命中节点（独立组件本身就是该状态）。
          let tag = mount.mountTarget ? findTagByClassKeyword(content, String(mount.mountTarget).toLowerCase()) : null;
          if (!tag) {
            const candidates = collectMountCandidates({ [targetFile]: content }, { varName });
            const best = pickBestMountTarget(mapping, candidates, { skipBound: true });
            if (best) tag = best.tag;
          }
          if (tag) {
            let updated = injectBgStyleBinding(content, tag, varName, mapping, diagnostics);
            if (updated) {
              updated = ensureResourceImportInVue(updated, varName, mapping, targetFile);
              if (updated && writeGuarded(targetFile, updated, content)) {
                result = {
                  var: varName,
                  file: targetFile,
                  keyword: mount.mountTarget || 'standalone-state',
                  bgRole: mount.bgRole || null,
                  mountTarget: mount.mountTarget || null,
                  reason: 'standalone-state-static-fallback',
                };
                options.logger?.warn?.('🛡️ 独立状态组件无 :class active 绑定，已静态挂背景', {
                  varName,
                  mountTarget: mount.mountTarget || '(null)',
                  file: targetFile,
                });
              }
            }
          }
        }
      } else if (g.kind === 'bg') {
        // 🛡️ #1（2026-09-20 · 9caed484 bg 挂错 tabs-wrapper 治本）：owner 文件缺失 = 宿主
        //   section 的 DOM 整体不存在（LLM 命名漂移 TabsList→TabsSection，或 section 被合并）。
        //   bg 语义是「直接父元素背景」，父 DOM 都不存在时，挂到回落后的 index.vue 任何位置
        //   都是错位（bg-7890 因此挂到 tabs-wrapper）。此处**在 findTagByClassKeyword 之前**
        //   fail-closed：直接丢弃 + 告警，绝不进入下方关键词匹配 / S7 名字相似兜底。
        //   —— 这是对 R1（S7 三级）的补强：R1 只在「类名未命中」后才生效，而命中了错误类名
        //   （父容器 wrapper）也会错挂，故 owner 缺失应更早短路。
        //   ⚠️ 例外：container 状态背景（bgRole=container + active/default）有独立子组件
        //   （ContentActive/ContentDefault），其 owner 文件名本就可能不同，不适用此短路。
        if (ownerFileMissing && !isContainerStateBg) {
          options.logger?.warn?.('🛡️ #1：owner 文件缺失（宿主 section DOM 不存在），bg 放弃挂载（fail-closed）', {
            varName,
            mountTarget: mount.mountTarget || '(null)',
            owner: mount.owner || '(index)',
          });
          diagnostics.push({
            reason: 'owner-file-missing-bg',
            file: compFile,
            var: varName,
            mountTarget: mount.mountTarget,
          });
          continue;
        }
        // 🛡️ 阶段3（2026-09-17）：共享背景（sharedBy>1，如 12 卡共享 bg3）应挂到 v-for item
        //   （每个卡片），而非外层容器。此前 mountTarget 关键词匹配到容器 class，bg 被
        //   background-size:100% 拉伸铺满整个容器，视觉错误（逐卡 117×64 单元背景变成整块大背景）。
        const sharedCount = Array.isArray(g.sharedBy) ? g.sharedBy.length : 0;
        if (sharedCount > 1) {
          const itemTag = findVForItemTag(content);
          if (itemTag) {
            let itemUpdated = injectBgStyleBinding(content, itemTag, varName, mapping, diagnostics);
            if (itemUpdated) {
              // 🛡️ #2（2026-09-22）：共享背景正确落点是 v-for item，必须从面板根移除误挂的 bg
              //   （LLM 常把 bg 挂在容器根 → 100% 拉伸铺满），否则逐卡背景仍被根背景覆盖。
              const rootTag = findTemplateRootTag(itemUpdated);
              if (rootTag && new RegExp(`\\b${varName}\\b`).test(rootTag)) {
                const strippedRoot = stripBgKeysFromTag(rootTag, varName);
                if (strippedRoot && strippedRoot !== rootTag) {
                  itemUpdated = itemUpdated.replace(rootTag, strippedRoot);
                }
              }
              const withImport = ensureResourceImportInVue(itemUpdated, varName, mapping, targetFile);
              if (withImport && writeGuarded(targetFile, withImport, content)) {
                result = {
                  var: varName,
                  file: targetFile,
                  keyword: 'v-for-item',
                  bgRole: mount.bgRole || null,
                  mountTarget: 'v-for-item',
                };
                options.logger?.info?.(`🎯 [资源挂载] ${varName} 共享背景（${sharedCount} 卡）挂到 v-for item（已从面板根迁徙）`, {
                  file: targetFile,
                });
                // 🛡️ 刀33 第3步配套修正（2026-10-29 · 全量回归实锤）：本分支此前只 `continue`，
                //   既不 push 也不 add(key) ⇒ ① 一次**真实发生**的挂载不计入 `mounted`
                //   （调用方进度条 "已按计划挂载 N 个资源" 少报，mc 产物核验也看不到这条）；
                //   ② 同 key 的后续 mount 不被 `doneKeys` 去重 ⇒ 被重复处理一次，
                //   重复那次的 fallback 正是「同一资源被二次注入/误挂根容器」的来源
                //   （实测 `resource-mount-plan.spec.ts`「共享底图 3 个 mount 同 target」里，
                //    mount#1 正确挂到 v-for item 但未记账，重复 mount#2 未命中目标，
                //    mount#3（owner=null→index.vue）反而把同一背景挂进根组件）。
                //   ⇒ 与 §六#4 事实链分支（:589-590）对齐：成功即记账 + 去重。
                doneKeys.add(key);
                mounted.push(result);
                continue;
              }
            }
          }
        }
        // 🛡️ P1（2026-09-15）：mountTarget 为 null 的 bg 资源兜底挂载
        //   旧逻辑：mountTarget 为 null → findTagByClassKeyword(content, null) → 返回 null → 不挂载
        //   新逻辑：mountTarget 为 null → 用 pickBestMountTarget 从候选池找最优挂载点
        let tag = null;
        if (mount.mountTarget) {
          tag = findTagByClassKeyword(content, mount.mountTarget);
        }
        // 🛡️ S7（2026-09-16 · c-env-monitor-5ed7a5f8 实锤）：mountTarget 精确不在模板（类名漂移，
        //   如 mountTarget="tabs-list" 但模板类名是 "tab"）→ 原逻辑 tag 保持 null → 静默不挂载 →
        //   背景缺失。此处回退 pickBestMountTarget 兜底（候选池评分）并 WARN，避免静默丢背景。
        // 🛡️ R1（2026-09-20 · 评审修订）：仅当 owner 文件**存在**（类名漂移）时保留名字相似兜底；
        //   owner 文件缺失（宿主 section DOM 整体不存在）→ fail-closed 丢弃 + 告警，禁止跨 section 错挂。
        if (!tag) {
          if (ownerFileMissing) {
            options.logger?.warn?.('🛡️ R1：owner 文件缺失（宿主 DOM 不存在），放弃 bg 兜底挂载', {
              varName,
              mountTarget: mount.mountTarget || '(null)',
              owner: mount.owner || '(index)',
            });
          } else {
            // 🛡️ R1'（2026-09-30 · mc-max-1790698932396-a6d2e5e1 实锤）：锚点复验优先于猜测。
            //   §六 #4 事实链精确挂载跑于装配早期，index.vue 的锚点元素可能尚未生成而
            //   静默 continue；走到本兜底时 content 已是装配后的文件 ⇒ 先按
            //   sectionAnchorId 复验一次，命中即精确挂载（零猜测）。否则 pickBestMountTarget
            //   会按 mountTarget 名评分猜宿主——bg1（owner=2:3660 横幅）被猜到根 slot-con，
            //   横幅背景整块丢失 + 一张 425×91 小图被拉伸成整页背景。
            //   复验 miss（锚点真不存在）→ 行为不劣于旧实现，继续走原兜底。
            if (mount.sectionAnchorId) {
              const anchorTag = findTagBySectionAnchor(content, String(mount.sectionAnchorId));
              if (anchorTag) {
                const ownAnchor = bgBindingOwnership(anchorTag, varName);
                if (ownAnchor === 'none') {
                  tag = anchorTag;
                  options.logger?.info?.(
                    `🎯 [资源挂载] ${varName} 锚点复验命中 data-section-id=${mount.sectionAnchorId}（S7 兜底前精确挂载，免名猜）`,
                    { file: targetFile },
                  );
                }
              }
            }
            if (!tag) {
              // 兜底：从当前文件的候选池中找最优挂载点
              const candidates = collectMountCandidates({ [targetFile]: content }, { varName });
              const best = pickBestMountTarget(mapping, candidates, {
                skipBound: true, // 优先选没有 bg 绑定的标签
              });
              if (best) {
                // 🛡️ S7 几何相容门（2026-11-12 · 61ca9e0b 实锤）：评分回退只看名字相似度、
                //   不看尺寸 ⇒ 52×20 的 tab 状态背景曾被挂到 396×292 段根 / 288×45 统计行 /
                //   385×192 图表区，再被 background-size:100% 100% 拉满 ⇒ 整块面板视觉报废。
                //   与 `isCoLocatedAnchor` 同一判据（覆盖率 ≥ 0.5），缺事实 fail-open。
                const geo = checkS7FallbackGeometry(best.tag, best.cls, mapping);
                if (!geo.ok) {
                  diagnostics.push({
                    reason: 's7-fallback-cross-layer-rejected',
                    file: targetFile,
                    var: varName,
                    mountTarget: mount.mountTarget || null,
                    fallbackCls: best.cls || '',
                    ratio: geo.ratio,
                    resBox: geo.resBox,
                    anchorBox: geo.anchorBox,
                  });
                  options.logger?.warn?.(
                    '🛡️ S7 回退被拒（落点与背景真值不同层，挂载会被拉伸铺满）⇒ 放弃挂载（fail-closed）',
                    {
                      varName,
                      mountTarget: mount.mountTarget || '(null)',
                      fallbackCls: best.cls || '',
                      ratio: geo.ratio,
                      resBox: geo.resBox ? `${Math.round(geo.resBox.width)}×${Math.round(geo.resBox.height)}` : null,
                      anchorBox: geo.anchorBox
                        ? `${Math.round(geo.anchorBox.width)}×${Math.round(geo.anchorBox.height)}`
                        : null,
                      file: targetFile,
                    },
                  );
                } else {
                  tag = best.tag;
                  options.logger?.warn?.('🛡️ S7：资源 mountTarget 不在模板类名，已回退最优挂载点', {
                    varName,
                    mountTarget: mount.mountTarget || '(null)',
                    ratio: geo.ratio,
                    file: targetFile,
                  });
                }
              }
            }
          }
        }
        if (tag) {
          let updated = injectBgStyleBinding(content, tag, varName, mapping, diagnostics);
          if (updated) {
            updated = ensureResourceImportInVue(updated, varName, mapping, targetFile);
            if (updated && writeGuarded(targetFile, updated, content)) {
              result = {
                var: varName,
                file: targetFile,
                keyword: mount.mountTarget || 'fallback-mount',
                bgRole: mount.bgRole || null,
                mountTarget: mount.mountTarget || null,
              };
            }
          }
        }
      } else {
        // icon / img：注入 img 子元素，尺寸按 figmaBox 真值、单边封顶 AUTO_MOUNT_ICON_MAX_PX
        // 🛡️ P1（2026-09-15）：mountTarget 为 null 的 icon/img 资源兜底挂载
        let tag = null;
        if (mount.mountTarget) {
          tag = findTagByClassKeyword(content, mount.mountTarget);
        }
        // 🛡️ S7（2026-09-16）：mountTarget 精确不在模板 → 回退兜底（同 bg 分支）。
        // 🛡️ R1（2026-09-20）：owner 文件缺失时 fail-closed 丢弃，禁止跨 section 错挂 icon。
        if (!tag) {
          if (ownerFileMissing) {
            options.logger?.warn?.('🛡️ R1：owner 文件缺失（宿主 DOM 不存在），放弃 icon/img 兜底挂载', {
              varName,
              mountTarget: mount.mountTarget || '(null)',
              owner: mount.owner || '(index)',
            });
          } else {
            // 兜底：从当前文件的候选池中找最优挂载点
            const candidates = collectMountCandidates({ [targetFile]: content }, { varName });
            const best = pickBestMountTarget(mapping, candidates, {
              skipBound: false,
            });
            if (best) {
              tag = best.tag;
              options.logger?.warn?.('🛡️ S7：icon/img mountTarget 不在模板类名，已回退最优挂载点', {
                varName,
                mountTarget: mount.mountTarget || '(null)',
                file: targetFile,
              });
            }
          }
        }
        if (tag) {
          const size = iconSizeFromFigmaBox(mount.figmaBox);
          let updated = injectImgChild(content, tag, varName, '', size);
          if (updated) {
            updated = ensureResourceImportInVue(updated, varName, mapping, targetFile);
            if (updated && writeGuarded(targetFile, updated, content)) {
              result = {
                var: varName,
                file: targetFile,
                keyword: mount.mountTarget,
                role: g.kind,
                mountTarget: mount.mountTarget,
              };
            }
          }
        }
      }

      if (result) {
        doneKeys.add(key);
        mounted.push(result);
      } else {
        diagnostics.push({
          reason:
            g.kind === 'bg' && mount.bgRole === 'sub-state'
              ? 'sub-state-target-not-found'
              : 'mount-target-not-found',
          file: targetFile,
          var: varName,
          mountTarget: mount.mountTarget,
        });
      }
    }
  }
  // 🛡️ 兄弟卡背景组（2026-11-11 · 408d924a 实锤）：主循环**之后**执行——主循环的
  //   owner/anchor 模型对折叠接管的兄弟卡背景必然 fail-closed（只有锚卡一张能解析），
  //   组内成员的错位 LLM 挂载（根拉伸/icon img）也在此统一剥除并轮换重挂。
  const grpRes = mountCardBgGroups(allFiles, plan, {
    logger: options.logger,
    lessGlobalVars,
  });
  mounted.push(...grpRes.mounted);
  diagnostics.push(...grpRes.diagnostics);
  return { mounted, diagnostics };
}

/**
 * 🛡️ P-06 核心一刀配套（2026-09-17）：container 状态背景「清洗」——删除目标 var 在
 * 异文件 + 同文件非根标签的串用/误挂引用。
 *
 * 背景：LLM 会把 bg 资源自由挂到内层 div（如 `.active-bg`）甚至跨状态子组件（bg2 出现在
 * ContentActive）。核心一刀把 var 挂到 owner 子组件模板根后，必须把这些多余引用清掉，
 * 否则残留引用造成「双背景 / 错位」。
 *
 * 判定（无硬编码，按 var + 根标签事实）：
 *   - owner 文件内：仅保留 `tag === rootTag` 的那一次引用；其余含该 var 的 :style 引用删除
 *   - 异文件：全部含该 var 的 :style 引用删除
 * 删除粒度：:style 仅含 background* 键 → 删整个 :style 属性；含其它键 → 仅删 background* 键
 *   （保留 icon/width 等业务样式，不误伤）。每文件改后用真实 SFC 编译器校验，失败则回滚该文件。
 *
 * @param {Object<string,string>} allFiles 产物文件表（原地更新，返回被修改的文件子集）
 * @param {string} varName 背景资源变量名（如 bg2）
 * @param {string} ownerFile owner 子组件文件路径（如 package/components/ContentDefault.vue）
 * @param {string} rootTag owner 文件模板根开标签字符串
 * @returns {Object<string,string>} 被修改的文件 map
 */
export function removeContainerBgOffTargetRefs(
  allFiles,
  varName,
  ownerFile,
  rootTag,
  options = {},
) {
  const logger = options.logger || null;
  const varRe = new RegExp(`\\b${varName}\\b`);
  const bgKeyRe = /\b(?:background(?:Image|Size|Position|Repeat)?)\s*:[^,}]+,?/g;
  const out = {};
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string' || !varRe.test(c)) continue;
    const tplMatch = c.match(/<template>([\s\S]*?)<\/template>/);
    if (!tplMatch) continue;
    let tpl = tplMatch[1];
    const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)>/g;
    let m;
    // 🛡️ 根标签判据必须基于「当前文件内容」重算：branch 注入后根标签已带 :style，
    // 若用注入前的 rootTag 快照做精确字符串比较会漏判根 → 把刚挂上的背景误删（a772a7a6 实锤）。
    const fileRootTag = p === ownerFile ? findTemplateRootTag(c) : null;
    const removals = [];
    while ((m = tagRe.exec(tpl)) !== null) {
      const tag = m[0];
      if (!varRe.test(tag) || !/:style\s*=/.test(tag)) continue;
      const isRoot = fileRootTag && tag === fileRootTag;
      if (isRoot) continue; // 根上的引用是正确挂载点，保留
      removals.push(tag);
    }
    if (removals.length === 0) continue;
    let changed = false;
    for (const tag of removals) {
      const styleMatch = tag.match(/:style="([^"]*)"/);
      if (!styleMatch) continue;
      const inner = styleMatch[1];
      const isObj = /^\{[\s\S]*\}$/.test(inner.trim());
      if (!isObj) continue;
      const stripped = inner.replace(bgKeyRe, '');
      const onlyBg = !/[a-zA-Z]+\s*:/.test(stripped.replace(/\s/g, ''));
      let newTag;
      if (onlyBg) {
        newTag = tag.replace(/\s*:style="[^"]*"/, ''); // 仅背景 → 删整个 :style
      } else {
        newTag = tag.replace(
          /:style="\{/,
          ':style="{',
        ).replace(bgKeyRe, '');
      }
      if (newTag === tag) continue;
      const pos = tpl.indexOf(tag);
      if (pos < 0) continue;
      tpl = tpl.slice(0, pos) + newTag + tpl.slice(pos + tag.length);
      changed = true;
    }
    if (changed) {
      let newCode = c.replace(tplMatch[0], `<template>${tpl}</template>`);
      // 🛡️ P-06b（2026-09-17 · 15f69c59 实锤 CODE-022 BLOCK）：清洗删除该 var 的
      //   全部错挂引用后，若文件内（模板+script）已无任何剩余引用，其 import 成为
      //   孤儿 → CODE-022「资源变量未挂载」硬闸 BLOCK 且重试耗尽（CODE-022 修复器
      //   在清洗之前已跑过，没人兜底）。此处同步删除孤儿 import（该 var 的正确挂载
      //   在 owner 文件，本文件本就不该持有）。
      const tplAfter = newCode.match(/<template>([\s\S]*?)<\/template>/);
      const restRefs =
        (tplAfter ? varRe.test(tplAfter[1]) : false) ||
        new RegExp(`\\b${varName}\\s*\\.`).test(newCode);
      const importRe = new RegExp(
        `^import\\s+${varName}\\s+from\\s+['"][^'"]+['"];?[ \\t]*\\n?`,
        'm',
      );
      if (!restRefs && importRe.test(newCode)) {
        newCode = newCode.replace(importRe, '');
      }
      const check = validateVueSfc(newCode, p, {
        lessGlobalVars: options.lessGlobalVars,
      });
      if (check.valid) {
        out[p] = newCode;
        logger?.warn?.('🛡️ P-06 已清洗 container bg 串用引用', {
          file: p,
          var: varName,
        });
      } else {
        logger?.warn?.('🛡️ P-06 清洗后 SFC 校验失败，已跳过该文件', {
          file: p,
          errors: (check.errors || []).slice(0, 2),
        });
      }
    }
  }
  return out;
}

/**
 * 🛡️ P-08 状态子组件根布局确定化（2026-09-17 · 36c3a630 实锤）。
 *
 * 现象：ContentActive 根写了 display:flex（横向 icon+文字），ContentDefault 根漏写
 * display → block 竖排 + 内容溢出容器。同一 Figma 卡片结构，两份产物风格漂移。
 *
 * 治本（事实源 = Figma 几何，零 LLM 依赖）：
 *   1. 取 bg 节点的父节点（状态卡片 GROUP）；
 *   2. 读卡片直接子节点（icon/text/line…）的 absoluteBoundingBox；
 *   3. 几何分类：所有子节点 x 区间两两不相交 → row；y 区间两两不相交 → column；
 *      都不满足 → 不注入（fail-closed，不猜）；
 *   4. 根 class 的顶层规则无 display 声明时，注入
 *      display:flex; flex-direction:<方向>; align-items:center。
 *      已有 display（无论值）→ 尊重不覆盖。
 *
 * @param {string} content owner .vue 全文
 * @param {Map|null} figmaIndex nodeId→node 索引（含 __parent 反链）
 * @param {string|null} bgNodeId bg 资源的 figmaNodeId
 * @returns {string|null} 有改动返回新内容；无需/无法注入返回 null
 */
export function ensureStateRootFlexLayout(content, figmaIndex, bgNodeId) {
  if (typeof content !== 'string' || !figmaIndex || !bgNodeId) return null;
  const bgNode = figmaIndex.get(String(bgNodeId));
  if (!bgNode) return null;
  const card = bgNode.__parent || null;
  if (!card) return null;
  const kids = (card.children || []).filter(
    (k) => k && k.absoluteBoundingBox && String(k.id) !== String(bgNodeId),
  );
  if (kids.length < 2) return null;

  const boxes = kids.map((k) => k.absoluteBoundingBox).filter(Boolean);
  if (boxes.length < 2) return null;
  // 🛡️ 几何分类（分组感知）：真实卡片常为「icon | 右侧竖排文字」嵌套结构——
  //   直接两两判定会因组内重叠 fail-closed。先按 x 聚簇（簇间 x 不相交），
  //   簇数 ≥2 → 根 row（簇内方向由内层容器负责）；否则按 y 两两不相交 → column。
  const sortedX = [...boxes].sort((a, b) => a.x - b.x);
  const xClusters = [];
  let cur = [sortedX[0]];
  for (let i = 1; i < sortedX.length; i++) {
    const prev = cur[cur.length - 1];
    if (sortedX[i].x >= prev.x + prev.width - 1) xClusters.push(cur), (cur = [sortedX[i]]);
    else cur.push(sortedX[i]);
  }
  xClusters.push(cur);
  let direction = null;
  if (xClusters.length >= 2) direction = 'row';
  else {
    const yDisjoint = boxes.every((a, i) =>
      boxes.every((b, j) => i === j || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1),
    );
    if (yDisjoint) direction = 'column';
  }
  if (!direction) return null; // 无法安全判定 → 不猜

  // 根 class 提取 + display 缺则注入
  const rootTag = findTemplateRootTag(content);
  if (!rootTag) return null;
  const clsM = rootTag.match(/class="([^"]*)"/);
  if (!clsM) return null;
  const firstCls = clsM[1].trim().split(/\s+/)[0];
  if (!firstCls) return null;

  const styleSeg = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleSeg) return null;
  const clsEsc = firstCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('(?:^|\\n|\\})\\s*(\\.' + clsEsc + ')\\s*\\{');
  const headM = styleSeg[1].match(headRe);
  if (!headM) return null;
  // 直属声明体（到嵌套 { 或闭合 } 为止）
  const afterHead = styleSeg[1].slice(styleSeg[1].indexOf(headM[0]) + headM[0].length);
  const directBody = afterHead.split(/[{}]/)[0] || '';
  if (/display\s*:/i.test(directBody)) return null; // 已有 display → 尊重

  const insertAt =
    content.indexOf(styleSeg[0]) + styleSeg[0].indexOf(headM[0]) + headM[0].length;
  return (
    content.slice(0, insertAt) +
    '\n  display: flex;\n  flex-direction: ' + direction + ';\n  align-items: center;\n' +
    content.slice(insertAt)
  );
}
