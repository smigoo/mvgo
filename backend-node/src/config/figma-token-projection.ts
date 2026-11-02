/**
 * Figma 多 Token（每用户最多 2 个、手动选一个生效）—— 存储 ↔ 单值读取的投影层。
 * 2026-11-02
 *
 * 背景：Figma Access Token 原本是单值 `figmaToken`，全仓 109 处读取点（27 个后端文件）
 * 直读这个字段。改「一人多 token」时若逐点改读数组，任一处漏改就是隐性故障
 * （拿不到 token / 拿到错的 token），且未来新增读取点还会漏。故采用与
 * `providers` / `models` 完全同构的降维范式：
 *
 *   - 存储：`figmaTokens[]` + `activeFigmaTokenId` 存外层
 *     （MongoDB `user_ai_configs.configEnc` 是整份 blob 加密，加数组无需迁移、无需新表）；
 *   - 读取：任何出口先用 `applyFigmaTokenProjection` 投影回单值 `figmaToken`，
 *     语义恒为「当前生效的那个 token」，下游 109 处零改动；
 *   - 面板：`materializeFigmaTokenSlots` 把历史单值落成第 1 号槽位，保证读写对称
 *     （否则老用户打开面板看到空槽位，一保存就把 token 抹了）。
 *
 * 判据（`figma-token-projection.spec.ts`）：
 *   ① active 命中 → 投影它的 token；
 *   ② active 缺失 / 悬空 / 指向空槽位 → 确定性回落第一个有值槽位；
 *   ③ `figmaTokens` 全空 → 保留既有单值（旧配置零漂移）；
 *   ④ 幂等（同输入同输出）+ 上限 2 的硬约束。
 */

/** 每人上限（产品口径：2 个；前端只渲染 2 个槽位，后端 schema 也拒第 3 个）。 */
export const MAX_FIGMA_TOKENS = 2;

/** 历史单值 `figmaToken` 物化成槽位时使用的确定性 id（幂等，不随会话变化）。 */
export const LEGACY_FIGMA_TOKEN_SLOT_ID = 'figma-1';

export interface FigmaTokenSlot {
  id: string;
  name?: string;
  token?: string;
}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 槽位是否「可用」：必须有非空 token。纯名字不算 —— 否则一个刚建好还没填 token 的
 * 空槽位会遮住后面那个真正可用的 token，把生成链路打成 401。
 */
export function isUsableFigmaTokenSlot(value: unknown): value is FigmaTokenSlot {
  const v = value as any;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.token === 'string' &&
    v.token.trim().length > 0
  );
}

/**
 * 严格归一（供读取投影用）：丢掉非对象 / 无 id / 无 token / id 重复的条目，保持原顺序。
 * 确定性：同输入必同输出（不依赖时间、不依赖 Map 迭代以外的任何状态）。
 */
export function normalizeFigmaTokenSlots(value: unknown): FigmaTokenSlot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FigmaTokenSlot[] = [];
  for (const raw of value) {
    if (!isUsableFigmaTokenSlot(raw)) continue;
    const id = asTrimmedString((raw as any).id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      ...(asTrimmedString((raw as any).name) ? { name: asTrimmedString((raw as any).name) } : {}),
      token: (raw as any).token.trim(),
    });
    if (out.length >= MAX_FIGMA_TOKENS) break;
  }
  return out;
}

/**
 * 选出当前生效槽位：`activeFigmaTokenId` 命中者优先，否则第一个可用槽位。
 * 取「第一个有值」而非「第一个」是为了容错 —— 槽位 1 被清空后不会把整条链路打成空 token。
 */
export function pickActiveFigmaTokenSlot(
  config: Record<string, any> | null | undefined,
  slots: FigmaTokenSlot[],
): FigmaTokenSlot | null {
  if (!slots.length) return null;
  const activeId = asTrimmedString(config?.activeFigmaTokenId);
  return slots.find((s) => s.id === activeId) || slots[0];
}

/**
 * 多值 → 单值投影（读取侧唯一出口，幂等）。
 * `figmaTokens` 全空时**原样返回**，让历史单值 `figmaToken` 继续生效（旧配置零漂移）。
 */
export function applyFigmaTokenProjection<T extends Record<string, any>>(config: T): T {
  const cfg: Record<string, any> = { ...(config || {}) };
  const slots = normalizeFigmaTokenSlots(cfg.figmaTokens);
  if (!slots.length) return cfg as T;
  const active = pickActiveFigmaTokenSlot(cfg, slots) as FigmaTokenSlot;
  cfg.figmaTokens = slots;
  cfg.activeFigmaTokenId = active.id;
  cfg.figmaToken = active.token;
  return cfg as T;
}

/**
 * 面板物化（读取侧，仅供配置面板读回渲染；**宽松**，与投影的严格口径刻意不同）：
 * 保留「已命名但还没填 token」的半成品槽位，否则用户在面板里刚输入名字、
 * 一保存回来槽位就消失（体感是配置丢了）。最终落库前由前端过滤空槽位。
 * 无任何槽位时把历史单值落成 1 号槽位；单值也没有时给 1 个空槽位，
 * 让面板永远至少有 1 行可输入（不需要「0 槽位」的特例渲染）。
 */
export function materializeFigmaTokenSlots<T extends Record<string, any>>(config: T): T {
  const cfg: Record<string, any> = { ...(config || {}) };
  const rawList = Array.isArray(cfg.figmaTokens) ? cfg.figmaTokens : [];
  const seen = new Set<string>();
  const slots: FigmaTokenSlot[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const id = asTrimmedString((raw as any).id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    slots.push({
      id,
      ...(asTrimmedString((raw as any).name) ? { name: asTrimmedString((raw as any).name) } : {}),
      token: typeof (raw as any).token === 'string' ? (raw as any).token : '',
    });
    if (slots.length >= MAX_FIGMA_TOKENS) break;
  }

  if (!slots.length) {
    const legacy = asTrimmedString(cfg.figmaToken);
    cfg.figmaTokens = [
      { id: LEGACY_FIGMA_TOKEN_SLOT_ID, name: legacy ? '主 Token' : '', token: legacy },
    ];
    cfg.activeFigmaTokenId = LEGACY_FIGMA_TOKEN_SLOT_ID;
    return cfg as T;
  }

  cfg.figmaTokens = slots;
  const activeId = asTrimmedString(cfg.activeFigmaTokenId);
  cfg.activeFigmaTokenId = slots.some((s) => s.id === activeId)
    ? activeId
    : (pickActiveFigmaTokenSlot({ ...cfg, activeFigmaTokenId: '' }, slots) as FigmaTokenSlot).id;
  return cfg as T;
}
