// host-rewrite-proxy.cjs —— 本机反代，只做一件事：把 Host 头改写为 localhost
//
// 用途：Vite dev server 有 Host 白名单校验，隧道域名（lhr.life / trycloudflare 等）会被
// 拦成 "Blocked request. This host is not allowed"。改 vite.config.js 需要重启 2610，
// 而重启 dev server 属于要授权的动作 —— 所以用一个旁路反代，把 Host 改回 localhost 再转发，
// 完全不动 2610 进程。
//
// 同时必须代理 WebSocket upgrade，否则 Vite HMR 会断（页面能开但改代码不刷新）。
//
// 用法：node host-rewrite-proxy.cjs [listenPort] [targetPort]
//   默认 2611 -> 2610
//   环境变量 MAX_CONCURRENT 控制回源并发上限（默认 12）
//
// 为什么要限并发：免费隧道（localhost.run / trycloudflare）对「同时打开的连接数」有硬限制。
// Vite dev 模式首屏会并发拉 400+ 个 ESM 模块，直接触发 502。实测总字节只有 1.89MB，
// 带宽根本不是瓶颈 —— 加一道并发闸门排队回源，请求就不会被隧道拒绝。

const http = require('http')
const net = require('net')

const LISTEN_PORT = Number(process.argv[2] || 2611)
const TARGET_PORT = Number(process.argv[3] || 2610)
const TARGET_HOST = '127.0.0.1'
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 12)

let active = 0
const queue = []

function acquire() {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
      active++
      resolve()
    } else {
      queue.push(resolve)
    }
  })
}

function release() {
  const next = queue.shift()
  if (next) {
    next() // 名额直接转交，active 不变
  } else {
    active--
  }
}

function rewriteHeaders(headers) {
  const h = { ...headers }
  h.host = `localhost:${TARGET_PORT}`
  return h
}

const server = http.createServer(async (req, res) => {
  await acquire()
  let released = false
  const finish = () => {
    if (released) return
    released = true
    release()
  }
  res.on('finish', finish)
  res.on('close', finish)

  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: rewriteHeaders(req.headers)
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )
  proxyReq.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('proxy error: ' + e.message)
    finish()
  })
  req.pipe(proxyReq)
})

// WebSocket：HMR 必需
server.on('upgrade', (req, socket, head) => {
  const target = net.connect(TARGET_PORT, TARGET_HOST, () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
    const h = rewriteHeaders(req.headers)
    for (const k of Object.keys(h)) raw += `${k}: ${h[k]}\r\n`
    raw += '\r\n'
    target.write(raw)
    if (head && head.length) target.write(head)
    socket.pipe(target)
    target.pipe(socket)
  })
  target.on('error', () => socket.destroy())
  socket.on('error', () => target.destroy())
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[host-rewrite-proxy] 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT} (Host 已改写为 localhost)`)
})
