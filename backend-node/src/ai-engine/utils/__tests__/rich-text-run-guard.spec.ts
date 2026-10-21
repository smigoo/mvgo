/**
 * R19 · 行内多段样式**落位**判据单测（元素级）
 *
 * 🔴 第一版曾经是「段色在产物颜色语料里零出现就报」→ 真机离线回放**零命中**：
 *   三段的真值色都在主题变量表里躺着，只是没挂到该段元素上。判据域（全局色板）
 *   ≠ 事实落点（某个 span 的 color）⇒ 假绿。本 spec 用阳性对照把这条钉死：
 *   「色值存在但挂错元素」必须报红。
 */
import { extractTextRuns } from '../text-runs.js';
import { detectRichTextRunIssues, toHexColor, collectColorPalette } from '../rich-text-run-guard.js';

const solid = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return {
    type: 'SOLID',
    visible: true,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 },
  };
};

const chipTruth = () => ({
  id: 'root',
  type: 'FRAME',
  children: [
    {
      id: '38:3141',
      type: 'FRAME',
      name: 'Frame 2136639903',
      children: [
        {
          id: '38:3142',
          type: 'TEXT',
          characters: '华为技术',
          fills: [solid('#333333')],
          style: { fontSize: 14, fontWeight: 400 },
          absoluteBoundingBox: { x: 20, y: 8, width: 56, height: 18 },
        },
        {
          id: '38:3143',
          type: 'TEXT',
          characters: '8台',
          fills: [solid('#b9a000')],
          style: { fontSize: 14, fontWeight: 400 },
          absoluteBoundingBox: { x: 80, y: 8, width: 24, height: 18 },
        },
      ],
    },
  ],
});

const vue = (opts: { countColor: string; withScript?: boolean } = { countColor: '#b9a000' }) => {
  const script =
    opts.withScript === false
      ? ''
      : `
<script setup>
import { ref } from 'vue'
const list = ref([{ name: '华为技术', count: '8台' }])
</script>`;
  return `<template>
  <div class="cell" v-for="item in list" :key="item.count">
    <span class="c-name">{{ item.name }}</span>
    <span class="c-count">{{ item.count }}</span>
  </div>
</template>
${script}
<style lang="less">
@color-count-truth: #b9a000;
.c-name { color: #333333; font-size: 14px; }
.c-count { color: ${opts.countColor}; font-size: 14px; }
</style>`;
};

const filesOf = (content: string) => ({ 'package/components/Item.vue': content });

describe('RICH-TEXT-001：段色落位（元素级比较）', () => {
  it('正例：两段各自命中真值 → 零 issue', () => {
    const r = detectRichTextRunIssues(filesOf(vue()), { figmaRoot: chipTruth() });
    expect(r.issues).toEqual([]);
    expect(r.stats.judged).toBe(1);
    expect(r.stats.mismatch).toBe(0);
  });

  it('正例：变量间接引用（@var 展开后命中）→ 零 issue', () => {
    const r = detectRichTextRunIssues(filesOf(vue({ countColor: '@color-count-truth' })), {
      figmaRoot: chipTruth(),
    });
    expect(r.issues).toEqual([]);
  });

  it('🔴 阳性对照：色值存在但挂错元素（count 写成 #333333）→ error 且报 actual', () => {
    const r = detectRichTextRunIssues(filesOf(vue({ countColor: '#333333' })), {
      figmaRoot: chipTruth(),
    });
    const it = r.issues.find((x: any) => x.id === 'RICH-TEXT-001');
    expect(it).toBeTruthy();
    expect(it.severity).toBe('error');
    expect(it.missing).toEqual([
      { text: '8台', truth: '#b9a000', actual: '#333333', via: 'c-count' },
    ]);
    expect(r.stats.mismatch).toBe(1);
  });

  it('🔴 阳性对照：真值色躺在恒不命中的 `&--active` 里 → 仍报（基础色是错的）', () => {
    const content = vue({ countColor: '#333333' }).replace(
      '.c-count { color: #333333; font-size: 14px; }',
      '.c-count { color: #333333; font-size: 14px; &--active { color: #b9a000; } }',
    );
    const r = detectRichTextRunIssues(filesOf(content), { figmaRoot: chipTruth() });
    const it = r.issues.find((x: any) => x.id === 'RICH-TEXT-001');
    expect(it).toBeTruthy();
    expect(it.missing[0].actual).toBe('#333333');
  });

  it('fail-open：脚本里没有文本字面量（无法映射 run→元素）→ 不判', () => {
    const r = detectRichTextRunIssues(filesOf(vue({ withScript: false })), {
      figmaRoot: chipTruth(),
    });
    expect(r.issues).toEqual([]);
    expect(r.stats.judged).toBe(0);
    expect(r.stats.skippedUnmapped).toBe(1);
  });

  it('单色文本（同样式两段）→ 判据域外，零噪音', () => {
    const doc = chipTruth();
    doc.children[0].children[1].fills = [solid('#333333')];
    const r = detectRichTextRunIssues(filesOf(vue()), { figmaRoot: doc });
    expect(r.stats.mixedLines).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it('无真值 → 空（fail-open，不猜）', () => {
    const r = detectRichTextRunIssues(filesOf(vue()), {});
    expect(r.issues).toEqual([]);
    expect(r.stats.truth).toBe('none');
  });
});

describe('RICH-TEXT-002：多段被压平进一个元素', () => {
  it('阳性对照：整行字面量合并 → warn', () => {
    const flat = `<template>\n  <div class="cell">华为技术8台</div>\n</template>\n<style>.cell{color:#333333}</style>`;
    const r = detectRichTextRunIssues(filesOf(flat), { figmaRoot: chipTruth() });
    const it = r.issues.find((x: any) => x.id === 'RICH-TEXT-002');
    expect(it).toBeTruthy();
    expect(r.stats.flattened).toBe(1);
  });

  it('对照：两段各自成元素 → 不报 002', () => {
    const ok = `<template>\n  <div class="cell"><span class="a">华为技术</span><span class="b">8台</span></div>\n</template>\n<style>.a{color:#333333}.b{color:#b9a000}</style>`;
    const r = detectRichTextRunIssues(filesOf(ok), { figmaRoot: chipTruth() });
    expect(r.issues.filter((x: any) => x.id === 'RICH-TEXT-002')).toEqual([]);
  });
});

describe('颜色归一化（判据不得被写法规格冒充）', () => {
  it('hex3 / hex6 / rgb / rgba 都归一到 #rrggbb', () => {
    expect(toHexColor('#abc')).toBe('#aabbcc');
    expect(toHexColor('#AABBCC')).toBe('#aabbcc');
    expect(toHexColor('rgb(185,160,0)')).toBe('#b9a000');
    expect(toHexColor('rgba(185,160,0,0.5)')).toBe('#b9a000');
    expect(toHexColor('blue')).toBeNull();
  });

  it('调色板跨文件聚合（保留的粗查工具）', () => {
    const palette = collectColorPalette({
      'a.less': '@color-count: #b9a000;',
      'b.vue': '<style>.x{color:rgb(51,51,51)}</style>',
    });
    expect(palette.has('#b9a000')).toBe(true);
    expect(palette.has('#333333')).toBe(true);
  });

  it('textRuns 可复用（避免每次重算）', () => {
    const tr = extractTextRuns(chipTruth());
    const a = detectRichTextRunIssues(filesOf(vue()), { textRuns: tr });
    expect(a.stats.truth).toBe('passed');
    expect(a.issues).toEqual([]);
  });
});
