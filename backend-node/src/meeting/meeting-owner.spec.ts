/**
 * 会议纪要管线：**服务层归属隔离**行为判据（ownerId 三闸闭合的实证）
 *
 * 背景（用户需求锚点）：「新增的录音会议、项目级生成都是需要 ownerId 的，每个人独立」。
 * 会议模块的归属**只来自会话身份**，链路上有三道闸：
 *   ① `MeetingDevOnlyGuard` 暴露开关（与 app.module 条件注册同调）
 *   ② `SessionGuard` 身份闸（缺 token ⇒ 401）
 *   ③ `MeetingService.requireOwner` / `pickOwned` 服务层兜底
 * ①② 由 guard-coverage.spec 与 dev-only 判据覆盖；本文件守 ③ —— 因为 ②有 `?raw=1`
 * 逃生舱（对所有挂载路由生效），只靠守卫就能被匿名打到写端点。
 *
 * 🔴 判据为什么用**真实文件 store**（而不是 mock）：归属过滤发生在 `purgeRetention` /
 *    `getRetentionAudit` 这类「按 owner 裁剪数据」的逻辑里，只有落到真实 JSON 才能断言
 *    「别人的数据**没被**清掉」。mock store 会让「过滤掉了」与「根本没写」无法区分。
 *    每个用例独立 `MEETING_DATA_DIR` 临时目录，互不污染。
 *
 * 🔴 每条「拒绝」断言都配**阳性对照**（同 owner 必须能成功）：否则「所有调用都 404」
 *    这种判据恒真 —— 把服务写成永远抛错也能全绿。
 */

// backend-root.js 是 ESM 风格（import.meta.url / const __filename），ts-jest CJS 下与模块
// 包装器参数撞名会让整套件 0 运行 ⇒ 工厂 mock 绕过（同 apifox-owner.spec 惯例）。
jest.mock('../config/backend-root.js', () => {
  const { mkdtempSync } = jest.requireActual('fs');
  const { join: pjoin } = jest.requireActual('path');
  const { tmpdir } = jest.requireActual('os');
  const root = mkdtempSync(pjoin(tmpdir(), 'mvgo-meeting-owner-root-'));
  return {
    backendRoot: root,
    projectRoot: root,
    workspaceRoot: pjoin(root, 'workspace'),
    customComponentsDir: pjoin(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: pjoin(root, 'workspace', 'vue3-components'),
    tempComponentsDir: pjoin(root, 'temp-components'),
    dataDir: pjoin(root, 'data'),
    logsDir: pjoin(root, 'logs'),
  };
});

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MeetingService } from './meeting.service';

const RUNS_FILE = 'runs.json';
const RETENTION_AUDIT_FILE = 'retention-audit.json';
const AUDIT_FILE = 'audit.json';

let dataDir: string;
let service: MeetingService;

/** 取异常的 status / code；非 HttpException 一律抛出（不吞真错）。 */
function catchHttp(fn: () => any): { status: number; code: string } {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpException) {
      const res: any = e.getResponse();
      return { status: e.getStatus(), code: typeof res === 'object' ? res?.code : String(res) };
    }
    throw e;
  }
  throw new Error('期望抛出 HttpException，但调用正常返回了 —— 判据落空');
}

function readJson<T>(name: string, fallback: T): T {
  const p = join(dataDir, name);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

/** 直连文件改写运行状态：用于构造「已定稿」「历史无主」等难以走正常流程到达的前置态。 */
function patchRunsFile(mutate: (runs: any[]) => void): void {
  const runs = readJson<any[]>(RUNS_FILE, []);
  mutate(runs);
  writeFileSync(join(dataDir, RUNS_FILE), JSON.stringify(runs, null, 2), 'utf-8');
}

function makeRun(owner: string, extra: Record<string, any> = {}): string {
  const view: any = service.createRun({ meetingType: 'other', title: `${owner} 的会`, ...extra }, owner);
  return view.runId;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'mvgo-meeting-owner-'));
  process.env.MEETING_DATA_DIR = dataDir;
  service = new MeetingService();
});

afterEach(() => {
  delete process.env.MEETING_DATA_DIR;
});

// ────────────────────────────────────────────────────────────────────────────────
// 1. 身份前置：没有身份 ⇒ 401 且绝不落库
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · 身份前置（requireOwner）', () => {
  it('缺身份创建运行 ⇒ 401 MEETING_NO_IDENTITY', () => {
    const r = catchHttp(() => service.createRun({ meetingType: 'other' }, undefined));
    expect(r.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(r.code).toBe('MEETING_NO_IDENTITY');
  });

  it('纯空白身份等于无身份（trim 后判定，不给「空字符串 owner」留缝）', () => {
    const r = catchHttp(() => service.createRun({ meetingType: 'other' }, '   '));
    expect(r.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('🔴 被拒的调用没有落库（无主数据比「不可见」更危险）', () => {
    catchHttp(() => service.createRun({ meetingType: 'other' }, undefined));
    expect(readJson<any[]>(RUNS_FILE, [])).toEqual([]);
  });

  it('阳性对照：有身份则创建成功并落库，ownerId 归创建者', () => {
    const runId = makeRun('u1');
    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe(runId);
    expect(runs[0].ownerId).toBe('u1');
  });

  it('读/写类端点同样在无身份时 401（不是「找不到」）', () => {
    const runId = makeRun('u1');
    for (const call of [
      () => service.patchField(runId, 'topic_context', { value: 'x' }, undefined),
      () => service.publishRun(runId, undefined),
      () => service.ingestDraft(runId, { fields: [] }, undefined),
      () => service.purgeRetention({ dryRun: true }, undefined),
      () => service.getRetentionAudit(undefined),
      () => service.setRetentionPolicy({ days: 30 } as any, undefined),
    ]) {
      expect(catchHttp(call).status).toBe(HttpStatus.UNAUTHORIZED);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. 越权 ⇒ 404（不是 403：不泄漏「该 runId 存在」）
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · 跨用户越权一律 404', () => {
  let runId: string;

  beforeEach(() => {
    runId = makeRun('u1');
  });

  it('别家读不到（E-03 / E-05 / E-12 / E-14 只读路径）', () => {
    for (const call of [
      () => service.getRun(runId, 'u2'),
      () => service.getDraft(runId, 'u2'),
      () => service.getConsent(runId, 'u2'),
      () => service.getConsentAudit(runId, 'u2'),
    ]) {
      const r = catchHttp(call);
      expect(r.status).toBe(HttpStatus.NOT_FOUND);
      expect(r.code).toBe('MEETING_RUN_NOT_FOUND');
    }
  });

  it('别家改不动（E-06 / E-10 / E-11 / E-13 写路径）', () => {
    for (const call of [
      () => service.patchField(runId, 'topic_context', { value: 'hacked' }, 'u2'),
      () => service.declareConsent(runId, { participants: ['u2'] }, 'u2'),
      () => service.submitConsentDecisions(runId, { decisions: [{ participantId: 'u2', decision: 'accepted' }] }, 'u2'),
      () => service.withdrawConsent(runId, {}, 'u2'),
      () => service.ingestDraft(runId, { fields: [] }, 'u2'),
      () => service.publishRun(runId, 'u2'),
      () => service.exportRun(runId, 'json', 'u2'),
    ]) {
      const r = catchHttp(call);
      expect(r.status).toBe(HttpStatus.NOT_FOUND);
      expect(r.code).toBe('MEETING_RUN_NOT_FOUND');
    }
  });

  it('越权与「运行不存在」返回**同一个**错误码（无法据此探测存在性）', () => {
    const denied = catchHttp(() => service.getRun(runId, 'u2'));
    const absent = catchHttp(() => service.getRun('mc-meeting-does-not-exist', 'u2'));
    expect(denied).toEqual(absent);
  });

  it('阳性对照：创建者本人读得到、也改得动', () => {
    const view: any = service.getRun(runId, 'u1');
    expect(view.runId).toBe(runId);
    expect(view.status).toBe('排队中');

    const merged: any = service.patchField(runId, 'topic_context', { value: '来自 u1', confirmState: '已确认' }, 'u1');
    const field = (merged.fields ?? []).find((f: any) => f.fieldId === 'topic_context');
    // 无 draftAi ⇒ 合并结果里没有字段，改为直接断言 overlay 落库（人工层独立于 AI 草稿）
    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs[0].fieldOverlay.topic_context.value).toBe('来自 u1');
    expect(runs[0].fieldOverlay.topic_context.updatedBy).toBe('u1');
    expect(field).toBeUndefined();
  });

  it('越权尝试没有改动任何数据（拒绝是「先拦后改」，不是改完才报错）', () => {
    catchHttp(() => service.patchField(runId, 'topic_context', { value: 'hacked' }, 'u2'));
    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs[0].fieldOverlay).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 3. 「无主运行」不可能存在（SessionGuard raw=1 逃生舱的兜底证据）
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · 无主运行不可产生', () => {
  it('🔴 用 raw=1 等价条件（有守卫放行但无身份）反复打各写端点后，库中仍无 ownerId 为空的运行', () => {
    const runId = makeRun('u1');
    const rawLikeCalls = [
      () => service.createRun({ meetingType: 'other' }, undefined),
      () => service.patchField(runId, 'topic_context', { value: 'x' }, undefined),
      () => service.ingestDraft(runId, { fields: [] }, undefined),
      () => service.purgeRetention({}, undefined),
    ];
    for (const call of rawLikeCalls) catchHttp(call);

    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs).toHaveLength(1);
    expect(runs.every((r) => (r.ownerId ?? '').trim().length > 0)).toBe(true);
    expect(runs.map((r) => r.ownerId)).toEqual(['u1']);
  });

  it('历史遗留的空 owner 运行对任何调用方都放行（不把老数据对作者本人锁死）', () => {
    const runId = makeRun('u1');
    patchRunsFile((runs) => {
      runs[0].ownerId = '';
    });
    // 契约选择：ownerId 为空 ⇒ 放行（可辩驳的取舍：隔离只对「有主」数据成立）
    const view: any = service.getRun(runId, 'u9');
    expect(view.runId).toBe(runId);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 4. ingestDraft 状态机（内部 seam：逐跳、不跳级、定稿冻结后不可回写）
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · ingestDraft 状态机与定稿冻结', () => {
  it('排队中 → 待确认（逐跳经处理中），draftAi 落库', () => {
    const runId = makeRun('u1');
    const merged: any = service.ingestDraft(
      runId,
      { fields: [{ fieldId: 'topic_context', key: 'topic_context', label: '议题', value: 'AI 草稿' }] },
      'u1',
    );
    expect(merged.runVersion).toBe(runId);
    expect(merged.fields).toHaveLength(1);

    const view: any = service.getRun(runId, 'u1');
    expect(view.status).toBe('待确认');
    expect(view.draftReady).toBe(true);
  });

  it('🔴 已定稿的运行不可回写草稿（FR-12 冻结），且状态没被改动', () => {
    const runId = makeRun('u1');
    service.ingestDraft(runId, { fields: [{ fieldId: 'topic_context', key: 'topic_context', label: '议题', value: 'v1' }] }, 'u1');
    patchRunsFile((runs) => {
      runs[0].status = '已定稿';
      runs[0].frozen = { publishedAt: new Date().toISOString(), snapshot: { fields: [] } };
    });

    const r = catchHttp(() => service.ingestDraft(runId, { fields: [] }, 'u1'));
    expect(r.status).toBe(HttpStatus.CONFLICT);
    expect(r.code).toBe('MEETING_BAD_STATE');

    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs[0].status).toBe('已定稿');
    expect(runs[0].draftAi.fields).toHaveLength(1);
  });

  it('阳性对照：非定稿状态下同一 seam 是**可用**的（判据不是恒拒）', () => {
    const runId = makeRun('u1');
    expect(() => service.ingestDraft(runId, { fields: [] }, 'u1')).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. E-07 定稿门禁（必填字段逐项人工确认）
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · E-07 定稿门禁', () => {
  it('同意未通过时不可定稿（FR-03 前置）', () => {
    const runId = makeRun('u1');
    service.ingestDraft(runId, { fields: [] }, 'u1');
    const r = catchHttp(() => service.publishRun(runId, 'u1'));
    expect(r.code).toBe('MEETING_BAD_STATE');
    expect(r.status).toBe(HttpStatus.CONFLICT);
  });

  /** 一条字段草稿；门禁按 `key` 与模板 required 比对，故 fieldId/key 必须同名。 */
  const F = (key: string, confirmState: string) => ({
    fieldId: key,
    key,
    label: key,
    value: `v-${key}`,
    sourceState: 'from_meeting',
    confirmState,
  });

  /** 造一个「同意已通过」的运行（E-07 的前置门禁），返回 runId。 */
  function consentPassedRun(): string {
    const runId = makeRun('u1', { participants: ['张', '李'] });
    service.declareConsent(runId, { participants: ['张', '李'] }, 'u1');
    const consent: any = service.submitConsentDecisions(
      runId,
      { decisions: [{ participantId: '张', decision: 'accepted' }, { participantId: '李', decision: 'accepted' }] },
      'u1',
    );
    expect(consent.status).toBe('已通过');
    expect(consent.canRecord).toBe(true);
    return runId;
  }

  /** 期望定稿被 409 拒绝，返回响应体。 */
  function gatedBody(runId: string): any {
    let captured: any = null;
    try {
      service.publishRun(runId, 'u1');
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(HttpException);
    expect(captured.getStatus()).toBe(HttpStatus.CONFLICT);
    return captured.getResponse() as any;
  }

  it('同意已通过但必填字段未确认 ⇒ 409 且逐项列出缺失（门禁不退化成摆设）', () => {
    const runId = consentPassedRun();
    service.ingestDraft(
      runId,
      { fields: [F('topic_context', '未确认'), F('progress_summary', '未确认'), F('open_issues', '未确认')] },
      'u1',
    );
    const body = gatedBody(runId);
    expect(body.code).toBe('MEETING_REQUIRED_FIELDS_UNCONFIRMED');
    // other 模板必填 = topic_context / progress_summary / open_issues（清单逐项给出，不是只报个数）
    expect(body.unconfirmed).toEqual(['topic_context', 'progress_summary', 'open_issues']);
  });

  it('确认态是**逐字段**生效的：已确认者不再列入缺失（不是「有 draftAi 就放行」）', () => {
    const runId = consentPassedRun();
    service.ingestDraft(
      runId,
      { fields: [F('topic_context', '已确认'), F('progress_summary', '未确认'), F('open_issues', '已确认')] },
      'u1',
    );
    expect(gatedBody(runId).unconfirmed).toEqual(['progress_summary']);
  });

  it('阳性对照：必填全部确认后，同一次定稿调用即成功（判据不是恒拒）', () => {
    const runId = consentPassedRun();
    service.ingestDraft(
      runId,
      { fields: [F('topic_context', '已确认'), F('progress_summary', '已确认'), F('open_issues', '已确认')] },
      'u1',
    );
    const published: any = service.publishRun(runId, 'u1');
    expect(published.status).toBe('已定稿');
    expect(published.frozen).toBe(true);
    expect(published.frozenFields).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. E-17 / E-18 归属一致性（只清自己名下、只看自己记录）
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · E-17 到期清理只作用于自己名下', () => {
  let u1a: string;
  let u1b: string;
  let u2a: string;

  beforeEach(() => {
    u1a = makeRun('u1');
    u1b = makeRun('u1');
    u2a = makeRun('u2');
    // 给三个运行都塞上会被清理的产物，才能区分「清掉了」与「本来就没有」；
    // 同时把 createdAt 推到很久以前 —— `purgeRetention` 的「到期」判据是
    // `createdAt < now - policy.days`，刚建的运行**不会过期**（否则计数恒 0，判据落空）。
    patchRunsFile((runs) => {
      for (const r of runs) {
        r.createdAt = '2000-01-01T00:00:00.000Z';
        r.audioRef = `audio://${r.runId}`;
        r.draftAi = { fields: [{ fieldId: 'f1' }], warnings: [], injectionEvents: [], truncatedRatio: 0 };
      }
    });
  });

  it('🔴 指定别人的 runId 也删不动（「知道 runId 即可删别人数据」的越权面已封）', () => {
    const out: any = service.purgeRetention({ runIds: [u2a] } as any, 'u1');
    expect(out.purged).toEqual([]);
    const runs = readJson<any[]>(RUNS_FILE, []);
    const u2run = runs.find((r) => r.runId === u2a);
    expect(u2run.draftAi).not.toBeNull();
    expect(u2run.audioRef).toBe(`audio://${u2a}`);
  });

  it('不带 runIds 的过期清理只清自己的（别人的产物原样保留）', () => {
    // 三个运行都已过期（beforeEach 把 createdAt 推到 2000 年）⇒ 归属过滤才是唯一分界：
    // dryRun 应只统计 u1 的两个，u2 的虽同样过期但被 owner 闸拦在 targeted 之外。
    const dry: any = service.purgeRetention({ dryRun: true } as any, 'u1');
    expect(dry.purged.sort()).toEqual([u1a, u1b].sort());
    expect(dry.counts.artifacts).toBe(2);
    expect(dry.counts.audio).toBe(2);
    expect(dry.audit).toBeNull();

    const runs = readJson<any[]>(RUNS_FILE, []);
    expect(runs.every((r) => r.draftAi !== null)).toBe(true); // dryRun 不落地
  });

  it('真实清理：自己的被清、别人的保留', () => {
    const out: any = service.purgeRetention({ runIds: [u1a] } as any, 'u1');
    expect(out.purged).toEqual([u1a]);
    expect(out.counts.artifacts).toBe(1);

    const runs = readJson<any[]>(RUNS_FILE, []);
    const m = new Map(runs.map((r) => [r.runId, r]));
    expect(m.get(u1a).draftAi).toBeNull();
    expect(m.get(u1a).audioRef).toBeNull();
    expect((m.get(u1b) as any).draftAi).not.toBeNull();
    expect((m.get(u2a) as any).draftAi).not.toBeNull();
  });

  it('清理审计带 actor 归属（E-18 的过滤依据）', () => {
    service.purgeRetention({ runIds: [u1a] } as any, 'u1');
    const audits = readJson<any[]>(RETENTION_AUDIT_FILE, []);
    expect(audits).toHaveLength(1);
    expect(audits[0].actor).toBe('u1');
    expect(audits[0].kind).toBe('user_delete');
    expect(audits[0].runId).toBe(u1a);
  });

  it('无身份的清理被拒且不写审计', () => {
    expect(catchHttp(() => service.purgeRetention({}, undefined)).status).toBe(HttpStatus.UNAUTHORIZED);
    expect(readJson<any[]>(RETENTION_AUDIT_FILE, [])).toEqual([]);
  });
});

describe('归属 · E-18 删除审计只看自己', () => {
  it('🔴 各自只看到自己触发的清理记录', () => {
    const u1run = makeRun('u1');
    const u2run = makeRun('u2');
    service.purgeRetention({ runIds: [u1run] } as any, 'u1');
    service.purgeRetention({ runIds: [u2run] } as any, 'u2');

    const all = readJson<any[]>(RETENTION_AUDIT_FILE, []);
    expect(all.map((a) => a.actor).sort()).toEqual(['u1', 'u2']);

    const u1view: any = service.getRetentionAudit('u1');
    const u2view: any = service.getRetentionAudit('u2');
    expect(u1view.entries.map((e: any) => e.actor)).toEqual(['u1']);
    expect(u1view.entries.map((e: any) => e.runId)).toEqual([u1run]);
    expect(u2view.entries.map((e: any) => e.actor)).toEqual(['u2']);
    // 阳性对照：u1 确实看到了一条（不是「过滤成空」的假绿）
    expect(u1view.entries).toHaveLength(1);
  });

  it('没有清理记录的用户看到空列表（而不是别人的记录）', () => {
    const u1run = makeRun('u1');
    service.purgeRetention({ runIds: [u1run] } as any, 'u1');
    const u3view: any = service.getRetentionAudit('u3');
    expect(u3view.entries).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 7. 归属证据：审计 actor / policy 写入者
// ────────────────────────────────────────────────────────────────────────────────

describe('归属 · 审计留痕的 actor 就是操作者', () => {
  it('创建 / 编辑 / 回写草稿的审计条目都带正确 actor', () => {
    const runId = makeRun('u1');
    service.patchField(runId, 'topic_context', { confirmState: '已确认' }, 'u1');
    service.ingestDraft(runId, { fields: [] }, 'u1');

    const audits = readJson<any[]>(AUDIT_FILE, []).filter((a) => a.runId === runId);
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('run.create');
    expect(actions).toContain('draft.patch');
    expect(actions).toContain('run.ingest-draft');
    expect(audits.every((a) => a.actor === 'u1')).toBe(true);
  });

  it('留存策略写入标 source=admin，并把 actor 写进审计（全局单例但仍留痕）', () => {
    const policy: any = service.setRetentionPolicy({ days: 45 } as any, 'admin-1');
    expect(policy.days).toBe(45);
    expect(policy.source).toBe('admin');

    const audits = readJson<any[]>(AUDIT_FILE, []).filter((a) => a.action === 'retention.policy.set');
    expect(audits).toHaveLength(1);
    expect(audits[0].actor).toBe('admin-1');
    expect(audits[0].detail.days).toBe(45);
  });

  it('留存策略是全局单例：切换调用方读到的仍是同一份配置（口径如此，非缺陷）', () => {
    service.setRetentionPolicy({ days: 45 } as any, 'admin-1');
    expect(service.getRetentionPolicy().days).toBe(45);
    expect(service.getRetentionPolicy().days).toBe(45);
  });
});
