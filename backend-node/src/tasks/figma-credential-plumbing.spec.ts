// backend-root.js 为历史遗留 ESM 风格文件（const __filename 与 ts-jest CJS 包装器参数撞名），
// 且 tasks.service 构造期会 loadSync 读 data/tasks.json ⇒ 必须把 dataDir 指到临时目录。
jest.mock('../config/backend-root.js', () => {
  const { mkdirSync } = require('fs')
  const { join } = require('path')
  const { tmpdir } = require('os')
  const root = join(tmpdir(), 'mvgo-figma-ref-plumbing')
  mkdirSync(join(root, 'data'), { recursive: true })
  return {
    backendRoot: root,
    projectRoot: root,
    workspaceRoot: root,
    customComponentsDir: join(root, 'custom-components'),
    vue3ComponentsDir: join(root, 'vue3-components'),
    resolveFrontendWorkspacePath: () => root,
    frontendCustomComponentsDir: () => join(root, 'custom-components'),
    frontendVue3ComponentsDir: () => join(root, 'vue3-components'),
    tempComponentsDir: join(root, 'temp-components'),
    dataDir: join(root, 'data'),
    logsDir: join(root, 'logs'),
    configDir: join(root, 'config'),
    chatAttachmentsDir: join(root, 'chat-attachments'),
    apifoxZipsDir: join(root, 'apifox-zips'),
    apiCatalogsDir: join(root, 'api-catalogs'),
  }
}, { virtual: true })
// archiver@8 是纯 ESM ⇒ 顶层 require 在 jest(CJS) 下必炸
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }))

import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import { FIGMA_CREDENTIAL_REF_FIELDS, readTaskFigmaCredentialRef, resolveFigmaTokenByRef } from '../config/figma-credential-ref'
import { AiConfigService } from '../config/config.service'
import { TasksService } from './tasks.service'

/**
 * 「任务 ↔ 当时那个 Figma token」落盘/搬运/继承的接线判据（2026-11-09）。
 *
 * 为什么单独一个套件：`tasks-config-snapshot.spec.ts` 与 `config.service.spec.ts` 已腐化
 * （分别 spy 不存在的 `TasksService#load`、调用不存在的 `saveAiConfig`），整套件的断言
 * 一条都跑不到。**腐化的判据不能用来证明新改动**，故这里用能跑的方式重搭最小骨架，
 * 只钉这次改动引入的事实。
 *
 * 四条主线：
 *   A. 建快照时按「实际生效 token」记账（请求覆盖优先于 active 槽位）；
 *   B. createTask 把它提到任务顶层，且 token 明文被抹、引用幸存（正是 bug 的形态）；
 *   C. createRetryTask 继承（重试的唯一目的就是复现当时那次生成）；
 *   D. 端到端：建任务 → 切 active → 仍能解析出当时的 token。
 *
 * 阴性对照贯穿每个分支：老任务（无引用）必须零漂移 —— 不多出字段、不改变既有行为。
 */
describe('任务 Figma 凭证引用接线（plumbing）', () => {
  const TOKEN_A = 'figd_aaa1111111111111111111111111ENDa'
  const TOKEN_B = 'figd_bbb2222222222222222222222222ENDb'

  const twoSlots = (activeId: string) => ({
    figmaTokens: [
      { id: 'slot-a', name: '主 Token', token: TOKEN_A },
      { id: 'slot-b', name: 'smigoo', token: TOKEN_B },
    ],
    activeFigmaTokenId: activeId,
    figmaToken: activeId === 'slot-b' ? TOKEN_B : TOKEN_A,
  })

  const makeAiConfig = () =>
    new AiConfigService({ getUserConfig: async () => null } as any, null as any)

  const makeTasks = () => {
    const service = new TasksService()
    ;(service as any).persist = jest.fn()
    ;(service as any).tasks.clear()
    return service
  }

  describe('A. buildTaskConfigSnapshot 记账', () => {
    it('按 active 槽位记账：fp/slotId/slotName 齐落，且快照里的 figmaToken 仍是明文', () => {
      const svc = makeAiConfig()
      const snap = svc.buildTaskConfigSnapshot(twoSlots('slot-b'))

      expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(maskSecretFingerprint(TOKEN_B))
      expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-b')
      expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.slotName]).toBe('smigoo')
      // 快照是「创建时刻的审计配置」，此阶段不脱敏（脱敏发生在 createTask / 落盘）
      expect(snap.figmaToken).toBe(TOKEN_B)
    })

    it('🔴 请求级覆盖优先：显式传入非 active 的 token ⇒ 记的是它，不是 active 槽位', () => {
      const svc = makeAiConfig()
      const snap = svc.buildTaskConfigSnapshot({ ...twoSlots('slot-b'), figmaToken: TOKEN_A })

      // 若实现按 active 槽位记账（而不是按 merged.figmaToken），下面第一条必失败
      expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(maskSecretFingerprint(TOKEN_A))
      expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-a')
    })

    it('阴性对照：完全没有 figma token ⇒ 快照里不含该键（不写空引用）', () => {
      const svc = makeAiConfig()
      const snap = svc.buildTaskConfigSnapshot({ textModel: 'qwen-plus' })
      expect(FIGMA_CREDENTIAL_REF_FIELDS.fp in snap).toBe(false)
      expect(FIGMA_CREDENTIAL_REF_FIELDS.slotId in snap).toBe(false)
    })

    it('.strict() 未被放松：臆造字段仍抛 400（漏登记新字段会让整条链路建不起来，故必须留此反证）', () => {
      const svc = makeAiConfig()
      expect(() => svc.buildTaskConfigSnapshot({ unknownCredentialField: 'x' })).toThrow(
        /配置字段不合法/,
      )
      // 三个新字段本身必须被接受（这是本改动的正证）
      expect(() =>
        svc.buildTaskConfigSnapshot({
          figmaToken: TOKEN_A,
          [FIGMA_CREDENTIAL_REF_FIELDS.fp]: 'figd_a****ENDa',
          [FIGMA_CREDENTIAL_REF_FIELDS.slotId]: 'slot-a',
          [FIGMA_CREDENTIAL_REF_FIELDS.slotName]: '主 Token',
        }),
      ).not.toThrow()
    })
  })

  describe('B. createTask 搬运（token 明文消失、引用幸存）', () => {
    it('🔴 脱敏后 configSnapshot.figmaToken 被抹，但顶层引用三字段完整', () => {
      const ai = makeAiConfig()
      const tasks = makeTasks()
      const snap = ai.buildTaskConfigSnapshot(twoSlots('slot-a'))

      const task = tasks.createTask('sess-1', { componentId: 'c-1', configSnapshot: snap })

      // 控制组：明文确实被抹掉（bug 的成因）
      expect(task.configSnapshot!.figmaToken).toBe('***REDACTED***')
      expect(task.configSnapshot!.activeFigmaTokenId).toBe('***REDACTED***')
      // 实验组：引用穿过去了
      expect(task.figmaCredentialFp).toBe(maskSecretFingerprint(TOKEN_A))
      expect(task.figmaCredentialSlotId).toBe('slot-a')
      expect(task.figmaCredentialSlotName).toBe('主 Token')
      // 快照里那一份也要在（历史接口整体回传时用）
      expect(task.configSnapshot![FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(
        maskSecretFingerprint(TOKEN_A),
      )
    })

    it('阴性对照：老任务形态（快照无引用、无 token）⇒ 任务上不多出任何引用字段', () => {
      const tasks = makeTasks()
      const task = tasks.createTask('sess-legacy', {
        componentId: 'c-2',
        configSnapshot: { textModel: 'qwen-plus', figmaToken: '***REDACTED***' },
      })
      expect(FIGMA_CREDENTIAL_REF_FIELDS.fp in task).toBe(false)
      expect(FIGMA_CREDENTIAL_REF_FIELDS.slotId in task).toBe(false)
      expect(readTaskFigmaCredentialRef(task as any).ref).toBeNull()
    })

    it('metadata 顶层引用优先于快照（pipeline 执行期写入形态）', () => {
      const tasks = makeTasks()
      const task = tasks.createTask('sess-3', {
        componentId: 'c-3',
        figmaCredentialFp: maskSecretFingerprint(TOKEN_B)!,
        figmaCredentialSlotId: 'slot-b',
        configSnapshot: {
          figmaToken: 'x',
          [FIGMA_CREDENTIAL_REF_FIELDS.fp]: maskSecretFingerprint(TOKEN_A),
          [FIGMA_CREDENTIAL_REF_FIELDS.slotId]: 'slot-a',
        },
      })
      expect(task.figmaCredentialSlotId).toBe('slot-b')
      expect(readTaskFigmaCredentialRef(task as any).source).toBe('pipeline')
    })
  })

  describe('C. createRetryTask 继承', () => {
    it('重试任务带走同一份引用（重试 = 复现当时那次生成）', () => {
      const ai = makeAiConfig()
      const tasks = makeTasks()
      const snap = ai.buildTaskConfigSnapshot(twoSlots('slot-b'))
      tasks.createTask('sess-orig', { componentId: 'c-1', configSnapshot: snap, userId: 'u1' })

      const retry = tasks.createRetryTask('sess-orig', 'sess-retry', 'u1')!

      expect(retry.figmaCredentialFp).toBe(maskSecretFingerprint(TOKEN_B))
      expect(retry.figmaCredentialSlotId).toBe('slot-b')
      expect(retry.figmaCredentialSlotName).toBe('smigoo')
      // 越权仍必须被拒（不因新字段改变隔离语义）
      expect(tasks.createRetryTask('sess-orig', 'sess-retry-2', 'other-user')).toBeNull()
    })
  })

  describe('D. 端到端：切过 token 后仍用当时的 token', () => {
    it('🔴 active=A 建任务 → 切到 B → 解析出 A（用户诉求的直接判据）', () => {
      const ai = makeAiConfig()
      const tasks = makeTasks()
      const createdAt = ai.buildTaskConfigSnapshot(twoSlots('slot-a'))
      const task = tasks.createTask('sess-e2e', { componentId: 'c-1', configSnapshot: createdAt })

      // 用户切了 active（其余不变）
      const nowConfig = twoSlots('slot-b')
      const { ref } = readTaskFigmaCredentialRef(task as any)
      const resolved = resolveFigmaTokenByRef(ref, nowConfig)

      expect(resolved.reason).toBe('matched')
      expect(resolved.token).toBe(TOKEN_A)
      expect(resolved.token).not.toBe(nowConfig.figmaToken)
    })

    it('当时的槽位被覆盖写 → 明确给出 slot-overwritten（而不是静默用新 token）', () => {
      const ai = makeAiConfig()
      const tasks = makeTasks()
      const task = tasks.createTask('sess-e2e-2', {
        componentId: 'c-2',
        configSnapshot: ai.buildTaskConfigSnapshot(twoSlots('slot-a')),
      })

      const { ref } = readTaskFigmaCredentialRef(task as any)
      const resolved = resolveFigmaTokenByRef(ref, {
        figmaTokens: [{ id: 'slot-a', name: '主 Token', token: 'figd_new9999999999999999999999ENDn' }],
        activeFigmaTokenId: 'slot-a',
      })
      expect(resolved.token).toBeNull()
      expect(resolved.reason).toBe('slot-overwritten')
      expect(resolved.overwrittenSlotId).toBe('slot-a')
    })
  })
})
