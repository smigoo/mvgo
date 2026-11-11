import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import { REDACTED_PLACEHOLDER } from '../common/utils/redact'
import {
  toFigmaCredentialRefFields,
  type FigmaCredentialRefFields,
} from './figma-credential-ref'
import { resolveExecutionFigmaTokenWithProbe } from './figma-execution-token-probe'

/**
 * 引用无命中时的逐槽探测择优判据（2026-11-09 · 诉求五 #15）。
 *
 * 要钉死的事实：**「任务当时的 token 已经找不回来」时，不能拿一个没验证过的凭证继续跑。**
 * 因为 Figma 对**无权限的文件返回 404（不是 403）**，猜错的后果在日志与前端上完全长成
 * 「文件不存在」—— 排障会一路跑偏到 fileKey / 节点被删 / 路由 404。
 *
 * 主判据（阳性 + 阴性成对，缺一半即假绿）：
 *   阳性：任务 pin 的 token 已不在配置里 → 槽位 A 探 404、槽位 B 探 200 → 必须选 B，
 *         且留 `source='probe'` + `reason='probe-selected'` + 可读的 note。
 *   阴性：正常链路（引用命中 / 首轮生成）**零探测** —— 证明「修复」没有把所有生成都拖慢。
 *
 * 另外四组是回归防线：
 *   C. 不猜 —— 缺 fileKey/nodeId 就 `probe-unavailable`，不推断、不抛。
 *   D. 全不通必须显式失败（`token=null` + `probe-failed`），**不得回落 active 静默重跑**。
 *   E. 不覆盖任务引用（`refFields===null`）+ note/probes 永不含 token 明文。
 *   F. 去重 —— 同一 token 占两个槽位只探一次（不留重复留痕、不白花额度）。
 */

const TOKEN_A = 'figd_aaa1111111111111111111111111ENDa'
const TOKEN_B = 'figd_bbb2222222222222222222222222ENDb'
/** 任务当时用的那个：现在配置里已经没有它了（用户删了 / 换成别的账号） */
const TOKEN_GONE = 'figd_ggg9999999999999999999999999ENDg'

const FILE_KEY = 'FILE9key'
const NODE_ID = '2:7952'

const cfg = (activeId: 'slot-a' | 'slot-b') => ({
  figmaToken: activeId === 'slot-b' ? TOKEN_B : TOKEN_A,
  figmaTokens: [
    { id: 'slot-a', name: '主 Token', token: TOKEN_A },
    { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
  ],
  activeFigmaTokenId: activeId,
})

/** 任务 pin 了 TOKEN_GONE，而当前配置只剩 A/B ⇒ `resolveFigmaTokenByRef` 返回 `not-found`。 */
const taskPinnedToGoneToken = (): FigmaCredentialRefFields =>
  toFigmaCredentialRefFields({
    fp: maskSecretFingerprint(TOKEN_GONE),
    slotId: null,
    slotName: null,
  })!

/** 任务 pin 的槽位还在、但内容被改写过 ⇒ `slot-overwritten`。 */
const taskPinnedToOverwrittenSlot = (): FigmaCredentialRefFields =>
  toFigmaCredentialRefFields({
    fp: maskSecretFingerprint(TOKEN_GONE),
    slotId: 'slot-a',
    slotName: '主 Token',
  })!

type ProbeReply = number | null | 'throw'

/**
 * 注入式探针：按 token 脚本返回状态码，并**记录每次调用**（顺序与入参都要能断言）。
 * `'throw'` 用来证明「探针自身异常只降级为读不到」，不会把取凭证打成崩溃。
 */
const makeProber = (script: Record<string, ProbeReply>) => {
  const calls: Array<{ token: string; fileKey: string; nodeId: string }> = []
  const prober = async (token: string, fileKey: string, nodeId: string) => {
    calls.push({ token, fileKey, nodeId })
    const reply = script[token]
    if (reply === 'throw') throw new Error('boom: network')
    if (typeof reply === 'number') return { status: reply, nodeFound: reply === 200 }
    return { status: null, nodeFound: false }
  }
  return { prober, calls }
}

/** note / probes 里绝不允许出现的字符串（token 明文）。 */
const SECRETS = [TOKEN_A, TOKEN_B, TOKEN_GONE]

describe('引用无命中时逐槽探测择优（resolveExecutionFigmaTokenWithProbe）', () => {
  describe('A. 正常链路零探测（阴性对照）', () => {
    it('引用命中（source=ref）→ 一次探测都不发', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: {
          sessionId: 'mc-lite-1',
          figmaCredentialFp: maskSecretFingerprint(TOKEN_A),
          figmaCredentialSlotId: 'slot-a',
          figmaCredentialSlotName: '主 Token',
        },
        activeConfig: cfg('slot-b'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.source).toBe('ref')
      expect(out.token).toBe(TOKEN_A)
      expect(out.reason).toBe('matched')
      expect(calls).toHaveLength(0)
      expect(out.probes).toEqual([])
    })

    it('首轮生成（无引用，reason=no-ref）→ 一次探测都不发（沿用当前凭证）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: null,
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.reason).toBe('no-ref')
      expect(out.source).toBe('active')
      expect(out.token).toBe(TOKEN_A)
      expect(calls).toHaveLength(0)
      expect(out.probes).toEqual([])
    })

    it('disableProbe → 与 #14 的同步实现逐字一致（probes 为空）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
        disableProbe: true,
      })

      expect(calls).toHaveLength(0)
      expect(out.probes).toEqual([])
      expect(out.reason).toBe('not-found')
      expect(out.token).toBe(TOKEN_A)
    })
  })

  describe('B. 主判据：探测择优（阳性）', () => {
    it('任务当时的 token 已不在配置里 → 探 A 得 404、探 B 得 200 ⇒ 必须改用 B', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.token).toBe(TOKEN_B)
      expect(out.source).toBe('probe')
      expect(out.reason).toBe('probe-selected')
      // 探测顺序：base（=当前凭证 A）先探，再按槽位顺序 → 共 2 次，且目标是同一个 fileKey/nodeId
      expect(calls.map((c) => c.token)).toEqual([TOKEN_A, TOKEN_B])
      expect(calls.every((c) => c.fileKey === FILE_KEY && c.nodeId === NODE_ID)).toBe(true)
      // 留痕可读：说明「当时那个没了 + 谁可读 + 已改用」
      expect(out.note).toContain('已不在配置中')
      expect(out.note).toContain('smigoo')
      expect(out.note).toContain('已改用')
      // 旧口径的「已回落当前凭证执行」在此**不该**出现（本次没有回落）
      expect(out.note).not.toContain('已回落')
    })

    it('本来就会用的那个凭证可读 → 只探 1 次即沿用，source 保持其原来源', async () => {
      const { prober, calls } = makeProber({ [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        requestToken: TOKEN_B,
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(1)
      expect(calls[0].token).toBe(TOKEN_B)
      // 是「请求携带的那个」，不是换成了别的槽位 ⇒ source 不该标成 probe
      expect(out.source).toBe('request')
      expect(out.reason).toBe('probe-selected')
      expect(out.note).toContain('沿用')
    })

    it('槽位被改写（slot-overwritten）同样走探测，且 note 指明被改写的槽位', async () => {
      const { prober } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToOverwrittenSlot() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.reason).toBe('probe-selected')
      expect(out.token).toBe(TOKEN_B)
      expect(out.note).toContain('slot-a')
    })

    it('探针抛异常只降级为「这条读不到」，不影响后续候选与整体结果', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 'throw', [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(2)
      expect(out.probes[0].status).toBeNull()
      expect(out.token).toBe(TOKEN_B)
      expect(out.reason).toBe('probe-selected')
    })
  })

  describe('C. 不猜：目标不明如实留痕', () => {
    it('缺 fileKey / nodeId → probe-unavailable，零探测，且不抛', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: null,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(0)
      expect(out.reason).toBe('probe-unavailable')
      expect(out.note).toContain('缺 fileKey')
      expect(out.note).toContain('无法逐槽探测')
      // 仍给出当前凭证（取凭证本身不能因探测不可用而失败）
      expect(out.token).toBe(TOKEN_A)
    })

    it('只有 fileKey 没有 nodeId 同样不探（阴性对照：半个目标不算目标）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        probe: prober,
      })

      expect(calls).toHaveLength(0)
      expect(out.reason).toBe('probe-unavailable')
      expect(out.note).toContain('缺 nodeId')
    })

    it('没有任何凭证可选（no-slots）→ 零探测，token 为 null（交给调用方报「未配置」）', async () => {
      const { prober, calls } = makeProber({})
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: {},
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(0)
      expect(out.reason).toBe('no-slots')
      expect(out.token).toBeNull()
    })
  })

  describe('D. 全不通必须显式失败（禁止静默回落）', () => {
    it('所有槽位都读不到 → token=null + probe-failed，note 列出每条状态码与可操作指引', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 404 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(2)
      expect(out.token).toBeNull()
      expect(out.source).toBe('none')
      expect(out.reason).toBe('probe-failed')
      expect(out.probes.map((p) => p.status)).toEqual([404, 404])
      // 逐条留痕：谁、什么状态
      expect(out.note).toContain('主 Token=HTTP 404')
      expect(out.note).toContain('smigoo=HTTP 404')
      // 必须点明 404 ≠ 文件已删除（这正是用户会误解的那一步）
      expect(out.note).toContain('不是 403')
      expect(out.note).toContain('设置 → Figma Token')
      // 不得再声称「已回落当前凭证执行」
      expect(out.note).not.toContain('已回落')
    })

    it('网络全失败（status=null）也判 probe-failed，不冒充可读', async () => {
      const { prober } = makeProber({ [TOKEN_A]: null, [TOKEN_B]: null })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.reason).toBe('probe-failed')
      expect(out.token).toBeNull()
      expect(out.note).toContain('请求失败/超时')
    })
  })

  describe('E. 不覆盖引用 + 不泄密', () => {
    it('探测选出凭证时不回写引用（refFields=null），但保留原引用供后续归因', async () => {
      const pinned = taskPinnedToOverwrittenSlot()
      const { prober } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...pinned },
        activeConfig: cfg('slot-a'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      // 一次探测不得把「任务当时用的那个」改写成「这次探测到能用的那个」
      expect(out.refFields).toBeNull()
      expect(out.ref?.fp).toBe(pinned.figmaCredentialFp)
      expect(out.ref?.slotId).toBe('slot-a')
    })

    it('note 与 probes 永不含 token 明文（三种终局都验）', async () => {
      const cases: Array<Record<string, ProbeReply>> = [
        { [TOKEN_A]: 404, [TOKEN_B]: 200 }, // probe-selected
        { [TOKEN_A]: 404, [TOKEN_B]: 404 }, // probe-failed
        { [TOKEN_A]: 404, [TOKEN_B]: 'throw' }, // probe-failed（异常）
      ]
      for (const script of cases) {
        const { prober } = makeProber(script)
        const out = await resolveExecutionFigmaTokenWithProbe({
          task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
          activeConfig: cfg('slot-a'),
          fileKey: FILE_KEY,
          nodeId: NODE_ID,
          probe: prober,
        })
        const serialized = `${out.note}|${JSON.stringify(out.probes)}`
        for (const secret of SECRETS) {
          expect(serialized).not.toContain(secret)
        }
      }
    })
  })

  describe('F. 去重与顺序', () => {
    it('两个槽位是同一个 token → 只探一次（不白花 Figma 额度、不留重复留痕）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 404 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: {
          figmaToken: TOKEN_A,
          figmaTokens: [
            { id: 'slot-a', name: '主 Token', token: TOKEN_A },
            { id: 'slot-b', name: '重复', token: TOKEN_A },
          ],
          activeFigmaTokenId: 'slot-a',
        },
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(1)
      expect(out.probes).toHaveLength(1)
      expect(out.reason).toBe('probe-failed')
    })

    it('active 槽排在其它槽位之前（用户当前选中的先试，命中即止）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        // 不传 requestToken / requestConfig ⇒ base.token 就是 active 槽（slot-b）
        activeConfig: cfg('slot-b'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls.map((c) => c.token)).toEqual([TOKEN_B])
      expect(out.token).toBe(TOKEN_B)
      expect(out.source).toBe('active')
      expect(out.reason).toBe('probe-selected')
    })
  })

  describe('G. 脱敏占位不参与探测（诉求五 #16-① 的纵深防御）', () => {
    /**
     * 真实形态：历史任务重试时 `config` 来自**脱敏落盘**的 `configSnapshot`，
     * 占位串是**非空字符串** ⇒ 若照旧遍历槽位，会拿 `'***REDACTED***'` 向 Figma 发一次
     * 必然 404 的请求，并在留痕里造出一个不存在的「凭证」。
     */
    const REDACTED = REDACTED_PLACEHOLDER

    it('槽位 token 为脱敏占位 → 完全跳过（不发请求、不进 probes）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 404, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: {
          figmaTokens: [
            { id: 'slot-a', name: '主 Token', token: REDACTED },
            { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
          ],
          activeFigmaTokenId: 'slot-a',
        },
        envToken: REDACTED, // 环境变量同样可能是占位（.env 抄自快照的极端情形）
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls.map((c) => c.token)).toEqual([TOKEN_B])
      expect(out.probes).toHaveLength(1)
      expect(out.probes[0].slotLabel).toBe('smigoo')
      expect(out.token).toBe(TOKEN_B)
      expect(out.reason).toBe('probe-selected')
      expect(JSON.stringify(out.probes)).not.toContain(REDACTED)
    })

    it('只剩占位 token → 一个候选都没有，按「无凭证」返回且零请求（不去网络里撞 404）', async () => {
      const { prober, calls } = makeProber({ [REDACTED]: 404 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        task: { sessionId: 'mc-lite-1', ...taskPinnedToGoneToken() },
        activeConfig: {
          figmaTokens: [{ id: 'slot-a', name: '主 Token', token: REDACTED }],
          activeFigmaTokenId: 'slot-a',
        },
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(calls).toHaveLength(0)
      expect(out.probes).toEqual([])
      // `base` 已在 note 里说明「已回落当前凭证执行」；此处只要求不拿假 token 出门
      expect(out.token).not.toBe(REDACTED)
    })
  })

  describe('H. 预览链路（诉求五 #18）：requestToken 与 requestConfig 引用并存', () => {
    /**
     * figma-preview 的真实入参形态：前端同时传 `figmaToken`（当前 active，可能是用户
     * 刚切过去的那个）与 `config.figmaCredentialFp`（历史还原带出的「当时」引用）。
     * 要钉死：**引用优先于请求 token** —— 否则用户切过 token 后，预览这一步就会拿
     * 错凭证 404，历史还原直接卡死在「确认预览图」。
     */
    it('请求 token 是当前的、config 引用指向当时的 ⇒ 引用赢（沿用当时的 token，零探测）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_A]: 200, [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        requestToken: TOKEN_B, // 用户此刻 active 的
        requestConfig: {
          figmaToken: TOKEN_B,
          figmaCredentialFp: maskSecretFingerprint(TOKEN_A),
          figmaCredentialSlotId: 'slot-a',
          figmaCredentialSlotName: '当时的 Token',
        },
        activeConfig: cfg('slot-b'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.source).toBe('ref')
      expect(out.token).toBe(TOKEN_A) // 当时那个，不是请求里的 TOKEN_B
      expect(out.reason).toBe('matched')
      expect(out.refSource).toBe('request')
      expect(out.requestOverridden).toBe(true) // 明示「忽略了请求回传的当前 token」
      expect(calls).toHaveLength(0)
    })

    it('阴性对照：无引用时 requestToken 照常生效（首轮预览零回归）', async () => {
      const { prober, calls } = makeProber({ [TOKEN_B]: 200 })
      const out = await resolveExecutionFigmaTokenWithProbe({
        requestToken: TOKEN_B,
        activeConfig: cfg('slot-b'),
        fileKey: FILE_KEY,
        nodeId: NODE_ID,
        probe: prober,
      })

      expect(out.source).toBe('request')
      expect(out.token).toBe(TOKEN_B)
      expect(out.reason).toBe('no-ref')
      expect(calls).toHaveLength(0)
    })
  })
})
