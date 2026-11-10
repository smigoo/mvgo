#!/usr/bin/env node
/**
 * Node 版 WebSocket relay —— 等价改写自 Bun 版 src/socket.ts
 * 协议完全一致，供 cursor-talk-to-figma-mcp 的 Figma 插件与 MCP server 通信
 * 用法: node socket-server.mjs  (默认端口 3055)
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import http2 from "node:http2";
import { WebSocketServer, WebSocket } from "ws";

// macOS 双栈网络下，Node 默认可能先试 IPv6；若 IPv6 不可达会卡死（curl 因 happy-eyeballs 更稳所以正常）。
// 强制 DNS 优先返回 IPv4，规避「curl 能通、Node 直连挂起」的问题。
dns.setDefaultResultOrder("ipv4first");

const PORT = Number(process.env.PORT || 3055);

// channel 名 -> 客户端集合
const channels = new Map();
// channel 元信息（供 GET /channels 自动发现）：joinedAt 首次加入时间, lastActivity 最近活动时间
const channelMeta = new Map();

function touchChannel(name) {
  const now = Date.now();
  if (!channelMeta.has(name)) channelMeta.set(name, { joinedAt: now });
  channelMeta.get(name).lastActivity = now;
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }
  // channel 列表查询（供 figma-cli/batch 自动发现活跃 channel）
  if (req.method === "GET" && req.url.split("?")[0] === "/channels") {
    const list = [...channels.entries()]
      .filter(([, clients]) => clients.size > 0)
      .map(([name, clients]) => ({
        name,
        clients: clients.size,
        ...(channelMeta.get(name) || {}),
      }))
      .sort((a, b) => (b.clients - a.clients) || ((b.joinedAt || 0) - (a.joinedAt || 0)));
    res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
    res.end(JSON.stringify({ channels: list }));
    return;
  }
  // 模型列表探测：转发 GET {baseUrl}/models（OpenAI 兼容），用于让用户在插件里直接看到网关有哪些模型可用
  if (req.method === "GET" && req.url.split("?")[0] === "/llm-models") {
    const qu = new URL(req.url, "http://localhost");
    const baseUrl = (qu.searchParams.get("baseUrl") || "").trim();
    const apiKey = (qu.searchParams.get("apiKey") || "").trim();
    if (!baseUrl || !apiKey) {
      res.writeHead(400, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少 baseUrl / apiKey" }));
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      res.writeHead(400, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "baseUrl 必须以 http:// 或 https:// 开头" }));
      return;
    }
    const t0 = Date.now();
    const log = (...a) => console.log(`[llm-models][${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);
    const target = new URL(baseUrl.replace(/\/+$/, "") + "/models");
    log("请求:", target.href, "HTTPS_PROXY=", process.env.HTTPS_PROXY || process.env.https_proxy || "(未设置)");
    const finish = (status, body) => {
      log("响应 :status=", status, "| 长度", body.length);
      if (!res.headersSent) res.writeHead(status, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(body);
    };
    try {
      if (target.protocol === "https:") {
        const session = http2.connect(target.origin, { timeout: 60000, family: 4 });
        session.on("error", (e) => { console.error("[llm-models] H2 错误:", e.message); finish(502, JSON.stringify({ error: "代理转发失败：" + e.message })); try { session.close(); } catch {} });
        const g = session.request({ ":method": "GET", ":path": target.pathname + target.search, authorization: "Bearer " + apiKey, accept: "application/json" });
        g.setTimeout(60000, () => { try { g.destroy(); } catch {} try { session.close(); } catch {} if (!res.writableEnded) finish(504, JSON.stringify({ error: "模型列表请求超时(60s)" })); });
        let status = 502, body = "";
        g.on("response", (h) => { status = h[":status"] || 502; });
        g.on("data", (c) => { body += c.toString(); });
        g.on("end", () => { try { session.close(); } catch {} finish(status, body); });
        g.on("error", (e) => { if (!res.writableEnded) finish(502, JSON.stringify({ error: "模型列表请求失败：" + e.message })); try { session.close(); } catch {} });
        g.end();
      } else {
        const g = http.get(target, { headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }, family: 4, timeout: 60000 }, (up) => {
          let body = "";
          up.on("data", (c) => { body += c.toString(); });
          up.on("end", () => finish(up.statusCode || 502, body));
        });
        g.on("timeout", () => { try { g.destroy(new Error("timeout")); } catch {} });
        g.on("error", (e) => { if (!res.writableEnded) finish(502, JSON.stringify({ error: "模型列表请求失败：" + e.message })); });
      }
    } catch (e) {
      if (!res.writableEnded) finish(502, JSON.stringify({ error: "模型列表请求失败：" + e.message }));
    }
    return;
  }
  // LLM 代理：插件 UI 在 Figma 的 iframe 里受浏览器 CORS / 混合内容限制，
  // 直接 fetch 第三方 LLM 常报 Failed to fetch。这里由本地 Node 服务端转发，
  // 浏览器只与 localhost:PORT 通信（已加 CORS 头），真正的 LLM 请求在服务端发出，不受 CORS 限制。
  if (req.method === "POST" && req.url.split("?")[0] === "/llm-proxy") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let cfg;
    try {
      cfg = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "请求体不是合法 JSON" }));
      return;
    }
    const { baseUrl, apiKey, model, messages, temperature = 0.2, max_tokens, reasoning_effort, thinking } = cfg;
    if (!baseUrl || !apiKey || !model || !Array.isArray(messages)) {
      res.writeHead(400, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少 baseUrl / apiKey / model / messages" }));
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      res.writeHead(400, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "baseUrl 必须以 http:// 或 https:// 开头" }));
      return;
    }
    try {
      const target = new URL(baseUrl.replace(/\/+$/, "") + "/chat/completions");
      const payload = JSON.stringify({ model, temperature, ...(max_tokens ? { max_tokens } : {}), ...(reasoning_effort ? { reasoning_effort } : {}), ...(thinking ? { thinking } : {}), messages });
      // 分析日志（请求摘要，绝不打印 apiKey）
      console.log(`[llm-proxy] 请求: model=${model} messages=${messages.length} body=${payload.length}字节 (key 已隐藏)${reasoning_effort ? " | reasoning_effort=" + reasoning_effort : ""}${thinking ? " | thinking=" + JSON.stringify(thinking) : ""}`);

      // 错误归类提示（连接层）
      const classify = (err) => {
        const code = err.code || err.message || "";
        if (/ETIMEDOUT|timeout|ECONNRESET|aborted|GOAWAY|closed/i.test(code))
          return "（连接/响应超时或会话中断：300s 内未能完成 H2 握手或拿到响应）";
        if (/ENOTFOUND/.test(code)) return "（域名解析失败：检查 Base URL 是否拼错）";
        if (/ECONNREFUSED/.test(code)) return "（连接被拒：目标端口未监听 / 本地网关未启动）";
        if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|PROTOCOL/i.test(code))
          return "（TLS/协议错误：ALPN 协商失败或自签证书）";
        return "（详见终端日志的 [llm-proxy] 行）";
      };

      // 两分支共用的计时日志（H2 / HTTP 都打印带秒数的阶段）
      const t0 = Date.now();
      const log = (...a) => console.log(`[llm-proxy][${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);

      if (target.protocol === "https:") {
        // HTTPS 目标：改用 HTTP/2 转发。
        // 根因：token.microvideo.cn 等网关 ALPN 仅接受 h2；Node 的 http.request 发 HTTP/1.1 会被网关「收下不回包」→ 120s 超时。
        // curl 默认协商 h2 所以正常；这里用 node:http2 走同一条成功路径。
        log("H2 转发开始:", target.href, "| HTTPS_PROXY=", process.env.HTTPS_PROXY || process.env.https_proxy || "(未设置)");
        const session = http2.connect(target.origin, { timeout: 300000, family: 4 });
        session.on("connect", () => log("H2 会话已连上(TLS完成), ALPN=", session.alpnProtocol));
        session.on("frameError", (type, code, id) => log("H2 frameError type=", type, "code=", code, "stream=", id));
        let settled = false;
        const fail = (status, msg, hint) => {
          if (settled) return; settled = true;
          console.error("[llm-proxy] H2 转发失败:", msg, "|", hint);
          if (res.headersSent) {
            if (!res.writableEnded) res.end();
          } else {
            res.writeHead(status, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "代理转发失败：" + msg + hint }));
          }
          try { session.close(); } catch {}
        };
        session.on("error", (err) => fail(502, err.message, classify(err)));
        session.setTimeout(300000, () => {
          try { session.destroy(); } catch {}
          fail(504, "session timeout (300s)", "（H2 会话在 300s 内未就绪/无活动——多为出网需走代理，或 DNS/IPv6 卡死）");
        });

        const req = session.request({
          ":method": "POST",
          ":path": target.pathname + target.search,
          "content-type": "application/json",
          // 下面三项模拟 curl 默认请求头，规避个别网关/代理对头的敏感度
          "content-length": Buffer.byteLength(payload),
          "user-agent": "mv-figma-plugin/1.0",
          accept: "application/json",
          authorization: "Bearer " + apiKey,
        });
        log("H2 流已创建, 发送请求体", Buffer.byteLength(payload), "字节 (流式转发)");
        let statusCode = 502, contentType = "application/json", bytes = 0, preview = "";
        req.on("response", (headers) => {
          statusCode = headers[":status"] || 502;
          contentType = headers["content-type"] || "application/json";
          log("H2 收到响应头 :status=", statusCode, "content-type=", contentType);
          // 收到响应头立即把上游头转给浏览器（流式），避免网关/浏览器缓冲整段
          if (!res.headersSent) {
            res.writeHead(statusCode, {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": contentType,
              "Cache-Control": "no-store",
              "X-Accel-Buffering": "no",
            });
          }
        });
        req.on("data", (c) => {
          bytes += c.length;
          if (!preview && c.length) preview = c.slice(0, 400).toString();
          if (res.headersSent && !res.writableEnded) res.write(c);
        });
        req.on("end", () => {
          if (settled) return; settled = true;
          log("H2 响应完成:", statusCode, "|", bytes, "字节 | 预览:", preview.replace(/\s+/g, " "));
          if (!res.writableEnded) res.end();
          try { session.close(); } catch {}
        });
        req.on("error", (err) => fail(502, err.message, classify(err)));
        req.setTimeout(300000, () => {
          try { req.destroy(); } catch {}
          fail(504, "request timeout (300s)", "（H2 请求在 300s 内未拿到响应——已连上但服务端/中间代理未回包：多为需走代理，或网关对 Node h2 请求头敏感）");
        });
        req.write(payload);
        req.end();
      } else {
        // HTTP 目标（localhost mock 等）：仍用 Node 内置 http 转发，family:4 强制 IPv4，流式 pipe。
        const upstreamReq = http.request(
          target,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + apiKey,
              "Content-Length": Buffer.byteLength(payload),
            },
            family: 4,
            timeout: 300000,
          },
          (upstreamRes) => {
            log("HTTP 收到响应头 :status=", upstreamRes.statusCode, "content-type=", upstreamRes.headers["content-type"]);
            if (!res.headersSent) {
              res.writeHead(upstreamRes.statusCode || 502, {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": upstreamRes.headers["content-type"] || "application/json",
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
              });
            }
            let bytes = 0, preview = "";
            upstreamRes.on("data", (c) => {
              bytes += c.length;
              if (!preview && c.length) preview = c.slice(0, 400).toString();
              if (!res.writableEnded) res.write(c);
            });
            upstreamRes.on("end", () => {
              console.log(`[llm-proxy] 响应(HTTP): status=${upstreamRes.statusCode || 502} ${bytes}字节 | 预览:`, preview.replace(/\s+/g, " "));
              if (!res.writableEnded) res.end();
            });
          }
        );
        upstreamReq.on("timeout", () => upstreamReq.destroy(new Error("request timeout (300s)")));
        upstreamReq.on("error", (err) => {
          const code = err.code || err.message;
          console.error("[llm-proxy] 转发失败:", err.message, "| cause:", code);
          if (!res.headersSent) {
            res.writeHead(502, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "代理转发失败：" + err.message + classify(err) }));
          } else if (!res.writableEnded) {
            res.end();
          }
        });
        upstreamReq.write(payload);
        upstreamReq.end();
      }
    } catch (e) {
      console.error("[llm-proxy] 请求构造失败:", e.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "代理转发失败：" + e.message }));
      }
    }
    return;
  }
  if (req.method === "POST") {
    res.writeHead(404, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "未知路由：" + req.url + "（socket-server 未更新？请杀掉旧进程并用新代码重启）" }));
    return;
  }
  res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
  res.end("WebSocket server running");
});

const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on("connection", (ws) => {
  console.log("New client connected");
  send(ws, { type: "system", message: "Please join a channel to start chatting" });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    console.log(`\n=== Received message from client ===`);
    console.log(`Type: ${data.type}, Channel: ${data.channel || "N/A"}`);
    if (data.message?.command) console.log(`Command: ${data.message.command}, ID: ${data.id}`);

    // ---- join ----
    if (data.type === "join") {
      const channelName = data.channel;
      if (!channelName || typeof channelName !== "string") {
        send(ws, { type: "error", message: "Channel name is required" });
        return;
      }
      if (!channels.has(channelName)) channels.set(channelName, new Set());
      const clients = channels.get(channelName);
      clients.add(ws);
      touchChannel(channelName);
      console.log(`\n✓ Client joined channel "${channelName}" (${clients.size} total clients)`);
      send(ws, { type: "system", message: `Joined channel: ${channelName}`, channel: channelName });
      send(ws, {
        type: "system",
        message: { id: data.id, result: "Connected to channel: " + channelName },
        channel: channelName,
      });
      clients.forEach((client) => {
        if (client !== ws) {
          send(client, { type: "system", message: "A new user has joined the channel", channel: channelName });
        }
      });
      return;
    }

    // ---- regular message -> broadcast to others in channel ----
    if (data.type === "message") {
      const channelName = data.channel;
      if (!channelName || typeof channelName !== "string") {
        send(ws, { type: "error", message: "Channel name is required" });
        return;
      }
      const clients = channels.get(channelName);
      if (!clients || !clients.has(ws)) {
        send(ws, { type: "error", message: "You must join the channel first" });
        return;
      }
      let count = 0;
      clients.forEach((client) => {
        if (client !== ws) {
          count++;
          send(client, { type: "broadcast", message: data.message, sender: "peer", channel: channelName });
        }
      });
      console.log(`Broadcast to ${count} client(s) in channel "${channelName}"`);
      return;
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          channels.delete(channelName);
          channelMeta.delete(channelName);
        }
        clients.forEach((client) => {
          send(client, { type: "system", message: "A user has left the channel", channel: channelName });
        });
      }
    });
  });

  ws.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`WebSocket relay listening on ws://localhost:${PORT}`);
  console.log("Open the mv-figma 文件自动整理 plugin in Figma and join a channel.");
});
