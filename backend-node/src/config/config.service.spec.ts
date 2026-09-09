import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';

describe('AiConfigService', () => {
  const originalCwd = process.cwd();
  let tempRoot: string;
  let service: any;
  let mockUserConfig: Record<string, any> | null;

  const loadService = () => {
    jest.resetModules();
    jest.doMock('./backend-root', () => ({ dataDir: join(tempRoot, 'data') }));
    let mod: any;
    jest.isolateModules(() => {
      mod = require('./config.service');
    });
    // 🆕 方案 B++：合并语义改为「个人配置独一份」，注入可控的用户级配置桩
    mockUserConfig = null;
    service = new mod.AiConfigService(
      { getUserConfig: async () => mockUserConfig },
      null,
    );
    service.setUserConfig = (cfg: Record<string, any> | null) => { mockUserConfig = cfg; };
  };

  beforeEach(() => {
    tempRoot = join(tmpdir(), `mvgo-ai-config-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(tempRoot, 'data'), { recursive: true });
    process.chdir(tempRoot);
    loadService();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('保存配置时会基于现有配置 merge，并补齐默认值', () => {
    const configFile = join(tempRoot, 'data', 'ai-config.json');
    writeFileSync(
      configFile,
      JSON.stringify({
        textModel: 'qwen-plus',
        textBaseURL: 'https://example.com/v1',
      }),
      'utf-8',
    );

    const saved = service.saveAiConfig({ requestConcurrency: 4, textApiKey: 'abc' });

    // 🆕 de4787c 起 saveAiConfig 返回 { config, profiles, activeProfileId } 包装，扁平字段在 .config
    expect(saved.config).toMatchObject({
      textModel: 'qwen-plus',
      textBaseURL: 'https://example.com/v1',
      textApiKey: 'abc',
      requestConcurrency: 4,
      requestQueueTimeoutMs: 120000,
      requestTimeoutMs: 300000,
      requestMaxRetries: 1,
    });

    const persisted = JSON.parse(readFileSync(configFile, 'utf-8'));
    // 🆕 saved.config 含 migrateLegacyToModels 内存派生的 models/binding，磁盘只落扁平字段
    expect(persisted).toMatchObject({
      textModel: 'qwen-plus',
      textBaseURL: 'https://example.com/v1',
      textApiKey: 'abc',
      requestConcurrency: 4,
    });
  });

  it('保存配置时会持久化主模型、角色和供应商的 Temperature（separate 模式保留 per-role 温度）', () => {
    const saved = service.saveAiConfig({
      modelMode: 'separate',
      unifiedTemperature: 1,
      visionTemperature: 0.2,
      textTemperature: 0.3,
      providers: [{ id: 'kimi-backup', apiKey: 'secret', temperature: 1 }],
    });

    expect(saved.config).toMatchObject({
      unifiedTemperature: 1,
      visionTemperature: 0.2,
      textTemperature: 0.3,
      providers: [{ id: 'kimi-backup', apiKey: 'secret', temperature: 1 }],
    });
  });

  it('统一模式会把统一 Temperature 和协议派生到视觉、文本角色（用户级配置）', async () => {
    // 🆕 方案 B++：模型配置均为个人独一份，unified 派生走用户级配置验证
    service.setUserConfig({
      modelMode: 'unified',
      unifiedApiKey: 'key',
      unifiedBaseURL: 'https://api.example.com/v1',
      unifiedModel: 'kimi-k3',
      unifiedProviderType: 'openai-compatible',
      unifiedTemperature: 1,
    });

    const merged = await service.getMergedAiConfig('user-x');

    expect(merged).toMatchObject({
      visionTemperature: 1,
      textTemperature: 1,
      visionProviderType: 'openai-compatible',
      textProviderType: 'openai-compatible',
      textModel: 'kimi-k3',
      visionModel: 'kimi-k3',
    });
  });

  it('方案 B++：无用户级配置时不返回任何模型字段（全局仅系统凭证）', async () => {
    service.saveAiConfig({
      textModel: 'admin-personal',
      visionModel: 'admin-personal-vision',
      models: [{ id: 'm1', model: 'lib-1', apiKey: 'k', baseURL: 'https://x', capability: 'text' }],
    });

    const merged = await service.getMergedAiConfig('user-without-config');

    expect(merged.textModel).toBeUndefined();
    expect(merged.visionModel).toBeUndefined();
    expect(merged.models).toBeUndefined();
    expect(merged.binding).toBeUndefined();
  });

  it('保存配置时会校验 schema，非法字段直接拒绝', () => {
    expect(() => service.saveAiConfig({ requestConcurrency: 99 })).toThrow(/配置字段不合法/);
    expect(() => service.saveAiConfig({ unifiedTemperature: 2.1 })).toThrow(/配置字段不合法/);
    expect(() => service.saveAiConfig({ unknownField: 'x' })).toThrow(/配置字段不合法/);
  });

  it('构建任务快照时会继承服务端配置并允许请求级覆盖', () => {
    service.saveAiConfig({
      textModel: 'baseline-model',
      requestConcurrency: 2,
      requestQueueTimeoutMs: 90000,
      requestTimeoutMs: 120000,
    });

    const snapshot = service.buildTaskConfigSnapshot({
      outputPath: '/tmp/run-1',
      requestTimeoutMs: 450000,
      target: 'vue3',
    });

    expect(snapshot).toMatchObject({
      textModel: 'baseline-model',
      requestConcurrency: 2,
      requestQueueTimeoutMs: 90000,
      requestTimeoutMs: 450000,
      requestMaxRetries: 1,
      outputPath: '/tmp/run-1',
      target: 'vue3',
    });
  });

  it('原子写入完成后不会遗留临时文件', () => {
    service.saveAiConfig({ textModel: 'qwen-max' });

    const dataDir = join(tempRoot, 'data');
    const files = readdirSync(dataDir).sort();

    expect(files).toEqual(['ai-config.json']);
    expect(existsSync(join(dataDir, 'ai-config.json'))).toBe(true);
  });
});
