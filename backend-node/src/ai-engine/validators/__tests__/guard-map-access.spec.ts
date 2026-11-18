/**
 * 刀20 Map 直取空值守卫 spec（2026-11-18 · B1 RUNTIME-004 实锤）
 * 病根：`const current = dataMap[activeTunnel.value]` 初始 key 不在 map ⇒
 * `current.actual` TypeError ⇒ 白屏。写盘出口兜底：声明补 `|| {}` + 直取补 `?.`。
 */
import { findUnguardedMapAccess, guardMapAccess } from '../../roles/microcode/code-healer.js';

const BAD_SFC = `<script setup>
import { ref } from 'vue'
const dataMap = { a: { actual: [1] } }
const activeTunnel = ref('')
const updateChart = () => {
  if (!chart) return
  const currentData = dataMap[activeTunnel.value]
  console.log(currentData.actual)
}
</script>`;

describe('刀20 Map 直取空值守卫', () => {
  test('P1 危险形态命中', () => {
    expect(findUnguardedMapAccess(BAD_SFC)).toEqual([
      { varName: 'currentData', mapName: 'dataMap', keyExpr: 'activeTunnel.value' },
    ]);
  });

  test('P2 补守卫：声明 || {} + 直取 ?.，产物可渲染', () => {
    const r = guardMapAccess(BAD_SFC);
    expect(r.changed).toBe(true);
    expect(r.content).toContain('dataMap[activeTunnel.value] || {}');
    expect(r.content).toContain('currentData?.actual');
  });

  test('P3 幂等：补过后不再命中', () => {
    const once = guardMapAccess(BAD_SFC);
    expect(findUnguardedMapAccess(once.content).length).toBe(0);
    expect(guardMapAccess(once.content).changed).toBe(false);
  });

  test('N1 已有 if(!x) 守卫 ⇒ 不命中', () => {
    const s = BAD_SFC.replace(
      'console.log(currentData.actual)',
      'if (!currentData) return\nconsole.log(currentData.actual)',
    );
    expect(findUnguardedMapAccess(s).length).toBe(0);
  });

  test('N2 无直取（仅透传）⇒ 不命中', () => {
    const s = BAD_SFC.replace('console.log(currentData.actual)', 'return currentData');
    expect(findUnguardedMapAccess(s).length).toBe(0);
  });

  test('N3 无 script 块 fail-open', () => {
    expect(findUnguardedMapAccess('<div>x</div>').length).toBe(0);
  });
});
