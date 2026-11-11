#!/usr/bin/env node
/**
 * figma-batch.mjs —— 批量改造清单执行器（命名 + AL 一步到位）
 * 用法: node figma-batch.mjs <channel> <ops.json>
 * ops.json: { "ops": [
 *   {"action":"rename",        "nodeId":"1:1","name":"cp-x"},
 *   {"action":"set_layout_mode","nodeId":"1:1","layoutMode":"VERTICAL","itemSpacing":12},
 *   {"action":"set_axis_align","nodeId":"1:1","primaryAxisAlignItems":"SPACE_BETWEEN","counterAxisAlignItems":"CENTER"},
 *   {"action":"set_layout_sizing","nodeId":"1:1","horizontal":"FILL"},
 *   {"action":"set_item_spacing","nodeId":"1:1","itemSpacing":8},
 *   {"action":"set_padding","nodeId":"1:1","paddingTop":12,"paddingRight":12,"paddingBottom":12,"paddingLeft":12},
 *   {"action":"set_parent",    "nodeId":"1:2","parentId":"1:3","index":0},
 *   {"action":"move_node",     "nodeId":"1:2","x":10,"y":0},
 *   {"action":"create_frame",  "x":0,"y":0,"width":100,"height":100,"name":"n","fillColor":{"r":0,"g":0,"b":0,"a":0},"layoutMode":"NONE","asVar":"newFrameId"},
 *   {"action":"delete_node",   "nodeId":"1:2"},
 *   {"action":"export_image",  "nodeId":"1:1","outFile":"/tmp/shot.png"}
 * ]}
 * 支持 "${newFrameId}" 变量替换（引用 create_frame 产物 id）
 */
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { resolveChannel } from "./resolve-channel.mjs";

const [, , channelArg, opsFile] = process.argv;
if (!opsFile) { console.error("Usage: node figma-batch.mjs [channel|auto] <ops.json>"); process.exit(2); }
const channel = await resolveChannel(channelArg);

const { ops } = JSON.parse(fs.readFileSync(opsFile, "utf8"));
const vars = {};
const results = [];

const ws = new WebSocket("ws://localhost:3055");
const joinId = randomUUID();
let joined = false;
let queue = [];

function substitue(v) {
  if (typeof v === "string") return v.replace(/\$\{([\w-]+)\}/g, (_, k) => vars[k] ?? `\${${k}}`);
  if (Array.isArray(v)) return v.map(substitue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, substitue(val)]));
  return v;
}

function sendCmd(command, params) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const p = substitue(params);
    const timeout = setTimeout(() => reject(new Error(`TIMEOUT ${command}`)), 60000);
    pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
    ws.send(JSON.stringify({ id, type: "message", channel, message: { id, command, params: { ...p, commandId: id } } }));
  });
}
const pending = new Map();

async function run() {
  for (let i = 0; i < ops.length; i++) {
    const op = substitue(ops[i]);
    const label = `[${i + 1}/${ops.length}] ${op.action} ${op.nodeId ?? ""} ${op.name ?? ""}`;
    try {
      let r;
      switch (op.action) {
        case "export_image": {
          r = await sendCmd("export_node_as_image", { nodeId: op.nodeId, format: "PNG", scaleFactor: op.scale ?? 1 });
          const b64 = (r.imageData || "").split(",").pop();
          fs.writeFileSync(op.outFile, Buffer.from(b64, "base64"));
          console.log(`✓ ${label} → ${op.outFile}`);
          break;
        }
        default: {
          // action 名 -> 插件实际命令名映射（插件里 rename 叫 rename_node）
          const ACTION_CMD = { rename: "rename_node" };
          r = await sendCmd(ACTION_CMD[op.action] ?? op.action, op);
          if (op.asVar) { vars[op.asVar] = r.id ?? r; console.log(`✓ ${label} → ${op.asVar}=${vars[op.asVar]}`); }
          else console.log(`✓ ${label}`);
        }
      }
      results.push({ i: i + 1, ok: true });
    } catch (e) {
      console.error(`✗ ${label} FAILED: ${e.message}`);
      results.push({ i: i + 1, ok: false, err: e.message });
    }
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\nBATCH_DONE ok=${results.length - fail.length} fail=${fail.length}`);
  process.exit(fail.length ? 1 : 0);
}

ws.on("open", () => ws.send(JSON.stringify({ id: joinId, type: "join", channel })));
ws.on("message", (raw) => {
  const data = JSON.parse(raw.toString());
  if (!joined) {
    if (data.type === "system" && data.message && typeof data.message === "object"
        && data.message.result && String(data.message.result).startsWith("Connected to channel")) {
      joined = true; run();
    }
    return;
  }
  const msg = data.message;
  if (msg && msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  }
});
ws.on("error", (e) => { console.error("WS_ERROR:", e.message); process.exit(1); });
