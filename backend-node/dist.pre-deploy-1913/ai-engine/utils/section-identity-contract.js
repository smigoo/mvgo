/**
 * 🎯 段身份契约（单一事实源）— 2026-11-13 抽离
 *
 * ## 为什么抽出来（治本 · 生产实锤 mc-max-1794462377352-3d6fa463）
 *
 * 该实现原先**只**住在 `roles/microcode/prompt-builder.js` 里 ⇒ **只有首轮 prompt 拿得到**。
 * 而 `utils/retry-prompt.js` 的**精简重试 prompt** 完全不包含它 ⇒：
 *
 *   首轮 LLM 输出 JSON 解析失败（parse_failure）
 *     → 重试走 buildRetryPrompt（只有「目标文件清单 + 其它文件片段 + 错误说明」，实测 1972 字符）
 *     → 重试时 LLM **既不知道本文件负责哪个 section、也不知道本段有哪些业务文案**
 *     → 输出最小合规产物 `<div ...><slot /></div>`（**空壳组件**）
 *     → 空壳静默落盘（无检测、无拦截）⇒ 页面整块内容消失
 *
 * 实锤：该任务的 `package/components/ContentSection.vue`（= section `1:762`「排查计划 6/7」+ 车辆图标）
 * 就是这样一个空壳 ⇒ 设计稿里的「排查计划 6/7」整块在产物中消失。
 *
 * ## 抽到 utils 的两个理由
 *   ① `prompt-builder.js` 已经 import `utils/retry-prompt.js` ⇒ retry-prompt **不能再 import prompt-builder**
 *      （会成环，ESM 初始化顺序不可靠）⇒ 契约实现必须下沉到 `utils/`；
 *   ② 首轮与重试**共用同一份实现** ⇒ 文案真值口径零漂移（同一处 `_sectionScope`）。
 *
 * ## 数据源（零漂移）
 *   只读 `chunk.scopedInput._sectionScope`（由 `buildSubcomponentScopedInput` 在**映射反查命中**时写入）：
 *   - `id`             本文件唯一负责的 section id（根元素必须带 `data-section-id`）
 *   - `title`          段标题
 *   - `componentName`  系统分配的组件名
 *   - `truthTexts`     **本段真值文案全集**（由 `collectSectionTruthTexts` + `collectNodeTexts` 采集，
 *                      读的是 Figma 节点的 `characters` ⇒ 占位图层名（「指标名称」「50」）不丢文案）
 *
 * 零漂移边界：index.vue / template / style 等 chunk 没有 `_sectionScope` ⇒ 返回空串（行为与抽离前逐字一致）。
 */

/**
 * @param {object} chunk - 分块描述（含 files / scopedInput._sectionScope）
 * @returns {string} 契约文本；无 `_sectionScope` 时返回空串
 */
export function buildSectionIdentityContract(chunk) {
  const scope = chunk?.scopedInput?._sectionScope;
  if (!scope || scope.id == null || scope.id === '') return '';
  const id = String(scope.id);
  const name = String(scope.componentName || '');
  const file = (chunk.files || [])[0] || name;
  const truths = Array.isArray(scope.truthTexts) ? scope.truthTexts : [];
  const out = [];
  out.push('\n## 🎯 段身份契约（本文件唯一负责的段 · 强制）');
  out.push('');
  out.push(
    `本文件 \`${file}\` 只负责 section \`${id}\`${
      scope.title ? `（标题「${scope.title}」）` : ''
    }${name ? `，系统分配组件名 \`${name}\`` : ''}。`,
  );
  out.push('');
  out.push(
    `1. 本文件**根元素**必须带 \`data-section-id="${id}"\`（逐字照抄；禁止改写该 id、禁止改用其他段的 id）。`,
  );
  if (truths.length > 0) {
    out.push(
      `2. 本文件允许渲染的**全部业务文案**＝下列真值（逐字照抄；禁止增删改、禁止拼接、禁止臆造同义文案）：`,
    );
    for (const t of truths) out.push(`   - \`${t}\``);
  } else {
    out.push(
      `2. 系统未给出本段真值文案 ⇒ 只实现结构与样式，**禁止**自行编造任何业务文案。`,
    );
  }
  out.push(
    `3. **禁止渲染目标段之外的任何内容**：其他 section 的文案 / 图表 / 列表项 / 统计数字 / 分页一律不得出现在本文件——跨段渲染会让同一份内容在页面上重复出现（COMP-001 / COMP-002 判失败）。`,
  );
  out.push(
    `4. 🚫 **禁止输出空壳**：模板里必须有本段的实际内容（文案 / 图表 / 图片 / 子元素）。只写一个根 \`<div>\` 加 \`<slot />\`、正文为空 ⇒ 判定为**生成失败**（本文件会被丢弃并重试）。`,
  );
  return out.join('\n') + '\n';
}
