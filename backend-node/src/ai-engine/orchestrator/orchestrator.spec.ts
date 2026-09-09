jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../utils/task-manager.js', () => ({
  taskManager: {
    getAllTasks: jest.fn(() => []),
    getTask: jest.fn(() => null),
    failTask: jest.fn(),
  },
}));

const { withTimeout, executeNode } = require('./orchestrator.js');

describe('orchestrator timeout & retry policy', () => {
  it('withTimeout 会把 AbortSignal 注入 state 并在超时后中断', async () => {
    const wrapped = withTimeout(
      async (state) => {
        expect(state.signal).toBeInstanceOf(AbortSignal);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 80);
          state.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(state.signal.reason);
            },
            { once: true },
          );
        });
        return 'unexpected';
      },
      20,
      { nodeName: 'unit-node' },
    );

    await expect(wrapped({ foo: 'bar' })).rejects.toMatchObject({
      code: 'NODE_EXEC_TIMEOUT',
      message: expect.stringContaining('unit-node'),
    });
  });

  it('executeNode 默认不做节点级重试', async () => {
    let attempts = 0;
    const wrapped = executeNode(
      'unit-node',
      async () => {
        attempts += 1;
        throw new Error('boom');
      },
      { timeout: 100 },
    );

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(attempts).toBe(1);
  });
});
