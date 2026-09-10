/**
 * 保存时视觉能力「先检测、不阻断保存」口径（2026-09-10 用户明确）
 *
 * 背景：早先实现把不支持视觉的模型在**保存时**就 400 拦截（VISION_MODEL_NOT_SUPPORTED），
 * 用户纠正：配置是用户资产，不支持视觉的模型照样要能存（仍可用于纯文本任务）；
 * 限制应只发生在**生成时**——视觉槽位的模型没有视觉能力就不允许生成。
 *
 * 因此保存侧的职责退化为两件事：
 *   1. 保存前对承担视觉角色的模型做一次实测，把结论落盘（生成闸门的唯一事实源）
 *   2. 把结论回传前端（visionCheck / visionWarnings），由 UI 提示「能存但不能生成」
 *
 * 本 spec 钉死的关键契约：**任何能力结论都不得阻断保存**。
 */

const mockResolveVisionCapability = jest.fn();
const mockMarkModelCapabilityIdentified = jest.fn();

jest.mock('../ai-engine/utils/model-config.js', () => ({
  resolveVisionCapability: (model: string) => mockResolveVisionCapability(model),
  markModelCapabilityIdentified: (model: string, opts: any) =>
    mockMarkModelCapabilityIdentified(model, opts),
}));

// 基线问题：backend-root.js 用 import.meta.url，jest CJS 下报
// "Identifier '__filename' has already been declared"（config.service 会引入它）
jest.mock('./backend-root', () => ({
  backendRoot: '/tmp/mvgo-test/backend-node',
  projectRoot: '/tmp/mvgo-test',
  workspaceRoot: '/tmp/mvgo-test/workspace',
  customComponentsDir: '/tmp/mvgo-test/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test/workspace/vue3-components',
  tempComponentsDir: '/tmp/mvgo-test/temp-components',
  dataDir: '/tmp/mvgo-test/backend-node/data',
  logsDir: '/tmp/mvgo-test/backend-node/logs',
  configDir: '/tmp/mvgo-test/backend-node/config',
  chatAttachmentsDir: '/tmp/mvgo-test/backend-node/temp-chat-attachments',
  apifoxZipsDir: '/tmp/mvgo-test/backend-node/data/apifox-zips',
  apiCatalogsDir: '/tmp/mvgo-test/backend-node/data/api-catalogs',
  resolveFrontendWorkspacePath: () => '/tmp/mvgo-test/workspace',
  frontendCustomComponentsDir: () => '/tmp/mvgo-test/workspace/custom-components',
  frontendVue3ComponentsDir: () => '/tmp/mvgo-test/workspace/vue3-components',
}));

// 基线问题：tasks.service 传递依赖 archiver（纯 ESM，jest CJS 下 "Cannot use import
// statement outside a module"）。controller 只把它当构造参数类型，这里整体打桩。
jest.mock('../tasks/tasks.service', () => ({
  TasksService: class TasksService {},
}));

import { AiConfigController } from './config.controller';

const makeCfg = (
  visionModel: string,
  apiKey = 'sk-real-key',
): Record<string, any> => ({
  modelMode: 'separate',
  visionModel,
  visionApiKey: apiKey,
  visionBaseURL: 'https://example.com/v1',
});

const UNKNOWN = { vision: null, identified: false, source: 'unknown' };

describe('保存时视觉能力「先检测、不阻断」', () => {
  let controller: any;
  let testVisionLLM: jest.Mock;
  let saveUserConfig: jest.Mock;

  const rebuild = (svc: any = {}) => {
    testVisionLLM = jest.fn();
    saveUserConfig = jest.fn().mockResolvedValue(undefined);
    controller = new AiConfigController(
      svc,
      { testVisionLLM } as any,
      { saveUserConfig } as any,
      { countActiveTasks: () => 0 } as any,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rebuild();
  });

  it('实测不支持视觉：只返回结论，不抛错（保存由上层继续）', async () => {
    mockResolveVisionCapability.mockReturnValue({
      vision: false,
      identified: true,
      source: 'test',
    });

    const r = await controller.detectVisionCapabilityOnSave(makeCfg('deepseek-v4'));

    expect(r).toHaveLength(1);
    expect(r[0].vision).toBe(false);
    // 文案必须让用户知道「已保存，但不能生成」，而不是「保存失败」
    expect(r[0].message).toContain('已保存');
    expect(r[0].message).toContain('不能');
    // 已有实测结论 → 复用，不再打 API
    expect(testVisionLLM).not.toHaveBeenCalled();
  });

  it('未检测 + 有可用密钥：保存时同步检测，并把结论落盘', async () => {
    mockResolveVisionCapability.mockReturnValue(UNKNOWN);
    testVisionLLM.mockResolvedValue({ success: true });

    const r = await controller.detectVisionCapabilityOnSave(makeCfg('qwen-vl-max'));

    expect(testVisionLLM).toHaveBeenCalledTimes(1);
    expect(mockMarkModelCapabilityIdentified).toHaveBeenCalledWith(
      'qwen-vl-max',
      expect.objectContaining({ vision: true, source: 'save-gate' }),
    );
    expect(r[0].vision).toBe(true);
  });

  it('检测返回不支持：落盘 false，仍然不阻断保存', async () => {
    mockResolveVisionCapability.mockReturnValue(UNKNOWN);
    testVisionLLM.mockResolvedValue({
      success: false,
      error: 'model does not support image input',
    });

    const r = await controller.detectVisionCapabilityOnSave(makeCfg('deepseek-v4'));

    expect(mockMarkModelCapabilityIdentified).toHaveBeenCalledWith(
      'deepseek-v4',
      expect.objectContaining({ vision: false }),
    );
    expect(r[0].vision).toBe(false);
    expect(r[0].message).toContain('已保存');
  });

  it('密钥脱敏（sk-***）：不发起真实调用，标记为未知', async () => {
    mockResolveVisionCapability.mockReturnValue(UNKNOWN);

    const r = await controller.detectVisionCapabilityOnSave(
      makeCfg('qwen-vl-max', 'sk-***'),
    );

    expect(testVisionLLM).not.toHaveBeenCalled();
    expect(r[0].vision).toBeNull();
    expect(r[0].message).toContain('检测');
  });

  it('已检测支持：复用结论，不重复消耗额度', async () => {
    mockResolveVisionCapability.mockReturnValue({
      vision: true,
      identified: true,
      source: 'test',
    });

    const r = await controller.detectVisionCapabilityOnSave(makeCfg('qwen-vl-max'));

    expect(testVisionLLM).not.toHaveBeenCalled();
    expect(r[0].vision).toBe(true);
  });

  it('端到端 saveAi：模型不支持视觉也返回 success，并带出 visionCheck', async () => {
    mockResolveVisionCapability.mockReturnValue({
      vision: false,
      identified: true,
      source: 'test',
    });
    rebuild({ getUserMergedConfig: jest.fn().mockResolvedValue({}) });

    const res = await controller.saveAi(
      { action: 'save-current', ...makeCfg('deepseek-v4') },
      {},
      'u1',
    );

    // 核心契约：保存永远成功
    expect(res.success).toBe(true);
    expect(saveUserConfig).toHaveBeenCalledTimes(1);
    // 结论回传前端用于提示
    expect(res.visionCheck[0]).toMatchObject({
      model: 'deepseek-v4',
      vision: false,
    });
    expect(res.visionWarnings[0]).toContain('deepseek-v4');
  });
});
