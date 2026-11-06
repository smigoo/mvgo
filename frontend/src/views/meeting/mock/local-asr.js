// 本地 Whisper 离线转写（真实 ASR，非示例稿）
//
// 计算后端：**只走 WebGPU**。
//
// 为什么不再回落 WebAssembly（2026-11-06 实测结论，别再改回去）：
// ORT 1.31 的 dist 里只有 threaded 构建（asyncify / jsep / jspi / 普通，全是 *-threaded），
// 而 threaded 构建依赖 SharedArrayBuffer。本页没有开跨域隔离（crossOriginIsolated=false、
// SharedArrayBuffer 为 undefined），ORT 不会退回单线程，而是在 pthread 池初始化处死等，
// 而且是**同步占死主线程** —— Promise、定时器统统不再执行，连「超时后报错」都跑不出来。
// 同一台机器上换 WebGPU 后端（不依赖 SAB）实测可跑通：load 27s、12s 中文音频转写 46s
// 正常返回 4 段带时间戳的文字。因此这里在探测不到 WebGPU 时**明确拒绝**，
// 不假装 wasm 还能兜底（那只会让页面永久卡死、还报不出原因）。
// 代价：需要 Chrome / Edge 113+ 或 Safari 26+；不满足就如实提示改用服务端转写。
//
// 实际用到的后端与权重精度会被记录并在 describe() 里如实暴露，不允许「以为在 GPU 上、其实在 CPU 上」。
//
// 边界（硬约束，勿在未完成验证前放宽）：
// 1. 音频**不出本机**：PCM 只在本页内存里传给推理管线，不 fetch、不上传、不写后端。
// 2. 模型权重从镜像站按需下载到浏览器缓存（Cache Storage），首次会慢，之后走缓存。
// 3. 说话人分离（男A/女A）**本地未实现**：Whisper 只给文字与时间戳，不做声纹聚类。
//    因此 speaker 一律标成 S1 且 speakerDiarized=false，页面不得伪造成「男A/女A」。
// 4. 转写不到文字就返回空数组，**绝不用示例稿兜底**。空就是空，页面要如实展示 0 句。
// 5. 跑通的范围仅限「WebGPU 后端 + Chrome 内核」：wasm 后端与真机长会议未验证，
//    不得据此宣称「所有浏览器都能本机转写」。

import { formatDuration } from './live-session.js'

// 档位与体积均取自实测（hf-mirror 上各文件的真实 Content-Length，2026-11-06）：
//   fp16 配方 = encoder_model_fp16 + decoder_model_merged_fp16（适配器支持 shader-f16 时）
//   fp32+q4  = encoder_model(fp32) + decoder_model_merged_q4（适配器不支持 f16 时）
// tiny 71MB / 113MB，base 138MB / 195MB，small 462MB / 558MB。
// 默认 base：tiny 实测错字明显（「讨论」→「炒论」、「项目」→「向目」），base 才够日常会议用。
export const LOCAL_ASR_MODELS = Object.freeze([
  {
    id: 'Xenova/whisper-tiny',
    label: 'Whisper Tiny（最快）',
    note: '约 71MB / 113MB · 中文错字明显 · 只适合通路验证或弱网',
    approxBytes: 71 * 1024 * 1024
  },
  {
    id: 'Xenova/whisper-base',
    label: 'Whisper Base（默认）',
    note: '约 138MB / 195MB · 中文日常会议可用 · 首次下载最慢的一步',
    approxBytes: 138 * 1024 * 1024
  },
  {
    id: 'Xenova/whisper-small',
    label: 'Whisper Small（更准）',
    note: '约 462MB / 558MB · 中文最准 · 下载与耗时都明显更高',
    approxBytes: 462 * 1024 * 1024
  }
])

// 默认档位 = Base，不取数组第 0 项：tiny 只用于通路验证，第 0 项是「最快」而非「默认」
export const LOCAL_ASR_DEFAULT_MODEL = 'Xenova/whisper-base'

// 镜像：huggingface.co 在境内不可达，用 hf-mirror.com 拉权重
export const LOCAL_ASR_REMOTE_HOST = 'https://hf-mirror.com/'

export const ASR_PHASES = Object.freeze({
  idle: '未加载',
  loading: '加载中',
  ready: '已就绪',
  running: '转写中',
  error: '出错'
})

// ---- 失败分类：把「哪一步挂了」拆开，页面才能给出可操作的下一步 ----
// 背景：原先所有失败都写成同一句「本地转写失败：xxx」，看不出是权重没下下来、
// 库没加载、还是推理本身炸了。这里按「网络层 fetch / 模块加载 / 推理环境 /
// 内存 / 推理期异常 / 无音频」分类，每类配一条能直接照做的提示。
// 注意：分类只改变**提示措辞**，不改变失败判定 —— 失败仍然是失败，照实显示。
export const ASR_FAILURES = Object.freeze({
  weights: '模型权重下载失败',
  assets: '模型资源加载失败',
  lib: '转写引擎加载失败',
  engine: '离线推理环境不可用',
  memory: '本地内存不足',
  runtime: '本地推理失败',
  noAudio: '没有采到可转写的音频',
  unknown: '本地转写失败'
})

const ASR_FAILURE_HINTS = Object.freeze({
  weights:
    '权重是按需从 hf-mirror.com 拉的（Base 约 73MB / Small 约 238MB，WebGPU 档更大），' +
    '请确认网络或代理能连通该镜像站，然后重试；已下载部分会留在浏览器缓存里。',
  assets:
    '加载模型资源这一步失败了（可能是权重，也可能是推理内核 wasm）。' +
    '先重试一次；若稳定失败，请打开浏览器控制台看 Network 里是哪条请求挂掉。',
  lib: '转写库（@huggingface/transformers）没能加载：先刷新页面重试；' +
    '若持续失败，检查构建产物里是否包含该依赖与配套的 wasm 资源。',
  engine:
    '本机推理依赖浏览器的 WebGPU：请用最新版 Chrome / Edge（113+）或 Safari 26+ 打开本页。' +
    '当前浏览器若拿不到 WebGPU 适配器，本机转写就不可用（这与网络无关，也不会自动退回 CPU 兜底），' +
    '请改用服务端转写。',
  memory:
    '本机内存不足：换用「Whisper Base」档位、缩短单次录音时长，或先关掉其他标签页再重试。',
  runtime:
    '音频已经采到了，是本机推理这一段出的错：结束本次录制后重新录一遍；' +
    '若反复失败，换更小的模型档位。',
  noAudio: '本次录音没有采到音频：确认麦克风有输入、单段时长超过 0.4s，然后再录一次。',
  unknown: '未识别的失败：打开浏览器控制台查看原始报错，再按报错内容排查。'
})

// 各分类的判别特征（按 message 小写子串匹配）。顺序敏感，见 describeAsrFailure。
const ASR_FAILURE_PATTERNS = Object.freeze({
  // fetch 在网络层直接失败（404/403 会 resolve 成 response，不算这里）→ 权重没下下来
  network: [
    'failed to fetch',
    'networkerror',
    'network error',
    'network request failed',
    'load failed',
    'fetch failed',
    'err_network',
    'err_internet',
    'err_name_not_resolved',
    'err_connection',
    'err_timed_out',
    'net::',
    'aborted',
    'aborterror',
    'timeout'
  ],
  // 注意不要用裸 'oom'：'boom' 这类普通词会误命中（曾把 'boom' 误判成内存不足）
  memory: [
    'out of memory',
    'memory access out of bounds',
    'cannot enlarge memory',
    'allocation failed',
    'allocate failed',
    'buffer allocation',
    'rangeerror',
    'memory limit',
    'aborted(oom)',
    'heap'
  ],
  engine: [
    'webassembly',
    'wasm',
    'webgpu',
    'no available backend',
    'no backend',
    'backend not',
    'sharedarraybuffer',
    'cross-origin isolation',
    'not supported',
    'unsupported'
  ],
  lib: [
    'cannot find module',
    'module not found',
    'failed to resolve',
    'dynamic import',
    'loading chunk',
    'chunkloaderror'
  ]
})

function buildAsrFailure(code, raw = '') {
  return {
    code,
    label: ASR_FAILURES[code],
    hint: ASR_FAILURE_HINTS[code],
    raw,
    // 页面主文案：分类名 + 原始报错（原始报错只作定位用，不替代人话结论）
    text: raw ? `${ASR_FAILURES[code]}（${raw}）` : ASR_FAILURES[code]
  }
}

/**
 * 把一次转写失败归到某个可操作分类上。
 * @param {unknown} error 抛出的异常（或任意值）
 * @param {string} phase 失败时的 ASR 阶段（load() 失败会把阶段置为 error）
 * @returns {{ code: string, label: string, hint: string, raw: string, text: string }}
 */
export function describeAsrFailure(error, phase = ASR_PHASES.error) {
  const raw =
    error instanceof Error
      ? String(error.message || error.name || '')
      : error == null
        ? ''
        : String(error)
  const probe = raw.toLowerCase()
  const hit = (key) => ASR_FAILURE_PATTERNS[key].some((p) => probe.includes(p))

  let code = 'unknown'
  if (hit('network')) code = 'weights'
  else if (hit('memory')) code = 'memory'
  else if (hit('engine')) code = 'engine'
  else if (hit('lib')) code = 'lib'
  // 加载阶段（load() 失败后阶段会被置成 error）拿不到具体特征时，
  // 最可能卡在模型资源获取上；推理阶段（running）才是推理本身出错。
  else if (phase === ASR_PHASES.loading || phase === ASR_PHASES.error) code = 'assets'
  else if (phase === ASR_PHASES.running) code = 'runtime'

  return buildAsrFailure(code, raw)
}

/** 录音结束但一个样本都没采到：不是「转写失败」，是根本没有可转写的音频。 */
export function describeAsrNoAudio() {
  return buildAsrFailure('noAudio')
}

// ---- 网络与推理内核的本地化绕行 ----
//
// 本页在境内直连两个外部资源会分别撞上两类**不同成因**的拦截，症状都表现为
// fetch 失败（页面看到的都是 `Failed to fetch`），因此必须分开处理：
//
// 1) 权重域存在 Referer 防盗链
//    hf-mirror.com 前置了 Cloudflare 的 Referer 防盗链。浏览器跨域 fetch 会自动带上
//    `Referer: <本页地址>`，命中防盗链后服务端虽返回 200 内容，却**剥离了
//    Access-Control-Allow-Origin**，浏览器随即判定 CORS 失败 → `Failed to fetch`。
//    （同一 URL 加 `no-referrer` 即恢复 200 + ACAO；curl 默认不带 Referer，
//      所以命令行一直正常，曾据此把成因误判成「网络不通」。）
//    处理：仅对模型托管域注入 `referrerPolicy: 'no-referrer'`。
//
// 2) 推理内核默认走国外 CDN
//    transformers.js 初始化时把 `env.backends.onnx.wasm.wasmPaths` 指向
//    `https://cdn.jsdelivr.net/npm/onnxruntime-web@<ver>/dist/`，境内连接被重置
//    （ERR_CONNECTION_RESET）→ 报 `no available backend found`。
//    处理：改指**同源自托管**目录（由 vite 插件 ort-wasm-self-host 在 dev 直读
//    node_modules、build 时拷进 dist/static/wasm/）。.mjs 与 .wasm 必须同目录同文件名，
//    因为加载器内部用 `new URL('ort-wasm-simd-threaded.asyncify.wasm', import.meta.url)`
//    就地定位二进制。

// 需要注入 no-referrer 的模型托管域（含子域，前缀匹配）
const REFERRER_FREE_HOSTS = Object.freeze(['hf-mirror.com', 'huggingface.co', 'hf.co'])

// 自托管推理内核目录前缀，与 vite 插件 ort-wasm-self-host 的中间件路径约定一致。
// 跟随构建 base：dev 为 '/'，build 为 '/mvgo/'。
//
// 用可选链兜住纯 Node 环境：冒烟脚本（.dev-loop/*.mjs）直接 import 本文件跑断言，
// 那里没有 Vite 注入的 import.meta.env，硬取 .BASE_URL 会 TypeError 让整份冒烟崩掉。
const ORT_WASM_BASE = `${import.meta.env?.BASE_URL ?? '/'}static/wasm/`

let referrerPatchInstalled = false

/**
 * 包装全局 fetch：仅对模型托管域补 `referrerPolicy: 'no-referrer'`，
 * 其余请求原样透传（不改变页面既有行为）。
 * 必须在 import 转写库**之前**调用：库可能在模块求值时缓存 fetch 引用。
 */
function installReferrerFreeFetch() {
  if (referrerPatchInstalled || typeof globalThis.fetch !== 'function') return
  referrerPatchInstalled = true
  const originalFetch = globalThis.fetch
  globalThis.fetch = function fetchWithNoReferrer(input, init) {
    let url = ''
    try {
      url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : String(input?.url || '')
    } catch {
      url = ''
    }
    const isModelHost = REFERRER_FREE_HOSTS.some(
      (host) => url.includes(`//${host}/`) || url.includes(`.${host}/`)
    )
    if (isModelHost) {
      return originalFetch.call(this, input, { ...(init || {}), referrerPolicy: 'no-referrer' })
    }
    return originalFetch.call(this, input, init)
  }
}

/**
 * 计算自托管 ORT 加载器/二进制的绝对地址。
 * 变体选择与 transformers.js 内部保持一致：Safari < 26 且无 WebGPU 时改用非 asyncify 版。
 * @returns {{ mjs: string, wasm: string }}
 */
function resolveOrtWasmPaths() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  const isSafariOnly = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)
  const safariMajor = isSafariOnly ? Number((ua.match(/Version\/(\d+)/) || [])[1] || 0) : 0
  const suffix = safariMajor > 0 && safariMajor < 26 ? '' : '.asyncify'
  const origin = typeof location === 'undefined' ? '' : location.origin
  return {
    mjs: `${origin}${ORT_WASM_BASE}ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${origin}${ORT_WASM_BASE}ort-wasm-simd-threaded${suffix}.wasm`
  }
}

// ---- 计算后端：WebGPU 优先，不可用则回落 WebAssembly ----
//
// 为什么不是「有 navigator.gpu 就用」：navigator.gpu 存在只说明浏览器**实现了这个 API**，
// 不代表**本机有可用适配器** —— 驱动在黑名单里、跑在无头/虚拟 GPU 上、被企业策略禁用，
// requestAdapter() 都会返回 null。所以必须真发一次 requestAdapter 才能下结论。
//
// 为什么 dtype 要跟着后端走：权重精度决定要下载哪些文件。
// wasm 与 WebGPU 的推荐配方不同，用错配方要么报错、要么白白多下几百 MB。

// wasm 后端已不再用于建会话（见文件头实测记录），这里保留 q8 只为了让
// probeComputeDevice 在无 WebGPU 的机器上仍能返回一个「若可用会是哪种精度」的
// 可解释口径，以及 describe() 有值可填 —— 不要据此以为页面会跑 wasm。
const WASM_DTYPE = 'q8'

// WebGPU 下按适配器能力二选一：
// - 支持 shader-f16 → 全 fp16（Base 139MB / Small 463MB，最快）
// - 否则 → 编码器 fp32 + 解码器 q4（Base 197MB / Small 559MB，transformers.js 官方配方）
const WEBGPU_DTYPE_F16 = Object.freeze({ encoder_model: 'fp16', decoder_model_merged: 'fp16' })
const WEBGPU_DTYPE_FP32_Q4 = Object.freeze({
  encoder_model: 'fp32',
  decoder_model_merged: 'q4'
})

/**
 * 探测本机可用的推理后端与配套权重精度。
 * 三步全过才算 WebGPU：navigator.gpu 存在 → 安全上下文 → requestAdapter() 拿到适配器。
 * 任何一步不满足或抛错都判为 `wasm`（= 本机转写不可用，由 load() 如实拒绝）；
 * **探测失败不是转写失败**，所以这里只返回结论、不上抛异常。
 * 纯 Node 环境（冒烟脚本直接 import 本文件）没有可用的 navigator.gpu，会安全判为 wasm。
 * @returns {Promise<{ device: 'webgpu'|'wasm', dtype: string|object, reason: string, shaderF16: boolean }>}
 */
export async function probeComputeDevice() {
  const wasmPlan = (why) => ({ device: 'wasm', dtype: WASM_DTYPE, reason: why, shaderF16: false })
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return wasmPlan('浏览器未提供 navigator.gpu')
    }
    if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
      return wasmPlan('非安全上下文（WebGPU 仅在 HTTPS 或 localhost 下可用）')
    }
    if (typeof navigator.gpu.requestAdapter !== 'function') {
      return wasmPlan('navigator.gpu 缺少 requestAdapter')
    }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      return wasmPlan('未取得 GPU 适配器（驱动黑名单 / 无头环境 / 策略禁用）')
    }
    const hasF16 =
      typeof adapter.features?.has === 'function' && adapter.features.has('shader-f16')
    return hasF16
      ? {
          device: 'webgpu',
          dtype: WEBGPU_DTYPE_F16,
          reason: 'WebGPU（适配器支持 shader-f16）',
          shaderF16: true
        }
      : {
          device: 'webgpu',
          dtype: WEBGPU_DTYPE_FP32_Q4,
          reason: 'WebGPU（适配器无 shader-f16，改用 fp32+q4）',
          shaderF16: false
        }
  } catch (error) {
    return wasmPlan(`WebGPU 探测异常：${error?.message || String(error)}`)
  }
}

/**
 * 尽力核实 pipeline 真实跑在哪个后端上。
 * transformers.js / onnxruntime-web 没有公开的「本次用了哪个 EP」接口，会话对象是内部结构，
 * 路径可能随版本变化，因此这里**只做只读的尽力探测**：
 * 拿不到就返回 null（页面显示「未核实」），绝不把「请求的设备」当成「实际使用的设备」上报。
 */
function sniffBackend(asr) {
  const picks = [
    () => asr?.model?.encoder?.session,
    () => asr?.model?.encoder_session,
    () => asr?.model?.decoder?.session,
    () => asr?.model?.decoder_model_merged?.session
  ]
  for (const pick of picks) {
    try {
      const session = pick()
      const name =
        session?.handler?.backendName ||
        session?.session?.handler?.backendName ||
        session?.backendName
      if (typeof name === 'string' && name) return name
    } catch {
      // 内部结构不可读：忽略，试下一个候选
    }
  }
  return null
}

let libPromise = null

function loadLib() {
  if (!libPromise) {
    // 必须在 import 之前装：库可能在模块求值时缓存 fetch 引用
    installReferrerFreeFetch()
    libPromise = import('@huggingface/transformers').then((mod) => {
      const env = mod.env
      env.allowLocalModels = false
      env.allowRemoteModels = true
      env.remoteHost = LOCAL_ASR_REMOTE_HOST
      // 推理内核改走同源自托管。
      // env.backends.onnx 与库内部的 ONNX_ENV 共享同一个 wasm 对象，
      // 且本次赋值发生在库初始化（写入 CDN 默认值）之后，因此能稳定覆盖。
      const onnxEnv = env?.backends?.onnx
      if (onnxEnv?.wasm) {
        onnxEnv.wasm.wasmPaths = resolveOrtWasmPaths()
      }
      return mod
    })
  }
  return libPromise
}

/**
 * 创建本地转写引擎。惰性加载：只有第一次 transcribe/load 才会拉库与权重。
 * @param {{ model?: string, onProgress?: Function, onPhase?: Function }} options
 */
export function createLocalAsr(options = {}) {
  const model = options.model || LOCAL_ASR_DEFAULT_MODEL
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const onPhase = typeof options.onPhase === 'function' ? options.onPhase : () => {}

  let pipelinePromise = null
  let phase = ASR_PHASES.idle
  let loadedBytes = 0
  let totalBytes = 0

  // 实际使用的后端 / 精度 / 是否发生过回落 / 尽力核实到的真实后端。
  // 未加载前一律为 null，不预设默认值 —— 默认值会变成「没测过也敢说」。
  let activeDevice = null
  let activeDtype = null
  let deviceReason = ''
  let deviceBackend = null
  let deviceFallback = false

  function setPhase(next, detail = '') {
    phase = next
    onPhase(next, detail)
  }

  function handleProgress(info) {
    // transformers.js 的 progress_callback：{ status, file, progress, loaded, total }
    if (!info) return
    if (info.status === 'progress' && Number.isFinite(info.total) && info.total > 0) {
      totalBytes = Math.max(totalBytes, info.total)
      loadedBytes = Math.max(loadedBytes, info.loaded || 0)
      onProgress({
        file: info.file || '',
        loaded: info.loaded || 0,
        total: info.total,
        percent: Math.min(100, Math.round(((info.loaded || 0) / info.total) * 100))
      })
    } else if (info.status === 'done' && info.file) {
      onProgress({ file: info.file, loaded: 1, total: 1, percent: 100 })
    }
  }

  async function load() {
    if (pipelinePromise) return pipelinePromise
    setPhase(ASR_PHASES.loading, model)
    pipelinePromise = (async () => {
      // 先探测后端再定 dtype：探测自身已兜底（拿不到就 wasm），不会把 load 带崩
      const plan = await probeComputeDevice()
      activeDevice = plan.device
      activeDtype = plan.dtype
      deviceReason = plan.reason
      deviceFallback = false
      deviceBackend = null

      // 硬门槛：本机转写只走 WebGPU。拿不到适配器就**当场如实拒绝** ——
      // 不能像以前那样「回落 wasm 再试一次」，那一步会在 pthread 池处同步卡死主线程，
      // 页面既出不了字也出不了错（详见文件头实测记录）。
      if (plan.device !== 'webgpu') {
        throw new Error(`本机转写需要 WebGPU，当前环境不可用：${plan.reason}`)
      }

      const { pipeline } = await loadLib()
      const asr = await pipeline('automatic-speech-recognition', model, {
        dtype: plan.dtype,
        device: plan.device,
        progress_callback: handleProgress
      })

      // 尽力核实真实后端；核实不到就是 null，页面显示「未核实」，不臆造
      deviceBackend = sniffBackend(asr)
      setPhase(ASR_PHASES.ready, model)
      return asr
    })().catch((error) => {
      pipelinePromise = null
      setPhase(ASR_PHASES.error, error?.message || String(error))
      throw error
    })
    return pipelinePromise
  }

  /**
   * 转写一段 16k 单声道 PCM。返回真实文字与时间戳；无语音则 text 为空。
   * @param {Float32Array} pcm 16k mono
   * @param {{ offsetMs?: number, language?: string, maxChunkMs?: number }} runOptions
   */
  async function transcribe(pcm, runOptions = {}) {
    if (!pcm || !pcm.length) return { text: '', chunks: [], durationMs: 0 }
    const offsetMs = Number.isFinite(runOptions.offsetMs) ? runOptions.offsetMs : 0
    const maxChunkMs = Number.isFinite(runOptions.maxChunkMs) ? runOptions.maxChunkMs : 30000
    const asr = await load()
    setPhase(ASR_PHASES.running, model)

    // 太长会一次性吃满内存，按 maxChunkMs 切段顺序推理
    const step = Math.max(1000, maxChunkMs) * 16 // 16 samples per ms @16k
    const chunks = []
    let text = ''

    for (let start = 0; start < pcm.length; start += step) {
      const slice = pcm.subarray(start, Math.min(start + step, pcm.length))
      if (slice.length < 1600) continue // 不足 0.1s 忽略
      const out = await asr(slice, {
        language: runOptions.language || 'chinese',
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5
      })
      const baseMs = offsetMs + (start / 16000) * 1000
      const pieceText = String(out?.text || '').trim()
      if (pieceText) text += (text ? ' ' : '') + pieceText
      const pieceChunks = Array.isArray(out?.chunks) ? out.chunks : []
      if (pieceChunks.length) {
        pieceChunks.forEach((c) => {
          const segText = String(c.text || '').trim()
          if (!segText) return
          const ts = Array.isArray(c.timestamp) ? c.timestamp : []
          const from = Number.isFinite(ts[0]) ? ts[0] : 0
          const to = Number.isFinite(ts[1]) ? ts[1] : from
          chunks.push({
            text: segText,
            startMs: Math.round(baseMs + from * 1000),
            endMs: Math.round(baseMs + to * 1000)
          })
        })
      } else if (pieceText) {
        chunks.push({
          text: pieceText,
          startMs: Math.round(baseMs),
          endMs: Math.round(baseMs + (slice.length / 16000) * 1000)
        })
      }
    }

    setPhase(ASR_PHASES.ready, model)
    return {
      text,
      chunks,
      durationMs: Math.round((pcm.length / 16000) * 1000),
      model
    }
  }

  /**
   * 把转写结果转成会话可吃的 utterance（真实文字 + 真实时间戳）。
   * speaker 固定 S1：本地不做声纹分离，页面须标注「未区分说话人」。
   */
  function toUtterances(result, { seqStart = 1, idPrefix = 'asr' } = {}) {
    const list = Array.isArray(result?.chunks) ? result.chunks : []
    return list.map((c, i) => ({
      id: `${idPrefix}-${seqStart + i}`,
      seq: seqStart + i,
      speaker: 'S1',
      speakerDiarized: false,
      // 页面直接渲染这个标签：本地 ASR 不做声纹分离，绝不显示「男A/女A」这种假人名
      speakerLabel: '说话人未区分',
      lang: 'zh',
      startMs: c.startMs,
      endMs: c.endMs,
      text: c.text,
      // confidence 不编造：Whisper 无逐句置信度，置 null 由页面显示「—」
      confidence: null,
      source: 'local_whisper'
    }))
  }

  return {
    model,
    get phase() {
      return phase
    },
    get progress() {
      return { loaded: loadedBytes, total: totalBytes }
    },
    load,
    transcribe,
    toUtterances,
    describe() {
      const meta = LOCAL_ASR_MODELS.find((m) => m.id === model)
      return {
        model,
        label: meta?.label || model,
        remoteHost: LOCAL_ASR_REMOTE_HOST,
        uploaded: false,
        diarization: false,
        // 本次**实际使用**的后端与精度（含回落结果）；未加载时为 null
        device: activeDevice,
        dtype: activeDtype,
        deviceReason,
        // 尽力核实到的真实后端；核实不到为 null，页面应显示「未核实」而不是拿 device 顶替
        deviceBackend,
        deviceFallback,
        phase
      }
    }
  }
}

/**
 * 把转写时间轴格式化成页面用的短标签，保证「未区分说话人」时也不显示假人名。
 */
export function describeSpeaker(utterance) {
  if (!utterance) return '—'
  if (utterance.speakerLabel) return utterance.speakerLabel
  if (utterance.speakerDiarized === false) return '说话人未区分'
  return utterance.speaker || '—'
}

export function describeSpan(utterance) {
  if (!utterance) return '—'
  return `${formatDuration(utterance.startMs)}–${formatDuration(utterance.endMs)}`
}
