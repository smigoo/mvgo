/**
 * Figma 凭证引用（任务 ↔ 当时用的 Figma Token）—— 落盘侧与解析侧的唯一来源。
 * 2026-11-09
 *
 * 背景（用户实报）：在配置面板切换过 Figma Token（多槽位切 active）后，点历史任务重试
 * 就「连不上当时的 Figma」。原因是任务只存脱敏后的 `configSnapshot`，而执行链路
 * 每次都实时 `getMergedAiConfig()` 取**当前** active 槽位 ⇒ 历史任务被当前 token 顶掉。
 * 叠加 `figma-access-diagnosis.ts` 已实锤的事实：Figma 对**无权限文件返回 404 而非 403**
 * ⇒ 用户看到的是「文件不存在」，不是「没权限」。
 *
 * 本模块只做三件事，且都是纯函数：
 *   ① `buildFigmaCredentialRef(config)` —— 创建任务时算出「当时用的是哪个凭证」的引用；
 *   ② `resolveFigmaTokenByRef(ref, config)` —— 复用/重试时按引用把**当时那个 token** 找回来；
 *   ③ `isFigmaFingerprintUsable(fp)` —— 短 token 的指纹退化成 `'****'`，该值不可用于比对。
 *
 * 🔴 三条硬设计约束（都有可辩驳判据，见 `figma-credential-ref.spec.ts`）：
 *
 *  1. **键名不得含 `token/apikey/secret/password/authorization` 子串**。
 *     `common/utils/redact.ts:6` 的 `SECRET_KEY_REGEX` 按**键名**命中就把字符串抹成
 *     `'***REDACTED***'`，且 `createTask`（`tasks.service.ts:1322`）写内存那一刻就脱敏、
 *     `flushPersistQueue`（同文件 :1089）落盘再抹一次 ⇒ 只要键名带 `token`，值是**物理消失**。
 *     实测：`data/tasks.json` 65 条任务里 `activeFigmaTokenId` 幸存 **0** 条（被抹），
 *     而 `figmaTokens[].id/.name` 幸存 **65/65**。故此处用 `figmaCredentialSlotId`
 *     而不是 `figmaTokenSlotId` —— 这是「能让引用活到复用时」的前提，不是命名洁癖。
 *
 *  2. **解析只按指纹匹配，绝不回落当前 active 槽位**。
 *     回落 = 用错凭证静默重跑，且因为 Figma 返回 404 会伪装成「文件不存在」，
 *     比直接失败难查一个数量级。无命中一律返回 `token: null` + 机器可读 `reason`，
 *     由调用方决定是「探测择优兜底」（方案 C）还是「出归因文案」。
 *
 *  3. **判据单一来源**：槽位归一/激活槽选择复用 `figma-token-projection.ts`，
 *     指纹复用 `secret-fingerprint.ts`，本文件不新写第二份投影/脱敏逻辑。
 *
 * 与 `figma-credential.ts` 的分工（刻意不合并 —— 那个是「当前」语义，这个是「当时」语义）：
 *   - `figmaCredentialFpFromConfig()`：只取**当前 active 槽**的指纹，用于回答
 *     「用户现在的凭证和任务当时的一致吗」（`feedback.service.ts:275` 读取侧）；
 *   - 本文件的 `resolveFigmaTokenByRef()`：遍历**全部槽位**按指纹找回，用于回答
 *     「任务当时到底用的哪个 token」。两者判据不同，混用必错。
 */

import { REDACTED_PLACEHOLDER } from '../common/utils/redact'
import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import {
  normalizeFigmaTokenSlots,
  pickActiveFigmaTokenSlot,
} from './figma-token-projection'

/**
 * 落盘字段名（**三个都刻意不含 secret 正则命中词**，理由见文件头约束 ①）。
 * 消费方必须从这里取字段名，禁止在各处硬编码字面量 —— 否则改名时必漏一处。
 */
export const FIGMA_CREDENTIAL_REF_FIELDS = {
  fp: 'figmaCredentialFp',
  slotId: 'figmaCredentialSlotId',
  slotName: 'figmaCredentialSlotName',
} as const

/** `'****'` = `maskSecretFingerprint` 对 length ≤ 8 的 token 的退化输出，不可区分槽位。 */
const DEGENERATE_FINGERPRINT = '****'

export interface FigmaCredentialRef {
  /** token 指纹（前 6 + `****` + 后 4） */
  fp: string
  /** 多槽位时当时激活的槽位 id；历史单值 token 场景为 null */
  slotId: string | null
  /** 槽位显示名，仅用于归因文案 */
  slotName: string | null
}

/** 可落盘的引用三字段（fp 缺失时整体为 null，调用方直接不写即可）。 */
export type FigmaCredentialRefFields = {
  figmaCredentialFp: string
  figmaCredentialSlotId?: string
  figmaCredentialSlotName?: string
}

/** 解析失败原因（机器可读，供上层决定探测兜底还是出文案）。 */
export type FigmaCredentialResolveReason =
  /** 引用为空 / 指向的记录没有 fp 字段 */
  | 'no-ref'
  /** fp 退化为 `'****'`（token 太短），无法用于比对 */
  | 'fingerprint-unusable'
  /** 当前配置里一个可用 token 都没有 */
  | 'no-slots'
  /** 指纹在所有槽位里都找不到 —— 当时的 token 已从配置中消失 */
  | 'not-found'
  /** 槽位 id 还在，但该槽位里的 token 已被改成别的值（覆盖写） */
  | 'slot-overwritten'

export interface FigmaCredentialResolution {
  /** 命中的 token；**没有命中恒为 null，绝不回落当前 active 槽位** */
  token: string | null
  slotId: string | null
  slotName: string | null
  reason: FigmaCredentialResolveReason | 'matched'
  /** 仅供归因文案：`slot-overwritten` 时指认那个被改写的槽位 */
  overwrittenSlotId?: string
}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

/**
 * 指纹是否可用于槽位比对。
 * 短 token（≤ 8 字符）会被 `maskSecretFingerprint` 抹成 `'****'` ⇒ 所有短 token 同指纹，
 * 拿它比对会把两个不同账号判成同一个。宁可不匹配，也不能错配。
 */
export function isFigmaFingerprintUsable(fp?: string | null): boolean {
  const v = asTrimmedString(fp)
  return !!v && v !== DEGENERATE_FINGERPRINT
}

/**
 * 候选凭证列表（解析侧的**唯一**取值口径）。
 *
 * 顺序与优先级：有 `figmaTokens[]` 时**只看槽位**（与 `applyFigmaTokenProjection` 同口径：
 * 槽位存在即视为权威，历史单值 `figmaToken` 只是兼容残留）；一个槽位都没有时才退到
 * 单值 `figmaToken`（旧配置零漂移）。
 *
 * 刻意不把「槽位 + 历史单值」一起纳入候选：merged config 里 `figmaToken` 常是被投影
 * 覆盖过的当前值，混进来只会制造重复匹配与不可解释的命中优先级。
 */
export function listFigmaCredentialCandidates(
  config?: Record<string, any> | null,
): Array<{ slotId: string | null; slotName: string | null; token: string }> {
  if (!config || typeof config !== 'object') return []
  const slots = normalizeFigmaTokenSlots(config.figmaTokens)
  if (slots.length) {
    return slots.map((slot) => ({
      slotId: slot.id,
      slotName: asTrimmedString(slot.name) || null,
      token: (slot.token as string).trim(),
    }))
  }
  const legacy = asTrimmedString(config.figmaToken)
  return legacy ? [{ slotId: null, slotName: null, token: legacy }] : []
}

/**
 * 按「实际要用的那个 token」构建引用 —— **建账的权威入口**。
 *
 * 为什么不能只按 active 槽位建账：执行链路取 token 的口径是
 * `config?.figmaToken || merged?.figmaToken`（`phase2.service.ts:710`、`lite.service.ts:1972`），
 * 即**请求里显式传的 token 优先于 active 槽位**。只按 active 记账会记错人。
 * 故这里以「传进来的 token 值」为准，再去槽位里反查它属于哪个槽位（仅用于归因展示）。
 *
 * @param token 实际生效的 token 明文
 * @param config 用来反查槽位归属的配置（可为 merged config）
 */
export function buildFigmaCredentialRefForToken(
  token?: string | null,
  config?: Record<string, any> | null,
): FigmaCredentialRef | null {
  const value = asTrimmedString(token)
  if (!value) return null
  const owner = listFigmaCredentialCandidates(config).find(
    (candidate) => candidate.token === value,
  )
  return {
    fp: maskSecretFingerprint(value) || DEGENERATE_FINGERPRINT,
    slotId: owner?.slotId ?? null,
    slotName: owner?.slotName ?? null,
  }
}

/**
 * 创建任务时调用：算出「当时用的哪个 Figma 凭证」的引用。
 *
 * 取值口径 = 执行链路会拿到的那个 token（active 槽优先，与
 * `applyFigmaTokenProjection` 同源；无槽位时退到历史单值）。
 *
 * @returns 无 token 时返回 null（不产出空引用，避免脏字段进快照）
 */
export function buildFigmaCredentialRef(
  config?: Record<string, any> | null,
): FigmaCredentialRef | null {
  const candidates = listFigmaCredentialCandidates(config)
  if (!candidates.length) return null

  const slots = normalizeFigmaTokenSlots(config?.figmaTokens)
  if (!slots.length) return buildFigmaCredentialRefForToken(candidates[0].token, config)

  // 与投影层同源：active 命中优先，否则第一个可用槽位
  const active = pickActiveFigmaTokenSlot(config, slots)
  const hit = candidates.find((c) => c.slotId === active?.id) || candidates[0]
  return buildFigmaCredentialRefForToken(hit.token, config)
}

/**
 * 把引用摊平成可落盘的三字段（供 `TaskMetadata` / `configSnapshot` 直接 spread）。
 * fp 缺失返回 null —— 调用方应「跳过写入」而不是写空串。
 */
export function toFigmaCredentialRefFields(
  ref?: FigmaCredentialRef | null,
): FigmaCredentialRefFields | null {
  if (!ref || !asTrimmedString(ref.fp)) return null
  const out: FigmaCredentialRefFields = {
    [FIGMA_CREDENTIAL_REF_FIELDS.fp]: asTrimmedString(ref.fp),
  }
  const slotId = asTrimmedString(ref.slotId)
  if (slotId) {
    ;(out as any)[FIGMA_CREDENTIAL_REF_FIELDS.slotId] = slotId
  }
  const slotName = asTrimmedString(ref.slotName)
  if (slotName) {
    ;(out as any)[FIGMA_CREDENTIAL_REF_FIELDS.slotName] = slotName
  }
  return out
}

/**
 * 从任务 / 快照记录里读回引用（字段名只在 `FIGMA_CREDENTIAL_REF_FIELDS` 定义一次）。
 * 无 fp 时返回 null ⇒ 上层走「老任务没有引用」分支（行为与改造前一致，零漂移）。
 */
export function readFigmaCredentialRef(
  source?: Record<string, any> | null,
): FigmaCredentialRef | null {
  if (!source || typeof source !== 'object') return null
  const fp = asTrimmedString(source[FIGMA_CREDENTIAL_REF_FIELDS.fp])
  if (!fp) return null
  return {
    fp,
    slotId: asTrimmedString(source[FIGMA_CREDENTIAL_REF_FIELDS.slotId]) || null,
    slotName:
      asTrimmedString(source[FIGMA_CREDENTIAL_REF_FIELDS.slotName]) || null,
  }
}

/**
 * 从任务记录读引用（**读取唯一入口**），优先级与 `feedback.service.ts:275` 同源：
 *   ① 任务顶层 `figmaCredentialFp`（pipeline 执行期写入，最贴近真实调用）；
 *   ② 回落 `configSnapshot.figmaCredentialFp`（创建期写入）。
 *
 * 两个来源都指向同一个事实（当时用的哪个 token），先顶层后快照只是为了兼容
 * 「老任务只有快照」与「pipeline 中途改写」两种形态。
 */
export function readTaskFigmaCredentialRef(
  task?: Record<string, any> | null,
): { ref: FigmaCredentialRef | null; source: 'pipeline' | 'create' | null } {
  if (!task || typeof task !== 'object') {
    return { ref: null, source: null }
  }
  const fromTask = readFigmaCredentialRef(task)
  if (fromTask) return { ref: fromTask, source: 'pipeline' }
  const fromSnapshot = readFigmaCredentialRef(task.configSnapshot)
  if (fromSnapshot) return { ref: fromSnapshot, source: 'create' }
  return { ref: null, source: null }
}

/**
 * 按引用把「任务当时用的 token」找回（**方案 A 的核心**）。
 *
 * 匹配口径：遍历**全部**槽位比指纹，不只看 active 槽 —— 用户切到槽位 B 之后，
 * 槽位 A 的 token 仍在 `figmaTokens[]` 里，这正是可救回的情形。
 *
 * 🔴 无命中时 `token` 恒为 `null`。绝不 `.find(...) || 当前active`：
 *    那样会在 token 已被删/改的情况下拿错凭证去请求，且 Figma 会以 404 伪装成
 *    「文件不存在」，把凭证问题伪装成路径问题。
 */
export function resolveFigmaTokenByRef(
  ref?: FigmaCredentialRef | null,
  config?: Record<string, any> | null,
): FigmaCredentialResolution {
  const fp = asTrimmedString(ref?.fp)
  if (!ref || !fp) {
    return { token: null, slotId: null, slotName: null, reason: 'no-ref' }
  }
  if (!isFigmaFingerprintUsable(fp)) {
    return {
      token: null,
      slotId: null,
      slotName: null,
      reason: 'fingerprint-unusable',
    }
  }

  const candidates = listFigmaCredentialCandidates(config)
  if (!candidates.length) {
    return { token: null, slotId: null, slotName: null, reason: 'no-slots' }
  }

  const hit = candidates.find((c) => maskSecretFingerprint(c.token) === fp)
  if (hit) {
    return {
      token: hit.token,
      slotId: hit.slotId,
      slotName: hit.slotName,
      reason: 'matched',
    }
  }

  // 指纹没命中，但同 id 槽位还在 ⇒ 该槽位被覆盖写过（可给出精确归因）
  const refSlotId = asTrimmedString(ref.slotId)
  if (refSlotId) {
    const sameSlot = candidates.find((c) => c.slotId === refSlotId)
    if (sameSlot) {
      return {
        token: null,
        slotId: null,
        slotName: null,
        reason: 'slot-overwritten',
        overwrittenSlotId: refSlotId,
      }
    }
  }

  return { token: null, slotId: null, slotName: null, reason: 'not-found' }
}

/**
 * 「任务当时的凭证 vs 现在的配置」——**是否已经变了**的判定（纯函数，无 IO）。
 *
 * 🔴 为什么不能让调用方拿两个指纹相减（`feedback.service.ts` 原实现就是这么写的）：
 *   原实现 `changed = taskFingerprint !== currentFingerprint`，而 `currentFingerprint` 取的是
 *   **当前 active 槽位**的指纹（`figmaCredentialFpFromConfig`）。诉求五落地后，
 *   历史任务**正常语义**就是「沿用当时那个 token」——它常常**不是**当前 active 槽位
 *   ⇒ 相减会把每一次「正确的沿用」都报成「凭证已变」，噪声恰好落在最需要它准确的地方。
 *
 * 正确口径：问「当时那个凭证现在还能不能按引用找回」（与执行期同一判据
 * `resolveFigmaTokenByRef`，指纹比全部槽位、不只看 active 槽）。
 *
 * 三值语义（`changed` 刻意可空 —— 不猜）：
 *   - `false`：引用命中 ⇒ 当时那个 token 仍在配置里（哪怕用户已切到别的槽位）；
 *   - `true` ：引用未命中（`not-found` / `slot-overwritten` / `no-slots`）⇒ 当时的那个已不可用；
 *   - `undefined`：**无从对照** —— 任务没记引用（老任务，`no-ref`），或指纹退化为 `****`
 *     本就无法比对（`fingerprint-unusable`）。
 */
export interface FigmaCredentialDrift {
  /** 任务是否记录了凭证引用（`false` ⇒ 老任务/首轮，行为与改造前一致） */
  hasRef: boolean
  /** `false`=当时那个仍在；`true`=已不可用；`undefined`=无从对照（见上） */
  changed: boolean | undefined
  /** 判定依据（可直接进日志/反馈快照，不依赖中文文案） */
  reason: FigmaCredentialResolveReason | 'matched' | 'no-ref'
}

/** 判定「是否已经变了」的唯一入口（`feedback` 等**只读**场景用）。 */
export function assessFigmaCredentialDrift(
  task?: Record<string, any> | null,
  currentConfig?: Record<string, any> | null,
): FigmaCredentialDrift {
  const { ref } = readTaskFigmaCredentialRef(task)
  if (!ref) return { hasRef: false, changed: undefined, reason: 'no-ref' }
  const resolution = resolveFigmaTokenByRef(ref, currentConfig)
  if (resolution.token) return { hasRef: true, changed: false, reason: 'matched' }
  // 指纹不可比对时既不能说「变了」也不能说「没变」⇒ 留 undefined，由 reason 说明为什么
  if (resolution.reason === 'fingerprint-unusable') {
    return { hasRef: true, changed: undefined, reason: resolution.reason }
  }
  return { hasRef: true, changed: true, reason: resolution.reason }
}

/* ------------------------------------------------------------------------------------------------
 * 执行期解析（方案 A 的实际生效点）
 *
 * 上面都是「引用 ↔ token」的纯映射；本段才是**执行链路取 token 的唯一入口**：
 * `phase2.executeGeneration` 与 `lite.fetchFigmaImage / upgradeAssets` 一律走
 * `resolveExecutionFigmaToken()`，不再各自写 `config?.figmaToken || merged?.figmaToken`。
 *
 * 为什么必须收敛到一处（三个各自独立的坑，任一漏掉都会复发）：
 *   ① 优先级错了 ⇒ 重试时前端传的「当前 token」把历史引用顶掉（用户报的原始 bug）；
 *   ② 假值穿透 ⇒ `configSnapshot.figmaToken` 是 `'***REDACTED***'`（非空字符串），
 *      任何 `||` 链都会把它当合法 token 发出去 → Figma 401/404，且看不出是凭证问题；
 *   ③ 回落无留痕 ⇒ 拿错凭证静默重跑，Figma 又以 404 伪装「文件不存在」。
 * 故本函数恒定返回 `source` + `reason` + `note`，调用方必须把 note 打进日志（真机判据）。
 * ---------------------------------------------------------------------------------------------- */

/** token 的实际来源（排障用，须进真机日志） */
export type FigmaTokenSource =
  /** 按任务凭证引用找回的「当时那个 token」（方案 A 命中） */
  | 'ref'
  /** 请求里显式传入（首次生成，或任务无引用时的原口径） */
  | 'request'
  /** 用户当前 active 槽位投影出的单值 */
  | 'active'
  /**
   * 引用无命中时**逐槽探测**选出的可读凭证（#15）。
   * 与 `active` 的区别：active 是「用户当前选中」，probe 是「**已证明能读到这个文件**」——
   * 前者可能在 files 上 404，后者不会。排障时必须能把两者分开，故单列一个 source。
   */
  | 'probe'
  /** 部署级环境变量兜底（仅 lite 有） */
  | 'env'
  | 'none'

/**
 * 执行期 `reason` 的完整取值域 = 「引用↔槽位」的解析原因 + 引用命中 + 探测层叠加的三个。
 *
 * 刻意**不**把这些塞进 `FigmaCredentialResolveReason`：那个是 `resolveFigmaTokenByRef`
 * 的纯映射结果（无网络、无副作用），而 `probe-*` 是 **异步探测之后**才知道的结论。
 * 混成一个联合会让「纯函数的原因」和「网络探测的结论」不可区分，判据也没法只测前者。
 */
export type ExecutionFigmaTokenReason =
  | FigmaCredentialResolveReason
  /** 引用命中：沿用任务当时的 token */
  | 'matched'
  /** 引用无命中，逐槽探测找到能读该文件的槽位并改用（#15） */
  | 'probe-selected'
  /** 引用无命中，逐槽探测**全部**读不到 —— 必须由调用方抛可操作错误，禁止回落静默重跑 */
  | 'probe-failed'
  /** 需要探测但拿不到 fileKey/nodeId（目标不明）—— 无法探测，只能如实留痕 */
  | 'probe-unavailable'

export interface ExecutionFigmaTokenInput {
  /** 任务记录（读引用：顶层 pipeline 优先，回落 configSnapshot） */
  task?: Record<string, any> | null
  /**
   * 请求侧配置（`dto.config` / phase2 的 `config`）。
   * 两个用途：① 携带引用（重试时由 createTask 写进 configSnapshot 的那份）；
   * ② `requestToken` 未显式给出时，从 `figmaToken` 取请求 token。
   */
  requestConfig?: Record<string, any> | null
  /** 请求里显式传入的 token（优先于 requestConfig.figmaToken，便于测试注入） */
  requestToken?: string | null
  /** 当前合并配置（`getMergedAiConfig`）：引用解析的槽位来源 */
  activeConfig?: Record<string, any> | null
  /** 部署级环境变量兜底（lite 传 `process.env.FIGMA_ACCESS_TOKEN`） */
  envToken?: string | null
}

export interface ExecutionFigmaTokenResult {
  /** 本次执行真正要用的 token；`null` = 一个可用凭证都没有（调用方按原口径报错） */
  token: string | null
  source: FigmaTokenSource
  /** 引用解析结果；无引用时为 `'no-ref'`；探测层另有 `probe-*` 三值 */
  reason: ExecutionFigmaTokenReason
  ref: FigmaCredentialRef | null
  refSource: 'pipeline' | 'create' | 'request' | null
  /** 请求里传的 token 与「按引用找回的 token」不一致（说明本次是**沿用历史**而非用户当前选择） */
  requestOverridden: boolean
  /**
   * `reason==='slot-overwritten'` 时**被改写的那个槽位 id**（其余情况为 `undefined`）。
   *
   * 单列一个字段而不是把 id 拼进 note：note 是给人看的中文，上层（#15 探测层）还要拿它
   * 重新生成自己的文案 —— 靠正则从中文里抠 id 就是第二份判据。这里透出原始值，
   * `describeFigmaCredentialReason(reason, ref, overwrittenSlotId)` 想用就用。
   */
  overwrittenSlotId?: string
  /** 一句可直接进日志/任务详情的中文归因（**永不含明文 token**） */
  note: string
  /**
   * 可写回任务记录的引用字段（`source==='ref'` 时为 null —— 已存在的引用无需重写）。
   * 写入条件由调用方控制：**任务已有引用时不覆盖**（避免一次失败执行把用户 pin 死）。
   */
  refFields: FigmaCredentialRefFields | null
}

/** 值是否为「已脱敏的假值」（`'***REDACTED***'` 是非空字符串，真值判断挡不住）。 */
export function isRedactedPlaceholder(value?: string | null): boolean {
  return asTrimmedString(value) === REDACTED_PLACEHOLDER
}

/** 解析失败原因的**中文**归因（文案单一来源；`note` 与上层报错都从这里取）。 */
export function describeFigmaCredentialReason(
  reason: FigmaCredentialResolveReason,
  ref?: FigmaCredentialRef | null,
  overwrittenSlotId?: string,
): string {
  const slotLabel = asTrimmedString(ref?.slotName) || asTrimmedString(ref?.slotId)
  switch (reason) {
    case 'no-ref':
      return '任务未记录 Figma 凭证引用（首次生成或改造前的老任务）'
    case 'fingerprint-unusable':
      return '任务当时的 Figma Token 过短（指纹退化为 ****），无法安全比对'
    case 'no-slots':
      return '当前用户没有任何可用的 Figma Token'
    case 'slot-overwritten':
      return `Figma Token 槽位${overwrittenSlotId ? `「${overwrittenSlotId}」` : ''}已被改写，任务当时的那个已不存在`
    case 'not-found':
    default:
      return slotLabel
        ? `任务当时的 Figma Token（槽位「${slotLabel}」）已不在配置中`
        : '任务当时的 Figma Token 已不在配置中'
  }
}

/** 请求 token 归一：脱敏占位/空白一律视为「没有传」（否则假 token 会一路打到 Figma）。 */
const asUsableToken = (value: unknown): string => {
  const v = asTrimmedString(value)
  return !v || isRedactedPlaceholder(v) ? '' : v
}

/**
 * 执行期取 Figma Token（**唯一入口**）。
 *
 * 优先级（与用户拍板的方案 A 一致）：
 *   `任务凭证引用 > 请求显式 token > 当前 active 槽位 > 环境变量`
 *
 * 🔴 三个关键语义：
 *   1. **引用优先于请求 token**。重试/续跑时前端会把「当前」config 整个回传，
 *      若按请求优先，用户切过 token 之后历史任务必然用错凭证（原始 bug）。
 *      任务级重试的语义就是「复现当时那次生成」（见 `createRetryTask`），故沿用历史。
 *   2. **引用命中不改 active 槽**：只在本次执行内生效，绝不回写用户配置。
 *   3. **未命中不静默**：返回 `reason` + `note`，必要时由调用方（#15 探测择优）决定；
 *      仍会回落当前凭证以保持旧行为，但 `note` 会明确写出「已回落」并把原因打进日志。
 */
export function resolveExecutionFigmaToken(
  input: ExecutionFigmaTokenInput = {},
): ExecutionFigmaTokenResult {
  const requestToken =
    asUsableToken(input.requestToken) || asUsableToken(input.requestConfig?.figmaToken)

  const fromTask = readTaskFigmaCredentialRef(input.task)
  const ref = fromTask.ref || readFigmaCredentialRef(input.requestConfig)
  const refSource = fromTask.ref ? fromTask.source : ref ? ('request' as const) : null

  let activeToken = asUsableToken(input.activeConfig?.figmaToken)
  // 槽位存在但投影值为空/被脱敏时，按槽位顺序补一个（与 listFigmaCredentialCandidates 同口径）
  if (!activeToken) {
    const candidates = listFigmaCredentialCandidates(input.activeConfig)
    activeToken = asUsableToken(candidates[0]?.token)
  }
  const envToken = asUsableToken(input.envToken)

  const fallback = (reason: FigmaCredentialResolveReason | 'matched', note: string) => {
    const token = requestToken || activeToken || envToken || null
    const source: FigmaTokenSource = requestToken
      ? 'request'
      : activeToken
        ? 'active'
        : envToken
          ? 'env'
          : 'none'
    return {
      token,
      source,
      reason,
      ref,
      refSource,
      requestOverridden: false,
      note,
      // 仅在「首次给这个任务 pin 凭证」时回写；已有引用一律不覆盖（见 refFields 注释）
      refFields: ref ? null : token ? toFigmaCredentialRefFields(
        buildFigmaCredentialRefForToken(token, input.activeConfig),
      ) : null,
    }
  }

  if (!ref) {
    return fallback(
      'no-ref',
      '任务无 Figma 凭证引用（首次生成或老任务），按当前凭证执行',
    )
  }

  const resolution = resolveFigmaTokenByRef(ref, input.activeConfig)
  if (resolution.token) {
    return {
      token: resolution.token,
      source: 'ref',
      reason: 'matched',
      ref,
      refSource,
      requestOverridden: !!requestToken && requestToken !== resolution.token,
      note: `凭证引用命中${
        resolution.slotName ? `（槽位「${resolution.slotName}」）` : ''
      }：沿用任务当时的 Figma Token${
        requestToken && requestToken !== resolution.token ? '，已忽略请求回传的当前 token' : ''
      }`,
      refFields: null,
    }
  }

  // 未命中：保留旧行为（回落当前凭证），但把原因写清楚 —— 绝不「悄悄换成别的 token」
  const reasonText = describeFigmaCredentialReason(
    resolution.reason as FigmaCredentialResolveReason,
    ref,
    resolution.overwrittenSlotId,
  )
  return {
    ...fallback(
      resolution.reason,
      `${reasonText}；本次已回落当前凭证执行（Figma 对无权限文件返回 404，若报「文件不存在」请核对凭证）`,
    ),
    overwrittenSlotId: resolution.overwrittenSlotId,
  }
}
