jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
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
});
