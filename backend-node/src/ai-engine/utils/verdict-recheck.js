/**
 * 判决复核 util（根治③）——从 mc-component-graph-phase2 抽出独立模块：
 * graph 文件含 LangGraph 重依赖无法被 jest spec 直接 import。
 */
import { validateVueScriptSemantics } from './sfc-semantics.js';
import fsMod from 'fs';
import pathMod from 'path';

/**
 * 🛡️ 判决复核（根治③ · 2026-11-11 · mc-max-1794405755148-1d77a3c5 实锤）
 *
 * 病灶时间线：最后一轮写盘（22:05:50）产物已合格（ContentForecast.vue 的 chartRef
 * 已声明，事后离线复检 0 issues）；随后重试轮在**内存里**再次产出坏文件、被语义门禁
 * 正确拦截、预算耗尽放弃（22:07:08）⇒ 任务判失败，但磁盘上的实际交付物是好的。
 * 判决对象过期：失败判决描述的是内存坏草稿，不是已交付产物。
 *
 * 语义类失败放弃重试前，必须对磁盘当前产物重跑语义门禁；通过 ⇒ 沿用已交付产物继续。
 * 自证：根治非放水——门禁照跑全量判据，只是判决对象从「内存坏草稿」纠正为「磁盘产物」，
 * 与「半成品已保留可手动补全」的既有语义对齐（产物合格就不该报失败）。
 */
async function recheckDiskArtifactSemantics(state) {
  try {
    const root = state.outputPath;
    if (!root || !fsMod.existsSync(pathMod.join(root, 'package'))) {
      return { ok: false, reason: 'no-artifact' };
    }
    const pkg = pathMod.join(root, 'package');
    const walk = (d) =>
      fsMod
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) => {
          const p = pathMod.join(d, e.name);
          return e.isDirectory()
            ? walk(p)
            : /\.(vue|js)$/i.test(e.name)
              ? [p]
              : [];
        });
    const files = walk(pkg);
    if (files.length === 0) return { ok: false, reason: 'empty' };
    const issues = [];
    for (const f of files) {
      const r = validateVueScriptSemantics(fsMod.readFileSync(f, 'utf8'), f);
      if (r.issues?.length) issues.push(...r.issues);
    }
    return { ok: issues.length === 0, checked: files.length, issues };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

export { recheckDiskArtifactSemantics };
