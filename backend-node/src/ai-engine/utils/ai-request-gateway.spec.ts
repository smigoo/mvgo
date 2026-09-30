jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → 与既有 spec 同款 mock
jest.mock('../../config/backend-root.js', () => ({
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  workspaceRoot: '/Users/smigoo/工作/mvgo/backend-node/workspace',
  dataDir: '/Users/smigoo/工作/mvgo/backend-node/data',
  customComponentsDir: '/Users/smigoo/工作/mvgo/backend-node/workspace/custom-components',
  vue3ComponentsDir: '/Users/smigoo/工作/mvgo/backend-node/workspace/vue3-components',
  tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
  resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
  frontendCustomComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
  frontendVue3ComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
}));

const gateway = require('./ai-request-gateway.js');

describe('ai-request-gateway', () => {

  it('会在单次请求失败后自动重试并最终成功', async () => {
    let attempt = 0;
    const response = await gateway.executeModelRequest({
      context: 'unit-timeout-retry',
      requestTimeoutMs: 20,
      requestMaxRetries: 1,
      operation: async () => {
        attempt += 1;
        if (attempt === 1) {
          const error: any = new Error('network timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { content: 'ok', usage_metadata: { input_tokens: 1, output_tokens: 1 } };
      },
    });

    expect(response.content).toBe('ok');
    expect(attempt).toBe(2);
  });

  it('attachUnifiedInvoke 会把 signal 透传给底层 llm.invoke', async () => {
    const rawInvoke = jest.fn(async (_prompt, options) => ({
      ok: true,
      receivedSignal: !!options?.signal,
    }));
    const llm = { invoke: rawInvoke, modelName: 'test-model' };

    gateway.attachUnifiedInvoke(llm, { context: 'patched-llm', model: 'test-model' });

    const controller = new AbortController();
    const result = await llm.invoke('hello', {
      __mvgoRequestOptions: {
        signal: controller.signal,
        requestTimeoutMs: 10000,
      },
    });

    expect(rawInvoke).toHaveBeenCalledTimes(1);
    expect(result.receivedSignal).toBe(true);
  });

  it('invokeLangChainModel 遇到已包装模型时只调度一次', async () => {
    const rawInvoke = jest.fn(async () => ({ content: 'ok' }));
    const llm = { invoke: rawInvoke, modelName: 'test-model' };
    gateway.attachUnifiedInvoke(llm, { context: 'single-layer' });

    const startedBefore = gateway.getModelRequestStats().totalStarted;
    const result = await gateway.invokeLangChainModel({
      llm,
      prompt: 'hello',
      context: 'single-layer',
      requestConcurrency: 1,
      requestTimeoutMs: 10000,
      requestMaxRetries: 0,
    });

    expect(result.content).toBe('ok');
    expect(rawInvoke).toHaveBeenCalledTimes(1);
    expect(gateway.getModelRequestStats().totalStarted - startedBefore).toBe(1);
  });

  it('排队期间取消会移除队列项且不会执行请求', async () => {
    const firstGrant = await gateway.requestScheduler.acquire(
      1,
      { context: 'queue-holder' },
      { queueTimeoutMs: 10000 },
    );
    const controller = new AbortController();
    const operation = jest.fn();

    const queuedRequest = gateway.executeModelRequest({
      context: 'queue-abort',
      requestConcurrency: 1,
      requestQueueTimeoutMs: 10000,
      requestTimeoutMs: 10000,
      requestMaxRetries: 0,
      signal: controller.signal,
      operation,
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(gateway.getModelRequestStats().queuedCount).toBe(1);

    controller.abort(new Error('user cancelled'));
    await expect(queuedRequest).rejects.toMatchObject({
      code: 'MODEL_REQUEST_QUEUE_ABORTED',
    });
    expect(operation).not.toHaveBeenCalled();
    expect(gateway.getModelRequestStats().queuedCount).toBe(0);

    firstGrant.release();
  });

  it('排队超时后不会执行请求并释放队列项', async () => {
    const firstGrant = await gateway.requestScheduler.acquire(
      1,
      { context: 'queue-holder' },
      { queueTimeoutMs: 10000 },
    );
    const operation = jest.fn();

    const queuedRequest = gateway.executeModelRequest({
      context: 'queue-timeout',
      requestConcurrency: 1,
      requestQueueTimeoutMs: 1000,
      requestTimeoutMs: 10000,
      requestMaxRetries: 0,
      operation,
    });

    await expect(queuedRequest).rejects.toMatchObject({
      code: 'MODEL_REQUEST_QUEUE_TIMEOUT',
    });
    expect(operation).not.toHaveBeenCalled();
    expect(gateway.getModelRequestStats().queuedCount).toBe(0);

    firstGrant.release();
  });

  it('B层自愈：推理烧光输出预算（finish_reason=length+reasoning）时，后续 attempt 强制关推理重试', async () => {
    // 第 1 次返回空内容（推理烧光预算），第 2 次（关推理后）返回正文
    const emptyResponse = {
      content: '',
      response_metadata: { finish_reason: 'length' },
      usage_metadata: { output_tokens: 2000, output_token_details: { reasoning: 1800 } },
    }
    const okResponse = {
      content: 'real component code',
      response_metadata: { finish_reason: 'stop' },
      usage_metadata: { output_tokens: 100 },
    }
    let invokeCount = 0
    const baseInvoke = jest.fn(async () => {
      invokeCount += 1
      return invokeCount === 1 ? emptyResponse : okResponse
    })
    const llm = { invoke: baseInvoke, modelName: 'reasoning-model' }
    const createLLM = jest.fn((snap) => ({ invoke: baseInvoke, modelName: snap.model || 'reasoning-model' }))
    const refreshProvider = jest.fn((opts = {}) => ({
      providerId: 'prov-1',
      apiKey: 'k',
      baseURL: '',
      model: 'reasoning-model',
      providerType: 'openai-compatible',
      // 🛡️ B 层：forceThinkingDisabled 时透传 'disabled'
      thinkingType: opts.forceThinkingDisabled ? 'disabled' : '',
    }))

    gateway.attachUnifiedInvoke(llm, {
      context: 'self-heal',
      model: 'reasoning-model',
      refreshProvider,
      createLLM,
      treatEmptyAsFailure: true,
    })

    const result = await llm.invoke('生成组件', {
      __mvgoRequestOptions: { treatEmptyAsFailure: true, requestMaxRetries: 1, requestTimeoutMs: 5000 },
    })

    // 关推理重试后拿到正文 → 任务不 FAILED
    expect(result.content).toBe('real component code')
    // 重建 LLM 时被要求关推理（thinkingType:'disabled'）
    const disabledRebuild = createLLM.mock.calls.find((c) => c[0]?.thinkingType === 'disabled')
    expect(disabledRebuild).toBeTruthy()
    // refreshProvider 确实收到 forceThinkingDisabled（复用同 provider 而非换 provider）
    expect(refreshProvider.mock.calls.some((c) => c[0]?.forceThinkingDisabled === true)).toBe(true)
  });

  it('慢归因：执行开始即上报带模型名的 model-start 进度（含「模型响应慢」安抚）', async () => {
    const events = []
    const baseInvoke = jest.fn(async () => ({ content: 'ok', usage_metadata: { output_tokens: 1 } }))
    const llm = { invoke: baseInvoke, modelName: 'deepseek-v4.1-flash' }
    const createLLM = jest.fn((s) => ({ invoke: baseInvoke, modelName: s.model || 'm' }))
    const refreshProvider = jest.fn(() => ({
      providerId: 'p1', apiKey: 'k', baseURL: '', model: 'deepseek-v4.1-flash',
      providerType: 'openai-compatible', thinkingType: '',
    }))

    gateway.attachUnifiedInvoke(llm, {
      context: 'attrib', model: 'deepseek-v4.1-flash', refreshProvider, createLLM,
      treatEmptyAsFailure: true,
      onProgress: (e) => events.push(e),
    })

    const res = await llm.invoke('hi', { __mvgoRequestOptions: { requestMaxRetries: 0, requestTimeoutMs: 3000 } })

    expect(res.content).toBe('ok')
    // 立即（首推）带模型名的 model-start，且明确「模型响应慢」
    const start = events.find((e) => e.kind === 'model-start')
    expect(start).toBeTruthy()
    expect(start.kind).toBe('model-start')
    expect(start.message).toContain('deepseek-v4.1-flash')
    expect(start.message).toContain('多为模型响应慢')
    // 网关心跳类进度事件均带 kind 分类字段（model-start / model-slow / platform-queue / retry）
    const heartbeatKinds = events.filter((e) => e.context === 'attrib').map((e) => e.kind)
    expect(heartbeatKinds.every((k) => typeof k === 'string')).toBe(true)
  });
});
