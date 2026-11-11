#!/usr/bin/env node
/**
 * figma-auto-organize.mjs —— Figma 整理双模式工具（无词典/无映射，语义命名由模型实时分析）
 *
 * 模式 1 扫描（供模型分析）:
 *   node figma-auto-organize.mjs [channel|auto] scan <rootNodeId>
 *     → 输出 /tmp/figma-scan-report-<ts>.json：
 *       { tree: 前3层结构缩略, pending: [待命名节点(id/类型/尺寸/坐标/路径/子树文本/图片填充)], stats }
 *
 * 模式 2 执行（模型生成的 ops 清单）:
 *   node figma-auto-organize.mjs [channel|auto] apply <ops.json>
 *     → 调 figma-batch 执行并汇总结果
 *
 * 工作流: 模型连 MCP → scan → 模型实时分析结构/文本/签名生成 ops（cp-/bg-/img-/icon-/header-/chart- 等）→ apply → 报告
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const [, , channelArg, mode, arg] = process.argv;
if (!mode || !arg) {
  console.error("Usage:\n  node figma-auto-organize.mjs [channel|auto] scan <rootNodeId>\n  node figma-auto-organize.mjs [channel|auto] apply <ops.json>");
  process.exit(2);
}

const cli = (cmd, paramsJson, out) =>
  execFileSync("node", [path.join(DIR, "figma-cli.mjs"), channelArg || "auto", cmd, paramsJson],
    { stdio: ["ignore", out ? fs.openSync(out, "w") : "pipe", "inherit"] });

if (mode === "scan") {
  const outFile = `/tmp/figma-auto-tree-${Date.now()}.json`;
  cli("scan_tree", JSON.stringify({ nodeId: arg }), outFile);
  const tree = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const nodes = tree.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const n of nodes) { if (!n.p) continue; if (!children.has(n.p)) children.set(n.p, []); children.get(n.p).push(n); }
  const isDefault = (n) => /^(Frame|Group|Ellipse|Rectangle|Line|Vector)( \d+)?$/i.test(n.n);
  const pathOf = (id) => {
    const segs = []; let cur = byId.get(id);
    while (cur) { segs.unshift(cur.n.length > 14 ? cur.n.slice(0, 14) : cur.n); cur = cur.p ? byId.get(cur.p) : null; }
    return segs.join("/");
  };
  const textsOf = (id, acc = [], d = 0) => {
    if (d > 5) return acc;
    for (const k of children.get(id) || []) { if (k.c) acc.push(k.c.slice(0, 16)); textsOf(k.id, acc, d + 1); }
    return acc;
  };

  // 前 3 层结构缩略（含已命名节点，模型据此理解文件分区）
  const treeBrief = [];
  const brief = (id, d, max) => {
    for (const k of children.get(id) || []) {
      treeBrief.push({ d, id: k.id, name: k.n, type: k.t, w: Math.round(k.w), h: Math.round(k.h) });
      if (d < max) brief(k.id, d + 1, max);
    }
  };
  brief(arg, 0, 2);

  // 待命名节点（默认名，非文本）
  const pending = nodes.filter((n) => !["TEXT", "PAGE", "DOCUMENT"].includes(n.t) && isDefault(n))
    .map((n) => ({
      id: n.id, type: n.t, name: n.n,
      w: Math.round(n.w * 10) / 10, h: Math.round(n.h * 10) / 10, x: n.x, y: n.y,
      path: pathOf(n.p),
      texts: textsOf(n.id).slice(0, 6),
      imageFill: n.f && String(n.f).includes("IMAGE") ? true : undefined,
      fill: n.f || undefined,
      childTypes: (children.get(n.id) || []).map((k) => k.t).join(",") || undefined,
    }));

  const report = {
    scannedAt: new Date().toISOString(), rootId: arg, totalNodes: nodes.length,
    named: nodes.filter((n) => /^(cp-|bg-|img-|icon-|header-|chart-|tooltip-|@echarts\/)/.test(n.n)).length,
    treeBrief, pending,
  };
  const reportFile = `/tmp/figma-scan-report-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  console.log(`扫描完成: ${nodes.length} 节点 | 已规范命名 ${report.named} | 待命名 ${pending.length}`);
  console.log(`结构缩略 ${treeBrief.length} 行 | 报告: ${reportFile}`);
  process.exit(0);
}

if (mode === "apply") {
  const out = execFileSync("node", [path.join(DIR, "figma-batch.mjs"), channelArg || "auto", arg],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/BATCH_DONE ok=(\d+) fail=(\d+)/);
  console.log(out.split("\n").filter((l) => l.startsWith("✗")).slice(0, 10).join("\n"));
  console.log(m ? `执行完成: 成功 ${m[1]} / 失败 ${m[2]}` : out.slice(-500));
  process.exit(m && Number(m[2]) === 0 ? 0 : 1);
}

console.error(`未知模式: ${mode}（可用: scan | apply）`);
process.exit(2);
