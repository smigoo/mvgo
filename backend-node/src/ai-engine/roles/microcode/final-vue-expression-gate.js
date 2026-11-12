import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateVueSfcExpressions } from '../../utils/sfc-syntax-validation.js';

/**
 * 🛡️ 产物终验：表达式级最后闸（2026-11-12 · mc-1794463362140-8fa6d6f3 实锤）。
 *
 * 病灶（两个，叠加导致「组件加载失败 Unexpected token, expected "," (55:217)」到达用户）：
 *   ① 写盘出口自愈链（刀 49/55/56、S6、资源 import 终验兜底、bg 挂载注入等）在多轮
 *      writeFiles 之间反复改写内存并多次落盘；某轮注入坏 `:style`（对象字面量后被拼
 *      CSS 残留：`:style="{...};display:flex;flex-direction:row;align-items:center"`）
 *      落盘成功，随后轮次才被单文件门禁拦下 —— 但门禁只拦「新写」，**不回滚旧写**
 *      ⇒ 磁盘停留在坏版上，前端 vue3-sfc-loader 加载即炸。
 *   ② 各直写点（microcode-engineer 内 writeFileSync）不经过 writeFiles 单文件门禁。
 *
 * 终验以**磁盘事实**为准：writeFiles 收尾时对本轮写入的全部 `.vue` 逐个跑
 * `validateVueSfcExpressions`（只查模板表达式/script/SFC parse，不跑 less，
 * 避免与既有 less 门禁重复与假阳性）。失败文件的处理顺序：
 *   ① code-chunks 缓存回退（与 pickCachedChunkLastGood 同构，判据②换成 .vue 终验；
 *      实证 mc-max-1794464735884-cfe8977a 手工从缓存救回 ChartSection.vue 有效）；
 *   ② 无合法候选 ⇒ 删除坏文件（与写盘门禁「坏文件不落盘」同一语义，
 *      上游 code-validator 兜底/完整性断言会显式报缺，不静默交付坏组件）。
 *
 * 独立成模块的原因：与 cached-chunk-last-good.js 相同 —— file-writer 顶层依赖重
 * （spec 需 mock backend-root），纯函数独立后可直接单测。
 *
 * @param {string} outputPath 产物根目录
 * @param {string[]} writtenVueFiles 本轮成功写入的 .vue 相对路径（writeFiles 的 writtenFiles 过滤 .vue）
 * @param {{logger?: {warn?:Function, error?:Function}}} [options]
 * @returns {{checked: number, bad: Array<{path:string, errors:string[], action:string, restoredFrom: (string|null)>}}}
 *   永不 throw：终检自身异常按 0 坏档处理（保守，不阻断主流程）。
 */
export function runFinalVueExpressionGate(outputPath, writtenVueFiles, options = {}) {
  const out = { checked: 0, bad: [] };
  try {
    // 🛡️ allVueOnDisk（2026-11-12 · 3cdc4757）：终局扫描口径——以磁盘事实为准列全量 .vue，
    //   不依赖调用方登记（调用方清单可能漏掉早轮写入/编辑器新产的文件）。
    let files = (Array.isArray(writtenVueFiles) ? writtenVueFiles : []).filter(
      (p) => typeof p === 'string' && p.endsWith('.vue'),
    );
    if (options.allVueOnDisk && outputPath) {
      const walk = (dir, acc) => {
        let entries = [];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return acc;
        }
        for (const e of entries) {
          const full = join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.mc-gen') continue;
            walk(full, acc);
          } else if (e.isFile() && e.name.endsWith('.vue')) {
            acc.push(full);
          }
        }
        return acc;
      };
      files = walk(outputPath, []).map((abs) => abs.slice(String(outputPath).length + 1));
    }
    for (const relPath of files) {
      out.checked += 1;
      const absPath = join(outputPath, relPath);
      if (!existsSync(absPath)) continue;
      let disk;
      try {
        disk = readFileSync(absPath, 'utf-8');
      } catch {
        continue; // 读不到视为他人职责，不拦
      }
      const res = validateVueSfcExpressions(disk, relPath);
      if (res.valid) continue;

      // ① 缓存回退：chunk-meta.json 登记的候选倒序，取第一个过终验的
      const restored = restoreFromChunkCache(outputPath, relPath);
      if (restored) {
        try {
          writeFileSync(absPath, restored, 'utf-8');
          out.bad.push({
            path: relPath,
            errors: res.errors.slice(0, 3),
            action: 'restored-from-cache',
            restoredFrom: 'code-chunks',
          });
          options.logger?.warn?.(
            `🛡️ 产物终验：${relPath} 表达式编译失败，已从 code-chunks 缓存回退合法版（${restored.length}B）`,
            { errors: res.errors.slice(0, 2) },
          );
          continue;
        } catch {
          // 写回失败则继续走删除分支
        }
      }

      // ② 无合法候选：删除坏文件（坏文件不留在产物）
      //    🛡️ removeIfNoCache=false（终局扫描口径，2026-11-12 · 3cdc4757 实锤）：
      //    发布前最后一次扫描**不能删**——index.vue 已 import 该组件，删除=悬空引用
      //    必炸加载。此时保留原文件（best effort）并上报 left-in-place，由降级链定级。
      if (options.removeIfNoCache === false) {
        out.bad.push({
          path: relPath,
          errors: res.errors.slice(0, 3),
          action: 'left-in-place',
          restoredFrom: null,
        });
        options.logger?.warn?.(
          `🛡️ 终局扫描：${relPath} 编译失败且无缓存可回退，保留原文件（发布前不删防悬空 import）`,
          { errors: res.errors.slice(0, 2) },
        );
        continue;
      }
      try {
        unlinkSync(absPath);
        out.bad.push({
          path: relPath,
          errors: res.errors.slice(0, 3),
          action: 'removed',
          restoredFrom: null,
        });
        options.logger?.error?.(
          `🚫 产物终验：${relPath} 表达式编译失败且无缓存可回退，已从产物移除（坏文件不交付）`,
          { errors: res.errors.slice(0, 2) },
        );
      } catch (rmErr) {
        options.logger?.error?.(
          `🚫 产物终验：${relPath} 表达式编译失败，且移除失败（${rmErr?.message || rmErr}）——坏文件仍留在产物中`,
          { errors: res.errors.slice(0, 2) },
        );
        out.bad.push({
          path: relPath,
          errors: res.errors.slice(0, 3),
          action: 'remove-failed',
          restoredFrom: null,
        });
      }
    }
  } catch {
    // 终检自身异常：保守放行（不阻断主流程），与 pickCachedChunkLastGood 同款纪律
  }
  return out;
}

/**
 * 从 code-chunks 缓存找过终验的 .vue 候选（pickCachedChunkLastGood 的 .vue 版）。
 * 判据：① chunk-meta.json#files[relPath] 有登记；② 候选文本自身过终验。
 * 不比较 class 前缀（.vue 的模板结构差异大，前缀判据不适用；候选过终验即安全）。
 * @returns {string|null}
 */
function restoreFromChunkCache(outputPath, relativePath) {
  try {
    const chunkDir = join(outputPath, '.mc-gen', 'cache', 'code-chunks');
    const metaPath = join(chunkDir, 'chunk-meta.json');
    if (!existsSync(metaPath)) return null;
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const entries = (meta && meta.files && meta.files[relativePath]) || [];
    if (!Array.isArray(entries) || entries.length === 0) return null;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const name = entries[i] && entries[i].file;
      if (!name) continue;
      const p = join(chunkDir, name);
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, 'utf-8');
      if (!raw || raw.trim().length < 10) continue;
      const g = validateVueSfcExpressions(raw, relativePath);
      if (g.valid) return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export default runFinalVueExpressionGate;
