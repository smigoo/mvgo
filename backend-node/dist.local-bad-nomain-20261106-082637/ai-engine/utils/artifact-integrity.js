/**
 * 🛡️ R5：生成产物完整性硬门禁（2026-08-30）
 *
 * ## 问题（组件二 mc-max-1788065992847-affbab38 / 组件三 b401bed4 实锤）
 *
 * 死链（两组件完全同构）：
 *
 * ```
 * engineer 生成完成（产物在内存 allFiles）
 *    ↓ 末端校验一票否决（资源未使用 / 语义不完整）
 *    ↓ 判「可重试」→ used=1 >= budget=1 → 放弃重试
 *    ↓ 吞错继续（不 fail-closed）
 *    ↓ L0-B 空集恒真 → pass=true, Issues=0
 *    ↓ do-not-invent 通过 → generate-runtime-verify 门禁跳过
 *    ↓ complete 节点照常跑完（孤儿清理 / Less 检查 / scoped 扫描全部空转）
 *    ↓ workspace-preview-publisher 回滚 → 「生成产物缺少 package/index.vue」
 * ```
 *
 * 即：**整轮跑到最后一步才发现没有主入口**，中间所有后处理全白跑，
 * 且前端拿到的是一条与真实断点无关的兜底文案。
 *
 * ## 改法
 * - `complete` 节点**第一步**就做集合级完整性校验（必存在且非空 `package/index.vue`；
 *   微码额外 `declare.json` + `resources/styles/common.less`）。
 * - 缺失 / 空文件 / 只有 script 没有 template（P1-5 已实锤 141/190 残片）→ throw，
 *   错误带缺失清单 + 上游失败原因，不再静默走到发布阶段。
 *
 * ## 边界（刻意保持保守，避免误杀）
 * - 只做「存在 + 非空 + 有 template」三件事，**不校验语法**（语法归 L0-B 与 LESS 门禁）。
 * - 与 `file-integrity.js` 分工不同：后者是**单文件内容级**校验（写盘前拦截截断），
 *   本模块是**产物集合级**校验（收口时确认主入口存在）。
 * - 纯函数（`planArtifactIntegrity`）与 IO（`assertArtifactIntegrity`）分离，前者可单测。
 */

/** 各组件类型的必需产物（相对组件根目录） */
const REQUIRED_BY_TYPE = {
  microcode: ['package/index.vue', 'declare.json', 'resources/styles/common.less'],
  vue3: ['package/index.vue'],
  lite: ['package/index.vue'],
};

const DEFAULT_REQUIRED = ['package/index.vue'];

export function normalizeRelPath(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

/**
 * 取某组件类型的必需产物清单
 * @param {string} componentType microcode | vue3 | lite | 其它（回落到默认）
 * @returns {string[]}
 */
export function getRequiredArtifacts(componentType) {
  const key = String(componentType || '').toLowerCase();
  return REQUIRED_BY_TYPE[key] ? [...REQUIRED_BY_TYPE[key]] : [...DEFAULT_REQUIRED];
}

/**
 * 归一化入参 → `[{ path, content }]`
 * 支持三种形态：对象 map（`{'package/index.vue': '...'}`）、
 * 数组项（`[{path, content}]`）、纯路径数组（`['package/index.vue']`，content 视为未提供）。
 *
 * @param {Array|Object} entries
 * @returns {Array<{path:string, content:string|null}>}
 */
export function normalizeEntries(entries) {
  const out = [];
  if (!entries) return out;
  if (Array.isArray(entries)) {
    for (const item of entries) {
      if (typeof item === 'string') {
        out.push({ path: normalizeRelPath(item), content: null });
      } else if (item && typeof item === 'object') {
        out.push({
          path: normalizeRelPath(item.path || item.relPath || item.file),
          content: item.content == null ? null : String(item.content),
        });
      }
    }
    return out;
  }
  if (typeof entries === 'object') {
    for (const [path, content] of Object.entries(entries)) {
      out.push({
        path: normalizeRelPath(path),
        content: content == null ? null : String(content),
      });
    }
  }
  return out;
}

/**
 * 纯函数：判定产物集合是否完整
 *
 * @param {Array|Object} entries 见 `normalizeEntries`
 * @param {{componentType?: string, requireTemplate?: boolean, indexVuePath?: string}} options
 * @returns {{ok: boolean, required: string[], missing: Array<{path:string, code:string, reason:string}>}}
 */
export function planArtifactIntegrity(entries = [], options = {}) {
  const componentType = options.componentType || 'microcode';
  const requireTemplate = options.requireTemplate !== false;
  const indexVuePath = normalizeRelPath(options.indexVuePath || 'package/index.vue');
  const required = getRequiredArtifacts(componentType);

  const list = normalizeEntries(entries);
  const byPath = new Map();
  for (const item of list) {
    if (!item.path) continue;
    // 同路径重复出现（如多段写入）时，取「内容最长」的一份，避免被空段覆盖判定
    const prev = byPath.get(item.path);
    if (!prev || (item.content || '').length > (prev.content || '').length) {
      byPath.set(item.path, item.content);
    }
  }

  const missing = [];
  for (const path of required) {
    if (!byPath.has(path)) {
      missing.push({ path, code: 'MISSING', reason: '文件不存在' });
      continue;
    }
    const content = byPath.get(path) || '';
    if (!content.trim()) {
      missing.push({ path, code: 'EMPTY', reason: '文件为空（0 字节或仅空白）' });
      continue;
    }
    // 主入口「只有 script 没有 template」的残片（P1-5 实锤：190 个 chunk-meta 里 141 个如此）
    if (requireTemplate && normalizeRelPath(path) === indexVuePath) {
      if (!/<template[\s>]/.test(content)) {
        missing.push({
          path,
          code: 'NO_TEMPLATE',
          reason: '主入口缺少 <template>（疑似分块残片，仅剩 script）',
        });
      }
    }
  }

  return { ok: missing.length === 0, required, missing };
}

/**
 * 构造统一的完整性错误（供 graph fail-closed 抛出）
 *
 * @param {{ok:boolean, missing:Array}} result `planArtifactIntegrity` 的返回值
 * @param {{outputPath?: string, upstreamError?: string, degradedFiles?: string[], componentType?: string}} context
 * @returns {Error & {code:string, artifactIntegrity:object}}
 */
export function buildArtifactIntegrityError(result = {}, context = {}) {
  const missing = Array.isArray(result.missing) ? result.missing : [];
  const fileList = missing.map((m) => `${m.path}（${m.reason}）`).join('；');
  const degraded = Array.isArray(context.degradedFiles) && context.degradedFiles.length
    ? `已降级文件: ${context.degradedFiles.join(', ')}。`
    : '';
  const upstream = context.upstreamError ? `上游失败原因: ${context.upstreamError}。` : '';
  const message = `生成产物不完整，禁止标记完成 —— 缺失 ${missing.length} 项: ${fileList}。${upstream}${degraded}`;

  const error = new Error(message);
  error.code = 'ARTIFACT_INCOMPLETE';
  error.artifactIntegrity = {
    missing,
    required: result.required || [],
    outputPath: context.outputPath || null,
    componentType: context.componentType || null,
  };
  return error;
}

/**
 * IO 版：扫描组件根目录并校验完整性（不 throw，交由调用方决定 fail-closed）
 *
 * @param {string} outputPath 组件根目录（含 package/ 与 resources/）
 * @param {{componentType?: string, requireTemplate?: boolean, fs?: any, path?: any}} options
 * @returns {Promise<{ok:boolean, required:string[], missing:Array}>}
 */
export async function assertArtifactIntegrity(outputPath, options = {}) {
  const required = getRequiredArtifacts(options.componentType || 'microcode');
  const fs = options.fs || (await import('fs'));
  const { join } = options.path || (await import('path'));

  const entries = [];
  for (const rel of required) {
    let content = null;
    try {
      content = fs.readFileSync(join(outputPath, rel), 'utf-8');
    } catch (e) {
      content = null; // 不存在 → MISSING
    }
    entries.push({ path: rel, content });
  }

  return planArtifactIntegrity(entries, options);
}
