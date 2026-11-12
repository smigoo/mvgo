/**
 * 🛡️ C1 script 字面量判据 · 模块路径排除（2026-11-12 · mc-max-1794424580714-e32c7951 实锤）
 *
 * 真实缺口：C1 的 script 字面量判据用 `hasCjk` 做豁免（假设「路径都是 ASCII」），
 *   但本管线资源命名含中文语义（`icon-战略厂商-3160.png`）⇒
 *   `import icon6 from '../../resources/images/icon-战略厂商-3160.png'` 被判「臆造文案」，
 *   修复轮去删一个不存在的文案，白耗 1/3 的 FAIL 预算（该单 5 条 C1 里 1 条是这种假阳性）。
 *
 * 本 spec 钉两件事（每条都带阴性对照，防「一律不判」的放水）：
 *   ① 路径形态（相对/协议/资源扩展名，含中文）不判 C1；
 *   ② 真占位文案（`内容区块`/`指标一`）仍然判 C1。
 */
import { runAcceptanceChecks, looksLikeModulePath } from './index.js';

const fig = {
  document: {
    id: 'root',
    type: 'FRAME',
    children: [
      {
        id: 'sec1',
        type: 'GROUP',
        name: 'Group',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
        children: [{ id: 't1', type: 'TEXT', characters: '战略合作厂商' }],
      },
    ],
  },
};

const wrap = (scriptLines: string[]) => `<template>
  <div class="x" data-section-id="sec1">
    <span>战略合作厂商</span>
  </div>
</template>

<script setup>
${scriptLines.join('\n')}
</script>
`;

describe('looksLikeModulePath：形态判据（零语义）', () => {
  it('相对/协议/资源扩展名 ⇒ 判为路径', () => {
    expect(looksLikeModulePath('../../resources/images/icon-战略厂商-3160.png')).toBe(true);
    expect(looksLikeModulePath('../../resources/styles/index.less')).toBe(true);
    expect(looksLikeModulePath('@/components/Foo.vue')).toBe(true);
    expect(looksLikeModulePath('https://a.b/c.png')).toBe(true);
    expect(looksLikeModulePath('/static/bg.png')).toBe(true);
    // 裸资源名（无前缀，中文语义）也必须命中
    expect(looksLikeModulePath('icon-普通厂商-3208.png')).toBe(true);
  });

  it('展示文案/标识符/含空格串 ⇒ 不判为路径（阴性对照：不放水）', () => {
    expect(looksLikeModulePath('内容区块')).toBe(false);
    expect(looksLikeModulePath('指标一')).toBe(false);
    expect(looksLikeModulePath('战略合作厂商')).toBe(false);
    expect(looksLikeModulePath('icon6')).toBe(false);
    expect(looksLikeModulePath('在线设备 66')).toBe(false);
    expect(looksLikeModulePath('')).toBe(false);
    // 带引号/括号的代码片段不是路径（形态不合法）
    expect(looksLikeModulePath("$emit('legend-select')")).toBe(false);
  });
});

describe('runAcceptanceChecks：C1 不再把中文资源路径当臆造文案', () => {
  it('中文资源 import + 真值文案 ⇒ 无 C1（改前必红）', () => {
    // 🔴 必须放**两张**中文资源：C1 阈值是「≥2 条」——只放一张时，即使判据完全失效
    //   也凑不满阈值 ⇒ 假绿（本 spec 首版实测踩过：关掉排除后仍全绿，已修正）。
    const files = {
      'package/index.vue': wrap([
        "import icon6 from '../../resources/images/icon-战略厂商-3160.png'",
        "import icon5 from '../../resources/images/icon-优质厂商-3164.png'",
        "import { onMounted } from 'vue'",
        'const title = "战略合作厂商"',
      ]),
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.filter((f: any) => f.code === 'C1');
    expect(c1).toHaveLength(0);
    // 阳性对照：同一文件里塞入真占位 ⇒ 必须重新出现 C1（证明判据没被整体关掉）
    const filesBad = {
      'package/index.vue': wrap([
        "import icon6 from '../../resources/images/icon-战略厂商-3160.png'",
        "import icon5 from '../../resources/images/icon-优质厂商-3164.png'",
        'const labels = ["内容区块", "指标一"]',
      ]),
    };
    const rBad = runAcceptanceChecks({ files: filesBad, figmaNodeData: fig });
    const c1Bad = rBad.fails.filter((f: any) => f.code === 'C1');
    expect(c1Bad.length).toBeGreaterThan(0);
    expect(String(c1Bad[0].detail)).toContain('内容区块');
    expect(String(c1Bad[0].detail)).not.toContain('resources');
  });
});
