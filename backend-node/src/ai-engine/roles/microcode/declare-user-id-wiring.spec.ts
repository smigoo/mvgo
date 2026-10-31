/**
 * 🛡️ 刀 33b · 用户指定 componentId（P0 高级选项）接线契约
 *
 * ── 缺陷 ──────────────────────────────────────────────────────────────
 * 上游 `code-generator.js#resolveDeclareComponentId` 已按 userComponentId 输出终态 `c-list1`
 * （server.log「🆔 declare componentId 定稿」行），但下游 `normalizeDeclareJson` 不认识
 * userComponentId，把 `c-list1` 当「缺尾段的非规范 id」再 `sanitizeComponentId` 一次
 * ⇒ 终态 `c-list1-cf43d973`（server.log「declare.componentId 已重建为确定性格式」行），
 * 违背 `component-naming.js` 明写的 P0 契约「同名重生成 id 恒定」。
 *
 * ── 治本 ──────────────────────────────────────────────────────────────
 * 优先级裁定收敛为单一来源 `decideDeclareComponentIdFinal`（纯函数，13 例行为判据见
 * `utils/component-naming.declare-id-precedence.spec.ts`）。本 spec 只负责
 * **接线是否真的通**：userComponentId 有没有从 engineer 一路透传到 normalizeDeclareJson 的 opts。
 *
 * ── 为什么 Part A 要开子进程 ───────────────────────────────────────────
 * `code-validator.js` 在 jest 的 **CJS** 模式下无法被 import，两个硬断点：
 *   ① 依赖链末端 logger → `config/backend-root.js` 用 `fileURLToPath(import.meta.url)`
 *      赋 `const __filename` ⇒ ts-jest CJS 包装器下必撞名（`Identifier '__filename' has
 *      already been declared`）。仓库既有对策是「绕开」而非 mock，见 `logger/safe-logger.js`
 *      头注释明写「jest 未启用 --experimental-vm-modules（CJS 模式）」。
 *   ② 函数尾部 `await import('../../validators/code-structure-validator.js')` 是**原生**动态
 *      import，未开 `--experimental-vm-modules` 时直接抛
 *      「A dynamic import callback was invoked without --experimental-vm-modules」。
 * 两条都要求 `--experimental-vm-modules`，而仓库约定不开（开了等于给全仓换测试运行时）。
 * 故 Part A 改为：**spawn 一个真 node 进程**跑真模块图（真 import → 真 validateAndFixGeneratedFiles
 * → 尾部动态 import 原生可用），只在子进程内注入 options 替身。断言仍落在**真函数产物**上，
 * 不是正则恒真。子进程 NODE_OPTIONS 置空，避免沙箱 shim 注入。
 *
 * `microcode-engineer.js` 拆不出来的一部分（同在 backend-root 链上）走 Part B 源码接线断言，
 * 同 `microcode-engineer.font-size-guard.spec.ts` 的既有模式。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'

const BACKEND_ROOT = resolve(__dirname, '../../../..')
const CODE_VALIDATOR = resolve(BACKEND_ROOT, 'src/ai-engine/roles/microcode/code-validator.js')
const COMPONENT_NAMING = resolve(BACKEND_ROOT, 'src/ai-engine/utils/component-naming.js')

const SID = 'mc-max-1793416305379-cf43d973'
const TRACKED = 'c-list1-cf43d973'

/**
 * 子进程脚本（真 ESM）。只在子进程内注入 options 替身：
 * `normalizeDeclareJson` 的 4 行「只赋值」与 engineer 侧逐行同构（engineer 类不可导入，
 * 唯一被镜像的就是这 4 行赋值；**裁定逻辑本身调的是真 `decideDeclareComponentIdFinal`**）。
 */
const CHILD_SCRIPT = `
import { validateAndFixGeneratedFiles } from ${JSON.stringify(CODE_VALIDATOR)}
import { decideDeclareComponentIdFinal } from ${JSON.stringify(COMPONENT_NAMING)}

const SID = ${JSON.stringify(SID)}
const TRACKED = ${JSON.stringify(TRACKED)}
const DECLARE_IN = JSON.stringify({
  componentId: 'c-list1',
  componentName: 'aiot-dpjh-bsjd',
  attribute: { title: '部署节点概览', description: '部署节点概览' },
  businessEvents: { 'c-list1-onload': { type: 'emit', description: '加载完成' } },
}, null, 2)

const noop = () => {}
function makeOptions(sc, spy) {
  return {
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    getInstanceId: () => '',
    stripInstanceIdPrefix: (s) => s,
    ensureRootInstanceId: (s) => s,
    quoteBareObjectKeysInVue: (s) => s,
    extractHeaderTitle: () => '',
    buildIndexLessTemplate: () => ({}),
    ensureIndexVueStyleImport: (s) => s,
    unwrapThemeScopedCommonLess: (s) => s,
    deriveClassPrefix: () => 'c-list1',
    rewriteClickableIconDivsToButtons: (s) => s,
    stripBasePanelShellLeak: (s) => s,
    themeWrapperTemplates: [],
    styleTokens: null,
    componentType: 'microcode',
    userComponentId: sc.userComponentId === undefined ? null : sc.userComponentId,
    normalizeDeclareJson: (parsed, opts) => {
      spy.opts = opts
      const d = parsed
      const decision = decideDeclareComponentIdFinal({
        userComponentId: opts.userComponentId || '',
        checkpointId: sc.engineCheckpointId || '',
        sessionId: sc.engineSessionId || SID,
        llmComponentId: String(d.componentId || ''),
        displayName: opts.displayName || '',
        figmaName: opts.nodeData && opts.nodeData.name ? opts.nodeData.name : '',
        fallbackToken: opts.componentName || '',
      })
      spy.decision = decision
      let changed = false
      if (decision.changed && decision.componentId) { d.componentId = decision.componentId; changed = true }
      return { declare: d, changed }
    },
  }
}

async function run(sc) {
  const spy = {}
  const res = await validateAndFixGeneratedFiles(
    { 'declare.json': DECLARE_IN },
    'aiot-dpjh-bsjd',
    '/tmp/mc-out',
    'dark',
    null,
    null,
    makeOptions(sc, spy),
    null,
  )
  const patched = res.fixedFiles['declare.json']
  return {
    name: sc.name,
    optsUserComponentId: spy.opts && spy.opts.userComponentId !== undefined ? spy.opts.userComponentId : null,
    source: spy.decision ? spy.decision.source : null,
    effectiveId: patched ? JSON.parse(patched).componentId : JSON.parse(DECLARE_IN).componentId,
    declareRewritten: Boolean(patched),
    fixesHasTracked: res.fixes.join('\\n').includes('cf43d973'),
  }
}

const scenarios = [
  { name: 'user', userComponentId: 'c-list1', engineSessionId: SID },
  { name: 'legacy-no-user', userComponentId: undefined, engineSessionId: SID },
  { name: 'user-beats-dirty-checkpoint', userComponentId: 'c-list1', engineSessionId: SID, engineCheckpointId: TRACKED },
  { name: 'dirty-checkpoint-no-user', userComponentId: undefined, engineSessionId: SID, engineCheckpointId: 'c-device-monitor-00g6b7vh-075b13a4' },
]
const out = []
for (const sc of scenarios) out.push(await run(sc))
console.log('__RESULT__' + JSON.stringify(out))
`

let CHILD_STATUS = -1
let CHILD_STDOUT = ''
let CHILD_STDERR = ''
const RESULT: Record<string, any> = {}

beforeAll(() => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_SCRIPT], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, NODE_OPTIONS: '' }, // 清掉沙箱/CI 注入的 NODE_OPTIONS shim
  })
  CHILD_STATUS = r.status === null ? -1 : r.status
  CHILD_STDOUT = r.stdout || ''
  CHILD_STDERR = r.stderr || ''
  const line = CHILD_STDOUT.split('\n').find((l) => l.startsWith('__RESULT__'))
  if (line) {
    for (const item of JSON.parse(line.slice('__RESULT__'.length))) RESULT[item.name] = item
  }
})

describe('A. 真行为接线：真 node 进程跑 code-validator → normalizeDeclareJson', () => {
  it('子进程跑通（真模块图 import + 真 validateAndFixGeneratedFiles）', () => {
    expect(CHILD_STDERR).not.toContain('Identifier \'__filename\' has already been declared')
    expect(CHILD_STATUS).toBe(0)
    expect(Object.keys(RESULT).sort()).toEqual(
      ['dirty-checkpoint-no-user', 'legacy-no-user', 'user', 'user-beats-dirty-checkpoint'].sort(),
    )
  })

  it('① userComponentId 真被放进 normalizeDeclareJson 的 opts（此前漏传 ⇒ 契约静默失效）', () => {
    expect(RESULT.user.optsUserComponentId).toBe('c-list1')
    expect(RESULT['legacy-no-user'].optsUserComponentId).toBe(null)
  })

  it('② ⭐ 实锤复现：user=c-list1 ⇒ 生效 componentId 仍是 c-list1（不再追尾）', () => {
    expect(RESULT.user.source).toBe('user')
    expect(RESULT.user.effectiveId).toBe('c-list1')
    expect(RESULT.user.effectiveId).not.toContain('cf43d973')
    expect(RESULT.user.fixesHasTracked).toBe(false)
  })

  it('③ 阳性对照：不传 userComponentId（旧接线）⇒ 同一输入必然被追尾为 c-list1-cf43d973', () => {
    expect(RESULT['legacy-no-user'].effectiveId).toBe(TRACKED)
    // 「接线」是唯一分水岭：同输入、同替身，只因 opts.userComponentId 缺位就退化
  })

  it('④ 重跑场景：脏检查点 c-list1-cf43d973 在场时，user 仍压过检查点', () => {
    expect(RESULT['user-beats-dirty-checkpoint'].source).toBe('user')
    expect(RESULT['user-beats-dirty-checkpoint'].effectiveId).toBe('c-list1')
  })

  it('⑤ 无 user 时脏检查点仍被闸门自愈收敛（刀 9 行为不回归）', () => {
    const r = RESULT['dirty-checkpoint-no-user']
    expect(r.source).toBe('checkpoint')
    expect(r.effectiveId).toBe('c-device-monitor-cf43d973')
    expect(/^c-device-monitor-[0-9a-f]{8}$/.test(r.effectiveId)).toBe(true)
  })
})

// ==================== B. engineer 侧源码接线（类不可导入，只能文本断言） ====================
const ENGINEER_PATH = join(__dirname, '../microcode-engineer.js')
const engineerSrc = readFileSync(ENGINEER_PATH, 'utf-8')

/** 断言集合抽成函数，便于「变异源码复跑」做阳性对照。 */
function engineerWiringOk(src: string): boolean {
  const importOk =
    /import\s*\{[\s\S]{0,400}decideDeclareComponentIdFinal[\s\S]{0,400}\}\s*from\s*'\.\.\/utils\/component-naming\.js'/.test(
      src,
    )
  // 单一来源硬约束：engineer 内不得再自行判断 id 优先级
  const noLocalPrecedence =
    !/const\s+_sanitized\s*=\s*sanitizeComponentId\(_llmComponentId/.test(src) &&
    !src.includes('buildComponentId(_seg')
  // wrapper 形参新增 userComponentId
  const wrapperParam = src.includes('userComponentId = null,')
  // wrapper 把 userComponentId 放进传给 code-validator 的 options
  const wrapperOptions =
    src.includes('userComponentId: userComponentId || null') &&
    src.includes('normalizeDeclareJson: this.normalizeDeclareJson.bind(this)')
  // 调用点透传（至少 2 处：wrapper 内 options 注入 + execute 调用实参）
  const callSites = (src.match(/userComponentId \|\| null/g) || []).length >= 2
  // 终态裁定必须走单一来源
  const singleSource = src.includes('decideDeclareComponentIdFinal({')
  return (
    importOk &&
    noLocalPrecedence &&
    wrapperParam &&
    wrapperOptions &&
    callSites &&
    singleSource
  )
}

describe('B. microcode-engineer 侧接线契约（源码断言）', () => {
  it('从单一来源导入 decideDeclareComponentIdFinal', () => {
    expect(engineerSrc).toMatch(
      /import\s*\{[\s\S]{0,400}decideDeclareComponentIdFinal[\s\S]{0,400}\}\s*from\s*'\.\.\/utils\/component-naming\.js'/,
    )
  })

  it('终态裁定只调单一来源，engineer 内不得再自行判断优先级（防回归）', () => {
    expect(engineerSrc).toContain('decideDeclareComponentIdFinal({')
    expect(engineerSrc).not.toMatch(
      /const\s+_sanitized\s*=\s*sanitizeComponentId\(_llmComponentId/,
    )
    expect(engineerSrc).not.toContain('buildComponentId(_seg')
  })

  it('validateAndFixGeneratedFiles wrapper 新增 userComponentId 形参并注入 options', () => {
    expect(engineerSrc).toContain('userComponentId = null,')
    expect(engineerSrc).toContain('userComponentId: userComponentId || null')
  })

  it('调用点显式透传 userComponentId || null（≥2 处，否则整链静默失效）', () => {
    expect((engineerSrc.match(/userComponentId \|\| null/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('阳性对照：变异源码必须让上面的断言失败', () => {
  it('摘掉 wrapper options 注入 ⇒ engineerWiringOk 变 false', () => {
    const mutated = engineerSrc.replace('userComponentId: userComponentId || null', '')
    expect(engineerWiringOk(engineerSrc)).toBe(true)
    expect(engineerWiringOk(mutated)).toBe(false)
  })

  it('把终态裁定退回自写 sanitize ⇒ engineerWiringOk 变 false', () => {
    const mutated = engineerSrc.replace(
      'decideDeclareComponentIdFinal({',
      'const _sanitized = sanitizeComponentId(_llmComponentId, {}); ({});',
    )
    expect(engineerWiringOk(mutated)).toBe(false)
  })

  it('删掉 import ⇒ engineerWiringOk 变 false', () => {
    const mutated = engineerSrc.replace('decideDeclareComponentIdFinal,', '')
    expect(engineerWiringOk(mutated)).toBe(false)
  })
})
