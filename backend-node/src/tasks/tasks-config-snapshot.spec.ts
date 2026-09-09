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
