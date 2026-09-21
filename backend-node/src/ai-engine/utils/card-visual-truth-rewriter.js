/**
 * 🛡️ D1 per-card 样式确定性改写（2026-09-20 · mc-1789869245851 实锤）
 *
 * 背景：F1 已把 vision 卡片语义（bgPlaceholder/backgroundImage.src/数值颜色/icon 文件）
 * 回填进 effectiveSections 并进入 prompt，但 LLM 在「同形资源区分」（bg-124/125/126
 * 视觉相似随手取）与「色值→CSS 写法」（#ff4d4f 写成 var(--colorError,#ff3333)）上
 * 仍随机漂移。Facts are in prompt, execution drifts —— 治本用确定性后处理：
 *
 * 规则（仅 per-card 粒度，按 section 树逐卡执行）：
 *   R-bg ：卡 section 的 body.items[0].backgroundImage.src 指定 bg 文件，
 *          若该卡 .vue 内出现**其它 bg-N 文件**的引用（import/模板），改写为指定文件。
 *   R-num：value/number 元素 parts[0].styles.color 指定数值色，
 *          卡内「数值类 span」（含数字文本的 class=value/number 元素）的 color 与真值不符 → 改写。
 *   R-icon：icon.resourceFile 指定图标文件，卡内 img src 的 icon-N 与真值不符 → 改写。
 *
 * 约束：
 *   - 只在「组件文件与其归属 section 一一对应」时执行（通过 data-section-id 或唯一 bg 归属判定）；
 *   - 同一文件被多个 section 声明归属时跳过（无法确定归属，fail-open）；
 *   - import 名同步改写（bg1→保持变量名，只改 import 路径）；
 *   - 幂等：真值已正确时零改动。
 *
 * 纯函数、零 import.meta、可独立单测。
 */

/**
 * @param {Record<string,string>} files 产物文件集（path → content）
 * @param {Array} effectiveSections planner 输出的 section 树（含 F1 回填的 body.items）
 * @param {object} [deps]
 * @param {object} [deps.logger]
 * @param {Array} [deps.resourceDomMapping] 资源映射（bg 图 fileName ↔ figmaNodeId 归属兜底）
 * @returns {{ files: Record<string,string>, summary: { bgFixed: number, colorFixed: number, iconFixed: number, skipped: number } }}
 */
export function enforceCardVisualTruth(files, effectiveSections, deps = {}) {
  const { logger, resourceDomMapping } = deps;
  const result = { ...files };
  const summary = { bgFixed: 0, colorFixed: 0, iconFixed: 0, skipped: 0 };

  if (!files || typeof files !== 'object') return { files: result, summary };
  if (!Array.isArray(effectiveSections) || effectiveSections.length === 0) {
    return { files: result, summary };
  }

  // ── 收集卡片语义清单（叶子 section，含 F1 回填的 body.items[0]）──
  const cards = [];
  const walk = (secs) => {
    for (const s of secs || []) {
      if (!s || typeof s !== 'object') continue;
      const item = s.body?.items?.[0];
      if (item && typeof item === 'object') {
        let bgTruth = item.backgroundImage?.src
          ? String(item.backgroundImage.src).split('/').pop()
          : null;
        // 🛡️ 2026-09-20：vision 常只给 bgPlaceholder（card-bg-N）而无 backgroundImage.src。
        //   兜底链：卡 section 的 sourceNodeIds ∩ mapping 里 bg 类资源的 figmaNodeId →
        //   唯一命中即取该 bg 图文件名（136:127⊇136:126→bg-126 实锤有效）。
        if (!bgTruth && Array.isArray(resourceDomMapping) && Array.isArray(s.sourceNodeIds)) {
          const srcSet = new Set(s.sourceNodeIds.map(String));
          // ⚠️ 文件名取 resourceFile（mapping 的 name/fileName 常是无扩展名的 'bg'）
          const fileOf = (m) => {
            const base = String(m?.resourceFile || '').split('/').pop();
            if (/\.(png|svg|jpe?g)$/i.test(base)) return base;
            const nm = String(m?.fileName || m?.name || '');
            return /\.(png|svg|jpe?g)$/i.test(nm) ? nm : null;
          };
          const hits = resourceDomMapping.filter(
            (m) =>
              m &&
              /^bg/i.test(String(fileOf(m) || '')) &&
              srcSet.has(String(m.figmaNodeId || m.nodeId || '')),
          );
          if (hits.length === 1) {
            bgTruth = fileOf(hits[0]);
          }
        }
        cards.push({
          sectionId: String(s.id || ''),
          item,
          bgTruth,
          // import 变量名：bg-126.png → bg126（合法标识符）
          bgVar: bgTruth ? bgTruth.replace(/\.png$/, '').replace(/-/g, '') : null,
          iconTruth: item.icon?.resourceFile
            ? String(item.icon.resourceFile).split('/').pop()
            : null,
          numColor: extractNumberColor(item),
        });
      }
      if (Array.isArray(s.children)) walk(s.children);
    }
  };
  walk(effectiveSections);
  if (cards.length === 0) return { files: result, summary };

  // value/number 元素的首个颜色（真值）
  function extractNumberColor(item) {
    const parts =
      item?.content?.elements?.find(
        (e) => e?.type === 'value' && Array.isArray(e?.parts),
      )?.parts || [];
    const num = parts.find((p) => p?.type === 'number' && p?.styles?.color);
    return num ? normalizeColor(num.styles.color) : null;
  }

  function normalizeColor(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim();
    // rgba(255,77,79,1) → #ff4d4f
    const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if (m) {
      const hex = (n) => Number(n).toString(16).padStart(2, '0');
      return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`.toLowerCase();
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    }
    return null;
  }

  // ── 归属判定：文件 → 卡（data-section-id 优先，唯一 bg 归属兜底）──
  const fileEntries = Object.entries(result).filter(
    ([fp, fc]) => fp.endsWith('.vue') && typeof fc === 'string',
  );
  for (const [fp, fc] of fileEntries) {
    // 单文件多卡声明 → 无法归属，跳过（v-for 模板等场景）
    const ownedSecIds = new Set();
    for (const m of fc.matchAll(/data-section-id="([^"]+)"/g)) ownedSecIds.add(m[1]);
    const owned = cards.filter((c) => ownedSecIds.has(c.sectionId));
    let card = null;
    if (owned.length === 1) {
      card = owned[0];
    } else if (owned.length === 0) {
      // 兜底1：文件内只引用了一张卡的真值 bg 图 → 按该图反查唯一卡
      const bgRefs = [
        ...new Set(
          [...fc.matchAll(/bg-\d+\.png/g)].map((m) => m[0]),
        ),
      ];
      const byBg = cards.filter((c) => bgRefs.includes(c.bgTruth));
      if (bgRefs.length >= 1 && byBg.length === 1) card = byBg[0];
      // 兜底2（2026-09-20 · mc-1789870684687 实锤）：无 bg 引用但有 icon 引用 →
      //   唯一 icon 反查（卡1 场景：:style 被中间环节剥掉、无 data-section-id、只剩 icon-123）
      if (!card) {
        const iconRefs = [
          ...new Set(
            [...fc.matchAll(/icon-\d+\.png/g)].map((m) => m[0]),
          ),
        ];
        const byIcon = cards.filter((c) => iconRefs.includes(c.iconTruth));
        if (iconRefs.length >= 1 && byIcon.length === 1) card = byIcon[0];
      }
    }
    if (!card) {
      if (owned.length > 1) summary.skipped++;
      continue;
    }

    let content = fc;
    let changed = false;

    // R-bg+（2026-09-20 · mc-1789870684687 实锤）：卡文件**完全没有** bg 引用（LLM 漏写
    //   或中间环节剥掉了 :style）→ 确定性补全：根开标签注入 :style backgroundImage + import。
    //   这是「改写」升级为「补全」——不论哪个环节丢的，落盘前按真值补回。
    if (card.bgTruth && !/bg-\d+\.png/.test(content) && !/backgroundImage/.test(content)) {
      // 找根元素开标签（template 后第一个标签）
      const tplMatch = content.match(/<template>\s*<([a-zA-Z][\w-]*)([^>]*)>/);
      if (tplMatch) {
        const rootTag = tplMatch[1];
        const rootAttrs = tplMatch[2];
        const styleAttr = ` :style="{ backgroundImage: \`url(\${${card.bgVar}})\`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"`;
        const newOpen = `<${rootTag}${rootAttrs}${styleAttr}>`;
        content = content.replace(tplMatch[0], `<template>\n  ${newOpen}`);
        // 补 import（若无）
        const importLine = `import ${card.bgVar} from '../../resources/images/${card.bgTruth}'`;
        if (!content.includes(card.bgTruth)) {
          if (/<script setup>/.test(content)) {
            content = content.replace('<script setup>', `<script setup>\n${importLine}`);
          } else {
            // 无 script 段则补一个
            content = content.replace('</template>', `</template>\n\n<script setup>\n${importLine}\n</script>`);
          }
        }
        summary.bgInjected = (summary.bgInjected || 0) + 1;
        changed = true;
        logger?.warn?.('🛡️ D1 R-bg+：卡背景层缺失，按 vision 真值确定性注入', {
          file: fp,
          section: card.sectionId,
          bg: card.bgTruth,
        });
      }
    }

    // R-img（2026-09-20）：icon img 无固定尺寸 → 按 vision icon.width/height 补 inline 尺寸
    //   （img 自然尺寸会撑破 flex 槽位，是「旁边卡看不到」的根因）
    const iconW = Number(card.item?.icon?.width) || 0;
    const iconH = Number(card.item?.icon?.height) || 0;
    if (iconW > 0 && iconH > 0) {
      // 找引用真值 icon 文件的 img，且 style 里没有 width 的
      const imgRe = new RegExp(`(<img[^>]*${card.iconTruth}[^>]*>)`, 'g');
      content = content.replace(imgRe, (whole) => {
        if (/width\s*:/i.test(whole)) return whole;
        summary.imgSized = (summary.imgSized || 0) + 1;
        changed = true;
        return whole.replace(/<img /, `<img style="width:${iconW}px;height:${iconH}px;object-fit:contain" `);
      });
    }

    // R-bg：bg-N 文件引用改写为真值（import 路径与模板内 url 同步）
    if (card.bgTruth && /bg-\d+\.png/.test(content)) {
      const wrongBgs = [
        ...new Set([...content.matchAll(/bg-\d+\.png/g)].map((m) => m[0])),
      ].filter((b) => b !== card.bgTruth);
      if (wrongBgs.length > 0) {
        for (const w of wrongBgs) {
          content = content.split(w).join(card.bgTruth);
        }
        summary.bgFixed++;
        changed = true;
        logger?.warn?.('🛡️ D1 R-bg：卡背景图按 vision 真值改写', {
          file: fp,
          section: card.sectionId,
          from: wrongBgs,
          to: card.bgTruth,
        });
      }
    }

    // R-icon：icon-N img src 改写
    if (card.iconTruth && /icon-\d+\.png/.test(content)) {
      const wrongIcons = [
        ...new Set([...content.matchAll(/icon-\d+\.png/g)].map((m) => m[0])),
      ].filter((i) => i !== card.iconTruth);
      if (wrongIcons.length > 0) {
        for (const w of wrongIcons) {
          content = content.split(w).join(card.iconTruth);
        }
        summary.iconFixed++;
        changed = true;
        logger?.warn?.('🛡️ D1 R-icon：卡图标按 vision 真值改写', {
          file: fp,
          section: card.sectionId,
          from: wrongIcons,
          to: card.iconTruth,
        });
      }
    }

    // R-num：数值色改写（找含纯数字文本的 value/number 类规则块）
    if (card.numColor) {
      // 匹配 .xxx-value / .xxx-number 规则块内的 color 声明
      const ruleRe = /(\.[\w-]*(?:value|number)[\w-]*\s*\{[^}]*?\bcolor\s*:\s*)([^;]+);/gi;
      let numChanged = false;
      content = content.replace(ruleRe, (whole, head, colorVal) => {
        // var(--x, #fallback) 取 fallback 比对；直接色值则原样比对
        const fb = colorVal.match(/#\s*([0-9a-f]{3,8})/i);
        const cur = normalizeColor(fb ? `#${fb[1]}` : colorVal);
        if (cur && cur !== card.numColor) {
          numChanged = true;
          return `${head}${card.numColor};`;
        }
        return whole;
      });
      if (numChanged) {
        summary.colorFixed++;
        changed = true;
        logger?.warn?.('🛡️ D1 R-num：数值颜色按 vision 真值改写', {
          file: fp,
          section: card.sectionId,
          to: card.numColor,
        });
      }
    }

    if (changed) result[fp] = content;
  }

  if (summary.bgFixed + summary.colorFixed + summary.iconFixed > 0) {
    logger?.info?.('🛡️ D1 per-card 样式确定性改写完成', summary);
  }
  return { files: result, summary };
}

export default enforceCardVisualTruth;
