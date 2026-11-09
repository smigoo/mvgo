import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import { REDACTED_PLACEHOLDER } from '../common/utils/redact'
import { FIGMA_CREDENTIAL_FP_FIELD } from './figma-credential'
import {
  FIGMA_CREDENTIAL_REF_FIELDS,
  buildFigmaCredentialRef,
  buildFigmaCredentialRefForToken,
  isRedactedPlaceholder,
  resolveExecutionFigmaToken,
  toFigmaCredentialRefFields,
} from './figma-credential-ref'

/**
 * 执行期取 Figma Token 判据（2026-11-09 · 诉求五 #14）。
 *
 * 要钉死的事实：**「点历史任务重试」发出去的 token 是任务当时那个，不是用户此刻 active 那个。**
 * 这条主判据用「阳性 + 阴性对照」成对证明，缺一半就是假绿：
 *
 *   阳性：用 A 建任务 → 用户切到 B → 重试（前端把当前 config 整个回传）→ 必须用回 A。
 *   阴性：什么都没切 → 取到的 token 与当时一致（证明「修复」不是靠恒定返回某个固定值实现的）。
 *
 * 另外三组是**回归防线**，对应本次一并修的三个坑：
 *   B. 脱敏占位 `'***REDACTED***'` 是非空字符串 ⇒ 必须被当「没传」，否则假 token 会一路打到 Figma。
 *   C. 无命中不得静默 —— 回落可以，但必须留 reason + note（Figma 对无权限文件返回 404，
 *      凭证问题会伪装成「文件不存在」，没有归因就排不出）。
 *   D. 回写语义 —— 首次执行才 pin，已有引用一律不覆盖（一次异常执行不能把任务钉死在错凭证上）。
 */

const TOKEN_A = 'figd_aaa1111111111111111111111111ENDa'
const TOKEN_B = 'figd_bbb2222222222222222222222222ENDb'
const TOKEN_C = 'figd_ccc3333333333333333333333333ENDc'
const SHORT_TOKEN = 'tok12345' // 8 字符 → 指纹退化为 '****'

const cfg = (activeId: 'slot-a' | 'slot-b') => ({
  figmaToken: activeId === 'slot-b' ? TOKEN_B : TOKEN_A,
  figmaTokens: [
    { id: 'slot-a', name: '主 Token', token: TOKEN_A },
    { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
  ],
  activeFigmaTokenId: activeId,
})

/** 模拟 createTask 落盘后**被脱敏**的任务记录（fp/slot 幸存，figmaToken 变占位）。 */
const redactedTaskCreatedWith = (token: string, activeId: string) => {
  const ref = buildFigmaCredentialRefForToken(token, cfg(activeId as 'slot-a'))!
  return {
    sessionId: 'mc-lite-1',
    configSnapshot: {
      ...cfg(activeId as 'slot-a'),
      figmaToken: REDACTED_PLACEHOLDER,
      ...toFigmaCredentialRefFields(ref),
    },
    ...toFigmaCredentialRefFields(ref),
  }
}

describe('执行期取 Figma Token（resolveExecutionFigmaToken）', () => {
  describe('A. 主判据：沿用任务当时的 token（阳性 + 阴性对照）', () => {
    it('阳性（用户实报场景）：A 建任务 → 切到 B → 重试仍用 A，并标记「已忽略请求回传的 token」', () => {
      const task = redactedTaskCreatedWith(TOKEN_A, 'slot-a')
      // 重试时前端把**当前**配置整个回传：active=slot-b，figmaToken=TOKEN_B
      const out = resolveExecutionFigmaToken({
        task,
        requestConfig: cfg('slot-b'),
        activeConfig: cfg('slot-b'),
      })

      expect(out.token).toBe(TOKEN_A)
      expect(out.source).toBe('ref')
      expect(out.reason).toBe('matched')
      expect(out.requestOverridden).toBe(true)
      expect(out.ref?.slotId).toBe('slot-a')
      // 归因必须点名「沿用当时」，否则真机日志里看不出走的是哪条分支
      expect(out.note).toContain('沿用任务当时的 Figma Token')
    })

    it('阴性对照：未切换（active 仍是 A）→ token 与当时逐字一致，零漂移', () => {
      const task = redactedTaskCreatedWith(TOKEN_A, 'slot-a')
      const out = resolveExecutionFigmaToken({
        task,
        requestConfig: cfg('slot-a'),
        activeConfig: cfg('slot-a'),
      })

      expect(out.token).toBe(TOKEN_A)
      expect(out.requestOverridden).toBe(false)
      expect(out.note).not.toContain('已忽略请求回传的当前 token')
    })

    it('反证（无引用时按当前凭证走，证明上面两组不是恒返回 TOKEN_A）', () => {
      const out = resolveExecutionFigmaToken({
        requestConfig: cfg('slot-b'),
        activeConfig: cfg('slot-b'),
      })
      expect(out.source).toBe('request')
      expect(out.token).toBe(TOKEN_B)
      expect(out.reason).toBe('no-ref')
    })

    it('任务顶层引用优先于 configSnapshot（pipeline 执行期写入更贴近真实调用）', () => {
      const snapshotRef = toFigmaCredentialRefFields(
        buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!,
      )!
      const pipelineRef = toFigmaCredentialRefFields(
        buildFigmaCredentialRefForToken(TOKEN_B, cfg('slot-b'))!,
      )!
      const out = resolveExecutionFigmaToken({
        task: { configSnapshot: { ...cfg('slot-b'), ...snapshotRef }, ...pipelineRef },
        activeConfig: cfg('slot-a'),
      })
      expect(out.token).toBe(TOKEN_B)
      expect(out.refSource).toBe('pipeline')
    })

    it('引用随请求 config 携带（重试把 configSnapshot 当 config）也能命中 → refSource=request', () => {
      const out = resolveExecutionFigmaToken({
        // 没有 task 记录可读，只有回传的 config
        requestConfig: { ...cfg('slot-b'), figmaToken: REDACTED_PLACEHOLDER, ...toFigmaCredentialRefFields(buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!) },
        activeConfig: cfg('slot-b'),
      })
      expect(out.token).toBe(TOKEN_A)
      expect(out.source).toBe('ref')
      expect(out.refSource).toBe('request')
    })
  })

  describe('B. 假值防线：脱敏占位 / 空白一律当「没传」', () => {
    it('requestConfig.figmaToken 是占位时不进请求分支（否则假 token 会打到 Figma）', () => {
      const out = resolveExecutionFigmaToken({
        requestConfig: { figmaToken: REDACTED_PLACEHOLDER },
        activeConfig: cfg('slot-a'),
      })
      expect(out.token).toBe(TOKEN_A)
      expect(out.source).toBe('active')
      expect(out.token).not.toBe(REDACTED_PLACEHOLDER)
    })

    it('requestToken 显式传占位同样被过滤（测试注入路径也不许放水）', () => {
      const out = resolveExecutionFigmaToken({
        requestToken: REDACTED_PLACEHOLDER,
        activeConfig: cfg('slot-a'),
      })
      expect(out.source).toBe('active')
      expect(out.token).toBe(TOKEN_A)
    })

    it('空白串等同没传', () => {
      const out = resolveExecutionFigmaToken({
        requestConfig: { figmaToken: '   ' },
        activeConfig: cfg('slot-a'),
      })
      expect(out.source).toBe('active')
    })

    it('全空 → token=null / source=none（调用方按原口径报错，不返回空串）', () => {
      const out = resolveExecutionFigmaToken({})
      expect(out.token).toBeNull()
      expect(out.source).toBe('none')
      expect(out.reason).toBe('no-ref')
    })

    it('isRedactedPlaceholder 只认占位本身（不是「含 REDACTED 子串」）', () => {
      expect(isRedactedPlaceholder(REDACTED_PLACEHOLDER)).toBe(true)
      expect(isRedactedPlaceholder(` ${REDACTED_PLACEHOLDER} `)).toBe(true)
      expect(isRedactedPlaceholder('***REDACTED***x')).toBe(false)
      expect(isRedactedPlaceholder(TOKEN_A)).toBe(false)
      expect(isRedactedPlaceholder(null)).toBe(false)
    })
  })

  describe('C. 无命中不得静默：回落但必须留 reason + note', () => {
    it('当时的 token 已从配置里删掉 → not-found，回落当前凭证，且 note 提示 404 会伪装成「文件不存在」', () => {
      const refA = buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!
      const out = resolveExecutionFigmaToken({
        task: { ...toFigmaCredentialRefFields(refA) },
        // 现在只剩 TOKEN_C 了
        activeConfig: { figmaToken: TOKEN_C },
      })

      expect(out.reason).toBe('not-found')
      expect(out.source).toBe('active')
      expect(out.token).toBe(TOKEN_C)
      expect(out.note).toContain('已不在配置中')
      expect(out.note).toContain('已回落当前凭证')
      expect(out.note).toContain('404')
      // 不得声称命中
      expect(out.note).not.toContain('沿用任务当时的 Figma Token')
    })

    it('槽位 id 还在但 token 已被改写 → slot-overwritten，note 点名该槽位', () => {
      const refA = buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!
      const out = resolveExecutionFigmaToken({
        task: { ...toFigmaCredentialRefFields(refA) },
        activeConfig: {
          figmaToken: TOKEN_C,
          figmaTokens: [{ id: 'slot-a', name: '主 Token', token: TOKEN_C }],
          activeFigmaTokenId: 'slot-a',
        },
      })
      expect(out.reason).toBe('slot-overwritten')
      expect(out.note).toContain('slot-a')
    })

    it('短 token 的指纹为 **** → fingerprint-unusable（宁可不匹配，也不能错配）', () => {
      const refShort = buildFigmaCredentialRefForToken(SHORT_TOKEN, {
        figmaToken: SHORT_TOKEN,
      })!
      expect(refShort.fp).toBe('****')
      const out = resolveExecutionFigmaToken({
        task: { ...toFigmaCredentialRefFields(refShort) },
        activeConfig: { figmaToken: TOKEN_C },
      })
      expect(out.reason).toBe('fingerprint-unusable')
      expect(out.token).toBe(TOKEN_C) // 回落，但不冒充命中
    })

    it('用户一个 token 都没有 → no-slots，且 token 为 null', () => {
      const refA = buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!
      const out = resolveExecutionFigmaToken({
        task: { ...toFigmaCredentialRefFields(refA) },
        activeConfig: {},
      })
      expect(out.reason).toBe('no-slots')
      expect(out.token).toBeNull()
      expect(out.source).toBe('none')
    })
  })

  describe('D. 回写语义：首次 pin，已有引用绝不覆盖', () => {
    it('首次执行（无引用）→ 给出 refFields，指纹对应本次实际用的 token', () => {
      const out = resolveExecutionFigmaToken({
        requestConfig: { figmaToken: TOKEN_A },
        activeConfig: cfg('slot-a'),
      })
      expect(out.refFields).not.toBeNull()
      expect(out.refFields![FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(
        maskSecretFingerprint(TOKEN_A),
      )
      expect(out.refFields![FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-a')
    })

    it('引用命中时 refFields 为 null（不允许重写，避免把 pin 洗成当前 token）', () => {
      const task = redactedTaskCreatedWith(TOKEN_A, 'slot-a')
      const out = resolveExecutionFigmaToken({
        task,
        requestConfig: cfg('slot-b'),
        activeConfig: cfg('slot-b'),
      })
      expect(out.refFields).toBeNull()
    })

    it('无引用且无任何 token → refFields 为 null（不写空引用）', () => {
      expect(resolveExecutionFigmaToken({}).refFields).toBeNull()
    })

    it('pin 的指纹能被下一轮解析命中（写 → 读闭环）', () => {
      const first = resolveExecutionFigmaToken({
        requestConfig: { figmaToken: TOKEN_A },
        activeConfig: cfg('slot-a'),
      })
      // 落盘后（脱敏）再读：引用必须仍在
      const persistedTask = { ...first.refFields }
      const second = resolveExecutionFigmaToken({
        task: persistedTask,
        requestConfig: cfg('slot-b'),
        activeConfig: cfg('slot-b'),
      })
      expect(second.token).toBe(TOKEN_A)
      expect(second.source).toBe('ref')
      expect(second.refFields).toBeNull()
    })
  })

  describe('E. 安全与副作用', () => {
    it('note 永不含明文 token（日志/任务详情会直接落这条文案）', () => {
      const scenarios = [
        { task: redactedTaskCreatedWith(TOKEN_A, 'slot-a'), requestConfig: cfg('slot-b'), activeConfig: cfg('slot-b') },
        { requestConfig: cfg('slot-a'), activeConfig: cfg('slot-a') },
        { task: { ...toFigmaCredentialRefFields(buildFigmaCredentialRefForToken(TOKEN_A, cfg('slot-a'))!) }, activeConfig: { figmaToken: TOKEN_C } },
        {},
      ]
      for (const s of scenarios) {
        const out = resolveExecutionFigmaToken(s)
        expect(out.note).not.toContain(TOKEN_A)
        expect(out.note).not.toContain(TOKEN_B)
        expect(out.note).not.toContain(TOKEN_C)
      }
    })

    it('不修改入参（task / requestConfig / activeConfig 原样）', () => {
      const task = redactedTaskCreatedWith(TOKEN_A, 'slot-a')
      const requestConfig = cfg('slot-b')
      const activeConfig = cfg('slot-b')
      const snap = JSON.stringify({ task, requestConfig, activeConfig })
      resolveExecutionFigmaToken({ task, requestConfig, activeConfig })
      expect(JSON.stringify({ task, requestConfig, activeConfig })).toBe(snap)
    })

    it('env 兜底只在最后生效（有 active 时不许 env 抢位）', () => {
      const withActive = resolveExecutionFigmaToken({
        activeConfig: cfg('slot-a'),
        envToken: TOKEN_C,
      })
      expect(withActive.source).toBe('active')
      expect(withActive.token).toBe(TOKEN_A)

      const envOnly = resolveExecutionFigmaToken({ envToken: TOKEN_C })
      expect(envOnly.source).toBe('env')
      expect(envOnly.token).toBe(TOKEN_C)
    })
  })

  describe('F. 字段名单一来源（跨模块防漂移）', () => {
    it('feedback.service 使用的 FIGMA_CREDENTIAL_FP_FIELD 与引用模块同名', () => {
      // 两处字面量分别定义在不同模块，一旦改名必然一边漏改 ⇒ 用判据钉住
      expect(FIGMA_CREDENTIAL_FP_FIELD).toBe(FIGMA_CREDENTIAL_REF_FIELDS.fp)
    })

    it('三字段键名均不命中脱敏正则（含 token / secret 等子串即会被抹掉）', () => {
      const secretRe = /(token|apikey|secret|password|authorization|access[_-]?token)/i
      for (const key of Object.values(FIGMA_CREDENTIAL_REF_FIELDS)) {
        expect(secretRe.test(key)).toBe(false)
      }
      // 阳性对照：真正该被抹的键名确实命中
      expect(secretRe.test('figmaToken')).toBe(true)
    })
  })
})
