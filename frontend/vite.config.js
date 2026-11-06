/**********************************
 * @Author: smigoo
 * @LastEditor: smigoo
 * @LastEditTime: 2024/04/24 21:31:02
 * @Email: xsmigoo@gmail.com
 * Copyright © 2024 Microvideo
 **********************************/

import path from 'path'
import fs from 'fs'
import { defineConfig, loadEnv } from 'vite'
import Vue from '@vitejs/plugin-vue'
// import VueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import simpleHtmlPlugin from 'vite-plugin-simple-html'
import removeNoMatch from 'vite-plugin-router-warn'
// import eslintPlugin from 'vite-plugin-eslint' // 导入包
import ViteSvgLoader from 'vite-svg-loader' // 引入SVG loader。
// import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import vueJsx from '@vitejs/plugin-vue-jsx'
import pxtorem from 'postcss-pxtorem'
import config from './src/config'
import packageConfig from './package.json'
import jsonFileEditor from '@microcode/vite-plugin-json-file-editor'
/**
 * 清洗 LLM 生成的 CSS 中的「孤儿属性值」——缺少属性前缀的裸值行。
 *
 * LLM 有时会把多行属性值拆散，导致 `background:` / `box-shadow:` 等前缀丢失：
 *   border-radius: 16px;
 *     linear-gradient(180deg, ...);  ← 孤儿值，应被 background: 包裹
 *     0 12px 36px rgba(...);         ← 孤儿值，应被 box-shadow: 包裹
 *   color: #dbe8ff;
 *
 * 策略：
 * 1. 跟踪括号深度（parenDepth），保护合法的多行函数调用
 * 2. 对括号外的每行，检查是否匹配合法 CSS 模式
 * 3. 不匹配的行视为孤儿值，从输出中移除
 *
 * @param {string} cssContent - <style> 块内的原始 CSS 内容
 * @returns {{ cleaned: string, dropped: Array<{line: string, index: number}> }} 清洗后的 CSS 及被丢弃的行信息
 */
function stripOrphanCssValues(cssContent) {
  const empty = { cleaned: '', dropped: [] }
  if (!cssContent) return { ...empty, cleaned: cssContent }

  const lines = cssContent.split('\n')
  const result = []
  const dropped = []
  let parenDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()

    // 计算括号深度变化
    const opens = (t.match(/\(/g) || []).length
    const closes = (t.match(/\)/g) || []).length

    if (parenDepth > 0) {
      // 在函数调用内部（多行参数）：直接保留
      result.push(lines[i])
      parenDepth += opens - closes
      continue
    }

    parenDepth += opens - closes

    // 合法行模式（按优先级）：
    // - 空行
    // - 注释行
    // - 以 { 结尾的行（CSS 选择器、at-rule 块、:root 等）
    // - at-rule（@media / @keyframes / @import 等）
    // - 属性声明（property: value; / property: value）
    // - 闭合大括号
    // - 逗号/分号开头的延续行
    const isLegal =
      t === '' ||
      t.startsWith('//') ||
      t.startsWith('/*') ||
      t.startsWith('*') ||
      t === '}' ||
      t.endsWith('{') || // 任何以 { 结尾的行都是选择器/块开始
      t.startsWith('@') ||
      /^[\w-]+\s*:/.test(t) || // 属性声明
      /^[,;]/.test(t) // 逗号/分号开头的延续行

    if (isLegal) {
      result.push(lines[i])
    } else {
      // 孤儿值行 → 丢弃但记录行信息供 dev 模式报警
      dropped.push({ line: lines[i], index: i })
    }
  }

  return { cleaned: result.join('\n'), dropped }
}

/**
 * ONNX Runtime 自托管产物清单（文件名与 ORT dist 完全一致）。
 * 两套变体都收录：asyncify 是默认档；无后缀版对应 Safari < 26 且无 WebGPU 时
 * transformers.js 会选择的变体（见其内部 wasmPathSuffix 分支）。
 */
const ORT_WASM_FILES = Object.freeze([
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm'
])

/**
 * 定位 onnxruntime-web 的 dist 目录（绝对路径）。
 * pnpm 布局下该包不在顶层 node_modules —— 它是 @huggingface/transformers 的依赖，
 * 真实位置在 node_modules/.pnpm/onnxruntime-web@<ver>/node_modules/onnxruntime-web/dist。
 * 因此先扫 .pnpm，再退回 npm/yarn 的扁平布局。
 * @returns {string|null} 找不到返回 null；调用方按 404 / 跳过处理，不中断构建。
 */
function resolveOrtWasmDist() {
  const marker = 'ort-wasm-simd-threaded.asyncify.mjs'
  const flat = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist')
  if (fs.existsSync(path.join(flat, marker))) return flat
  const pnpmRoot = path.join(process.cwd(), 'node_modules', '.pnpm')
  try {
    const hits = fs
      .readdirSync(pnpmRoot)
      .filter((name) => name.startsWith('onnxruntime-web@'))
      .map((name) => path.join(pnpmRoot, name, 'node_modules', 'onnxruntime-web', 'dist'))
      .filter((dir) => fs.existsSync(path.join(dir, marker)))
    if (hits.length) return hits[hits.length - 1]
  } catch {
    /* node_modules/.pnpm 不存在：忽略，走下面的 null 分支 */
  }
  return null
}

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build'
  const viteEnv = loadEnv(mode, process.cwd())
  const { VITE_DIST_TITLE } = viteEnv
  return {
    base: isBuild ? '/mvgo/' : '/',
    plugins: [
      // 自定义插件：开发环境以「原始文本」方式提供 workspace 组件文件（不进 Vite transform 管线）
      // 用途：Playground / 组件预览 iframe 通过 vue3-sfc-loader 在浏览器内运行时编译组件源码，
      // 源码从这里拉取「原文」，Vite 不会对 .vue 做 SFC/LESS 编译。
      // 这样 workspace 中 AI 生成的损坏 .vue（如 LESS 语法错误）绝不会触发 Vite 编译错误，
      // 也就不会通过 HMR WebSocket 把错误广播到父窗口 Playground（错误被 iframe 内的 ErrorBoundary 捕获）。
      // 仅 dev 生效（apply:'serve'），生产由后端 /api/preview 提供原始文件。
      {
        name: 'workspace-raw-files',
        apply: 'serve',
        configureServer(server) {
          const root = server.config.root
          const workspaceRoot = path.join(root, 'workspace')
          server.middlewares.use('/__raw', (req, res) => {
            // ── 写：dev-only，Playground 实时编辑把源码写回 frontend/workspace ──
            // 与 /__raw 读取同源，保证「编辑 → 预览」在 dev 下一致
            // （后端保存会落到 backend-node/workspace，与 /__raw 读的 frontend/workspace 不同，
            //   故 dev 下编辑器直接写 frontend/workspace）。
            if (req.method === 'PUT' || req.method === 'POST') {
              try {
                const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
                const absPath = path.resolve(root, urlPath.replace(/^\/+/, ''))
                // 防目录穿越 + 仅允许写 workspace 子树
                if (absPath !== root && !absPath.startsWith(root + path.sep)) {
                  res.statusCode = 403
                  return res.end('Forbidden')
                }
                if (!absPath.startsWith(workspaceRoot + path.sep)) {
                  res.statusCode = 403
                  return res.end('Forbidden: only workspace writable')
                }
                let body = ''
                req.on('data', (chunk) => {
                  body += chunk
                })
                req.on('end', () => {
                  fs.mkdir(path.dirname(absPath), { recursive: true }, (mkErr) => {
                    if (mkErr) {
                      res.statusCode = 500
                      return res.end(String(mkErr.message || mkErr))
                    }
                    fs.writeFile(absPath, body, 'utf-8', (wfErr) => {
                      if (wfErr) {
                        res.statusCode = 500
                        return res.end(String(wfErr.message || wfErr))
                      }
                      res.statusCode = 200
                      res.setHeader('Content-Type', 'application/json; charset=utf-8')
                      res.end(JSON.stringify({ success: true }))
                    })
                  })
                })
              } catch (e) {
                res.statusCode = 500
                res.end(String((e && e.message) || e))
              }
              return
            }
            // ── 读：原始文本，不进 Vite transform ──
            try {
              const [urlPathRaw, queryString] = (req.url || '/').split('?')
              const urlPath = decodeURIComponent(urlPathRaw)
              const query = new URLSearchParams(queryString || '')
              const isExistsCheck = query.get('exists') === '1'
              const absPath = path.resolve(root, urlPath.replace(/^\/+/, ''))
              // 防目录穿越：必须仍在 root 内
              if (absPath !== root && !absPath.startsWith(root + path.sep)) {
                res.statusCode = 403
                return res.end('Forbidden')
              }
              const fileExists = fs.existsSync(absPath) && fs.statSync(absPath).isFile()
              // 探测模式：返回 200 + JSON，避免在控制台留下 404 噪音
              if (isExistsCheck) {
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                return res.end(JSON.stringify({ exists: fileExists }))
              }
              if (!fileExists) {
                res.statusCode = 404
                return res.end('Not found: ' + urlPath)
              }
              const ext = path.extname(absPath).toLowerCase()
              const ct =
                {
                  '.vue': 'text/plain; charset=utf-8',
                  '.js': 'text/plain; charset=utf-8',
                  '.ts': 'text/plain; charset=utf-8',
                  '.jsx': 'text/plain; charset=utf-8',
                  '.mjs': 'text/plain; charset=utf-8',
                  '.json': 'application/json; charset=utf-8',
                  '.css': 'text/plain; charset=utf-8',
                  '.less': 'text/plain; charset=utf-8',
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.gif': 'image/gif',
                  '.svg': 'image/svg+xml',
                  '.webp': 'image/webp'
                }[ext] || 'application/octet-stream'
              res.setHeader('Content-Type', ct)
              res.setHeader('Cache-Control', 'no-cache')
              fs.createReadStream(absPath).pipe(res)
            } catch (e) {
              res.statusCode = 500
              res.end(String((e && e.message) || e))
            }
          })

          // ── 缓存失效：Playground 保存 workspace 文件后调用，强制 Vite 重新 transform ──
          // 背景：微码组件预览用 @vite-ignore 原生 import `/workspace/.../component.js`，
          //       该链不进 Vite 模块图（无 HMR 追踪），文件变化不会触发 transform 缓存失效，
          //       导致「保存后 Vite 仍返回旧 transform 结果」→ 预览不刷新。
          // 做法：invalidateAll() 标记所有 ModuleNode 过期 + 清 transform 请求缓存（Vite 内部 LRU）。
          server.middlewares.use('/__invalidate', (_req, res) => {
            try {
              if (server.moduleGraph && typeof server.moduleGraph.invalidateAll === 'function') {
                server.moduleGraph.invalidateAll()
              }
              // Vite 内部 transform 请求缓存（非公开 API，try 保护，缺失时忽略）
              if (server._transformCache && typeof server._transformCache.clear === 'function') {
                server._transformCache.clear()
              }
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 500
              res.end(String((e && e.message) || e))
            }
          })
        }
      },
      // 自定义插件：自托管 ONNX Runtime 推理内核（wasm 二进制 + 加载器 .mjs）
      //
      // 背景：@huggingface/transformers 初始化时把 env.backends.onnx.wasm.wasmPaths
      // 指向 https://cdn.jsdelivr.net/npm/onnxruntime-web@<ver>/dist/，境内该域连接被
      // 重置（ERR_CONNECTION_RESET）→ 本地 Whisper 离线转写即使权重下完了也报
      // "no available backend found"。这里把 ORT 产物以**同源静态资源**形式提供：
      //   · dev   —— 中间件直接从 node_modules 流式读（不进 Vite 模块图，不参与 transform）
      //   · build —— 构建收尾把文件拷进 dist/static/wasm/
      // 前缀 /static/wasm/ 与前端 src/views/meeting/mock/local-asr.js 的 ORT_WASM_BASE
      // 约定一致；.mjs 与 .wasm 必须同目录，因为加载器内部用
      //   new URL('ort-wasm-simd-threaded.asyncify.wasm', import.meta.url) 就地定位二进制。
      // 走中间件而非 public/ 的好处：约 41MB 二进制不必提交进仓库。
      {
        name: 'ort-wasm-self-host',
        configureServer(server) {
          // 直接 use（不返回函数）→ 注册在 Vite 内部中间件**之前**，
          // 避免 .mjs 被 transformMiddleware 当成源码模块截获。
          server.middlewares.use('/static/wasm', (req, res, next) => {
            const fileName = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '')
            if (!ORT_WASM_FILES.includes(fileName)) return next()
            const ortDist = resolveOrtWasmDist()
            const abs = ortDist ? path.join(ortDist, fileName) : ''
            if (!abs || !fs.existsSync(abs)) {
              res.statusCode = 404
              return res.end('ORT wasm asset not found: ' + fileName)
            }
            res.setHeader(
              'Content-Type',
              fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'
            )
            res.setHeader('Cache-Control', 'no-cache')
            if (req.method === 'HEAD') return res.end()
            fs.createReadStream(abs).pipe(res)
          })
        },
        writeBundle(options) {
          const ortDist = resolveOrtWasmDist()
          if (!ortDist) {
            this.warn('[ort-wasm-self-host] 未找到 onnxruntime-web/dist，跳过自托管资源拷贝')
            return
          }
          const outDir = options?.dir || path.resolve(process.cwd(), 'dist')
          const targetDir = path.join(outDir, 'static', 'wasm')
          fs.mkdirSync(targetDir, { recursive: true })
          for (const fileName of ORT_WASM_FILES) {
            const src = path.join(ortDist, fileName)
            if (!fs.existsSync(src)) continue
            fs.copyFileSync(src, path.join(targetDir, fileName))
          }
        }
      },
      Vue(),
      vueJsx(),
      jsonFileEditor(),
      // 自定义插件：阻止 Vite 编译 custom-components 下的 .less 源文件
      // 微码组件使用 Phase2Service.precompileCss() 预编译的 .css 文件，
      // .less 是 AI 生成的源代码，语法可能不完整，不应进入 Vite CSS 管线
      {
        name: 'exclude-custom-components-less',
        enforce: 'pre',
        transform(code, id) {
          if (id.includes('/custom-components/') && id.endsWith('.less')) {
            return { code: '', map: null }
          }
        }
      },
      // 自定义插件：清洗 workspace 组件内 <style> 块中的孤儿 CSS 值
      // Vue3/微码组件由 LLM 生成，CSS 可能包含缺少属性前缀的裸值行
      // （如 linear-gradient(...) 丢失 background: 前缀），
      // 这些行会导致 PostCSS Unknown word 解析错误，污染整个构建
      //
      // 行为策略：
      // - dev 模式：清洗孤儿值，同时通过 this.warn() 暴露具体警告
      //   （终端可见，方便 playground 调试，dev server 不被中断）
      // - build 模式：静默清洗，不输出警告
      {
        name: 'workspace-css-guard',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('.vue')) return
          if (!id.includes('/vue3-components/') && !id.includes('/custom-components/')) return

          // 🔧 修复 workspace 组件 package/ 目录下的错误图片路径
          // 管线生成 package/index.vue 时可能使用 ./resources/，
          // 但 resources/ 在 package/ 的父级，正确路径应为 ../resources/
          let fixed = code
          if (id.includes('/package/')) {
            const before = fixed
            const expectedPrefix = id.includes('/package/components/')
              ? '../../resources/'
              : '../resources/'
            fixed = fixed.replace(
              /['"](?:\.\.\/)+resources\/|['"]\.\/resources\//g,
              (m) => `${m.charAt(0)}${expectedPrefix}`
            )
            if (fixed !== before && !isBuild) {
              const shortPath = id.replace(/^.*\/src\//, 'src/')
              this.warn(`[CSS Guard] ${shortPath} 已按 package 文件层级修正 resources/ 相对路径`)
            }
          } else if (id.includes('/vue3-components/')) {
            // Vue3 新结构：package/index.vue 在 package/ 子目录中，应使用 ../resources/
            // package/components/*.vue 在更深的子目录中，应使用 ../../resources/
            const before = fixed
            const expectedPrefix = id.includes('/package/components/')
              ? '../../resources/'
              : id.includes('/package/')
                ? '../resources/'
                : id.includes('/components/')
                  ? '../resources/'
                  : './resources/'
            fixed = fixed.replace(
              /['"](?:\.\.\/)+resources\/|['"]\.\/resources\//g,
              (m) => `${m.charAt(0)}${expectedPrefix}`
            )
            if (fixed !== before && !isBuild) {
              const shortPath = id.replace(/^.*\/src\//, 'src/')
              this.warn(`[CSS Guard] ${shortPath} 已按 Vue3 文件层级修正 resources/ 相对路径`)
            }
          }

          const plugin = this
          return fixed.replace(
            /(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
            (match, openTag, css, closeTag) => {
              const { cleaned, dropped } = stripOrphanCssValues(css)
              if (!isBuild && dropped.length > 0) {
                const shortPath = id.replace(/^.*\/src\//, 'src/')
                const detail = dropped.map((d) => `  → ${d.line.trim().slice(0, 60)}`).join('\n')
                plugin.warn(
                  `[CSS Guard] ${shortPath} 发现 ${dropped.length} 行孤儿 CSS 值（缺少属性前缀），已自动过滤：\n${detail}`
                )
              }
              return openTag + cleaned + closeTag
            }
          )
        }
      },
      // 配置svg
      // createSvgIconsPlugin({
      //   // 指定需要缓存的图标文件夹
      //   iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      //   // 指定symbolId格式
      //   symbolId: 'icon-[dir]-[name]'
      // }),
      // eslintPlugin({
      //   include: ['src/**/*.ts', 'src/**/*.vue', 'src/*.ts', 'src/*.vue']
      // }),
      // VueDevTools(),
      AutoImport({
        imports: ['vue', 'pinia', 'vue-router'],
        eslintrc: {
          enabled: true, // 1、改为true用于生成eslint配置。2、生成后改回false，避免重复生成消耗
          globalsPropValue: true,
          filepath: 'scaffold-config/.eslint-global-variables.json'
        },
        dirs: ['src/store/modules/**', 'src/utils/auto-import/**'],
        dts: 'scaffold-config/auto-imports.d.ts'
      }),
      Components({
        resolvers: [
          AntDesignVueResolver({
            importStyle: false // css in js
          }),
          '.ts',
          '.tsx'
        ],
        extensions: ['vue'],
        dirs: ['src/components/base-components'],
        deep: true,
        dts: 'scaffold-config/components.d.ts'
      }),
      simpleHtmlPlugin({
        minify: isBuild,
        inject: {
          data: {
            title: '感智晓界',
            MCVersion: '当前版本：v' + packageConfig.version,
            pulishDateTime: new Date().getTime(),
            baseUrl: packageConfig.publicPath
          }
        }
      }),
      // 自定义插件，用于生成页面文件的path，并添加到虚拟模块
      // pluginPagePathes(),
      // 自定义插件，用于生成自定义icon，并添加到虚拟模块
      // pluginIcons(),
      // 移除非必要的vue-router动态路由警告: No match found for location with path
      removeNoMatch(),
      // icon地址配置
      ViteSvgLoader()
    ],
    css: {
      postcss: {
        plugins: [
          pxtorem({
            rootValue: config.pxtorem.baseSize, // 结果为：设计稿元素尺寸/16，比如元素宽320px,最终页面会换算成 20rem
            propList: config.pxtorem.open ? ['*'] : [], // 是一个存储哪些将被转换的属性列表，这里设置为['*']全部，假设需要仅对边框进行设置，可以写['*', '!border*']
            unitPrecision: 5, // 保留rem小数点多少位
            minPixelValue: 5, // 设置要替换的最小像素值 px小于x的不会被转换
            selectorBlackList: ['.norem', '.root-container'], // 过滤掉.norem开头的class，不进行rem转换
            exclude: /node_modules/i, // 这里表示不处理node_modules文件下的css
            mediaQuery: false // 是否在媒体查询的css代码中也进行转换
          })
        ]
      },
      preprocessorOptions: {
        less: {
          additionalData: `@import "@/assets/styles/variables.less";`,
          javascriptEnabled: true,
          math: 'strict'
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
        '~': path.resolve(process.cwd())
      }
    },
    server: {
      host: '0.0.0.0',
      port: config.devPort,
      open: false,
      // 忽略 workspace 目录的文件变化：Playground 实时编辑会经 /__raw 写回 frontend/workspace，
      // 这些文件不属 Vite 模块图，不应触发 HMR/整页刷新。
      watch: {
        // ⚠️ 绝对路径精确指向 frontend/workspace（微码/预览大目录），
        // 不要用 '**/workspace/**'——它会误伤 frontend/src/views/workspace/ 这类源码目录，
        // 导致 chokidar 不监听其文件变化，手动改 src 文件 HMR 不触发、页面不刷新。
        ignored: ['**/node_modules/**', '**/.git/**', path.join(process.cwd(), 'workspace') + '/**']
      },
      proxy: {
        // ───────── Node.js 后端 (Port 13030) ─────────
        // 认证 / 权限
        ['/api/auth']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/group']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        // ───────── Java 后端 (Port 8080) ─────────
        // 组件拆分（docx 需求文档 + HTML 原型 → 组件 MD 交付包）。
        // 必须排在 '/api/component' 之前：proxy 按声明顺序做前缀匹配，
        // 否则 '/api/component-split/*' 会被 '/api/component' 抢先转发到 Node。
        ['/api/component-split']: {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        },
        // 业务 CRUD（权限守卫）
        // 🔧 修复：component / tasks 由 Node 13030 承载（本地 Java 8080 未启动，原指向 8080 导致 500）
        ['/api/component']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/projects']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/tasks']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        // 用户统计相关接口在 Node 端（13030），必须在 /api/admin 之前声明
        ['/api/admin/user-stats']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/usage-export']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/internal']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/dept-report']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/ai-configs']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/users']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin/components']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        // 任务反馈处置台在 Node 端（FeedbackModule，/api/admin/feedbacks*），
        // 必须在 /api/admin 兜底（→ Java 8080）之前声明，否则 500 No static resource
        ['/api/admin/feedbacks']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/admin']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        // 操作日志：读接口在 Java 侧（Node 只有 fire-and-forget 写，无 GET），显式路由到 8080
        // 不补这条则前端请求落到默认 /api → Node 13030 → 404
        ['/api/operation-log']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/page-generator']: {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        },
        // AI 工作区
        ['/api/sessions']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/chat']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/skills']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/documents']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/token-usage']: {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        },
        ['/api/screen-layout']: {
          target: 'http://localhost:13030',
          changeOrigin: true,
          secure: false
        },
        ['/api/user/git-credential']: {
          target: 'http://localhost:13030',
          changeOrigin: true,
          secure: false
        },
        ['/api/microcode/doc']: {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        },
        ['/api/workflows']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/apifox']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        // SSE 进度推送（需要 SSE 特殊处理）
        ['/api/progress']: {
          target: 'http://localhost:13030',
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('proxyRes', (proxyRes, req, res) => {
              proxyRes.headers['x-real-url'] = new URL(req.url || '', options.target)?.href || ''
              const contentType = proxyRes.headers['content-type'] || ''
              if (contentType.includes('text/event-stream')) {
                proxyRes.headers['x-accel-buffering'] = 'no'
                proxyRes.headers['cache-control'] = 'no-cache'
                proxyRes.headers['connection'] = 'keep-alive'
                if (res.socket) res.socket.setNoDelay(true)
              }
            })
          }
        },
        // AI 管线入口（Node 13030 承载生成引擎，本地 Java 8080 未启动）
        ['/api/phase2']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/vue3']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/demo']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/preview']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        ['/api/models']: { target: 'http://localhost:8080', changeOrigin: true, secure: false },
        ['/api/config']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },
        // Lite 轻量生成（含批量接口）
        ['/api/lite']: { target: 'http://localhost:13030', changeOrigin: true, secure: false },

        // ───────── 默认路由：Node 13030（与线上 Nginx /api → NestJS 一致）─────────
        // Java 8080 本地通常未启动（缺 Docker/MySQL），AI 生成及 tasks 等接口均由 Node 承载。
        ['/api']: {
          target: 'http://localhost:13030',
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('proxyRes', (proxyRes, req) => {
              proxyRes.headers['x-real-url'] = new URL(req.url || '', options.target)?.href || ''
            })
          }
        },
        ['/dev']: {
          target: 'https://mvp.gandongyun.cn/gateway/microcode-framework/', // 试用
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp(`^/dev`), ''),
          secure: false,
          configure: (proxy, options) => {
            // 配置此项可在响应头中看到请求的真实地址
            proxy.on('proxyRes', (proxyRes, req) => {
              proxyRes.headers['x-real-url'] = new URL(req.url || '', options.target)?.href || ''
            })
          }
        }
      }
    },
    build: {
      // 生产环境构建文件的目录名
      assetsDir: config.assetsDir,
      // 打包生成文件名
      outDir: 'dist',
      terserOptions: {
        compress: {
          drop_console: true // 移除console
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            // 将第三方库分块打包
            vendor: ['vue', 'vue-router', 'pinia'],
            'ant-design': ['ant-design-vue'],
            vueuse: ['@vueuse/core'],
            // 其他大型依赖也可以单独拆分
            // 独立分包后可被浏览器单独缓存，不影响主包加载速度
            'microvideo-map': ['microvideo-map']
          },
          chunkFileNames: 'static/js/[name]-[hash].js',
          assetFileNames: 'static/[ext]/[name]-[hash].[ext]',
          entryFileNames: 'static/js/[name]-[hash].js'
        }
      },
      // 资源文件不放入js文件中
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1024 // chunk 大小警告的限制（单位kb）
    },
    // 加入 optimizeDeps 让 esbuild 预处理并缓存，避免每次 dev 启动都重新解析
    optimizeDeps: {
      include: ['microvideo-map'],
      // 只扫描明确入口，跳过 custom-components 中的 AI 生成源码
      // （这些组件通过 import.meta.glob 运行时动态加载，不应被预扫描）
      entries: ['index.html', 'src/main.js'],
      // 排除 AI 生成的源码目录，防止 esbuild 扫描损坏的文件
      exclude: [
        'src/workspace/custom-components',
        'src/workspace/vue3-components',
        'src/workspace/api-modules'
      ]
    }
  }
})
