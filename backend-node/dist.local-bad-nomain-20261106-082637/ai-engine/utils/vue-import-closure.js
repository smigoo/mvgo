/**
 * Vue SFC「相对 .vue import 闭包」判据 —— 单一事实源。
 *
 * 背景（2026-09-15 · mc-max-1789446564243-f64ecbed 实锤）：
 * 微码/vue3 组件的子组件是**并行**生成的，index.vue 常常先于某个子组件 chunk 完成。
 * 此刻若把累积产物推成候选快照 / 当作预览源，就会出现「产物看起来完整（有 <template>、
 * 有 <script>、LESS 合法），但 index.vue 里 import 的 `package/components/ContentIndicator.vue`
 * 既不在清单里也不在磁盘上」的中间态 → 预览拉该文件 404 →
 * 前端报「组件文件缺失或路径不正确（groupId / componentId 不匹配）。原始错误：找不到文件: …」。
 *
 * 事实源：**已落地的文件集合** + index.vue 的相对 import 声明。
 * 两处消费方共用本模块，禁止各自写一套（两侧判据漂移会出现「推送放行但预览拒绝」的割裂）：
 *   ① tasks/task-code-snapshot.service.ts#isRenderableRevision —— 预览取源（磁盘 + manifest）
 *   ② ai-engine/roles/microcode/chunk-snapshot-pusher.js —— 候选快照推送（内存 allFiles）
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测。
 */

/**
 * 抽出 SFC 里的「相对 .vue」静态 import specifier。
 *
 * 覆盖形态：默认导入 / 具名导入 / 命名空间导入 / 混合导入 / 副作用导入，
 * 以及 `export ... from './x.vue'`（子组件再导出场景）。
 * 只认相对路径（`.` 开头）：裸模块（vue / echarts / 子组件白名单）由预览运行时注入，不属闭包。
 *
 * 前置边界字符集必须含 `>`：真机 SFC 常见 `<script setup>import X from './a.vue'` 同行写法，
 * 漏掉 `>` 会**静默漏匹配**（假阴性比多匹配更危险 —— 判据会放过悬空 import）。
 *
 * @param {string} source
 * @returns {string[]} 相对 specifier 列表（保持出现顺序，允许重复）
 */
export const REL_VUE_IMPORT_RE =
  /(?:^|[\s;{(>])(?:import|export)\s+(?:[\w$*{}\s,]+\s+from\s+)?['"](\.[^'"]+\.vue)['"]/g;

export function extractRelativeVueImports(source) {
  const out = [];
  if (typeof source !== 'string' || source.length === 0) return out;
  REL_VUE_IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = REL_VUE_IMPORT_RE.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * 把相对 specifier 解析为清单风格的正斜杠路径（相对于产物根）。
 *
 * 越界语义与各处 resolveInside 一致：`..` 逐级回退，逃出根即返回 null（调用方判不完整）。
 * 纯计算，不做文件系统访问，可在单测里直接断言。
 *
 * @param {string} fromPath 引用方路径（如 'package/index.vue'）
 * @param {string} spec 相对 specifier（如 './components/A.vue'）
 * @returns {string|null} 归一化路径；越界返回 null
 */
export function resolveRelativeModulePath(fromPath, spec) {
  const stack = String(fromPath || '').split('/').slice(0, -1);
  for (const part of String(spec || '').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.length === 0 ? null : stack.join('/');
}

/**
 * 从入口出发做 BFS，返回「闭包缺口」清单（空数组 = 闭包完整）。
 *
 * @param {string} entryPath 入口路径（通常 'package/index.vue'）
 * @param {(path: string) => (string|null)} readFile 读取器：读不到（不存在/越界/索引无）返回 null。
 *        由调用方注入，使磁盘（预览取源）与内存（快照推送）共用同一套遍历逻辑。
 * @returns {string[]} 缺口描述列表，形如 ['package/components/A.vue', 'escape:../../x.vue']
 */
export function collectMissingVueImports(entryPath, readFile) {
  const missing = [];
  if (typeof readFile !== 'function') return missing;
  const visited = new Set();
  const queue = [entryPath];
  // 读取结果缓存：同一目标被多文件引用时只读一次（磁盘读取器下避免重复 IO）
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) {
      let content = null;
      try {
        const raw = readFile(p);
        if (typeof raw === 'string') content = raw;
      } catch {
        content = null;
      }
      cache.set(p, content);
    }
    return cache.get(p);
  };
  const reportOnce = (key) => {
    if (!missing.includes(key)) missing.push(key);
  };

  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const content = read(cur);
    if (content === null) {
      reportOnce(cur);
      continue;
    }
    for (const spec of extractRelativeVueImports(content)) {
      const target = resolveRelativeModulePath(cur, spec);
      if (!target) {
        reportOnce(`escape:${spec}`);
        continue;
      }
      if (visited.has(target)) continue;
      if (read(target) === null) {
        visited.add(target);
        reportOnce(target);
        continue;
      }
      if (!queue.includes(target)) queue.push(target);
    }
  }
  return missing;
}
