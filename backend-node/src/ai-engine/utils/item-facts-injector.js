/**
 * 🛡️ H item-level DOM contract · 第 1b 步（2026-09-22 · mc-1790048059931 实锤）
 *
 * 病灶：collapsed 卡（v-for item）内 LLM 自包的文本容器方向自由发挥——
 *   摄像机卡 Figma 真值「label 上 / value 下」纵排列，产物 .cons-text 写成 row → 横排。
 *   nodeLayoutFacts 只覆盖「有 children 的容器」，纯 TEXT 兄弟无事实 → 全链路无人纠正。
 *
 * 治本：把 buildItemLevelFacts 的几何分组事实确定性注入产物。锚定双通道（不依赖
 *   class 名 / data-section-id / LLM 命名——吸取三层坑教训）：
 *   A) 静态文本卡：模板中「容器内文本依次出现且间距 <600 字符」→ 向上找最近容器 class 注入方向
 *   B) v-for 绑定卡：script 数组 label 签名与 fact.texts.characters 双射 → 用数组的
 *      v-for 元素 class 定位卡容器，再向卡内「含 {{label}}/{{value}} 绑定的最近容器」注入方向
 *   C) icon 实测尺寸：与 textStack 同一 fact 节点的 isIcon 资产 → v-for <img> 无内联尺寸时注入
 *
 * 保守纪律：签名集合 100% 相等才动手；方向已正确跳过（幂等）；fail-open。
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 找模板中「含 {{ }} 绑定子元素 ≥2 的最内层容器」class（v-for 卡文本列）。 */
function findBindingTextContainer(content, vforItemClass) {
  // 卡内：<div class="X"> <span..>{{ item.label }}</span> <span..>{{ item.value }}</span> </div>
  const re = new RegExp(
    `<div\\s+class="([^"]+)"[^>]*>\\s*(?:<[^>]+>[^<]*</[^>]+>\\s*)?<span[^>]*>\\{\\{\\s*[\\w$.]+\\.label\\s*\\}\\}</span>\\s*<span[^>]*>\\{\\{\\s*[\\w$.]+\\.value`,
  );
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 对一个子组件 .vue 注入 item 级布局事实。
 *
 * @param {string} vueContent 子组件 .vue 全文
 * @param {Record<string, object>} itemFacts buildItemLevelFacts 产出
 * @returns {{content: string, fixes: string[]}|null} 无改动返回 null
 */
export function injectItemLevelFacts(vueContent, itemFacts) {
  if (!vueContent || typeof vueContent !== 'string' || !itemFacts) return null;
  const entries = Object.entries(itemFacts).filter(
    ([, f]) => f && (f.textStack || f.textRow || (f.siblingAssets || []).some((a) => a.isIcon)),
  );
  if (entries.length === 0) return null;

  const fixes = [];
  let content = vueContent;

  // 提取 script 数组的全部文本值签名（label/value/text/name/title——v-for 卡锚定用）
  const scriptOpen = content.search(/<script[^>]*>/);
  const scriptOpenEnd = scriptOpen >= 0 ? content.indexOf('>', scriptOpen) + 1 : -1;
  const scriptClose = scriptOpenEnd > 0 ? content.toLowerCase().indexOf('</script>', scriptOpenEnd) : -1;
  const scriptLabels = new Set();
  if (scriptClose > 0) {
    const script = content.slice(scriptOpenEnd, scriptClose);
    for (const m of script.matchAll(/\b(?:label|value|text|name|title)\s*:\s*(['"])([^'"]+)\1/g)) {
      scriptLabels.add(m[2]);
    }
  }

  /** 🛡️ 对容器 class 注入 display:grid + grid-template-columns（grid 事实确定性接管）。 */
  const setContainerDirection = (cls, dir) => {
    const first = cls.split(/\s+/)[0];
    if (!first) return false;
    const clsRe = new RegExp(`\\.${escapeRe(first)}\\s*\\{([^}]*)\\}`);
    const styleM = content.match(clsRe);
    if (!styleM) return false;
    const block = styleM[1];
    if (!/display\s*:\s*(?:flex|inline-flex|grid)/.test(block)) return false;
    const fdM = block.match(/flex-direction\s*:\s*(row|column)/);
    if (fdM && fdM[1] === dir) return false; // 已正确（幂等）
    const newBlock = fdM
      ? block.replace(/flex-direction\s*:\s*(?:row|column)/, `flex-direction: ${dir}`)
      : `${block.replace(/\s*$/, '')}\n  flex-direction: ${dir};`;
    content = content.replace(styleM[0], styleM[0].replace(block, newBlock));
    fixes.push(`ITEM-FACTS: .${first} flex-direction → ${dir}`);
    return true;
  };

  for (const [, fact] of entries) {
    const textFact = fact.textStack || fact.textRow;
    if (!textFact) continue;
    const dir = textFact.flexDirection;
    const chars = textFact.texts.map((t) => t.characters);

    // ── 通道 B：v-for 绑定卡（script 数组 label ↔ fact 文本双射）──
    const allLabelsInFact = chars.every((c) => scriptLabels.has(c));
    if (allLabelsInFact && chars.length >= 2) {
      // 找 v-for 元素 class（卡容器），再找卡内绑定文本列容器
      const vforM = content.match(/v-for="[^"]*"[^>]*class="([^"]+)"/) ||
        content.match(/class="([^"]+)"[^>]*v-for="[^"]*"/);
      if (vforM) {
        const bindingCls = findBindingTextContainer(content, vforM[1]);
        if (bindingCls && setContainerDirection(bindingCls, dir)) {
          fixes[fixes.length - 1] += `（Figma 文本几何：${chars.join(' / ')}）`;
          // icon 尺寸：同 fact 的 isIcon 资产 → v-for img
          const icon = (fact.siblingAssets || []).find((a) => a.isIcon);
          if (icon) {
            const imgM = content.match(/<img\s+[^>]*class="[^"]*icon[^"]*"[^>]*>/);
            if (imgM && !/width\s*:|height\s*:/.test(imgM[0])) {
              const newTag = imgM[0].replace(/\s*\/?>$/, ` style="width: ${icon.widthPx}px; height: ${icon.heightPx}px;" />`);
              content = content.replace(imgM[0], newTag);
              fixes.push(`ITEM-FACTS: img 尺寸 → ${icon.widthPx}x${icon.heightPx}px（icon 实测）`);
            }
          }
          continue; // 该 fact 已消费
        }
      }
    }

    // ── 通道 A：静态文本卡（模板字面量依次出现且近距）──
    for (let i = 0; i < chars.length - 1; i++) {
      const m = content.match(new RegExp(`>\\s*${escapeRe(chars[i])}\\s*<`));
      if (!m || m.index == null) continue;
      const mNext = content.slice(m.index + 1).match(new RegExp(`>\\s*${escapeRe(chars[i + 1])}\\s*<`));
      if (!mNext || mNext.index == null || mNext.index > 600) continue;
      const before = content.slice(Math.max(0, m.index - 400), m.index);
      const containerM = [...before.matchAll(/<div\s+class="([^"]+)"[^>]*>/g)].pop();
      if (!containerM) continue;
      if (setContainerDirection(containerM[1].trim(), dir)) {
        fixes[fixes.length - 1] += `（Figma 文本几何：${chars.join(' / ')}）`;
      }
      break;
    }
  }

  if (fixes.length === 0) return null;
  return { content, fixes };
}

export default injectItemLevelFacts;
