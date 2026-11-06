/**
 * 🛡️ 2026-11-06（mc-max-1793919841772-185ac2ff 实锤）：`<script>` 多余右花括号自愈。
 *
 * 真机 index.vue：
 *   72 |  onUnmounted(() => {
 *   73 |    }
 *   74 |    }        ← 多余
 *   75 |  })
 * ⇒ SFC 解析失败 ⇒ 门禁把整个文件隔离（不落盘）⇒ 预览入口不存在 + 完整性断言失败 ⇒ 整单 failed。
 * 该类缺陷机械可修（删一个 `}` 即合法），必须在校验前确定性还原。
 */
import { healScriptSurplusBrace } from './script-brace-healer.js';

const SFC = (script: string) => `<template>
  <div class="c-x">x</div>
</template>

<script setup>
${script}
</script>
`;

describe('healScriptSurplusBrace', () => {
  it('⭐ 阳性：尾部多一个独占行 `}` ⇒ 删除后恢复可解析（真机同构）', () => {
    const src = SFC(`import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  console.log(1)
})
onUnmounted(() => {
  }
  }
})`);
    const r = healScriptSurplusBrace(src);
    expect(r.healed).toBe(true);
    // 真机形态常多 2 个（自身 `}` + `})` 里的 `}`）⇒ 累积删除，至少 1 个
    expect(r.removed).toBeGreaterThanOrEqual(1);
    // 多余的独占行 `}` 已被删净：onUnmounted 只剩一个空块收尾
    expect(r.content).toMatch(/onUnmounted\(\(\) => \{\s*\}\)/);
    expect(r.content).not.toMatch(/\}\s*\n\s*\}\s*\n\}\)/);
  });

  it('阴性：合法脚本 ⇒ 零改动（幂等）', () => {
    const src = SFC(`const a = 1
function f() { return a }
f()`);
    expect(healScriptSurplusBrace(src)).toMatchObject({ healed: false, removed: 0, content: src });
  });

  it('阴性：template 里的 `}` 不受影响（只动 script 块）', () => {
    const src = `<template>
  <div>{{ a }}</div>
</template>
<script setup>
const a = 1
</script>
`;
    expect(healScriptSurplusBrace(src).healed).toBe(false);
  });

  it('反向：缺 `}`（不是多）⇒ 不动，交回门禁拦截（不猜）', () => {
    const src = SFC(`function f() {
  return 1
`);
    const r = healScriptSurplusBrace(src);
    expect(r.healed).toBe(false);
    expect(r.content).toBe(src);
  });
});
