/**
 * CODE-023 确定性兜底 spec（2026-11-12 · mc-max-1794464735884-cfe8977a 实锤，根治⑤）
 *
 * 场景复刻：重试轮丢失 ChartSection.vue，index.vue 的 <ChartSection/> + import 保留
 * ⇒ CODE-023「缺组件文件」。兜底：缓存有合法候选 ⇒ 补建；无候选 ⇒ 维持 fail-closed。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseDanglingTags,
  recountDanglingTags,
  tryFixDanglingComponentFiles,
} from './dangling-component-backstop.js';

const ISSUES = [
  {
    id: 'CODE-023',
    severity: 'BLOCK',
    file: 'package/index.vue',
    message:
      '悬空子组件标签：1 个模板标签三要素不齐备（<ChartSection>（缺组件文件））。悬空标签渲染为空白且无任何报错，必须补齐 import 与 package/components/{Tag}.vue 文件，或从模板删除该标签',
  },
];

const GOOD_COMPONENT = [
  '<template>',
  '  <div class="chart-section" data-section-id="1:816">',
  '    <span class="chart-title">{{ title }}</span>',
  '  </div>',
  '</template>',
  '',
  '<script setup>',
  "import * as echarts from 'echarts'",
  "const title = '桥梁'",
  '</script>',
].join('\n');

describe('CODE-023 确定性兜底（根治⑤）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'code023-backstop-'));
    mkdirSync(join(root, 'package/components'), { recursive: true });
    mkdirSync(join(root, '.mc-gen/cache/code-chunks'), { recursive: true });
    // index.vue：模板 + import 都在，只缺组件文件（cfe8977a 形态）
    writeFileSync(
      join(root, 'package/index.vue'),
      '<template><div><HeaderSection /><ChartSection /></div></template>\n' +
        "<script setup>\nimport HeaderSection from './components/HeaderSection.vue'\n" +
        "import ChartSection from './components/ChartSection.vue'\n</script>",
      'utf-8',
    );
    writeFileSync(
      join(root, 'package/components/HeaderSection.vue'),
      '<template><div>h</div></template>',
      'utf-8',
    );
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* tmp 清理 */ }
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

  it('parseDanglingTags：从 validator message 提取 tag 与缺失类型', () => {
    expect(parseDanglingTags(ISSUES)).toEqual([{ tag: 'ChartSection', missing: '缺组件文件' }]);
  });

  it('阳性：缓存有合法候选 → 补建组件文件，三要素复核通过（fixed=true）', () => {
    writeChunk('package/components/ChartSection.vue', 13, GOOD_COMPONENT);

    const r = tryFixDanglingComponentFiles(root, ISSUES);

    expect(r.fixed).toBe(true);
    expect(existsSync(join(root, 'package/components/ChartSection.vue'))).toBe(true);
    expect(readFileSync(join(root, 'package/components/ChartSection.vue'), 'utf-8')).toBe(GOOD_COMPONENT);
    expect(r.remaining).toHaveLength(0);
  });

  it('阳性②：chunk-meta 缺登记时按文件名后缀兜底找候选', () => {
    writeFileSync(
      join(root, '.mc-gen/cache/code-chunks/13-package_components_ChartSection.vue'),
      GOOD_COMPONENT,
      'utf-8',
    );
    const r = tryFixDanglingComponentFiles(root, ISSUES);
    expect(r.fixed).toBe(true);
    expect(existsSync(join(root, 'package/components/ChartSection.vue'))).toBe(true);
  });

  it('阴性：缓存无候选 → 不补建（fixed=false，维持 fail-closed）', () => {
    const r = tryFixDanglingComponentFiles(root, ISSUES);
    expect(r.fixed).toBe(false);
    expect(existsSync(join(root, 'package/components/ChartSection.vue'))).toBe(false);
  });

  it('阴性②：缓存候选自身是坏 SFC → 不补建', () => {
    writeChunk(
      'package/components/ChartSection.vue',
      13,
      '<template><div :style="{ a: 1 };display:flex"></div></template>',
    );
    const r = tryFixDanglingComponentFiles(root, ISSUES);
    expect(r.fixed).toBe(false);
    expect(existsSync(join(root, 'package/components/ChartSection.vue'))).toBe(false);
  });

  it('recountDanglingTags：补建后归零；缺文件时报告', () => {
    const files = ['package/components/HeaderSection.vue'];
    expect(recountDanglingTags(readFileSync(join(root, 'package/index.vue'), 'utf-8'), files)).toEqual([
      { tag: 'ChartSection', missing: '缺组件文件' },
    ]);
    files.push('package/components/ChartSection.vue');
    expect(recountDanglingTags(readFileSync(join(root, 'package/index.vue'), 'utf-8'), files)).toEqual([]);
  });
});
