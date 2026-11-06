import {
  createFigmaAccountResolver,
  createFigmaNodeProber,
  diagnoseFigmaNotFoundAccess,
  figmaTokenSlotLabel,
  isFigmaNotFoundError,
  type FigmaAccessProber,
  type FigmaProbeResult,
} from './figma-access-diagnosis';

/**
 * Figma 404 归因判据（2026-11-06）。
 *
 * 为什么要有这份 spec：本次线上「素材升级 400」的真因是**激活 Token 换了 Figma 账号**
 * （zq 的 token 能读该文件、smigoo 的 token 404），但 Figma 对无权限文件返回 404，
 * 表现与「文件被删」完全相同。归因逻辑一旦写错，会把用户往「文件不存在」的死路带，
 * 所以每条判据都必须能用**未过滤的原始输入**复现（阳性对照），并且能证明
 * 「不该触发时不触发」（阴性对照）。
 *
 * 判据分四组：
 *  A. 触发闸门 `isFigmaNotFoundError` —— 只认结构化 figStatus，不认文案正则；
 *  B. 归因结论 —— 候选探通 / 全不通 两条分支各自的输出与文案（含账号 handle）；
 *  C. 成本与安全—— 只探 MAX-1 个、首次探通即停、探针异常不冒充可读、不留 token 明文、
 *     账号解析失败不影响候选成立；
 *  D. 生产请求形状 —— 节点探针的 URL 编码/depth=1/非 200 透传，
 *     以及账号解析器 `/v1/me` 的 URL/header/降级。
 */
describe('Figma 404 归因（figma-access-diagnosis）', () => {
  const FILE_KEY = 'GTcJm0DKQvcJvcOZTh5n1l';
  const NODE_ID = '43:4782';

  /**
   * 默认注入「不联网」的账号解析器：单测绝不能依赖真实 Figma 网络
   * （真实网络会把「判据对不对」和「网通不通」混为一谈）。
   */
  const noAccount = async () => null;

  /** 统一入口：默认把账号解析短路成 null，需要时再覆盖 */
  const diagnose = (opts: Parameters<typeof diagnoseFigmaNotFoundAccess>[0]) =>
    diagnoseFigmaNotFoundAccess({ resolveAccount: noAccount, ...opts });

  /** 构造一份「两个槽位、激活第 2 个」的用户配置（与线上实测形态一致） */
  const twoSlots = (activeId = 'slot-b') => ({
    figmaTokens: [
      { id: 'slot-a', name: 'zq', token: 'token-of-zq' },
      { id: 'slot-b', name: 'smigoo', token: 'token-of-smigoo' },
    ],
    activeFigmaTokenId: activeId,
    figmaToken: activeId === 'slot-a' ? 'token-of-zq' : 'token-of-smigoo',
  });

  /** 假探针：按 token 给出预设结果，并记录调用参数 */
  const makeProber = (byToken: Record<string, FigmaProbeResult>) => {
    const calls: Array<{ token: string; fileKey: string; nodeId: string }> = [];
    const prober: FigmaAccessProber = async (token, fileKey, nodeId) => {
      calls.push({ token, fileKey, nodeId });
      return byToken[token] || { status: null, nodeFound: false };
    };
    return { prober, calls };
  };

  describe('A. 触发闸门', () => {
    it('阳性对照：figStatus=404 才触发', () => {
      expect(isFigmaNotFoundError({ figStatus: 404 })).toBe(true);
      const err: any = new Error('Figma API 错误 (HTTP 404): Not found');
      err.figStatus = 404;
      expect(isFigmaNotFoundError(err)).toBe(true);
    });

    it('阴性对照：403 / 500 / 无状态码一律不触发（401-403 是 token 本身失效，另有文案）', () => {
      expect(isFigmaNotFoundError({ figStatus: 403 })).toBe(false);
      expect(isFigmaNotFoundError({ figStatus: 401 })).toBe(false);
      expect(isFigmaNotFoundError({ figStatus: 500 })).toBe(false);
      expect(isFigmaNotFoundError({ figStatus: undefined })).toBe(false);
      expect(isFigmaNotFoundError(null)).toBe(false);
      expect(isFigmaNotFoundError(undefined)).toBe(false);
      expect(isFigmaNotFoundError('Figma API 错误 (HTTP 404): Not found')).toBe(false);
      // 🔴 判据刻意不看文案：光有 "HTTP 404" 字样、没有结构化状态码，不足以断定是 404
      //    （否则文案一改判据就静默失效，且会误伤「网络层失败」这类同含数字的错误）
      expect(
        isFigmaNotFoundError(new Error('Figma API 错误 (HTTP 404): Not found')),
      ).toBe(false);
    });
  });

  describe('B. 归因结论', () => {
    it('阳性对照：其它槽位能读该文件 ⇒ 明确指名可切换的槽位', async () => {
      const { prober, calls } = makeProber({
        'token-of-zq': { status: 200, nodeFound: true },
      });
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
      });

      expect(d.kind).toBe('figma-not-found');
      expect(d.activeSlotId).toBe('slot-b');
      expect(d.activeSlotLabel).toBe('smigoo');
      expect(d.candidateSlotIds).toEqual(['slot-a']);
      expect(d.candidateSlotLabels).toEqual(['zq']);
      // 账号解析被短路成 null ⇒ 不许凭空编造账号名
      expect(d.candidateAccounts).toEqual([null]);
      expect(d.message).not.toContain('Figma 账号');
      // 文案必须同时给出「为什么是 404」和「下一步点哪里」，否则等于没说
      expect(d.message).toContain('smigoo');
      expect(d.message).toContain('zq');
      expect(d.message).toContain('404');
      expect(d.message).toContain('403');
      expect(d.message).toContain('设置 → Figma Token');
      // 探的必须是同一个 fileKey/nodeId（错标目标 = 结论无效）
      expect(calls).toEqual([
        { token: 'token-of-zq', fileKey: FILE_KEY, nodeId: NODE_ID },
      ]);
    });

    it('阳性对照：解析出账号 handle ⇒ 文案带上「Figma 账号 zq」，槽位名歧义时也能照做', async () => {
      const { prober } = makeProber({
        'token-of-zq': { status: 200, nodeFound: true },
      });
      // 真实形态：历史物化留下的槽位名是默认名「主 Token」，光看名字不知道是谁
      const config = {
        figmaTokens: [
          { id: 'figma-1', name: '主 Token', token: 'token-of-zq' },
          { id: 'slot-b', name: 'smigoo', token: 'token-of-smigoo' },
        ],
        activeFigmaTokenId: 'slot-b',
      };
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config,
        probe: prober,
        resolveAccount: async (token) => (token === 'token-of-zq' ? 'zq' : null),
      });

      expect(d.candidateSlotIds).toEqual(['figma-1']);
      expect(d.candidateSlotLabels).toEqual(['主 Token']);
      expect(d.candidateAccounts).toEqual(['zq']);
      expect(d.message).toContain('主 Token');
      expect(d.message).toContain('Figma 账号 zq');
    });

    it('阴性对照：账号解析失败 ⇒ 候选照样成立，只是不带账号名（不可因网抖动丢候选）', async () => {
      const { prober } = makeProber({
        'token-of-zq': { status: 200, nodeFound: true },
      });
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
        resolveAccount: async () => {
          throw new Error('ECONNRESET');
        },
      });

      expect(d.candidateSlotIds).toEqual(['slot-a']);
      expect(d.candidateAccounts).toEqual([null]);
      expect(d.message).toContain('检测到 Token「zq」');
      expect(d.message).not.toContain('Figma 账号');
    });

    it('候选才解析账号：无候选时不多打一次 /v1/me', async () => {
      let accountCalls = 0;
      const { prober } = makeProber({
        'token-of-zq': { status: 404, nodeFound: false },
      });
      await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
        resolveAccount: async () => {
          accountCalls += 1;
          return 'zq';
        },
      });
      expect(accountCalls).toBe(0);
    });

    it('阴性对照：其它槽位也 404 ⇒ 不得谎称「有可用 Token」，改为文件/权限二选一指引', async () => {
      const { prober } = makeProber({
        'token-of-zq': { status: 404, nodeFound: false },
      });
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
      });

      expect(d.candidateSlotIds).toEqual([]);
      expect(d.candidateSlotLabels).toEqual([]);
      expect(d.message).not.toContain('可以读取该文件');
      expect(d.message).toContain('未被删除或移动');
      expect(d.message).toContain('开通此文件权限');
    });

    it('旧配置（只有单值 figmaToken，无槽位）⇒ 不崩，按「主 Token」表述、无候选', async () => {
      const { prober, calls } = makeProber({});
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: { figmaToken: 'legacy-token' },
        probe: prober,
      });

      expect(d.activeSlotId).toBe('');
      expect(d.activeSlotLabel).toBe('主 Token');
      expect(d.candidateSlotIds).toEqual([]);
      expect(calls).toEqual([]); // 没有其它槽位可探
    });

    it('config 缺失 ⇒ 不抛异常（归因失败只能降级，不能把升级失败变成崩溃）', async () => {
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: null,
        probe: makeProber({}).prober,
      });
      expect(d.kind).toBe('figma-not-found');
      expect(d.message).toContain('主 Token');
    });

    it('文案带上 fileKey 与 nodeId，便于用户对照到底是哪个文件', async () => {
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: makeProber({}).prober,
      });
      expect(d.message).toContain(FILE_KEY);
      expect(d.message).toContain(NODE_ID);
    });
  });

  describe('C. 成本与安全', () => {
    it('槽位上限 2 ⇒ 至多探 1 次（不因槽位数量放大 Figma 请求）', async () => {
      const { prober, calls } = makeProber({});
      await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        // 故意塞 3 个槽位：归一化后应被裁到 2，且只探「非激活」那 1 个
        config: {
          figmaTokens: [
            { id: 's1', name: 'a', token: 't1' },
            { id: 's2', name: 'b', token: 't2' },
            { id: 's3', name: 'c', token: 't3' },
          ],
          activeFigmaTokenId: 's1',
        },
        probe: prober,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].token).toBe('t2');
    });

    it('首次探通即停：不会为了「更全」继续探后面的槽位', async () => {
      const { prober, calls } = makeProber({
        'token-of-zq': { status: 200, nodeFound: true },
      });
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
      });
      expect(calls).toHaveLength(1);
      expect(d.candidateSlotIds).toHaveLength(1);
    });

    it('探针抛异常 / 超时（null）⇒ 记为不可用，绝不冒充可读', async () => {
      const thrower: FigmaAccessProber = async () => {
        throw new Error('ECONNRESET');
      };
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: thrower,
      });
      expect(d.candidateSlotIds).toEqual([]);
      expect(d.probes).toHaveLength(1);
      expect(d.probes[0].status).toBeNull();
      // 负数对照：200 之外的任何状态都不算候选
      for (const status of [401, 403, 404, 500, 0, null]) {
        const probe: FigmaAccessProber = async () => ({ status, nodeFound: true });
        const dd = await diagnose({
          fileKey: FILE_KEY,
          nodeId: NODE_ID,
          config: twoSlots('slot-b'),
          probe,
        });
        expect(dd.candidateSlotIds).toEqual([]);
      }
    });

    it('审计记录不含 token 明文（probes 会被落进 task.result，不能泄密）', async () => {
      const { prober } = makeProber({
        'token-of-zq': { status: 404, nodeFound: false },
      });
      const d = await diagnose({
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        config: twoSlots('slot-b'),
        probe: prober,
      });
      const dump = JSON.stringify(d);
      expect(dump).not.toContain('token-of-zq');
      expect(dump).not.toContain('token-of-smigoo');
      expect(dump).toContain('slot-a');
      expect(dump).toContain('slot-b');
    });

    it('槽位展示名：有名字用名字，无名字回落 Token N（索引与面板同口径，从 1 起）', () => {
      expect(figmaTokenSlotLabel({ name: 'zq' }, 0)).toBe('zq');
      expect(figmaTokenSlotLabel({ name: '  ' }, 0)).toBe('Token 1');
      expect(figmaTokenSlotLabel({}, 1)).toBe('Token 2');
      expect(figmaTokenSlotLabel(null, 1)).toBe('Token 2');
    });
  });

  describe('D. 生产请求形状（节点探针 + 账号解析）', () => {
    const originalFetch = (globalThis as any).fetch;
    afterEach(() => {
      (globalThis as any).fetch = originalFetch;
    });

    it('URL 带编码后的 fileKey/nodeId 与 depth=1，header 携 token', async () => {
      const seen: any = {};
      (globalThis as any).fetch = async (url: string, init: any) => {
        seen.url = url;
        seen.headers = init.headers;
        return {
          status: 200,
          json: async () => ({ nodes: { '43-4782': { document: {} } } }),
        };
      };
      const probe = createFigmaNodeProber();
      const r = await probe('tok-123', FILE_KEY, NODE_ID);

      expect(seen.url).toBe(
        `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(NODE_ID)}&depth=1`,
      );
      expect(seen.headers['X-Figma-Token']).toBe('tok-123');
      expect(r.status).toBe(200);
      expect(r.nodeFound).toBe(true);
    });

    it('nodes 里没有目标键 ⇒ nodeFound=false（但仍算「文件可读」）', async () => {
      (globalThis as any).fetch = async () => ({
        status: 200,
        json: async () => ({ nodes: {} }),
      });
      const r = await createFigmaNodeProber()('tok', FILE_KEY, NODE_ID);
      expect(r.status).toBe(200);
      expect(r.nodeFound).toBe(false);
    });

    it('非 200 原样透传状态码（404 就是 404，不被吞成 true/false）', async () => {
      (globalThis as any).fetch = async () => ({
        status: 404,
        text: async () => '{"err":"Not found"}',
      });
      const r = await createFigmaNodeProber()('tok', FILE_KEY, NODE_ID);
      expect(r.status).toBe(404);
      expect(r.nodeFound).toBe(false);
    });

    it('网络异常 ⇒ status=null（不可判为可读）', async () => {
      (globalThis as any).fetch = async () => {
        throw new Error('timeout');
      };
      const r = await createFigmaNodeProber()('tok', FILE_KEY, NODE_ID);
      expect(r.status).toBeNull();
      expect(r.nodeFound).toBe(false);
    });

    it('token/fileKey/nodeId 任一为空 ⇒ 直接 null，不发请求', async () => {
      let called = 0;
      (globalThis as any).fetch = async () => {
        called += 1;
        return { status: 200, json: async () => ({}) };
      };
      const probe = createFigmaNodeProber();
      expect((await probe('', FILE_KEY, NODE_ID)).status).toBeNull();
      expect((await probe('tok', '', NODE_ID)).status).toBeNull();
      expect((await probe('tok', FILE_KEY, '')).status).toBeNull();
      expect(called).toBe(0);
    });

    it('账号解析器：打 /v1/me、携 token，取 payload.handle', async () => {
      const seen: any = {};
      (globalThis as any).fetch = async (url: string, init: any) => {
        seen.url = url;
        seen.headers = init.headers;
        return { status: 200, json: async () => ({ handle: 'zq', id: '1' }) };
      };
      const resolveAccount = createFigmaAccountResolver();
      expect(await resolveAccount('tok-123')).toBe('zq');
      expect(seen.url).toBe('https://api.figma.com/v1/me');
      expect(seen.headers['X-Figma-Token']).toBe('tok-123');
    });

    it('账号解析器：非 200 / 无 handle / 网络异常 / 空 token ⇒ 一律 null（不参与判定）', async () => {
      const resolveAccount = createFigmaAccountResolver();
      (globalThis as any).fetch = async () => ({ status: 403, text: async () => 'nope' });
      expect(await resolveAccount('tok')).toBeNull();
      (globalThis as any).fetch = async () => ({ status: 200, json: async () => ({}) });
      expect(await resolveAccount('tok')).toBeNull();
      (globalThis as any).fetch = async () => ({ status: 200, json: async () => ({ handle: '   ' }) });
      expect(await resolveAccount('tok')).toBeNull();
      (globalThis as any).fetch = async () => {
        throw new Error('timeout');
      };
      expect(await resolveAccount('tok')).toBeNull();
      let called = 0;
      (globalThis as any).fetch = async () => {
        called += 1;
        return { status: 200, json: async () => ({ handle: 'zq' }) };
      };
      expect(await resolveAccount('')).toBeNull();
      expect(called).toBe(0);
    });
  });
});