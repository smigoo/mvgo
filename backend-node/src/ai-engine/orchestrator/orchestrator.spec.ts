// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../config/backend-root.js', () => {
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
