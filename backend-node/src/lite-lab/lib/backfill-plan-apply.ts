/**
 * 回填计划执行器（plan → 落盘编辑）
 *
 * 定位：`backfill-plan.ts` 出计划，本模块**只执行计划**，不自行判定落点。
 * 这样「计划」与「执行」共用一套 entry，产物改动可逐条回溯到计划条目；
 * 旧通道（mountBgByE2n 等）退化为**校验**（在未改动的基线上跑一遍，与计划对账）。
 *
 * 当前执行范围（2026-11-05）：
 *   · bg-image      —— 容器级底图：插入 / 换图 / 清理残留图层 / 渐变与纯色整条替换
 *   · fill-color    —— 容器 SOLID fill：换背景色
 * 不在本模块执行：
 *   · inline-image  —— 元素级 <img> 由 mountAssetIcons 负责（要改模板，不是改样式）
 *   · text-truth    —— 需按 seed 元素级写 style，单独一步（现有 C 通道走文本锚定）
 *
 * 🔴 偏移来源：target.key = `${file}::${ruleBodyStart}`（样式改动），执行时**重解析**规则体
 *   得到待替换片段，不缓存 plan 里的 before 字符串做字符串查找（同值多条会串行误替换）。
 */
import { collectStyleRulesFromContent } from './truth-matcher';
import { readBgDecl } from './e2n-map';
import type { BackfillPlan, PlanKind } from './backfill-plan';

export interface PlanApplyEdit {
  path: string;
  pos: number;
  end: number;
  text: string;
  desc: string;
}

export interface PlanApplyStats {
  /** 参与执行的条目数 */
  entries: number;
  /** 实际产生编辑的条目数 */
  appliedEntries: number;
  /** 被改的规则投影数（一条 entry 常命中 5 处投影） */
  ruleEdits: number;
  bgInserted: number;
  bgReplacedGradient: number;
  bgReplacedColor: number;
  bgReplacedUrl: number;
  /** 半透明资源叠图（保留底色）次数 */
  bgLayered: number;
  fillApplied: number;
  /** 元素级内联 style 写入次数（文本真值：颜色/字号） */
  textApplied: number;
  /** 计划里 decision=apply 但执行的 action=noop（幂等） */
  noop: number;
  /** 目标规则找不到（内容已变 / 计划过期） */
  stale: number;
}

export interface PlanApplyResult {
  files: Array<{ path: string; changed: boolean; content: string; edits: PlanApplyEdit[] }>;
  stats: PlanApplyStats;
  /** 已消费的资源（下游 AI 兜底必须跳过，否则同一 bg 会被插两条 url） */
  consumedAssets: Array<{ fileName: string; figmaId: string; cls: string; action: string }>;
}

const BG_TAIL = 'center / 100% 100% no-repeat';

/** 规则的「现状值」口径（必须与 backfill-plan 里记录 target.before 的算法逐字一致）：
 *  background → 值本身；background-color → 整条声明；无声明 → 固定文案。
 *  用途：执行前校验「这个 bodyStart 上的规则仍是计划看到的那条」——
 *  🔴 内容一变长，bodyStart 会指向别的规则；没有这道校验，同一计划重跑会改错规则。 */
function beforeOfDecl(d: ReturnType<typeof readBgDecl>): string {
  if (d.kind === 'background') return d.value.trim();
  if (d.kind === 'background-color') return d.match.trim();
  return '(无背景声明)';
}

/**
 * 内联 style 合并：`incoming` 按属性名覆盖 `existing`，其余原样保留（保序）。
 * 🔴 不能整体替换：产物里 style 常带 width/height 等布局真值（红线段），整替换会连布局一起冲掉。
 */
export function mergeStyle(existing: string, incoming: string): string {
  const parse = (s: string) =>
    s
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf(':');
        return i < 0 ? { k: x, v: '' } : { k: x.slice(0, i).trim(), v: x.slice(i + 1).trim() };
      })
      .filter((d) => d.k);
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const d of [...parse(existing), ...parse(incoming)]) {
    if (!map.has(d.k)) order.push(d.k);
    map.set(d.k, d.v);
  }
  return order.map((k) => `${k}:${map.get(k)}`).join(';');
}

export function applyBackfillPlan(
  files: Array<{ path: string; content: string }>,
  plan: BackfillPlan,
  opts: { kinds?: PlanKind[] } = {},
): PlanApplyResult {
  const kinds = new Set<PlanKind>(opts.kinds ?? ['bg-image', 'fill-color', 'text-truth']);
  const stats: PlanApplyStats = {
    entries: 0,
    appliedEntries: 0,
    ruleEdits: 0,
    bgInserted: 0,
    bgReplacedGradient: 0,
    bgReplacedColor: 0,
    bgReplacedUrl: 0,
    bgLayered: 0,
    fillApplied: 0,
    textApplied: 0,
    noop: 0,
    stale: 0,
  };
  const contentByPath = new Map(files.map((f) => [f.path, f.content]));
  const rulesByPath = new Map<string, ReturnType<typeof collectStyleRulesFromContent>>();
  const ruleAt = (path: string, bodyStart: number) => {
    let list = rulesByPath.get(path);
    if (!list) {
      const c = contentByPath.get(path);
      if (c == null) return undefined;
      list = collectStyleRulesFromContent(c);
      rulesByPath.set(path, list);
    }
    return list.find((r) => r.bodyStart === bodyStart);
  };

  const edits: PlanApplyEdit[] = [];
  const consumedRules = new Set<string>();
  const consumedAssets: PlanApplyResult['consumedAssets'] = [];

  for (const entry of plan.entries) {
    if (entry.decision !== 'apply') continue;
    if (!kinds.has(entry.kind)) continue;
    stats.entries += 1;
    let touched = false;

    for (const t of entry.targets) {
      if (t.action === 'noop' || t.satisfied) {
        // 幂等：计划说已经是目标态（或本投影已满足）→ 不写
        if (t.action === 'noop') stats.noop += 1;
        continue;
      }
      // ── 文本真值：元素级内联 style（键空间 `${file}#${start}`，与样式类改动的 `file::bodyStart` 不同）
      if (entry.kind === 'text-truth') {
        const hashAt = t.key.lastIndexOf('#');
        const textPath = hashAt > 0 ? t.key.slice(0, hashAt) : '';
        const start = Number(t.key.slice(hashAt + 1));
        const content = contentByPath.get(textPath);
        const tag = String(entry.prod?.tag ?? '');
        if (!textPath || content == null || !Number.isFinite(start)) {
          stats.stale += 1;
          continue;
        }
        // 位置漂移保护：该偏移上必须仍是同一个标签
        if (tag && !content.startsWith(`<${tag}`, start)) {
          stats.stale += 1;
          continue;
        }
        const gt = content.indexOf('>', start);
        const decls = String(t.after ?? '').trim();
        if (gt < 0 || !decls) {
          stats.stale += 1;
          continue;
        }
        const openTag = content.slice(start, gt + 1);
        const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
        if (styleM) {
          const merged = mergeStyle(styleM[1], decls);
          if (merged === styleM[1]) continue; // 无变化 → 不产生编辑（保证重复执行幂等）
          const ins = start + styleM.index + styleM[0].length - 1 - styleM[1].length;
          edits.push({
            path: textPath,
            pos: ins,
            end: ins + styleM[1].length,
            text: merged,
            desc: `planText:${entry.id}→<${tag}>.${(entry.prod?.classes ?? []).join('.')}(merge)`,
          });
        } else {
          // 插在 `>` 前；自闭合 `<img ... />` 要插在 `/` 前
          const insertAt = openTag.endsWith('/>') ? gt - 1 : gt;
          edits.push({
            path: textPath,
            pos: insertAt,
            end: insertAt,
            // 🔴 走同一个 mergeStyle 归一（否则「新建」与「合并」产出不同的分隔符写法，
            //   第二次执行会认为有变化 → 永远不幂等）
            text: ` style="${mergeStyle('', decls)}"`,
            desc: `planText:${entry.id}→<${tag}>.${(entry.prod?.classes ?? []).join('.')}(new-style)`,
          });
        }
        touched = true;
        stats.ruleEdits += 1;
        stats.textApplied += 1;
        continue;
      }
      const sepAt = t.key.indexOf('::');
      if (sepAt < 0) {
        stats.stale += 1;
        continue;
      }
      const path = t.key.slice(0, sepAt);
      const bodyStart = Number(t.key.slice(sepAt + 2));
      const content = contentByPath.get(path);
      if (content == null || !Number.isFinite(bodyStart)) {
        stats.stale += 1;
        continue;
      }
      const rule = ruleAt(path, bodyStart);
      if (!rule) {
        stats.stale += 1;
        continue;
      }
      const dedupeKey = `${path}::${rule.bodyStart}`;
      if (consumedRules.has(dedupeKey)) continue;

      const body = content.slice(rule.bodyStart, rule.bodyEnd);
      const d = readBgDecl(body);
      // 🔴 偏移校验：计划是用某一版内容建的，执行时该 bodyStart 上的规则可能已不是同一条
      //   （内容长度变化 ⇒ 指针漂移）。现状值对不上就当计划过期，宁可不改。
      if (t.before != null && beforeOfDecl(d) !== t.before) {
        stats.stale += 1;
        continue;
      }

      if (entry.kind === 'bg-image') {
        const fileName = String((entry.payload?.fileName as string) ?? '') || inferFileName(entry);
        const after = t.after ?? (fileName ? `url('${fileName}') ${BG_TAIL}` : '');
        if (!after) {
          stats.stale += 1;
          continue;
        }
        if (d.kind === 'background') {
          const isGrad = d.isGradient;
          const hadUrl = d.hasUrl;
          edits.push({
            path,
            pos: rule.bodyStart + d.index,
            end: rule.bodyStart + d.end,
            text: after,
            desc: `planBg:${entry.id}→${t.cls ?? t.selector}(${t.action}${hadUrl ? '/cleanup' : ''})`,
          });
          if (t.action === 'layer-url') stats.bgLayered += 1;
          else if (hadUrl) stats.bgReplacedUrl += 1;
          else if (isGrad) stats.bgReplacedGradient += 1;
          else stats.bgReplacedColor += 1;
        } else if (d.kind === 'background-color') {
          edits.push({
            path,
            pos: rule.bodyStart + d.index,
            end: rule.bodyStart + d.end,
            text: `background: ${after}`,
            desc: `planBg:${entry.id}→${t.cls ?? t.selector}(${t.action === 'layer-url' ? 'layer-url' : 'replace-bg-color'})`,
          });
          if (t.action === 'layer-url') stats.bgLayered += 1;
          else stats.bgReplacedColor += 1;
        } else {
          const pad = body.endsWith('\n') ? '' : '\n  ';
          edits.push({
            path,
            pos: rule.bodyStart + body.length,
            end: rule.bodyStart + body.length,
            text: `${pad}background: ${after};\n`,
            desc: `planBg:${entry.id}→${t.cls ?? t.selector}(insert)`,
          });
          stats.bgInserted += 1;
        }
        touched = true;
        stats.ruleEdits += 1;
        consumedRules.add(dedupeKey);
        if (fileName) {
          consumedAssets.push({
            fileName,
            figmaId: entry.figma.nodeId,
            cls: t.cls ?? t.selector ?? '',
            action: t.action,
          });
        }
      } else if (entry.kind === 'fill-color') {
        const color = String((entry.payload?.color as string) ?? '') || String(t.after ?? '');
        if (!color) {
          stats.stale += 1;
          continue;
        }
        if (d.kind === 'background' && d.hasUrl) {
          // 图上不能塞颜色（background 简写只有一个值，塞进去会把 url 整条吃掉）→ 放弃这一处
          stats.stale += 1;
          continue;
        }
        if (d.kind === 'background') {
          edits.push({
            path,
            pos: rule.bodyStart + d.index,
            end: rule.bodyStart + d.end,
            text: color,
            desc: `planFill:${entry.id}→${t.cls ?? t.selector}(replace-color)`,
          });
        } else if (d.kind === 'background-color') {
          const valueStart = rule.bodyStart + d.index + d.match.length - d.value.length;
          edits.push({
            path,
            pos: valueStart,
            end: rule.bodyStart + d.end,
            text: color,
            desc: `planFill:${entry.id}→${t.cls ?? t.selector}(replace-bg-color)`,
          });
        } else {
          const pad = body.endsWith('\n') ? '' : '\n  ';
          edits.push({
            path,
            pos: rule.bodyStart + body.length,
            end: rule.bodyStart + body.length,
            text: `${pad}background: ${color};\n`,
            desc: `planFill:${entry.id}→${t.cls ?? t.selector}(insert)`,
          });
        }
        touched = true;
        stats.ruleEdits += 1;
        stats.fillApplied += 1;
        consumedRules.add(dedupeKey);
      }
    }
    if (touched) stats.appliedEntries += 1;
  }

  const out = files.map((f) => {
    const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
    let content = f.content;
    for (const e of mine) content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    return { path: f.path, changed: mine.length > 0, content, edits: mine };
  });
  return { files: out, stats, consumedAssets };
}

/** 从计划 entry 里取回资源文件名（payload 没带时从 after 的 url() 反解） */function inferFileName(entry: { targets: Array<{ after?: string }> }): string {
  for (const t of entry.targets) {
    const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(t.after ?? '');
    if (m) return m[1].split('/').pop() ?? '';
  }
  return '';
}

// ───────────────────────── 计划 vs 旧通道 对账 ─────────────────────────

export interface PlanReconcileReport {
  /** 计划要做、旧通道没做（旧通道的能力缺口） */
  planOnly: string[];
  /** 旧通道做了、计划没规划（旧通道在猜落点，或计划漏判） */
  legacyOnly: string[];
  /** 双方一致 */
  both: string[];
  agree: boolean;
}

/**
 * 对账口径：资产文件名 → 落点类名。
 * 旧通道只报「锚定成功的资产」，计划报「decision=apply 且 action≠noop 的 bg 条目」。
 * 🔴 只比 bg：fill/文本两类旧通道本来就没有等价输出，混进来会永远不等。
 */
export function reconcileBgPlan(
  plan: BackfillPlan,
  legacyAnchored: Array<{ fileName: string; cls: string }>,
): PlanReconcileReport {
  const keyOf = (fileName: string, cls: string) => `${fileName}→${cls.replace(/^\./, '')}`;
  const planKeys = new Set<string>();
  for (const e of plan.entries) {
    if (e.kind !== 'bg-image' || e.decision !== 'apply') continue;
    const fileName = String((e.payload?.fileName as string) ?? '') || inferFileName(e);
    if (!fileName) continue;
    const cls = e.targets.find((t) => t.action !== 'noop')?.cls ?? e.targets[0]?.cls ?? '';
    if (!cls) continue;
    planKeys.add(keyOf(fileName, cls));
  }
  const legacyKeys = new Set(legacyAnchored.map((a) => keyOf(a.fileName, a.cls)));
  const planOnly = [...planKeys].filter((k) => !legacyKeys.has(k));
  const legacyOnly = [...legacyKeys].filter((k) => !planKeys.has(k));
  const both = [...planKeys].filter((k) => legacyKeys.has(k));
  return { planOnly, legacyOnly, both, agree: planOnly.length === 0 && legacyOnly.length === 0 };
}
