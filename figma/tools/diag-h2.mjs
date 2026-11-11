#!/usr/bin/env node
/**
 * 独立诊断：在你的 Mac 上精确复现 socket-server 的 H2 转发，报告每一步耗时与结果。
 * 用法:
 *   node diag-h2.mjs                                   # 用默认 token.microvideo.cn + 假 key
 *   node diag-h2.mjs <baseUrl> <apiKey> <model>        # 自定义
 * 例:
 *   node diag-h2.mjs https://token.microvideo.cn/v1 sk-真实key gpt-3.5-turbo
 *
 * 看输出重点:
 *   - [DNS] 解析出的 IPv4 / IPv6
 *   - [H2] 是否 "会话已连上" + ALPN=h2 (连得上说明 TLS/ALPN OK)
 *   - [H2] 是否 "收到响应头" (连上但没这行 = 服务端/代理不回包 → 卡在流)
 *   - 末尾 RESULT 或 ERROR
 */
import http2 from "node:http2";
import dns from "node:dns";
import https from "node:https";

dns.setDefaultResultOrder("ipv4first");

const baseUrl = process.argv[2] || "https://token.microvideo.cn/v1";
const apiKey = process.argv[3] || "sk-diag-fake";
const model = process.argv[4] || "gpt-3.5-turbo";
const target = new URL(baseUrl.replace(/\/+$/, "") + "/chat/completions");
const payload = JSON.stringify({
  model,
  temperature: 0.2,
  messages: [{ role: "user", content: "ping" }],
});

const t0 = Date.now();
const log = (...a) => console.log(`[diag][${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);

console.log("=== H2 转发诊断 ===");
console.log("target:", target.href);
console.log("HTTPS_PROXY env:", process.env.HTTPS_PROXY || process.env.https_proxy || "(未设置)");
console.log("Node:", process.version);

// 1) DNS
try {
  const a = await dns.promises.lookup(target.hostname, { all: true });
  console.log("[DNS] 解析结果:", a.map((x) => `${x.address}(${x.family === 4 ? "IPv4" : "IPv6"})`).join(", "));
} catch (e) {
  console.log("[DNS] 解析失败:", e.message);
}

// 2) 先做个纯 TLS 连通性探测（不走 h2 语义，只看 TCP+TLS 是否通）
await new Promise((resolve) => {
  const s = https.request(
    { host: target.hostname, port: 443, method: "HEAD", family: 4, timeout: 10000, path: "/" },
    (r) => { log("[TLS探测] 收到 HTTP 状态", r.statusCode); r.resume(); resolve(); }
  );
  s.on("timeout", () => { log("[TLS探测] 10s 超时"); s.destroy(); resolve(); });
  s.on("error", (e) => { log("[TLS探测] 错误:", e.message); resolve(); });
  s.end();
});

// 3) H2 转发复现
log("开始 http2.connect ->", target.origin);
const session = http2.connect(target.origin, { timeout: 120000, family: 4 });
session.on("connect", () => log("会话已连上(TLS完成), ALPN=", session.alpnProtocol));
session.on("error", (e) => log("会话错误:", e.message));
session.on("frameError", (type, code, id) => log("frameError type=", type, "code=", code, "stream=", id));

const req = session.request({
  ":method": "POST",
  ":path": target.pathname + target.search,
  "content-type": "application/json",
  "content-length": Buffer.byteLength(payload),
  "user-agent": "mvgo-figma-structure/1.0",
  accept: "application/json",
  authorization: "Bearer " + apiKey,
});
log("流已创建, 发送", Buffer.byteLength(payload), "字节");

let data = "";
let gotResponse = false;
req.on("response", (h) => {
  gotResponse = true;
  log("收到响应头 :status=", h[":status"], "content-type=", h["content-type"]);
});
req.on("data", (c) => (data += c.toString()));
req.on("end", () => {
  log("响应完成, 共", data.length, "字节");
  console.log("\n=== RESULT ===");
  console.log(data.slice(0, 500));
  session.close();
  process.exit(0);
});
req.on("error", (e) => log("流错误:", e.message));
req.setTimeout(120000, () => {
  log("流 120s 超时 (连上但未拿到响应)");
  console.log("\n=== ERROR ===");
  console.log(gotResponse ? "已收到响应头但 body 未完成" : "未收到任何响应头 —— 服务端/中间代理对 Node h2 请求不回包");
  console.log("建议: 若公司网络需代理，设置 HTTPS_PROXY 后本脚本仍直连(不支持代理)；或确认是否与 curl 同网络");
  try { session.close(); } catch {}
  process.exit(1);
});
req.write(payload);
req.end();
