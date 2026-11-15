/**
 * header-decor-truth.spec.ts
 *
 * 事故锚：mc-max-1794728034288-4bc53ccd（「有的标题有 icon 有的没有」）
 *   真值 6/6 段都有装饰，产物三态：真 img / 空 span（CSS 无尺寸无背景）/ 连 span 都没有。
 *   日志铁证：`iconTruthConservation: truthIcons=2, skipped:["ChartSection.vue:no-icon-truth",
 *   "ChartSection7.vue:no-icon-truth","ContentForecast.vue:no-icon-truth"]`。
 */
import { collectHeaderDecorTruth, applyHeaderDecorTruth, renderDecorHtml } from './header-decor-truth';

/* ── 造树工具 ───────────────────────────────────────────────────────────── */

const solid = (hex) => ({
  type: 'SOLID',
  color: {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  },
});

function node(id, type, x, y, w, h, extra = {}) {
  return { id, type, name: extra.name || id, absoluteBoundingBox: { x, y, width: w, height: h }, ...extra };
}

/** 一个「标题行」：GROUP(row) → [iconGroup, textNode] */
function titleRow({ rowId, iconId, textId, text, rowY, rowH, iconW, iconH, iconChildren = [], iconExtra = {} }) {
  const icon = node(iconId, 'GROUP', 10, rowY, iconW, iconH, {
    children: iconChildren,
    ...iconExtra,
  });
  const textNode = node(textId, 'TEXT', 40, rowY, 80, rowH, { characters: text });
  return node(rowId, 'GROUP', 0, rowY, 200, rowH, { children: [icon, textNode] });
}

function wrap(rows) {
  return { id: '0:1', type: 'FRAME', name: 'root', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 800 }, children: rows };
}

const TRIPLE_ICON = (base, x, y) => [
  node(`${base}-a`, 'RECTANGLE', x, y, 18, 18.25, { fills: [solid('#1990ff')] }),
  node(`${base}-b`, 'RECTANGLE', x + 2.3, y + 2.33, 13.4, 13.59, { fills: [solid('#ffffff')] }),
  node(`${base}-c`, 'RECTANGLE', x + 4.69, y + 4.71, 8.71, 8.83, { fills: [solid('#57caff')] }),
];

/* ── 采集 ───────────────────────────────────────────────────────────────── */

describe('collectHeaderDecorTruth · 采集判据', () => {
  test('三层同构图标（18×18.25 RECTANGLE 层叠）⇒ shape=css、glyphs=3', () => {
    const root = wrap([
      titleRow({
        rowId: 'r1', iconId: 'i1', textId: 't1', text: '当日总流量',
        rowY: 160, rowH: 24.34, iconW: 18, iconH: 18.25,
        iconChildren: TRIPLE_ICON('g1', 10, 160),
      }),
    ]);
    const list = collectHeaderDecorTruth({ document: root });
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('当日总流量');
    expect(list[0].shape).toBe('css');
    expect(list[0].glyphs).toHaveLength(3);
    expect(list[0].glyphs[0].background).toBe('#1990ff');
    expect(list[0].width).toBe(18);
    expect(list[0].height).toBe(18.25);
  });

  test('单层渐变竖条（3×12 radius 6）⇒ glyphs=1 且带圆角', () => {
    const icon = node('i2', 'RECTANGLE', 10, 290, 3, 12, {
      fills: [{ type: 'GRADIENT_LINEAR', gradientStops: [{ position: 0, color: solid('#388dff').color }, { position: 1, color: solid('#388dff').color }] }],
      cornerRadius: 6,
    });
    const textNode = node('t2', 'TEXT', 20, 290, 100, 21, { characters: '江阴大桥' });
    const row = node('r2', 'FRAME', 0, 290, 200, 21, { children: [icon, textNode] });
    const list = collectHeaderDecorTruth({ document: wrap([row]) });
    expect(list).toHaveLength(1);
    expect(list[0].glyphs).toHaveLength(1);
    expect(list[0].glyphs[0].borderRadius).toBe(6);
    expect(list[0].glyphs[0].background).toMatch(/linear-gradient/);
  });

  test('子树含 VECTOR（不规则路径）⇒ shape=irregular，不产 CSS', () => {
    const icon = node('i3', 'GROUP', 10, 116, 8, 8.11, {
      children: [node('v1', 'VECTOR', 10, 116, 8, 8.11, { fills: [solid('#000000')] })],
    });
    // 垂直中心需落在 icon 高的 0.6 倍内：icon center=120.06，text center=121.5 ⇒ 差 1.44 < 4.87
    const textNode = node('t3', 'TEXT', 20, 112, 60, 19, { characters: '流量监测' });
    const row = node('r3', 'GROUP', 0, 116, 200, 32, { children: [icon, textNode] });
    const list = collectHeaderDecorTruth({ document: wrap([row]) });
    expect(list).toHaveLength(1);
    expect(list[0].shape).toBe('irregular');
    expect(renderDecorHtml(list[0])).toBeNull();
  });

  test('装饰子树含 TEXT（下拉框底板）⇒ 不采集', () => {
    const panel = node('p1', 'FRAME', 10, 100, 100, 30.42, {
      fills: [solid('#ffffff')],
      children: [node('p1t', 'TEXT', 20, 105, 60, 19, { characters: '24小时' })],
    });
    const textNode = node('t4', 'TEXT', 120, 100, 40, 19, { characters: '时间范围' });
    const row = node('r4', 'FRAME', 0, 100, 200, 30.42, { children: [panel, textNode] });
    const list = collectHeaderDecorTruth({ document: wrap([row]) });
    expect(list).toHaveLength(0);
  });

  test('宽度超过行内 TEXT 高 ×2（控件底板）⇒ 不采集', () => {
    const panel = node('p2', 'RECTANGLE', 10, 100, 100, 30.42, { fills: [solid('#ffffff')] });
    const textNode = node('t5', 'TEXT', 130, 100, 40, 21, { characters: '24小时' });
    const row = node('r5', 'FRAME', 0, 100, 200, 30.42, { children: [panel, textNode] });
    const list = collectHeaderDecorTruth({ document: wrap([row]) });
    expect(list).toHaveLength(0);
  });

  test('垂直中心不对齐（装饰在标题行下方）⇒ 不采集', () => {
    const icon = node('i6', 'RECTANGLE', 10, 145, 8, 8, { fills: [solid('#ffffff')] });
    const textNode = node('t6', 'TEXT', 10, 119, 60, 19, { characters: '流量监测' });
    const row = node('r6', 'GROUP', 0, 119, 200, 33, { children: [icon, textNode] });
    const list = collectHeaderDecorTruth({ document: wrap([row]) });
    expect(list).toHaveLength(0);
  });

  test('fail-open：空树 / null ⇒ 空数组', () => {
    expect(collectHeaderDecorTruth(null)).toEqual([]);
    expect(collectHeaderDecorTruth({})).toEqual([]);
    expect(collectHeaderDecorTruth({ document: { id: 'x', type: 'FRAME' } })).toEqual([]);
  });
});

/* ── 落地 ───────────────────────────────────────────────────────────────── */

function truthFor(text, w = 18, h = 18.25) {
  return [
    {
      decorId: `d-${text}`,
      text,
      width: w,
      height: h,
      shape: 'css',
      glyphs: [{ left: 0, top: 0, width: w, height: h, background: '#1990ff', borderRadius: 0, depth: 0 }],
    },
  ];
}

const vue = (tpl, style = '') => `<template>\n${tpl}\n</template>\n<script setup>\n</script>\n<style lang="less" scoped>\n${style}\n</style>\n`;

describe('applyHeaderDecorTruth · 落地', () => {
  test('空占位 span ⇒ 原地替换为装饰（保留原 DOM 位置）', () => {
    const files = {
      'package/components/A.vue': vue(
        `  <div class="title">\n    <span class="title-icon"></span>\n    <span class="title-text">流量预测</span>\n  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('流量预测'));
    expect(res.stats.replaced).toBe(1);
    expect(res.stats.inserted).toBe(0);
    expect(res.files['package/components/A.vue']).toContain('mc-header-decor');
    // 原空占位被替换，不是叠加
    expect(res.files['package/components/A.vue']).not.toContain('class="title-icon"');
  });

  test('无空占位 ⇒ 在文本元素内前缀内联插入', () => {
    const files = {
      'package/components/B.vue': vue(
        `  <div class="hdr">\n    <span class="hdr-title">车型分布</span>\n  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('车型分布'));
    expect(res.stats.inserted).toBe(1);
    const out = res.files['package/components/B.vue'];
    expect(out).toContain('display:inline-block');
    // 装饰在文字之前、且在 span 内部
    expect(out).toMatch(/<span class="hdr-title">[\s\S]*mc-header-decor[\s\S]*车型分布<\/span>/);
  });

  test('同行已有 <img> ⇒ keptExplicit，不注入', () => {
    const files = {
      'package/components/C.vue': vue(
        `  <div class="hdr">\n    <span class="hdr-text">当日总流量</span>\n    <img :src="icon2" alt="" />\n  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('当日总流量'));
    expect(res.stats.keptExplicit).toBe(1);
    expect(res.stats.inserted + res.stats.replaced).toBe(0);
    expect(res.files['package/components/C.vue']).not.toContain('mc-header-decor');
  });

  test('空槽自带 background（LLM 已画了个形状）⇒ 按真值规范化替换（不叠加）', () => {
    const files = {
      'package/components/D.vue': vue(
        `  <div class="hdr">\n    <span class="hdr-deco" style="background:#ff0000;width:18px;height:18px;"></span>\n    <span class="hdr-text">流量预测</span>\n  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('流量预测'));
    expect(res.stats.replaced).toBe(1);
    const out = res.files['package/components/D.vue'];
    // 臆造色 #ff0000 被真值 #1990ff 取代，且不出现两份装饰
    expect(out).toContain('#1990ff');
    expect(out).not.toContain('#ff0000');
    expect(out.match(/mc-header-decor/g)).toHaveLength(1);
  });

  test('幂等：第二跑零改动', () => {
    const files = {
      'package/components/E.vue': vue(
        `  <div class="title">\n    <span class="title-icon"></span>\n    <span class="title-text">江阴大桥</span>\n  </div>`,
      ),
      'package/components/F.vue': vue(
        `  <div class="hdr">\n    <span class="hdr-title">车型分布</span>\n  </div>`,
      ),
    };
    const once = applyHeaderDecorTruth({ ...files }, [...truthFor('江阴大桥'), ...truthFor('车型分布')]);
    const twice = applyHeaderDecorTruth({ ...once.files }, [...truthFor('江阴大桥'), ...truthFor('车型分布')]);
    expect(twice.stats.inserted).toBe(0);
    expect(twice.stats.replaced).toBe(0);
    expect(twice.stats.changes).toHaveLength(0);
    for (const p of Object.keys(once.files)) {
      expect(twice.files[p]).toBe(once.files[p]);
    }
  });

  test('文本不在模板里 ⇒ textNotFound，不改动', () => {
    const files = {
      'package/components/G.vue': vue(`  <div class="hdr"><span>别的标题</span></div>`),
    };
    const res = applyHeaderDecorTruth(files, truthFor('流量预测'));
    expect(res.stats.textNotFound).toBe(1);
    expect(res.stats.changes).toHaveLength(0);
  });

  test('shape=irregular 且无 CSS 层 ⇒ irregularSkipped，不改动', () => {
    const files = {
      'package/components/H.vue': vue(`  <div class="hdr"><span>流量监测</span></div>`),
    };
    const res = applyHeaderDecorTruth(files, [
      { decorId: 'x', text: '流量监测', width: 8, height: 8, shape: 'irregular', glyphs: [] },
    ]);
    expect(res.stats.irregularSkipped).toBeGreaterThan(0);
    expect(res.stats.changes).toHaveLength(0);
  });

  test('fail-open：空真值 / 非对象 files ⇒ 原样返回', () => {
    const files = { 'package/components/I.vue': vue(`<div>x</div>`) };
    const before = files['package/components/I.vue'];
    expect(applyHeaderDecorTruth(files, []).stats.truth).toBe(0);
    expect(files['package/components/I.vue']).toBe(before);
    expect(applyHeaderDecorTruth(null, truthFor('x')).changes).toEqual([]);
  });

  /* ── 双份图标防线（真机 mc-max-1794731570445-ca763935 实锤）──────────────
   * 事故：`<div class="forecast-header"><img/><div class="header"><span>流量预测</span></div></div>`
   * img 是文本容器的**伯父**，原实现固定上溯 2 层落在 `div.header`（子树无 img）
   * ⇒ 判「无图标」⇒ 又插一份 CSS 环 ⇒ 标题前两个图标。 */

  test('伯父级已有同尺寸 <img> ⇒ keptExplicit，不插第二份（Forecast 形态）', () => {
    const files = {
      'package/components/F.vue': vue(
        `  <div class="forecast-header">\n`
        + `    <img :src="icon2" style="width:18px;height:18.25px;object-fit:contain;flex:none;" alt="" />\n`
        + `    <div class="header">\n      <span class="header-title">流量预测</span>\n    </div>\n`
        + `  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('流量预测'));
    expect(res.stats.keptExplicit).toBe(1);
    expect(res.stats.inserted).toBe(0);
    expect(res.files['package/components/F.vue']).not.toContain('mc-header-decor');
  });

  test('兄弟容器内 <img> 尺寸略偏（18×19 vs 真值 18×18.25）⇒ 仍认已有（DailyTotalFlow 形态）', () => {
    const files = {
      'package/components/D.vue': vue(
        `  <div class="header">\n`
        + `    <div class="icon"><img :src="icon2" style="width:18px;height:19px;flex:none" alt="" /></div>\n`
        + `    <span class="title">当日总流量</span>\n`
        + `  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('当日总流量'));
    expect(res.stats.keptExplicit).toBe(1);
    expect(res.files['package/components/D.vue']).not.toContain('mc-header-decor');
  });

  test('反例·兄弟是段背景大图（426×91）⇒ 不误判，装饰照插', () => {
    const files = {
      'package/components/E.vue': vue(
        `  <div class="section">\n`
        + `    <div class="bg" style="background-image:url(bg-1.png);width:426px;height:91px"></div>\n`
        + `    <div class="hdr"><span class="hdr-title">车型分布</span></div>\n`
        + `  </div>`,
      ),
    };
    const res = applyHeaderDecorTruth(files, truthFor('车型分布'));
    expect(res.stats.inserted).toBe(1);
    expect(res.files['package/components/E.vue']).toContain('mc-header-decor');
  });
});
