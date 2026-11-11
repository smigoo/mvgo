/**
 * 🛡️ 主题 / 色板一致性归一判据（2026-11-11）
 *
 * 真机病灶：mv-lite-1794403659262-b1813771 —— 浅色设计稿被 vision 判成 dark，
 * `sampleRootBrightness` 只把 theme 纠正成 light，colors 仍是整套深色色板 ⇒ 产物整页深色。
 *
 * 本 spec 的「有牙」判据：
 *  - 阳性：真机矛盾 brief 必须被归一为浅色板、保留 primary、剔除矛盾整体描述且不误删局部描述；
 *  - 阴性：浅色稿 / 真深色稿 / 灰色地带 / theme 缺失 / colors 非法 一律零改动（含同一对象引用）；
 *  - 单源：阈值 0.45/0.55 与感知亮度权重必须与 lite.service.ts#sampleRootBrightness 同源；
 *  - 接线：归一必须在 sourceType !== 'figma' 保护内调用，两个 prompt 都补了冲突裁决句。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  reconcileBriefTheme,
  perceivedLuminance,
  THEME_BASELINE,
  THEME_LUM_DARK_MAX,
  THEME_LUM_LIGHT_MIN,
  PERCEIVED_LUM_WEIGHTS,
} from './utils/lite-theme-reconcile';

const svcSrc = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8');
const moduleSrc = readFileSync(join(__dirname, 'utils/lite-theme-reconcile.ts'), 'utf-8');

/** 真机 mv-lite-1794403659262-b1813771 的 checkpoint brief（只取与配色相关字段） */
const DARK_MISJUDGED_BRIEF = {
  theme: 'light',
  _themeSource: 'pixel',
  colors: {
    primary: '#2D8CF0',
    background: '#0B1221',
    surface: '#152233',
    text: '#A9B7C6',
    border: '#1E2D42',
  },
  visualDetails: [
    '整体背景为深蓝色渐变，内容区域为深蓝色调',
    '卡片和图表区域采用深色半透明背景，带有轻微的内阴影和边框',
    '标题左侧带有蓝色的菱形图标',
    '图表内部网格线为淡灰色虚线',
    '图表的数据点带有半透明光晕效果',
    '环形图由蓝色和橙色组成，中间有白色底色的图标和数字',
    '折线图下方的面积区域填充了半透明的蓝色和青色渐变',
    '柱状图的柱子为蓝色和青色，带有高亮和圆角',
    '悬浮提示框为白色背景，带有轻微的阴影和圆角',
  ],
};

describe('reconcileBriefTheme — 阳性：真机自相矛盾 brief', () => {
  it('theme=light + 深色色板必须确定性归一为浅色板', () => {
    const r = reconcileBriefTheme(DARK_MISJUDGED_BRIEF, 'light');
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('reconciled');
    expect(r.brief.colors).toMatchObject(THEME_BASELINE.light);
    expect(r.brief.colors.primary).toBe('#2D8CF0'); // 强调色不被基线覆盖
    expect(r.brief._themePaletteSource).toBe('pixel-reconciled');
    expect(r.conflicts).toHaveLength(4);
    expect(r.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'background', from: '#0B1221', to: '#F5F8FC' }),
        expect.objectContaining({ field: 'text', from: '#A9B7C6', to: '#1F2329' }),
      ]),
    );
  });

  it('保留模型给的 primary 强调色与 colors 其它键', () => {
    const brief = {
      ...DARK_MISJUDGED_BRIEF,
      colors: { ...DARK_MISJUDGED_BRIEF.colors, accent: '#FF7D00' },
    };
    const r = reconcileBriefTheme(brief, 'light');
    expect(r.brief.colors.primary).toBe('#2D8CF0');
    expect(r.brief.colors.accent).toBe('#FF7D00');
  });

  it('只剔除「整体背景级 + 深色词」描述，不误删局部白色提示框', () => {
    const r = reconcileBriefTheme(DARK_MISJUDGED_BRIEF, 'light');
    expect(r.brief.visualDetails).toHaveLength(7);
    expect(r.brief.visualDetails.join('|')).not.toContain('整体背景为深蓝色渐变');
    expect(r.brief.visualDetails.join('|')).not.toContain('卡片和图表区域采用深色半透明背景');
    expect(r.brief.visualDetails).toContain('悬浮提示框为白色背景，带有轻微的阴影和圆角');
    expect(r.brief.visualDetails).toContain('标题左侧带有蓝色的菱形图标');
  });

  it('不 mutate 入参（产物 checkpoint 零改写）', () => {
    const brief = JSON.parse(JSON.stringify(DARK_MISJUDGED_BRIEF));
    const before = JSON.stringify(brief);
    reconcileBriefTheme(brief, 'light');
    expect(JSON.stringify(brief)).toBe(before);
    expect(brief.colors.background).toBe('#0B1221');
    expect(brief.visualDetails).toHaveLength(9);
  });

  it('幂等：归一结果再跑一次不再触发', () => {
    const once = reconcileBriefTheme(DARK_MISJUDGED_BRIEF, 'light');
    const twice = reconcileBriefTheme(once.brief, 'light');
    expect(twice.applied).toBe(false);
    expect(twice.reason).toBe('no-conflict');
    expect(twice.brief).toBe(once.brief);
  });

  it('反向阳性：用户显式 dark + vision 给浅色板时归一为深色板', () => {
    const brief = {
      theme: 'dark',
      colors: { primary: '#2D8CF0', background: '#F5F8FC', surface: '#FFFFFF', text: '#1F2329', border: '#E5E6EB' },
      visualDetails: ['整体背景为浅色渐变，内容区域为白色', '悬浮提示框为白色背景'],
    };
    const r = reconcileBriefTheme(brief, 'dark');
    expect(r.applied).toBe(true);
    expect(r.brief.colors).toMatchObject(THEME_BASELINE.dark);
    expect(r.brief.colors.primary).toBe('#2D8CF0');
    expect(r.brief.visualDetails.join('|')).not.toContain('整体背景为浅色渐变');
    expect(r.brief.visualDetails).toContain('悬浮提示框为白色背景');
  });
});

describe('reconcileBriefTheme — 阴性对照（正常稿必须零改动）', () => {
  const cases: Array<[string, any, string]> = [
    ['浅色稿 mv-lite-…4b4ad172', { theme: 'light', colors: { primary: '#3B82F6', background: '#F0F4F8', surface: '#FFFFFF', text: '#1F2329', border: '' } }, 'light'],
    ['浅色稿 mc-lite-…75f424e6', { theme: 'light', colors: { primary: '#1E90FF', background: '#F5F6F8', surface: '#FFFFFF', text: '#1F2329', border: '#E5E6EB' } }, 'light'],
    ['真深色稿', { theme: 'dark', colors: { primary: '#2D8CF0', background: '#0B1221', surface: '#152233', text: '#A9B7C6', border: '#1E2D42' } }, 'dark'],
    ['灰色地带 #7F7F7F', { theme: 'light', colors: { background: '#7F7F7F' } }, 'light'],
  ];

  for (const [name, brief, theme] of cases) {
    it(`${name} → applied=false 且返回同一对象引用`, () => {
      const before = JSON.stringify(brief);
      const r = reconcileBriefTheme(brief, theme);
      expect(r.applied).toBe(false);
      expect(r.brief).toBe(brief);
      expect(JSON.stringify(r.brief)).toBe(before);
    });
  }

  it('theme 缺失 / 非法 → not-applicable', () => {
    for (const theme of [undefined, null, 'mixed', '', 0]) {
      const r = reconcileBriefTheme(DARK_MISJUDGED_BRIEF, theme);
      expect(r.applied).toBe(false);
      expect(r.reason).toBe('not-applicable');
      expect(r.brief).toBe(DARK_MISJUDGED_BRIEF);
    }
  });

  it('colors 缺失 / background 非法 → not-applicable', () => {
    expect(reconcileBriefTheme({ theme: 'light' }, 'light').reason).toBe('not-applicable');
    expect(reconcileBriefTheme({ theme: 'light', colors: { background: 'rgba(0,0,0,.3)' } }, 'light').reason).toBe('not-applicable');
    expect(reconcileBriefTheme({ theme: 'light', colors: { background: '' } }, 'light').reason).toBe('not-applicable');
    expect(reconcileBriefTheme(null, 'light').reason).toBe('not-applicable');
  });

  it('vision 附注的 hex 也能解析（只取首个合法 hex）', () => {
    expect(perceivedLuminance('#F0F4F8 (半透明叠加后)')).toBeCloseTo(perceivedLuminance('#F0F4F8')!, 6);
    expect(perceivedLuminance('#fff')).toBe(1);
    expect(perceivedLuminance('#000')).toBe(0);
    expect(perceivedLuminance('not-a-color')).toBeNull();
  });
});

describe('单一来源与接线判据', () => {
  it('明暗阈值与 sampleRootBrightness 同源（0.45 / 0.55）', () => {
    expect(THEME_LUM_DARK_MAX).toBe(0.45);
    expect(THEME_LUM_LIGHT_MIN).toBe(0.55);
    expect(svcSrc).toMatch(/median\s*<\s*0\.45/);
    expect(svcSrc).toMatch(/median\s*>\s*0\.55/);
    const darkMax = Number(svcSrc.match(/median\s*<\s*([\d.]+)/)?.[1]);
    const lightMin = Number(svcSrc.match(/median\s*>\s*([\d.]+)/)?.[1]);
    expect(darkMax).toBe(THEME_LUM_DARK_MAX);
    expect(lightMin).toBe(THEME_LUM_LIGHT_MIN);
  });

  it('感知亮度权重与 sampleRootBrightness 同一公式', () => {
    expect(PERCEIVED_LUM_WEIGHTS).toEqual({ r: 0.299, g: 0.587, b: 0.114 });
    expect(svcSrc).toMatch(/0\.299\s*\*\s*data\[p\]\s*\+\s*0\.587\s*\*\s*data\[p\s*\+\s*1\]\s*\+\s*0\.114\s*\*\s*data\[p\s*\+\s*2\]/);
    // 模块内不得另立一份权重公式
    expect((moduleSrc.match(/0\.299/g) || []).length).toBe(1);
  });

  it('基线色板与 prompt 主题锚点示例同源', () => {
    expect(svcSrc).toContain('#F5F8FC');
    expect(svcSrc).toContain('#1F2329');
    expect(svcSrc).toContain('#1a1a2e');
    expect(THEME_BASELINE.light.background).toBe('#F5F8FC');
    expect(THEME_BASELINE.light.text).toBe('#1F2329');
    expect(THEME_BASELINE.dark.background).toBe('#1A1A2E');
  });

  it('归一只在非 figma 源调用，且位于 user-selected 覆盖之后', () => {
    expect(svcSrc).toContain("import { reconcileBriefTheme } from './utils/lite-theme-reconcile';");
    expect(svcSrc).toContain('if (sourceType !== \'figma\') {\n          const reconciled = reconcileBriefTheme(brief, brief?.theme);');
    const userSelectedAt = svcSrc.indexOf("brief._themeSource = 'user-selected'");
    const callAt = svcSrc.indexOf('const reconciled = reconcileBriefTheme');
    const figmaEdgeAt = svcSrc.indexOf("if (sourceType === 'figma') {");
    expect(userSelectedAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(userSelectedAt);
    expect(figmaEdgeAt).toBeGreaterThan(callAt);
  });

  it('两个 codegen prompt 都补了冲突裁决句（补丁层自防，标注了根治项）', () => {
    const sentence = '禁止使用与之矛盾的 background / surface / text / border 色值';
    expect(svcSrc.split(sentence).length - 1).toBe(2);
    expect(svcSrc.split('补丁层自防').length - 1).toBeGreaterThanOrEqual(3); // 2 条 prompt + 装配点注释
  });
});
