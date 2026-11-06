/**
 * Figma 404 归因 —— 「当前 Token 无权访问该文件」与「文件/节点真的不存在」的区分。
 *
 * 背景（2026-11-06 实锤，本地 mv-lite-1793918470236-d1f6b29d）：
 *   Figma 对**无权限的文件同样返回 404（不是 403）**，而 `FigmaConnector.fetchNodeData`
 *   只把状态码透传成 `Figma API 错误 (HTTP 404): Not found`。于是「激活的 Figma Token
 *   属于另一个 Figma 账号」这类**本端配置问题**，在日志与前端上完全长成「文件不存在」，
 *   排查会一路跑偏到 fileKey、节点被删、路由 404。
 *   实测该用户两个槽位各持一个 Figma 账号（zq / smigoo），各只能读一个文件，
 *   激活的恰好没有本次文件的权限 —— 而两个 Token 的 `/v1/me` 都是 200 有效。
 *
 * 治本口径（职责分层，不重复判定）：
 *   - `figma-connector.js`：只陈述**事实**（文件或节点不存在，或当前 Token 无权访问）
 *     —— 它不知道用户有几个 Token、哪个可用，不该猜。
 *   - 本模块：在 404 **之后**做**可操作归因** —— 拿该用户其余 Token 槽位去探同一
 *     fileKey+nodeId，探通即给出「切到哪个槽位」的明确建议；全探不通才回落
 *     「请确认文件未被删除/移动，或为该账号开通权限」。
 *   - 命中候选后再解析一次该 Token 的 Figma 账号 handle（`/v1/me`），让提示能说清
 *     「是哪个账号」—— 因为槽位名可能是历史物化留下的默认名（实测就是「主 Token」），
 *     只报槽位名仍指不清人。**账号解析失败只降级、不影响候选成立**。
 *
 * 两条设计红线：
 *   ① 探针与账号解析**只在 404 失败路径**上跑 —— 正常升级不为此多付 Figma 请求；
 *      且账号解析只对**胜出的那一个**候选做（无候选时零额外请求）。
 *   ② 探针与账号解析**可注入** —— 判据必须能用未过滤的原始输入做阳性/阴性对照（见 spec），
 *      不得依赖真实 Figma 网络（真实网络会把「判据对不对」和「网通不通」混为一谈）。
 */

import {
  MAX_FIGMA_TOKENS,
  normalizeFigmaTokenSlots,
  pickActiveFigmaTokenSlot,
  type FigmaTokenSlot,
} from '../config/figma-token-projection';

/** 单次探针超时。404 补救路径，不值得为它把接口拖长，5s 封顶。 */
export const FIGMA_PROBE_TIMEOUT_MS = 5_000;

/** Figma REST 基址（探针与 `figma-connector.js` 同源，切勿各写一份）。 */
export const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * 探针返回：`status` 为 HTTP 状态码，`null` = 网络失败/超时（**不可**判为可读）。
 * `nodeFound` 仅 `status===200` 时有意义：目标 nodeId 是否出现在 `nodes` 里
 * （`depth=1` 仍会带上该键，实测 3.5KB / 137KB，用作审计留痕，不参与候选判定）。
 */
export interface FigmaProbeResult {
  status: number | null;
  nodeFound: boolean;
}

/** 注入式探针：给定 token 与目标，返回该 token 能否读到（见 FigmaProbeResult）。 */
export type FigmaAccessProber = (
  token: string,
  fileKey: string,
  nodeId: string,
) => Promise<FigmaProbeResult>;

/**
 * 注入式账号解析：token → Figma handle（仅用于让提示「说的是哪个人」）。
 * 为什么需要：槽位名可以是历史物化留下的默认名（实测该用户的可读槽位名就是「主 Token」），
 * 只说「切到主 Token」仍然指不清是哪个人；带上账号 handle 才是一句话能照做的指令。
 */
export type FigmaAccountResolver = (token: string) => Promise<string | null>;

export interface FigmaAccessProbeRecord {
  slotId: string;
  slotLabel: string;
  status: number | null;
  nodeFound: boolean;
}

export interface FigmaAccessDiagnosis {
  /** 404 归一后的语义标签（供落库/埋点区分，不依赖中文文案） */
  kind: 'figma-not-found';
  fileKey: string;
  nodeId: string;
  activeSlotId: string;
  activeSlotLabel: string;
  /** 探通该文件的其它槽位 id（按槽位顺序，最多 MAX_FIGMA_TOKENS-1 个） */
  candidateSlotIds: string[];
  candidateSlotLabels: string[];
  /** 与 candidateSlotIds 对齐的 Figma 账号 handle（解析失败为 null，不参与判定） */
  candidateAccounts: Array<string | null>;
  /** 每个被探测槽位的原始状态码（审计用；**不含 token 明文**） */
  probes: FigmaAccessProbeRecord[];
  /** 面向用户的可操作文案（含 fileKey/nodeId 以便对照） */
  message: string;
}

/**
 * 判据（单一来源）：`FigmaConnector` 在抛错时把响应状态挂在 `error.figStatus`。
 * 刻意**不**用 `/HTTP 404/` 正则兜底 —— 文案是给人看的、随时会改，用文案当判据
 * 等于让判据随文案漂移；没有结构化状态码就无法断定是 404，一律不诊断、原样透传。
 */
export function isFigmaNotFoundError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as any).figStatus === 404;
}

/** 槽位展示名：有名字用名字，否则用 `Token N`（索引从 1 起，与配置面板同口径）。 */
export function figmaTokenSlotLabel(
  slot: Pick<FigmaTokenSlot, 'name'> | null | undefined,
  index: number,
): string {
  const name = typeof slot?.name === 'string' ? slot.name.trim() : '';
  return name || `Token ${index + 1}`;
}

/**
 * 生产探针：直连 `/v1/files/:key/nodes?ids=...&depth=1`。
 * - `depth=1` 把响应从 ~137KB 压到 ~3.5KB，且仍返回目标节点键（实测 2026-11-06）；
 * - 只取状态码与「节点在不在」，**不落 token、不落响应体**；
 * - 任何异常（超时 / TLS / DNS）统一归 `status:null`，绝不冒充「可读」。
 */
export function createFigmaNodeProber(
  options: { timeoutMs?: number; baseUrl?: string } = {},
): FigmaAccessProber {
  const timeoutMs =
    Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FIGMA_PROBE_TIMEOUT_MS;
  const baseUrl = (options.baseUrl || FIGMA_API_BASE).replace(/\/+$/, '');
  return async (token, fileKey, nodeId) => {
    if (!token || !fileKey || !nodeId) return { status: null, nodeFound: false };
    const url =
      `${baseUrl}/files/${encodeURIComponent(fileKey)}/nodes` +
      `?ids=${encodeURIComponent(nodeId)}&depth=1`;
    try {
      const res = await fetch(url, {
        headers: { 'X-Figma-Token': token },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status !== 200) {
        // 非 200 时 body 是错误对象（很小），读掉以释放连接
        try {
          await res.text();
        } catch {
          /* 忽略：探针只要状态码 */
        }
        return { status: res.status, nodeFound: false };
      }
      const payload: any = await res.json();
      const nodes = payload?.nodes && typeof payload.nodes === 'object' ? payload.nodes : {};
      // Figma 的 nodes 键是「横杠化」的 apiNodeId（43:4782 → 43-4782）
      const apiNodeId = String(nodeId).replace(/:/g, '-');
      const nodeFound = !!nodes[apiNodeId] || !!nodes[String(nodeId)];
      return { status: 200, nodeFound };
    } catch {
      return { status: null, nodeFound: false };
    }
  };
}

/**
 * 生产账号解析：直连 `/v1/me`，取 Figma handle（如 `zq` / `smigoo`）。
 *
 * 只用于**让提示指明是哪个账号**，不参与候选判定 —— 所以失败一律 `null`（降级），
 * 绝不让一次 `/v1/me` 抖动把「已探通的候选」降级成「无候选」。
 * 仅对胜出的那一个候选调用（在 404 补救路径上，最多再 +1 次请求），不遍历全槽位。
 */
export function createFigmaAccountResolver(
  options: { timeoutMs?: number; baseUrl?: string } = {},
): FigmaAccountResolver {
  const timeoutMs =
    Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FIGMA_PROBE_TIMEOUT_MS;
  const baseUrl = (options.baseUrl || FIGMA_API_BASE).replace(/\/+$/, '');
  return async (token) => {
    if (!token) return null;
    try {
      const res = await fetch(`${baseUrl}/me`, {
        headers: { 'X-Figma-Token': token },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status !== 200) {
        try {
          await res.text();
        } catch {
          /* 忽略：只要 handle */
        }
        return null;
      }
      const payload: any = await res.json();
      const handle = payload?.handle;
      return typeof handle === 'string' && handle.trim() ? handle.trim() : null;
    } catch {
      return null;
    }
  };
}

export interface DiagnoseFigmaNotFoundOptions {
  fileKey: string;
  nodeId: string;
  /** 合并后的 AI 配置（`getMergedAiConfig` 的返回值：含 figmaTokens / activeFigmaTokenId） */
  config?: Record<string, any> | null;
  /** 默认用 createFigmaNodeProber()；spec 注入假探针做对照 */
  probe?: FigmaAccessProber;
  /** 默认用 createFigmaAccountResolver()；spec 注入假解析器做对照（也可传 () => Promise.resolve(null) 关闭） */
  resolveAccount?: FigmaAccountResolver;
}

/**
 * 404 归因主入口：探测「除激活槽位以外」的槽位能否读到同一 fileKey+nodeId。
 *
 * 只探测 `MAX_FIGMA_TOKENS - 1` 个（当前口径最多 2 个槽位 ⇒ 至多 1 次请求），
 * 逐个顺序探测、**首个探通即停止**（后面的不必要再花流量）。
 * 命中候选后**只为它**解析一次账号 handle（再无候选时零额外请求）。
 * 任何探针/解析异常都不抛出 —— 归因失败只能降级为「无法判断」，不能把升级失败变成崩溃。
 */
export async function diagnoseFigmaNotFoundAccess(
  options: DiagnoseFigmaNotFoundOptions,
): Promise<FigmaAccessDiagnosis> {
  const fileKey = String(options.fileKey || '');
  const nodeId = String(options.nodeId || '');
  const config = options.config || {};
  const probe = options.probe || createFigmaNodeProber();
  const resolveAccount = options.resolveAccount || createFigmaAccountResolver();

  const slots = normalizeFigmaTokenSlots((config as any).figmaTokens).slice(
    0,
    MAX_FIGMA_TOKENS,
  );
  const active = pickActiveFigmaTokenSlot(config, slots);
  const activeIndex = active ? slots.findIndex((s) => s.id === active.id) : -1;
  const activeSlotId = active?.id || '';
  const activeSlotLabel = active
    ? figmaTokenSlotLabel(active, activeIndex < 0 ? 0 : activeIndex)
    : // 无槽位结构的旧配置：只有单值 figmaToken，面板里它的名字就是「主 Token」
      '主 Token';

  const others = slots.filter((s) => s.id !== activeSlotId);
  const probes: FigmaAccessProbeRecord[] = [];
  const candidateSlotIds: string[] = [];
  const candidateSlotLabels: string[] = [];
  const candidateAccounts: Array<string | null> = [];

  for (let i = 0; i < others.length; i += 1) {
    const slot = others[i];
    // 槽位序号要在**全量槽位**里的位置，否则提示的「Token 2」会和面板对不上
    const label = figmaTokenSlotLabel(slot, slots.indexOf(slot));
    let result: FigmaProbeResult = { status: null, nodeFound: false };
    try {
      result = await probe(slot.token as string, fileKey, nodeId);
    } catch {
      result = { status: null, nodeFound: false };
    }
    probes.push({
      slotId: slot.id,
      slotLabel: label,
      status: result.status,
      nodeFound: result.nodeFound,
    });
    // 候选判据单一来源：HTTP 200 = 该 token 能读到这个文件
    if (result.status === 200) {
      // 解析账号 handle：**仅用于文案**，失败降级为 null，绝不影响候选成立与否
      let account: string | null = null;
      try {
        account = await resolveAccount(slot.token as string);
      } catch {
        account = null;
      }
      candidateSlotIds.push(slot.id);
      candidateSlotLabels.push(label);
      candidateAccounts.push(account);
      break; // 首个可用候选即可给出建议，不必再花流量
    }
  }

  const candidateAccount = candidateAccounts[0] || null;
  const candidateHint = candidateSlotLabels[0]
    ? `检测到 Token「${candidateSlotLabels[0]}」${
        candidateAccount ? `（Figma 账号 ${candidateAccount}）` : ''
      }可以读取该文件，请在「设置 → Figma Token」里切换到它后重试。`
    : '';

  const message =
    candidateSlotLabels.length > 0
      ? `当前激活的 Figma Token「${activeSlotLabel}」无法访问该文件（fileKey ${fileKey}，节点 ${nodeId}）。` +
        `Figma 对「无权限」的文件也返回 404（不是 403），所以这不是文件已删除的证据。` +
        candidateHint
      : `当前激活的 Figma Token「${activeSlotLabel}」无法访问该文件（fileKey ${fileKey}，节点 ${nodeId}）。` +
        `Figma 对「无权限」的文件也返回 404（不是 403），所以这不是文件已删除的证据。` +
        `其它 Token 同样无法读取：请先确认该文件未被删除或移动；若文件仍在，` +
        `请为当前 Token 所属的 Figma 账号开通此文件权限（在 Figma 里把文件分享给该账号），或换一个能读该文件的 Token。`;

  return {
    kind: 'figma-not-found',
    fileKey,
    nodeId,
    activeSlotId,
    activeSlotLabel,
    candidateSlotIds,
    candidateSlotLabels,
    candidateAccounts,
    probes,
    message,
  };
}