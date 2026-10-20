import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateStandaloneLessWrite } from '../../validators/less-compile-gate.js';

/**
 * 🛡️ L2-a（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）：从**分块缓存**取合格版样式。
 *
 * 病灶：写盘门禁判坏的降级链只认「磁盘 last-good」。新任务首次写盘时磁盘上是空的
 *   （或上一轮已写成 15 行兜底模板），于是 `_hasLastGood === false` ⇒ 走
 *   `rebalanceBlockComments` 复检 ⇒ 仍失败 ⇒ `skippedFiles.push` ⇒ 由
 *   `code-validator.js` 补兜底模板覆盖。
 *   而本轮 LLM 的原始产物其实躺在 `.mc-gen/cache/code-chunks/<idx>-<name>` 里，
 *   且它自身**能过门禁**（195c8d0e 实测：641 行、括号 26:26、覆盖模板 53/56 class、
 *   `gateStandaloneLessWrite` 返回 ok:true）—— 有可回退的好版本却没用上，
 *   最终 19 个布局容器类零定义。
 *
 * 判据（三道，任一不过即淘汰该候选）：
 *   ① `chunk-meta.json#files[relativePath]` 有登记（不扫目录 ⇒ 不会误取上一次运行的遗留分块）；
 *   ② 候选文本自身过 `gateStandaloneLessWrite`（与写盘门禁同一实现，不引入第二份判据）；
 *   ③ 候选与**本轮 LLM 输出**的 class 前缀一致（防旧前缀分块，如 `2-...common.less`
 *      用的是 `.c-component-*` 而本轮是 `.c-195c8d-*`）。
 *
 * 独立成模块（不放进 file-writer.js）的原因：file-writer 顶层 import 链会拉进
 * logger/element-coverage-validator 等重量级依赖（spec 里需 mock backend-root 才能加载），
 * 而本函数是纯文件读取 + 纯判据，独立后可直接单测。
 *
 * @param {string} outputPath 产物根目录
 * @param {string} relativePath 目标相对路径（如 'resources/styles/common.less'）
 * @param {string} thisRoundContent 本轮 LLM 输出（用于推断合法 class 前缀）
 * @returns {string|null} 过门禁的候选文本（已 heal），或 null
 */
export function pickCachedChunkLastGood(outputPath, relativePath, thisRoundContent = '') {
  try {
    const chunkDir = join(outputPath, '.mc-gen', 'cache', 'code-chunks');
    const metaPath = join(chunkDir, 'chunk-meta.json');
    if (!existsSync(metaPath)) return null;
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const entries = (meta && meta.files && meta.files[relativePath]) || [];
    if (!Array.isArray(entries) || entries.length === 0) return null;

    // 本轮前缀（LLM 输出的首个类选择器前缀），用于拒绝历史遗留分块
    const prefMatch = /\.(c-[a-z0-9]+)-[A-Za-z0-9_-]+\s*\{/i.exec(String(thisRoundContent || ''));
    const expectPrefix = prefMatch ? prefMatch[1] : null;

    // 倒序：同一目标若有多个分块记录，后写的更新
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const name = entries[i] && entries[i].file;
      if (!name) continue;
      const p = join(chunkDir, name);
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, 'utf-8');
      if (!raw || raw.trim().length < 10) continue;
      if (expectPrefix && !raw.includes(`.${expectPrefix}-`)) continue;
      const g = gateStandaloneLessWrite(raw, relativePath);
      if (!g.ok) continue;
      return g.content;
    }
    return null;
  } catch {
    return null; // 任何异常都退回原降级链（保守）
  }
}

export default pickCachedChunkLastGood;
