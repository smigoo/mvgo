/**
 * 🛡️ 根治⑯（2026-11-13 · mc-1794535248015-2ca2eb59 实锤）：跨组件契约确定性修复。
 *
 * 病灶：内部子组件（package/components/*.vue）被 LLM 编成消费 `businessProps.<key>`
 *   （平台业务 props——内部子组件运行期必然取不到 ⇒ 图表空渲染 + PROP-BIND BLOCK）。
 *   打回 LLM 重试三轮照样编（2ca2eb59 实证；bd040325 series 契约同族）——回灌指导
 *   对「跨组件契约盲区」已被证明无效，确定性后处理是唯一实证有效路径。
 * 决定性证据（2ca2eb59 BridgeBarChart）：父组件 ContentBridge **已正确传参**
 *   `:chart-data="barChartData"`（含 Figma 真值数据），子组件却忽略父传、从
 *   `businessProps.chartData` 取（必然空）——同名改绑即可确定性修复。
 *
 * 分级（数据诚实，非放水）：
 *   档 1  死键 ∈ 父组件传给该子组件的同名 prop（kebab→camel）⇒ **确定性改绑**：
 *         补/改造 defineProps + `businessProps.k` → `props.k`（原 fallback 链保留）。
 *   档 2  死键无父传 ⇒ **跳过不修**（保持 PROP-BIND BLOCK——补声明/补传=臆造数据）；
 *         有 data-section-id 真值文案的场景已由既有 S2 兜底覆盖。
 *
 * CODE-024（修饰符基类不在 DOM）不在本模块：其确定性删除需完全复刻
 * classname-contract 的 C2/C4 判据（classFacts 采集 + less 嵌套展开 + 方言归一），
 * 复刻偏差 ⇒ 误删活规则比不修更糟 ⇒ 登记为独立后续项。
 *
 * 幂等：改绑后不再含 businessProps.k；defineProps 注入前查已有声明。
 */

/** kebab-case → camelCase */
function toCamel(s) {
  return String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 构建 import 图 + 每个子组件的「父传 prop 键集合」。
 * @returns {Map<string, Set<string>>} childPath → 父传 camel prop 键并集
 */
function collectParentPropKeys(files) {
  const parentProps = new Map(); // childPath → Set<camelKey>
  const entries = Object.entries(files || {}).filter(
    ([p, c]) => /\.vue$/i.test(p) && typeof c === 'string',
  );
  for (const [pp, code] of entries) {
    // 该文件的 import 表：localName → childPath
    const imports = new Map();
    for (const m of code.matchAll(
      /import\s+(\w+)\s+from\s+['"]\.\/([\w.-]+\.vue)['"]/g,
    )) {
      const childPath = pp.replace(/[^/]+$/, m[2]);
      imports.set(m[1], childPath);
    }
    if (imports.size === 0) continue;
    const tplM = code.match(/<template>([\s\S]*)<\/template>/i);
    if (!tplM) continue;
    const tpl = tplM[1];
    // 扫模板中 `<LocalName ...>` 开标签的绑定属性
    const tagRe = /<([A-Za-z][\w.]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    let t;
    while ((t = tagRe.exec(tpl))) {
      const childPath = imports.get(t[1]);
      if (!childPath) continue;
      const attrs = t[2] || '';
      for (const a of attrs.matchAll(/(?:^|\s):([A-Za-z][\w-]*)\s*=/g)) {
        if (!parentProps.has(childPath)) parentProps.set(childPath, new Set());
        parentProps.get(childPath).add(toCamel(a[1]));
      }
      // 标签体很长时 tagRe 会卡正则回溯？属性段已由正则捕获，无需 scanToTagClose。
    }
  }
  return parentProps;
}

/** 解析 declare.json → 已声明业务键集合（与 PROP-BIND 门禁同口径；无 declare 返回 null） */
function declaredBusinessKeysOf(files) {
  const entry = Object.entries(files || {}).find(([p]) =>
    /(^|\/)declare\.json$/.test(String(p)),
  );
  if (!entry) return null;
  try {
    const dec = typeof entry[1] === 'string' ? JSON.parse(entry[1]) : entry[1];
    return new Set([
      ...Object.keys(dec?.businessConfig || {}),
      ...Object.keys(dec?.businessStatuses || {}),
      ...Object.keys(dec?.businessEvents || {}),
    ]);
  } catch {
    return null;
  }
}

/**
 * 档 1：内部子组件 businessProps 死键同名改绑。
 * @param {Object<string,string>} files
 * @returns {{files: Object<string,string>, healed: string[], skipped: string[]}}
 */
export function rebindInternalChildDeadProps(files) {
  const healed = [];
  const skipped = [];
  const next = { ...files };
  if (!files || typeof files !== 'object') return { files: next, healed, skipped };
  const declared = declaredBusinessKeysOf(files);
  if (!declared) return { files: next, healed, skipped }; // 无 declare → 与门禁同口径 fail-open
  const parentProps = collectParentPropKeys(files);

  for (const [p, code] of Object.entries(files)) {
    if (!/^package\/components\/[^/]+\.vue$/.test(p) || typeof code !== 'string') continue;
    // 死键集合（与 PROP-BIND 同判据）
    const deadKeys = new Set();
    for (const m of code.matchAll(/businessProps\.([A-Za-z_$][\w$]*)/g)) {
      if (!declared.has(m[1])) deadKeys.add(m[1]);
    }
    if (deadKeys.size === 0) continue;
    const bindable = [...deadKeys].filter((k) => parentProps.get(p)?.has(k));
    if (bindable.length === 0) {
      skipped.push(`${p} → ${[...deadKeys].join(',')}（无父传同名 prop，保持 BLOCK）`);
      continue;
    }

    const scriptM = code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptM) {
      skipped.push(`${p} → 无 script 段`);
      continue;
    }
    const script = scriptM[1];
    let newScript = script;

    // 原始 script 是否已有 defineProps（补键分支只对「已有」生效；注入分支自带键）
    const hadDefineProps = /\bdefineProps\s*\(/.test(script);
    // ① 确保可访问的 props 引用：const X = defineProps(...)
    let propsVar = null;
    const dpNamed = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*defineProps\s*\(/.exec(newScript);
    if (dpNamed) {
      propsVar = dpNamed[1];
    } else if (hadDefineProps) {
      // 裸 defineProps ⇒ 改为 const X = defineProps(...)（避免与既有 const props 冲突）
      propsVar = /\bconst\s+props\s*=/.test(newScript) ? 'ccProps' : 'props';
      newScript = newScript.replace(/\bdefineProps\s*\(/, `const ${propsVar} = defineProps(`);
    } else {
      // 无 defineProps ⇒ 注入（落点：$mcComponentBuilder 行之后；无则 script 开头）
      const decls = bindable
        .map((k) => `  ${k}: { type: [Object, Array], default: null }`)
        .join(',\n');
      const inject = `\nconst props = defineProps({\n${decls}\n}) /* cc-heal: 父传同名 prop 改绑声明（根治⑯） */\n`;
      const anchor = /.*\$mcComponentBuilder\(\)[^\n]*/.exec(newScript);
      if (anchor) {
        const at = anchor.index + anchor[0].length;
        newScript = newScript.slice(0, at) + inject + newScript.slice(at);
      } else {
        newScript = inject + newScript;
      }
      propsVar = 'props';
    }

    // ② defineProps 已存在但缺该键 ⇒ 补键（hasKey 窗口：defineProps 起始后 1200 字符内）
    if (hadDefineProps) {
      for (const k of bindable) {
        const dpAt = newScript.indexOf('defineProps');
        const hasKey = new RegExp(`\\b${k}\\s*:`).test(
          newScript.slice(dpAt, dpAt + 1200),
        );
        if (!hasKey) {
          newScript = newScript.replace(
            /\bdefineProps\s*\(\s*\{/,
            `defineProps({\n  ${k}: { type: [Object, Array], default: null }, /* cc-heal（根治⑯） */`,
          );
        }
      }
    }

    // ③ 表达式替换：businessProps.k → props.k（script + template 全文）
    let out = code.slice(0, scriptM.index) + newScript + code.slice(scriptM.index + scriptM[0].length);
    for (const k of bindable) {
      const re = new RegExp(`\\bbusinessProps\\.${k}\\b`, 'g');
      out = out.replace(re, `${propsVar}.${k}`);
    }
    next[p] = out;
    healed.push(
      `${p} → ${bindable.map((k) => `businessProps.${k} ⇒ ${propsVar}.${k}`).join('；')}（父传同名改绑）`,
    );
  }
  return { files: next, healed, skipped };
}
