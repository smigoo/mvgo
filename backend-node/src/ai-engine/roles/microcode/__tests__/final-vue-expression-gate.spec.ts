/**
 * 产物终验：表达式级最后闸（2026-11-12 · mc-1794463362140-8fa6d6f3 实锤）
 *
 * 阳性复刻：坏 `:style`（对象字面量后被拼 CSS 残留 `;display:flex;...`）落盘到磁盘，
 * compileTemplate 报 `Error parsing JavaScript expression: Unexpected token, expected ","`。
 * 终验必须：① 缓存有合法版 → 回退；② 无缓存 → 移除坏文件；③ 合法文件不动（阴性）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFinalVueExpressionGate } from '../final-vue-expression-gate.js';
import { validateVueSfcExpressions } from '../../../utils/sfc-syntax-validation.js';

const GOOD_VUE = [
  '<template>',
  '  <div class="c-demo-root" :style="{ backgroundImage: \'url(\' + bg1 + \')\', backgroundSize: \'100% 100%\' }">',
  '    <span>{{ title }}</span>',
  '  </div>',
  '</template>',
  '',
  '<script setup>',
  "import bg1 from '../resources/images/bg-1.png'",
  "const title = 'demo'",
  '</script>',
].join('\n');

// 8fa6d6f3 实锤形态：`:style` 对象字面量 `}` 之后被拼 CSS 残留
const BAD_VUE = GOOD_VUE.replace(
  "backgroundSize: '100% 100%' }\"",
  "backgroundSize: '100% 100%' };display:flex;flex-direction:row;align-items:center\"",
);

describe('runFinalVueExpressionGate', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'final-vue-gate-'));
    mkdirSync(join(root, 'package/components'), { recursive: true });
    mkdirSync(join(root, '.mc-gen/cache/code-chunks'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* tmp 清理失败可忽略 */ }
  });

  function writeChunk(relPath: string, idx: number, content: string) {
    const name = `${idx}-${relPath.replace(/\//g, '_')}`;
    writeFileSync(join(root, '.mc-gen/cache/code-chunks', name), content, 'utf-8');
    const metaPath = join(root, '.mc-gen/cache/code-chunks/chunk-meta.json');
    let meta: any = {};
    try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { /* 首次 */ }
    meta.files = meta.files || {};
    meta.files[relPath] = [...(meta.files[relPath] || []), { file: name }];
    writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');
  }

  it('阳性①：坏 :style 落盘 + 缓存有合法版 → 回退（restored-from-cache）', () => {
    const rel = 'package/components/Bad.vue';
    writeFileSync(join(root, rel), BAD_VUE, 'utf-8');
    writeChunk(rel, 6, GOOD_VUE);

    const res = runFinalVueExpressionGate(root, [rel]);

    expect(res.checked).toBe(1);
    expect(res.bad).toHaveLength(1);
    expect(res.bad[0].action).toBe('restored-from-cache');
    expect(res.bad[0].errors.join(' ')).toMatch(/Unexpected token/);
    expect(readFileSync(join(root, rel), 'utf-8')).toBe(GOOD_VUE);
  });

  it('阳性②：坏 :style 落盘 + 无缓存候选 → 移除坏文件（removed）', () => {
    const rel = 'package/components/Bad.vue';
    writeFileSync(join(root, rel), BAD_VUE, 'utf-8');

    const res = runFinalVueExpressionGate(root, [rel]);

    expect(res.checked).toBe(1);
    expect(res.bad).toHaveLength(1);
    expect(res.bad[0].action).toBe('removed');
    expect(existsSync(join(root, rel))).toBe(false);
  });

  it('阳性③：缓存候选自身也是坏的 → 不回退，直接移除', () => {
    const rel = 'package/components/Bad.vue';
    writeFileSync(join(root, rel), BAD_VUE, 'utf-8');
    writeChunk(rel, 6, BAD_VUE); // 缓存里也是坏版

    const res = runFinalVueExpressionGate(root, [rel]);

    expect(res.bad).toHaveLength(1);
    expect(res.bad[0].action).toBe('removed');
    expect(existsSync(join(root, rel))).toBe(false);
  });

  it('阴性：合法 .vue（含与 8fa6d6f3 同款 bg 挂载四件套）不被终验误伤', () => {
    const rel = 'package/components/Good.vue';
    writeFileSync(join(root, rel), GOOD_VUE, 'utf-8');

    const res = runFinalVueExpressionGate(root, [rel]);

    expect(res.checked).toBe(1);
    expect(res.bad).toHaveLength(0);
    expect(readFileSync(join(root, rel), 'utf-8')).toBe(GOOD_VUE);
  });

  it('健壮性：非 .vue 路径被忽略；文件不存在不抛错；永不 throw', () => {
    expect(() =>
      runFinalVueExpressionGate(root, ['resources/styles/common.less', 'package/components/Ghost.vue']),
    ).not.toThrow();
  });

  // 🛡️ 根治⑭（2026-11-13 · mc-1794530400449-1fc2485d 实锤）：终局扫描「检出→隔离」闭环。
  //   旧口径 removeIfNoCache=false 一律 left-in-place ⇒ 坏版留在产物直达前端。
  const INDEX_WITH_DANGLING = [
    '<template>',
    '  <div class="c-root">',
    '    <StatsSection />',
    '    <span>{{ title }}</span>',
    '  </div>',
    '</template>',
    '',
    '<script setup>',
    "import StatsSection from './components/StatsSection.vue'",
    "const title = 'demo'",
    '</script>',
  ].join('\n');

  it('根治⑭ 阳性④：removeIfNoCache=false + components 坏无缓存 → 删文件 + 摘 index.vue 悬空 import', () => {
    const rel = 'package/components/StatsSection.vue';
    writeFileSync(join(root, rel), BAD_VUE, 'utf-8');
    const indexPath = join(root, 'package/index.vue');
    writeFileSync(indexPath, INDEX_WITH_DANGLING, 'utf-8');

    const res = runFinalVueExpressionGate(root, [rel], { removeIfNoCache: false, allVueOnDisk: true });

    const bad0 = res.bad.find((b) => b.path === rel);
    expect(bad0?.action).toBe('isolated-removed');
    expect(existsSync(join(root, rel))).toBe(false); // 坏文件已删
    // index.vue 悬空 import + 模板标签被确定性摘除，且摘后自身仍过终验
    const idx = readFileSync(indexPath, 'utf-8');
    expect(idx).not.toContain('StatsSection');
    expect(validateVueSfcExpressions(idx, 'package/index.vue').valid).toBe(true);
  });

  it('根治⑭ 阳性⑤：removeIfNoCache=false + package/index.vue 坏 → 不可降级，保持 left-in-place', () => {
    const rel = 'package/index.vue';
    writeFileSync(join(root, rel), BAD_VUE, 'utf-8');

    const res = runFinalVueExpressionGate(root, [rel], { removeIfNoCache: false, allVueOnDisk: true });

    expect(res.bad[0].action).toBe('left-in-place');
    expect(existsSync(join(root, rel))).toBe(true); // fail-closed 不删
  });

  it('根治⑭ 回归：removeIfNoCache=false + 全部合法 → 零隔离动作', () => {
    const rel = 'package/components/Good.vue';
    writeFileSync(join(root, rel), GOOD_VUE, 'utf-8');
    writeFileSync(join(root, 'package/index.vue'), GOOD_VUE, 'utf-8');

    const res = runFinalVueExpressionGate(root, [rel], { removeIfNoCache: false, allVueOnDisk: true });

    expect(res.bad).toHaveLength(0);
    expect(readFileSync(join(root, rel), 'utf-8')).toBe(GOOD_VUE);
  });
});
