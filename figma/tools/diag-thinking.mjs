#!/usr/bin/env node
/**
 * diag-thinking.mjs —— 「关思考」方言诊断（本地跑，Key 不出本机）
 *
 * 背景：部分推理模型（含 DeepSeek V4.1 Flash）默认始终思考，思考 token 计入 max_tokens。
 * 网关若静默忽略 thinking / enable_thinking 等参数，插件就会遇到「正文为空、只有 reasoning_content」。
 * 本脚本把插件用到的每个方言都真发一次，直接给出「哪个方言真的能关掉思考」的结论。
 *
 * 用法:
 *   node diag-thinking.mjs <baseUrl> <apiKey> <model>
 *   LLM_API_KEY=sk-xxx node diag-thinking.mjs https://token.microvideo.cn/v1 "" qwen/qwen3.8-max
 *   node diag-thinking.mjs <baseUrl> <apiKey> <model> --nostream     # 用非流式对比
 *
 * 输出怎么看:
 *   - 正文 > 0 且 思考 = 0  → 该方言真正关掉了思考（最优）
 *   - 正文 > 0 且 思考 > 0  → 思考还开着，但预算够、正文没被吃光（可用）
 *   - 正文 = 0 且 思考 > 0  → 思考吃光预算（就是插件报「只返回思考内容」的场景）
 *   - HTTP 4xx 且提示「始终思考 / 不支持关闭思考」→ 该模型关不掉，只能降到 low
 */
import http2 from "node:http2";
import https from "node:https";
import http from "node:http";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const noStream = argv.includes("--nostream");
const [baseUrl, apiKeyArg, model] = argv.filter((a) => !a.startsWith("--"));
const apiKey = apiKeyArg || process.env.LLM_API_KEY || "";
if (!model || !apiKey) {
  console.error("用法: node diag-thinking.mjs <baseUrl> <apiKey> <model> [--nostream]");
  console.error("或:   LLM_API_KEY=sk-xxx node diag-thinking.mjs <baseUrl> \"\" <model>");
  process.exit(2);
}

const target = new URL(baseUrl.replace(/\/+$/, "") + "/chat/completions");
const HOST = thinkingHost(baseUrl);

function thinkingHost(u) {
  try { return new URL(String(u || "")).host.toLowerCase(); } catch (e) { return String(u || "").toLowerCase(); }
}
// mvgo 的推理模型判定（backend-node/src/ai-engine/utils/model-config.js）
function isReasoningModel(model) {
  const m = String(model || "").trim().toLowerCase();
  if (!m) return false;
  return (/^kimi-k\d/.test(m) || /thinking/.test(m) || /reasoner/.test(m) ||
    /^qwq/.test(m) || /^o1/.test(m) || /^o3/.test(m) || /reasoning/.test(m));
}
// mvgo 的 thinkingDefaultFor：deepseek-v4 系可关；其余推理模型关不掉（mvgo 直接弃用该 provider）
function mvgoVerdict(model) {
  const m = String(model || "").trim().toLowerCase();
  if (/^deepseek-v4/.test(m)) return { closable: true, note: "mvgo：deepseek v4 系 → 注入 thinking:{type:'disabled'}" };
  if (isReasoningModel(m)) return { closable: false, note: "mvgo：推理模型关不掉思考 → mvgo 直接把该 provider 标记 skip 弃用（请改用非推理模型）" };
  return { closable: true, note: "mvgo：非推理模型不注入思考参数（本来就不思考）" };
}
// 与插件同序的静态路由（仅用于提示「插件会先试哪个」）
function staticRoute(m, u) {
  const mm = String(m || "").toLowerCase().trim(), uu = String(u || "").toLowerCase().trim();
  if (/^deepseek-v4/.test(mm)) return { thinking: { type: "disabled" } };
  if (mm.indexOf("deepseek") >= 0) return { thinking: { type: "disabled" } };
  if (mm.indexOf("qwen") >= 0 || uu.indexOf("dashscope") >= 0 || uu.indexOf("microvideo") >= 0) return { enable_thinking: false };
  if (/^kimi/.test(mm)) return { thinking: { type: "disabled" } };
  if (mm.indexOf("hunyuan") >= 0) return { enable_thinking: false };
  if (mm.indexOf("gemini") >= 0) return { thinking: { level: "off" } };
  if (mm.indexOf("glm") >= 0 || uu.indexOf("bigmodel") >= 0 || uu.indexOf("zhipu") >= 0) return { enable_thinking: false };
  if (mm.indexOf("doubao") >= 0 || uu.indexOf("volces") >= 0) return { thinking: { type: "disabled" } };
  if (uu.indexOf("vllm") >= 0 || uu.indexOf("openrouter") >= 0) return { chat_template_kwargs: { enable_thinking: false } };
  return {};
}
const route = staticRoute(model, baseUrl);

const DIALECTS = [
  { label: "静态路由(插件首选)", params: route },
  { label: "enable_thinking", params: { enable_thinking: false } },
  { label: "thinking.disabled", params: { thinking: { type: "disabled" } } },
  { label: "chat_template_kwargs", params: { chat_template_kwargs: { enable_thinking: false } } },
  { label: "reasoning.enabled", params: { reasoning: { enabled: false } } },
  { label: "thinking.low(降级)", params: { thinking: { type: "low" } } },
  { label: "reasoning_effort.low", params: { reasoning_effort: "low" } },
  // v20261111.47：参数被网关白名单拦住时，提示词级软开关是最后一条路（Qwen3 官方支持 /no_think）
  { label: "提示词 /no_think", prompt: "/no_think" },
  { label: "提示词+enable_thinking", prompt: "/no_think", params: { enable_thinking: false } },
  { label: "不带任何参数", params: {} },
];
// 去重（静态路由可能与固定项相同）
const seen = new Set();
const LIST = DIALECTS.filter((d) => {
  const k = JSON.stringify({ p: d.params, m: d.prompt || "" });
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const PROMPT = [
  "你是 Figma 设计稿整理助手。请为下面节点产出语义改名方案，严格输出 JSON：",
  '{"ops":[{"action":"rename","nodeId":"<id>","name":"<新名>"}]}',
  "节点：[{\"id\":\"1:1\",\"t\":\"FRAME\",\"n\":\"Frame 2136\",\"w\":320,\"h\":90,\"path\":\"root\"},{\"id\":\"1:2\",\"t\":\"FRAME\",\"n\":\"Frame 2137\",\"w\":320,\"h\":90,\"path\":\"root\"}]",
  "只输出 JSON，不要解释。",
].join("\n");

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);
console.log("=== 关思考方言诊断 ===");
console.log("target :", target.href);
console.log("model  :", model);
console.log("host   :", HOST);
console.log("stream :", noStream ? "false" : "true（与插件一致）");
console.log("插件会首选的方言:", JSON.stringify(route));
const verdict = mvgoVerdict(model);
console.log("mvgo 判定        :", verdict.closable ? "可关闭" : "关不掉（mvgo 会弃用该模型）", "·", verdict.note);
console.log("");

function request(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "user-agent": "mvgo-figma-structure-diag/1.0",
      accept: noStream ? "application/json" : "text/event-stream",
      authorization: "Bearer " + apiKey,
    };
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
    let status = 0, text = "";
    const onData = (c) => { text += c.toString(); };
    const onEnd = () => {
      const parsed = parseBody(text, status);
      finish({ status, ...parsed, raw: text.slice(0, 400) });
    };
    let req, session = null;
    if (target.protocol === "https:") {
      session = http2.connect(target.origin, { timeout: 120000, family: 4 });
      session.on("error", (e) => { try { session.close(); } catch {} finish({ error: "h2 会话错误: " + e.message }); });
      try {
        req = session.request({ ":method": "POST", ":path": target.pathname + target.search, ...headers });
      } catch (e) { return finish({ error: "h2 建流失败: " + e.message }); }
      req.on("response", (h) => { status = Number(h[":status"]); });
      req.on("data", onData);
      req.on("end", () => { try { session.close(); } catch {} onEnd(); });
      req.on("error", (e) => finish({ error: "h2 流错误: " + e.message }));
    } else {
      req = http.request({
        method: "POST", host: target.hostname, port: target.port,
        path: target.pathname + target.search, headers, family: 4, timeout: 120000,
      });
      req.on("response", (res) => {
        status = res.statusCode;
        res.on("data", onData);
        res.on("end", onEnd);
        res.on("error", (e) => finish({ error: "响应流错误: " + e.message }));
      });
      req.on("error", (e) => finish({ error: e.message }));
    }
    req.setTimeout(120000, () => { try { req.close(); } catch {} finish({ error: "120s 超时（连通但无响应）" }); });
    req.write(body);
    req.end();
  });
}

function parseBody(text, status) {
  // SSE：聚合 delta.content / delta.reasoning_content / finish_reason / usage
  if (/^\s*data:\s*\{/m.test(text)) {
    let content = "", reasoning = "", finish = "", usage = null, errMsg = "";
    for (const block of text.split(/\r?\n\r?\n/)) {
      for (const line of block.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const j = t.slice(5).trim();
        if (!j || j === "[DONE]") continue;
        try {
          const o = JSON.parse(j);
          if (o.error) errMsg = String(o.error.message || o.error);
          if (o.usage) usage = o.usage;
          const ch = o.choices && o.choices[0];
          if (ch && ch.finish_reason) finish = String(ch.finish_reason);
          const d = ch && (ch.delta || ch.message);
          if (d && typeof d.content === "string") content += d.content;
          if (d && typeof d.reasoning_content === "string") reasoning += d.reasoning_content;
        } catch (e) {}
      }
    }
    return { content, reasoning, finish, usage, errMsg };
  }
  try {
    const o = JSON.parse(text);
    const ch = (o.choices && o.choices[0]) || {};
    const m = ch.message || {};
    return {
      content: String(m.content || ""),
      reasoning: String(m.reasoning_content || ""),
      finish: String(ch.finish_reason || ""),
      usage: o.usage || null,
      errMsg: o.error ? String(o.error.message || o.error) : "",
    };
  } catch (e) {
    return { content: "", reasoning: "", finish: "", usage: null, errMsg: "", parseFail: true };
  }
}

function reasoningTokens(usage) {
  if (!usage) return null;
  const d = usage.completion_tokens_details || usage.completion_tokens_detail;
  return d && Number.isFinite(Number(d.reasoning_tokens)) ? Number(d.reasoning_tokens) : null;
}

const BUDGET = Number(process.env.DIAG_MAX_TOKENS || 1200);
const results = [];
for (const d of LIST) {
  const messages = [{ role: "user", content: d.prompt ? PROMPT + "\n" + d.prompt : PROMPT }];
  const payload = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: BUDGET,
    stream: !noStream,
    ...d.params,
  };
  const r = await request(payload);
  const row = { label: d.label, params: Object.assign({}, d.params, d.prompt ? { prompt: d.prompt } : {}), ...r };
  results.push(row);
  if (r.error) { console.log(`  ✗ ${d.label.padEnd(22)} ${r.error}`); continue; }
  const verdict = r.status >= 400
    ? "HTTP " + r.status + (r.errMsg ? " · " + r.errMsg.slice(0, 80) : "")
    : (r.content.trim().length > 0
      ? (r.reasoning.trim().length ? "正文 OK（思考仍开）" : "正文 OK 且无思考 ✔")
      : (r.reasoning.trim().length ? "正文为空 · 思考吃光预算" : "正文为空 · 无思考内容"));
  console.log(`  ${r.status >= 400 || !r.content.trim() ? "✗" : "✓"} ${d.label.padEnd(22)} status=${r.status} 正文=${r.content.trim().length} 思考=${r.reasoning.trim().length} finish=${r.finish || "-"} 思考tokens=${reasoningTokens(r.usage) ?? "-"}  → ${verdict}`);
}

// 第二遍：对「正文非空但思考>0」或「正文空」的方言加预算，判断是不是纯预算问题
const needBump = results.filter((r) => !r.error && r.status < 400 && r.content.trim().length === 0 && r.reasoning.trim().length > 0);
if (needBump.length && !noStream) {
  console.log("\n=== 第二轮：加预算（max_tokens=" + BUDGET * 3 + "）验证是否只是预算问题 ===");
  for (const r of needBump.slice(0, 3)) {
    const payload = {
      model, messages: [{ role: "user", content: PROMPT }], temperature: 0.2,
      max_tokens: BUDGET * 3, stream: true, ...r.params,
    };
    const r2 = await request(payload);
    const ok = !r2.error && r2.status < 400 && r2.content.trim().length > 0;
    console.log(`  ${ok ? "✓" : "✗"} ${r.label.padEnd(22)} 正文=${r2.error ? "-" : r2.content.trim().length} 思考=${r2.error ? "-" : r2.reasoning.trim().length} finish=${r2.finish || "-"} → ${ok ? "加预算即可拿到正文" : (r2.error || "仍然为空")}`);
  }
}

console.log("\n=== 结论建议 ===");
if (!verdict.closable) console.log("⚠ mvgo 对 " + model + " 这类推理模型的做法是【不用它】：无法关闭思考、会烧光输出预算。建议在插件的「整理模型」里填非推理模型。");
const best = results.find((r) => !r.error && r.status < 400 && r.content.trim().length > 0 && r.reasoning.trim().length === 0);
const anyContent = results.find((r) => !r.error && r.status < 400 && r.content.trim().length > 0);
const alwaysThink = results.some((r) => !r.error && r.status >= 400 && /始终思考|不支持关闭思考|always\s*think|请使用\s*low/i.test(r.errMsg || ""));
if (best) {
  console.log("✔ 可用方言（真正关掉思考）:", best.label, JSON.stringify(best.params));
  if (best.params && best.params.prompt) console.log("  该结论来自提示词软开关：插件已内置（候选里排在参数级之后），无需额外配置。");
  console.log("  → 建议在插件 thinkingOffRoute 里把该模型/网关路由到这个方言。");
} else if (anyContent) {
  console.log("⚠ 没有任何方言能真正关掉思考，但以下方言在默认预算下仍能拿到正文:", anyContent.label, JSON.stringify(anyContent.params));
  console.log("  → 插件已内置「加预算重试」；若第二轮显示加预算后正文非空，说明根因是预算而非方言。");
} else if (alwaysThink) {
  console.log("✗ 上游明确表示该模型始终思考，关不掉；插件会自动降级到 thinking.low / reasoning_effort=low。");
  console.log("  若仍然拿不到正文，唯一可靠做法是取消勾选「关闭思考模式」并把 max_tokens 调大。");
} else {
  console.log("✗ 所有方言都没拿到正文 —— 请检查模型名是否正确、Key 是否有该模型权限。");
}
