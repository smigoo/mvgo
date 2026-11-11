#!/usr/bin/env node
/**
 * figma-cli.mjs —— 绕过 MCP，直连 talk-to-figma socket 操控 Figma 插件
 * 用法:
 *   node figma-cli.mjs <channel> get_document_info
 *   node figma-cli.mjs <channel> get_selection
 *   node figma-cli.mjs <channel> get_node_info '{"nodeId":"1:2"}'
 *   node figma-cli.mjs <channel> set_layout_mode '{"nodeId":"1:2","layoutMode":"VERTICAL"}'
 */
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { resolveChannel } from "./resolve-channel.mjs";

const [, , channelArg, command, paramsJson] = process.argv;
if (!command) {
  console.error("Usage: node figma-cli.mjs [channel|auto] <command> [jsonParams]");
  process.exit(2);
}
const channel = await resolveChannel(channelArg);
let params = {};
if (paramsJson) {
  try { params = JSON.parse(paramsJson); }
  catch (e) { console.error("Invalid JSON params:", e.message); process.exit(2); }
}

const ws = new WebSocket("ws://localhost:3055");
const joinId = randomUUID();
const cmdId = randomUUID();
let joined = false;
let done = false;

const timer = setTimeout(() => {
  if (!done) { console.error("TIMEOUT: no response in 60s (plugin running? channel correct?)"); process.exit(1); }
}, 60000);

ws.on("open", () => {
  ws.send(JSON.stringify({ id: joinId, type: "join", channel }));
});

ws.on("message", (raw) => {
  const data = JSON.parse(raw.toString());

  // 等第二条 join 确认（message 为对象且带 result "Connected to channel: X"）再发命令
  if (!joined) {
    if (data.type === "system" && data.message && typeof data.message === "object"
        && data.message.result && String(data.message.result).startsWith("Connected to channel")) {
      joined = true;
      ws.send(JSON.stringify({
        id: cmdId,
        type: "message",
        channel,
        message: { id: cmdId, command, params: { ...params, commandId: cmdId } },
      }));
    }
    return;
  }

  // 命令响应（broadcast 回来，按 id 匹配）
  const msg = data.message;
  if (msg && msg.id === cmdId) {
    done = true;
    clearTimeout(timer);
    if (msg.error) { console.error("FIGMA_ERROR:", msg.error); process.exit(1); }
    console.log(JSON.stringify(msg.result, null, 2));
    process.exit(0);
  }
});

ws.on("error", (e) => { console.error("WS_ERROR:", e.message, "—— socket 起了吗？(./start.sh)"); process.exit(1); });
