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
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
  })),
}));

import { TasksService } from './tasks.service';

describe('TasksService configSnapshot', () => {
  let service: TasksService;
  let loadSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    loadSpy = jest.spyOn(TasksService.prototype as any, 'load').mockResolvedValue(undefined);
    service = new TasksService();
    (service as any).persist = jest.fn();
    (service as any).tasks.clear();
  });

  afterEach(() => {
    loadSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('createTask 会脱敏持久化 configSnapshot', () => {
    const task = service.createTask('task-1', {
      componentId: 'comp-1',
      configSnapshot: {
        textModel: 'qwen-plus',
        textApiKey: 'secret-key',
        nested: {
          figmaToken: 'figma-secret',
        },
      },
    });

    expect(task.configSnapshot).toEqual({
      textModel: 'qwen-plus',
      textApiKey: '***REDACTED***',
      nested: {
        figmaToken: '***REDACTED***',
      },
    });
  });

  it('createRetryTask 会继承已脱敏的 configSnapshot', () => {
    service.createTask('task-1', {
      componentId: 'comp-1',
      configSnapshot: {
        requestConcurrency: 2,
        unifiedApiKey: 'secret-key',
      },
    });

    const retryTask = service.createRetryTask('task-1', 'task-1-retry');

    expect(retryTask?.configSnapshot).toEqual({
      requestConcurrency: 2,
      unifiedApiKey: '***REDACTED***',
    });
  });
});
