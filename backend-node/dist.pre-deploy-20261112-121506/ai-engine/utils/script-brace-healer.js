/**
 * 🛡️ 2026-11-06（mc-max-1793919841772-185ac2ff 实锤）：**`<script>` 多余右花括号确定性自愈**。
 *
 * ## 病灶
 * 任务产物 `package/index.vue` 的 `<script setup>` 尾部：
 * ```
 * 72 |  onUnmounted(() => {
 * 73 |    }
 * 74 |    }        ← 多余的一个 }
 * 75 |  })
 * ```
 * ⇒ `@vue/compiler-sfc`：`Unexpected token, expected ","`。
 * 写盘门禁把它当「坏文件」隔离（不落盘）⇒ 产物目录里连 index.vue 都没有 ⇒
 * 预览入口不存在 + 完整性断言 `缺失 package/index.vue` ⇒ **整单失败**。
 *
 * 既有 `stripSurplusBlockClosers` 只处理**重复的 SFC 标签**（`</style></style>`），
 * 不认「脚本内多余 `}`」。而这类缺陷是**机械可修的**（少一个 `}` 就合法），
 * 按仓内既定纪律「机械可修缺陷必须在校验前确定性还原，不得走整文件降级」，
 * 这里补上脚本括号维度。
 *
 * ## 判据（零猜内容，只做最小删除 + 必须重新解析通过）
 *  ① 只对 `<script …>…</script>` 块动手（template/style 不碰）；
 *  ② 仅当**原始块解析失败**才尝试；
 *  ③ 候选 = 形如「独占一行（可带缩进）的 `}`」的行，**从后往前**逐个尝试删除；
 *     每删一个就用 `@babel/parser` 重新解析整段脚本，**第一个解析通过的候选才采纳**；
 *  ④ 尝试上限 `MAX_TRIES = 5`（超过说明不是单纯多括号，交回门禁拦截，绝不瞎删）；
 *  ⑤ 幂等：修好后再次调用返回 `healed:false`（解析已通过）。
 *
 * ⚠️ 不做的：不补缺失的 `}`、不重排语句、不猜业务逻辑 —— 只删「删掉就合法」的那一个。
 */

import { parse } from '@babel/parser';

const MAX_TRIES = 5;

/** 取第一个 `<script …>` 块的内容与在原文中的区间。 */
function findScriptBlock(source) {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(source);
  if (!m) return null;
  const start = m.index + m[0].indexOf('>') + 1;
  return { content: m[1], start, end: start + m[1].length };
}

function canParse(code) {
  try {
    parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx', 'topLevelAwait'] });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} source 完整 SFC 文本
 * @param {{logger?:object}} [options]
 * @returns {{content:string, healed:boolean, removed:number}}
 */
export function healScriptSurplusBrace(source, options = {}) {
  const text = typeof source === 'string' ? source : '';
  if (!text.trim()) return { content: text, healed: false, removed: 0 };
  const block = findScriptBlock(text);
  if (!block) return { content: text, healed: false, removed: 0 };
  // ② 原始能解析 ⇒ 什么都不做（幂等）
  if (canParse(block.content)) return { content: text, healed: false, removed: 0 };

  // ③ 候选：独占一行的 `}`（从后往前）
  const lines = block.content.split('\n');
  const candidates = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*\}\s*$/.test(lines[i])) candidates.push(i);
    if (candidates.length >= MAX_TRIES) break;
  }
  if (candidates.length === 0) return { content: text, healed: false, removed: 0 };

  // ③ 累积删除（真机形态常是多 2 个：`}` + `})` 里的 `}` 都多余）：
  //   每轮删掉「最后一个独占行 `}`」，删完就重新解析，第一次通过即采纳（最多 MAX_TRIES 个）。
  let work = lines.slice();
  let removed = 0;
  while (removed < MAX_TRIES) {
    let lastLone = -1;
    for (let i = work.length - 1; i >= 0; i -= 1) {
      if (/^\s*\}\s*$/.test(work[i])) {
        lastLone = i;
        break;
      }
    }
    if (lastLone < 0) break;
    work = work.slice(0, lastLone).concat(work.slice(lastLone + 1));
    removed += 1;
    if (!canParse(work.join('\n'))) continue;
    const out = `${text.slice(0, block.start)}${work.join('\n')}${text.slice(block.end)}`;
    try {
      options.logger?.warn?.(
        '🛡️ 脚本多余右花括号自愈（写盘门禁前置）: 删除独占行 `}` 后脚本恢复可解析',
        { removed },
      );
    } catch (_) {
      /* 日志失败不影响自愈结果 */
    }
    return { content: out, healed: true, removed };
  }
  return { content: text, healed: false, removed: 0 };
}
