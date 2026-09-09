import { BadRequestException } from '@nestjs/common';
import { ApiBindingService } from './api-binding.service';

describe('ApiBindingService injection guard', () => {
  function createService(): ApiBindingService {
    return new ApiBindingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('resolves root and package component entries', () => {
    const service = createService() as any;
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mvgo-binding-entry-'));

    try {
      fs.writeFileSync(path.join(root, 'index.vue'), '<template><div /></template>');
      expect(service.resolveComponentEntry(root)).toBe('index.vue');

      fs.rmSync(path.join(root, 'index.vue'));
      fs.mkdirSync(path.join(root, 'package'), { recursive: true });
      fs.writeFileSync(path.join(root, 'package', 'index.vue'), '<template><div /></template>');
      expect(service.resolveComponentEntry(root)).toBe(path.join('package', 'index.vue'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects overwriting const data returned by defineProps destructuring', () => {
    const service = createService() as any;
    const sfc = `
<template><div>{{ rows }}</div></template>
<script setup>
const { rows } = defineProps({ rows: Array })
</script>
`;

    expect(() => service.injectCodeIntoSFC(
      sfc,
      [{ slotId: 'slot-1', slotType: 'list', refName: 'rows', moduleName: 'flow', functionName: 'list', status: 'bound' }],
      [],
      [],
    )).toThrow(BadRequestException);
  });

  it('auto-fixes only identifier-based array literals into refs', () => {
    const service = createService() as any;
    const sfc = `
<template><div>{{ rows.length }}</div></template>
<script setup>
const rows = [{ id: 1 }]
</script>
`;

    const result = service.injectCodeIntoSFC(
      sfc,
      [{ slotId: 'slot-literal', slotType: 'list', refName: 'rows', moduleName: 'flow', functionName: 'list', status: 'bound' }],
      [],
      [],
    );

    expect(result).toContain('const rows = ref([{ id: 1 }])');
    expect(result).toContain('rows.value = __res_slot_literal.data || __res_slot_literal');
  });

  it('rejects missing required API parameters before publishing', () => {
    const service = createService() as any;
    const catalog = {
      modules: [{
        moduleName: 'flow',
        functions: [{
          name: 'getTodayFlow',
          method: 'GET',
          path: '/flow/todayFlow',
          params: [{ name: 'sectionNum', in: 'query', required: true, type: 'string', description: '路段编码' }],
          responsePreview: '{ code, data }',
        }],
      }],
    };

    expect(() => service.validateCatalogBindings(catalog, [{
      slotId: 'slot-1',
      slotType: 'chart',
      refName: 'chartData',
      moduleName: 'flow',
      functionName: 'getTodayFlow',
      status: 'bound',
    }])).toThrow(BadRequestException);
  });

  it('does not create or commit a publishing transaction when required parameters are missing', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mvgo-binding-required-'));
    const commit = jest.fn();
    const detachAndSchedule = jest.fn();
    const catalog = {
      modules: [{
        moduleName: 'flow',
        functions: [{
          name: 'getTodayFlow',
          method: 'GET',
          path: '/flow/todayFlow',
          params: [{ name: 'sectionNum', in: 'query', required: true, type: 'string', description: '路段编码' }],
          responsePreview: '{ code, data }',
        }],
      }],
    };
    fs.writeFileSync(path.join(root, 'index.vue'), '<template><div /></template><script setup></script>');
    const service = new ApiBindingService(
      { getCatalog: () => catalog } as never,
      { validate: jest.fn() } as never,
      { commit } as never,
      { detachAndSchedule } as never,
      { createOverlayCandidate: jest.fn(() => null), getCandidateManifest: jest.fn(() => null) } as never,
    ) as any;
    jest.spyOn(service, 'getComponentDir').mockReturnValue(root);
    jest.spyOn(service, 'getComponentTargets').mockReturnValue([root]);
    jest.spyOn(service, 'readBindings').mockReturnValue([]);

    try {
      await expect(service.bindApi({
        catalogId: 'cat-1',
        componentId: 'component-1',
        componentName: 'ComponentOne',
        groupId: 'group-1',
        bindings: [{
          slotId: 'slot-1',
          slotType: 'chart',
          refName: 'chartData',
          moduleName: 'flow',
          functionName: 'getTodayFlow',
          status: 'bound',
        }],
      })).rejects.toMatchObject({
        response: {
          code: 'API_BINDING_REQUIRED_PARAMETERS_MISSING',
        },
      });
      expect(commit).not.toHaveBeenCalled();
      expect(detachAndSchedule).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('injects configured API parameter values into the generated call', () => {
    const service = createService() as any;
    const sfc = `
<template><div>{{ rows.length }}</div></template>
<script setup>
import { ref } from 'vue'
const rows = ref([])
</script>
`;

    const result = service.injectCodeIntoSFC(
      sfc,
      [{
        slotId: 'slot-params',
        slotType: 'list',
        refName: 'rows',
        moduleName: 'flow',
        functionName: 'getTodayFlow',
        parameterValues: { sectionNum: 'G2', type: 1 },
        status: 'bound',
      }],
      [],
      [],
    );

    expect(result).toContain('flowApi.getTodayFlow({"sectionNum":"G2","type":1})');
  });

  it('generates path parameter replacement without forwarding path fields as query params', () => {
    const service = createService() as any;
    const result = service.generateApiModuleFile('energy', 'base-server', [{
      name: 'getCabinet',
      method: 'GET',
      path: '/energy/cabinet/{deviceCode}',
      summary: '详情',
      tags: [],
      params: [{ name: 'deviceCode', in: 'path', required: true, type: 'string', description: '设备编码' }],
      hasBody: false,
      responsePreview: '{ code, data }',
    }]);

    expect(result).toContain("resolvePath('/energy/cabinet/{deviceCode}', params)");
    expect(result).toContain('omitParameters(params, ["deviceCode"])');
    expect(result).toContain('.get(resolvedPath)');
  });

  it('injects writable refs without duplicate declarations', () => {
    const service = createService() as any;
    const sfc = `
<template><div>{{ rows.length }}</div></template>
<script setup>
import { ref } from 'vue'
const rows = ref([])
</script>
`;

    const result = service.injectCodeIntoSFC(
      sfc,
      [{ slotId: 'slot-1', slotType: 'list', refName: 'rows', moduleName: 'flow', functionName: 'list', status: 'bound' }],
      [],
      [],
    );
    expect(result.match(/const rows = ref/g)).toHaveLength(1);
    expect(result.match(/import \{ ref \} from 'vue'/g)).toHaveLength(1);
    expect(result).toContain('rows.value = __res_slot_1.data || __res_slot_1');
    expect(result).toContain("from './api/flow.js'");
  });

  it('removes both js and historical mjs files when clearing previous binding modules', () => {
    const service = createService() as any;
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mvgo-binding-cleanup-'));
    const apiDir = path.join(root, 'package', 'api');
    fs.mkdirSync(apiDir, { recursive: true });

    try {
      fs.writeFileSync(path.join(apiDir, 'flow.js'), 'export default {}');
      fs.writeFileSync(path.join(apiDir, 'flow.mjs'), 'export default {}');
      fs.writeFileSync(path.join(apiDir, 'flow.mock.js'), 'export default {}');
      fs.writeFileSync(path.join(apiDir, 'flow.mock.mjs'), 'export default {}');

      service.removePreviousBindingModules(apiDir, [
        'package/api/flow.mjs',
        'package/api/flow.mock.js',
      ], 'package/api');

      expect(fs.existsSync(path.join(apiDir, 'flow.js'))).toBe(false);
      expect(fs.existsSync(path.join(apiDir, 'flow.mjs'))).toBe(false);
      expect(fs.existsSync(path.join(apiDir, 'flow.mock.js'))).toBe(false);
      expect(fs.existsSync(path.join(apiDir, 'flow.mock.mjs'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds composite chart data through a data ref and adapter without overwriting chart DOM ref', () => {
    const service = createService() as any;
    const sfc = `
<template><div ref="chartRef"></div></template>
<script setup>
import { ref } from 'vue'
const chartRef = ref(null)
let chartInstance = null
function initChart() {
  chartInstance = echarts.init(chartRef.value)
}
</script>
`;

    const result = service.injectCodeIntoSFC(
      sfc,
      [{
        slotId: 'slot-2',
        slotType: 'chart',
        refName: 'chartRef',
        label: '环境监测趋势图',
        role: 'chart.composite',
        sourceKind: 'echarts',
        children: [{ role: 'chart.series', refName: 'getChartData()', label: '系列数据' }],
        moduleName: 'monitor',
        functionName: 'getTrend',
        status: 'bound',
      }],
      [],
      [],
    );

    expect(result).toContain('const chartRefData = ref({})');
    expect(result).toContain('chartRefData.value = __res_slot_2.data || __res_slot_2');
    expect(result).toContain('applyChartRefData(chartRefData.value)');
    expect(result).toContain('chartInstance.setOption({');
    expect(result).not.toContain('chartRef.value = __res_slot_2.data || __res_slot_2');
  });
});
