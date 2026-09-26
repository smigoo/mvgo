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

export function buildResourceMountPlan(effectiveSections, resourceDomMapping, opts = {}) {
  const byFile = new Map();
  const byComponent = new Map();
  const skipped = [];
  const plan = { byFile, byComponent, skipped };

  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) {
    return plan;
  }
  const sections = Array.isArray(effectiveSections) ? effectiveSections : [];

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
    g.mounts.push({
      figmaNodeId: nid,
      owner,
      mountTarget: m.mountTarget || null,
      bgRole: m.bgRole || null,
      kind,
      figmaBox: m.figmaBox || null,
      parentBox: m.parentBox || null,
    });
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
        !sharedNeedsMigration
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
              let upd = injectBgStyleBinding(tgt, rootTag, varName, mapping);
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
            const candidates = collectMountCandidates({ [targetFile]: content });
            const best = pickBestMountTarget(mapping, candidates, { skipBound: true });
            if (best) tag = best.tag;
          }
          if (tag) {
            let updated = injectBgStyleBinding(content, tag, varName, mapping);
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
            let itemUpdated = injectBgStyleBinding(content, itemTag, varName, mapping);
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
            // 兜底：从当前文件的候选池中找最优挂载点
            const candidates = collectMountCandidates({ [targetFile]: content });
            const best = pickBestMountTarget(mapping, candidates, {
              skipBound: true, // 优先选没有 bg 绑定的标签
            });
            if (best) {
              tag = best.tag;
              options.logger?.warn?.('🛡️ S7：资源 mountTarget 不在模板类名，已回退最优挂载点', {
                varName,
                mountTarget: mount.mountTarget || '(null)',
                file: targetFile,
              });
            }
          }
        }
        if (tag) {
          let updated = injectBgStyleBinding(content, tag, varName, mapping);
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
            const candidates = collectMountCandidates({ [targetFile]: content });
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
    const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)>/g;
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
