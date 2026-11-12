/**
 * 🛡️ 字号下限守卫（单一来源实现，2026-10-30）
 *
 * 病灶实锤：`c-deployment-node-overview-74d5fe95`（Lite 微码产物）里，视觉分析给出的真值
 * 是「标题约15px、正文约13px、数字约15px、次要信息约11px」，但 LLM 做「高度预算分解」时
 * 把整个层级压成 8/9/10/11/12px —— 最低档 `calc(@fontSize * 0.5714)` ≈ 8px，真机不可读。
 *
 * 两道防线，本文件是**第二道（落盘兜底）**：
 *   ① 生成阶段：lite.service.ts `buildFontFloorRule()` 把真值 + 下限写进两条 prompt（治本）
 *   ② 落盘阶段：本文件把已写死的 `calc(@fontSize * X)` 中 X < minRatio 的提升到 minRatio（兜底）
 *
 * 归一契约（见 font-size-normalizer.js）：`14px → @fontSize`、`px → calc(@fontSize * px/14)`，
 * 因此 `minRatio = 0.75` 等价于 `14 × 0.75 = 10.5px`。下限数值**只**来自 font-size-normalizer，
 * 本文件不另立常量，避免「prompt 说 10.5px / 守卫说 9px」分叉。
 *
 * 消费方（两者共用同一实现，禁止各写一份）：
 *   - ai-engine/roles/microcode-engineer.js  writeFiles 后处理链（Figma / max 管线，tag='max'）
 *   - lite/lite.service.ts                  四个写盘点落盘前（Lite 管线，tag='lite'）
 *
 * 两种产物形态都必须覆盖（2026-10-30 补第二形态）：
 *   ① **已归一**的 `calc(@fontSize * X)`（微码 lite 分支、max 链路 writeFiles 后）
 *   ② **裸 px** 的 `font-size: 8px`（Lite **vue3** 分支：样式留在 index.vue 的 <style> 内，
 *      从不经 lite-style-extractor 归一，`normalizeFontSizeLiterals` 全库也只有 file-writer
 *      与 extractor 两个调用方）。旧实现只认 ①，对 ② 只统计不改写 —— 实测把真实病灶喂进
 *      vue3 分支得到 `hits:0 rawUnderMin:4 changes:0`，产物仍是 8/9/10px，等于**守卫空转**。
 *
 * 裸 px 的处理规则（阈值全部来自单一来源常量，不另立）：
 *   - `px <= MIN_FONT_PX(5)`  → 豁免不动（`font-size: 0/1px` 是隐藏文本技巧，不是可读正文）
 *   - `MIN_FONT_PX < px < MIN_BODY_FONT_PX(10.5)` → 提升到 `MIN_BODY_FONT_PX`
 *   - `px >= MIN_BODY_FONT_PX` → 已达标不动
 *   - 非 px 形态（`rem` / `em` / `%`）不在覆盖范围，由 prompt 铁律约束
 */
import {
  FONT_BASE_PX,
  MIN_FONT_PX,
  MIN_BODY_FONT_PX,
  MIN_BODY_FONT_RATIO,
} from './font-size-normalizer.js';

/** calc(@fontSize * X) / calc(var(--fontSize) * X)，X 为小数 */
const CALC_RATIO_RE = /calc\(\s*(?:@fontSize|var\(--fontSize\))\s*\*\s*([\d.]+)\s*\)/g;
/** 裸 px 字号（vue3 分支形态，同时用于改后残留统计） */
const RAW_PX_RE = /font-size\s*:\s*([\d.]+)\s*px/gi;
/** 精确替换「数字 + px」，避免 match.replace 误伤属性名；统一输出小写 px */
const RAW_PX_NUM_RE = /([\d.]+)\s*px/i;

const GUARDABLE_EXT_RE = /\.(vue|less)$/;

/**
 * 把低于下限的字号提升到 minRatio / minPx（只升不降、幂等、纯函数）。
 *
 * 覆盖两种产物形态：`calc(@fontSize * X)` 与裸 `font-size: Npx`（见文件头说明）。
 *
 * @param {Record<string, string>} files 产物文件表（rel → content）
 * @param {number} [minRatio=MIN_BODY_FONT_RATIO] 最小比例，默认单一来源常量（0.75 ⇒ ≈10.5px）
 * @returns {{files: Record<string, string>, changes: Array<{file:string,from:string,to:string,ratio:number,form:'calc'|'rawpx'}>, rawFixed: number, rawUnderMin: number}}
 *   changes：实际改写的条目（form 区分命中形态）；
 *   rawFixed：由裸 px 提升而来的条数；
 *   rawUnderMin：**改后残留**的低于下限裸 px 数 —— 应恒 0，非 0 表示有形态漏网（实现缺陷告警）
 */
export function ensureMinFontSize(files, minRatio = MIN_BODY_FONT_RATIO) {
  if (!files || typeof files !== 'object') {
    return { files, changes: [], rawFixed: 0, rawUnderMin: 0 };
  }
  const changes = [];
  let rawFixed = 0;
  let rawUnderMin = 0;
  const next = { ...files };

  for (const [rel, content] of Object.entries(files)) {
    if (!rel || typeof content !== 'string') continue;
    if (!GUARDABLE_EXT_RE.test(rel)) continue;

    // ① 已归一的 calc 形态
    CALC_RATIO_RE.lastIndex = 0;
    let count = 0;
    let updated = content.replace(CALC_RATIO_RE, (match, ratio) => {
      const r = parseFloat(ratio);
      if (r < minRatio) {
        count++;
        const replacement = match.replace(ratio, String(minRatio));
        changes.push({ file: rel, from: match, to: replacement, ratio: r, form: 'calc' });
        return replacement;
      }
      return match;
    });

    // ② 裸 px 形态（vue3 分支）：MIN_FONT_PX < px < MIN_BODY_FONT_PX → 提升到下限
    RAW_PX_RE.lastIndex = 0;
    updated = updated.replace(RAW_PX_RE, (match, pxStr) => {
      const px = parseFloat(pxStr);
      if (!Number.isFinite(px)) return match;
      if (px <= MIN_FONT_PX) return match; // 隐藏文本技巧，豁免（与 normalizer 的 MIN_FONT_PX 同源）
      if (px >= MIN_BODY_FONT_PX) return match; // 已达标
      count++;
      rawFixed++;
      const replacement = match.replace(RAW_PX_NUM_RE, `${MIN_BODY_FONT_PX}px`);
      changes.push({
        file: rel,
        from: match,
        to: replacement,
        ratio: Number((px / FONT_BASE_PX).toFixed(4)),
        form: 'rawpx',
      });
      return replacement;
    });

    if (count > 0) next[rel] = updated;

    // 改后残留统计：理论上恒 0；非 0 说明有低于下限的裸 px 逃过改写（形态漏网告警）
    RAW_PX_RE.lastIndex = 0;
    let m;
    while ((m = RAW_PX_RE.exec(updated)) !== null) {
      const px = parseFloat(m[1]);
      if (Number.isFinite(px) && px > MIN_FONT_PX && px < MIN_BODY_FONT_PX) rawUnderMin++;
    }
  }

  return { files: next, changes, rawFixed, rawUnderMin };
}

/**
 * 统一日志行格式（max / lite 两条链路共用，便于真机 grep 与「0 命中 vs 未接线」辨析）。
 *
 * 🔴 hits:0 **也必须打**：旧实现只在 changes>0 时打日志，导致「守卫没被调用」与
 *    「守卫调用了但零命中」在日志上完全同形 —— 2026-10-30 真机验证时正是被这一点误导
 *    （Lite 链路其实从未接线，日志却「看起来很正常」）。
 *
 * @param {{changes: Array, rawFixed?: number, rawUnderMin?: number}} result ensureMinFontSize 的返回值
 * @param {'max'|'lite'|string} tag 链路标记
 * @returns {{message: string, meta: Record<string, any>}}
 */
export function formatFontGuardLog(result, tag) {
  const changes = Array.isArray(result?.changes) ? result.changes : [];
  const rawFixed = Number(result?.rawFixed || 0);
  const rawUnderMin = Number(result?.rawUnderMin || 0);
  const message =
    `🛡️ 字号下限守卫 [FONT-MIN-GUARD@${tag}] hits:${changes.length}` +
    ` calc:${changes.length - rawFixed} rawpx:${rawFixed}` +
    ` minRatio:${MIN_BODY_FONT_RATIO} minPx:${MIN_BODY_FONT_PX} rawUnderMin:${rawUnderMin}`;
  return {
    message,
    meta: {
      tag,
      count: changes.length,
      rawFixed,
      minRatio: MIN_BODY_FONT_RATIO,
      minPx: MIN_BODY_FONT_PX,
      rawUnderMin,
      samples: changes
        .slice(0, 3)
        .map((c) => `${c.file}: ${c.from} → ${c.to}`),
    },
  };
}
