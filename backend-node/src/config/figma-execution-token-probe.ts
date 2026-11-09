/**
 * 执行期 Figma Token —— **引用无命中时的逐槽探测择优**（诉求五 #15）。
 *
 * 为什么需要这一层（承 `figma-credential-ref.ts` 的 #14）：
 *   #14 把取凭证收敛成唯一入口后，引用无命中（token 被删/被改/槽位被覆盖）时仍会
 *   **回落当前 active 槽位并照常执行**。那一步在语义上等于「猜一个凭证继续跑」，而
 *   Figma 对**无权限的文件返回 404（不是 403）**，于是猜错的后果在日志与前端上完全
 *   长成「文件不存在」—— 用户点历史任务看到的仍然是「连不上当时的 Figma」，只是
 *   错误文案从「401」变成了「404」。归因更差，问题没解决。
 *
 * 治本口径（职责分层，单点判断）：
 *   - `figma-credential-ref.ts`：**纯映射**（引用 ↔ 槽位 ↔ token），无网络、无副作用；
 *   - 本模块：只在「引用无命中」这条**兜底路径**上做**一次可验证的选择** ——
 *     拿候选凭证逐个探同一 `fileKey+nodeId`，**首个 200 即用**；
 *   - 探测全部不通 ⇒ `token: null` + `reason: 'probe-failed'`，由调用方抛**可操作**错误。
 *     **禁止**回落 active 静默重跑：凭证问题必须显式暴露，而不是伪装成文件问题。
 *
 * 四条设计红线：
 *   ① **只在兜底路径探测**：引用命中（`source==='ref'`）与首轮生成（`reason==='no-ref'`）
 *      一律零探测 —— 正常链路不为此多付一次 Figma 请求。
 *   ② **探测顺序 = 「本来就会用的那个凭证」优先**：先探 `base.token`，可读即沿用（此时
 *      与旧行为结论一致，只是从「猜的」变成「验过的」）；不可读再按槽位顺序探其余。
 *   ③ **不覆盖任务引用**：探测结论只对**本次执行**生效。任务仍要记住「当时用的那个」，
 *      否则一次探测就把历史证据改写掉，`slot-overwritten` 的归因以后再也做不出来。
 *   ④ **note 永不含 token 明文**：只出现槽位展示名（`Token 2` / `主 Token`）与状态码，
 *      它要进日志、进任务详情、进前端提示。
 */

import {
  describeFigmaCredentialReason,
  isRedactedPlaceholder,
  listFigmaCredentialCandidates,
  resolveExecutionFigmaToken,
  type ExecutionFigmaTokenInput,
  type ExecutionFigmaTokenResult,
  type FigmaCredentialResolveReason,
} from './figma-credential-ref';
import {
  normalizeFigmaTokenSlots,
  pickActiveFigmaTokenSlot,
} from './figma-token-projection';
import {
  createFigmaNodeProber,
  figmaTokenSlotLabel,
  type FigmaAccessProber,
  type FigmaProbeResult,
} from '../lite/figma-access-diagnosis';

/**
 * 需要探测的引用解析原因。
 *
 * `no-ref`（首轮生成/老任务）**不在**此列：那种情况下没有任何「当时」可对照，
 * 当前凭证就是正确语义（见红线 ①）。`matched` 更不必探测。
 */
const NEEDS_PROBE: ReadonlySet<string> = new Set<FigmaCredentialResolveReason>([
  'not-found',
  'slot-overwritten',
  'fingerprint-unusable',
  'no-slots',
]);

/** 单条探测留痕（**不含 token 明文**，可直接进日志/任务详情）。 */
export interface ExecutionFigmaProbeTrace {
  /** 槽位 id；凭证来自请求/环境变量等非槽位来源时为 `null` */
  slotId: string | null;
  /** 展示名（`Token 2` / `主 Token` / `本次请求携带的 Token`） */
  slotLabel: string;
  /** HTTP 状态码；`null` = 网络失败/超时（**不可**判为可读） */
  status: number | null;
  /** 仅 `status===200` 时有意义：目标 nodeId 是否在响应里（审计用，不参与判定） */
  nodeFound: boolean;
  /** 该凭证是否就是「本来会用」的那个（`base.token`） */
  isBaseToken: boolean;
}

export interface ProbeExecutionFigmaTokenInput extends ExecutionFigmaTokenInput {
  /**
   * 目标文件 key。
   *
   * 刻意**不收 figmaUrl**：URL→fileKey/nodeId 的解析在四个调用点各有一份既成事实
   * （`parsed.fileKey` / `fileKey` / `themes[0].fileKey`），本模块再解一遍就是第二份判据。
   * 缺了就返回 `probe-unavailable` 如实留痕，绝不靠猜。
   */
  fileKey?: string | null;
  /** 目标节点 id（`2:7952` 或 `2-7952` 均可，探针自行横杠化） */
  nodeId?: string | null;
  /** 注入式探针（判据必须能用未过滤的原始输入做对照，不得依赖真实网络） */
  probe?: FigmaAccessProber;
  /** 探针超时（默认沿用 `FIGMA_PROBE_TIMEOUT_MS` = 5s） */
  probeTimeoutMs?: number;
  /** 显式关闭探测：关闭后行为与 #14 逐字一致（判据/回放用） */
  disableProbe?: boolean;
}

export interface ProbeExecutionFigmaTokenResult extends ExecutionFigmaTokenResult {
  /** 每条实际发出的探测（未探测时为空数组 —— 判据据此断言「正常链路零额外请求」） */
  probes: ExecutionFigmaProbeTrace[];
}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 探测目标的归一：显式入参，纯 trim，无任何推断。 */
function resolveProbeTarget(input: ProbeExecutionFigmaTokenInput): {
  fileKey: string;
  nodeId: string;
} {
  return {
    fileKey: asTrimmedString(input.fileKey),
    nodeId: asTrimmedString(input.nodeId),
  };
}

/** 状态码 → 一句人话（**只出现状态码，不出现凭证**）。 */
function describeProbeStatus(trace: ExecutionFigmaProbeTrace): string {
  if (trace.status === 200) {
    return trace.nodeFound ? '200（节点存在）' : '200（但响应里没有该节点）';
  }
  if (trace.status === null) return '请求失败/超时';
  return `HTTP ${trace.status}`;
}

/** 非槽位凭证的中性标签（按来源区分，便于在排障日志里认出「这条是打哪来的」）。 */
function nonSlotLabel(source: string): string {
  if (source === 'env') return '环境变量 FIGMA_ACCESS_TOKEN';
  if (source === 'request') return '本次请求携带的 Token';
  return '当前生效的 Token';
}

/**
 * 待探测凭证的**确定性排序**：`base.token` → active 槽位 → 其余槽位 → env。
 *
 * 为什么 base.token 必须排第一：它本来就是这个任务「打算用」的凭证。先探它，
 * 可读即沿用 —— 结论与旧行为一致，只是从「猜的」升级成「验过的」，且只花 1 次请求。
 *
 * 标签口径：若 base.token 本身就是某个槽位的 token，**沿用该槽位的展示名**（不在留痕里
 * 造出两个名字指同一个凭证）；只有它不属于任何槽位（请求携带 / env）时才用中性标签。
 * 去重按 token 值：同一 token 占两个槽位不该发两次请求，也不该在留痕里出现两行。
 */
function orderProbeCandidates(
  input: ProbeExecutionFigmaTokenInput,
  baseToken: string | null,
  baseSource: string,
): Array<{ slotId: string | null; slotLabel: string; token: string; isBaseToken: boolean }> {
  const config = input.activeConfig || {};
  const slots = normalizeFigmaTokenSlots((config as any).figmaTokens).slice(0, 2);
  const active = pickActiveFigmaTokenSlot(config, slots);
  // active 槽排在最前（可用时与旧行为同结论），其余保持槽位原顺序
  const ordered = active ? [active, ...slots.filter((s) => s.id !== active.id)] : slots;

  /** 可探测的 token：非空 **且不是脱敏占位**（占位串发出去只会换来一次无意义的 404）。 */
  const usableToken = (value: unknown): string => {
    const v = asTrimmedString(value);
    return !v || isRedactedPlaceholder(v) ? '' : v;
  };

  const list: Array<{ slotId: string | null; slotLabel: string; token: string }> = ordered.map(
    (slot) => {
      const index = slots.indexOf(slot);
      return {
        slotId: slot.id,
        slotLabel: figmaTokenSlotLabel(slot, index < 0 ? 0 : index),
        token: usableToken(slot.token),
      };
    },
  );

  // 旧配置兜底：没有槽位结构时 `listFigmaCredentialCandidates` 会退到单值 figmaToken
  if (!list.length) {
    for (const candidate of listFigmaCredentialCandidates(config)) {
      if (candidate.slotId === null) {
        list.push({
          slotId: null,
          slotLabel: candidate.slotName || '主 Token',
          token: usableToken(candidate.token),
        });
      }
    }
  }

  const envToken = usableToken(input.envToken);
  if (envToken && envToken !== baseToken) {
    list.push({ slotId: null, slotLabel: '环境变量 FIGMA_ACCESS_TOKEN', token: envToken });
  }

  // base.token 提前：它已在槽位里就把那条挪到最前（保留槽位名），否则补一条中性标签
  const baseValue = usableToken(baseToken);
  const out: Array<{
    slotId: string | null;
    slotLabel: string;
    token: string;
    isBaseToken: boolean;
  }> = [];
  if (baseValue) {
    const at = list.findIndex((item) => item.token === baseValue);
    const head =
      at >= 0
        ? list[at]
        : { slotId: null, slotLabel: nonSlotLabel(baseSource), token: baseValue };
    out.push({ ...head, isBaseToken: true });
  }

  const seen = new Set<string>(out.map((item) => item.token));
  for (const item of list) {
    const value = asTrimmedString(item.token);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ ...item, token: value, isBaseToken: value === baseValue });
  }

  // 兜底：槽位 token 全被剥成空串时不留空候选（否则会拿空 token 发一次请求）
  return out.filter((item) => !!item.token);
}

/**
 * 执行期取 Figma Token（**带探测的唯一入口**，四个调用点一律用这个而不是同步版）。
 *
 * 行为矩阵：
 *   | base 情形                         | 本函数行为                                  |
 *   | --------------------------------- | ------------------------------------------- |
 *   | 引用命中 `source==='ref'`          | 原样返回，**零探测**                        |
 *   | 首轮/老任务 `reason==='no-ref'`    | 原样返回，**零探测**                        |
 *   | 需要探测但缺 fileKey/nodeId         | 原样返回 + `probe-unavailable`（不猜）      |
 *   | 需要探测且有目标、首个 200          | `source` 保持/`probe`，`reason='probe-selected'` |
 *   | 需要探测且全部读不到                | `token=null`，`reason='probe-failed'` ⇒ 调用方抛错 |
 */
export async function resolveExecutionFigmaTokenWithProbe(
  input: ProbeExecutionFigmaTokenInput = {},
): Promise<ProbeExecutionFigmaTokenResult> {
  const base = resolveExecutionFigmaToken(input);
  const untouched = (extra?: Partial<ProbeExecutionFigmaTokenResult>) => ({
    ...base,
    probes: [] as ExecutionFigmaProbeTrace[],
    ...(extra || {}),
  });

  // 红线 ①：引用命中 / 首轮生成 / 显式关闭 —— 都不探测
  if (base.source === 'ref') return untouched();
  if (!NEEDS_PROBE.has(String(base.reason))) return untouched();
  if (input.disableProbe) return untouched();

  const reason = base.reason as FigmaCredentialResolveReason;
  // 文案单一来源：`slot-overwritten` 的「哪个槽位」由 ref 层透传（不在本模块复刻判定）
  const reasonText = describeFigmaCredentialReason(reason, base.ref, base.overwrittenSlotId);

  const { fileKey, nodeId } = resolveProbeTarget(input);
  if (!fileKey || !nodeId) {
    // 目标不明就无从证明「哪个 token 能读」—— 如实留痕，绝不靠猜
    return untouched({
      reason: 'probe-unavailable',
      note:
        `${reasonText}；本次拿不到 fileKey/nodeId（${!fileKey ? '缺 fileKey' : '缺 nodeId'}），` +
        `无法逐槽探测该文件，按当前凭证执行`,
    });
  }

  const candidates = orderProbeCandidates(input, base.token, base.source);
  if (!candidates.length) {
    // 一个凭证都没有：base 已在 note 里说明（`no-slots`），调用方按「未配置」报错
    return untouched();
  }

  const probe = input.probe || createFigmaNodeProber({ timeoutMs: input.probeTimeoutMs });
  const probes: ExecutionFigmaProbeTrace[] = [];

  for (const candidate of candidates) {
    let result: FigmaProbeResult = { status: null, nodeFound: false };
    try {
      result = await probe(candidate.token, fileKey, nodeId);
    } catch {
      // 探针自身异常只降级为「这条读不到」，绝不把取凭证打成崩溃
      result = { status: null, nodeFound: false };
    }
    const trace: ExecutionFigmaProbeTrace = {
      slotId: candidate.slotId,
      slotLabel: candidate.slotLabel,
      status: result.status,
      nodeFound: result.nodeFound,
      isBaseToken: candidate.isBaseToken,
    };
    probes.push(trace);

    // 候选判据单一来源：HTTP 200 = 该凭证能读到这个文件（与 figma-access-diagnosis 同口径）
    if (result.status !== 200) continue;

    return {
      token: candidate.token,
      // base 本来就会用这个凭证时保留其来源（request/active/env），只在「换了槽位」时标 probe
      source: candidate.isBaseToken ? base.source : 'probe',
      reason: 'probe-selected',
      ref: base.ref,
      refSource: base.refSource,
      requestOverridden: base.requestOverridden,
      note: candidate.isBaseToken
        ? `${reasonText}；已探测确认 Token「${candidate.slotLabel}」可读取该文件（fileKey ${fileKey}，节点 ${nodeId}），沿用该 Token 执行`
        : `${reasonText}；逐槽探测发现 Token「${candidate.slotLabel}」可读取该文件（fileKey ${fileKey}，节点 ${nodeId}），本次已改用该 Token 执行（不修改你的配置）`,
      // 红线 ③：探测结论只对本次执行生效，任务引用保持原样
      refFields: null,
      probes,
    };
  }

  // 红线 ②：全不通 ⇒ 显式失败。**不**回落 active 静默重跑。
  const summary = probes
    .map((t) => `${t.slotLabel}=${describeProbeStatus(t)}`)
    .join('，');
  return {
    token: null,
    source: 'none',
    reason: 'probe-failed',
    ref: base.ref,
    refSource: base.refSource,
    requestOverridden: base.requestOverridden,
    note:
      `${reasonText}；已对 ${probes.length} 个 Figma Token 逐个探测该文件` +
      `（fileKey ${fileKey}，节点 ${nodeId}），全部读不到：${summary}。` +
      `Figma 对「无权限」的文件同样返回 404（不是 403），所以这并不证明文件已被删除。` +
      `请先在 Figma 里把该文件分享给这些 Token 所属的账号，或到「设置 → Figma Token」` +
      `换一个能读取该文件的 Token 后重试`,
    refFields: null,
    probes,
  };
}
