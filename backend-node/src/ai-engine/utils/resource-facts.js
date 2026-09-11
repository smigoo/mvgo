/**
 * @file resource-facts.js — 🛡️ P1.7（2026-09-11）：**资源事实源 + 资源契约（单一实现）**。
 *
 * 事故（mc-max-1789096764029-13890774）：
 *   mapping 的变量名与模型引用**完全一致**（icon1…icon14 / bg1…bg14，来自 assignedVarName），
 *   但注入侧只认「模板里的可识别使用形态」→ **script 内引用（`const deviceIcons=[icon3,…]`）
 *   完全看不见** → 只注入了 icon1/icon3/icon14 三个 import，模型却引用 12 个
 *   → 运行时 `icon4 is not defined` → 整组件渲染失败。
 *   兜底 T08 `stripUndefinedResourceRefs` 同样只扫模板 → 也没能拦住。
 *
 * 本模块把「资源变量的引用采集」与「资源契约校验」收敛为一处（模板 + script 双覆盖），
 * 供注入侧（引用驱动补齐 import）、T08 兜底、产物不变量 I8、门禁 CODE-025 共用。
 *
 * jest 安全：无 import.meta。
 */

import { extractSfcTemplate } from './sfc-template-extractor.js';

/** 资源变量命名前缀（与 model/prompt 约定一致：bg1 / icon2 / img3 …） */
export const RESOURCE_VAR_RE = /^(bg|icon|img|image|pic|photo|avatar)/i;

function isResourceVarName(name = '') {
  return RESOURCE_VAR_RE.test(String(name));
}

/**
 * 采集 SFC 中的资源变量引用，**模板与 script 双覆盖**。
 * script 侧排除：import 声明处、以及 const/let/var 声明处（那属于「定义」而非「引用」）。
 * @param {string} sfc
 * @returns {{ template: Set<string>, script: Set<string>, all: Set<string> }}
 */
export function collectResourceVarRefsFromSfc(sfc = '') {
  const template = new Set();
  const script = new Set();
  const src = String(sfc);

  // ——— 模板：${var} / :src="var" / 拼接 'url(' + var + ')' / url(var) ———
  const tpl = extractSfcTemplate(src) || '';
  for (const m of tpl.matchAll(
    /\$\{\s*([A-Za-z_$][\w$]*)\s*\}|:src="\s*([A-Za-z_$][\w$]*)\s*"|\+\s*([A-Za-z_$][\w$]*)\s*\+|url\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
  )) {
    const name = m[1] || m[2] || m[3] || m[4];
    if (name && isResourceVarName(name)) template.add(name);
  }

  // ——— script：标识符引用（含数组/对象字面量、函数内使用） ———
  const scriptM = src.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptM) {
    let body = scriptM[1];
    const declared = new Set();
    // 🛡️ 先剥离 import 语句与字符串字面量：否则 import 路径里的 `images` / `icon` / `bg` 等
    //    单词会被误判成「引用的资源变量」（实测产生 R2 幽灵引用误报）。
    //    模板字面量保留其 `${…}` 插值（插值里可能有真实引用）。
    for (const m of body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
    for (const m of body.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
      for (const piece of m[1].split(',')) {
        const name = piece.trim().split(':').pop().trim();
        if (name) declared.add(name);
      }
    }
    body = body.replace(
      /import\s+(?:\{[\s\S]*?\}|[A-Za-z_$][\w$]*)(?:\s*,\s*(?:\{[\s\S]*?\}|[A-Za-z_$][\w$]*))?\s+from\s*['"][^'"]*['"]/g,
      ' ',
    );
    body = body.replace(/'[^'\n]*'|"[^"\n]*"/g, ' '); // 普通字符串字面量
    body = body.replace(/`([^`]*)`/g, (_m, inner) =>
      (String(inner).match(/\$\{[^}]*\}/g) || []).join(' '),
    ); // 模板字面量 → 仅保留插值
    // 去注释，避免注释里的示例名被当引用
    body = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const name = m[1];
      if (!isResourceVarName(name)) continue;
      if (declared.has(name)) continue;
      script.add(name);
    }
  }

  const all = new Set([...template, ...script]);
  return { template, script, all };
}

/**
 * 采集产物级资源引用。
 * @param {Object<string,{path:string,content:string}|string>|Object<string,string>} files
 * @returns {{ byFile: Object<string,{template:Set<string>,script:Set<string>,all:Set<string>}>, all: Set<string> }}
 */
export function collectResourceRefs(files = {}) {
  const list = Array.isArray(files)
    ? files
    : Object.entries(files || {}).map(([path, content]) => ({ path, content }));
  const byFile = {};
  const all = new Set();
  for (const f of list) {
    const p = String(f?.path || '');
    const c = f?.content;
    if (!/\.vue$/i.test(p) || typeof c !== 'string') continue;
    const refs = collectResourceVarRefsFromSfc(c);
    byFile[p] = refs;
    for (const n of refs.all) all.add(n);
  }
  return { byFile, all };
}

/**
 * 构建资源事实。
 * @param {Object} params
 * @param {Array} params.mapping resourceDomMapping（含 assignedVarName / resourceFile / name）
 * @param {Object<string,string>} params.files 产物文件表
 * @returns {{
 *   varToFile: Object<string,string>,    变量名 → 资源文件名
 *   mappingVars: Set<string>,            事实源登记的资源变量
 *   importedByFile: Object<string,Set<string>>,
 *   refsByFile: Object,
 *   missingImports: Array<{path:string,varName:string,file:string}>,
 *   unresolved: Array<{path:string,varName:string}>,
 *   orphanImports: Array<{path:string,varName:string}>
 * }}
 */
export function buildResourceFacts({ mapping = [], files = {} } = {}) {
  const varToFile = {};
  const mappingVars = new Set();
  for (const m of mapping || []) {
    const varName = m?.assignedVarName || m?.semanticVarName;
    const file = String(m?.resourceFile || '').split('/').pop();
    if (!varName || !file) continue;
    varToFile[varName] = file;
    mappingVars.add(varName);
  }

  const importedByFile = {};
  for (const [p, c] of Object.entries(files || {})) {
    if (!/\.vue$/i.test(p) || typeof c !== 'string') continue;
    const imported = new Set();
    const scriptM = c.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptM) {
      for (const m of scriptM[1].matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]*(?:images|assets)[^'"]*['"]/g)) {
        imported.add(m[1]);
      }
    }
    importedByFile[p] = imported;
  }

  const refs = collectResourceRefs(files);
  const missingImports = [];
  const unresolved = [];
  for (const [p, r] of Object.entries(refs.byFile)) {
    const imported = importedByFile[p] || new Set();
    for (const varName of r.all) {
      if (imported.has(varName)) continue;
      if (varToFile[varName]) missingImports.push({ path: p, varName, file: varToFile[varName] });
      else unresolved.push({ path: p, varName });
    }
  }

  const allImported = new Set();
  for (const s of Object.values(importedByFile)) for (const n of s) allImported.add(n);
  const orphanImports = [];
  for (const [p, s] of Object.entries(importedByFile)) {
    for (const varName of s) {
      if (!mappingVars.has(varName)) orphanImports.push({ path: p, varName });
    }
  }

  return {
    varToFile,
    mappingVars,
    importedByFile,
    refsByFile: refs.byFile,
    allImported,
    missingImports,
    unresolved,
    orphanImports,
  };
}

/**
 * 资源契约校验（单一实现；门禁 CODE-025 与不变量 I8 共用）。
 *   R1 引用了 mapping 已知变量但未 import → error（注入漏项，必然 ReferenceError）
 *   R2 引用了 mapping 未知变量 → error（臆造/幽灵引用）
 *   R3 import 了 mapping 未登记的变量 → warn（孤儿 import，可能同名漂移）
 * @returns {Array<{id:string, code:'R1'|'R2'|'R3', severity:'error'|'warn', file:string, message:string}>}
 */
export function checkResourceContract(files = {}, facts = null) {
  const f = facts || buildResourceFacts({ mapping: [], files });
  const out = [];
  for (const g of f.missingImports || []) {
    out.push({
      id: 'RESOURCE-R1',
      code: 'R1',
      severity: 'error',
      file: g.path,
      message: `资源变量 \`${g.varName}\` 被引用但未 import（事实源已登记 → ${g.file}）：注入漏项，运行时会抛 \`${g.varName} is not defined\``,
    });
  }
  for (const g of f.unresolved || []) {
    out.push({
      id: 'RESOURCE-R2',
      code: 'R2',
      severity: 'error',
      file: g.path,
      message: `资源变量 \`${g.varName}\` 被引用但既无 import、也不在资源事实源中（幽灵引用）：运行时必然报错`,
    });
  }
  for (const g of f.orphanImports || []) {
    out.push({
      id: 'RESOURCE-R3',
      code: 'R3',
      severity: 'warn',
      file: g.path,
      message: `import 的资源变量 \`${g.varName}\` 未在资源事实源登记（可能命名漂移）`,
    });
  }
  const seen = new Set();
  return out.filter((v) => {
    const k = `${v.code}|${v.file}|${v.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
