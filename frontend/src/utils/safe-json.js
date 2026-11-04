/**
 * fetch 响应的安全 JSON 解析（单一来源）。
 *
 * 为什么需要：
 *   后端重启窗口内，请求可能打到「已 listen 但尚未就绪」或「正在退出」的进程，
 *   经 Vite 代理后拿到**空响应体**（HTTP 200/500/502 且 body 为空）。此时
 *   `await res.json()` 会抛
 *   `Failed to execute 'json' on 'Response': Unexpected end of JSON input`
 *   ——这对用户是纯噪声，看不出「服务正在重启，稍后重试」这一真实语义，
 *   也无法从错误区分「网络断开」「服务 500」「返回了 HTML 错误页」。
 *
 * 本函数把「空响应 / 非 JSON 响应」统一转成**带状态码的可读错误**，
 * 并保持原有 try/catch 语义（调用方 catch 分支不变）。
 *
 * 注意：刻意不做自动重试——POST 类端点（如 generate）重试可能重复建任务；
 * 重试策略应交由调用方按端点幂等性决定。
 *
 * @param {Response} res fetch 响应对象
 * @returns {Promise<any>} 解析后的 JSON
 * @throws {Error} 空响应 / 非 JSON 时抛出带 HTTP 状态码的可读错误
 */
export async function readJson(res) {
  let text = ''
  try {
    text = await res.text()
  } catch (e) {
    throw new Error(`读取响应失败（HTTP ${res.status || 0}）：${e.message}`)
  }
  if (!text) {
    // 空响应体：重启窗口 / 代理 502 / 连接被断开 的典型特征
    const hint = res.status === 0 || res.status >= 500
      ? '（服务可能正在重启，请稍后重试）'
      : ''
    throw new Error(`服务返回空响应（HTTP ${res.status || 0}）${hint}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    // 非 JSON：可能是代理/网关返回的 HTML 错误页
    throw new Error(`响应不是合法 JSON（HTTP ${res.status || 0}）：${text.slice(0, 120)}`)
  }
}

export default readJson
