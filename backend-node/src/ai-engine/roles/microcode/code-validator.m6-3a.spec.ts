/**
 * 🛡️ M6-3a/3b 透明底确定性兜底单测（2026-11-15）。
 *
 * 真因：旧兜底 `stripInlineBg` 仅处理静态 `style="background:..."`（且只认小写连字符属性），
 * 对 `:style="{ backgroundImage: ... }"` 动态对象字面量完全失配（正则 `^background` 锚点被 `{ ` 破坏、
 * 驼峰 backgroundImage/backgroundSize 也不在过滤列表）——导致 4 个产物的 <base-panel> 内联 backgroundImage
 * 未被剥离，M6-3a 健康检查（`/style\s*=\s*["'][^"']*background/i`）仍判失败。
 *
 * 本单测校验重构后的纯函数 `stripBasePanelInlineBackground`：
 *   - 剥离 `:style` 对象字面量里的 background* 键（驼峰 + 连字符），整对象清空则移除属性；
 *   - 剥离静态 `style="background(-*):..."`；
 *   - 同时处理 <base-panel> 与首子元素；
 *   - 非背景样式（color / fontSize 等）不被误删。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true });

import { stripBasePanelInlineBackground } from './code-validator.js';

describe('M6-3a/3b stripBasePanelInlineBackground', () => {
  it('① 动态 :style 仅含背景键 → 整个 :style 属性移除', () => {
    const tpl = `<template>
  <base-panel :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center center' }">
    <div class="c-demo-root">内容</div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toContain('backgroundImage');
    expect(out).not.toContain(':style');
    expect(out).toContain('<base-panel>');
    expect(out).toContain('c-demo-root');
  });

  it('② 动态 :style 混合非背景键 → 仅剥 background*，保留 color/fontSize', () => {
    const tpl = `<template>
  <base-panel :style="{ color: 'red', backgroundImage: 'url(' + bg1 + ')', fontSize: '20px' }">
    <div class="c-demo-root"></div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toContain('backgroundImage');
    expect(out).toContain("color: 'red'");
    expect(out).toContain("fontSize: '20px'");
    expect(out).toMatch(/:style="\{[^}]*color: 'red'[^}]*fontSize: '20px'[^}]*\}"/);
  });

  it('③ 静态 style="background:..." → 剥离（含 background-color / background-image 连字符）', () => {
    const tpl = `<template>
  <base-panel style="background: #102a43; background-image: url(x.png); padding: 8px">
    <div class="c-demo-root"></div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toMatch(/background\s*:/);
    expect(out).toContain('padding: 8px');
    // 非背景属性保留且 style 属性仍在
    expect(out).toContain('style="padding: 8px"');
  });

  it('④ 首子元素内联背景也被剥离（M6-3b）', () => {
    const tpl = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-demo-root" :style="{ backgroundImage: 'url(' + bg2 + ')', color: 'blue' }">内容</div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toContain('backgroundImage');
    expect(out).toContain("color: 'blue'");
  });

  it('⑤ 无 background 的 :style 不被误伤（防回归）', () => {
    const tpl = `<template>
  <base-panel :style="{ color: 'red', fontSize: '16px' }">
    <div class="c-demo-root"></div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).toContain('color: \'red\'');
    expect(out).toContain('fontSize: \'16px\'');
    expect(out).not.toContain('background');
  });

  it('⑥ 无 <base-panel> 时原样返回（引用相等，零副作用）', () => {
    const tpl = `<template><div :style="{ backgroundImage: 'url(' + bg + ')' }">x</div></template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).toBe(tpl);
  });

  it('⑦ 真实产物形态：base-panel 与首子 div 均带 :style 背景 → 全剥离，M6-3a/3b 判据不再命中', () => {
    const tpl = `<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bgm + ')', backgroundSize: '100% 100%' }">
    <div class="c-demo-root" :style="{ backgroundImage: 'url(' + bgc + ')', color: 'blue' }">内容</div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    // base-panel 开标签无内联背景（M6-3a）
    const bpTag = out.match(/<base-panel[^>]*>/i)?.[0] || '';
    expect(bpTag).not.toMatch(/style\s*=\s*["'][^"']*background/i);
    // 首子元素（c-demo-root）无内联背景（M6-3b），但 color 等非背景键保留
    const firstChild = out.match(/<base-panel\b[^>]*>\s*<([a-zA-Z][\w-]*)\b[^>]*>/i)?.[0] || '';
    expect(firstChild).not.toMatch(/style\s*=\s*["'][^"']*background/i);
    expect(firstChild).toContain("color: 'blue'");
  });
});

/**
 * 🛡️ S3-BG（2026-11-15 · 0fde9c29 实锤）：M6-3a 剥背景后不得留下孤儿空 div。
 *   折叠段锚点消失 ⇒ S3 归属兜底注入承载 div ⇒ 首子元素的 :style 被剥 ⇒
 *   `<div data-section-id="136:129" style="width:140px; height:74px"></div>`。
 *   修复后兜底不再注入；此处再加一道窄清理，覆盖历史形态 + 新 class 形态。
 */
describe('M6-3a 空壳承载 div 清理（S3-BG）', () => {
  it('① 新形态：首子元素是 class="mc-bg-carrier-*" 的空 div ⇒ 整段移除', () => {
    const tpl = `<template>
  <base-panel panelKey="default-panel">
    <div data-section-id="2:3660" class="mc-bg-carrier-23660"></div>
    <div class="c-demo-root">内容</div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toContain('mc-bg-carrier-23660');
    expect(out).toContain('c-demo-root');
  });

  it('② 旧形态：首子元素 :style 被剥后只剩 inline px 尺寸 ⇒ 整段移除（0fde9c29 实锤）', () => {
    const tpl = `<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
    <div data-section-id="136:129" style="width:140px; height:74px"></div>
    <div class="c-demo-root">内容</div>
  </base-panel>
</template>`;
    const out = stripBasePanelInlineBackground(tpl);
    expect(out).not.toContain('data-section-id="136:129"');
    expect(out).not.toContain('backgroundImage');
    expect(out).toContain('c-demo-root');
  });

  it('③ 阴性：LLM 有意写的普通空占位 div（无 carrier class / 非纯尺寸）⇒ 不动', () => {
    const tpl = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-demo-spacer"></div>
  </base-panel>
</template>`;
    expect(stripBasePanelInlineBackground(tpl)).toBe(tpl);
  });
});
