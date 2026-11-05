"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOpenApi = buildOpenApi;
exports.freezeRequirements = freezeRequirements;
const crypto = __importStar(require("node:crypto"));
const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const q = (v) => JSON.stringify(String(v ?? ''));
function indentLines(text, n) {
    const pad = ' '.repeat(n);
    return String(text ?? '')
        .split('\n')
        .map((l) => (l.length ? pad + l : pad.trimEnd()))
        .join('\n');
}
function toOperationId(verb, p, used) {
    const segs = String(p ?? '')
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter(Boolean)
        .map((s) => s.replace(/[{}:]/g, ''))
        .map((s) => s.replace(/[^A-Za-z0-9]+/g, ' ').trim())
        .filter(Boolean);
    const camel = segs
        .map((s, i) => i === 0
        ? s.charAt(0).toLowerCase() + s.slice(1)
        : s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
    let base = (camel || 'root') + '_' + verb;
    let id = base;
    let n = 2;
    while (used.has(id))
        id = base + '_' + n++;
    used.add(id);
    return id;
}
function buildOpenApi(input) {
    const eps = Array.isArray(input.endpoints) ? input.endpoints : [];
    const prefix = input.declaredPrefix || '';
    const envelope = input.envelope || {};
    const envKeys = Array.isArray(envelope.keys) ? envelope.keys.slice() : [];
    const envSource = String(envelope.source ?? 'unknown');
    const envConfirmed = envelope.confirmed === true;
    const used = new Set();
    const byConfidence = {};
    let verbDeclared = 0;
    let verbDefaulted = 0;
    let skipped = 0;
    const L = [];
    const push = (s = '') => L.push(s);
    push('openapi: 3.0.3');
    push('info:');
    push('  title: ' + q(basenameOf(input.projectRoot) + ' · 本地契约（S2 冻结）'));
    push('  version: ' + q('0.1.0-freeze'));
    push('  description: |');
    push(indentLines([
        '由工坊 S2「契约冻结」从 S0 扫描事实确定性生成，输入不变量则输出不变。',
        '',
        '真值边界：',
        '  · 本文件是端点字段级真值所在；REQUIREMENTS.md 只是它的第 1 种视图。',
        '  · 每条 operation 都带 x-mvgo-confidence / x-mvgo-sources / x-mvgo-evidence，',
        '    置信度不足的条目不得在后端直接开工，必须先经人裁决。',
        '  · verb=ANY 的条目在 OAS 中按 GET 占位并标 x-mvgo-verb-inferred: true，',
        '    这是「格式要求方法、事实未声明」的妥协，不构成方法结论。',
        '',
        '未决项：' + (input.pendingConflictIds?.length ?? 0) + ' 条冲突 / '
            + (input.blockerGapIds?.length ?? 0) + ' 条 blocker 缺口，明细见 conflicts.md。',
    ].join('\n'), 4));
    push('servers:');
    push('  - url: ' + q(prefix || '/'));
    push('    description: ' + q(prefix ? '由扫描器从各源声明取交集得到的前缀' : '扫描器未识别到统一前缀'));
    push('tags:');
    push('  - name: ' + q('prototype'));
    push('    description: ' + q('端点来源之一：原型 HTML/JS 字面量（候选锚点）'));
    push('  - name: ' + q('doc'));
    push('    description: ' + q('端点来源之一：需求文档正文'));
    push('  - name: ' + q('frontend'));
    push('    description: ' + q('端点来源之一：前端 api 封装'));
    push('  - name: ' + q('backend'));
    push('    description: ' + q('端点来源之一：后端 controller'));
    push('paths:');
    if (!eps.length) {
        push('  {}');
    }
    for (const ep of eps) {
        const p = String(ep?.path ?? '').trim();
        if (!p) {
            skipped++;
            continue;
        }
        const rawVerb = String(ep?.verb ?? '').trim().toLowerCase();
        const declared = HTTP_VERBS.includes(rawVerb);
        const verb = declared ? rawVerb : 'get';
        if (declared)
            verbDeclared++;
        else
            verbDefaulted++;
        const conf = String(ep?.confidence ?? 'unknown');
        byConfidence[conf] = (byConfidence[conf] ?? 0) + 1;
        const sources = Array.isArray(ep?.sources) ? ep.sources.map(String) : [];
        const flags = Array.isArray(ep?.flags) ? ep.flags.map(String) : [];
        push('  ' + q(p) + ':');
        push('    ' + verb + ':');
        push('      operationId: ' + q(toOperationId(verb, p, used)));
        push('      summary: ' + q(p));
        push('      tags:');
        const tagList = sources.length ? sources : ['unknown'];
        for (const t of tagList)
            push('        - ' + q(t));
        push('      x-mvgo-confidence: ' + q(conf));
        push('      x-mvgo-sources: [' + sources.map(q).join(', ') + ']');
        push('      x-mvgo-verb-declared: ' + q(rawVerb || 'none'));
        if (!declared)
            push('      x-mvgo-verb-inferred: true');
        if (flags.length) {
            push('      x-mvgo-flags:');
            for (const f of flags)
                push('        - ' + q(f));
        }
        const ev = ep?.evidence && typeof ep.evidence === 'object' ? ep.evidence : {};
        const evKeys = Object.keys(ev);
        if (evKeys.length) {
            push('      x-mvgo-evidence:');
            for (const k of evKeys) {
                const arr = Array.isArray(ev[k]) ? ev[k] : [];
                if (!arr.length)
                    continue;
                push('        ' + q(k) + ':');
                for (const e of arr.slice(0, 3)) {
                    push('          - file: ' + q(e?.file ?? ''));
                    push('            line: ' + String(Number(e?.line) || 0));
                    push('            raw: ' + q(e?.raw ?? ''));
                }
                if (arr.length > 3)
                    push('        ' + q(k + 'Truncated') + ': ' + String(arr.length - 3));
            }
        }
        push('      responses:');
        push('        ' + q('200') + ':');
        push('          description: ' + q('本地契约占位：S3 mock 阶段按本 schema 生成响应'));
        push('          content:');
        push('            application/json:');
        push('              schema:');
        push('                $ref: ' + q('#/components/schemas/ApiResponse'));
        if (!declared) {
            push('          x-mvgo-verb-note: ' + q('方法未在任何来源声明，按 GET 占位。裁决后再改。'));
        }
        push('        ' + q('default') + ':');
        push('          description: ' + q('同上信封'));
    }
    push('components:');
    push('  schemas:');
    push('    ApiResponse:');
    push('      type: object');
    push('      description: ' + q('全局响应信封，字段集来自 ' + envSource + (envConfirmed ? '（已证实）' : '（未证实，待追认）')));
    push('      x-mvgo-envelope-source: ' + q(envSource));
    push('      x-mvgo-envelope-confirmed: ' + String(envConfirmed));
    push('      properties:');
    if (envKeys.length) {
        for (const k of envKeys) {
            push('        ' + q(k) + ':');
            push('          description: ' + q('字段语义由 S2 requirements-writer 回填'));
        }
    }
    else {
        push('        ' + q('(unknown)') + ': {}');
    }
    push('      required: []');
    push('x-mvgo-freeze:');
    push('  runId: ' + q(input.runId));
    push('  frozenAt: ' + q(input.frozenAt));
    push('  projectRoot: ' + q(input.projectRoot));
    push('  generator: ' + q('s2-contract-freezer.ts'));
    push('  endpointTotal: ' + String(eps.length));
    push('  verbDeclared: ' + String(verbDeclared));
    push('  verbDefaulted: ' + String(verbDefaulted));
    push('  byConfidence:');
    for (const k of Object.keys(byConfidence))
        push('    ' + q(k) + ': ' + String(byConfidence[k]));
    push('  pendingConflictIds: [' + (input.pendingConflictIds ?? []).map(q).join(', ') + ']');
    push('  blockerGapIds: [' + (input.blockerGapIds ?? []).map(q).join(', ') + ']');
    push('x-mvgo-decisions:');
    const decs = input.decisions ?? [];
    if (!decs.length) {
        push('  []');
    }
    else {
        for (const d of decs) {
            push('  - conflictId: ' + q(d.conflictId));
            push('    choice: ' + q(d.choice));
            if (d.decidedAt)
                push('    decidedAt: ' + q(d.decidedAt));
            if (d.note)
                push('    note: ' + q(d.note));
        }
    }
    const yaml = L.join('\n') + '\n';
    const sha256 = crypto.createHash('sha256').update(yaml, 'utf8').digest('hex');
    return {
        yaml,
        stats: {
            pathCount: new Set(eps.map((e) => String(e?.path ?? '')).filter(Boolean)).size,
            operationCount: eps.length - skipped,
            verbDeclared,
            verbDefaulted,
            skipped,
            byConfidence,
            decisionIds: decs.map((d) => d.conflictId),
            pendingConflictIds: input.pendingConflictIds ?? [],
            envelopeSource: envSource,
            envelopeConfirmed: envConfirmed,
            sha256,
            bytes: Buffer.byteLength(yaml, 'utf8'),
        },
    };
}
function basenameOf(p) {
    const parts = String(p ?? '').split(/[\\/]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'project';
}
function freezeRequirements(input) {
    const draft = String(input.draft ?? '');
    const lines = draft.split('\n');
    const banner = [
        '',
        '> 🔒 **已由 S2 冻结**（' + input.frozenAt + '）｜runId `' + input.runId + '`',
        '> 契约真值：`spec/openapi.local.yaml`（' + input.openapiStats.pathCount
            + ' 个 path / ' + input.openapiStats.operationCount + ' 个 operation）',
        '> 冻结 ≠ 定稿：**已裁决 ' + input.decisions.length + ' 条 / 未决 '
            + input.pendingConflicts.length + ' 条冲突 / ' + input.blockerGaps.length
            + ' 条 blocker 缺口**。裁决写入 `spec/decisions.md` 后重跑 S2 才会反映到本文与契约。',
        '',
    ];
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
        if (/^#\s+/.test(lines[i])) {
            insertAt = i + 1;
            break;
        }
    }
    const head = lines.slice(0, insertAt);
    const rest = lines.slice(insertAt);
    const Z = [];
    Z.push('');
    Z.push('---');
    Z.push('');
    Z.push('## 附录 Z　冻结校验（S2 自动生成 · 每次重跑整篇覆盖）');
    Z.push('');
    Z.push('> 本附录只写**校验结论与指针**，不复制上文任何字段值（复制即制造第二个真值）。');
    Z.push('');
    Z.push('### Z.1 契约冻结统计');
    Z.push('');
    Z.push('| 项 | 值 | 判据 |');
    Z.push('|---|---|---|');
    Z.push('| path 数 | ' + input.openapiStats.pathCount + ' | 与 `spec/endpoints.json` 去重后唯一点端点数相等 |');
    Z.push('| operation 数 | ' + input.openapiStats.operationCount + ' | 等于 `endpoints[]` 长度（无跳过） |');
    Z.push('| 方法已声明 | ' + input.openapiStats.verbDeclared + ' | `verb` 属于 HTTP 方法集合 |');
    Z.push('| 方法未声明（按 GET 占位） | ' + input.openapiStats.verbDefaulted
        + ' | `verb=ANY` ⇒ 契约内标 `x-mvgo-verb-inferred: true`，**不构成方法结论** |');
    const confKeys = Object.keys(input.openapiStats.byConfidence);
    Z.push('| 置信度分布 | ' + (confKeys.length
        ? confKeys.map((k) => k + '=' + input.openapiStats.byConfidence[k]).join(' / ')
        : '—') + ' | 直接来自 `endpoints.json.byConfidence` |');
    Z.push('| 信封口径 | ' + input.openapiStats.envelopeSource
        + (input.openapiStats.envelopeConfirmed ? '（已证实）' : '（**未证实，待追认**）')
        + ' | 未证实 ⇒ 后端不得按该字段集开工 |');
    Z.push('');
    Z.push('### Z.2 已裁决交叉引用');
    Z.push('');
    if (input.decisions.length) {
        Z.push('> 唯一真值是 `spec/decisions.md`（人写，扫描器与冻结器都不覆盖）。下表只是索引。');
        Z.push('');
        Z.push('| 冲突 id | 选择 | 时间 |');
        Z.push('|---|---|---|');
        for (const d of input.decisions) {
            Z.push('| `' + d.conflictId + '` | ' + String(d.choice).replace(/\|/g, '\\|')
                + ' | ' + (d.decidedAt || '—') + ' |');
        }
    }
    else {
        Z.push('> 🔴 **尚无任何裁决**。`spec/decisions.md` 不存在或为空 ⇒ 本文所有冲突项均未消解。');
    }
    Z.push('');
    Z.push('### Z.3 未决清单（阻塞 S3 开工）');
    Z.push('');
    if (!input.pendingConflicts.length && !input.blockerGaps.length) {
        Z.push('> ✅ 无未决冲突、无 blocker 缺口。');
    }
    else {
        for (const g of input.blockerGaps) {
            Z.push('- 🔴 **`' + g.id + '`**（blocker）' + g.title);
        }
        for (const c of input.pendingConflicts) {
            Z.push('- 🟡 `' + c.id + '` ' + c.title);
        }
    }
    Z.push('');
    Z.push('### Z.4 输入制品指纹（sha256 前 16 位）');
    Z.push('');
    Z.push('| 制品 | 指纹 |');
    Z.push('|---|---|');
    for (const k of Object.keys(input.artifactDigests).sort()) {
        Z.push('| `' + k + '` | `' + input.artifactDigests[k] + '` |');
    }
    Z.push('');
    Z.push('> 指纹只覆盖 S0 扫描产物与契约；`decisions.md` 是人写输入，不纳入指纹（纳入则每次裁决都会让指纹失配，无法区分「扫描变了」与「人改了」）。');
    Z.push('');
    return [...head, ...banner, ...rest, ...Z].join('\n');
}
//# sourceMappingURL=s2-contract-freezer.js.map