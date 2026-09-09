/**
 * P1-Slice2（增量补丁式更新）：分块快照推送器。
 *
 * ## 根因（这是「一会儿一小部分、之前的不见了」的直接成因）
 *
 * 旧实现的两个动作分散在 runChunk 内外：
 *   - 推送 onFilesReady 在 **runChunk 内部**（`{ ...allFiles, ...res.files }`）
 *   - `Object.assign(allFiles, res.files)` 却在 **runChunk 外部**（各调用处：子组件 worker /
 *     style chunk / script chunk…）
 *
 * 而 `{ ...allFiles, ...res.files }` 是在**调用时刻求值**的。子组件是**并行**生成的
 * （`genSubComponents`，默认并发 2），worker 之间会交错：
 *
 *   1. worker A：runChunk 推送 → revision₁ = { A }（此刻 allFiles 还没 A，B 也还没生成）
 *   2. worker A：Object.assign(allFiles, A)
 *   3. worker B：runChunk 推送 → 若此时 allFiles 尚未合并 A，revision₂ = { B } ← **A 丢了**
 *
 * `createCandidate` 每次都会把候选指针指向新 revision，于是前端/预览看到的产物**回退**成
 * 「只剩最后一个子组件」——正是用户观察到的「之前的不见了」。
 *
 * ## 修复
 * 把「合并」前移到「推送」之前，两者原子地放在一起：
 * 先 `Object.assign(allFiles, resFiles)`，再推送 `{ ...allFiles }`。
 * 这样无论 worker 如何交错，每次推送的都是**累积全量**，候选指针单调不回退。
 *
 * 注：调用处原有的 `Object.assign` 保留也无害（幂等），但本函数是唯一权威入口。
 *
 * @param {object} params
 * @param {Record<string,string>} params.allFiles 累积产物 map（就地修改）
 * @param {Record<string,string>} params.resFiles 本块产出
 * @param {(data:{stage:string, files:Record<string,string>}) => Promise<void>} params.onFilesReady
 * @param {string} params.stage 阶段名（写进快照 stage）
 * @param {{warn?: Function}} [params.logger] 可选日志器
 * @returns {Promise<void>} 永远 resolve，推送失败不阻断主流程
 */
/**
 * Slice2b · 运行时不变量监控：上一次推送的文件集合，按 allFiles 对象隔离。
 *
 * 用 WeakMap 以 `allFiles`（每次 generation 一个稳定对象引用）为键：
 *  - 不同 generation 互不干扰（不会把上一次任务的集合当成基线）
 *  - allFiles 被 GC 时条目自动释放，无内存泄漏
 *
 * 目的：把「我相信修好了」变成「日志会告诉我们」。一旦某次推送的累积产物比上次
 * 少了文件，立刻告警并列出丢失项 —— 将来若有人引入新的推送点或更激进的剪枝，
 * 回退会在日志里马上暴露，而不是等用户在 UI 上发现「之前的不见了」。
 */
const _lastPushedKeys = new WeakMap();

export async function pushChunkSnapshot({
  allFiles,
  resFiles,
  onFilesReady,
  stage,
  logger,
} = {}) {
  const safeAllFiles =
    allFiles && typeof allFiles === 'object' ? allFiles : {};
  const safeResFiles =
    resFiles && typeof resFiles === 'object' ? resFiles : {};

  // ① 先合并：本块结果进入累积产物。必须在推送之前，否则并行 worker 会互相覆盖快照。
  Object.assign(safeAllFiles, safeResFiles);

  // ⚠️ 必须包一层箭头函数保留 this 绑定，不能直接取 `logger.warn` 裸引用。
  // 真实 logger（ai-engine/logger/logger.js）内部是 `this.log('warn', ...)`：
  // 裸引用调用时 this === undefined → TypeError → **整个 Node 进程崩溃**。
  // 同类 bug 已在 save-checkpoint.js 实锤并修复（2026-09-02）。
  const warn =
    logger && typeof logger.warn === 'function'
      ? (...args) => logger.warn(...args)
      : null;

  // ①b 不变量监控：与上次推送的集合比对，发现丢失立即告警（非阻断）。
  // 注意：这里比的是「上次推送集合」而非「历史最大集合」——后者在发生一次合法剪枝后
  // 会对后续每次推送都重复告警，变成无人看的噪声；前者只在真正回退的那一跳告警一次。
  const prevKeys = _lastPushedKeys.get(safeAllFiles);
  const curKeys = Object.keys(safeAllFiles);
  if (prevKeys && prevKeys.size > 0) {
    const curSet = new Set(curKeys);
    const missing = [...prevKeys].filter((k) => !curSet.has(k));
    if (missing.length > 0 && warn) {
      warn('⚠️ 候选快照回退（增量补丁不变量被破坏）', {
        from: prevKeys.size,
        to: curKeys.length,
        missing,
        stage,
        hint: '若本轮执行过 _pruneOrphanSubComponents 孤儿剪枝属预期；否则说明有推送点在推不完整快照，用户会看到「之前的不见了」',
      });
    }
  }
  _lastPushedKeys.set(safeAllFiles, new Set(curKeys));

  // ② 本块无产物时不推送：避免用「不完整快照」把候选指针顶掉。
  if (Object.keys(safeResFiles).length === 0) return;
  if (typeof onFilesReady !== 'function') return;

  // ②b 半成品 SFC 中间态守卫（2026-09-02 事故 mc-max-1788327432319-a6198738）：
  // index.vue 分块生成时，template chunk 与 script chunk 分别以「半成品 SFC」
  // 整体覆盖 allFiles['package/index.vue']（template-only / script-only）。
  // 此刻若推送，候选指针指向半成品 → 预览渲染空白，用户看到「突然一片空白、
  // index.vue 只剩 script」。半成品（缺 <template> 或 <script>）不推送，
  // 等拼装完成后的完整版再推；合并（①）已执行，累积产物不受影响。
  const idxContent = safeAllFiles['package/index.vue'];
  if (
    typeof idxContent === 'string' &&
    idxContent.length > 0 &&
    (!/<template[\s>]/i.test(idxContent) || !/<script[\s>]/i.test(idxContent))
  ) {
    return;
  }

  try {
    // ③ 推送累积全量（已含本块结果）
    await onFilesReady({ stage, files: { ...safeAllFiles } });
  } catch (error) {
    // 非阻断：快照推送失败不得影响生成主流程，产物已在 ① 合并进 allFiles
    if (warn) {
      warn('增量候选快照发布失败（非阻断）', {
        error: error && error.message ? error.message : String(error),
      });
    }
  }
}
