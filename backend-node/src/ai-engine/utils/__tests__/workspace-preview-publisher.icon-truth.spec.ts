/**
 * 🛡️ P0-3（2026-11-15 · mc-max-1794717024986-bb0c260b 实锤）：
 * 发布前「图标真假终态断言」spec（走 dist，与真机同一份代码）。
 *
 * 病灶：图标真值守恒器只在 `microcode/file-writer.js` 写盘出口单点运行，之后
 * `microcode-engineer.js` 仍有 7 处直写 `writeFileSync` 覆盖它的结果（真机实证：
 * 磁盘产物假图标仍在，mtime 与最后一次守恒器运行同秒）⇒ 产物里「真 `<img>` +
 * CSS 画的假图标」双份并存（截图：每个标题多出一个蓝方块）。
 *
 * 治本落点：`publishQualityPreview`（同步 workspace 之前 = 「产物完成」语义唯一边界）
 * 的 `selfHealIconTruthBeforePublish`：对磁盘产物做终态复跑 + 写回，与 pass 顺序解耦。
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND_ROOT = process.cwd();
const PROJECT_ROOT = join(BACKEND_ROOT, '..');
const MODULE_PATH = join(BACKEND_ROOT, 'dist', 'ai-engine', 'utils', 'workspace-preview-publisher.js');
const NODE_BIN = process.execPath;

function runHeal(outputPath: string): any {
  const code = `
    const mod = await import(${JSON.stringify(MODULE_PATH)});
    const stats = await mod.__testing.selfHealIconTruthBeforePublish(${JSON.stringify(outputPath)});
    console.log('__RESULT__' + JSON.stringify(stats));
  `;
  const out = execFileSync(NODE_BIN, ['--input-type=module', '-e', code], {
    env: {
      ...process.env,
      FRONTEND_WORKSPACE: join(PROJECT_ROOT, 'frontend', 'workspace'),
    },
    encoding: 'utf-8',
  });
  const line = String(out).split('\n').find((l) => l.startsWith('__RESULT__'));
  return line ? JSON.parse(line.slice('__RESULT__'.length)) : null;
}

/** 真机 ContentForecast 形态：外层已由刀45 补真 `<img>`，标题行内仍留 CSS 假图标 span。 */
const FORECAST_VUE = `<template>
  <div class="c-tm" data-section-id="2:3565">
    <div class="c-tm-forecast-title-wrap">
      <img :src="icon2" style="width:18px;height:18.25px" alt="" />
      <span class="c-tm-forecast-title-text">{{ title }}</span>
      <span class="c-tm-icon"></span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import icon2 from '../../resources/images/icon-3561.png'
const title = ref('流量预测')
</script>
`;

const COMMON_LESS = `.c-tm-icon {
  width: 18px;
  height: 18px;
  background: #388dff;
  border-radius: 6px;
}
`;

const MAPPINGS = [
  {
    figmaNodeId: '2:3573',
    resourceFile: '/resources/images/icon-3561.png',
    assignedVarName: 'icon2',
    previewAnalysisRole: 'icon',
    usage: '<img :src="icon2">',
    ownerSectionId: '2:3565',
    ancestorIds: ['2:3571', '2:3565', '2:9778'],
    figmaBox: { width: 18, height: 18.25 },
  },
];

function makeOutputRoot(opts: { withMapping?: boolean; mappingValue?: any; withFake?: boolean } = {}) {
  const { withMapping = true, mappingValue = MAPPINGS, withFake = true } = opts;
  const root = mkdtempSync(join(tmpdir(), 'mvgo-icon-truth-'));
  mkdirSync(join(root, 'package', 'components'), { recursive: true });
  mkdirSync(join(root, 'resources', 'styles'), { recursive: true });
  mkdirSync(join(root, '.mc-gen'), { recursive: true });
  writeFileSync(join(root, 'package', 'index.vue'), '<template><div class="c-tm"><ContentForecast /></div></template>', 'utf-8');
  const vue = withFake
    ? FORECAST_VUE
    : FORECAST_VUE.replace('      <span class="c-tm-icon"></span>\n', '');
  writeFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), vue, 'utf-8');
  writeFileSync(join(root, 'resources', 'styles', 'common.less'), COMMON_LESS, 'utf-8');
  if (withMapping) {
    writeFileSync(join(root, '.mc-gen', 'resource-dom-mapping.json'), JSON.stringify(mappingValue, null, 2), 'utf-8');
  }
  return root;
}

describe('P0-3 · 发布前图标真假终态断言', () => {
  test('阳性：真 <img> 与 CSS 假图标并存 ⇒ 终态复跑后假图标被清、真图保留、写回磁盘', () => {
    const root = makeOutputRoot();
    try {
      const stats = runHeal(root);
      const vue = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      expect(stats).not.toBeNull();
      expect(stats.verdict).toBe('healed');
      expect(stats.removed).toBeGreaterThanOrEqual(1);
      expect(vue).not.toContain('class="c-tm-icon"');
      expect(vue).toContain('<img :src="icon2"');
      expect(vue).toContain('流量预测');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('阴性：无 .mc-gen/resource-dom-mapping.json ⇒ 不动产物、返回 null', () => {
    const root = makeOutputRoot({ withMapping: false });
    try {
      const before = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      const stats = runHeal(root);
      const after = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      expect(stats).toBeNull();
      expect(after).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('阴性：mapping 为空数组 ⇒ 无 icon 真值、不动产物', () => {
    const root = makeOutputRoot({ mappingValue: [] });
    try {
      const before = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      const stats = runHeal(root);
      const after = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      expect(stats).toBeNull();
      expect(after).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('阴性：本来就没有假图标块 ⇒ clean、产物逐字不变', () => {
    const root = makeOutputRoot({ withFake: false });
    try {
      const before = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      const stats = runHeal(root);
      const after = readFileSync(join(root, 'package', 'components', 'ContentForecast.vue'), 'utf-8');
      expect(stats).not.toBeNull();
      expect(stats.removed).toBe(0);
      expect(stats.verdict).toBe('clean');
      expect(after).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('不存在的 outputPath ⇒ fail-open 返回 null（不抛错，发布链路不受影响）', () => {
    const stats = runHeal(join(tmpdir(), 'mvgo-icon-truth-not-exist-' + Date.now()));
    expect(stats).toBeNull();
    expect(existsSync(join(tmpdir(), 'mvgo-icon-truth-not-exist-' + Date.now()))).toBe(false);
  });
});
