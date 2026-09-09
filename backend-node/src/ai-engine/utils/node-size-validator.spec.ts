import { autoFixNodeSizes, validateNodeSizes } from './node-size-validator.js';

/**
 * NODE-001 确定性自愈回归（#A，2026-09-01 事故 mc-max-1788248984779-862c6b29）。
 *
 * 事故：`.c-env-monitor-tabs-list { height: 32px }`，Figma 真值 27px（figmaBox），
 * 偏差 5px > ±2px → NODE-001 BLOCK。validateNodeSizes 只判不修 → LLM 重试确定性复现
 * 32px → 重试白烧。
 *
 * 治本：autoFixNodeSizes 复用 findMatchingClass/extractCssDimensions/buildNodeSizeMap
 * 与校验零口径漂移，把偏差超容差的 width/height 锚定回 figmaBox 真值。
 */
const bgMapping = [
  {
    name: 'bg',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    semanticVarName: 'bg1',
    resourceFile: '../resources/images/bg-7890.png',
    hint: 'bg → bg区域',
    mountTarget: 'tabs-list',
    figmaBox: { width: 295, height: 27 },
  },
];

describe('autoFixNodeSizes NODE-001 确定性自愈（#A）', () => {
  it('事故复现：height 32px 偏差超容差 → 锚定到 27px', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: `.c-env-monitor-tabs-list {
  display: flex;
  height: 32px;
  background-size: 100% 100%;
}`,
      },
    ];
    const { files: fixed, fixed: count } = autoFixNodeSizes(files, bgMapping);
    expect(count).toBe(1);
    expect(fixed[0].content).toContain('height: 27px;');
    expect(fixed[0].content).not.toContain('height: 32px');
  });

  it('锚定后 validateNodeSizes 不再报 NODE-001（闭环）', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: `.c-env-monitor-tabs-list { height: 32px; }`,
      },
    ];
    const before = validateNodeSizes(files, bgMapping);
    expect(before.filter((i) => i.id === 'NODE-001').length).toBeGreaterThan(0);

    const { files: fixedFiles } = autoFixNodeSizes(files, bgMapping);
    const after = validateNodeSizes(fixedFiles, bgMapping);
    expect(after.filter((i) => i.id === 'NODE-001').length).toBe(0);
  });

  it('负面对照：尺寸在容差内 → 不动（避免无谓抖动）', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: `.c-env-monitor-tabs-list { height: 28px; }`,
      },
    ];
    const { files: fixed, fixed: count } = autoFixNodeSizes(files, bgMapping);
    expect(count).toBe(0);
    expect(fixed[0].content).toContain('height: 28px');
  });

  it('负面对照：无 figmaBox 的资源 → 不检测不锚定', () => {
    const mapping = [{ ...bgMapping[0], figmaBox: undefined }];
    const files = [
      {
        path: 'resources/styles/common.less',
        content: `.c-env-monitor-tabs-list { height: 32px; }`,
      },
    ];
    const { fixed } = autoFixNodeSizes(files, mapping);
    expect(fixed).toBe(0);
  });

  it('负面对照：mountTarget 未匹配到 class → 不锚定（不误改）', () => {
    const files = [
      {
        path: 'resources/styles/common.less',
        content: `.c-other-box { height: 32px; }`,
      },
    ];
    const { files: fixed, fixed: count } = autoFixNodeSizes(files, bgMapping);
    expect(count).toBe(0);
    expect(fixed[0].content).toContain('height: 32px');
  });
});
