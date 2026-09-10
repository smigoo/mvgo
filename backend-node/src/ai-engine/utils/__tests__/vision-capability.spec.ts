/**
 * 视觉能力判定测试（2026-09-10）
 *
 * 背景：deepseek-v4-pro 这类纯文本模型被用户配置后照样执行截图生成，
 * 产物与截图完全无关且不报错。根因是保存/生成两道闸门都缺失；
 * 且遗留的 isVisionModel 按模型名子串猜测（只认 vision / qwen-vl / claude-3），
 * 覆盖率极低、对 claude-sonnet-5 / gpt-4o / glm-5.x 等现代视觉模型全部漏判，
 * 且当时全仓无任何调用点。
 *
 * 本测试钉死新契约：判定**只认实测结论**，绝不根据模型名猜测。
 */

// ⚠️ model-config.js 的两处依赖（ai-engine/logger、config/backend-root）都使用
// import.meta.url，在 jest(CJS) 下会报 "Identifier '__filename' has already been declared"
// （仓库既有 ESM/jest 互操作基线问题，非本用例引入）。mock 掉后纯函数逻辑即可被测试。
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }),
}));

jest.mock('../../../config/backend-root.js', () => ({
  dataDir: '/tmp/mvgo-vision-capability-test',
  logsDir: '/tmp/mvgo-vision-capability-test/logs',
}));

import {
  resolveVisionCapability,
  markModelCapabilityIdentified,
} from '../model-config.js';

// 带随机后缀，避免与内置能力表或其他用例相互污染
const uniq = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('视觉能力判定 resolveVisionCapability', () => {
  it('未检测的模型返回 null（未知），不得猜测为支持或不支持', () => {
    const m = uniq('never-tested-model');
    const cap = resolveVisionCapability(m);
    expect(cap.vision).toBeNull();
    expect(cap.source).toBe('unknown');
  });

  it('实测不支持视觉 → false，可被保存/生成闸门拦下', () => {
    const m = uniq('deepseek-v4-pro-textonly');
    markModelCapabilityIdentified(m, { source: 'test', vision: false });
    const cap = resolveVisionCapability(m);
    expect(cap.vision).toBe(false);
    expect(cap.identified).toBe(true);
  });

  it('实测支持视觉 → true', () => {
    const m = uniq('some-vision-capable-model');
    markModelCapabilityIdentified(m, { source: 'test', vision: true });
    expect(resolveVisionCapability(m).vision).toBe(true);
  });

  it('关键契约（不按名猜测）：名字像纯文本的模型，实测支持视觉即判定为支持', () => {
    const m = uniq('deepseek-vision-experimental');
    markModelCapabilityIdentified(m, { source: 'test', vision: true });
    expect(resolveVisionCapability(m).vision).toBe(true);
  });

  it('关键契约（不按名猜测）：名字含 vision 的模型，实测不支持即判定为不支持', () => {
    const m = uniq('fake-vision-model');
    markModelCapabilityIdentified(m, { source: 'test', vision: false });
    expect(resolveVisionCapability(m).vision).toBe(false);
  });

  it('实测结论可被后续检测覆盖（以最新检测结果为准）', () => {
    const m = uniq('flip-flop-model');
    markModelCapabilityIdentified(m, { source: 'test', vision: true });
    expect(resolveVisionCapability(m).vision).toBe(true);
    markModelCapabilityIdentified(m, { source: 'test', vision: false });
    expect(resolveVisionCapability(m).vision).toBe(false);
  });

  it('仅记录连通性、未测视觉的模型仍属未知（不得放行）', () => {
    const m = uniq('reachable-but-vision-unknown');
    markModelCapabilityIdentified(m, { source: 'test' }); // 不传 vision
    const cap = resolveVisionCapability(m);
    expect(cap.vision).toBeNull();
    expect(cap.identified).toBe(true); // 连通性已知，但视觉仍未知
  });

  it('空模型名安全返回 null', () => {
    expect(resolveVisionCapability('').vision).toBeNull();
    expect(resolveVisionCapability(undefined as unknown as string).vision).toBeNull();
  });
});
