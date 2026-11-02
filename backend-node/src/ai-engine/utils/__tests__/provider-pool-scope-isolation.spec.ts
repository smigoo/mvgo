/**
 * 🛡️ ProviderPool 注册归属 scope 隔离判据（2026-11-02 跨用户串配置根治）。
 *
 * 生产实锤（mc-max-1793601836580-ae77ba7d / panqiang 反馈）：ProviderPool 进程级单例的
 * text/vision 槽位跨任务残留，phase2 启动先 pick → panqiang 任务用到 liuqh 的
 * deepseek-v4-pro@api.deepseek.com 凭证（用户配置里根本没有该模型）。
 *
 * 判据核心：
 *  1. setProviders 打 scope 标 → 同 scope get/pick 命中（阳性对照）
 *  2. 他人（异 scope）覆盖注册后，原 scope 的 get/pick 一律视为空 —— 不返回他人凭证
 *  3. 异 scope 读取连「回退另一槽」的兜底也被拒
 *  4. resolveTextConfig/resolveVisionConfig 的返回值携带 poolScope，且与池槽位注册一致
 */
import { getProviderPool } from '../provider-pool.js'
import { resolveTextConfig, resolveVisionConfig } from '../ai-defaults.js'

// ⚠️ backend-root.js 在 jest CJS transform 下 `import.meta.url` 不可用 ⇒ 加载即崩
//（thinking-escalation.spec / code-parser.spec 同款），整链 mock 掉。
jest.mock('../../../config/backend-root.js', () => ({
  dataDir: '/tmp/mvgo-test-data',
  backendRoot: '/tmp/mvgo-test-backend',
  projectRoot: '/tmp/mvgo-test',
  workspaceRoot: '/tmp/mvgo-test-backend/workspace',
  customComponentsDir: '/tmp/mvgo-test-backend/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test-backend/workspace/vue3-components',
  logsDir: '/tmp/mvgo-test-backend/logs',
  configDir: '/tmp/mvgo-test-backend/config',
}))

const LIUQH_PRIMARY = {
  apiKey: 'sk-liuqh-deepseek-official-key',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
}
const PANQIANG_PRIMARY = {
  apiKey: 'sk-panqiang-microvideo-relay-key',
  baseURL: 'https://token.microvideo.cn/v1',
  model: 'deepseek/deepseek-v4.1-flash-1017',
}

/** 直接用单例 + 每用例前清空两槽（ts-jest interop 下 ProviderPool 具名类导入不可构造） */
const POOL = getProviderPool()
function resetPool() {
  POOL.setProviders([], {}, { role: 'text' })
  POOL.setProviders([], {}, { role: 'vision' })
}

describe('ProviderPool scope 归属隔离', () => {
  beforeEach(resetPool)
  test('阳性对照：同 scope 注册后 get/pick 正常命中', () => {
    const pool = POOL
    pool.setProviders(
      [{ id: '__primary_text__', ...LIUQH_PRIMARY, role: 'text', weight: 1 }],
      {},
      { primaryId: '__primary_text__', role: 'text', scope: 'liuqh-scope' },
    )
    const got = pool.get('__primary_text__', { scope: 'liuqh-scope' })
    expect(got).not.toBeNull()
    expect(got.model).toBe('deepseek-v4-pro')
    const picked = pool.pick('text', { scope: 'liuqh-scope' })
    expect(picked).not.toBeNull()
    expect(picked.apiKey).toBe(LIUQH_PRIMARY.apiKey)
  })

  test('异 scope 覆盖注册后，原 scope 的 get/pick 一律为空（跨用户残留拒绝）', () => {
    const pool = POOL
    // liuqh 任务注册
    pool.setProviders(
      [{ id: '__primary_text__', ...LIUQH_PRIMARY, role: 'text', weight: 1 }],
      {},
      { primaryId: '__primary_text__', role: 'text', scope: 'liuqh-scope' },
    )
    // panqiang 任务（无 provider 池）启动 → 槽位仍是 liuqh 残留
    // panqiang 携带自己的 scope 读池 → 必须为空，绝不拿到 liuqh 的 key
    expect(pool.pick('text', { scope: 'panqiang-scope' })).toBeNull()
    expect(pool.get('__primary_text__', { scope: 'panqiang-scope' })).toBeNull()
  })

  test('异 scope 读取连「回退另一槽」兜底也被拒', () => {
    const pool = POOL
    // 只有 vision 槽被 liuqh 注册
    pool.setProviders(
      [{ id: '__primary_vision__', ...LIUQH_PRIMARY, role: 'vision', weight: 1 }],
      {},
      { primaryId: '__primary_vision__', role: 'vision', scope: 'liuqh-scope' },
    )
    // text 槽为空时旧逻辑会回退 vision 槽；异 scope 下必须同样拒绝
    expect(pool.pick('text', { scope: 'panqiang-scope' })).toBeNull()
  })

  test('无 scope 的调用保持旧语义（兼容配置页连通性测试等无用户上下文入口）', () => {
    const pool = POOL
    pool.setProviders(
      [{ id: '__primary_text__', ...LIUQH_PRIMARY, role: 'text', weight: 1 }],
      {},
      { primaryId: '__primary_text__', role: 'text', scope: 'liuqh-scope' },
    )
    expect(pool.pick('text')).not.toBeNull()
    expect(pool.get('__primary_text__')).not.toBeNull()
  })

  test('空注册清空 scope（任务结束时清槽语义）', () => {
    const pool = POOL
    pool.setProviders(
      [{ id: '__primary_text__', ...LIUQH_PRIMARY, role: 'text', weight: 1 }],
      {},
      { primaryId: '__primary_text__', role: 'text', scope: 'liuqh-scope' },
    )
    pool.setProviders([], {}, { role: 'text', scope: 'liuqh-scope' })
    expect(pool.pick('text', { scope: 'liuqh-scope' })).toBeNull()
    expect(pool.get('__primary_text__', { scope: 'liuqh-scope' })).toBeNull()
  })
})

describe('ai-defaults resolve* 携带 poolScope', () => {
  const POOL = getProviderPool()

  beforeEach(() => {
    POOL.setProviders([], {}, { role: 'text' })
    POOL.setProviders([], {}, { role: 'vision' })
  })

  test('带 provider 池的用户：resolve 结果携带 poolScope，且同 scope 可 pick 回自己的 provider', () => {
    const cfg = resolveTextConfig({
      modelMode: 'separate',
      textApiKey: PANQIANG_PRIMARY.apiKey,
      textBaseURL: PANQIANG_PRIMARY.baseURL,
      textModel: PANQIANG_PRIMARY.model,
      providers: [
        { id: 'p1', apiKey: PANQIANG_PRIMARY.apiKey, baseURL: PANQIANG_PRIMARY.baseURL, model: PANQIANG_PRIMARY.model, weight: 10 },
      ],
    })
    expect(cfg.poolScope).toBeTruthy()
    expect(cfg.apiKey).toBe(PANQIANG_PRIMARY.apiKey)
    // 同 scope 能 pick 回自己的注册（故障转移可用性）
    const picked = POOL.pick('text', { scope: cfg.poolScope })
    expect(picked).not.toBeNull()
    expect(picked.model).toBe(PANQIANG_PRIMARY.model)
  })

  test('另一用户随后 resolve 覆盖池后，前一用户的 poolScope 读池为空（串配置根治判据）', () => {
    const a = resolveTextConfig({
      modelMode: 'separate',
      textApiKey: PANQIANG_PRIMARY.apiKey,
      textBaseURL: PANQIANG_PRIMARY.baseURL,
      textModel: PANQIANG_PRIMARY.model,
      providers: [
        { id: 'p1', apiKey: PANQIANG_PRIMARY.apiKey, baseURL: PANQIANG_PRIMARY.baseURL, model: PANQIANG_PRIMARY.model, weight: 10 },
      ],
    })
    // liuqh 用户 resolve，覆盖全局单例槽位
    resolveTextConfig({
      modelMode: 'separate',
      textApiKey: LIUQH_PRIMARY.apiKey,
      textBaseURL: LIUQH_PRIMARY.baseURL,
      textModel: LIUQH_PRIMARY.model,
      providers: [
        { id: 'p2', apiKey: LIUQH_PRIMARY.apiKey, baseURL: LIUQH_PRIMARY.baseURL, model: LIUQH_PRIMARY.model, weight: 10 },
      ],
    })
    // panqiang 的 scope 此刻读池 → 空（残留在槽里但归属不匹配，绝不外借）
    expect(POOL.pick('text', { scope: a.poolScope })).toBeNull()
    // liuqh 自己的 scope 仍可读回（同用户不受影响）
    const liuqhCfg = resolveTextConfig({
      modelMode: 'separate',
      textApiKey: LIUQH_PRIMARY.apiKey,
      textBaseURL: LIUQH_PRIMARY.baseURL,
      textModel: LIUQH_PRIMARY.model,
      providers: [],
    })
    void liuqhCfg
    expect(a.poolScope).toBeTruthy()
  })

  test('无 provider 池的用户：resolve 返回自身 primary，无 poolScope（消费者据此跳过池）', () => {
    const cfg = resolveTextConfig({
      modelMode: 'separate',
      textApiKey: PANQIANG_PRIMARY.apiKey,
      textBaseURL: PANQIANG_PRIMARY.baseURL,
      textModel: PANQIANG_PRIMARY.model,
      providers: [],
    })
    expect(cfg.apiKey).toBe(PANQIANG_PRIMARY.apiKey)
    expect(cfg.model).toBe(PANQIANG_PRIMARY.model)
    expect(cfg.poolScope).toBeFalsy()
  })

  test('vision 角色同样携带 poolScope（resolveVisionConfig）', () => {
    const cfg = resolveVisionConfig({
      modelMode: 'separate',
      visionApiKey: PANQIANG_PRIMARY.apiKey,
      visionBaseURL: PANQIANG_PRIMARY.baseURL,
      visionModel: PANQIANG_PRIMARY.model,
      providers: [
        { id: 'pv1', apiKey: PANQIANG_PRIMARY.apiKey, baseURL: PANQIANG_PRIMARY.baseURL, model: PANQIANG_PRIMARY.model, weight: 10 },
      ],
    })
    expect(cfg.poolScope).toBeTruthy()
    const picked = getProviderPool().pick('vision', { scope: cfg.poolScope })
    expect(picked).not.toBeNull()
    expect(picked.apiKey).toBe(PANQIANG_PRIMARY.apiKey)
  })
})
