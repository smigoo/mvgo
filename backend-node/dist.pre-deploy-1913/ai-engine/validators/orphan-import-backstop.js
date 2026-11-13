import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildVarToMapping,
  collectDeclaredBindings,
  isResourceVarMounted,
  resolveResourceDomMapping,
} from '../utils/resource-import-guard.js';

/**
 * 🛡️ CODE-022 确定性兜底（2026-11-12 · mc-max-1794476159098-97af5197 实锤，根治⑧）。
 *
 * 病灶链：LLM 无视 prompt 资源变量契约，自造「文件名派生 + bg 前缀」变量名
 *   （实锤形态 `bgbg_m35` / `bgbg_m36` ← `bg-_m-35.png` / `bg-_m-36.png`）写进 import：
 *   - `bgbg_m35` 恰好挂上了 base-panel（活的，视觉正常）；
 *   - `bgbg_m36` import 后 0 引用 → CODE-022「资源变量未挂载」硬闸 BLOCK。
 * pre-write 修复器 `pruneUnmountedResourceImports` 只迭代 varToMapping（契约名），
 * 臆造名不在其列 ⇒ 永不自愈 ⇒ 修复轮逐字复现同一错 ⇒ 重试耗尽 ⇒ fail-closed
 * （与 2026-09-29「门禁 BLOCK / 修复器不删」死锁同族，只是死锁面从注释换成臆造名）。
 *
 * 兜底（只在「重试耗尽且 hardBlocks 全为 CODE-022」时触发，不放宽其它硬闸）：
 *   ① alias 归位：非契约名**且已挂载**的图片 import，按 resourceFile basename 关联到
 *      契约变量名（assignedVarName 优先），import 行 + 全文词边界引用统一改名 —— 保留挂载，
 *      消灭「图挂了但用臆造名」导致下游资源台账（RES-UNUSED / 挂载计划幂等）按契约名误判未用。
 *      撞名守卫：契约名已被本文件其它声明占用 ⇒ 不改名（保留原样，宁可不治也不制造重复声明）。
 *   ② prune：仍零引用的图片 import（契约名 / 臆造名一视同仁）确定性删除 import 行，
 *      顺带删「整行都是注释且提到该变量」的假陈述行（与 pruneUnmountedResourceImports 同法）。
 *   ③ 复核：recountUnmountedResourceImports（与门禁 findUnmountedResourceVars 同口径）
 *      归零才算 fixed；仍有残余 ⇒ 保守放行原 fail-closed 链。
 *
 * mapping 缺失（内存 + `.mc-gen/resource-dom-mapping.json` 均无）时 ① 退化跳过、② 仍可执行
 * （CODE-022 本身就与 mapping 无关：只看「图片 import + 零引用」）。
 */

/** 图片 import 识别正则（与 code-structure-validator#findUnmountedResourceVars 逐字同口径，禁造第三份）；
 *  仅追加路径捕获组 m[2]（alias 需按 resourceFile basename 关联契约名），不改变匹配语义。 */
const IMAGE_IMPORT_SRC =
  "import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*['\"]([^'\"]*(?:bg|icon|img)[\\w-]*\\.(?:png|jpe?g|svg|gif|webp))['\"]";

const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 复核「还有哪些图片 import 变量未挂载」（与 code-structure-validator#findUnmountedResourceVars
 * 同口径：同 import 正则 + isResourceVarMounted 单一事实源）。
 * @param {string} content .vue 全文
 * @returns {string[]}
 */
export function recountUnmountedResourceImports(content) {
  const out = [];
  if (typeof content !== 'string' || !content) return out;
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const scriptBody = scriptMatch ? scriptMatch[1] : '';
  if (!scriptBody) return out;
  const re = new RegExp(IMAGE_IMPORT_SRC, 'gi');
  let m;
  while ((m = re.exec(scriptBody))) {
    if (!isResourceVarMounted(content, m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * 单文件自愈：① 臆造名 alias 回契约名（保留挂载）；② 零引用孤儿 import 确定性删除。
 * 纯函数、幂等；不依赖 mapping（无 mapping 时只做 ②）。
 *
 * @param {string} content .vue 全文
 * @param {Array|null} resourceDomMapping 资源映射
 * @returns {{content:string, changed:boolean, aliases:Array<{from:string,to:string}>, pruned:string[], skipped:Array<{name:string,contract:string,reason:string}>}}
 */
export function healOrphanResourceImports(content, resourceDomMapping) {
  const result = { content, changed: false, aliases: [], pruned: [], skipped: [] };
  if (typeof content !== 'string' || !content) return result;

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return result;

  // 契约名表：resourceFile basename → 契约变量名（assignedVarName 优先，其次 semanticVarName）
  const fileToContract = new Map();
  const contractNames = new Set();
  const { available } = buildVarToMapping(Array.isArray(resourceDomMapping) ? resourceDomMapping : []);
  for (const m of available) {
    const base = String(m.resourceFile || '').split(/[\\/]/).pop();
    const v = m.assignedVarName || m.semanticVarName;
    if (base && v && !fileToContract.has(base)) fileToContract.set(base, v);
    if (v) contractNames.add(v);
  }

  // 收集本文件全部图片 import（同门禁口径）
  const imports = [];
  const re = new RegExp(IMAGE_IMPORT_SRC, 'gi');
  let im;
  while ((im = re.exec(scriptMatch[1]))) imports.push({ name: im[1], path: im[2] });
  if (imports.length === 0) return result;

  let next = content;

  // ── ① alias 归位：非契约名且已挂载 → 改名为契约名（保留挂载）──
  for (const { name, path } of imports) {
    if (contractNames.has(name)) continue;
    if (!isResourceVarMounted(next, name)) continue; // 零引用交给 ② 删
    const base = String(path).split(/[\\/]/).pop();
    const contract = fileToContract.get(base);
    if (!contract || contract === name) continue;
    // 撞名守卫：剔除本 import 行后契约名仍被声明 ⇒ 改名会制造重复声明 ⇒ 跳过
    const withoutImport = next.replace(
      new RegExp(`import\\s+${escapeRe(name)}\\s+from[^\\n]*`),
      '',
    );
    if (collectDeclaredBindings(withoutImport).has(contract)) {
      result.skipped.push({ name, contract, reason: 'contract-declared' });
      continue;
    }
    next = next.replace(new RegExp(`\\b${escapeRe(name)}\\b`, 'g'), contract);
    result.aliases.push({ from: name, to: contract });
  }

  // ── ② prune：零引用图片 import 确定性删除（契约名 / 臆造名一视同仁）──
  const re2 = new RegExp(IMAGE_IMPORT_SRC, 'gi');
  const names2 = new Set();
  const script2 = (next.match(/<script[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '';
  while ((im = re2.exec(script2))) names2.add(im[1]);
  for (const name of names2) {
    if (isResourceVarMounted(next, name)) continue;
    const esc = escapeRe(name);
    const lineRe = new RegExp(
      `^[ \\t]*import[ \\t]+${esc}[ \\t]+from[ \\t]*['"][^'"]*['"][ \\t]*;?[ \\t]*\\n?`,
      'm',
    );
    next = next.replace(lineRe, '');
    // 顺带删「整行都是注释且提到该变量」的假陈述行（与 pruneUnmountedResourceImports 同法）
    next = next.replace(new RegExp(`^[ \\t]*//[^\\n]*\\b${esc}\\b[^\\n]*\\n?`, 'gm'), '');
    result.pruned.push(name);
  }

  next = next.replace(/\n{3,}/g, '\n\n');
  result.changed = next !== content;
  result.content = next;
  return result;
}

/**
 * hard-gate 出口兜底入口：对所有 CODE-022 BLOCK 指到的 .vue 文件做确定性自愈并复核。
 *
 * @param {string} outputPath 产物根目录
 * @param {Array} issues L0-B issues
 * @param {object} [logger]
 * @returns {{fixed:boolean, actions:string[], remaining:Array<{file:string, vars:string[]}>}}
 */
export function tryFixOrphanResourceImports(outputPath, issues, logger) {
  const actions = [];
  try {
    const targets = [];
    const seen = new Set();
    for (const i of issues || []) {
      if (!i || i.severity !== 'BLOCK' || !/^CODE-022/.test(String(i.id || ''))) continue;
      const f = String(i.file || '').replace(/\\/g, '/');
      if (!f.endsWith('.vue') || seen.has(f)) continue;
      seen.add(f);
      targets.push(f);
    }
    if (targets.length === 0) return { fixed: false, actions, remaining: [] };

    // mapping 从磁盘兜底解析（`.mc-gen/resource-dom-mapping.json`）；缺失时 ① 跳过、② 仍可执行
    const mapping = resolveResourceDomMapping(null, outputPath);

    const remaining = [];
    for (const rel of targets) {
      const abs = join(outputPath, rel);
      if (!existsSync(abs)) {
        remaining.push({ file: rel, vars: ['<文件缺失>'] });
        continue;
      }
      const raw = readFileSync(abs, 'utf-8');
      const healed = healOrphanResourceImports(raw, mapping);
      if (healed.changed) writeFileSync(abs, healed.content, 'utf-8');
      for (const a of healed.aliases) {
        actions.push(`${rel}: 臆造名 ${a.from} → 契约名 ${a.to}（保留挂载）`);
      }
      for (const p of healed.pruned) actions.push(`${rel}: 孤儿 import ${p} 已确定性删除`);
      for (const s of healed.skipped) {
        actions.push(`${rel}: ${s.name} → ${s.contract} 跳过（${s.reason}）`);
      }
      const still = recountUnmountedResourceImports(healed.content);
      if (still.length > 0) {
        remaining.push({ file: rel, vars: still });
      }
    }
    const fixed = remaining.length === 0;
    if (fixed) {
      logger?.warn?.('🛡️ CODE-022 兜底成功：孤儿资源 import 已确定性清理', { actions });
    }
    return { fixed, actions, remaining };
  } catch (err) {
    logger?.warn?.(`🛡️ CODE-022 兜底异常（保守放行原 fail-closed 链）：${err?.message || err}`);
    return { fixed: false, actions, remaining: [] };
  }
}

export default tryFixOrphanResourceImports;
