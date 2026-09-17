import {
  aggregateUsage,
  buildReport,
  buildUserIndex,
  deltaRateText,
  emptyDurationStats,
  emptyMetrics,
  renderHtml,
  renderMarkdown,
  resolveWindows,
  shanghaiMsFromYmd,
  ymdShanghai,
} from './usage-export';

const MON = shanghaiMsFromYmd('2026-09-14'); // Monday
const THU = shanghaiMsFromYmd('2026-09-17', 15, 0); // Thursday 15:00

describe('resolveWindows', () => {
  it('week: Monday 00:00 to now, previous equal length', () => {
    const { current, previous } = resolveWindows({ preset: 'week', nowMs: THU });
    expect(current.fromMs).toBe(MON);
    expect(current.toMs).toBe(THU);
    expect(previous.toMs).toBe(MON);
    expect(previous.toMs - previous.fromMs).toBe(current.toMs - current.fromMs);
  });

  it('d30 starts 29 days before today 00:00', () => {
    const { current } = resolveWindows({ preset: 'd30', nowMs: THU });
    expect(ymdShanghai(current.fromMs)).toBe('2026-08-19');
  });

  it('custom date-only to is exclusive next day', () => {
    const { current, previous } = resolveWindows({
      preset: 'custom',
      from: '2026-09-10',
      to: '2026-09-17',
      nowMs: THU,
    });
    expect(current.fromMs).toBe(shanghaiMsFromYmd('2026-09-10'));
    expect(current.toMs).toBe(shanghaiMsFromYmd('2026-09-17') + 86400000);
    expect(previous.toMs - previous.fromMs).toBe(8 * 86400000);
  });
});

describe('aggregateUsage + compare', () => {
  const users = [
    { _id: 'u1', username: 'alice', portalInfo: { deptName: '研发' } },
    { _id: 'u2', username: 'bob', portalInfo: { deptName: '产品' } },
  ];
  const index = buildUserIndex(users);

  it('splits current vs previous and by dept', () => {
    const { current, previous } = resolveWindows({ preset: 'week', nowMs: THU });
    const duration = current.toMs - current.fromMs;
    const tasks = [
      { userId: 'u1', taskType: 'component', target: 'microcode', status: 'completed', startTime: MON + 3600000, duration: 1000, textModel: 'qwen-plus', visionModel: 'qwen-vl' },
      { userId: 'u1', taskType: 'component', target: 'vue3', status: 'failed', startTime: MON + 7200000, duration: 3000, textModel: 'qwen-plus' },
      { userId: 'u2', taskType: 'component', target: 'microcode', status: 'running', startTime: MON + 10800000 },
      { userId: 'u1', taskType: 'component', target: 'microcode', status: 'completed', startTime: MON - duration + 3600000, duration: 5000, textModel: 'deepseek' },
    ];
    const apis = [
      { ownerId: 'u2', createdAt: '2026-09-15T02:00:00.000Z', apiCount: 10 },
      { ownerId: 'u2', createdAt: '2026-09-10T02:00:00.000Z', apiCount: 3 },
    ];
    const agg = aggregateUsage({
      componentTasks: tasks,
      apiTasks: apis,
      userIndex: index,
      current,
      previous,
    });
    expect(agg.currentMetrics.componentTotal).toBe(3);
    expect(agg.currentMetrics.microcode).toBe(2);
    expect(agg.currentMetrics.vue3).toBe(1);
    expect(agg.currentMetrics.completed).toBe(1);
    expect(agg.currentMetrics.failed).toBe(1);
    expect(agg.currentMetrics.inProgress).toBe(1);
    expect(agg.currentMetrics.users).toBe(2);
    expect(agg.currentMetrics.apiBatches).toBe(1);
    expect(agg.currentMetrics.apiCount).toBe(10);
    expect(agg.previousMetrics.componentTotal).toBe(1);
    const rd = agg.byDept.find((d) => d.dept === '研发')!;
    expect(rd.current.componentTotal).toBe(2);
    expect(rd.previous.componentTotal).toBe(1);
    expect(agg.currentDuration.sampleCount).toBe(2);
    expect(agg.currentDuration.p50Ms).toBe(1000);
    expect(agg.currentDuration.p90Ms).toBe(3000);
    expect(agg.currentDuration.textModels).toEqual([{ model: 'qwen-plus', count: 2 }]);
    expect(agg.currentDuration.visionModels).toEqual([{ model: 'qwen-vl', count: 1 }]);
    expect(agg.previousDuration.sampleCount).toBe(1);
    expect(agg.previousDuration.p50Ms).toBe(5000);
    expect(agg.previousDuration.textModels).toEqual([{ model: 'deepseek', count: 1 }]);
  });

  it('dept filter drops other departments', () => {
    const { current, previous } = resolveWindows({ preset: 'week', nowMs: THU });
    const agg = aggregateUsage({
      componentTasks: [
        { userId: 'u1', taskType: 'component', target: 'microcode', status: 'completed', startTime: MON + 1000 },
        { userId: 'u2', taskType: 'component', target: 'vue3', status: 'completed', startTime: MON + 2000 },
      ],
      apiTasks: [],
      userIndex: index,
      current,
      previous,
      deptFilter: '研发',
    });
    expect(agg.currentMetrics.componentTotal).toBe(1);
    expect(agg.byDept.map((d) => d.dept)).toEqual(['研发']);
  });
});

describe('delta + render', () => {
  it('new occurrence when previous is 0', () => {
    expect(deltaRateText(5, 0)).toBe('+5（新发生）');
    expect(deltaRateText(12, 10)).toBe('+2（+20.0%）');
  });

  it('markdown contains compare and notes', () => {
    const { current, previous } = resolveWindows({ preset: 'week', nowMs: THU });
    const report = buildReport({
      preset: 'week',
      current,
      previous,
      nowMs: THU,
      agg: {
        currentMetrics: { ...emptyMetrics(), users: 2, componentTotal: 3, completed: 2 },
        previousMetrics: { ...emptyMetrics(), users: 1, componentTotal: 1, completed: 1 },
        currentDuration: { ...emptyDurationStats(), sampleCount: 2, p50Ms: 257000, p90Ms: 594000, textModels: [{ model: 'qwen-plus', count: 2 }] },
        previousDuration: emptyDurationStats(),
        byDept: [
          {
            dept: '研发',
            current: { ...emptyMetrics(), users: 1, componentTotal: 3 },
            previous: { ...emptyMetrics(), users: 1, componentTotal: 1 },
          },
        ],
        daily: [{ date: '2026-09-15', components: 2, apiBatches: 0 }],
        coverage: { ledgerMinMs: MON, ledgerMaxMs: THU, truncated: false, persistedCap: 2000 },
      },
    });
    const md = renderMarkdown(report);
    expect(md).toContain('全量对照');
    expect(md).toContain('研发');
    expect(md).toContain('等长');
    expect(md).toContain('qwen-plus');
    const html = renderHtml(report);
    expect(html).toContain('生成使用报告');
    expect(html).toContain('class="up"');
    expect(html).toContain('p50');
  });
});
