/**
 * 一体化平台健康度校验模块（MC Health Validator）
 *
 * 规范来源：微码组件开发规范和健康度检查报告说明 v1.0.19-1
 * 职责：对 mc 组件产物执行 M1~M6（38 必须项）+ W1~W2（2 警告项）自动化检查，
 *       输出 { passed, failed, warnings }，与 aidocs/frontend-mc-check 口径对齐。
 *
 * 适用范围：仅 mc 组件（componentType='microcode'）；vue3 组件不做要求。
 * 设计原则：纯函数导出；所有检查输入（files 对象 + declare 对象）显式传入。
 */

import { MC_FRAMEWORK_PRESET_VARS, MC_DARK_THEME_COLOR_ENUM } from './file-writer.js';

const OK = 'ok';

/**
 * 运行完整健康度检查。
 * @param {Object<string,string>} files 组件产物集（path → content）
 * @param {Object} declare declare.json 解析对象（可选，缺省从 files 读取）
 * @param {Object} [options]
 * @param {string} [options.componentType] 'business' | 'utility' | 'service'（默认 business）
 * @returns {{ passed: Array, failed: Array, warnings: Array, summary: Object }}
 */
export function checkMcComponent(files = {}, declare = null, options = {}) {
  const passed = [];
  const failed = [];
  const warnings = [];
  const decl = declare || parseDeclare(files['declare.json']);
  const compType = options.componentType || decl?.componentType || 'business';
  const isBusiness = compType === 'business';

  // ── M1 命名规范（3 项，始终检查）────────────────────────────
  run('M1-1', 'componentId 规范（c- 开头/kebab-case/≤50）', () => {
    const id = decl?.componentId || '';
    if (!/^c-[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return fail('componentId 应为 c- 开头 kebab-case');
    if (id.length > 50) return fail('componentId 超过 50 字符');
    return OK;
  });
  run('M1-2', 'componentName 长度（2-50）', () => {
    const n = decl?.componentName || '';
    if (typeof n !== 'string' || n.length < 2 || n.length > 50) return fail('componentName 长度须在 2-50 字符');
    return OK;
  });
  run('M1-3', 'version 格式（vX.Y.Z）', () => {
    if (!/^v\d+\.\d+\.\d+$/.test(decl?.version || '')) return fail('version 应为 v主.次.修订（如 v1.0.0）');
    return OK;
  });

  // ── M2 必要文件（6 项）─────────────────────────────────────
  run('M2-1', '必要文件存在（index.vue/declare.json/declare.js/component.js）', () => {
    for (const f of ['package/index.vue', 'declare.json', 'declare.js', 'component.js']) {
      if (!files[f]) return fail(`缺少必要文件 ${f}`);
    }
    return OK;
  });
  run('M2-2', 'mc-preview.png 存在', () => {
    if (!files['resources/images/mc-preview.png']) return fail('缺少 resources/images/mc-preview.png');
    return OK;
  });
  run('M2-3', 'css-vars.js 存在', () => {
    if (!files['resources/config/css-vars.js']) return fail('缺少 resources/config/css-vars.js');
    return OK;
  });
  run('M2-4', 'themes 目录结构', () => {
    if (!files['resources/styles/themes/theme-vars.less']) return fail('缺少 theme-vars.less');
    return OK;
  });
  run('M2-5', 'layoutConfig 预览图（按需）', () => {
    if (!decl?.layoutConfig?.list?.length) return OK; // 未配置则豁免
    const bad = (decl.layoutConfig.list || []).filter(
      (l) => !l.previewName || !/^mc-preview/.test(l.previewName || ''),
    );
    return bad.length ? fail('layoutConfig 存在 previewName 不合规项') : OK;
  });
  run('M2-5b', 'layoutConfig 预览图唯一性（按需）', () => {
    const names = (decl?.layoutConfig?.list || []).map((l) => l.previewName).filter(Boolean);
    return new Set(names).size === names.length ? OK : fail('layoutConfig previewName 重复');
  });
  run('M2-6', 'index.less 存在', () => {
    if (!files['resources/styles/index.less']) return fail('缺少 resources/styles/index.less');
    return OK;
  });

  // ── M3 declare.json 字段（9 项）────────────────────────────
  run('M3-1', '必填字段', () => {
    const missing = ['componentId', 'componentName', 'version'].filter((k) => !decl?.[k]);
    if (missing.length) return fail(`缺少必填字段: ${missing.join('/')}`);
    if (!decl?.themeConfig?.list?.length) return fail('themeConfig.list 为空');
    if (!decl?.businessEvents) return fail('businessEvents 缺失');
    if (!decl?.businessStatuses) return fail('businessStatuses 缺失');
    return OK;
  });
  run('M3-2', 'businessEvents 完整性（按需）', () => {
    const evts = asArray(decl?.businessEvents);
    if (!evts.length) return OK;
    const bad = evts.filter(
      (e) =>
        !e?.eventId ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.eventId || '') ||
        !e?.eventName ||
        typeof e?.eventDataSchema !== 'object',
    );
    return bad.length ? fail(`存在不合规事件 ${bad.map((b) => b.eventId).join(',')}`) : OK;
  });
  run('M3-3', 'businessStatuses 完整性（按需）', () => {
    const sts = asArray(decl?.businessStatuses);
    if (!sts.length) return OK;
    const bad = sts.filter(
      (s) => !s?.statusId || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.statusId || '') || !s?.statusName || !s?.parameters,
    );
    return bad.length ? fail(`存在不合规状态 ${bad.map((b) => b.statusId).join(',')}`) : OK;
  });
  run('M3-4', 'cssVariableConfig 规范（按需）', () => {
    const vars = asArray(decl?.cssVariableConfig);
    if (!vars.length) return OK;
    const VALID_TYPES = ['string', 'number', 'boolean', 'color', 'select'];
    const bad = vars.filter((v) => !v?.name || !v?.key || !VALID_TYPES.includes(v?.type));
    return bad.length ? fail('cssVariableConfig 存在不合规项（name/key/type）') : OK;
  });
  run('M3-4b', 'cssVariableConfig 与 css-vars.js 一致性（按需）', () => {
    const vars = asArray(decl?.cssVariableConfig);
    const cssVarsContent = files['resources/config/css-vars.js'] || '';
    if (!vars.length || !cssVarsContent) return OK;
    const missing = vars.filter((v) => v?.key && !cssVarsContent.includes(v.key));
    return missing.length ? fail(`css-vars.js 未实现声明的变量: ${missing.map((m) => m.key).join(',')}`) : OK;
  });
  run('M3-4c', 'css-vars.js 自定义变量声明（按需）', () => {
    const cssVarsContent = files['resources/config/css-vars.js'] || '';
    if (!cssVarsContent) return OK;
    const declaredKeys = asArray(decl?.cssVariableConfig).map((v) => v.key).filter(Boolean);
    const declared = new Set([...MC_FRAMEWORK_PRESET_VARS, ...declaredKeys]);
    // 简单提取 css-vars.js 中的变量 key（common/dark/light 对象体内的键）
    const usedVars = new Set();
    for (const m of cssVarsContent.matchAll(/^\s{2}([a-zA-Z][\w]*):/gm)) {
      if (!MC_FRAMEWORK_PRESET_VARS.includes(m[1])) usedVars.add(m[1]);
    }
    const undeclared = [...usedVars].filter((k) => !declared.has(k));
    return undeclared.length ? fail(`css-vars.js 自定义变量未在 cssVariableConfig 声明: ${undeclared.join(',')}`) : OK;
  });
  run('M3-5', 'layoutConfig 完整性', () => {
    const lc = decl?.layoutConfig;
    if (!lc || !lc.list?.length) return fail('layoutConfig 缺失或 list 为空');
    const bad = lc.list.filter((l) => !l?.name || !l?.key);
    return bad.length ? fail('layoutConfig.list 存在缺 name/key 项') : OK;
  });
  run('M3-6', 'themeConfig 完整性', () => {
    const tc = decl?.themeConfig;
    if (!tc || !tc.list?.length) return fail('themeConfig 缺失或 list 为空');
    const bad = tc.list.filter((l) => !l?.name || !l?.key);
    return bad.length ? fail('themeConfig.list 存在缺 name/key 项') : OK;
  });
  run('M3-7', 'businessConfig 规范（按需）', () => {
    const cfg = asArray(decl?.businessConfig);
    if (!cfg.length) return OK;
    const bad = cfg.filter(
      (c) => !c?.name || !c?.key || !/^[a-z][a-zA-Z0-9]*$/.test(c.key || '') || !c?.type || !c?.renderType,
    );
    return bad.length ? fail('businessConfig 存在不合规项（name/key camelCase/type/renderType）') : OK;
  });
  run('M3-8', 'dataSources 规范（按需）', () => {
    const ds = asArray(decl?.dataSources);
    if (!ds.length) return OK;
    const bad = ds.filter((d) => !d?.sourceName || !d?.columns?.length);
    return bad.length ? fail('dataSources 存在缺 sourceName/columns 项') : OK;
  });
  run('M3-9', 'formSources 规范（按需）', () => {
    const fs2 = asArray(decl?.formSources);
    if (!fs2.length) return OK;
    return fs2.every((f) => f?.formName) ? OK : fail('formSources 存在缺 formName 项');
  });

  // ── M4 文件格式（6 项，始终检查）──────────────────────────
  run('M4-1', 'declare.js 使用 $createMcDeclare', () => {
    const c = files['declare.js'] || '';
    return c.includes('$createMcDeclare') ? OK : fail('declare.js 未使用 $createMcDeclare');
  });
  run('M4-2', 'declare.js 传入 cssVars', () => {
    const c = files['declare.js'] || '';
    return c.includes('cssVars') ? OK : fail('declare.js 未传入 cssVars 参数');
  });
  run('M4-3', 'component.js 导出 ./package/index.vue', () => {
    const c = files['component.js'] || '';
    return /package\/index\.vue/.test(c) ? OK : fail('component.js 未导出 ./package/index.vue');
  });
  run('M4-4', 'css-vars.js 导出结构（common + 主题对象）', () => {
    const c = files['resources/config/css-vars.js'] || '';
    if (!c.includes('common')) return fail('css-vars.js 缺少 common');
    if (!c.includes('dark')) return fail('css-vars.js 缺少 dark');
    return /export\s*\{[^}]+\}/.test(c) ? OK : fail('css-vars.js 缺少导出语句');
  });
  run('M4-4b', 'css-vars.js 字体变量格式（按需）', () => {
    const c = files['resources/config/css-vars.js'] || '';
    if (!c.includes('fontSize')) return OK;
    return c.includes('$mcCssBuilder.getCssSize') ? OK : fail('fontSize 必须使用 $mcCssBuilder.getCssSize()');
  });
  run('M4-5', 'index.less 引入主题文件', () => {
    const c = files['resources/styles/index.less'] || '';
    return /@import/.test(c) ? OK : fail('index.less 缺少 @import');
  });
  run('M4-6', 'index.less 被引用', () => {
    const vueFiles = Object.entries(files).filter(([p]) => p.endsWith('.vue'));
    return vueFiles.some(([, c]) => /styles\/index/.test(c || ''))
      ? OK
      : fail('package/ 下无文件引用 styles/index');
  });

  // ── M5 代码规范（7 项）─────────────────────────────────────
  run('M5-1', 'base-panel 包裹', () => {
    const c = files['package/index.vue'] || '';
    return c.includes('<base-panel') ? OK : fail('package/index.vue 顶层未使用 <base-panel>');
  });
  run('M5-2', '$mcComponentBuilder 只调用一次', () => {
    const c = files['package/index.vue'] || '';
    const count = (c.match(/\$mcComponentBuilder\s*\(/g) || []).length;
    return count <= 1 ? OK : fail(`$mcComponentBuilder 调用 ${count} 次（应 ≤1）`);
  });
  run('M5-3', '禁用 API（createRequest/axios/$http/fetch）', () => {
    const all = Object.values(files).join('\n');
    const banned = /createRequest|axios|this\.\$http|\.fetch\(/;
    return banned.test(all) ? fail('代码中使用了一体化平台禁用 API') : OK;
  });
  run('M5-4', 'publishEvent 一致性（按需）', () => {
    const c = files['package/index.vue'] || '';
    if (!c.includes('publishEvent')) return OK;
    const declared = new Set(asArray(decl?.businessEvents).map((e) => e.eventId));
    const used = [...c.matchAll(/publishEvent\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const missing = used.filter((u) => !declared.has(u));
    return missing.length ? fail(`publishEvent 未声明: ${missing.join(',')}`) : OK;
  });
  run('M5-5', 'listenEvent 一致性（按需）', () => {
    const c = files['package/index.vue'] || '';
    if (!c.includes('listenEvent')) return OK;
    const declared = new Set(asArray(decl?.businessStatuses).map((s) => s.statusId));
    const used = [...c.matchAll(/listenEvent\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const missing = used.filter((u) => !declared.has(u));
    return missing.length ? fail(`listenEvent 未声明: ${missing.join(',')}`) : OK;
  });
  run('M5-6', '@fontSize 变量使用（按需）', () => {
    const all = Object.values(files).filter((c) => typeof c === 'string').join('\n');
    if (!/font-size\s*:/.test(all)) return OK;
    return all.includes('@fontSize') ? OK : fail('有 font-size 但未使用 @fontSize 变量');
  });
  run('M5-7', '禁止硬编码字体大小（按需）', () => {
    const all = Object.values(files).filter((c) => typeof c === 'string').join('\n');
    const bad = [...all.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => parseFloat(m[1]) > 5);
    return bad.length ? fail(`存在 ${bad.length} 处硬编码 font-size > 5px`) : OK;
  });

  // ── M6 一体化适配（7 项，仅业务组件）──────────────────────
  if (isBusiness) {
    run('M6-1a', '内容布局存在性', () => {
      return (decl?.layoutConfig?.list?.length || 0) >= 1 ? OK : fail('layoutConfig.list.length 必须 >= 1');
    });
    run('M6-2a', 'dark 主题配置', () => {
      const keys = (decl?.themeConfig?.list || []).map((l) => l.key);
      return keys.includes('dark') ? OK : fail('themeConfig.list 必须包含 key="dark"');
    });
    run('M6-2b', 'css-vars.js 导出 dark', () => {
      const c = files['resources/config/css-vars.js'] || '';
      return /(?:export|const)\s+dark/.test(c) ? OK : fail('css-vars.js 必须导出 dark 对象');
    });
    run('M6-2c', 'dark 核心变量完整性', () => {
      const c = files['resources/config/css-vars.js'] || '';
      const darkSection = extractDarkSection(c);
      const required = ['colorTextBase', 'colorPrimary', 'colorPrimaryBg'];
      const missing = required.filter((k) => !darkSection.includes(`${k}:`));
      return missing.length ? fail(`dark 缺少核心变量: ${missing.join(',')}`) : OK;
    });
    run('M6-2d', 'dark 核心变量色值枚举', () => {
      const c = files['resources/config/css-vars.js'] || '';
      const darkSection = extractDarkSection(c);
      const bad = [];
      for (const [key, allowed] of Object.entries(MC_DARK_THEME_COLOR_ENUM)) {
        const m = darkSection.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`));
        if (m && normalizeColor(m[1]) !== normalizeColor(allowed)) bad.push(`${key}=${m[1]}`);
      }
      return bad.length ? fail(`dark 色值不合规: ${bad.join(', ')}`) : OK;
    });
    run('M6-2e', 'dark 滚动条色值（按需）', () => {
      const c = files['resources/config/css-vars.js'] || '';
      const darkSection = extractDarkSection(c);
      const bad = [];
      if (darkSection.includes('scrollbarTrackBg:') && !darkSection.includes("scrollbarTrackBg: '#424242'"))
        bad.push('scrollbarTrackBg');
      if (darkSection.includes('scrollbarThumbBg:') && !darkSection.includes("scrollbarThumbBg: '#646464'"))
        bad.push('scrollbarThumbBg');
      return bad.length ? fail(`滚动条色值固定要求: ${bad.join(',')}`) : OK;
    });
    run('M6-3a', 'base-panel 无内联背景', () => {
      const c = files['package/index.vue'] || '';
      const m = c.match(/<base-panel[^>]*>/i);
      if (m && /style\s*=\s*["'][^"']*background/i.test(m[0])) return fail('<base-panel> 设置了内联背景色');
      return OK;
    });
    run('M6-3b', '首子元素无内联背景', () => {
      const c = files['package/index.vue'] || '';
      const open = c.match(/<base-panel[^>]*>([\s\S]*?)<base-panel/i)?.[1] || c;
      const firstChild = open.match(/<([a-zA-Z][\w-]*)\b[^>]*>/);
      if (firstChild && /style\s*=\s*["'][^"']*background/i.test(firstChild[0])) {
        return fail(`<base-panel> 首子元素 <${firstChild[1]}> 设置了内联背景色`);
      }
      return OK;
    });
  } else {
    run('M6', `M6 豁免（${compType} 组件不要求一体化适配）`, () => OK);
  }

  // ── W 警告项（2 项）────────────────────────────────────────
  const allContent = Object.values(files).filter((c) => typeof c === 'string').join('\n');
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/i.test(allContent)) {
    warnings.push({ id: 'W-CSS-1', name: '硬编码颜色值', message: '样式中存在 hex/rgb 硬编码色值，建议改用 CSS 变量' });
  }
  if (/\bversionCode\b/.test(allContent)) {
    warnings.push({ id: 'W-DEPRECATED-1', name: '废弃字段', message: '使用了已废弃字段 versionCode' });
  }

  const summary = { total: passed.length + failed.length, passed: passed.length, failed: failed.length, warnings: warnings.length };
  return { passed, failed, warnings, summary };

  // ── 内部辅助 ────────────────────────────────────────────────
  function run(id, name, check) {
    const result = check();
    if (result === OK) passed.push({ id, name, status: 'passed' });
    else failed.push({ id, name, status: 'failed', message: result });
  }
  function fail(message) {
    return message;
  }
}

/**
 * M6-2d 辅助：从 css-vars.js 中提取 dark 对象体（支持 const/export 命名 + 单行/多行格式）。
 * @param {string} content css-vars.js 内容
 * @returns {string} dark 对象体（找不到返回空串）
 */
function extractDarkSection(content) {
  // 先按括号配对取 dark 对象的完整体（兼容单行与多行）
  const decl = content.match(/(?:const|let|var|export\s+const)\s+dark\s*=\s*\{/);
  if (!decl) return '';
  const openBrace = decl.index + decl[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return '';
  return content.slice(openBrace + 1, end);
}

/** 颜色值归一化（去空白、小写，便于枚举比对） */
function normalizeColor(v) {
  return String(v || '').trim().toLowerCase();
}

/** 解析 declare.json 字符串为对象（失败返回 null） */
function parseDeclare(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** declare 中对象/数组字段统一转数组（兼容 object 与 array 两种形态） */
function asArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  return [];
}
