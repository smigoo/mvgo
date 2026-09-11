/**
 * @file artifact-invariants.js — 🛡️ R2-2 治本（2026-09-11）：
 * 生成产物「六条不变量」静态校验。动机：同族缺陷反复复发（内容根塌陷、悬空组件标签、
 * 重复 tabs、aspect-ratio 丢失、类名缺失、资源 404），单点修复总会被下一条生成路径绕过 ——
 * 改为把「正确产物必须满足的结构性质」固化为可执行校验，落盘后必跑、违规必报。
 *
 * 六条不变量（对应 docs/0911-管线复发问题根治方案.md R2-2）：
 *   I1 内容根高度      —— 内容根（-slot-con/-root）必须有 height 声明，不得仅靠 flex 填充
 *   I2 标签↔import↔文件三向对齐 —— 模板组件标签必须有文件+import；无 import 的文件、无文件的 import 均违规
 *   I3 tabs 唯一性     —— 模板中 tabs 类 section 标签（/tab/i，非 UI 库）≥2 个 → 违规（cfb53488 实锤）
 *   I4 根容器形态锚定  —— 内容根须有 aspect-ratio，或 width+height 双全（缺一即形态失锁）
 *   I5 类名对齐（warn）—— index.vue 模板引用的组件前缀类必须在任一样式源声明过
 *   I6 资源挂载对齐    —— .vue import 的图片/样式 url() 引用的文件必须存在于产物
 *
 * 输入：{ [relativePath]: content } 产物文件 map（与 engineer snapshotFiles 同构）。
 * 输出：{ violations: [{id, severity, file, message}], passed, summary }。
 * 纯函数、无 IO、不抛异常 —— 单条不变量内部出错只记 violation（fail-closed 于可观测）。
 */

import { detectContentRootClass } from './root-container-normalizer.js';
import {
  collectFileClassFact,
  splitModifier,
  hasModifier,
  normalizeModifierSuffix,
  MODIFIER_ALIASES,
} from './class-facts.js';
import { extractSfcTemplate } from './sfc-template-extractor.js';
import { collectClassFacts } from './class-facts.js';
import { checkClassNameContract } from './classname-contract.js';
import { buildResourceFacts, checkResourceContract } from './resource-facts.js';

const VUE_BUILTINS = new Set([
  'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense',
  'component', 'slot',
]);
const SKIP_TAG_RE = /^(BasePanel|(El|Van|Ant|N|AR)[A-Z])/;

/**
 * 产物边界：只对「真实落盘产物」判定。
 * 动机（2026-09-11 实测）：`.mc-gen/cache/code-chunks/N-package_index.vue` 是**分片片段**
 * （index.vue 被切成多段喂给模型/落盘），单看任一片段必然「有标签无 import」——对片段跑 I2
 * 三向对齐必产生同源误报（实测 5 error / 31 warn 全是这一类）。隐藏目录（.开头）、
 * node_modules、.git、dist 均非产物面。
 */
function isArtifactPath(p) {
  if (!p || typeof p !== 'string') return false;
  return !p.split('/').some((s) => s === 'node_modules' || s === 'dist' || s.startsWith('.'));
}

/** CSS 块扫描：返回选择器含 rootCls 的顶层块体（不含嵌套子块体，够用即可） */
function findRootStyleBody(styles, rootCls) {
  const esc = String(rootCls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\})\\s*([^{}]*\\.${esc}\\b[^{}]*)\\{([^{}]*)\\}`, 'g');
  let m;
  const bodies = [];
  while ((m = re.exec(styles))) bodies.push({ selector: m[1], body: m[2] });
  return bodies;
}

/** 收集所有样式源（less/css + .vue <style>）拼接体 */
function collectStyleSources(files) {
  let all = '';
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.(less|css)$/i.test(p)) all += `\n/*${p}*/\n${c}`;
    else if (/\.vue$/i.test(p)) {
      const m = c.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (m) all += `\n/*${p}*/\n${m.join('\n')}`;
    }
  }
  return all;
}

/** ——— I1 + I4：内容根高度与形态锚定 ——— */
function checkRootContainer(files, violations) {
  const idxContent = files['package/index.vue'] || files['index.vue'];
  if (typeof idxContent !== 'string') {
    violations.push({ id: 'I1', severity: 'error', file: 'package/index.vue', message: 'index.vue 缺失，无法定位内容根' });
    return;
  }
  const rootCls = detectContentRootClass(idxContent);
  if (!rootCls) return; // 无内容根（自由形态组件）→ 不适用
  const styles = collectStyleSources(files);
  const blocks = findRootStyleBody(styles, rootCls);
  if (blocks.length === 0) {
    violations.push({ id: 'I1', severity: 'error', file: 'styles', message: `内容根 .${rootCls} 在任何样式源中均无规则块` });
    return;
  }
  const merged = blocks.map((b) => b.body).join(';');
  const hasHeight = /(^|[\s;{])height\s*:/.test(merged);
  const hasDeadFlexOnly = !hasHeight && /flex\s*:\s*[\d.]+\s+1\s+0/.test(merged);
  if (!hasHeight) {
    violations.push({
      id: 'I1',
      severity: 'error',
      file: 'styles',
      message: hasDeadFlexOnly
        ? `内容根 .${rootCls} 仅有 flex 填充无 height（宿主 .pannel-content 为 block，flex 失效 → 内容塌陷）`
        : `内容根 .${rootCls} 缺 height 声明`,
    });
  }
  const hasWidth = /(^|[\s;{])width\s*:/.test(merged);
  const hasAR = /(^|[\s;{])aspect-ratio\s*:/.test(merged);
  if (!hasAR && (!hasWidth || !hasHeight)) {
    violations.push({
      id: 'I4',
      severity: 'error',
      file: 'styles',
      message: `内容根 .${rootCls} 缺 aspect-ratio 且 width/height 不同时齐全（形态失锁）`,
    });
  }
}

/** 提取 .vue 单文件的出边：script 绑定名 + 动态 import 路径 + 模板标签 */
function extractVueEdges(vueContent) {
  const script = vueContent.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
  // 🛡️ 模板区截取不能用 lazy <\/template>（SFC 根 template 内嵌具名插槽的 </template>
  // 会提前截断，插槽之后的真实标签全部丢失 —— cfb53488 TabsSection 误报实锤）。
  // 正解：首个 <template> 到 <script>/<style> 之间整段，再剥注释与具名插槽块。
  const tplStart = vueContent.search(/<template\b[^>]*>/i);
  let tpl = '';
  if (tplStart >= 0) {
    const rest = vueContent.slice(tplStart);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    tpl = endIdx > 0 ? rest.slice(0, endIdx) : rest;
  }
  tpl = tpl.replace(/<!--[\s\S]*?-->/g, '');
  // 🛡️ 注意：具名插槽块（<template #x>…</template>）**不剥离** —— 插槽内的组件标签
  // 同样是真实引用、必须有绑定（cfb53488 HeaderSection 在 #header-right 内被误判
  // 「无引用」实锤）。剥离只用于根容器识别（防插槽内装饰元素误判）等场景。
  // 静态 import 绑定名（default + named）
  const bindings = new Set();
  for (const m of script.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))\s+from/g)) {
    for (const piece of m[1] ? m[1].split(',') : [m[2]]) {
      const name = piece.trim().split(/\s+as\s+/).pop();
      if (name) bindings.add(name);
    }
  }
  // const/let/var 声明（覆盖 defineAsyncComponent(() => import(...)) 无静态绑定形态）
  for (const m of script.matchAll(/(?:^|[\s;])(?:const|let|var)\s+(\w+)\s*=/g)) {
    bindings.add(m[1]);
  }
  // 动态 import 路径（含 defineAsyncComponent 内嵌形态）
  const dynamicPaths = [...script.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  const tags = new Set();
  for (const m of tpl.matchAll(/<([A-Z][\w-]*)/g)) {
    const name = m[1];
    if (VUE_BUILTINS.has(name) || SKIP_TAG_RE.test(name)) continue;
    tags.add(name);
  }
  return { bindings, dynamicPaths, tags, script };
}

/** ——— I2：标签 ↔ 绑定 ↔ 文件 全图三向对齐（覆盖 defineAsyncComponent 动态形态） ——— */
function checkTagImportFileBijection(files, violations) {
  const vueFiles = Object.keys(files).filter((p) => /\.vue$/i.test(p));
  // 组件文件池：package/components/*.vue → Pascal 名
  const compFiles = new Map(); // pascalName → path
  for (const p of vueFiles) {
    const m = p.match(/package\/components\/([\w-]+)\.vue$/i);
    if (!m) continue;
    const pascal = m[1]
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
    compFiles.set(pascal, p);
  }
  const kebabOf = (name) =>
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();

  // 出边缓存
  const edges = new Map();
  for (const p of vueFiles) edges.set(p, extractVueEdges(String(files[p])));

  // 正向：每个 .vue 模板里的组件标签必须在本文件有绑定（静态名/const 声明）或动态 import 路径命中
  for (const [p, e] of edges) {
    for (const tag of e.tags) {
      const variants = [tag, kebabOf(tag), kebabOf(tag).replace(/-/g, '')];
      const bound = e.bindings.has(tag) ||
        e.dynamicPaths.some((dp) => variants.some((v) => dp.toLowerCase().includes(`/${v}.vue`)));
      if (!bound) {
        const fileExists = compFiles.has(tag);
        violations.push({
          id: 'I2',
          severity: 'error',
          file: p,
          message: fileExists
            ? `模板标签 <${tag}> 对应文件存在（${compFiles.get(tag)}）但本文件无绑定/动态 import（渲染静默失败）`
            : `模板标签 <${tag}> 无绑定且找不到 package/components/ 下的组件文件（悬空标签）`,
        });
      }
    }
  }

  // 反向：每个组件文件必须被至少一个其他 .vue 引用（绑定被模板用 / 动态或静态路径命中）
  for (const [pascal, compPath] of compFiles) {
    const kebab = kebabOf(pascal);
    const used = vueFiles.some((p) => {
      if (p === compPath) return false;
      const e = edges.get(p);
      const boundAndUsed = e.bindings.has(pascal) && e.tags.has(pascal);
      // 🛡️ 大小写：产物文件名是 PascalCase（HeaderSection.vue），kebabOf(pascal) 是小写
      // kebab（header-section）—— 不带 i 标志的路径正则永远匹配不上 PascalCase 文件名，
      // 会把「已 import 但模板未用」的组件误报为死代码。实测 2026-09-11。
      const pathRef =
        e.dynamicPaths.some((dp) => dp.toLowerCase().includes(`/${kebab}.vue`)) ||
        new RegExp(`from\\s+['"][^'"]*/${kebab}\\.vue['"]`, 'i').test(e.script);
      return boundAndUsed || pathRef;
    });
    if (!used) {
      violations.push({
        id: 'I2',
        severity: 'warn',
        file: compPath,
        message: `子组件文件存在但无任何 .vue 引用（死代码，CODE-021 同族）`,
      });
    }
  }
}

/** ——— I3：tabs 唯一性（cfb53488 双 tabs 实锤） ——— */
function checkTabsUniqueness(files, violations) {
  const idxPath = files['package/index.vue'] ? 'package/index.vue' : 'index.vue';
  const idxContent = files[idxPath];
  if (typeof idxContent !== 'string') return;
  const { tags } = extractVueEdges(idxContent);
  const tabTags = [...tags].filter((t) => /tab/i.test(t));
  if (tabTags.length >= 2) {
    violations.push({
      id: 'I3',
      severity: 'error',
      file: idxPath,
      message: `模板中存在 ${tabTags.length} 个 tabs 类 section 标签（${tabTags.join(', ')}）—— 同职责 tabs 重复（cfb53488 实锤形态）`,
    });
  }
}

/** ——— I5：index.vue 模板类名对齐（warn） ——— */
function checkTemplateClassAlignment(files, violations) {
  const idxPath = files['package/index.vue'] ? 'package/index.vue' : 'index.vue';
  const idxContent = files[idxPath];
  if (typeof idxContent !== 'string') return;
  const tplStartIdx = idxContent.search(/<template\b[^>]*>/i);
  let tplRaw = '';
  if (tplStartIdx >= 0) {
    const rest = idxContent.slice(tplStartIdx);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    tplRaw = endIdx > 0 ? rest.slice(0, endIdx) : rest;
  }
  const tpl = tplRaw.replace(/<!--[\s\S]*?-->/g, '');
  const styles = collectStyleSources(files);
  const classes = new Set();
  for (const m of tpl.matchAll(/\bclass=(["'])([^"']*)\1/g)) {
    for (const c of m[2].split(/\s+/)) {
      if (!/^[a-z][\w-]*$/i.test(c)) continue;
      // 排除 base-panel 任务指纹实例类（宿主动态注入，产物样式中不存在是正常形态）
      if (/^c-mc-[a-z]+-\d{10,}/.test(c)) continue;
      classes.add(c);
    }
  }
  // base-panel 开标签上的 class 一并排除（panelKey 同理为宿主契约）
  const basePanelClasses = new Set();
  for (const m of tpl.matchAll(/<base-panel\b[^>]*\bclass=(["'])([^"']*)\1/gi)) {
    for (const c of m[2].split(/\s+/)) basePanelClasses.add(c);
  }
  const missing = [...classes].filter((c) => !styles.includes(c) && !basePanelClasses.has(c));
  if (missing.length > 0) {
    violations.push({
      id: 'I5',
      severity: 'warn',
      file: idxPath,
      message: `模板引用但任何样式源未声明的类（${missing.length}）：${missing.slice(0, 10).join(', ')}`,
    });
  }
}

/** ——— I6：资源挂载对齐（import 图片 / css url 存在性） ——— */
function checkResourceMount(files, violations) {
  const paths = new Set(Object.keys(files));
  // 🛡️ P1.6 口径修正（2026-09-11）：生成期跑在**内存快照**上，而快照通常不含
  // resources/images/* 二进制（资源是边下载边落盘）→ 原实现系统性误报
  // 「import 的资源不存在」（实测 batch 0b95f5cf 34 条 error，而资源磁盘上全在）。
  // 契约：本不变量只对「文件集完整」的产物生效；快照缺任何 images/assets 条目时 fail-open 跳过。
  const hasBinaryAssets = [...paths].some((p) => /(^|\/)(images|assets)\//.test(p));
  if (!hasBinaryAssets) return;
  const exists = (rel) => {
    if (paths.has(rel)) return true;
    const base = rel.split('/').pop();
    for (const p of paths) if (p.split('/').pop() === base) return true;
    return false;
  };
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/i.test(p)) {
      for (const m of c.matchAll(/import\s+\w+\s+from\s+['"]([^'"]*(?:images|assets)[^'"]*)['"]/g)) {
        const spec = m[1];
        if (/^(https?:)?\/\//.test(spec)) continue;
        // 相对路径解析到产物根（package/ 下 → ../resources/...）
        const norm = spec.replace(/^\.\.?\//, '').replace(/^(\.\.\/)+/, '');
        if (!exists(norm) && !paths.has(spec)) {
          violations.push({ id: 'I6', severity: 'error', file: p, message: `import 的资源不存在：${spec}` });
        }
      }
    }
    if (/\.(less|css)$/i.test(p) || /\.vue$/i.test(p)) {
      for (const m of c.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
        const u = m[1].trim();
        if (/^(https?:|data:|#)/.test(u) || u.includes('${')) continue;
        const norm = u.replace(/^\.\.?\//, '').replace(/^(\.\.\/)+/, '');
        if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(norm)) continue;
        if (!exists(norm)) {
          violations.push({ id: 'I6', severity: 'error', file: p, message: `url() 引用的图片不存在：${u}` });
        }
      }
    }
  }
}

/**
 * 主入口：跑全部七条不变量。
 * @param {Object<string,string>} files 产物 map
 * @param {{classFacts?: Object}} [options] 类事实（engineer 生成期注入；缺省内部自采集）
 * @returns {{ violations: Array, passed: boolean, summary: string }}
 */
export function runArtifactInvariants(files = {}, options = {}) {
  // 先做产物边界过滤：缓存/chunk 片段/依赖不参与判定（见 isArtifactPath 注释）
  const artifactFiles = {};
  for (const [p, c] of Object.entries(files || {})) {
    if (isArtifactPath(p)) artifactFiles[p] = c;
  }
  const violations = [];
  const facts = options.classFacts || null;
  const safe = (fn, id) => {
    try {
      fn(artifactFiles, violations);
    } catch (e) {
      violations.push({ id, severity: 'warn', file: '-', message: `不变量校验器内部异常（fail-visible）：${e?.message || e}` });
    }
  };
  safe(checkRootContainer, 'I1');
  safe(checkTagImportFileBijection, 'I2');
  safe(checkTabsUniqueness, 'I3');
  // I4 已并入 checkRootContainer（同块扫描，避免二次解析）
  safe(checkTemplateClassAlignment, 'I5');
  safe(checkResourceMount, 'I6');
  safe((f, v) => {
    // 🛡️ P1.6（2026-09-11）：I7 委托「类名契约」单一实现（与门禁 CODE-024 同判据），
    // 避免「门禁放过、不变量报警」的双源漂移。C1/C2/C3 → error；C4 → warn。
    const factsForCheck = facts || collectClassFacts(f);
    for (const cv of checkClassNameContract(f, factsForCheck)) {
      v.push({
        id: 'I7',
        severity: cv.severity === 'error' ? 'error' : 'warn',
        file: cv.file,
        message: `[${cv.code}] ${cv.message}`,
      });
    }
  }, 'I7');

  safe((f, v) => {
    // 🛡️ P1.7（2026-09-11）I8 资源契约：引用（模板+script）↔ import ↔ 资源事实源 三方一致。
    // 事故 13890774：script 内 `[icon3,…,icon14]` 引用未注入 import → `icon4 is not defined`。
    // 与门禁 CODE-025 共用 utils/resource-facts#checkResourceContract（同一判据）。
    const rfacts = options.resourceFacts || buildResourceFacts({ mapping: options.resourceMapping || [], files: f });
    for (const cv of checkResourceContract(f, rfacts)) {
      v.push({
        id: 'I8',
        severity: cv.severity === 'error' ? 'error' : 'warn',
        file: cv.file,
        message: `[${cv.code}] ${cv.message}`,
      });
    }
  }, 'I8');

  const errors = violations.filter((v) => v.severity === 'error');
  const warns = violations.filter((v) => v.severity === 'warn');
  const byId = {};
  for (const v of violations) byId[v.id] = (byId[v.id] || 0) + 1;
  const summary = `invariants: ${errors.length} error / ${warns.length} warn | ${JSON.stringify(byId)}`;
  return { violations, passed: errors.length === 0, summary };
}
