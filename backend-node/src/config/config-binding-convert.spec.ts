import { resolveBindingToLegacy, migrateLegacyToModels } from './config.service';

describe('模型库 ↔ legacy 字段转换', () => {
  describe('resolveBindingToLegacy（新 → 旧降维）', () => {
    it('统一模式：主模型 + 池成员降维为 unified* + providers(role=both)', () => {
      const cfg = {
        modelMode: 'unified',
        models: [
          { id: 'm1', name: '主', apiKey: 'k1', baseURL: 'https://a', model: 'gpt-5', providerType: 'openai-compatible', capability: 'both', temperature: 0.3 },
          { id: 'm2', name: '备', apiKey: 'k2', baseURL: 'https://b', model: 'gpt-5b', providerType: 'anthropic', capability: 'both', rpm: 10, weight: 5 },
        ],
        binding: { unified: { primaryId: 'm1', poolIds: ['m2'] } },
      };
      const out: any = resolveBindingToLegacy(cfg);
      expect(out.unifiedApiKey).toBe('k1');
      expect(out.unifiedBaseURL).toBe('https://a');
      expect(out.unifiedModel).toBe('gpt-5');
      expect(out.unifiedProviderType).toBe('openai-compatible');
      expect(out.unifiedTemperature).toBe(0.3);
      expect(out.providers).toHaveLength(1);
      expect(out.providers[0]).toMatchObject({ id: 'm2', model: 'gpt-5b', role: 'both', rpm: 10, weight: 5 });
      // 保留新结构供前端读回
      expect(out.models).toHaveLength(2);
      expect(out.binding.unified.primaryId).toBe('m1');
    });

    it('分类模式：text/vision 各自降维，providers 按槽位分 role', () => {
      const cfg = {
        modelMode: 'separate',
        models: [
          { id: 't1', name: '文本主', apiKey: 'tk1', baseURL: 'https://t', model: 'kimi', capability: 'text' },
          { id: 'v1', name: '视觉主', apiKey: 'vk1', baseURL: 'https://v', model: 'glm-5v', capability: 'vision', temperature: 0.5 },
          { id: 't2', name: '文本备', apiKey: 'tk2', baseURL: 'https://t', model: 'kimi2', capability: 'text' },
          { id: 'v2', name: '视觉备', apiKey: 'vk2', baseURL: 'https://v', model: 'glm-5v2', capability: 'vision' },
        ],
        binding: {
          text: { primaryId: 't1', poolIds: ['t2'] },
          vision: { primaryId: 'v1', poolIds: ['v2'] },
        },
      };
      const out: any = resolveBindingToLegacy(cfg);
      expect(out.textApiKey).toBe('tk1');
      expect(out.textModel).toBe('kimi');
      expect(out.visionApiKey).toBe('vk1');
      expect(out.visionModel).toBe('glm-5v');
      expect(out.visionTemperature).toBe(0.5);
      expect(out.providers).toHaveLength(2);
      const t = out.providers.find((p: any) => p.id === 't2');
      const v = out.providers.find((p: any) => p.id === 'v2');
      expect(t.role).toBe('text');
      expect(v.role).toBe('vision');
    });

    it('旧结构（无 models）原样透传，不动 providers', () => {
      const cfg = { modelMode: 'separate', textModel: 'kimi', providers: [{ id: 'x', apiKey: 'k' }] };
      const out: any = resolveBindingToLegacy(cfg);
      expect(out).toEqual(cfg);
    });

    it('有模型但未绑定槽位（中间态）不降维、不清 providers', () => {
      const cfg = { modelMode: 'unified', models: [{ id: 'm1', apiKey: 'k1', model: 'gpt' }], providers: [{ id: 'old', apiKey: 'oldk', role: 'both' }] };
      const out: any = resolveBindingToLegacy(cfg);
      expect(out.providers).toHaveLength(1);
      expect(out.providers[0].id).toBe('old');
    });

    it('主模型未填温度时，降维会清掉 legacy 温度残留', () => {
      const cfg = {
        modelMode: 'unified',
        unifiedTemperature: 0.9,
        models: [{ id: 'm1', apiKey: 'k1', model: 'gpt' }],
        binding: { unified: { primaryId: 'm1', poolIds: [] } },
      };
      const out: any = resolveBindingToLegacy(cfg);
      expect(out.unifiedTemperature).toBeUndefined();
    });
  });

  describe('migrateLegacyToModels（旧 → 新迁移）', () => {
    it('统一模式：unified* 建主模型，providers 转库成员并入 poolIds', () => {
      const cfg = {
        modelMode: 'unified',
        unifiedApiKey: 'k1',
        unifiedBaseURL: 'https://a',
        unifiedModel: 'gpt-5',
        unifiedProviderType: 'openai-compatible',
        unifiedTemperature: 0.4,
        providers: [{ id: 'p1', apiKey: 'k2', model: 'gpt-5b', role: 'both' }],
      };
      const out: any = migrateLegacyToModels(cfg);
      expect(out.models).toHaveLength(2);
      const primary = out.models.find((m: any) => m.id === 'legacy-unified');
      expect(primary).toMatchObject({ apiKey: 'k1', model: 'gpt-5', capability: 'both', temperature: 0.4 });
      expect(out.binding.unified.primaryId).toBe('legacy-unified');
      expect(out.binding.unified.poolIds).toContain('p1');
    });

    it('分类模式：text/vision 各建主模型，providers 按 role 归池', () => {
      const cfg = {
        modelMode: 'separate',
        textApiKey: 'tk', textModel: 'kimi',
        visionApiKey: 'vk', visionModel: 'glm-5v',
        providers: [
          { id: 'pt', apiKey: 'tk2', model: 'kimi2', role: 'text' },
          { id: 'pv', apiKey: 'vk2', model: 'glm5v2', role: 'vision' },
          { id: 'pb', apiKey: 'bk', model: 'both-m', role: 'both' },
        ],
      };
      const out: any = migrateLegacyToModels(cfg);
      const textPrimary = out.models.find((m: any) => m.id === 'legacy-text');
      const visionPrimary = out.models.find((m: any) => m.id === 'legacy-vision');
      expect(textPrimary.capability).toBe('text');
      expect(visionPrimary.capability).toBe('vision');
      expect(out.binding.text.poolIds).toContain('pt');
      expect(out.binding.text.poolIds).toContain('pb');
      expect(out.binding.vision.poolIds).toContain('pv');
      expect(out.binding.vision.poolIds).toContain('pb');
      // role=both 的条目只进一次模型库
      expect(out.models.filter((m: any) => m.id === 'pb')).toHaveLength(1);
    });

    it('已有 models 原样返回（幂等）', () => {
      const cfg = { models: [{ id: 'x' }], binding: { unified: { primaryId: 'x' } } };
      expect(migrateLegacyToModels(cfg)).toEqual(cfg);
    });

    it('确定性 id：两次迁移同输入同输出', () => {
      const cfg = { modelMode: 'separate', textModel: 'kimi', visionModel: 'glm-5v' };
      const a: any = migrateLegacyToModels(cfg);
      const b: any = migrateLegacyToModels(cfg);
      expect(a.models).toEqual(b.models);
      expect(a.binding).toEqual(b.binding);
    });
  });
});
