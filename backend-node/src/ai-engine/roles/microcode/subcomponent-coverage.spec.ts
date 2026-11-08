/**
 * 子组件覆盖度判据 spec（2026-11-08 · mc-max-1794076626809-402679ed 实锤）
 *
 * 阳性：强制拆分 5 个、只生成 3 个 → missing=2，必须被判出来。
 * 阴性：非强制 / 数量达标 / 只有 index 与样式文件 —— 不得误报。
 * 边界：files 传数组、传 null、路径大小写与子目录。
 */
import {
  assessSubComponentCoverage,
  formatSubComponentCoverage,
  SUBCOMPONENT_DIR_PREFIX,
} from './subcomponent-coverage.js';

const forcedPlan = (minFiles: number, internalCount = 3) => ({
  isForced: true,
  minFiles,
  internalSubcomponents: Array.from({ length: internalCount }, (_, i) => ({
    id: `s-group${i + 1}`,
  })),
});

const filesOf = (names: string[]) =>
  Object.fromEntries(names.map((n) => [`package/components/${n}.vue`, '<template/>']));

describe('assessSubComponentCoverage：强制拆分文件数', () => {
  it('阳性：expected=5 只生成 3 个 → missing=2、ok=false', () => {
    const r = assessSubComponentCoverage({
      subPlan: forcedPlan(5),
      files: {
        'package/index.vue': '<template/>',
        ...filesOf(['StatsSection', 'MainSection', 'SideNav']),
        'resources/styles/index.less': '.a{}',
      },
    });
    expect(r.expected).toBe(5);
    expect(r.generated).toBe(3);
    expect(r.missing).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.internalExpected).toBe(3);
    expect(r.generatedFiles).toEqual([
      'package/components/MainSection.vue',
      'package/components/SideNav.vue',
      'package/components/StatsSection.vue',
    ]);
  });

  it('阴性：数量达标 → missing=0、ok=true', () => {
    const r = assessSubComponentCoverage({
      subPlan: forcedPlan(5),
      files: filesOf(['A', 'B', 'C', 'D', 'E']),
    });
    expect(r.generated).toBe(5);
    expect(r.missing).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('阴性：非强制（isForced=false）→ expected=0，不因 minFiles 残留而误报', () => {
    const r = assessSubComponentCoverage({
      subPlan: { isForced: false, minFiles: 5, internalSubcomponents: [] },
      files: filesOf(['Only']),
    });
    expect(r.expected).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('边界：只有 index/declare/less 时 generated=0', () => {
    const r = assessSubComponentCoverage({
      subPlan: forcedPlan(3),
      files: {
        'package/index.vue': 'x',
        'declare.json': '{}',
        'resources/styles/common.less': '.x{}',
      },
    });
    expect(r.generated).toBe(0);
    expect(r.missing).toBe(3);
  });

  it('边界：二级目录 package/components/xx/yy.vue 不计入一级槽位', () => {
    const r = assessSubComponentCoverage({
      subPlan: forcedPlan(2),
      files: {
        ...filesOf(['Top']),
        'package/components/nested/Inner.vue': 'x',
      },
    });
    expect(r.generated).toBe(1);
    expect(r.missing).toBe(1);
  });

  it('边界：files 传路径数组也可用', () => {
    const r = assessSubComponentCoverage({
      subPlan: forcedPlan(2),
      files: ['package/components/A.vue', 'package/components/B.vue', 'package/index.vue'],
    });
    expect(r.generated).toBe(2);
    expect(r.missing).toBe(0);
  });

  it('边界：subPlan / files 缺失不抛错，按 0 处理', () => {
    expect(() => assessSubComponentCoverage()).not.toThrow();
    const r = assessSubComponentCoverage({});
    expect(r.expected).toBe(0);
    expect(r.generated).toBe(0);
    expect(r.ok).toBe(true);
  });
});

describe('formatSubComponentCoverage：计数行', () => {
  it('0 也打：非强制且零生成时 message 仍完整', () => {
    const { message, meta } = formatSubComponentCoverage(
      assessSubComponentCoverage({ subPlan: { isForced: false }, files: {} }),
    );
    expect(message).toContain('🧩 子组件覆盖度');
    expect(message).toContain('expected=0');
    expect(message).toContain('missing=0');
    expect(meta.ok).toBe(true);
  });

  it('缺失时计数行含真实数字', () => {
    const { message } = formatSubComponentCoverage(
      assessSubComponentCoverage({
        subPlan: forcedPlan(5),
        files: filesOf(['A', 'B', 'C']),
      }),
    );
    expect(message).toBe(
      '🧩 子组件覆盖度: expected=5 generated=3 missing=2 internalExpected=3 forced=1',
    );
  });

  it('前缀常量与路径判据一致', () => {
    expect(SUBCOMPONENT_DIR_PREFIX).toBe('package/components/');
  });
});

describe('assessSubComponentCoverage：三合一扩展（2026-11-08 评审修订版）', () => {
  const contentPlan = () => ({
    isForced: true,
    minFiles: 5,
    internalSubcomponents: [
      { id: '2:8438', responsibility: '设备卡片第一组', textTruths: ['摄像机', '风速风向仪'] },
      { id: '2:8450', responsibility: '设备卡片第二组', elementNames: ['超高检测器', '烟道机器人'] },
      { id: '2:8460', responsibility: '图表组' }, // 空锚点：纯图形组
    ],
  });

  it('阳性：锚点未落任何独立 .vue → 逐组点名缺失', () => {
    const r = assessSubComponentCoverage({
      subPlan: contentPlan(),
      files: {
        'package/index.vue': '<template/>',
        ...filesOf(['StatsSection', 'MainSection']),
      },
    });
    expect(r.missing).toBe(3);
    expect(r.missingSubcomponents.map((s) => s.subId)).toEqual(['2:8438', '2:8450']);
    expect(r.missingSubcomponents[0].missingAnchors).toEqual(['摄像机', '风速风向仪']);
    expect(r.unanchoredGroups).toBe(1);
    expect(r.ok).toBe(false);
  });

  it('阴性：锚点落在不同独立 .vue → 不报缺失', () => {
    const r = assessSubComponentCoverage({
      subPlan: contentPlan(),
      files: {
        'package/index.vue': '<template/>',
        'package/components/CardsA.vue': '<template>摄像机 风速风向仪</template>',
        'package/components/CardsB.vue': '<template>超高检测器 烟道机器人</template>',
        'package/components/Stats.vue': '<template/>',
        'package/components/Main.vue': '<template/>',
        'package/components/Extra.vue': '<template/>',
      },
    });
    expect(r.missingSubcomponents).toEqual([]);
    expect(r.anchoredGroups).toBe(2);
    expect(r.ok).toBe(true);
  });

  it('同宿：两组锚点全落在同一文件 → not-split', () => {
    const r = assessSubComponentCoverage({
      subPlan: contentPlan(),
      files: {
        'package/index.vue': '<template/>',
        'package/components/Main.vue':
          '<template>摄像机 风速风向仪 超高检测器 烟道机器人</template>',
        ...filesOf(['A', 'B', 'C', 'D']),
      },
    });
    expect(r.missing).toBe(0); // 数量达标，但逐组未拆
    expect(r.missingSubcomponents.map((s) => s.reason)).toEqual(['not-split', 'not-split']);
    expect(r.ok).toBe(false);
  });

  it('引用完整性：文件存在但无人 import → orphanFiles', () => {
    const r = assessSubComponentCoverage({
      subPlan: { isForced: false, minFiles: 0, internalSubcomponents: [] },
      files: {
        'package/index.vue':
          "<template><A/></template><script setup>import A from './components/A.vue'</script>",
        'package/components/A.vue': '<template/>',
        'package/components/Orphan.vue': '<template/>',
      },
    });
    expect(r.orphanCheck).toBe('evaluated');
    expect(r.orphanFiles).toEqual(['package/components/Orphan.vue']);
  });

  it('引用完整性：无 index.vue（部分写盘）→ skipped:partial 且不误报', () => {
    const r = assessSubComponentCoverage({
      subPlan: { isForced: false, minFiles: 0, internalSubcomponents: [] },
      files: filesOf(['A', 'B']),
    });
    expect(r.orphanCheck).toBe('skipped:partial');
    expect(r.orphanFiles).toEqual([]);
  });

  it('就绪门：subPlan 为 null → skippedReason=no-plan，计数行可区分', () => {
    const r = assessSubComponentCoverage({ subPlan: null, files: {} });
    expect(r.skippedReason).toBe('no-plan');
    const { message, meta } = formatSubComponentCoverage(r);
    expect(message).toContain('skipped=no-plan');
    expect(meta.skippedReason).toBe('no-plan');
  });
});
