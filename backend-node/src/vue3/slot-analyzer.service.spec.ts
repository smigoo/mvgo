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
