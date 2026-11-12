/**
 * @file sfc-template-extractor.js — 🛡️ 治本（2026-09-11，c-device-monitor-nodvhsu2-0ca84358 实锤）：
 * SFC 模板区提取的**单一事实源**。
 *
 * 🔴 家族缺陷（同族三例实锤）：`/<template>([\s\S]*?)<\/template>/i` 这类 lazy 正则在
 * 根 `<template>` 内嵌具名插槽（`<template #header-right>…</template>`）时会**提前截断**——
 * 插槽闭合之后的真实标签全部丢失。三例事故：
 *   ① resource-mounter.pruneDeadSubComponentImports → 主内容子组件 import 被误删（悬空标签）
 *   ② microcode-engineer._unionTemplateTagSubComponents → union 只看到插槽区 → 子组件文件漏生成
 *   ③ root-container-normalizer.detectContentRootClass / artifact-invariants（已各自修过）
 *
 * 正解：首个 `<template>` 起始标签到 `<script`/`<style` 边界之间整段，再剥 HTML 注释。
 * ⚠️ 刻意**不剥离**具名插槽块：插槽内组件标签是真实引用（必须 import 才能渲染）。
 *    需要剥插槽的场景（如根容器识别防装饰元素误判）由调用方自行剥离。
 *
 * jest 安全：本文件不得使用 import.meta（sfc-semantics 陷阱——jest 加载含 import.meta
 * 的模块会 "Cannot use 'import.meta' outside a module"）。
 */

/**
 * 提取 SFC 模板区文本（含具名插槽、不含 HTML 注释）。
 * @param {string} vueContent .vue 单文件组件全文
 * @returns {string|null} 模板区文本；无模板返回 null
 */
export function extractSfcTemplate(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') return null;
  const tplStart = vueContent.search(/<template\b[^>]*>/i);
  if (tplStart < 0) return null;
  const rest = vueContent.slice(tplStart);
  const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
  const region = endIdx > 0 ? rest.slice(0, endIdx) : rest;
  return region.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * 剥离具名插槽块（<template #x> / <template v-slot:x> … </template>）。
 * 仅用于「防止插槽内装饰元素被误判为结构根」等场景；标签/引用检测不要用。
 * @param {string} templateBody
 * @returns {string}
 */
export function stripNamedSlotBlocks(templateBody) {
  return String(templateBody || '').replace(
    /<template\s+(?:#|v-slot:)[^>]*>[\s\S]*?<\/template\s*>/gi,
    '',
  );
}

/**
 * 提取 SFC 模板区 + 可选剥具名插槽。
 * @param {string} vueContent
 * @param {{ stripSlots?: boolean }} [options]
 * @returns {string|null}
 */
export function extractSfcTemplateRegion(vueContent, options = {}) {
  const tpl = extractSfcTemplate(vueContent);
  if (tpl === null) return null;
  return options?.stripSlots ? stripNamedSlotBlocks(tpl) : tpl;
}
