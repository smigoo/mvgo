/**
 * 🛡️ 2026-11-05 C3 门禁证据治理 · console 噪声判据
 *   方案：docs/2026-11-05-四任务样式各异根因修复方案.md §3.2
 *
 * 真机阳性对照：`server.log:34709` 任务 mc-max-1793849137209-40c7c1a7 的
 * antd Table rowKey deprecation warning（逐字复制，含 .vite/deps chunk URL）。
 * 验者只调纯函数断言分类结果，不复用改者的正则集合。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONSOLE_NOISE_PATTERNS,
  isThirdPartyWarning,
  isBenignConsoleError,
  isFatalConsoleError,
} from '../console-noise-classifier.js';

const ANTD_WARNING = {
  text: 'Warning: [ant-design-vue: Table] `index` parameter of `rowKey` function is deprecated. There is no guarantee that it will work as expected.',
  location: {
    url: 'http://127.0.0.1:2610/node_modules/.vite/deps/chunk-DA6NNJFW.js?v=a299a2fb',
    lineNumber: 2759,
    columnNumber: 12,
  },
};

describe('C3 console 噪声判据单一事实源', () => {
  it('⭐ 阳性（40c7c1a7 真机文本）：第三方 warning → benign 且非 fatal', () => {
    expect(isThirdPartyWarning(ANTD_WARNING)).toBe(true);
    expect(isBenignConsoleError(ANTD_WARNING)).toBe(true);
    expect(isFatalConsoleError(ANTD_WARNING)).toBe(false);
  });

  it('阴性：组件自身 index.vue 的 TypeError 仍判 fatal（不放宽产物缺陷）', () => {
    const entry = {
      text: "TypeError: Cannot read properties of undefined (reading 'actual')",
      location: { url: 'http://127.0.0.1:2610/preview/c-demo/package/index.vue' },
    };
    expect(isBenignConsoleError(entry)).toBe(false);
    expect(isFatalConsoleError(entry)).toBe(true);
  });

  it('阴性：同样 Warning 文本但来自组件自身代码 → 不按第三方豁免', () => {
    const entry = {
      text: ANTD_WARNING.text,
      location: { url: 'http://127.0.0.1:2610/preview/c-demo/package/index.vue' },
    };
    expect(isThirdPartyWarning(entry)).toBe(false);
    expect(isBenignConsoleError(entry)).toBe(false);
  });

  it('阴性：Permissions policy 既有良性白名单不回退', () => {
    const entry = { text: 'Permissions policy violation: unload is not allowed in this document.', location: { url: '' } };
    expect(isBenignConsoleError(entry)).toBe(true);
    expect(isFatalConsoleError(entry)).toBe(false);
  });

  it('阴性：ResizeObserver / favicon 两条旧「分类期」口径现在渲染期也生效', () => {
    expect(CONSOLE_NOISE_PATTERNS).toHaveLength(3);
    for (const text of [
      'ResizeObserver loop completed with undelivered notifications',
      'Failed to load resource: favicon.ico 404',
    ]) {
      expect(isBenignConsoleError({ text, location: { url: '' } })).toBe(true);
    }
  });

  it('阴性：普通 console.error 且无来源 URL 不判 fatal', () => {
    expect(isFatalConsoleError({ text: 'some harmless log', location: { url: '' } })).toBe(false);
    expect(isFatalConsoleError({})).toBe(false);
  });

  it('接线断言：screenshot-renderer 不再维护第二套正则，且渲染期/分类期同用一份判据', () => {
    const src = readFileSync(join(__dirname, '../../roles/screenshot-renderer.js'), 'utf8');
    expect(src).toContain("from '../utils/console-noise-classifier.js'");
    expect(src).not.toContain('ignoredConsoleErrorPatterns');
    expect(src).toContain('isIgnoredConsoleError(consoleEntry)');
    // 分类期两处仍消费 isFatalConsoleError（以函数引用形式传入 filter）
    expect((src.match(/isFatalConsoleError/g) || []).length).toBeGreaterThanOrEqual(2);
    // 刀 3 证据留痕计数行（0 也打）+ evidence 只报不改
    expect(src).toContain('visualFidelityDerivative:evaluated=');
    expect(src).toContain('insufficientEvidence: derivative');
    expect(src).toContain("const derivative = renderBroken ? 'runtime-render-error' : null");
  });
});
