/**
 * 🛡️ 根治⑬（2026-11-13 · mc-1794524809643-8a74b874 实锤）：确定性防叠布局引擎。
 *
 * 病灶（8a74b874 尸检）：RUNTIME-016 文本重叠的物理成因是**结构缺陷**而非「模型排版水平」——
 *  ① 半缺失容器：模板在用的类（如 c-traffic-monitor-cdtf-header / cdtf-compare__item）
 *     在 style 里零规则、或规则体无 display 声明 ⇒ 内部 inline 子元素裸排，
 *     容器被 flex 比例压缩时文本交叠；
 *  ② 内容-容量失配：flex column 子项被压缩后行盒溢出，与兄弟子项文本叠。
 * 既有「样式结构性兜底」（style-class-completion）只扫「零规则类」，半缺失不在判据内。
 * D2 回灌把坐标喂给 LLM 三轮也修不掉——LLM 意识不到要补的是父容器的 display 规则。
 *
 * 治本思路：写盘前确定性消除「重叠的物理条件」，不再依赖 LLM 自觉：
 *  A. 防叠容器配方：对重叠对锚点链上的「多子元素容器且无 display」类，
 *     补 `display:flex; flex-direction:column; gap; min-width:0`（column 是唯一几何上
 *     保证不叠的排法；视觉美观由 VISUAL 层与字号钳制兜）；
 *  B. 字号确定性钳制：重叠对双方分属同组件不同子树 ⇒ 对**最近公共祖先类**注入
 *     `--fontSize: <fallback×0.85>px`（产物已有 `@fontSize: var(--fontSize, 14px)`
 *     变量钩子，整组字号联动缩放）；无钩子文件跳过（不瞎改，记 skipped）。
 *
 * 精准触发：只处理 D2 渲染实测重叠对的锚点链类（extractOverlapAnchors 的产物），
 * 无重叠的组件零接触。幂等：所有注入带 `op-heal` 标记，重复跑零变化。
 */

/** 解析 aAnc/bAnc 容器链（'近 < 远'）→ [近, ..., 远] */
export function parseAncChain(anc) {
  return String(anc || '')
    .split('<')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 求两条链的最近公共祖先（从近端向远端扫，最后一个共同类） */
export function nearestCommonAncestor(chainA, chainB) {
  const setB = new Set(chainB);
  for (const cls of chainA) {
    if (setB.has(cls)) return cls;
  }
  return null;
}

/**
 * 从 D2 重叠对提取防叠锚点：[{ anchorClasses:Set, commonAncestor:string|null, ... }]
 * 🛡️ 根治⑮（2026-11-13 · mc-1794532970423-0062020b 实锤）升级：
 *  - 保留渲染实测 box（aBox/bBox [x,y,w,h]），区分**同父/异父**重叠对；
 *  - 异父对（chainA[0] !== chainB[0]）按容器对聚合 y 区间 → crossPairs：
 *    0062020b 病灶 = 产品描述区块(c-device-fg-regions-361693) 与 KV 网格(c-device-fg-kvgrid-817)
 *    两个**兄弟区块**几乎同 top 压盖（394.25 vs 393.59，y 区间大量交叠）——
 *    动作 A 的容器内 flex column 治不了兄弟区块互相压盖（真机实证三轮纹丝不动）。
 * @param {Array<{aAnc?:string,bAnc?:string,aBox?:number[],bBox?:number[]}>} pairs
 */
export function extractOverlapAnchors(pairs) {
  const out = [];
  const crossMap = new Map(); // 'containerA\x1fcontainerB' → 聚合条目
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const chainA = parseAncChain(p?.aAnc);
    const chainB = parseAncChain(p?.bAnc);
    if (chainA.length === 0 && chainB.length === 0) continue;
    const anchorClasses = new Set([...chainA, ...chainB]);
    const sameParent = chainA.length > 0 && chainA[0] === chainB[0];
    out.push({
      anchorClasses,
      commonAncestor: nearestCommonAncestor(chainA, chainB),
      sameParent,
    });
    // 异父对聚合（根治⑮）
    if (!sameParent && chainA[0] && chainB[0]) {
      const key = `${chainA[0]}\x1f${chainB[0]}`;
      if (!crossMap.has(key)) {
        crossMap.set(key, {
          type: 'cross-parent',
          containerA: chainA[0],
          containerB: chainB[0],
          chainA,
          chainB,
          regionA: { top: Infinity, bottom: -Infinity },
          regionB: { top: Infinity, bottom: -Infinity },
        });
      }
      const agg = crossMap.get(key);
      const span = (box, region) => {
        if (!Array.isArray(box) || box.length < 4) return;
        const [x, y, w, h] = box.map(Number);
        if (![x, y, w, h].every(Number.isFinite)) return;
        region.top = Math.min(region.top, y);
        region.bottom = Math.max(region.bottom, y + h);
      };
      span(p.aBox, agg.regionA);
      span(p.bBox, agg.regionB);
    }
  }
  // 只保留两侧区间都有效、且 y 区间确实交叠的异父对（交叠比 > 0）
  const crossPairs = [];
  for (const agg of crossMap.values()) {
    const { regionA, regionB } = agg;
    if (!Number.isFinite(regionA.top) || !Number.isFinite(regionB.top)) continue;
    const overlapTop = Math.max(regionA.top, regionB.top);
    const overlapBottom = Math.min(regionA.bottom, regionB.bottom);
    agg.overlapHeight = overlapBottom - overlapTop;
    if (agg.overlapHeight <= 0) continue;
    agg.anchorClasses = new Set([agg.containerA, agg.containerB]);
    agg.commonAncestor = null;
    crossPairs.push(agg);
  }
  for (const cp of crossPairs) out.push(cp);
  return out;
}

const OP_HEAL_MARK = '/* op-heal */';

/** 类名转正则安全串 */
function escCls(cls) {
  return String(cls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 提取 <style ...>...</style> 文本（第一个块； scoped less 同样适用） */
function extractStyleBlock(vueContent) {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(vueContent);
  return m ? { text: m[1], start: m.index + m[0].indexOf(m[1]) } : null;
}

/** 查类选择器规则：返回 { declBody, bodyStart, bodyEnd } 或 null（零规则） */
function findRule(styleText, cls) {
  const re = new RegExp(`\\.${escCls(cls)}\\s*\\{`, 'm');
  const m = re.exec(styleText);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  // 找配对右括号（less 嵌套少见；扫到第一个未配对 '}'）
  let depth = 1;
  let i = bodyStart;
  for (; i < styleText.length; i += 1) {
    if (styleText[i] === '{') depth += 1;
    else if (styleText[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return { declBody: styleText.slice(bodyStart, i), bodyStart, bodyEnd: i };
}

/** 判定宿主是否有元素子节点（容器）——与 style-class-completion.findClassHostKinds 同思路 */
function hostHasElementChildren(vueContent, cls) {
  const re = new RegExp(`class="[^"]*\\b${escCls(cls)}\\b[^"]*"`, 'm');
  const m = re.exec(vueContent);
  if (!m) return false;
  // ⚠️ m[0] 只覆盖 class 属性本身；宿主标签可能还有其他属性 ⇒ 须扫到本标签闭合 '>'
  //   （引号感知，防属性值内 '>' 干扰），再判闭合后的首个非空白字符。
  let i = m.index + m[0].length;
  let quote = null;
  for (; i < vueContent.length; i += 1) {
    const ch = vueContent[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') break;
  }
  const after = vueContent.slice(i + 1).replace(/^\s+/, '');
  return after.startsWith('<') && !after.startsWith('</');
}

const FLEX_COLUMN_DECL =
  'display: flex; flex-direction: column; gap: 4px; min-width: 0; box-sizing: border-box;';

const FONT_CLAMP_RE = /--fontSize:\s*[\d.]+px\s*;?\s*\/\* op-heal/;
const FONT_HOOK_RE = /var\(\s*--fontSize\s*,\s*([\d.]+)\s*px\s*\)/;

/**
 * 主入口：对重叠锚点涉及的 .vue 文件做确定性防叠补齐。
 * @param {Record<string,string>} files 产物文件表（不改动原对象，返回新表）
 * @param {Array<{anchorClasses:Set<string>, commonAncestor:string|null}>} anchors
 * @param {object} [logger]
 * @returns {{ files:Record<string,string>, healed:Array, skipped:Array }}
 */
export function applyOverlapProofHeal(files, anchors, logger) {
  const healed = [];
  const skipped = [];
  const next = { ...files };
  if (!Array.isArray(anchors) || anchors.length === 0) {
    return { files: next, healed, skipped };
  }
  // 合并所有锚点类 + 公共祖先集合
  const allClasses = new Set();
  const commonAncestors = new Set();
  for (const a of anchors) {
    for (const c of a.anchorClasses || []) allClasses.add(c);
    if (a.commonAncestor) commonAncestors.add(a.commonAncestor);
  }

  for (const [path, content] of Object.entries(files)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;
    // 该文件的模板是否涉及锚点类（零接触优化：无涉及不动文件）
    const involved = [...allClasses].filter((c) =>
      new RegExp(`\\b${escCls(c)}\\b`).test(content),
    );
    if (involved.length === 0) continue;

    const style = extractStyleBlock(content);
    if (!style) {
      skipped.push({ path, reason: 'no-style-block' });
      continue;
    }

    let styleText = style.text;
    const fileHeals = [];

    // ── 动作 A：防叠容器配方（锚点链上半缺失/零规则的多子元素容器）──
    for (const cls of involved) {
      if (!hostHasElementChildren(content, cls)) continue; // 纯文本叶子不动
      const rule = findRule(styleText, cls);
      if (rule) {
        if (/\bdisplay\s*:/.test(rule.declBody)) continue; // 有 display ⇒ 不动（防回归扰动）
        if (rule.declBody.includes('op-heal')) continue; // 已补过
        const patched =
          styleText.slice(0, rule.bodyStart) +
          ` ${FLEX_COLUMN_DECL} ${OP_HEAL_MARK}` +
          styleText.slice(rule.bodyStart);
        styleText = patched;
        fileHeals.push({ cls, action: 'flex-column-injected' });
      } else {
        // 零规则类：末尾新建
        styleText =
          styleText.replace(/\s*$/, '') +
          `\n${OP_HEAL_MARK}\n.${cls} { ${FLEX_COLUMN_DECL} }\n`;
        fileHeals.push({ cls, action: 'flex-column-rule-appended' });
      }
    }

    // ── 动作 B：字号确定性钳制（公共祖先类 × --fontSize 钩子）──
    const hook = FONT_HOOK_RE.exec(styleText);
    if (hook && commonAncestors.size > 0) {
      const fallbackPx = parseFloat(hook[1]);
      for (const rootCls of commonAncestors) {
        if (!new RegExp(`\\b${escCls(rootCls)}\\b`).test(content)) continue;
        const rule = findRule(styleText, rootCls);
        if (!rule) continue; // 根类无规则 ⇒ 只做动作 A（新建规则可能改变层叠，保守跳过）
        if (FONT_CLAMP_RE.test(rule.declBody)) continue; // 幂等
        const clamped = Math.round(fallbackPx * 0.85 * 10) / 10;
        const patched =
          styleText.slice(0, rule.bodyStart) +
          `\n  --fontSize: ${clamped}px; ${OP_HEAL_MARK} overlap-proof font clamp` +
          styleText.slice(rule.bodyStart);
        styleText = patched;
        fileHeals.push({
          cls: rootCls,
          action: 'font-clamp',
          detail: `${fallbackPx}px → ${clamped}px`,
        });
      }
    } else if (commonAncestors.size > 0 && !hook) {
      skipped.push({ path, reason: 'no-fontsize-hook' });
    }

    // ── 动作 C：异父同位错开（根治⑮ · 2026-11-13 mc-1794532970423-0062020b 实锤）──
    //   病灶：两个兄弟区块（产品描述 regions × KV 网格 kvgrid）几乎同 top 的
    //   position:absolute 压盖（394.25 vs 393.59，y 区间大量交叠），动作 A 的
    //   容器内 flex column 治不了兄弟区块互相压盖（真机三轮纹丝不动）。
    //   配方：渲染实测 y 区间大者（内容多、位置更可信）不动；把另一容器的
    //   top 确定性偏移到前者实测底部 + 8px 之下。判据缺一即 skipped（不瞎改）：
    //   ① 双链各解析出定位祖先（沿链第一个 position:absolute + top: Npx 规则类；
    //     0062020b：文本挂 cell，absolute 在祖先 kvgrid 上——不能盲取链首段）
    //   ② 两定位祖先不同类（同类 ⇒ 同一容器，非兄弟压盖）
    //   ③ |topA - topB| < 区间交叠高度（同位实锤；已错开的不动）。
    const resolvePosAncestor = (chain) => {
      for (const cls of chain || []) {
        const rule = findRule(styleText, cls);
        if (!rule) continue;
        if (!/position\s*:\s*absolute/.test(rule.declBody)) continue;
        if (!/(^|;)\s*top\s*:\s*-?[\d.]+px/.test(rule.declBody)) continue;
        return { cls, rule };
      }
      return null;
    };
    for (const cp of anchors) {
      if (cp.type !== 'cross-parent' || !(cp.overlapHeight > 0)) continue;
      const posA = resolvePosAncestor(cp.chainA);
      const posB = resolvePosAncestor(cp.chainB);
      if (!posA || !posB) {
        skipped.push({ path, reason: 'cross-parent-no-pos-ancestor' });
        continue;
      }
      if (posA.cls === posB.cls) continue; // 同一定位容器 ⇒ 非兄弟压盖
      if (!new RegExp(`\\b${escCls(posA.cls)}\\b`).test(content)) continue;
      if (!new RegExp(`\\b${escCls(posB.cls)}\\b`).test(content)) continue;
      if (posA.rule.declBody.includes('op-heal-c') || posB.rule.declBody.includes('op-heal-c')) continue; // 幂等
      const topRe = /(^|;)(\s*top\s*:\s*)(-?[\d.]+)(px)/;
      const mA = topRe.exec(posA.rule.declBody);
      const mB = topRe.exec(posB.rule.declBody);
      if (!mA || !mB) continue; // resolve 已保证命中，防御兜底
      const topA = parseFloat(mA[3]);
      const topB = parseFloat(mB[3]);
      if (Math.abs(topA - topB) >= cp.overlapHeight) continue; // 已错开 ⇒ 非同位，不动
      // 内容区间大者不动（主内容锚），挪小者
      const { regionA, regionB } = cp;
      const hA = regionA.bottom - regionA.top;
      const hB = regionB.bottom - regionB.top;
      const keepRegion = hA >= hB ? regionA : regionB;
      const moveRegion = hA >= hB ? regionB : regionA;
      const movePos = hA >= hB ? posB : posA;
      const keepCls = hA >= hB ? posA.cls : posB.cls;
      const moveTopCss = parseFloat((hA >= hB ? mB : mA)[3]);
      // 偏移量 = 保留者实测底部 + 8 − 被挪者实测内容 top（保持容器内 padding/margin 不变）
      const offset = keepRegion.bottom + 8 - moveRegion.top;
      const newTop = Math.round((moveTopCss + offset) * 10) / 10;
      const mm = topRe.exec(movePos.rule.declBody);
      const topIdx = movePos.rule.bodyStart + mm.index;
      styleText =
        styleText.slice(0, topIdx) +
        mm[1] + mm[2] + newTop + mm[4] + ' /* op-heal-c */' +
        styleText.slice(topIdx + mm[0].length);
      fileHeals.push({
        cls: movePos.cls,
        action: 'cross-parent-top-shift',
        detail: `top → ${newTop}px（+${Math.round(offset * 10) / 10}，避让 ${keepCls}）`,
      });
    }

    if (fileHeals.length > 0) {
      const start = content.indexOf(style.text);
      const patchedContent =
        content.slice(0, start) + styleText + content.slice(start + style.text.length);
      next[path] = patchedContent;
      healed.push({ path, heals: fileHeals });
      logger?.info?.(`🛡️ 根治⑬ 防叠布局确定性补齐: ${path}`, {
        heals: fileHeals,
      });
    }
  }
  return { files: next, healed, skipped };
}
