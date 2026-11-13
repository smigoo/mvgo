/**
 * 🧬 2026-11-12（mc-max-1794426617609-e35971ca 真机归因）：
 * **段内 items 级图标只消费一张 ⇒ E2-v3 拒交付** 的确定性补位。
 *
 * ## 问题形态（真机实锤）
 * `38:3260`（统计卡段）真值 `body.items` 两项各带自己的图标：
 *   items[0] = { label: '合作厂商', icon: { resource: '../resources/images/icon-262.png' } }
 *   items[1] = { label: '在线设备', icon: { resource: '../resources/images/icon-263.png' } }
 * 产物 `StatsSection.vue` 的两条数据却都写 `icon: icon2`（icon-262）⇒ `icon-263` 零引用
 * ⇒ E2-v3「已落盘但产物零消费」硬拒；连续两轮修复轮都改不掉（LLM 每次重写同一个 fallback）。
 *
 * ## 为什么不能靠「去重」蒙过去
 * 两张图 md5 与像素内容都不同（工厂 / 带勾方块），是**两张真实前景图**，必须各自消费。
 *
 * ## 判据（确定性，零 LLM；全部满足才改，任一不满足 ⇒ 该段原样返回）
 *  ① 段 `body.items` 中带 `icon.resource` 的项 **≥2** 且资源路径互不相同（单图标段不碰）；
 *  ② 产物中存在**恰好一个**文件的根元素 `data-section-id="<段id>"`（多重命中 = 归属不明，不猜）；
 *  ③ 真值项能取到 **label 文本**（`content.elements[type=label].text`，退化用 `item.name`）；
 *  ④ 该文件里能以 `label: '<文本>'` 定位到数据对象，且该对象附近有 `icon:` 字段 ——
 *     **按文本锚定，不按数组下标猜顺序**；
 *  ⑤ 目标变量名来自资源映射 `assignedVarName`（与 `buildVarToMapping` 同一事实源）。
 *
 * ## 只做两件事
 *  - 把错误的 `icon: <旧变量>` 换成该 label 的真值资源变量；
 *  - 若该文件尚未 import 该资源，注入一条 `import <var> from '<相对路径>'`。
 * 其余文本逐字节不动（不改模板、不改样式、不新增字段）。
 *
 * ## 幂等
 * 已是正确变量 ⇒ 无改动。可重复执行。
 */

/** 组件文件在 `package/components/` 下时，`../resources/...` 需再深一级。 */
export function resourceImportPathForFile(filePath, resourceFile) {
  const rf = String(resourceFile || '').trim();
  if (!rf) return '';
  if (!/^\.{1,2}\//.test(rf)) return rf;
  const inComponents = /(^|\/)package\/components\//.test(String(filePath || ''));
  if (!inComponents) return rf;
  return `../${rf}`;
}

/** 从段里取 items 级图标真值：[{ labelText, resource, figmaNode, varName }] */
export function collectSectionItemIcons(sec, mapping) {
  const out = [];
  const items = sec?.body?.items;
  if (!Array.isArray(items)) return out;
  const varByResource = new Map();
  for (const e of Array.isArray(mapping) ? mapping : []) {
    if (!e || typeof e.resourceFile !== 'string' || !e.resourceFile) continue;
    if (e.assignedVarName && !varByResource.has(e.resourceFile)) {
      varByResource.set(e.resourceFile, String(e.assignedVarName));
    }
  }
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const resource = typeof it.icon?.resource === 'string' ? it.icon.resource.trim() : '';
    if (!resource) continue;
    const els = Array.isArray(it.content?.elements) ? it.content.elements : [];
    const labelEl = els.find((x) => x && String(x.type || '') === 'label' && typeof x.text === 'string');
    const labelText = String(labelEl?.text || it.name || '').trim();
    out.push({
      labelText,
      resource,
      figmaNode: String(it.icon?.figmaNode || ''),
      varName: varByResource.get(resource) || '',
    });
  }
  return out;
}

/** 在 script 里以 `label: '<文本>'` 锚定数据对象，返回附近最近的 `icon:` 字段区间。 */
function locateIconFieldForLabel(script, labelText) {
  if (!labelText) return null;
  const esc = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelRx = new RegExp(`\\blabel\\s*:\\s*['"]${esc}['"]`, 'g');
  const anchors = [];
  let lm;
  while ((lm = labelRx.exec(script)) !== null) anchors.push(lm.index);
  if (anchors.length === 0) return null;
  // 取第一个 label 锚（同一 label 文本在数据里重复出现属异常，取首处最稳）
  const anchor = anchors[0];
  const iconRx = /\bicon\s*:\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")/g;
  let best = null;
  let im;
  while ((im = iconRx.exec(script)) !== null) {
    const dist = Math.abs(im.index - anchor);
    if (dist > 400) continue;
    if (!best || dist < best.dist) {
      best = {
        dist,
        start: im.index,
        end: im.index + im[0].length,
        current: im[1],
      };
    }
  }
  return best;
}

/**
 * 对单个文件执行「段内 items 图标按 label 锚定补位」。
 * @returns {{content:string, changes:Array<{label:string, from:string, to:string}>, reasons:string[]}}
 */
export function bindItemIconsInFile(content, itemIcons, filePath) {
  let next = String(content || '');
  const changes = [];
  const reasons = [];
  if (!next) return { content: next, changes, reasons: ['empty-content'] };
  const scriptM = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(next);
  if (!scriptM) return { content: next, changes, reasons: ['no-script-block'] };
  // 每轮重取 script（注入 import 会移动位置），最多项数次
  for (const it of Array.isArray(itemIcons) ? itemIcons : []) {
    if (!it || !it.resource || !it.labelText) {
      reasons.push(`skip-no-label:${it?.resource || '?'}`);
      continue;
    }
    const targetVar = String(it.varName || '').trim();
    if (!targetVar) {
      reasons.push(`skip-no-var:${it.resource}`);
      continue;
    }
    const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(next);
    if (!m) {
      reasons.push('no-script-block');
      break;
    }
    const scriptStart = m.index + m[0].indexOf(m[1]);
    const script = m[1];
    const hit = locateIconFieldForLabel(script, it.labelText);
    if (!hit) {
      reasons.push(`skip-no-icon-field:${it.labelText}`);
      continue;
    }
    if (hit.current === targetVar) continue; // 已正确，幂等
    // 需要目标变量在文件里有 import（否则运行时 undefined）
    const importPath = resourceImportPathForFile(filePath, it.resource);
    const hasImport = new RegExp(`\\bimport\\s+${targetVar}\\s+from\\s+['"]`).test(next);
    let replaced = `${next.slice(0, scriptStart + hit.start)}icon: ${targetVar}${next.slice(scriptStart + hit.end)}`;
    if (!hasImport) {
      const open = /<script[^>]*>\r?\n?/.exec(replaced);
      if (!open) {
        reasons.push('no-script-open');
        continue;
      }
      const at = open.index + open[0].length;
      replaced = `${replaced.slice(0, at)}import ${targetVar} from '${importPath}'\n${replaced.slice(at)}`;
    }
    changes.push({ label: it.labelText, from: String(hit.current), to: targetVar });
    next = replaced;
  }
  return { content: next, changes, reasons };
}

/**
 * 批量入口：按「段 id → 组件文件（data-section-id 唯一命中）」把 items 图标补位。
 * @param {Object<string,string>} files path → content（原地修改）
 * @param {Array} sections 全保真段（含 body.items）
 * @param {Array} mapping  resource-dom-mapping
 * @returns {{applied:Array, skipped:Array}}
 */
export function bindSectionItemIcons(files, sections, mapping) {
  const applied = [];
  const skipped = [];
  if (!files || typeof files !== 'object') return { applied, skipped };
  for (const sec of Array.isArray(sections) ? sections : []) {
    const icons = collectSectionItemIcons(sec, mapping);
    if (icons.length < 2) continue; // ① 单图标段（正常链路处理）
    const distinct = new Set(icons.map((x) => x.resource));
    if (distinct.size < 2) continue;
    const sid = String(sec.id || '');
    if (!sid) continue;
    const needle = `data-section-id="${sid}"`;
    const owners = Object.keys(files).filter((p) => String(files[p] || '').includes(needle));
    if (owners.length !== 1) {
      skipped.push({ sectionId: sid, reason: `owner-files=${owners.length}` });
      continue;
    }
    const path = owners[0];
    const res = bindItemIconsInFile(files[path], icons, path);
    if (res.changes.length > 0) {
      files[path] = res.content;
      applied.push({ sectionId: sid, file: path, changes: res.changes });
    } else {
      skipped.push({ sectionId: sid, reason: res.reasons[0] || 'no-change' });
    }
  }
  return { applied, skipped };
}
