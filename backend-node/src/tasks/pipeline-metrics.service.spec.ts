import { PipelineMetricsService, rootDomainOf } from './pipeline-metrics.service';

/** 让 fire-and-forget 的写入链跑完 */
const flush = () => new Promise((r) => setImmediate(r));

function makeMetricModel() {
  const calls: any[] = [];
  return {
    calls,
    updateOne(filter: any, update: any, opts: any) {
      calls.push({ kind: 'updateOne', filter, update, opts });
      return { exec: async () => ({ acknowledged: true }) };
    },
    deleteOne(filter: any) {
      calls.push({ kind: 'deleteOne', filter });
      return { exec: async () => ({ deletedCount: 1 }) };
    },
  };
}

function makeUserModel(user: any) {
  return {
    findById: () => ({ lean: () => ({ exec: async () => user }) }),
  };
}

const ZHJIE = {
  username: 'zhjie',
  uid: 'zhjie',
  portalInfo: { deptName: '桥隧研发部', orgName: '感动科技' },
};
const DEV_LOCAL = { username: 'dev-local', uid: 'dev-local', portalInfo: { dev: true } };

function baseTask(overrides: Record<string, any> = {}): any {
  return {
    sessionId: 'mc-max-1789000000000-abcdef12',
    componentId: 'mc-max-1789000000000-abcdef12',
    componentName: 'c-env-monitor',
    displayName: '环境监测',
    target: 'microcode',
    sourceType: 'figma',
    generationTier: 'max',
    taskType: 'component',
    userId: '6a7596e81d47bda8ab8b7e07',
    startTime: 1789000000000,
    endTime: 1789000292198,
    duration: 292198,
    qualityGate: 'warned',
    completionModels: { visionModel: 'claude-opus-4-8', textModel: 'claude-sonnet-5' },
    configSnapshot: {
      modelMode: 'separate',
      textModel: 'claude-sonnet-5',
      textBaseURL: 'https://code1.newcli.com/claude/super/v1',
      visionModel: 'claude-opus-4-8',
      visionBaseURL: 'https://code1.newcli.com/claude/ultra/v1',
    },
    ...overrides,
  };
}

describe('rootDomainOf', () => {
  it('取两级根域名，剥掉子域与路径', () => {
    expect(rootDomainOf('https://code1.newcli.com/claude/super/v1')).toBe('newcli.com');
    expect(rootDomainOf('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('aliyuncs.com');
    expect(rootDomainOf('https://www.51aizzz.cc/v1')).toBe('51aizzz.cc');
    expect(rootDomainOf('https://api.deepseek.com/v1/chat/completions')).toBe('deepseek.com');
  });

  it('保留两级公共后缀（com.cn 等）', () => {
    expect(rootDomainOf('https://api.example.com.cn/v1')).toBe('example.com.cn');
  });

  it('非法/空输入返回 undefined，不抛错', () => {
    expect(rootDomainOf(undefined)).toBeUndefined();
    expect(rootDomainOf('')).toBeUndefined();
    expect(rootDomainOf('not-a-url')).toBeUndefined();
  });
});

describe('PipelineMetricsService（P0-2 指标宽表）', () => {
  it('终态写入：PRD 要求的字段全部落库', async () => {
    const metricModel = makeMetricModel();
    const svc = new PipelineMetricsService(
      metricModel as any,
      makeUserModel(ZHJIE) as any,
    );

    svc.recordTerminal(baseTask(), 'completed');
    await flush();

    expect(metricModel.calls).toHaveLength(1);
    const { filter, update, opts } = metricModel.calls[0];
    expect(filter).toEqual({ sessionId: 'mc-max-1789000000000-abcdef12' });
    expect(opts).toEqual({ upsert: true });

    const doc = update.$set;
    expect(doc.status).toBe('completed');
    expect(doc.target).toBe('microcode');
    expect(doc.sourceType).toBe('figma');
    expect(doc.generationTier).toBe('max');
    expect(doc.taskType).toBe('component');
    expect(doc.duration).toBe(292198);
    expect(doc.qualityGate).toBe('warned');
    // 部门必须是任务时快照
    expect(doc.username).toBe('zhjie');
    expect(doc.uid).toBe('zhjie');
    expect(doc.deptName).toBe('桥隧研发部');
    expect(doc.orgName).toBe('感动科技');
    // 模型 + 归属根域名
    expect(doc.textModel).toBe('claude-sonnet-5');
    expect(doc.visionModel).toBe('claude-opus-4-8');
    expect(doc.textRootDomain).toBe('newcli.com');
    expect(doc.visionRootDomain).toBe('newcli.com');
    expect(doc.rootDomains).toEqual(['newcli.com']);
    // 非测试账号
    expect(doc.excluded).toBe(false);
    expect(doc.excludedReason).toBeUndefined();
  });

  it('dev-local 默认被排除出统计口径（按 uid 而非用户名）', async () => {
    const metricModel = makeMetricModel();
    const svc = new PipelineMetricsService(metricModel as any, makeUserModel(DEV_LOCAL) as any);

    svc.recordTerminal(baseTask(), 'completed');
    await flush();

    const doc = metricModel.calls[0].update.$set;
    expect(doc.excluded).toBe(true);
    expect(doc.excludedReason).toContain('dev-local');
  });

  it('modelMode=unified 时文本与视觉共用同一模型与端点', async () => {
    const metricModel = makeMetricModel();
    const svc = new PipelineMetricsService(metricModel as any, makeUserModel(ZHJIE) as any);

    svc.recordTerminal(
      baseTask({
        completionModels: null,
        configSnapshot: {
          modelMode: 'unified',
          unifiedModel: 'gpt-4o',
          unifiedBaseURL: 'https://api.openai.com/v1',
        },
      }),
      'failed',
    );
    await flush();

    const doc = metricModel.calls[0].update.$set;
    expect(doc.textModel).toBe('gpt-4o');
    expect(doc.visionModel).toBe('gpt-4o');
    expect(doc.rootDomains).toEqual(['openai.com']);
  });

  it('cancelReason 透传到宽表（P0-3 埋点前为缺省）', async () => {
    const metricModel = makeMetricModel();
    const svc = new PipelineMetricsService(metricModel as any, makeUserModel(ZHJIE) as any);

    svc.recordTerminal(baseTask(), 'cancelled', { cancelReason: 'user_cancel' });
    await flush();

    const doc = metricModel.calls[0].update.$set;
    expect(doc.status).toBe('cancelled');
    expect(doc.cancelReason).toBe('user_cancel');
  });

  it('撤回人工审核时移除记录（宽表只承载终态）', async () => {
    const metricModel = makeMetricModel();
    const svc = new PipelineMetricsService(metricModel as any, makeUserModel(ZHJIE) as any);

    svc.recordRevert('mc-max-1789000000000-abcdef12');
    await flush();

    expect(metricModel.calls[0]).toEqual({
      kind: 'deleteOne',
      filter: { sessionId: 'mc-max-1789000000000-abcdef12' },
    });
  });

  it('依赖缺失（spec 无参场景）时静默跳过，不抛错', async () => {
    const svc = new PipelineMetricsService(undefined as any, undefined as any);
    expect(() => svc.recordTerminal(baseTask(), 'completed')).not.toThrow();
    expect(() => svc.recordRevert('x')).not.toThrow();
    await flush();
  });

  it('用户查询失败不阻断该行落库（只是缺部门维度）', async () => {
    const metricModel = makeMetricModel();
    const brokenUserModel = {
      findById: () => ({
        lean: () => ({
          exec: async () => {
            throw new Error('db down');
          },
        }),
      }),
    };
    const svc = new PipelineMetricsService(metricModel as any, brokenUserModel as any);

    svc.recordTerminal(baseTask(), 'completed');
    await flush();

    expect(metricModel.calls).toHaveLength(1);
    const doc = metricModel.calls[0].update.$set;
    expect(doc.status).toBe('completed');
    expect(doc.deptName).toBeUndefined();
  });
});
