import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateVueSfcExpressions } from '../utils/sfc-syntax-validation.js';

/**
 * 🛡️ CODE-023 确定性兜底（2026-11-12 · mc-max-1794464735884-cfe8977a 实锤，根治⑤）。
 *
 * 病灶链：首轮 ChartSection.vue 成功生成并写盘（覆盖度 7/7 ok）→ L0-B 其它 issue 回退
 * engineer 重试 → **重试轮重组文件集合时该文件丢失**，但 index.vue 的标签与 import 保留
 * ⇒ CODE-023「<ChartSection>（缺组件文件）」⇒ 854 字符修复指导两轮无效 ⇒ 重试耗尽 →
 * l0b-fail fail-closed ⇒ 任务 failed。修复轮对 CODE-023 的修复能力实证无效。
 *
 * 兜底（只在「重试耗尽且 hardBlocks 全为 CODE-023」时触发，不放宽其它硬闸）：
 *   ① 从 `.mc-gen/cache/code-chunks/` 找该组件的历史候选（chunk-meta.json 登记倒序），
 *      候选过 `validateVueSfcExpressions` ⇒ 写回 `package/components/<Tag>.vue`；
 *      —— 实证有效：cfe8977a 手工从缓存救回 ChartSection.vue，全包 10/10 编译 PASS。
 *   ② `缺 import` / 臆造标签形态本轮不兜底（保持 fail-closed，不扩大改动面）。
 *
 * 修复后重跑「标签 ↔ import ↔ 文件」三要素复核（与 code-structure-validator :3331
 * 同口径；口径注释同源，禁造第三份语义）。
 */

const VUE_BUILTINS = new Set([
  'RouterView', 'RouterLink', 'KeepAlive', 'Transition',
  'TransitionGroup', 'Suspense', 'Teleport', 'Component', 'Slot',
]);

/** 从 CODE-023 issue.message 提取悬空标签（validator 单一来源产出的 message 解析） */
export function parseDanglingTags(issues) {
  const out = [];
  for (const i of issues || []) {
    if (!i || i.id !== 'CODE-023' || i.severity !== 'BLOCK') continue;
    for (const m of String(i.message || '').matchAll(/<([A-Za-z]\w*)>（([^）]+)）/g)) {
      out.push({ tag: m[1], missing: m[2] });
    }
  }
  return out;
}

/** 三要素复核（与 code-structure-validator CODE-023 同口径） */
export function recountDanglingTags(indexVueContent, files) {
  const compFiles = new Set();
  for (const p of files || []) {
    const m = /package\/components\/([A-Za-z][\w]*)\.vue$/.exec(String(p || ''));
    if (m) compFiles.add(m[1]);
  }
  const templateBody = (String(indexVueContent || '').match(
    /<template>([\s\S]*?)<\/template>/i,
  ) || [])[1] || '';
  const scriptMatch = String(indexVueContent || '').match(
    /<script[^>]*>([\s\S]*?)<\/script>/i,
  );
  const tags = new Set();
  for (const m of templateBody.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    if (!VUE_BUILTINS.has(m[1])) tags.add(m[1]);
  }
  const declared = new Set();
  if (scriptMatch) {
    for (const m of scriptMatch[1].matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) {
      declared.add(m[1]);
    }
  }
  const dangling = [];
  for (const tag of tags) {
    if (/^(BasePanel|(El|Van|Ant|N|AR)[A-Z])/.test(tag)) continue;
    const hasImport = declared.has(tag);
    const hasFile = compFiles.has(tag);
    if (hasImport && hasFile) continue;
    if (hasImport || hasFile) dangling.push({ tag, missing: hasFile ? '缺 import' : '缺组件文件' });
    else dangling.push({ tag, missing: '无组件文件且无 import（臆造标签）' });
  }
  return dangling;
}

function findCachedCandidate(outputPath, tag) {
  try {
    const chunkDir = join(outputPath, '.mc-gen', 'cache', 'code-chunks');
    const relPath = `package/components/${tag}.vue`;
    // ① chunk-meta.json 登记倒序（不误取历史遗留分块）
    const metaPath = join(chunkDir, 'chunk-meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      const entries = (meta && meta.files && meta.files[relPath]) || [];
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const name = entries[i] && entries[i].file;
        if (!name) continue;
        const p = join(chunkDir, name);
        if (!existsSync(p)) continue;
        const raw = readFileSync(p, 'utf-8');
        if (!raw || raw.trim().length < 10) continue;
        if (validateVueSfcExpressions(raw, relPath).valid) return raw;
      }
    }
    // ② 文件名后缀兜底（chunk-meta 缺登记时）
    for (const name of readdirSync(chunkDir)) {
      if (!name.endsWith(`-package_components_${tag}.vue`)) continue;
      const p = join(chunkDir, name);
      const raw = readFileSync(p, 'utf-8');
      if (!raw || raw.trim().length < 10) continue;
      if (validateVueSfcExpressions(raw, relPath).valid) return raw;
    }
  } catch {
    /* 任何异常都视为无候选（保守） */
  }
  return null;
}

/**
 * @returns {{fixed: boolean, actions: string[], remaining: Array<{tag:string,missing:string}>}}
 */
export function tryFixDanglingComponentFiles(outputPath, issues, logger) {
  const actions = [];
  try {
    const tags = parseDanglingTags(issues).filter((d) => d.missing === '缺组件文件');
    if (tags.length === 0) return { fixed: false, actions, remaining: [] };
    const indexPath = join(outputPath, 'package', 'index.vue');
    if (!existsSync(indexPath)) return { fixed: false, actions, remaining: tags };
    for (const { tag } of tags) {
      const candidate = findCachedCandidate(outputPath, tag);
      if (!candidate) {
        actions.push(`<${tag}> 缓存无合格候选，保持 fail-closed`);
        continue;
      }
      const target = join(outputPath, 'package', 'components', `${tag}.vue`);
      writeFileSync(target, candidate, 'utf-8');
      actions.push(`<${tag}> 已从 code-chunks 缓存补建（${candidate.length}B）`);
      logger?.warn?.(`🛡️ CODE-023 兜底：<${tag}> 缺组件文件，已从缓存补建 package/components/${tag}.vue`);
    }
    // 三要素复核
    const files = [];
    const compsDir = join(outputPath, 'package', 'components');
    if (existsSync(compsDir)) {
      for (const n of readdirSync(compsDir)) {
        if (n.endsWith('.vue')) files.push(`package/components/${n}`);
      }
    }
    const remaining = recountDanglingTags(readFileSync(indexPath, 'utf-8'), files);
    const fixed =
      remaining.length === 0 ||
      remaining.every((d) => d.missing !== '缺组件文件');
    return { fixed, actions, remaining };
  } catch (err) {
    logger?.warn?.(`🛡️ CODE-023 兜底异常（保守放行原 fail-closed 链）：${err?.message || err}`);
    return { fixed: false, actions, remaining: [] };
  }
}

export default tryFixDanglingComponentFiles;
