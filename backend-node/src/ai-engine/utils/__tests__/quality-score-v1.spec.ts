/**
 * 生成质量评分 v1（确定性，不含 LLM）
 *
 * specScore = clamp(0,100, 100-20×BLOCK-5×WARN)，有 BLOCK 时硬顶 79
 * styleScore 四维等权；无期望 → null（不是 0/100）
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  computeSpecScore,
  extractExpectedStyleLiterals,
  extractExpectedStyleLiteralsWithLocation,
  extractDeclaredStyleLiterals,
  computeStyleScore,
  mergeQualityIntoMeta,
  findFigmaNodeData,
  detectComponentType,
  scoreComponentDir,
  scoreResourceMount,
  collectExportedResourceNodeIds,
  collectPanelShellNodeIds,
  extractExpectedStructure,
  extractActualStructure,
} from '../quality-score-v1.js';

describe('computeSpecScore', () => {
  it('无问题 = 100', () => {
    expect(computeSpecScore({ blockCount: 0, warnCount: 0 }).score).toBe(100);
  });

  it('1 BLOCK 硬顶 79（不允许带阻断项显示为良好）', () => {
    expect(computeSpecScore({ blockCount: 1, warnCount: 0 }).score).toBe(79);
  });

  it('仅 WARN 扣 3', () => {
    expect(computeSpecScore({ blockCount: 0, warnCount: 1 }).score).toBe(97);
  });

  it('1 BLOCK + 1 WARN = 79（硬顶）', () => {
    expect(computeSpecScore({ blockCount: 1, warnCount: 1 }).score).toBe(79);
  });

  it('扣到 0 封底', () => {
    expect(computeSpecScore({ blockCount: 5, warnCount: 5 }).score).toBe(45);
  });

  it('可从 issues 计数', () => {
    const r = computeSpecScore({
      issues: [
        { id: 'A', severity: 'BLOCK', message: 'x' },
        { id: 'B', severity: 'WARN', message: 'y' },
      ],
    });
    expect(r.blockCount).toBe(1);
    expect(r.warnCount).toBe(1);
    expect(r.score).toBe(79);
  });
});

describe('computeStyleScore', () => {
  it('无期望时 score=null（不是 0 也不是 100）', () => {
    expect(computeStyleScore(null, { color: ['#000'] }).score).toBeNull();
    expect(computeStyleScore({ color: [], spacing: [], font: [], radius: [] }, { color: ['#000'] }).score).toBeNull();
  });

  it('四维完全匹配 = 100', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'], font: ['16px'], radius: ['4px'] };
    const actual = { color: ['#ff0000'], spacing: ['8px'], font: ['16px'], radius: ['4px'] };
    expect(computeStyleScore(expected, actual).score).toBe(100);
  });

  it('两维一半匹配 = 50', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'] };
    const actual = { color: ['#ff0000'], spacing: ['12px'] };
    expect(computeStyleScore(expected, actual).score).toBe(50);
  });

  it('颜色完全不匹配 = 0，覆盖率不足封顶 60 不影响 0', () => {
    const expected = { color: ['#ff0000'] };
    const actual = { color: ['#000000'] };
    expect(computeStyleScore(expected, actual).score).toBe(0);
  });

  it('某维无期望不进平均', () => {
    const expected = { color: ['#ff0000'], spacing: ['8px'] };
    const actual = { color: ['#ff0000'] };
    expect(computeStyleScore(expected, actual).score).toBe(50);
  });

  // 🔴 回归锁（2026-09-30 复审）：容差不得放宽。曾有一版把 tolerance 3→5 / relativeTolerance 0.15→0.2，
  //   理由是「期望 18↔16、11↔12、16↔14 被误杀」—— 实测旧档本来就匹配，属错误理由，
  //   且放宽后差 4px 会被判匹配 ⇒ 破坏「不匹配应判 50」契约、用户侧质量分虚高。
  it('spacing 容差边界：差 3px 判匹配、差 4px 判不匹配（tolerance 不得放宽）', () => {
    const scoreWith = (actualSpacing: string) =>
      computeStyleScore(
        { color: ['#ff0000'], spacing: ['8px'] },
        { color: ['#ff0000'], spacing: [actualSpacing] },
      ).score;
    expect(scoreWith('11px')).toBe(100); // 差 3 ⇒ 匹配
    expect(scoreWith('12px')).toBe(50); // 差 4 ⇒ 不匹配（放宽容差即在此失守）
  });
});

// 🛡️ 2026-11-03 style 色彩分档留痕：只加可观测层，判定阈值一个字不改。
// 离线取证（3741 期望色 / 262 目录）证明 maxDelta=24 的「吸收取整噪声」原始理由不成立：
// 噪声几乎全在 d=0（(0,3] 仅 0.51%），而 11.84% 的匹配发生在 d∈(10,24]（肉眼可辨的实质色差）。
// 故本轮只把「这次匹配有多勉强」摆到明面上，不改 matched/missed/score。
describe('computeStyleScore · colorAudit 色彩分档留痕（2026-11-03）', () => {
  it('loose 档（3<d<=24 实质色差被兜住）计数正确，且判定不变（仍算 matched）', () => {
    const r = computeStyleScore({ color: ['#ff4747'] }, { color: ['#ff5a50'] });
    // d = sqrt(19²+9²) ≈ 21.0 ⇒ loose
    expect(r.colorAudit.loose).toBe(1);
    expect(r.colorAudit.exact).toBe(0);
    expect(r.colorAudit.over).toBe(0);
    // 判定零回归：原本就判 matched=1 / score=100，本轮不得改动
    expect(r.dimensions.color.matched).toBe(1);
    expect(r.score).toBe(100);
  });

  it('alphaGaps：RGB 完全命中（d=0）但 |Δalpha|>0.08 单独计数', () => {
    const r = computeStyleScore({ color: ['#2c68ff'] }, { color: ['rgba(44,104,255,0.08)'] });
    expect(r.colorAudit.exact).toBe(1);
    expect(r.colorAudit.alphaGaps).toBe(1);
    expect(r.colorAudit.samples[0]).toMatchObject({ expected: '#2c68ff', delta: 0 });
    expect(r.colorAudit.samples[0].alphaDiff).toBeCloseTo(0.92, 2);
    expect(r.dimensions.color.matched).toBe(1);
  });

  it('全精确匹配时不产生 loose / alphaGaps / samples', () => {
    const r = computeStyleScore({ color: ['#ffffff'] }, { color: ['#ffffff'] });
    expect(r.colorAudit).toMatchObject({ expected: 1, exact: 1, near: 0, loose: 0, over: 0, alphaGaps: 0 });
    expect(r.colorAudit.samples).toHaveLength(0);
  });

  it('完全不匹配只计 over，score=0（判定零回归）', () => {
    const r = computeStyleScore({ color: ['#ff0000'] }, { color: ['#000000'] });
    expect(r.colorAudit.over).toBe(1);
    expect(r.colorAudit.loose).toBe(0);
    expect(r.dimensions.color.matched).toBe(0);
    expect(r.score).toBe(0);
  });

  it('非 color 维度不得挂 colorAudit（避免污染）', () => {
    const r = computeStyleScore({ color: ['#fff'], spacing: ['8px'] }, { color: ['#fff'], spacing: ['8px'] });
    expect(r.dimensions.spacing.colorAudit).toBeUndefined();
    expect(r.dimensions.color.colorAudit).toBeDefined();
    // 顶层便捷出口存在且与维度内同一对象
    expect(r.colorAudit).toBe(r.dimensions.color.colorAudit);
  });
});

describe('extractDeclaredStyleLiterals', () => {
  // 2026-11-02 修正：2026-09-22 起只扫样式上下文，无 path 文件不提取（裸 content 不再命中），
  // 此用例自此随基线失败（HEAD 实证 1 failed），补 path 恢复其校验本意。
  it('从 CSS 声明抽 color/spacing/font/radius', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: 'background: #ff0000; margin: 8px 12px; font-size: 16px; border-radius: 4px;',
      },
    ];
    expect(extractDeclaredStyleLiterals(files)).toMatchObject({
      color: ['#ff0000'],
      spacing: ['8px', '12px'],
      font: ['16px'],
      radius: ['4px'],
    });
  });

  // 🔴 回归锁（2026-11-02，实证 mc-max-1793629839483-bf86ddba）：fg-takeover 产物的 fg 样式
  // 大量写在模板内联 style="..." / :style="{...}"，此前只扫 <style> 块 ⇒ 真实存在的值被判
  // missed（#3965ff≡rgba(57,101,255,1) 内联实存却扣分；gap:34px/10px、margin-top:-1px 同理）。
  describe('模板内联样式补扫（2026-11-02 修复）', () => {
    const vueFile = {
      path: 'package/components/Stats.vue',
      content: `<template>
  <div data-section-id="43:4893" style="display:flex;gap:34px;padding:0;">
    <div class="card" style="gap:10px;background:#bdd5ff;border:1px solid #ffffff;">
      <span style="color:rgba(57,101,255,1);font-size:24px;font-weight:400;">{{ v0 }}</span>
    </div>
    <div :style="{ boxSizing: 'border-box', padding: '10px 16px', fontSize: '14px', marginRight: row.gap == null ? undefined : row.gap + 'px' }"></div>
    <div :style="{ backgroundImage: 'url(' + fgStatBg0 + ')' }"></div>
  </div>
</template>
<style>.card{color:#333333;margin-top:8px;}</style>`,
    };

    it('静态 style 与 :style 字符串字面量均被提取', () => {
      const r = extractDeclaredStyleLiterals([vueFile]);
      expect(r.color).toContain('#bdd5ff');
      expect(r.color).toContain('#ffffff');
      expect(r.color).toContain('rgba(57,101,255,1)');
      expect(r.spacing).toContain('34px');
      expect(r.spacing).toContain('10px');
      expect(r.spacing).toContain('16px');
      expect(r.font).toContain('24px');
      expect(r.font).toContain('14px');
    });

    it('动态表达式（row.gap + "px"）不误采；<style> 块提取不受影响', () => {
      const r = extractDeclaredStyleLiterals([vueFile]);
      // 所有 spacing 条目都必须是干净的 px 字面量（不带引号/表达式残留）
      expect(r.spacing.every((s) => /^-?[\d.]+px$/.test(s))).toBe(true);
      expect(r.spacing).toContain('8px'); // <style> 块
      expect(r.color).toContain('#333333'); // <style> 块
    });
  });
});

describe('extractExpectedStyleLiterals', () => {
  it('从 Figma SOLID fill 抽出 CSS hex', () => {
    const figma = {
      document: {
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      },
    };
    expect(extractExpectedStyleLiterals(figma).color).toContain('#ff0000');
  });

  it('无节点树返回空期望', () => {
    expect(extractExpectedStyleLiterals(null).color).toEqual([]);
    expect(extractExpectedStyleLiterals({ url: 'https://figma.com' }).color).toEqual([]);
  });

  // 🔴 回归锁（2026-09-30 复审）：Math.round **只去浮点噪声**，不得改变纳入集合。
  //   曾有一版对 itemSpacing 加 `> 0` 过滤，连 0 与负值一起丢弃 ⇒ 期望分母变小 ⇒ 分数虚高
  //   （负 itemSpacing 是真实叠加排布事实，不是噪声）。
  it('spacing 去浮点噪声但不改变纳入集合（0 与负值仍纳入）', () => {
    const exp = extractExpectedStyleLiterals({
      document: {
        children: [
          { itemSpacing: 17.600000381469727, paddingLeft: 11.199999809265137 },
          { itemSpacing: 0 },
          { itemSpacing: -8 },
        ],
      },
    });
    expect(exp.spacing).toContain('18px'); // 去噪：17.600000381469727 → 18
    expect(exp.spacing).toContain('11px'); // 去噪：11.199999809265137 → 11
    expect(exp.spacing).toContain('0px'); // 0 仍纳入
    expect(exp.spacing).toContain('-8px'); // 负值仍纳入
  });
});

// 🛡️ P4 位图替代矢量豁免档（2026-11-03）
//   判据 = 节点**顶层可见 fill** 为 IMAGE ⇒ 其 cornerRadius 已随节点渲染烘入位图 PNG 的 alpha 通道
//   （`figma-client.js:77` `GET /files/{key}/images?ids={nodeId}&format=png` 为**按节点渲染**端点），
//   产物以 <img>/background-image 直接显示该位图，CSS 无需再写 border-radius ⇒ 仍作期望项则恒失配 ⇒ 假扣分。
//   **不放水边界**：仅 IMAGE 顶层 fill 豁免；SOLID/GRADIENT 顶层节点照常纳入（真值）；ELLIPSE 照旧跳过。
describe('extractExpectedStyleLiteralsWithLocation · P4 位图圆角豁免档', () => {
  it('IMAGE 顶层 fill 的 cornerRadius 不进 radius，且 stats.bitmapRadiusExempted=1', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        children: [
          // 复刻真机样本 81:37：RECTANGLE / fill IMAGE / cornerRadius 2（28×28 位图）
          { id: '81:37', type: 'RECTANGLE', name: 'image 473938', fills: [{ type: 'IMAGE', visible: true, imageRef: 'abc' }], cornerRadius: 2 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma);
    expect(r.radius).toEqual([]); // 位图圆角已烘入 PNG，不应作为 CSS 期望
    expect(r.stats.bitmapRadiusExempted).toBe(1);
    // 字符串版 API 不受影响（只取四维）
    expect(extractExpectedStyleLiterals(figma).radius).toEqual([]);
  });

  it('SOLID 顶层 fill 的 cornerRadius 照常纳入（回归锁 · 真值不放水）', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        children: [
          // 复刻真机样本 43:5688：RECTANGLE / fill SOLID rgba(20,105,169,.37) / cornerRadius 3
          { id: '43:5688', type: 'RECTANGLE', name: 'line', fills: [{ type: 'SOLID', color: { r: 0.078, g: 0.412, b: 0.663 }, opacity: 0.37 }], cornerRadius: 3 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma);
    const vals = r.radius.map((e) => e.value);
    expect(vals).toContain('3px');
    expect(r.stats.bitmapRadiusExempted).toBe(0);
  });

  it('GRADIENT 顶层 fill 的 cornerRadius 也照常纳入（不为省事越界豁免）', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        children: [
          { id: '55:1', type: 'RECTANGLE', name: 'grad', fills: [{ type: 'GRADIENT_LINEAR', visible: true }], cornerRadius: 8 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma);
    expect(r.radius.map((e) => e.value)).toContain('8px');
    expect(r.stats.bitmapRadiusExempted).toBe(0);
  });

  it('ELLIPSE 仍被跳过（圆形半径≠CSS border-radius，既有口径不回归）', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        children: [
          { id: '77:1', type: 'ELLIPSE', name: 'dot', fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }], cornerRadius: 75 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma);
    expect(r.radius).toEqual([]);
    expect(r.stats.bitmapRadiusExempted).toBe(0); // 跳过 ≠ 豁免，计数口径要干净
  });

  it('无节点树时 stats 存在且为 0（fail-safe：调用方解构 stats 不炸）', () => {
    expect(extractExpectedStyleLiteralsWithLocation(null).stats.bitmapRadiusExempted).toBe(0);
    expect(extractExpectedStyleLiteralsWithLocation({ url: 'x' }).radius).toEqual([]);
  });
});

describe('extractExpectedStyleLiteralsWithLocation · 档A 面板壳圆角豁免', () => {
  // 判据（2026-11-03 同源化）= 节点 id ∈ `collectPanelShellNodeIds(resourceMapping)`
  //   ⇔ `resource-dom-mapping.json` 里该节点 `skipMount === true`。
  //   语义：生成侧已裁决「产物不还原它」（面板外壳由宿主 base-panel 提供，
  //   见 figma-connector.js:2679-2704：previewAnalysisRole==='bg' ∧ figmaPath 段数 ≤2）⇒
  //   其 cornerRadius 恒失配，不该计入分母。
  // 🔴 为什么不用 `isPanelResource`（名字白名单）：实测反例 `36:1697 header`
  //   —— 名字命中 `/(header|title-bar)$/` 但 mapping 里**无** skipMount，产物确实渲染它。
  //   名字判据与 skipMount 在 158 例上「恰好重合」而非同一事实源 ⇒ 只认 skipMount。
  const solid = [{ type: 'SOLID', color: { r: 0.83, g: 0.89, b: 1 }, opacity: 1 }];

  it('命中集合：cornerRadius 不进 radius，panelShellRadiusExempted=1（颜色仍收，只作用 radius）', () => {
    const figma = {
      document: {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          // 复刻真机样本 36:1694：RECTANGLE / name 'bg' / cornerRadius 4 / skipMount:true
          { id: '36:1694', type: 'RECTANGLE', name: 'bg', fills: solid, cornerRadius: 4 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma, {
      panelShellNodeIds: new Set(['36:1694']),
    });
    expect(r.radius).toEqual([]);
    expect(r.stats.panelShellRadiusExempted).toBe(1);
    // 档A 只作用于 radius：面板壳的颜色不是本档语义（走档B），仍应纳入
    expect(r.color.map((e) => e.value)).toHaveLength(1);
    expect(r.stats.bitmapRadiusExempted).toBe(0);
  });

  it('反例锁（同源化动机）：36:1697 header 名字像面板壳但无 skipMount ⇒ 不在集合 ⇒ 照常纳入', () => {
    const figma = {
      document: {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          { id: '36:1697', type: 'VECTOR', name: 'header', fills: solid, cornerRadius: 12 },
        ],
      },
    };
    // 旧的 isPanelResource 判据会把它当面板壳豁免（这就是 158 例 vs 4 例的分歧点）；
    // skipMount 判据不会 —— 产物确实渲染它，圆角必须审。
    const r = extractExpectedStyleLiteralsWithLocation(figma, {
      panelShellNodeIds: new Set(['36:1694']),
    });
    expect(r.radius.map((e) => e.value)).toContain('12px');
    expect(r.stats.panelShellRadiusExempted).toBe(0);
  });

  it('防误伤：嵌套 tabs-list/bg 不在集合 ⇒ 照常纳入（mountTarget 挂载、产物要渲染）', () => {
    const figma = {
      document: {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          {
            id: 'n1',
            type: 'FRAME',
            name: 'tabs-list',
            children: [
              // mountTarget 挂载、产物**要**渲染 ⇒ 其圆角是真值
              { id: 'n2', type: 'GROUP', name: 'bg', fills: solid, cornerRadius: 6 },
            ],
          },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma, {
      panelShellNodeIds: new Set(['36:1694']),
    });
    expect(r.radius.map((e) => e.value)).toContain('6px');
    expect(r.stats.panelShellRadiusExempted).toBe(0);
  });

  it('数组入参同样生效（Array → Set 归一）', () => {
    const figma = {
      document: {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [{ id: '36:1694', type: 'RECTANGLE', name: 'bg', fills: solid, cornerRadius: 4 }],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma, { panelShellNodeIds: ['36:1694'] });
    expect(r.radius).toEqual([]);
    expect(r.stats.panelShellRadiusExempted).toBe(1);
  });

  it('不传 / 传 null：零豁免（mapping 缺失时退化为全审，安全方向）', () => {
    const figma = {
      document: {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [{ id: '36:1694', type: 'RECTANGLE', name: 'bg', fills: solid, cornerRadius: 4 }],
      },
    };
    for (const opts of [undefined, {}, { panelShellNodeIds: null }]) {
      const r = extractExpectedStyleLiteralsWithLocation(figma, opts);
      expect(r.radius.map((e) => e.value)).toEqual(['4px']);
      expect(r.stats.panelShellRadiusExempted).toBe(0);
    }
  });
});

describe('extractExpectedStyleLiteralsWithLocation · 档B 成品位图资源豁免', () => {
  // 判据 = 节点 id ∈ `collectExportedResourceNodeIds(resourceMapping)`（downloadStatus === 'success'）。
  // 依据：节点已按节点渲染导出为 PNG，其 fill 颜色 / 圆角已在位图像素里，产物写 <img :src>，CSS 无从声明。
  const solid = [{ type: 'SOLID', color: { r: 0.22, g: 0.4, b: 1 }, opacity: 1 }];

  it('命中：color 与 radius 均不进；两个计数各 +1', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          // 复刻真机样本 48:5903：VECTOR / fill #3965ff → 导出 icon-关闭-5903.png
          { id: '48:5903', type: 'VECTOR', name: 'icon-关闭', fills: solid, cornerRadius: 2 },
        ],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma, {
      exemptPixelNodeIds: new Set(['48:5903']),
    });
    expect(r.color).toEqual([]);
    expect(r.radius).toEqual([]);
    expect(r.stats.exportedPixelColorExempted).toBe(1);
    expect(r.stats.bitmapRadiusExempted).toBe(1); // 档B 圆角计入既有「位图圆角」计数
    expect(r.stats.panelShellRadiusExempted).toBe(0);
  });

  it('边界（不放水）：downloadStatus=missing 的节点（如 36:1694）不在集合 ⇒ 照常纳入', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          { id: '36:1694', type: 'RECTANGLE', name: 'bg', fills: solid, cornerRadius: 4 },
        ],
      },
    };
    // 集合里只有另一个已导出节点 ⇒ 36:1694 不受档B影响；
    // 另显式传档A 集合，锁住「圆角归因于档A（skipMount）而非档B（已导出）」这条分账口径
    const r = extractExpectedStyleLiteralsWithLocation(figma, {
      exemptPixelNodeIds: new Set(['48:5903']),
      panelShellNodeIds: new Set(['36:1694']),
    });
    expect(r.color.map((e) => e.value)).toHaveLength(1);
    expect(r.stats.exportedPixelColorExempted).toBe(0);
    expect(r.radius).toEqual([]);
    expect(r.stats.panelShellRadiusExempted).toBe(1); // 圆角由档A 豁免，非档B
  });

  it('数组入参同样生效（Array → Set 归一）', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [{ id: '48:5903', type: 'VECTOR', name: 'icon', fills: solid, cornerRadius: 0 }],
      },
    };
    const r = extractExpectedStyleLiteralsWithLocation(figma, { exemptPixelNodeIds: ['48:5903'] });
    expect(r.color).toEqual([]);
    expect(r.stats.exportedPixelColorExempted).toBe(1);
  });

  it('不传 / 传 null：行为与开启本档前一致（零豁免）', () => {
    const figma = {
      document: {
        id: '1:0',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [{ id: '48:5903', type: 'VECTOR', name: 'icon', fills: solid, cornerRadius: 3 }],
      },
    };
    for (const opts of [undefined, {}, { exemptPixelNodeIds: null }]) {
      const r = extractExpectedStyleLiteralsWithLocation(figma, opts);
      expect(r.color.map((e) => e.value)).toHaveLength(1);
      expect(r.stats.exportedPixelColorExempted).toBe(0);
    }
  });
});

describe('collectExportedResourceNodeIds', () => {
  it('只取 downloadStatus=success 的 figmaNodeId', () => {
    const ids = collectExportedResourceNodeIds([
      { figmaNodeId: '36:1697', downloadStatus: 'success' },
      { figmaNodeId: '36:1694', downloadStatus: 'missing' },
      { figmaNodeId: '801:3', downloadStatus: null },
      { figmaNodeId: '36:1725', downloadStatus: 'success' },
    ]);
    expect(ids).toBeInstanceOf(Set);
    expect([...ids].sort()).toEqual(['36:1697', '36:1725']);
  });

  it('成功但 figmaNodeId 缺失/非字符串 ⇒ 排除', () => {
    const ids = collectExportedResourceNodeIds([
      { downloadStatus: 'success' },
      { figmaNodeId: '', downloadStatus: 'success' },
      { figmaNodeId: 123, downloadStatus: 'success' },
    ]);
    expect(ids).toBeNull();
  });

  it('空数组 / 非数组 / null ⇒ null（与「不传」等价）', () => {
    expect(collectExportedResourceNodeIds([])).toBeNull();
    expect(collectExportedResourceNodeIds(null)).toBeNull();
    expect(collectExportedResourceNodeIds({})).toBeNull();
    expect(collectExportedResourceNodeIds('x')).toBeNull();
  });
});

describe('collectPanelShellNodeIds', () => {
  it('只取 skipMount === true 的 figmaNodeId', () => {
    const ids = collectPanelShellNodeIds([
      { figmaNodeId: '36:1694', skipMount: true },
      { figmaNodeId: '36:1697', skipMount: false }, // 名字像面板壳，但生成侧要挂载 ⇒ 不算
      { figmaNodeId: '36:1722' }, // 字段缺失
      { figmaNodeId: '36:1727', skipMount: 'true' }, // 字符串不算（严格 === true）
      { figmaNodeId: '36:1725', skipMount: true },
    ]);
    expect(ids).toBeInstanceOf(Set);
    expect([...ids].sort()).toEqual(['36:1694', '36:1725']);
  });

  it('skipMount=true 但 figmaNodeId 缺失/非字符串 ⇒ 排除', () => {
    const ids = collectPanelShellNodeIds([
      { skipMount: true },
      { figmaNodeId: '', skipMount: true },
      { figmaNodeId: 123, skipMount: true },
    ]);
    expect(ids).toBeNull();
  });

  it('空数组 / 非数组 / null ⇒ null（与「不传」等价）', () => {
    expect(collectPanelShellNodeIds([])).toBeNull();
    expect(collectPanelShellNodeIds(null)).toBeNull();
    expect(collectPanelShellNodeIds({})).toBeNull();
    expect(collectPanelShellNodeIds('x')).toBeNull();
  });
});

describe('findFigmaNodeData', () => {
  it('认得真实落盘名 .mc-gen/cache/figma-node-data.json（回归 2026-09-19）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-figma-'));
    try {
      const cacheDir = join(dir, '.mc-gen', 'cache');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'figma-node-data.json'),
        JSON.stringify({
          fileKey: 'fk',
          nodeId: '1:2',
          document: { id: '1:2', type: 'FRAME', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
        }),
      );
      const found = findFigmaNodeData(dir);
      expect(found).toBeTruthy();
      expect(extractExpectedStyleLiterals(found).color).toContain('#ff0000');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没有任何节点树候选时返回 null（styleScore 保持 null 不伪造）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-nofigma-'));
    try {
      expect(findFigmaNodeData(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('detectComponentType', () => {
  it('有 declare.json 判为 microcode', () => {
    expect(detectComponentType('/x', [{ path: 'declare.json', content: '{}' }])).toBe('microcode');
  });

  it('无 declare.json（含 common.less）判为 vue3（回归 2026-09-19：vue3 也带 common.less）', () => {
    expect(
      detectComponentType('/x', [
        { path: 'common.less', content: '.a{}' },
        { path: 'package/index.vue', content: '<template/>' },
      ]),
    ).toBe('vue3');
  });
});

describe('scoreComponentDir (vue3 分流)', () => {
  it('Vue3 剔除 CODE-008 假阳性（手写图片 import 在 vue3 合法）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-vue3-'));
    try {
      mkdirSync(join(dir, '.mc-gen', 'cache'), { recursive: true });
      writeFileSync(
        join(dir, '.mc-gen', 'cache', 'figma-node-data.json'),
        JSON.stringify({ fileKey: 'fk', nodeId: '1:2', document: { id: '1:2', type: 'FRAME' } }),
      );
      // 模拟 vue3 产物：无 declare.json，有 common.less + 手写图片 import 的 index.vue
      writeFileSync(join(dir, 'common.less'), '.c-x-root{}');
      mkdirSync(join(dir, 'package'), { recursive: true });
      writeFileSync(
        join(dir, 'package', 'index.vue'),
        '<template><div class="c-x-root"><img/></div></template>\n<script setup>\nimport bg from "../resources/images/bg.png"\n</script>',
      );
      const r = await scoreComponentDir(dir, { persist: false, componentId: 'mv-vue3-fixture' });
      expect(r.quality.spec.issues.every((i: any) => i.id !== 'CODE-008')).toBe(true);
      expect(typeof r.quality.specScore).toBe('number');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scoreResourceMount', () => {
  // 🔴 回归锁（2026-11-02，实证 mc-max-1793629839483-bf86ddba）：此前用 entry.figmaNodeId
  // （资源图自身 id）当 data-section-id 匹配目标 ⇒ 三卡背景图全挂对仍恒判 0/3；
  // shared alias（三卡共用一图）的自身 section 被归并后需回退主资源条目判定。
  const mapping = [
    {
      figmaNodeId: '48:5909', name: 'bg', bgRole: 'container', downloadStatus: 'success',
      targetDomSelector: '[data-section-id="43:4893"]', ownerSectionId: '43:4893',
    },
    {
      figmaNodeId: '187:265', name: 'bg', bgRole: 'container', downloadStatus: 'success',
      targetDomSelector: '[data-section-id="43:4898"]', ownerSectionId: '43:4898',
      deduplicatedFrom: '48:5909', isSharedAlias: true,
    },
    {
      figmaNodeId: '187:266', name: 'bg', bgRole: 'container', downloadStatus: 'success',
      targetDomSelector: '[data-section-id="43:4903"]', ownerSectionId: '43:4903',
      deduplicatedFrom: '48:5909', isSharedAlias: true,
    },
  ];

  it('挂载目标取 targetDomSelector；shared alias 回退主资源 owner（statrow 归并后仍 3/3）', () => {
    const r = scoreResourceMount(mapping, new Set(['43:4893']));
    expect(r.scored).toBe(true);
    expect(r.expected).toBe(3);
    expect(r.matched).toBe(3);
    expect(r.score).toBe(100);
  });

  it('真未挂载仍判 missed，reason 列出尝试过的候选 id', () => {
    const r = scoreResourceMount(mapping, new Set(['43:9999']));
    expect(r.matched).toBe(0);
    expect(r.score).toBe(0);
    expect(r.missed[0].reason).toContain('43:4893');
  });

  it('无 target/owner 的旧 mapping 归入 unanchored，维度不参与评分（P2 改后行为）', () => {
    // 🔴 2026-11-03 修正：此用例原断言「退回 figmaNodeId 兜底 → matched=1」的旧行为，
    //   但 P2 已按全量实测（759 条 / 107 目录，命中 0 次）**移除**该兜底并文档化理由：
    //   资源自身 id 从不出现在产物 data-section-id 上，保留只会把「不可判定」伪装成「未挂载」。
    //   旧断言与现行实现直接矛盾（该红系 63a285d daily auto-sync 扫入 P2 改动时漏改 spec 所致），
    //   故按现行意图重写：无锚条目落 unanchored、expected=0 ⇒ scored:false（不进等权平均，不假 0）。
    const legacy = [
      { figmaNodeId: '9:9', name: 'bg', bgRole: 'container', downloadStatus: 'success' },
    ];
    const r = scoreResourceMount(legacy, new Set(['9:9']));
    expect(r.scored).toBe(false);
    expect(r.score).toBeNull();
    expect(r.expected).toBe(0);
    expect(r.matched).toBe(0);
    expect(r.unanchored).toHaveLength(1);
    expect(r.unanchored[0].figmaNodeId).toBe('9:9');
    expect(r.reason).toBe('no-anchored-mount');
  });

  it('ownerSectionId 兜底：selector 缺失时仍可用 owner 判定', () => {
    const m = [
      {
        figmaNodeId: '5:5', name: 'bg', bgRole: 'container', downloadStatus: 'success',
        ownerSectionId: '7:7',
      },
    ];
    expect(scoreResourceMount(m, new Set(['7:7'])).matched).toBe(1);
  });
});

describe('mergeQualityIntoMeta', () => {
  it('merge 不覆盖既有 degraded 等字段', () => {
    const next = mergeQualityIntoMeta(
      { quality: { degraded: true, layoutSource: 'vision' } },
      { version: 'v1', specScore: 79, styleScore: null },
    );
    expect(next.quality.degraded).toBe(true);
    expect(next.quality.layoutSource).toBe('vision');
    expect(next.quality.specScore).toBe(79);
    expect(next.quality.styleScore).toBeNull();
  });
});

describe('scoreComponentDir', () => {
  it('无 Figma 树时 styleScore=null，且 persist:false 不写盘', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-v1-'));
    try {
      writeFileSync(join(dir, 'declare.json'), JSON.stringify({ componentId: 'c-qs-fixture' }));
      writeFileSync(join(dir, 'index.vue'), '<template><div class="c-qs-fixture">x</div></template>');
      const r = await scoreComponentDir(dir, { persist: false, componentId: 'c-qs-fixture' });
      expect(r.quality).toBeTruthy();
      expect(r.quality.version).toBe('v1');
      expect(typeof r.quality.specScore).toBe('number');
      expect(r.quality.styleScore).toBeNull();
      expect(r.quality.style.reason).toBe('no-expected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * 结构三元组判据回归（2026-11-03 a+b）
 *
 * 事故 mc-max-1793679145822-fae4130a：structure=70 里 layout/depth 两项是假扣分——
 * ① expected 含不可满足字面量 'none'（产物侧永不产出）⇒ layout 恒被稀释；
 * ② `<img />` 只 +1 不 -1 ⇒ depth 永久偏移（5 被判、真值 4）。
 */
describe('extractExpectedStructure · 不可满足字面量不得进分母', () => {
  const rect = (id: string) => ({ id, name: id, type: 'RECTANGLE' });

  it("多子节点但无 layoutMode 时不再产出 'none'（产物侧永不可能命中）", () => {
    const figma = {
      document: { id: '1', name: 'root', type: 'FRAME', children: [rect('2'), rect('3')] },
    };
    const s = extractExpectedStructure(figma);
    expect(s.layouts).not.toContain('none');
    expect(s.layouts).toEqual([]);
  });

  it('阴性对照：HORIZONTAL / GRID 仍正常采集', () => {
    const figma = {
      document: {
        id: '1',
        name: 'root',
        type: 'FRAME',
        layoutMode: 'HORIZONTAL',
        children: [
          { id: '2', name: 'g', type: 'FRAME', layoutMode: 'GRID', children: [rect('3'), rect('4')] },
          rect('5'),
        ],
      },
    };
    const s = extractExpectedStructure(figma);
    expect(s.layouts).toEqual(expect.arrayContaining(['flex', 'grid']));
    expect(s.layouts).not.toContain('none');
  });
});

describe('extractActualStructure · 标签配平（自闭合 / void / 注释）', () => {
  const vue = (tpl: string) => [{ path: 'index.vue', content: `<template>${tpl}</template>` }];

  it('自闭合标签不抬高 maxDepth（与同层普通元素等价）', () => {
    const withImg = extractActualStructure(vue('<div><div><img :src="x" /></div></div>'));
    const withSpan = extractActualStructure(vue('<div><div><span>x</span></div></div>'));
    expect(withImg.maxDepth).toBe(withSpan.maxDepth);
    expect(withImg.maxDepth).toBe(3);
  });

  it('自闭合叶子仍计入 nodeCount（不能被删干净）', () => {
    const r = extractActualStructure(vue('<div><img :src="x" /></div>'));
    expect(r.nodeCount).toBe(2);
    expect(r.maxDepth).toBe(2);
  });

  it('无斜杠 void 元素同样处理（<img src="x"> / <br>）', () => {
    const r = extractActualStructure(vue('<div><img src="x"><br></div>'));
    expect(r.maxDepth).toBe(2);
    expect(r.nodeCount).toBe(3);
  });

  it('回归锁：<base-panel> 不得被当作 <base> void 元素剥掉', () => {
    // 首版用 \b 边界 ⇒ `base|` 处成立 ⇒ 根容器整体消失、nodeCount 断崖下跌
    const r = extractActualStructure(vue('<base-panel panelKey="p"><div>x</div></base-panel>'));
    expect(r.maxDepth).toBe(2);
    expect(r.nodeCount).toBe(2);
  });

  it('注释里的标签不参与计数', () => {
    const r = extractActualStructure(vue('<div><!-- <span></span><span></span> --><span>y</span></div>'));
    expect(r.maxDepth).toBe(2);
    expect(r.nodeCount).toBe(2);
  });

  it('阴性对照：无自闭合标签的普通嵌套深度不变', () => {
    const r = extractActualStructure(vue('<div><div><div><span>a</span></div></div></div>'));
    expect(r.maxDepth).toBe(4);
    expect(r.nodeCount).toBe(4);
  });
});

/**
 * 节点构成统计（2026-11-03）：Figma 全树按 type 归类，仅供「缺什么 DOM」明细展示。
 * 口径与产物计分无关（nodes 已退出分母），但分类计数必须与 nodeBreakdown 同源。
 */
describe('extractExpectedStructure · 节点构成统计', () => {
  it('容器 / 装饰 / 文本按 type 归类，与 nodeBreakdown 同口径', () => {
    const figma = {
      document: {
        id: '1',
        name: 'root',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        children: [
          {
            id: '2',
            name: 'g',
            type: 'GROUP',
            children: [
              { id: '3', name: 'v', type: 'VECTOR' },
              { id: '4', name: 'e', type: 'ELLIPSE' },
            ],
          },
          { id: '5', name: 't', type: 'TEXT', characters: 'hi' },
          { id: '6', name: 'i', type: 'IMAGE' },
        ],
      },
    };
    const s = extractExpectedStructure(figma);
    expect(s.nodeCount).toBe(6);
    expect(s.containerCount).toBe(2); // FRAME + GROUP
    expect(s.layoutContainerCount).toBe(1); // 仅 root 带 layoutMode
    expect(s.decorNodeCount).toBe(2); // VECTOR + ELLIPSE（IMAGE 不算装饰）
    expect(s.textNodeCount).toBe(1);
    expect(s.nodeBreakdown).toMatchObject({
      FRAME: 1,
      GROUP: 1,
      VECTOR: 1,
      ELLIPSE: 1,
      TEXT: 1,
      IMAGE: 1,
    });
  });

  it('阴性对照：无节点树时构成字段齐备且为 0（调用方解构不炸）', () => {
    const s = extractExpectedStructure(null);
    expect(s.containerCount).toBe(0);
    expect(s.layoutContainerCount).toBe(0);
    expect(s.decorNodeCount).toBe(0);
    expect(s.textNodeCount).toBe(0);
    expect(s.nodeBreakdown).toEqual({});
  });
});

/**
 * structure 维度明细（2026-11-03）：顶层补 expected/matched/missed，前端通用明细渲染零改动复用；
 * 并锁定「nodes 退出分母」——Figma 全节点口径与产物 DOM 口径不同源，不再作为恒定惩罚项。
 */
describe('computeStyleScore · structure 明细 + nodes 退出分母', () => {
  const expStruct = {
    layouts: ['flex', 'grid'],
    alignments: ['align-items:center', 'justify-content:center'],
    maxDepth: 5,
    nodeCount: 100,
    containerCount: 30,
    layoutContainerCount: 8,
    textNodeCount: 20,
    decorNodeCount: 45,
    nodeBreakdown: { FRAME: 30, VECTOR: 45, TEXT: 20 },
  };

  it('layout/alignment 缺项落进顶层 missed（零噪声可列），并给出 expected/matched', () => {
    const actual = {
      structure: { layouts: ['flex'], alignments: ['align-items:center'], maxDepth: 5, nodeCount: 10 },
    };
    const st = computeStyleScore({ structure: expStruct }, actual).dimensions.structure;
    expect(st.scored).toBe(true);
    expect(st.expected).toBe(3); // layout + alignment + depth
    expect(st.matched).toBe(1); // 仅 depth 满分
    expect(st.details.layout.missed).toEqual(['grid']);
    expect(st.details.alignment.missed).toEqual(['justify-content:center']);
    expect(st.missed.map((m: any) => m.kind)).toEqual(['layout', 'alignment']);
    expect(st.missed[0].value).toBe('display:grid');
  });

  it('nodes 不进分母：Figma 100 节点 / 产物 10 节点也不拉低分（旧口径会扣到 10）', () => {
    const actual = {
      structure: { layouts: ['flex'], alignments: ['align-items:center'], maxDepth: 5, nodeCount: 10 },
    };
    const st = computeStyleScore({ structure: expStruct }, actual).dimensions.structure;
    // 50(layout) + 50(alignment) + 100(depth) = 200/3 ≈ 67；若 nodes 计分则 175/4 ≈ 44
    expect(st.score).toBe(67);
    expect(st.details.nodes.scored).toBe(false);
    expect(st.details.nodes.expected).toBe(100);
    expect(st.details.nodes.actual).toBe(10);
    expect(st.details.nodes.figma.containerCount).toBe(30);
    expect(st.details.nodes.figma.byType.VECTOR).toBe(45);
  });

  it('depth 差几层如实呈现（diff + unit=层），并进 missed', () => {
    const actual = {
      structure: {
        layouts: ['flex', 'grid'],
        alignments: ['align-items:center', 'justify-content:center'],
        maxDepth: 9,
        nodeCount: 99,
      },
    };
    const st = computeStyleScore({ structure: expStruct }, actual).dimensions.structure;
    expect(st.details.depth.diff).toBe(4);
    const d = st.missed.find((m: any) => m.kind === 'depth');
    expect(d.diff).toBe(4);
    expect(d.unit).toBe('层');
    expect(d.value).toContain('期望 5 层 / 实际 9 层');
  });

  it('全匹配 = 100，且 missed 空、matched === expected', () => {
    const actual = {
      structure: {
        layouts: ['flex', 'grid'],
        alignments: ['align-items:center', 'justify-content:center'],
        maxDepth: 5,
        nodeCount: 3,
      },
    };
    const st = computeStyleScore({ structure: expStruct }, actual).dimensions.structure;
    expect(st.score).toBe(100);
    expect(st.missed).toEqual([]);
    expect(st.matched).toBe(st.expected);
  });

  it('阴性对照：无结构期望时 structure 维度不出现（不伪造 0 分维度）', () => {
    const r = computeStyleScore({ structure: null }, { structure: null });
    expect(r.dimensions.structure?.scored).toBeFalsy();
    expect(r.score).toBeNull();
  });
});
