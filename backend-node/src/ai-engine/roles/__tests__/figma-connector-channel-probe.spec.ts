/**
 * 📡 通道握手前置探测 + 总预算闸门判据（2026-11-03 真机实锤驱动）
 *
 * 病灶：mc-max-1793671867830-acb4cb93 生产报错 `read ECONNRESET`（HTTP 无状态码）。
 * 取证结论（零改动只读诊断）：
 *   生产 ECS(47.98.216.206) → api.figma.com(AWS CloudFront 65.9.168.x) 跨境链路
 *   偶发「TCP 建连成功(0.1s) 但 TLS/首字节挂起」或「首字节阶段被 RST」：
 *     · curl /v1/me ×10：1 次 connect=0.108s 后 appconnect 挂到 20s 超时(rc=28)
 *     · www.figma.com ×3：1 次 rc=35 SSL connect error @30.18s
 *     · ping 0% 丢包（所以不是「断网」，而是握手阶段被打断）
 *   原实现只能等 axios 全量超时（180s）才知道通道坏，且 proxyAgent=null 时
 *   attempt%2 的「代理↔直连交替」形同虚设 ⇒ 3 次重试全撞同一条坏链路。
 *
 * 本文件锁定四条判据：
 *  1. 探测失败 ⇒ **零 API 请求**（阳气对照的反面：不能出现「探测挡了但照样发请求」）；
 *  2. 探测成功 ⇒ **必须真的发请求 1 次**（阳性对照：防「探测恒失败导致全链路哑火」假绿）；
 *  3. 探测失败 N 次后成功 ⇒ 只发 1 次请求（换通道语义成立，不是重复打同一通道）；
 *  4. FIGMA_CHANNEL_PROBE=0 ⇒ 完全不探测（软回滚可用）；
 *  5. 代理模式跳过探测（探测目标应为代理，明文 CONNECT 用 TLS 语义会假阴性）；
 *  6. 预算不足以支撑一次最短尝试 ⇒ 立即中止，零请求（防 180s×5 叠爆管线）。
 */
import { FigmaConnector } from '../figma-connector.js';
import axios from 'axios';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → mock 掉路径解析
jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: `${root}/logs`,
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () =>
      '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () =>
      '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
  };
});

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const getMock = (axios as unknown as { get: jest.Mock }).get;
const CONN = FigmaConnector as unknown as new (cfg: Record<string, unknown>) => Record<
  string,
  any
>;

/** 造 connector：计数限流器（acquire 次数即「是否真的进入发请求流程」的证据） */
function makeConnector(extraEnv: Record<string, string> = {}) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(extraEnv)) {
    saved[k] = process.env[k];
    process.env[k] = extraEnv[k];
  }
  const c = new CONN({ figmaToken: 'fake-token-probe-spec', nodeCacheTtlMs: 0 });
  for (const k of Object.keys(extraEnv)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  const limiter = {
    acquireCount: 0,
    acquire: async () => {
      limiter.acquireCount++;
      return () => {};
    },
    noteRateLimited: () => {},
  };
  c._rateLimiter = limiter;
  return { c, limiter };
}

/** 伪 TLS：ok=true 立即 secureConnect；ok=false 立即 error */
function fakeTls(
  script: Array<{ ok: boolean; error?: string }>,
) {
  const calls: any[] = [];
  const fn = (opts: any) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push(opts);
    const handlers: Record<string, Function> = {};
    const sock: any = {
      once(ev: string, cb: Function) {
        handlers[ev] = cb;
        // 同步派发（下一个 microtask 里，确保 once 已注册）
        queueMicrotask(() => {
          if (ev === 'secureConnect' && step.ok) cb();
          if (ev === 'error' && !step.ok) {
            cb(Object.assign(new Error(step.error || 'ECONNRESET'), { code: step.error }));
          }
        });
        return sock;
      },
      destroy() {},
    };
    return sock;
  };
  return { fn, calls };
}

const okScript = [{ ok: true }];

describe('_figmaApiGet · 通道握手前置探测', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FIGMA_CHANNEL_PROBE;
    delete process.env.FIGMA_RETRY_BASE_MS;
    process.env.FIGMA_RETRY_BASE_MS = '1'; // 退避缩到 1ms，避免测试等待
  });

  afterAll(() => {
    delete process.env.FIGMA_RETRY_BASE_MS;
  });

  it('阳性对照：探测通过 ⇒ 必须真的发请求 1 次（防「探测恒挡」假绿）', async () => {
    const { c, limiter } = makeConnector();
    const tls = fakeTls(okScript);
    c._tlsConnect = tls.fn;
    getMock.mockResolvedValue({ status: 200, data: { nodes: {} } });

    await c._figmaApiGet('https://api.figma.com/v1/me', { maxRetries: 3, tag: 'spec' });

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(limiter.acquireCount).toBe(1); // 探测通过才占限流槽
    expect(tls.calls.length).toBe(1);
    expect(tls.calls[0]).toMatchObject({ host: 'api.figma.com', port: 443 });
  });

  it('探测失败 ⇒ 零 API 请求、零限流占槽（不白等 180s 超时）', async () => {
    const { c, limiter } = makeConnector();
    const tls = fakeTls([{ ok: false, error: 'ECONNRESET' }]);
    c._tlsConnect = tls.fn;

    await expect(
      c._figmaApiGet('https://api.figma.com/v1/files/k/nodes?ids=1:2', {
        maxRetries: 3,
        tag: 'spec',
      }),
    ).rejects.toThrow(/通道握手失败/);

    expect(getMock).not.toHaveBeenCalled();
    expect(limiter.acquireCount).toBe(0);
    expect(tls.calls.length).toBe(3); // 用满 3 次尝试，每次都是握手探测
  });

  it('探测失败 2 次后恢复 ⇒ 只发 1 次请求（换通道成功，不重复打同一条）', async () => {
    const { c, limiter } = makeConnector();
    const tls = fakeTls([
      { ok: false, error: 'connect-timeout' },
      { ok: false, error: 'connect-timeout' },
      { ok: true },
    ]);
    c._tlsConnect = tls.fn;
    getMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const res = await c._figmaApiGet('https://api.figma.com/v1/me', {
      maxRetries: 5,
      tag: 'spec',
    });

    expect(res.status).toBe(200);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(limiter.acquireCount).toBe(1);
    expect(tls.calls.length).toBe(3);
  });

  it('FIGMA_CHANNEL_PROBE=0 ⇒ 完全不探测（软回滚可用）', async () => {
    const { c } = makeConnector({ FIGMA_CHANNEL_PROBE: '0' });
    const tls = fakeTls([{ ok: false, error: 'ECONNRESET' }]);
    c._tlsConnect = tls.fn;
    getMock.mockResolvedValue({ status: 200, data: {} });

    await c._figmaApiGet('https://api.figma.com/v1/me', { maxRetries: 3, tag: 'spec' });

    expect(tls.calls.length).toBe(0);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('代理模式跳过探测（探测目标应是代理，TLS 语义会假阴性）', async () => {
    const { c } = makeConnector();
    c.proxyAgent = { fake: true };
    c._proxyTarget = { host: 'proxy.corp', port: 8080 };
    const tls = fakeTls([{ ok: false, error: 'ECONNRESET' }]);
    c._tlsConnect = tls.fn;
    getMock.mockResolvedValue({ status: 200, data: {} });

    await c._figmaApiGet('https://api.figma.com/v1/me', { maxRetries: 3, tag: 'spec' });

    expect(tls.calls.length).toBe(0);
    expect(getMock).toHaveBeenCalledTimes(1);
    // 决定走代理的通道仍然是 attempt 1（奇数）⇒ 必须带 httpsAgent
    expect(getMock.mock.calls[0][1].httpsAgent).toBe(c.proxyAgent);
  });

  it('预算不足一次最短尝试（<5s）⇒ 立即中止、零请求（防 180s×5 叠爆管线）', async () => {
    const { c, limiter } = makeConnector();
    const tls = fakeTls(okScript);
    c._tlsConnect = tls.fn;

    await expect(
      c._figmaApiGet('https://api.figma.com/v1/files/k/nodes?ids=1:2', {
        maxRetries: 5,
        budgetMs: 4000,
        tag: 'spec',
      }),
    ).rejects.toThrow(/预算耗尽|预算/);

    expect(getMock).not.toHaveBeenCalled();
    expect(limiter.acquireCount).toBe(0);
  });

  it('单次超时被剩余预算收敛（不是无脑用满 timeoutMs）', async () => {
    const { c } = makeConnector();
    const tls = fakeTls(okScript);
    c._tlsConnect = tls.fn;
    getMock.mockResolvedValue({ status: 200, data: {} });

    await c._figmaApiGet('https://api.figma.com/v1/me', {
      maxRetries: 3,
      timeoutMs: 180000,
      budgetMs: 8000,
      tag: 'spec',
    });

    const passedTimeout = getMock.mock.calls[0][1].timeout;
    expect(passedTimeout).toBeLessThanOrEqual(8000);
    expect(passedTimeout).toBeGreaterThan(5000);
  });
});

describe('fetchNodeData · 网络层失败文案按层归因', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FIGMA_RETRY_BASE_MS = '1';
  });

  it('无 HTTP 状态码 ⇒ 文案说「网络层失败」并排除 Token/文件，不再出现「HTTP ?」', async () => {
    const { c } = makeConnector();
    c._tlsConnect = fakeTls(okScript).fn;
    const econn = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    getMock.mockRejectedValue(econn);

    await expect(c.fetchNodeData('FILEKEY', '1-2', 2)).rejects.toThrow(
      /网络层失败[\s\S]*与 Token、权限、Figma 文件无关/,
    );
  });

  it('401 仍走 Token 专属文案（不把鉴权失败误判成网络问题）', async () => {
    const { c } = makeConnector();
    c._tlsConnect = fakeTls(okScript).fn;
    getMock.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401, data: { message: 'Invalid token' } },
      }),
    );

    await expect(c.fetchNodeData('FILEKEY', '1-2', 1)).rejects.toThrow(
      /Figma Token 无效或已过期 \(HTTP 401\)/,
    );
  });
});
