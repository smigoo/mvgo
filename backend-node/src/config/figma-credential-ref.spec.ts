import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import { redactSecrets } from '../common/utils/redact'
import {
  FIGMA_CREDENTIAL_REF_FIELDS,
  assessFigmaCredentialDrift,
  buildFigmaCredentialRef,
  isFigmaFingerprintUsable,
  listFigmaCredentialCandidates,
  readFigmaCredentialRef,
  resolveFigmaTokenByRef,
  toFigmaCredentialRefFields,
} from './figma-credential-ref'

/**
 * Figma 凭证引用判据（2026-11-09）。
 *
 * 要证明的事实只有一条：**历史任务重试时，发出去的 token 是「当时那个」，不是「现在 active 那个」。**
 * 围绕它设三组判据：
 *
 *  A. 落盘存活 —— 引用三字段必须穿透 `redactSecrets`（键名不含 secret 正则命中词），
 *     且**同一函数**对 `figmaToken` 必须仍然抹掉（阳性对照，证明脱敏本身没失效）。
 *  B. 解析口径 —— 按指纹遍历全部槽位；命中返回当时的 token。
 *  C. 无命中不得静默 —— 找不到就返回 null + 机器可读 reason，绝不回落当前 active 槽位。
 *
 * ⚠️ A 组刻意用「同一输入形态 + 同一函数」做对照：若只断言「三字段幸存」而不验证
 *   「figmaToken 仍被抹」，那么把 SECRET_KEY_REGEX 整个改坏也能让测试变绿（假绿）。
 */
describe('Figma 凭证引用（figma-credential-ref）', () => {
  // > 8 字符，指纹才有区分度；首个 6 / 末 4 刻意不同
  const TOKEN_A = 'figd_aaa1111111111111111111111111ENDa'
  const TOKEN_B = 'figd_bbb2222222222222222222222222ENDb'
  const TOKEN_LEGACY = 'figd_leg4444444444444444444444444ENDl'
  const SHORT_TOKEN = 'tok12345' // 8 字符 → 指纹退化为 '****'

  const cfgTwoSlots = (activeId: string) => ({
    figmaToken: activeId === 'slot-b' ? TOKEN_B : TOKEN_A,
    figmaTokens: [
      { id: 'slot-a', name: '主 Token', token: TOKEN_A },
      { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
    ],
    activeFigmaTokenId: activeId,
  })

  describe('A. 落盘存活：三字段穿透 redactSecrets（含阳性对照）', () => {
    it('引用三字段在脱敏后逐字幸存，且 slotName 也保留（归因文案需要）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-b'))!
      const fields = toFigmaCredentialRefFields(ref)!
      const redacted = redactSecrets(fields)

      expect(redacted[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(ref.fp)
      expect(redacted[FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-b')
      expect(redacted[FIGMA_CREDENTIAL_REF_FIELDS.slotName]).toBe('smigoo')
      // 明确反证：不能出现任何 REDACTED 残留
      expect(JSON.stringify(redacted)).not.toContain('REDACTED')
    })

    it('阳性对照（同一函数同一输入形态）：figmaToken / activeFigmaTokenId 仍然被抹', () => {
      const redacted = redactSecrets({
        figmaToken: TOKEN_A,
        activeFigmaTokenId: 'slot-a',
        ...toFigmaCredentialRefFields(buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!),
      })
      // 控制组：证明脱敏机制本身有效，否则上一测试的「幸存」毫无意义
      expect(redacted.figmaToken).toBe('***REDACTED***')
      expect(redacted.activeFigmaTokenId).toBe('***REDACTED***')
      // 实验组：同一对象里的引用三字段不被波及
      expect(redacted[FIGMA_CREDENTIAL_REF_FIELDS.fp]).not.toBe('***REDACTED***')
      expect(redacted[FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-a')
    })

    it('嵌套在 configSnapshot 里同样幸存（真实落盘形态）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      const redacted = redactSecrets({
        configSnapshot: { ...cfgTwoSlots('slot-a'), ...toFigmaCredentialRefFields(ref) },
        sessionId: 's-1',
      })
      expect(redacted.configSnapshot[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(ref.fp)
      expect(redacted.configSnapshot.figmaToken).toBe('***REDACTED***')
    })
  })

  describe('B. 构建引用：口径与执行链路一致', () => {
    it('双槽位且 active=B → 记 B 的指纹与槽位 id', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-b'))!
      expect(ref.slotId).toBe('slot-b')
      expect(ref.slotName).toBe('smigoo')
      expect(ref.fp).toBe(maskSecretFingerprint(TOKEN_B))
      expect(ref.fp).not.toBe(maskSecretFingerprint(TOKEN_A))
    })

    it('active 悬空 → 与投影层同源地回落到第一个可用槽位（不产出空引用）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-404'))!
      expect(ref.slotId).toBe('slot-a')
      expect(ref.fp).toBe(maskSecretFingerprint(TOKEN_A))
    })

    it('只有历史单值 figmaToken → slotId/slotName 为 null（旧配置零漂移）', () => {
      const ref = buildFigmaCredentialRef({ figmaToken: TOKEN_LEGACY })!
      expect(ref.fp).toBe(maskSecretFingerprint(TOKEN_LEGACY))
      expect(ref.slotId).toBeNull()
      expect(ref.slotName).toBeNull()
    })

    it('槽位存在时忽略历史单值（与 applyFigmaTokenProjection 同口径）', () => {
      const ref = buildFigmaCredentialRef({
        figmaToken: TOKEN_LEGACY,
        figmaTokens: [{ id: 'slot-a', token: TOKEN_A }],
        activeFigmaTokenId: 'slot-a',
      })!
      expect(ref.fp).toBe(maskSecretFingerprint(TOKEN_A))
      expect(ref.slotId).toBe('slot-a')
    })

    it('完全没有 token → null（不写空引用进快照）', () => {
      expect(buildFigmaCredentialRef({})).toBeNull()
      expect(buildFigmaCredentialRef({ figmaTokens: [] })).toBeNull()
      expect(buildFigmaCredentialRef(null)).toBeNull()
      expect(buildFigmaCredentialRef(undefined)).toBeNull()
      expect(toFigmaCredentialRefFields(null)).toBeNull()
    })

    it('短 token 的指纹退化为 **** 且被判定为不可用（宁可不比对，不能错配）', () => {
      expect(maskSecretFingerprint(SHORT_TOKEN)).toBe('****')
      expect(isFigmaFingerprintUsable('****')).toBe(false)
      expect(isFigmaFingerprintUsable('')).toBe(false)
      expect(isFigmaFingerprintUsable(null)).toBe(false)
      expect(isFigmaFingerprintUsable(maskSecretFingerprint(TOKEN_A))).toBe(true)

      const ref = buildFigmaCredentialRef({ figmaToken: SHORT_TOKEN })!
      expect(ref.fp).toBe('****')
      expect(isFigmaFingerprintUsable(ref.fp)).toBe(false)
    })
  })

  describe('C. 解析引用：找回「当时那个 token」', () => {
    it('🔴 阳性对照：A 建任务 → 切到 B → 仍解析出 A 的 token（不是 B）', () => {
      const createdWithA = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      const laterConfig = cfgTwoSlots('slot-b') // 用户切了 active
      const out = resolveFigmaTokenByRef(createdWithA, laterConfig)

      expect(out.reason).toBe('matched')
      expect(out.token).toBe(TOKEN_A)
      // 关键反证：绝不能跟着当前 active 跑
      expect(out.token).not.toBe(TOKEN_B)
      expect(out.slotId).toBe('slot-a')
      expect(out.slotName).toBe('主 Token')
    })

    it('🔴 阴性对照：老任务（无引用字段）→ 读回 null，解析返回 no-ref（行为与改造前一致）', () => {
      const legacySnapshot = { figmaToken: '***REDACTED***', outputPath: '/x' }
      expect(readFigmaCredentialRef(legacySnapshot)).toBeNull()
      expect(readFigmaCredentialRef(null)).toBeNull()
      expect(readFigmaCredentialRef({ figmaCredentialFp: '   ' })).toBeNull()

      const out = resolveFigmaTokenByRef(null, cfgTwoSlots('slot-a'))
      expect(out.token).toBeNull()
      expect(out.reason).toBe('no-ref')
    })

    it('🔴 指纹在所有槽位都找不到 → null，且禁止回落当前 active', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      // 用户把两个槽位都换了，当时的 token 已物理消失
      const out = resolveFigmaTokenByRef(ref, {
        figmaTokens: [
          { id: 'slot-a', token: 'figd_zzz9999999999999999999999999ENDz' },
          { id: 'slot-b', token: 'figd_yyy8888888888888888888888888ENDy' },
        ],
        activeFigmaTokenId: 'slot-b',
      })
      expect(out.token).toBeNull()
      expect(out.reason).not.toBe('matched')
      // 若实现里出现 `|| active.token` 这类回落，下面两条之一必失败
      expect(out.token).not.toBe('figd_yyy8888888888888888888888888ENDy')
      expect(out.token).not.toBe(TOKEN_B)
    })

    it('同 id 槽位还在但 token 被覆盖写 → slot-overwritten（可给出精确归因）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      const overwritten = 'figd_new555555555555555555555555ENDn'
      const out = resolveFigmaTokenByRef(ref, {
        figmaTokens: [{ id: 'slot-a', name: '主 Token', token: overwritten }],
        activeFigmaTokenId: 'slot-a',
      })
      expect(out.token).toBeNull()
      expect(out.reason).toBe('slot-overwritten')
      expect(out.overwrittenSlotId).toBe('slot-a')
    })

    it('槽位整体被删除 → not-found（与「被覆盖」区分开，文案不同）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      const out = resolveFigmaTokenByRef(ref, {
        figmaTokens: [{ id: 'slot-b', token: TOKEN_B }],
        activeFigmaTokenId: 'slot-b',
      })
      expect(out.token).toBeNull()
      expect(out.reason).toBe('not-found')
    })

    it('短指纹不可比对：即便配置里就摆着那个 token，也不得返回（reason=fingerprint-unusable）', () => {
      const ref = buildFigmaCredentialRef({ figmaToken: SHORT_TOKEN })!
      const out = resolveFigmaTokenByRef(ref, { figmaToken: SHORT_TOKEN })
      expect(out.token).toBeNull()
      expect(out.reason).toBe('fingerprint-unusable')
    })

    it('一个可用 token 都没有 → no-slots（不崩、不返回空串）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      expect(resolveFigmaTokenByRef(ref, { figmaTokens: [] }).reason).toBe('no-slots')
      expect(resolveFigmaTokenByRef(ref, {}).reason).toBe('no-slots')
      expect(resolveFigmaTokenByRef(ref, null).reason).toBe('no-slots')
    })

    it('历史单值 token 场景闭环：当时单值建的，现在仍是单值 → matched', () => {
      const ref = buildFigmaCredentialRef({ figmaToken: TOKEN_LEGACY })!
      const out = resolveFigmaTokenByRef(ref, { figmaToken: TOKEN_LEGACY })
      expect(out.reason).toBe('matched')
      expect(out.token).toBe(TOKEN_LEGACY)
      expect(out.slotId).toBeNull()
    })

    it('单值 → 物化成槽位后仍可解析（历史 token 迁移不丢引用）', () => {
      const ref = buildFigmaCredentialRef({ figmaToken: TOKEN_LEGACY })!
      const out = resolveFigmaTokenByRef(ref, {
        figmaTokens: [{ id: 'figma-1', name: '主 Token', token: TOKEN_LEGACY }],
        activeFigmaTokenId: 'figma-1',
      })
      expect(out.reason).toBe('matched')
      expect(out.token).toBe(TOKEN_LEGACY)
      expect(out.slotId).toBe('figma-1')
    })
  })

  describe('D. 纯函数性质', () => {
    it('build / resolve / toFields 都不修改入参', () => {
      const config = cfgTwoSlots('slot-a')
      const snapshot = JSON.stringify(config)
      const ref = buildFigmaCredentialRef(config)!
      resolveFigmaTokenByRef(ref, config)
      toFigmaCredentialRefFields(ref)
      listFigmaCredentialCandidates(config)
      expect(JSON.stringify(config)).toBe(snapshot)
    })

    it('幂等：同输入同输出', () => {
      const config = cfgTwoSlots('slot-b')
      expect(buildFigmaCredentialRef(config)).toEqual(buildFigmaCredentialRef(config))
    })

    it('读回 → 解析链路闭环（模拟真实：落盘前摊平、复用时读回）', () => {
      const ref = buildFigmaCredentialRef(cfgTwoSlots('slot-a'))!
      const persisted = JSON.parse(
        JSON.stringify(redactSecrets(toFigmaCredentialRefFields(ref))),
      )
      const restored = readFigmaCredentialRef(persisted)!
      expect(restored).toEqual(ref)
      expect(resolveFigmaTokenByRef(restored, cfgTwoSlots('slot-b')).token).toBe(TOKEN_A)
    })
  })
})

/**
 * 「凭证是否已经变了」的判定（诉求五 #16-②）。
 *
 * 要证明的核心事实（也是旧实现的缺陷）：**任务 pin 的是非 active 槽位时，不能算「变了」。**
 *   方案 A 落地后「历史任务沿用当时那个 token」是正常语义，而 current 指纹只取 active 槽
 *   ⇒ 旧口径 `taskFingerprint !== currentFingerprint` 会把每一次正确沿用都误报成「凭证已变」。
 *
 * 三组判据：
 *   A. `changed=false`：pin 非 active 槽 / pin active 槽 —— 都算「那个还在」；
 *   B. `changed=true`：槽位被改写 / token 被删（not-found）—— 那个**真的**没了；
 *   C. `changed=undefined`：无引用（老任务）/ 指纹退化 `****`（无法比对）—— 两种成因不同，靠 reason 区分。
 */
describe('Figma 凭证漂移判定（assessFigmaCredentialDrift）', () => {
  const TOKEN_A = 'figd_aaa1111111111111111111111111ENDa'
  const TOKEN_B = 'figd_bbb2222222222222222222222222ENDb'
  const TOKEN_GONE = 'figd_ggg9999999999999999999999999ENDg'
  const SHORT_TOKEN = 'tok12345' // 8 字符 → 指纹退化为 '****'

  const cfg = (activeId: 'slot-a' | 'slot-b') => ({
    figmaToken: activeId === 'slot-b' ? TOKEN_B : TOKEN_A,
    figmaTokens: [
      { id: 'slot-a', name: '主 Token', token: TOKEN_A },
      { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
    ],
    activeFigmaTokenId: activeId,
  })

  const taskWith = (fp: string, slotId: string | null, slotName: string | null) => ({
    sessionId: 'mc-lite-1',
    ...toFigmaCredentialRefFields({ fp, slotId, slotName })!,
  })

  describe('A. 仍在 ⇒ changed=false（含旧口径误报复现）', () => {
    it('任务 pin 非 active 槽（slot-a），用户已切到 slot-b ⇒ 不是「变了」', () => {
      const task = taskWith(maskSecretFingerprint(TOKEN_A)!, 'slot-a', '主 Token')
      const drift = assessFigmaCredentialDrift(task, cfg('slot-b'))

      expect(drift.hasRef).toBe(true)
      expect(drift.changed).toBe(false)
      expect(drift.reason).toBe('matched')
      // 阳性对照：旧口径（active 指纹相减）在这里会得出 true —— 这就是本次要消灭的误报
      const oldChanged =
        task.figmaCredentialFp !== maskSecretFingerprint(cfg('slot-b').figmaToken)
      expect(oldChanged).toBe(true)
    })

    it('任务 pin 的正是 active 槽 ⇒ 同样是 false（不因口径改变而变红）', () => {
      const task = taskWith(maskSecretFingerprint(TOKEN_B)!, 'slot-b', 'smigoo')
      expect(assessFigmaCredentialDrift(task, cfg('slot-b')).changed).toBe(false)
    })
  })

  describe('B. 真的没了 ⇒ changed=true', () => {
    it('槽位被改写（同 id 还在但内容变了）→ slot-overwritten', () => {
      const task = taskWith(maskSecretFingerprint(TOKEN_GONE)!, 'slot-a', '主 Token')
      const drift = assessFigmaCredentialDrift(task, cfg('slot-a'))

      expect(drift.changed).toBe(true)
      expect(drift.reason).toBe('slot-overwritten')
    })

    it('token 已被删除（无槽位可指认）→ not-found', () => {
      const task = taskWith(maskSecretFingerprint(TOKEN_GONE)!, null, null)
      const drift = assessFigmaCredentialDrift(task, cfg('slot-b'))

      expect(drift.changed).toBe(true)
      expect(drift.reason).toBe('not-found')
    })

    it('当前配置一个槽位都没有 → no-slots（同样算「不可用」）', () => {
      const task = taskWith(maskSecretFingerprint(TOKEN_A)!, 'slot-a', '主 Token')
      const drift = assessFigmaCredentialDrift(task, {})

      expect(drift.changed).toBe(true)
      expect(drift.reason).toBe('no-slots')
    })
  })

  describe('C. 无从对照 ⇒ changed=undefined（不猜）', () => {
    it('老任务没有引用 → hasRef=false + no-ref', () => {
      const drift = assessFigmaCredentialDrift({ sessionId: 'legacy' }, cfg('slot-a'))

      expect(drift.hasRef).toBe(false)
      expect(drift.changed).toBeUndefined()
      expect(drift.reason).toBe('no-ref')
    })

    it('指纹退化为 **** → 无法比对，既不说变了也不说没变', () => {
      const task = taskWith(maskSecretFingerprint(SHORT_TOKEN)!, null, null)
      const drift = assessFigmaCredentialDrift(task, cfg('slot-a'))

      expect(drift.hasRef).toBe(true)
      expect(drift.changed).toBeUndefined()
      expect(drift.reason).toBe('fingerprint-unusable')
    })

    it('引用只落在 configSnapshot 上（创建期写入）同样生效', () => {
      const task = {
        sessionId: 'mc-lite-2',
        configSnapshot: toFigmaCredentialRefFields({
          fp: maskSecretFingerprint(TOKEN_A)!,
          slotId: 'slot-a',
          slotName: '主 Token',
        }),
      }
      const drift = assessFigmaCredentialDrift(task, cfg('slot-b'))

      expect(drift.changed).toBe(false)
      expect(drift.reason).toBe('matched')
    })
  })
})
