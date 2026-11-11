#!/usr/bin/env node
/**
 * resolve-channel.mjs —— 自动发现活跃 Figma channel
 * 用法（供 figma-cli.mjs / figma-batch.mjs 复用）:
 *   import { resolveChannel } from "./resolve-channel.mjs";
 *   const channel = await resolveChannel("auto"); // "auto"/"-" 或留空 -> 自动发现
 *
 * 依赖 socket-server.mjs 暴露的 GET /channels 接口：
 *   { channels: [{ name, clients, joinedAt, lastActivity }] }
 * 选取策略：优先客户端数多（channel 里同时有插件+其他成员），其次最近加入。
 */
const SOCKET_HTTP = `http://localhost:${process.env.PORT || 3055}`;

export async function resolveChannel(channel) {
  if (channel && channel !== "auto" && channel !== "-") return channel;

  let res, body;
  try {
    res = await fetch(`${SOCKET_HTTP}/channels`);
    body = await res.json();
  } catch (e) {
    console.error("AUTO_CHANNEL_ERROR: 无法查询 socket server 的 /channels ——", e.message);
    console.error("提示: socket server 需要更新后重启（./start.sh），或手动指定 channel 名");
    process.exit(1);
  }

  const list = (body.channels || []).filter((c) => c.clients > 0);
  if (list.length === 0) {
    console.error("AUTO_CHANNEL_ERROR: 当前没有活跃的 channel —— Figma 插件还没 join 任何频道");
    process.exit(1);
  }
  // 优先客户端多（说明插件+调用方都在），再按最近加入时间
  list.sort((a, b) => (b.clients - a.clients) || (b.joinedAt - a.joinedAt));
  const best = list[0];
  if (list.length > 1) {
    console.error(`[auto] 发现 ${list.length} 个活跃 channel (${list.map((c) => c.name).join(", ")})，选用: ${best.name}`);
  }
  return best.name;
}
