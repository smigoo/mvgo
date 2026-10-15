// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })
import { SlotAnalyzerService } from './slot-analyzer.service';

describe('SlotAnalyzerService', () => {
  it('does not treat script-local setOption arguments as data slots', async () => {
    const service = new SlotAnalyzerService();
    jest.spyOn(service, 'readSFC').mockReturnValue(`
<template>
  <div class="chart-host"></div>
</template>
<script setup>
function updateChart(option) {
  chart.setOption(option)
}
</script>
`);

    const result = await service.analyzeSlots('mv-test', 'group-test');
    expect(result.slots).toEqual([]);
  });

  it('keeps template chart bindings', async () => {
    const service = new SlotAnalyzerService();
    jest.spyOn(service, 'readSFC').mockReturnValue(`
<template>
  <ChartView :option="chartOption" />
</template>
<script setup>
const chartOption = {}
</script>
`);

    const result = await service.analyzeSlots('mv-test', 'group-test');
    expect(result.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ refName: 'chartOption', slotType: 'chart' }),
    ]));
  });
});
