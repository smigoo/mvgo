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
  AUTO_MOUNT_ICON_MAX_PX,
  ensureResourceImportInVue,
  findTagByClassKeyword,
  injectBgStyleBinding,
  injectImgChild,
  mountSubStateBackground,
} from './resource-mounter.js';

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
 * 幂等：变量已被引用（含上轮挂载结果）即跳过。
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

  const doneKeys = new Set();
  for (const [resourceFile, g] of plan.byFile) {
    const varName = g.varName;
    for (const mount of g.mounts) {
      const compFile = mount.owner
        ? `package/components/${mount.owner}.vue`
        : 'package/index.vue';
      const key = `${compFile}|${mount.mountTarget}|${varName}|${g.kind}`;
      if (doneKeys.has(key)) continue;

      const content = allFiles[compFile];
      if (typeof content !== 'string') {
        diagnostics.push({ reason: 'owner-file-missing', file: compFile, var: varName });
        continue;
      }
      // 幂等：变量已被 LLM 引用（或上轮已挂）→ 跳过
      if (new RegExp(`\\b${varName}\\b`).test(content)) {
        doneKeys.add(key);
        continue;
      }

      const mapping = {
        assignedVarName: varName,
        resourceFile,
        mountTarget: mount.mountTarget,
        bgRole: mount.bgRole,
        previewAnalysisRole: g.kind,
      };
      let result = null;

      if (g.kind === 'bg' && mount.bgRole === 'sub-state') {
        // 限定 owner 文件作用域调用既有确定性原语（active 条件绑定）
        const scoped = { [compFile]: content };
        const r = mountSubStateBackground(scoped, varName, mapping, options);
        if (r) {
          allFiles[compFile] = scoped[compFile];
          result = { ...r, file: compFile };
        }
      } else if (g.kind === 'bg') {
        const tag = mount.mountTarget
          ? findTagByClassKeyword(content, mount.mountTarget)
          : null;
        if (tag) {
          let updated = injectBgStyleBinding(content, tag, varName, mapping);
          if (updated) {
            updated = ensureResourceImportInVue(updated, varName, mapping, compFile);
            if (updated && updated !== content) {
              allFiles[compFile] = updated;
              result = {
                var: varName,
                file: compFile,
                keyword: mount.mountTarget,
                bgRole: mount.bgRole || null,
                mountTarget: mount.mountTarget,
              };
            }
          }
        }
      } else {
        // icon / img：注入 img 子元素，尺寸按 figmaBox 真值、单边封顶 AUTO_MOUNT_ICON_MAX_PX
        const tag = mount.mountTarget
          ? findTagByClassKeyword(content, mount.mountTarget)
          : null;
        if (tag) {
          let size = null;
          const fb = mount.figmaBox;
          if (fb && Number(fb.width) > 0 && Number(fb.height) > 0) {
            const scale = Math.min(
              1,
              AUTO_MOUNT_ICON_MAX_PX / Math.max(Number(fb.width), Number(fb.height)),
            );
            size = {
              width: Math.round(Number(fb.width) * scale),
              height: Math.round(Number(fb.height) * scale),
            };
          }
          let updated = injectImgChild(content, tag, varName, '', size);
          if (updated) {
            updated = ensureResourceImportInVue(updated, varName, mapping, compFile);
            if (updated && updated !== content) {
              allFiles[compFile] = updated;
              result = {
                var: varName,
                file: compFile,
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
          file: compFile,
          var: varName,
          mountTarget: mount.mountTarget,
        });
      }
    }
  }
  return { mounted, diagnostics };
}
