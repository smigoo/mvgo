/**
 * 运行时标识符事实（Runtime Identifiers）—— **单一事实源**
 *
 * 🔴 2026-11-11 根因 G 治理（见 docs/2026-11-11-组件生成根因治理改动清单.md §2）
 *
 * 病灶：`roles/microcode/code-validator.js` 的 vue3 后处理有两道门同时漏：
 *   ① 前置条件 `content.includes('$mcComponentBuilder')` —— 产物只裸用 `runtimeBuilder`
 *      而不出现 `$mcComponentBuilder` 时，整块兜底**根本不执行**；
 *   ② 替换正则 `/runtimeBuilder\?\.\s*publishEvent/g` —— 只匹配**带可选链**的形态，
 *      裸用 `runtimeBuilder.publishEvent(...)` 一个字符都不改。
 *   ⇒ 未声明的 `runtimeBuilder` 留进产物 ⇒ `<script setup>` 顶层引用未声明标识符 ⇒
 *      `onMounted` 抛 ReferenceError ⇒ 组件白屏（mv-max 实锤）。
 *
 * 纪律（与 `utils/layout-metadata.js` 同款）：**本模块是该事实的唯一实现**，
 * 自动修复层（code-validator）与准入门禁（code-structure-validator）都必须 import 这里，
 * **禁止任何模块另写第二份谓词**——两份谓词必然漂移，漂移出来的空窗就是下一个白屏。
 *
 * 检测口径（保守优先）：宁可漏报也不误报。
 *   - `isReferenced`：排除 `obj.name`（属性访问，无需声明）与 `{ name: ... }`（对象字面量 key）；
 *   - `isDeclared`：认 `const|let|var`（含解构）、`function`、`class`、`import`、形参位置。
 */

/** 微码运行时提供的标识符全集（vue3 环境**一个都没有**）。 */
export const RUNTIME_IDENT_NAMES = Object.freeze([
  'runtimeBuilder',
  '$mcComponentBuilder',
  'componentProps',
  'businessProps',
  'componentApi',
]);

/**
 * 必须在**局部作用域**存在才能被引用的名字。
 * `$mcComponentBuilder` 不在此列：它是平台注入的全局，产物永远不该自己声明；
 * 它的处理方式是「调用点整体替换」，见 `MC_BUILDER_STUB_EXPR`。
 */
export const RUNTIME_LOCAL_NAMES = Object.freeze([
  'runtimeBuilder',
  'componentProps',
  'businessProps',
  'componentApi',
]);

/**
 * `runtimeBuilder` 的安全兜底字面量。
 *
 * 为什么**不是** `null`：残留任一 `runtimeBuilder.xxx()` 调用时 `null.xxx` 仍是 TypeError
 * （从 ReferenceError 换成 TypeError，白屏照旧）。对象兜底把「平台 API 未注入」
 * 降级为**静默 no-op**，这才是 vue3 的正确语义——vue3 产物本不存在平台事件总线。
 */
export const RUNTIME_BUILDER_STUB =
  '{ publishEvent() {}, subscribeEvent() { return () => {} } }';

/** `$mcComponentBuilder()` 调用点的整体替换表达式（保持解构成员可读）。 */
export const MC_BUILDER_STUB_EXPR =
  `({ componentProps: {}, businessProps: {}, componentApi: null, runtimeBuilder: ${RUNTIME_BUILDER_STUB} })`;

function escapeIdent(name) {
  // `$` 在正则里是锚点，必须转义；其余标识符名均为 ASCII 字母数字
  return String(name).replace(/\$/g, '\\$');
}

/**
 * 判断内容里是否**引用**了某标识符。
 * @param {string} content
 * @param {string} name
 * @returns {boolean}
 */
export function isReferenced(content, name) {
  if (!content || typeof content !== 'string' || !name) return false;
  const esc = escapeIdent(name);
  // 前缀排除 `.`（属性访问）与标识符字符（避免子串误命中）；
  // 后缀排除标识符字符与 `:`（对象字面量 key `{ name: 1 }` 无需声明）。
  const re = new RegExp(`(^|[^\\w$.])${esc}(?![\\w$])(?!\\s*:)`);
  return re.test(content);
}

/**
 * 判断内容里是否**声明**了某标识符（局部可用）。
 * 保守实现：只认明确声明语法，不认「其它地方出现过」。
 * @param {string} content
 * @param {string} name
 * @returns {boolean}
 */
export function isDeclared(content, name) {
  if (!content || typeof content !== 'string' || !name) return false;
  const esc = escapeIdent(name);
  const pre = '(?:^|[^\\w$.])';
  const post = '(?![\\w$])';
  const patterns = [
    // const runtimeBuilder = ... / let / var
    `${pre}(?:const|let|var)\\s+${esc}${post}`,
    // const { runtimeBuilder } = ... / const { a, runtimeBuilder } = ...
    `${pre}(?:const|let|var)\\s*\\{[^}]{0,400}?[\\s,{]${esc}${post}`,
    // function runtimeBuilder(...) / class runtimeBuilder
    `${pre}(?:function|class)\\s+${esc}${post}`,
    // 形参 / rest 形参：(runtimeBuilder) / (a, runtimeBuilder) / (...runtimeBuilder)
    `[(,]\\s*\\.{0,3}\\s*${esc}\\s*[,)=]`,
  ];
  if (patterns.some((p) => new RegExp(p).test(content))) return true;

  // import 绑定必须**逐行**判定：早期实现用 `import\\s+[^;]{0,300}?name`，在「全文无分号」的
  // 产物里会跨行命中任意后续出现 ⇒ 把裸用误判成已声明 ⇒ 兜底不注入（同款空窗，实测复现）。
  const importLines = content.match(/^[ \t]*import\b[^\n]*/gm) || [];
  if (importLines.length === 0) return false;
  const binding = new RegExp(
    [
      // { name } / { name as alias } / { a, name }
      `(?:[{,]\\s*${esc}\\s*(?:as\\s+[\\w$]+\\s*)?[,}])`,
      // { other as name } —— 别名绑定到本地名（漏这条 ⇒ 别名导入被误判未声明，实测）
      `(?:\\{[^}]{0,200}?\\bas\\s+${esc}\\s*[,}])`,
      // import name from '...'
      `(?:^[ \\t]*import\\s+${esc}\\s+from)`,
      // import * as name from '...'
      `(?:^[ \\t]*import\\s+\\*\\s+as\\s+${esc}\\s+from)`,
    ].join('|'),
  );
  return importLines.some((line) => binding.test(line));
}

/**
 * 产物是否**提到**任一微码运行时标识符（触发后处理的总判据）。
 * 这是 ① 号门的修正：不再只看 `$mcComponentBuilder`。
 * @param {string} content
 * @returns {boolean}
 */
export function hasRuntimeIdentifiers(content) {
  if (!content || typeof content !== 'string') return false;
  return RUNTIME_IDENT_NAMES.some((name) => isReferenced(content, name));
}

/**
 * 找出「被引用但未声明」的标识符名（`$mcComponentBuilder` 除外，见 RUNTIME_LOCAL_NAMES）。
 * @param {string} content
 * @returns {string[]}
 */
export function findUndeclaredRuntimeIdents(content) {
  if (!content || typeof content !== 'string') return [];
  return RUNTIME_LOCAL_NAMES.filter(
    (name) => isReferenced(content, name) && !isDeclared(content, name),
  );
}

/**
 * 为未声明标识符生成兜底声明行。
 * @param {string[]} names
 * @returns {string[]}
 */
export function buildRuntimeStubDecls(names = []) {
  const lines = [];
  for (const name of names) {
    if (name === 'runtimeBuilder') {
      lines.push(`const runtimeBuilder = ${RUNTIME_BUILDER_STUB}`);
    } else {
      // componentProps / businessProps 是对象；componentApi 允许为 null
      lines.push(`const ${name} = ${name === 'componentApi' ? 'null' : '{}'}`);
    }
  }
  return lines;
}

/**
 * 把兜底声明注入 SFC 的 `<script>` 开头（必须在任何引用之前）。
 *
 * 返回 `injected:false` 表示**无法自动修复**（无 `<script>` 块 / 内容非法）——
 * 调用方必须据此上报，绝不允许静默放过：这正是 ① 号门当初的病根（跑不了就什么都不说）。
 *
 * @param {string} content SFC 原文
 * @param {string[]} names 未声明标识符
 * @param {{ filePath?: string }} [options]
 * @returns {{ content: string, injected: boolean, decls: string[] }}
 */
export function injectRuntimeStubs(content, names = [], options = {}) {
  const decls = buildRuntimeStubDecls(names);
  if (!content || typeof content !== 'string' || decls.length === 0) {
    return { content, injected: false, decls: [] };
  }
  const scriptRe = /<script\b([^>]*)>/i;
  const m = scriptRe.exec(content);
  if (!m) {
    return { content, injected: false, decls };
  }
  const tag = m[0];
  const banner =
    `\n// 🛡️ 运行时标识符兜底（vue3 无平台注入；根因 G · ${options.filePath || 'index.vue'}）\n` +
    `${decls.join('\n')}\n`;
  return {
    content: content.replace(tag, `${tag}${banner}`),
    injected: true,
    decls,
  };
}

/**
 * 平台事件总线调用点的短路替换文本。
 * 语义：`void 0 && <member>` 的右侧**永不求值** ⇒ 既不会 ReferenceError（标识符未声明），
 * 也不会 TypeError（标识符为 null）——旧实现只挡住后者，前者才是白屏真凶。
 */
export const RUNTIME_BUILDER_NOOP_REF =
  '/* vue3 无平台事件总线 */ void 0 && runtimeBuilder.publishEvent';

/**
 * 只对 `<script>` 块做变换（返回原文其余部分不变）。
 *
 * 🔴 为什么不能全文替换（2026-11-11 实测）：模板里的 `{{ runtimeBuilder.publishEvent('x') }}`
 *   是**模板表达式**，被替换成 `void 0 && ...` 后既不是合法 Vue 表达式、也把「模板引用应由
 *   setup 绑定解析」这条链路掩盖掉。模板层的正确处置是**注入 setup 声明**（让它能解析），
 *   而不是改写表达式；无 `<script>` 块时无法注入 ⇒ 走 `injected:false` 上报。
 *
 * @param {string} content
 * @param {(block:string)=>string} fn
 * @returns {string}
 */
function mapScriptBlocks(content, fn) {
  return content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => fn(block));
}

/**
 * SFC 级运行时标识符中和器（**唯一实现**，自动修复层与 vue3 生成链路共用）。
 *
 * 三步为一组，缺一即复发：
 *   ① `$mcComponentBuilder()` → 安全对象字面量（保持解构成员可读，且 runtimeBuilder 为 no-op 对象）；
 *   ② `runtimeBuilder.publishEvent` → 短路表达式（含可选链 / 空格变体）；
 *   ③ 剩余「引用但未声明」的标识符 → 注入兜底声明（无 `<script>` 时 `injected:false` 上报）。
 *
 * 🔴 **幂等**（2026-11-11 补）：`RUNTIME_BUILDER_NOOP_REF` 文本里含 `runtimeBuilder.publishEvent`，
 *   重复中和时会被正则**自我套娃**（`void 0 && void 0 && ...` 无限增长）。而同一产物确实会被
 *   处理两次（`code-validator` 2.6.1 段与 2.6.1.b 段先后扫同一 `index.vue`）⇒ 必须已中和的跳过我。
 *
 * @param {string} content SFC 原文
 * @param {{ filePath?: string }} [options]
 * @returns {{ content: string, changed: boolean, undeclared: string[], injected: boolean }}
 */
export function neutralizeSfcRuntimeIdents(content, options = {}) {
  if (!content || typeof content !== 'string' || !hasRuntimeIdentifiers(content)) {
    return { content, changed: false, undeclared: [], injected: false };
  }
  let next = mapScriptBlocks(content, (block) =>
    block
      .replace(/\$mcComponentBuilder\s*\(\s*\)/g, MC_BUILDER_STUB_EXPR)
      .replace(
        /runtimeBuilder\s*\??\s*\.\s*publishEvent/g,
        // 已处于 `void 0 &&` 短路右侧 ⇒ 保留原样（幂等守卫，避免自我套娃）
        (match, offset, whole) =>
          /void 0\s*&&\s*$/.test(whole.slice(Math.max(0, offset - 24), offset))
            ? match
            : RUNTIME_BUILDER_NOOP_REF,
      ),
  );
  const undeclared = findUndeclaredRuntimeIdents(next);
  const stub = injectRuntimeStubs(next, undeclared, options);
  if (stub.injected) next = stub.content;
  return {
    content: next,
    changed: next !== content,
    undeclared,
    injected: stub.injected,
  };
}

/**
 * 产物级（多文件）中和器：`{ path: content }` 对象或 `[{path, content}]` 数组均可。
 *
 * 返回结构刻意区分三类，便于调用方**分别处置**（这正是旧实现缺的维度）：
 *   - `changed`：确实被中和的文件（可日志/可统计）；
 *   - `unfixable`：有未声明标识符但**无法注入**（无 `<script>`）⇒ 必须上报/判死；
 *   - `files`：中和后的产物（形状与原入参一致）。
 *
 * @param {Record<string,string>|Array<{path:string,content:string}>} files
 * @returns {{ files: any, changed: Array<{filePath:string, idents:string[]}>, unfixable: Array<{filePath:string, idents:string[]}> }}
 */
export function neutralizeFilesRuntimeIdents(files) {
  const changed = [];
  const unfixable = [];
  if (!files || typeof files !== 'object') return { files, changed, unfixable };

  if (Array.isArray(files)) {
    const out = files.map((f) => {
      if (!f || typeof f.content !== 'string') return f;
      if (!String(f.path || '').endsWith('.vue')) return f;
      const res = neutralizeSfcRuntimeIdents(f.content, { filePath: f.path });
      // 🔴 无法中和的判定必须**先于**「有无改动」：无 `<script>` 块时 changed=false，
      //   若按 changed 早退，这条上报通道永远走不到（= 静默放过，正是 ④ 号门的病根）。
      if (!res.injected && res.undeclared.length > 0) {
        unfixable.push({ filePath: f.path, idents: res.undeclared });
        return f;
      }
      if (!res.changed) return f;
      changed.push({ filePath: f.path, idents: res.undeclared });
      return { ...f, content: res.content };
    });
    return { files: out, changed, unfixable };
  }

  const out = { ...files };
  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !filePath.endsWith('.vue')) continue;
    const res = neutralizeSfcRuntimeIdents(content, { filePath });
    if (!res.injected && res.undeclared.length > 0) {
      unfixable.push({ filePath, idents: res.undeclared });
      continue;
    }
    if (!res.changed) continue;
    changed.push({ filePath, idents: res.undeclared });
    out[filePath] = res.content;
  }
  return { files: out, changed, unfixable };
}

export default {
  RUNTIME_IDENT_NAMES,
  RUNTIME_LOCAL_NAMES,
  RUNTIME_BUILDER_STUB,
  RUNTIME_BUILDER_NOOP_REF,
  MC_BUILDER_STUB_EXPR,
  isReferenced,
  isDeclared,
  hasRuntimeIdentifiers,
  findUndeclaredRuntimeIdents,
  buildRuntimeStubDecls,
  injectRuntimeStubs,
  neutralizeSfcRuntimeIdents,
  neutralizeFilesRuntimeIdents,
};
