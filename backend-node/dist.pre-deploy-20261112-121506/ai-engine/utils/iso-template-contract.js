/**
 * 🧬 刀 66-P1（2026-11-12）：同构段「单模板参数化」契约文本 —— **mc/max 与 vue3/max 唯一来源**。
 *
 * 为什么抽出来：此前契约只写在 microcode/prompt-builder.js#buildIsoTemplateContract，
 * vue3 侧没有；若各写一份，theme props / 列数 / 命名规则会随迭代漂移（本次四象限同步硬约束）。
 * 两侧 prompt builder 只负责「什么时候插入」，文本一律由本模块生成。
 *
 * ⚠️ 契约条款必须与 isomorphic-section-group.js#validateIsoTemplateProps、
 *    #renderIsoWrapperSfc、index-repeat-group-rewrite.js 的字段一一对应，
 *    否则「prompt 要求 A、门禁校验 B」会静默假绿。
 */

/**
 * @param {{groupSize?:number, columns?:number, hasTheme?:boolean}} iso 同构组事实
 * @param {string} file 代表模板文件名（仅用于提示文案）
 * @returns {string} prompt 契约段；无同构组时返回 ''
 */
export function buildIsoTemplateContractText(iso, file = '本文件') {
  if (!iso || !iso.groupSize) return '';
  const out = [];
  out.push('\n## 🧬 同构段模板契约（本文件是 N 个同构段的唯一模板 · 强制）');
  out.push('');
  out.push(
    `本文件 \`${file}\` 对应的 section 与其他 ${iso.groupSize - 1} 个兄弟段**结构完全同构**` +
      `（系统已判定）。兄弟段**不会各自生成**——\`index.vue\` 会用 \`v-for\` 遍历一份段数据数组、` +
      `反复渲染本模板（并转发 props），因此本文件必须是**参数化模板**，任何硬编码都会被复制 ${iso.groupSize} 份：`,
  );
  out.push('');
  const props = [
    '`title`（String, 段标题）',
    '`icon`（String, 图标图片地址，可默认 \'\'）',
    '`items`（Array&lt;{ name: string, value: string }&gt;, 段内条目）',
  ];
  if (iso.hasTheme) {
    props.push(
      '`theme`（Object&lt;{ bg, accent, zeroColor }&gt;, 本段配色真值，**必须声明并实际消费**）',
    );
  }
  out.push(`1. **必须声明 props**（defineProps）：${props.join('、')}。`);
  out.push(
    `2. **头部**用 \`title\` + \`icon\` 渲染（\`<img :src="icon">\`）；**主体**用 \`v-for="item in items"\` 渲染条目，` +
      `条目文案取 \`item.name\`、条目数值取 \`item.value\`（\`value\` 可能为空串 ⇒ 用 \`v-if\` 决定渲不渲染该槽）；` +
      `**禁止**在本文件内联任何条目文案数组、**禁止** import 图片资源（icon 由 props 传入）。`,
  );
  if (iso.hasTheme) {
    out.push(
      `2b. **配色必须由 \`theme\` 驱动，禁止硬编码颜色**：段底色用 \`theme.bg\`、数值/高亮色用 \`theme.accent\`、零值色用 \`theme.zeroColor\`。` +
        `推荐在根元素写 \`:style="{ '--iso-bg': theme?.bg || '', '--iso-accent': theme?.accent || '', '--iso-zero': theme?.zeroColor || '' }"\`，` +
        `样式里用 \`var(--iso-accent)\`；\`theme\` 可能为空对象 ⇒ 必须给回退值，禁止写死任一段的配色（否则 ${iso.groupSize} 个段会被刷成同一套颜色）。`,
    );
  }
  out.push(
    `3. **根元素必须带 \`v-bind="$attrs"\`**（使用方经 fallthrough 注入各段 data-section-id）；样式与结构按本段 Figma 真值实现（下方真值表仍有效）。`,
  );
  // 🛡️ 2026-11-06（245878e6 实锤）：列数由系统归一后**直接下发**，不让模型从
  //   `horizontal-4-columns` 之类自由文本里猜 —— 实测三个同构段各自猜出三种结果
  //   （扁平文本 / 自造嵌套子组 / 正确网格）。
  const cols = Number(iso.columns);
  if (Number.isInteger(cols) && cols >= 2) {
    out.push(
      `4. **条目排布**：本模板主体是 **${cols} 列** 的重复条目区（Figma 真值）。容器用网格或等分换行实现，` +
        `每个条目是**独立单元**；**禁止**把名称与数值拼成同一段文本（如 \`{{ item.name }}{{ item.value }}\` 连排）——` +
        `名称与数值必须落在**不同的元素**里（可用 grid 的两个列/上下两行），否则渲染出来是「华为技术8台」这种粘连形态。`,
    );
  } else {
    out.push(
      `4. **条目排布**：每个条目是**独立单元**；**禁止**把名称与数值拼成同一段文本（如 \`{{ item.name }}{{ item.value }}\` 连排），` +
        `名称与数值必须落在不同的元素里。`,
    );
  }
  out.push(
    `5. 本模板会被 ${iso.groupSize} 个段复用，请按「最通用、最贴真值」的形态实现，不要为单一段做特殊分支。`,
  );
  return out.join('\n') + '\n';
}

/** chunk 适配（microcode/vue3 两侧共用）：只读 chunk.isoContract。 */
export function buildIsoTemplateContract(chunk) {
  const iso = chunk?.isoContract;
  if (!iso || !iso.groupSize) return '';
  const file = (chunk.files || [])[0] || '本文件';
  return buildIsoTemplateContractText(iso, file);
}
