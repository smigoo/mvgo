import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BindApiDto } from './bind-api.dto';

describe('BindApiDto', () => {
  const validPayload = {
    catalogId: 'cat-123',
    componentId: 'mv-123-abc',
    groupId: 'group-1',
    bindings: [
      {
        slotId: 'slot-1',
        slotType: 'list',
        refName: 'rows',
        moduleName: 'flow',
        functionName: 'getRows',
        status: 'bound',
      },
    ],
  };

  it('accepts safe identifiers', async () => {
    const dto = plainToInstance(BindApiDto, validPayload);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects path traversal in component and module names', async () => {
    const dto = plainToInstance(BindApiDto, {
      ...validPayload,
      componentId: '../outside',
      bindings: [{
        ...validPayload.bindings[0],
        moduleName: '../flow',
      }],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'componentId')).toBe(true);
    expect(errors.some((error) => error.property === 'bindings')).toBe(true);
  });

  it('accepts primitive API parameter values', async () => {
    const dto = plainToInstance(BindApiDto, {
      ...validPayload,
      bindings: [{
        ...validPayload.bindings[0],
        parameterValues: {
          sectionNum: 'G2',
          type: 1,
          enabled: true,
        },
      }],
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts composite slot metadata used by the binding wizard', async () => {
    const dto = plainToInstance(BindApiDto, {
      ...validPayload,
      bindings: [{
        slotId: 'slot-2',
        slotType: 'chart',
        refName: 'chartRef',
        label: '环境监测趋势图',
        role: 'chart.composite',
        sourceKind: 'echarts',
        bindable: true,
        children: [
          { role: 'filter.tabs', refName: 'tabs', label: '筛选维度', sourceKind: 'template' },
          { role: 'chart.series', refName: 'getChartData()', label: '系列数据', sourceKind: 'echarts' },
        ],
        status: 'stub',
        stubReason: '自动分析未找到匹配接口',
      }],
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
