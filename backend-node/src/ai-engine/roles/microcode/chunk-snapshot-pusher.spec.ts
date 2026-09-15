import { pushChunkSnapshot } from './chunk-snapshot-pusher.js'

/**
 * ⭐ 依赖 this 的 logger 替身 —— 复现真实 logger（ai-engine/logger/logger.js）的实现方式。
 *
 * 真实 logger 内部是 `this.log('warn', message, meta)`。若实现写成
 * `const warn = logger.warn` 取出**裸引用**，调用时 this === undefined →
 * TypeError: Cannot read properties of undefined (reading 'log') → **整个 Node 进程崩溃**。
 * 普通对象 mock（`{ warn: jest.fn() }`）不依赖 this，测不出这个 bug。
 */
class ThisBoundLogger {
  calls: string[] = []
  log(level: string, message: string) {
    this.calls.push(`${level}:${message}`)
  }
  info(message: string) {
    this.log('info', message)
  }
  warn(message: string) {
    this.log('warn', message)
  }
  error(message: string) {
    this.log('error', message)
  }
}

/**
 * 忠实复刻 microcode-engineer.js 的 worker 调用模式：
 *
 *   const res = await this.runChunk(...)          // ← runChunk 内部 await onFilesReady(...)
 *   Object.assign(allFiles, res.files)            // ← runChunk 外部才合并
 *
 * 关键：runChunk 返回与 caller 的 Object.assign 之间隔着 await 边界，
 * 并行 worker 会在这个边界交错。测试必须保留这个边界，否则抓不到回退。
 */
async function simulateWorker(
  pusher: typeof pushChunkSnapshot,
  allFiles: Record<string, string>,
  resFiles: Record<string, string>,
  pushed: any[],
): Promise<void> {
  await pusher({
    allFiles,
    resFiles,
    onFilesReady: async (d) => {
      pushed.push(d)
    },
    stage: 'microcode-engineer',
    logger: { warn: jest.fn() },
  })
  // runChunk 已返回，但 caller 的 Object.assign 要等下一个微任务 —— 交错的入口
  await Promise.resolve()
  Object.assign(allFiles, resFiles)
}

describe('P1-Slice2 · 分块快照推送（先合并再推送，杜绝并行 worker 交错导致快照回退）', () => {
  it('推送的 files 包含本块结果', async () => {
    const allFiles: Record<string, string> = {}
    const pushed: any[] = []

    await pushChunkSnapshot({
      allFiles,
      resFiles: { 'package/components/A.vue': '<template>A</template>' },
      onFilesReady: async (d) => { pushed.push(d) },
      stage: 'microcode-engineer',
    })

    expect(pushed).toHaveLength(1)
    expect(pushed[0].files['package/components/A.vue']).toContain('A')
    // 本块结果应已合并进 allFiles
    expect(allFiles['package/components/A.vue']).toContain('A')
  })

  it('⭐ 并行 worker 交错时，最后一次推送必须包含所有 worker 的文件（核心回归）', async () => {
    const allFiles: Record<string, string> = {}
    const pushed: any[] = []

    // 两个 worker 并行（genSubComponents 默认并发 2）
    await Promise.all([
      simulateWorker(pushChunkSnapshot, allFiles, { 'package/components/A.vue': 'A' }, pushed),
      simulateWorker(pushChunkSnapshot, allFiles, { 'package/components/B.vue': 'B' }, pushed),
    ])

    const last = pushed[pushed.length - 1]
    // ⭐ 旧实现此处只有 { B }，A 在交错中丢失 —— 正是「之前的不见了」
    expect(Object.keys(last.files).sort()).toEqual([
      'package/components/A.vue',
      'package/components/B.vue',
    ])
    expect(last.files['package/components/A.vue']).toBe('A')
    expect(last.files['package/components/B.vue']).toBe('B')
  })

  it('⭐ 快照指针单调不回退：3 个并行 worker 的推送文件数必须累积递增', async () => {
    const allFiles: Record<string, string> = {}
    const pushed: any[] = []

    await Promise.all(
      ['A', 'B', 'C'].map((name) =>
        simulateWorker(
          pushChunkSnapshot,
          allFiles,
          { [`package/components/${name}.vue`]: name },
          pushed,
        ),
      ),
    )

    const counts = pushed.map((d) => Object.keys(d.files).length)
    // 每次推送都是累积全量：1 → 2 → 3（旧实现会得到 [1,1,1]）
    expect(counts).toEqual([1, 2, 3])
  })

  it('本块无产物时不推送（避免用不完整快照覆盖指针）', async () => {
    const allFiles: Record<string, string> = { 'package/index.vue': 'x' }
    const pushed: any[] = []

    await pushChunkSnapshot({
      allFiles,
      resFiles: {},
      onFilesReady: async (d) => { pushed.push(d) },
      stage: 'microcode-engineer',
    })

    expect(pushed).toHaveLength(0)
  })

  it('onFilesReady 抛错时不阻断主流程（非阻断，仅告警）', async () => {
    const allFiles: Record<string, string> = {}
    const warn = jest.fn()

    await expect(
      pushChunkSnapshot({
        allFiles,
        resFiles: { 'a.less': 'a' },
        onFilesReady: async () => { throw new Error('快照服务不可用') },
        stage: 'microcode-engineer',
        logger: { warn },
      }),
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalled()
    // 即便推送失败，本块结果也必须已合并进 allFiles（不能丢产物）
    expect(allFiles['a.less']).toBe('a')
  })

  it('健壮性：参数缺失/异常不得抛错', async () => {
    await expect(pushChunkSnapshot({})).resolves.toBeUndefined()
    await expect(
      pushChunkSnapshot({ allFiles: null as any, resFiles: null as any, onFilesReady: null as any }),
    ).resolves.toBeUndefined()
  })

  // ── Slice2b：运行时不变量监控 ────────────────────────────────────────────
  // 目的：把「我相信修好了」变成「日志会告诉我们」。一旦某次推送的累积产物比历史
  // 高水位少，立即告警并列出丢失文件 —— 这样即便将来有人引入新的推送点或新的
  // 剪枝逻辑，回退会在日志里立刻暴露，而不是靠用户在 UI 上发现。
  describe('运行时不变量监控（高水位回退告警）', () => {
    it('⭐ 累积产物比历史高水位少时告警，并列出丢失的文件', async () => {
      const allFiles: Record<string, string> = {}
      const warn = jest.fn()
      const opts = { allFiles, onFilesReady: async () => {}, stage: 's', logger: { warn } }

      // 达到高水位 {A, B}
      await pushChunkSnapshot({ ...opts, resFiles: { A: 'A', B: 'B' } })
      expect(warn).not.toHaveBeenCalled()

      // 模拟剪枝/清退：A 从累积产物中消失
      delete allFiles.A

      // 本次推送 {C} → 累积 = {B, C}，相对高水位丢失 A → 必须告警
      await pushChunkSnapshot({ ...opts, resFiles: { C: 'C' } })

      expect(warn).toHaveBeenCalledTimes(1)
      const [msg, payload] = warn.mock.calls[0]
      expect(String(msg)).toContain('回退')
      expect(payload.missing).toEqual(['A'])
      expect(payload.from).toBe(2)
      expect(payload.to).toBe(2)
    })

    it('单调递增时不告警（正常路径零噪声）', async () => {
      const allFiles: Record<string, string> = {}
      const warn = jest.fn()
      const opts = { allFiles, onFilesReady: async () => {}, stage: 's', logger: { warn } }

      await pushChunkSnapshot({ ...opts, resFiles: { A: 'A' } })
      await pushChunkSnapshot({ ...opts, resFiles: { B: 'B' } })
      await pushChunkSnapshot({ ...opts, resFiles: { C: 'C' } })

      expect(warn).not.toHaveBeenCalled()
    })

    it('高水位按 allFiles 对象隔离（不同 generation 互不干扰，WeakMap 无泄漏）', async () => {
      const f1: Record<string, string> = {}
      const f2: Record<string, string> = {}
      const warn = jest.fn()

      await pushChunkSnapshot({ allFiles: f1, resFiles: { A: 'A', B: 'B' }, onFilesReady: async () => {}, stage: 's', logger: { warn } })
      // f2 是全新 generation，只有 1 个文件不应被视为回退
      await pushChunkSnapshot({ allFiles: f2, resFiles: { X: 'X' }, onFilesReady: async () => {}, stage: 's', logger: { warn } })

      expect(warn).not.toHaveBeenCalled()
    })

    it('⭐ logger 为「依赖 this 的类实例」时回退告警仍可用（防裸引用丢 this → 进程崩溃）', async () => {
      // 真实 logger（ai-engine/logger/logger.js）内部是 this.log('warn', ...)。
      // 若实现写成 `const warn = logger.warn` 取裸引用，触发回退告警时 this === undefined →
      // TypeError → **整个 Node 进程崩溃**。普通对象 mock（{ warn: jest.fn() }）测不出。
      const logger = new ThisBoundLogger()
      const allFiles: Record<string, string> = {}

      await pushChunkSnapshot({ allFiles, resFiles: { A: 'A', B: 'B' }, onFilesReady: async () => {}, stage: 's', logger: logger as any })
      // 删掉 B 制造回退 → 触发 warn 路径
      delete allFiles.B
      await pushChunkSnapshot({ allFiles, resFiles: { C: 'C' }, onFilesReady: async () => {}, stage: 's', logger: logger as any })

      // 裸引用实现会在这里抛 TypeError，根本走不到断言
      expect(logger.calls.some((c) => c.startsWith('warn:'))).toBe(true)
    })
  })
})

describe('②c .vue import 闭包守卫（2026-09-15 · mc-max-1789446564243-f64ecbed 实锤）', () => {
  const INDEX = [
    '<template><div><ContentSubT /><ChartSection /><ContentIndicator /></div></template>',
    '<script setup>',
    "import ContentSubT from './components/ContentSubT.vue'",
    "import ChartSection from './components/ChartSection.vue'",
    "import ContentIndicator from './components/ContentIndicator.vue'",
    '</script>',
  ].join('\n')

  const push = async (allFiles: Record<string, string>, pushed: any[], logger?: any) =>
    pushChunkSnapshot({
      allFiles,
      resFiles: { 'package/index.vue': allFiles['package/index.vue'] },
      onFilesReady: async (d) => { pushed.push(d) },
      stage: 'microcode-engineer',
      logger: logger || { warn: jest.fn() },
    })

  it('真机顺序：index.vue 先到、子组件并行未齐 → 不推送（避免预览指向悬空引用）', async () => {
    const allFiles: Record<string, string> = {
      'package/index.vue': INDEX,
      'package/components/ContentSubT.vue': '<template><i>A</i></template>',
      'package/components/ChartSection.vue': '<template><i>B</i></template>',
      // ContentIndicator.vue 尚未产出
    }
    const pushed: any[] = []
    const logger = { warn: jest.fn() }
    await push(allFiles, pushed, logger)
    expect(pushed).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('import 闭包未闭合'),
      expect.objectContaining({ missing: ['package/components/ContentIndicator.vue'] }),
    )
  })

  it('闭包齐全后自然放行（累积产物不被阻断）', async () => {
    const allFiles: Record<string, string> = {
      'package/index.vue': INDEX,
      'package/components/ContentSubT.vue': '<template><i>A</i></template>',
      'package/components/ChartSection.vue': '<template><i>B</i></template>',
      'package/components/ContentIndicator.vue': '<template><i>C</i></template>',
    }
    const pushed: any[] = []
    await push(allFiles, pushed)
    expect(pushed).toHaveLength(1)
  })

  it('传递闭包：孙组件缺失同样不推送', async () => {
    const allFiles: Record<string, string> = {
      'package/index.vue': "<template><A /></template>\n<script setup>import A from './components/A.vue'</script>",
      'package/components/A.vue':
        "<template><X /></template>\n<script setup>import X from './sub/X.vue'</script>",
      // package/components/sub/X.vue 缺失
    }
    const pushed: any[] = []
    await push(allFiles, pushed)
    expect(pushed).toEqual([])
  })

  it('裸模块与资源相对引用不参与闭包（vue/echarts/png 缺失不阻断推送）', async () => {
    const allFiles: Record<string, string> = {
      'package/index.vue': [
        '<template><img :src="bg" /></template>',
        '<script setup>',
        "import { ref } from 'vue'",
        "import * as echarts from 'echarts'",
        "import bg from '../../resources/images/bg.png'",
        '</script>',
      ].join('\n'),
    }
    const pushed: any[] = []
    await push(allFiles, pushed)
    expect(pushed).toHaveLength(1)
  })
})
