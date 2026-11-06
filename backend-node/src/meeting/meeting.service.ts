import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { MeetingStore } from './meeting.store';
import {
  RunStatus,
  canConsentTransition,
  canTransition,
  requiredFieldsOf,
  schemaOf,
} from './meeting-state';
import {
  AttachAudioDto,
  ComposeDto,
  ConsentDecisionsDto,
  CreateRunDto,
  DeclareConsentDto,
  PatchFieldDto,
  PurgeRetentionDto,
  SetRetentionDto,
  WithdrawConsentDto,
} from './dto/meeting.dto';

const RUNS_FILE = 'runs.json';
const POLICY_FILE = 'retention-policy.json';
const RETENTION_AUDIT_FILE = 'retention-audit.json';
const AUDIT_FILE = 'audit.json';

export const DEFAULT_RETENTION_DAYS = 90;

/**
 * 契约 `BACKEND_DEPENDENCIES`（前端 api-contract.js）的 Node 侧镜像。
 * 全部 level:'阻塞' 且 ready:false ⇒ 任何声称「已接通」的实现都是伪造。
 * 依赖就绪前，依赖它们的端点一律 503 + 明确 code，而不是返回假成功的空壳。
 */
export const MEETING_BLOCKING_DEPS = Object.freeze([
  { id: 'D-01', name: '云 ASR / LLM 密钥' },
  { id: 'T-013', name: '后端音频上传接口' },
  { id: 'SEC-05', name: '云服务商委托处理协议（法务）' },
  { id: 'SEC-01', name: '告知文案法务审定' },
  { id: 'Q-04', name: '留存天数产品 / 法务确认' },
]);

export interface FieldOverlay {
  value?: any;
  confirmState?: string;
  note?: string;
  reason?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ConsentRecord {
  participantId: string;
  decision: 'declare' | 'accepted' | 'declined' | 'withdraw';
  disclosureVersion: string | null;
  at: string;
  reason?: string;
}

export interface MeetingRun {
  runId: string;
  /** 🔴 归属（唯一写入点 = createRun）。所有读/写路径的隔离判据都从这里派生。 */
  ownerId: string;
  title: string;
  meetingType: string;
  template: { id: string; version: string; label: string };
  outputLanguage: string;
  detectedLanguages: string[];
  participants: string[];
  inputs: Record<string, any>;
  status: RunStatus;
  draftAi: { fields: any[]; warnings: string[]; injectionEvents: any[]; truncatedRatio: number } | null;
  fieldOverlay: Record<string, FieldOverlay>;
  frozen: { publishedAt: string; snapshot: any } | null;
  audioRef: string | null;
  consent: {
    status: string;
    disclosure: { version: string; summary: string; declaredAt: string; participants: string[] } | null;
    records: ConsentRecord[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface RetentionPolicy {
  days: number;
  source: 'default' | 'admin';
  updatedBy?: string;
  updatedAt?: string;
}

export interface RetentionAuditEntry {
  id: string;
  kind: 'expire_purge' | 'user_delete';
  runId: string | null;
  counts: { audio: number; utterances: number; artifacts: number; embeddings: number };
  at: string;
  actor: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildRunId(): string {
  return `mc-meeting-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** 参会人清单去重 + 去空白；保持首次出现顺序（同意门禁按逐人留痕，顺序影响审计可读性） */
function dedupeParticipants(value?: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);
  private readonly store = new MeetingStore();

  // ────────────────────────────────────────────────────────────────────────────
  // 归属层：读/写的唯一入口。任何 run 相关方法必须先过这里。
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * 写入类端点的身份前置。
   *
   * 🔴 为什么不信任守卫就够：`SessionGuard` 第 0 步有 `raw=1` 逃生舱（为静态图片设计，
   *    新标签页直开不能带 Header）。该逃生舱对**所有**挂在 SessionGuard 下的路由生效
   *    ⇒ 一次 `?raw=1` 就能匿名打到写端点，落出一条 `ownerId=''` 的无主运行。
   *    「无主 = 对所有人可见」比「对所有人不可见」更坏（后者只是不便，前者是泄漏）。
   *    所以服务层再判一次：身份缺失一律 401，绝不落库。
   */
  private requireOwner(userId?: string): string {
    const owner = (userId ?? '').trim();
    if (!owner) {
      throw new HttpException(
        { code: 'MEETING_NO_IDENTITY', message: '缺少调用方身份，无法确定会议归属' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return owner;
  }

  /**
   * 归属判据的**唯一实现**（单运行读写都从这里派生，勿在别处另写一份比较）。
   *
   * 语义：
   *   · 运行不存在 → 404
   *   · `ownerId` 非空且 ≠ 调用方 → **404（不是 403）**：403 等于承认「这个 runId 存在、
   *     只是不给你看」，会泄漏存在性；与 dev-only 开关「不暴露存在性」的口径一致。
   *   · `ownerId` 为空（历史/异常数据）→ 放行，避免把老数据对作者本人锁死（不可逆事故）。
   */
  private pickOwned(runs: MeetingRun[], runId: string, userId?: string): MeetingRun {
    const run = runs.find((r) => r.runId === runId);
    if (!run) throw this.notFound(runId);
    const owner = (run.ownerId ?? '').trim();
    if (owner && owner !== (userId ?? '').trim()) {
      this.logger.warn(
        `[meeting][owner] 拒绝访问 runId=${runId}：归属不一致（caller=${userId ?? 'anonymous'}）`,
      );
      throw this.notFound(runId);
    }
    return run;
  }

  /** 只读路径的归属闸（返回运行实体，避免调用方二次遍历） */
  assertRunAccess(runId: string, userId?: string): MeetingRun {
    return this.pickOwned(this.loadRuns(), runId, userId);
  }

  /** 写入路径的归属闸 + 落库（同一份 pickOwned 判据，勿另写） */
  private updateRun<T>(runId: string, userId: string | undefined, fn: (run: MeetingRun) => T): T {
    const runs = this.loadRuns();
    const run = this.pickOwned(runs, runId, userId);
    const out = fn(run);
    run.updatedAt = nowIso();
    this.saveRuns(runs);
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 存储
  // ────────────────────────────────────────────────────────────────────────────

  private loadRuns(): MeetingRun[] {
    return this.store.read<MeetingRun[]>(RUNS_FILE, []);
  }

  private saveRuns(runs: MeetingRun[]): void {
    this.store.write(RUNS_FILE, runs);
  }

  private appendAudit(action: string, runId: string | null, actor: string, detail?: any): void {
    const list = this.store.read<any[]>(AUDIT_FILE, []);
    list.push({ at: nowIso(), action, runId, actor, detail: detail ?? null });
    this.store.write(AUDIT_FILE, list);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 错误构造
  // ────────────────────────────────────────────────────────────────────────────

  private notFound(runId: string): HttpException {
    return new HttpException(
      { code: 'MEETING_RUN_NOT_FOUND', message: `会议运行 ${runId} 不存在` },
      HttpStatus.NOT_FOUND,
    );
  }

  private badState(message: string): HttpException {
    return new HttpException({ code: 'MEETING_BAD_STATE', message }, HttpStatus.CONFLICT);
  }

  private depNotReady(depIds: string[], what: string): HttpException {
    const unmet = MEETING_BLOCKING_DEPS.filter((d) => depIds.includes(d.id));
    return new HttpException(
      {
        code: 'MEETING_DEP_NOT_READY',
        message: `${what}所需依赖未就绪：${unmet.map((d) => `${d.id} ${d.name}`).join('、')}`,
        unmet,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private viewOf(run: MeetingRun) {
    return {
      runId: run.runId,
      title: run.title,
      meetingType: run.meetingType,
      template: run.template,
      status: run.status,
      outputLanguage: run.outputLanguage,
      detectedLanguages: run.detectedLanguages,
      participants: run.participants,
      consentStatus: run.consent.status,
      canRecord: run.consent.status === '已通过',
      draftReady: !!run.draftAi,
      frozen: !!run.frozen,
      audioRef: run.audioRef,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // E-01~E-18 契约端点（实现顺序与 api-contract.js#BACKEND_ENDPOINTS 对齐）
  // ────────────────────────────────────────────────────────────────────────────

  /** E-01 创建 RunVersion（三路输入 + 模板 + 语种配置）。归属在此唯一落库。 */
  createRun(dto: CreateRunDto, userId?: string) {
    const ownerId = this.requireOwner(userId);
    const tpl = schemaOf((dto.meetingType ?? 'other').trim());
    const now = nowIso();
    const run: MeetingRun = {
      runId: buildRunId(),
      ownerId,
      title: (dto.title ?? '').trim(),
      meetingType: tpl.id,
      template: { id: tpl.id, version: tpl.version, label: tpl.label },
      outputLanguage: (dto.outputLanguage ?? 'zh').trim() || 'zh',
      detectedLanguages: [],
      participants: dedupeParticipants(dto.participants),
      inputs: dto.inputs ?? {},
      status: '排队中',
      draftAi: null,
      fieldOverlay: {},
      frozen: null,
      audioRef: null,
      consent: { status: '未发起', disclosure: null, records: [] },
      createdAt: now,
      updatedAt: now,
    };
    const runs = this.loadRuns();
    runs.push(run);
    this.saveRuns(runs);
    this.appendAudit('run.create', run.runId, ownerId, { meetingType: run.meetingType });
    return this.viewOf(run);
  }

  /** E-02 音频上传（服务端须二次校验同意门禁，不信任前端判定）—— T-013/SEC-05 未就绪 */
  attachAudio(runId: string, _dto: AttachAudioDto, userId?: string) {
    // 🔴 先过归属：越权必须 404，不能因「依赖未就绪」而泄漏「该 runId 存在」
    this.assertRunAccess(runId, userId);
    throw this.depNotReady(['T-013', 'SEC-05'], '音频上传');
  }

  /** E-03 轮询阶段状态与 partial_artifacts */
  getRun(runId: string, userId?: string) {
    return this.viewOf(this.assertRunAccess(runId, userId));
  }

  /** E-04 断点续跑，只重跑失败阶段及之后 —— 需要真实管线（D-01/T-013） */
  retryRun(runId: string, userId?: string) {
    const run = this.assertRunAccess(runId, userId);
    if (!canTransition(run.status, '处理中')) {
      throw this.badState(`运行处于「${run.status}」，不可重跑（仅「失败」可重跑）`);
    }
    throw this.depNotReady(['D-01', 'T-013'], '断点续跑');
  }

  /** E-05 读取 draft_ai + field_overlay 合并结果（契约 draft_schema_v1 形状） */
  getDraft(runId: string, userId?: string) {
    return this.mergeDraft(this.assertRunAccess(runId, userId));
  }

  /** E-06 编辑 / 确认 / 驳回，写 field_overlay（AI 原草稿不可变，重跑不覆盖人工层） */
  patchField(runId: string, fieldId: string, dto: PatchFieldDto, userId?: string) {
    const owner = this.requireOwner(userId);
    const id = (fieldId ?? '').trim();
    if (!id) {
      throw new HttpException(
        { code: 'MEETING_BAD_FIELD', message: 'fieldId 不能为空' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.updateRun(runId, owner, (run) => {
      if (run.frozen) throw this.badState('运行已定稿冻结，不可再编辑字段（FR-12）');
      const prev = run.fieldOverlay[id];
      run.fieldOverlay[id] = {
        ...(prev ?? {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.confirmState !== undefined ? { confirmState: dto.confirmState } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        updatedAt: nowIso(),
        updatedBy: owner,
      };
      this.appendAudit('draft.patch', runId, owner, {
        fieldId: id,
        confirmState: dto.confirmState ?? null,
      });
      return this.mergeDraft(run);
    });
  }

  /** E-07 人工确认齐备后定稿冻结快照（FR-12 定稿不可回草稿；FR-03 同意门禁前置） */
  publishRun(runId: string, userId?: string) {
    const owner = this.requireOwner(userId);
    return this.updateRun(runId, owner, (run) => {
      if (run.consent.status !== '已通过') {
        throw this.badState(`同意门禁未通过（当前「${run.consent.status}」），不得定稿`);
      }
      if (!canTransition(run.status, '已定稿')) {
        throw this.badState(`运行处于「${run.status}」，不可定稿（仅「待确认」可定稿）`);
      }
      // 🔴 定稿门禁：模板 required 字段必须**逐项人工确认**（合并 overlay 后的确认态）。
      //    只统计不阻断 = 门禁退化；required 也就成了摆设（见 meeting-state 注释）。
      const merged = this.mergeDraft(run);
      const confirmedKeys = new Set(
        (merged.fields ?? [])
          .filter((f: any) => f.confirmState === '已确认')
          .map((f: any) => f.key),
      );
      const unconfirmed = requiredFieldsOf(run.meetingType).filter((k) => !confirmedKeys.has(k));
      if (unconfirmed.length) {
        throw new HttpException(
          {
            code: 'MEETING_REQUIRED_FIELDS_UNCONFIRMED',
            message: `模板「${run.meetingType}」尚有必填字段未确认，不得定稿`,
            unconfirmed,
          },
          HttpStatus.CONFLICT,
        );
      }
      run.status = '已定稿';
      run.frozen = { publishedAt: nowIso(), snapshot: merged };
      this.appendAudit('run.publish', runId, owner, { fields: merged.fields?.length ?? 0 });
      return { ...this.viewOf(run), frozenFields: merged.fields?.length ?? 0 };
    });
  }

  /** E-08 导出（过 FR-11 发布门禁；不得含原始音频）。docx/pdf 依赖未就绪 → 503 */
  exportRun(runId: string, format: string, userId?: string) {
    const run = this.assertRunAccess(runId, userId);
    if (!run.frozen) throw this.badState('未定稿版本禁止导出（FR-11）');
    const fmt = (format || 'json').trim().toLowerCase();
    // 契约 OUTPUT_TARGETS.production.exportFile.blockers：docx 库 / OOXML 渲染 /
    // CJK 字体授权嵌入 / PDF 渲染服务；未就绪前按 dev 降级路径（Word 兼容 .doc / 浏览器打印）
    if (!['json', 'markdown', 'md', 'csv', 'html'].includes(fmt)) {
      throw this.depNotReady(['D-01'], `导出格式 ${fmt}`);
    }
    return {
      runId,
      format: fmt,
      publishedAt: run.frozen.publishedAt,
      // 🔴 不得含原始音频：导出物只带字段文本，audioRef 是内部引用，不随导出外流
      content: this.renderExport(run.frozen.snapshot, fmt),
      notice: '导出物带内部草稿声明；未发布版本禁止对外分发（FR-11 / Q-13）',
    };
  }

  /** E-09 整合草稿 + 转写稿 + 证据为输出稿件（过 V-1~V-6 与 FR-11）—— 需云 LLM */
  composeRun(runId: string, _dto: ComposeDto, userId?: string) {
    this.assertRunAccess(runId, userId);
    throw this.depNotReady(['D-01'], '整合稿件合成');
  }

  /** E-10 发起告知，返回 disclosure_version 与待表态参会人清单 */
  declareConsent(runId: string, dto: DeclareConsentDto, userId?: string) {
    const owner = this.requireOwner(userId);
    return this.updateRun(runId, owner, (run) => {
      if (!canConsentTransition(run.consent.status, '征集中')) {
        throw this.badState(`同意状态「${run.consent.status}」不可发起告知`);
      }
      const requested = dedupeParticipants(dto.participants);
      const participants = requested.length ? requested : run.participants;
      if (!participants.length) {
        throw new HttpException(
          { code: 'MEETING_NO_PARTICIPANTS', message: '待表态参会人清单为空，无法发起告知' },
          HttpStatus.BAD_REQUEST,
        );
      }
      const version = (dto.disclosureVersion ?? 'v1').trim() || 'v1';
      const at = nowIso();
      run.participants = participants;
      run.consent.disclosure = {
        version,
        summary: (dto.summary ?? '').trim(),
        declaredAt: at,
        participants,
      };
      run.consent.records.push(
        ...participants.map((p) => ({
          participantId: p,
          decision: 'declare' as const,
          disclosureVersion: version,
          at,
        })),
      );
      run.consent.status = '征集中';
      this.appendAudit('consent.declare', runId, owner, { version, participants });
      return this.consentView(run);
    });
  }

  /** E-11 提交单人参会人的同意 / 拒绝，逐人留痕（FR-03：任一人拒绝即整场阻断） */
  submitConsentDecisions(runId: string, dto: ConsentDecisionsDto, userId?: string) {
    const owner = this.requireOwner(userId);
    return this.updateRun(runId, owner, (run) => {
      if (run.consent.status !== '征集中') {
        throw this.badState(`同意状态「${run.consent.status}」不可提交表态（仅「征集中」可提交）`);
      }
      const version = run.consent.disclosure?.version ?? null;
      for (const d of dto.decisions ?? []) {
        const pid = (d?.participantId ?? '').trim();
        if (!pid) continue;
        if (!run.participants.includes(pid)) {
          throw new HttpException(
            { code: 'MEETING_UNKNOWN_PARTICIPANT', message: `参会人 ${pid} 不在待表态清单中` },
            HttpStatus.BAD_REQUEST,
          );
        }
        run.consent.records.push({
          participantId: pid,
          decision: d.decision,
          disclosureVersion: version,
          at: nowIso(),
        });
      }
      run.consent.status = this.evaluateConsent(run).status;
      this.appendAudit('consent.decisions', runId, owner, {
        decisions: dto.decisions?.length ?? 0,
        status: run.consent.status,
      });
      return this.consentView(run);
    });
  }

  /** E-12 查询权威门禁状态（canRecord / blockers / blocking） */
  getConsent(runId: string, userId?: string) {
    return this.consentView(this.assertRunAccess(runId, userId));
  }

  /** E-13 撤回同意：停止处理并触发产物删除；不可直接改回同意 */
  withdrawConsent(runId: string, dto: WithdrawConsentDto, userId?: string) {
    const owner = this.requireOwner(userId);
    return this.updateRun(runId, owner, (run) => {
      if (!canConsentTransition(run.consent.status, '已撤回')) {
        throw this.badState(`同意状态「${run.consent.status}」不可撤回`);
      }
      run.consent.records.push({
        participantId: (dto.participantId ?? '').trim() || '*',
        decision: 'withdraw',
        disclosureVersion: run.consent.disclosure?.version ?? null,
        at: nowIso(),
        ...(dto.reason ? { reason: dto.reason } : {}),
      });
      run.consent.status = '已撤回';
      // 撤回即停止处理并清理**未定稿**产物；已定稿快照改由留存策略处置，不在此处抹掉
      if (!run.frozen) {
        run.audioRef = null;
        run.draftAi = null;
      }
      this.appendAudit('consent.withdraw', runId, owner, {
        participantId: dto.participantId ?? '*',
      });
      return this.consentView(run);
    });
  }

  /** E-14 逐人同意留痕（declare / accepted / declined / withdraw 全链路 + 告知版本） */
  getConsentAudit(runId: string, userId?: string) {
    const run = this.assertRunAccess(runId, userId);
    return { runId: run.runId, disclosure: run.consent.disclosure, records: run.consent.records };
  }

  /** E-15 读取留存策略（未配置返回默认 90 天 + source=default） */
  getRetentionPolicy(): RetentionPolicy {
    const raw = this.store.read<Partial<RetentionPolicy> | null>(POLICY_FILE, null);
    const days = Number(raw?.days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return { days: DEFAULT_RETENTION_DAYS, source: 'default' };
    }
    return {
      days,
      source: raw?.source === 'admin' ? 'admin' : 'default',
      ...(raw?.updatedBy ? { updatedBy: raw.updatedBy } : {}),
      ...(raw?.updatedAt ? { updatedAt: raw.updatedAt } : {}),
    };
  }

  /** E-16 管理员写入留存天数（合法区间 1~3650），写审计 */
  setRetentionPolicy(dto: SetRetentionDto, userId?: string): RetentionPolicy {
    const owner = this.requireOwner(userId);
    const policy: RetentionPolicy = {
      days: dto.days,
      source: 'admin',
      updatedBy: owner,
      updatedAt: nowIso(),
    };
    this.store.write(POLICY_FILE, policy);
    this.appendAudit('retention.policy.set', null, owner, { days: dto.days });
    return policy;
  }

  /**
   * E-17 执行到期清理：删音频 / 转写 / 中间产物，保留脱敏统计与审计。
   *
   * 🔴 归属：只清**调用方自己**名下的运行；`runIds` 也必须落在自己名下
   *    （否则 purge 就成了「知道 runId 即可删别人数据」的越权写入面）。
   */
  purgeRetention(dto: PurgeRetentionDto, userId?: string) {
    const owner = this.requireOwner(userId);
    const policy = this.getRetentionPolicy();
    const cutoff = Date.now() - policy.days * 24 * 60 * 60 * 1000;
    const runs = this.loadRuns();
    const targeted = runs.filter((r) => {
      if ((r.ownerId ?? '').trim() !== owner) return false;
      if (dto.runIds?.length) return dto.runIds.includes(r.runId);
      return new Date(r.createdAt).getTime() < cutoff;
    });
    const counts = { audio: 0, utterances: 0, artifacts: 0, embeddings: 0 };
    const purged: string[] = [];
    for (const run of targeted) {
      if (run.audioRef) counts.audio += 1;
      counts.utterances += run.draftAi?.fields?.length ?? 0;
      if (run.draftAi) counts.artifacts += 1;
      if (!dto.dryRun) {
        run.audioRef = null;
        run.draftAi = null;
        run.updatedAt = nowIso();
      }
      purged.push(run.runId);
    }
    if (!dto.dryRun && targeted.length) this.saveRuns(runs);
    const entry: RetentionAuditEntry = {
      id: `rt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind: dto.runIds?.length ? 'user_delete' : 'expire_purge',
      runId: dto.runIds?.length === 1 ? dto.runIds[0] : null,
      counts,
      at: nowIso(),
      actor: owner,
    };
    if (!dto.dryRun) {
      const list = this.store.read<RetentionAuditEntry[]>(RETENTION_AUDIT_FILE, []);
      list.push(entry);
      this.store.write(RETENTION_AUDIT_FILE, list);
    }
    this.appendAudit('retention.purge', null, owner, {
      dryRun: !!dto.dryRun,
      purged: purged.length,
      counts,
    });
    return {
      dryRun: !!dto.dryRun,
      policyDays: policy.days,
      purged,
      counts,
      audit: dto.dryRun ? null : entry,
    };
  }

  /**
   * E-18 删除审计（仅脱敏计数，无正文）。
   *
   * 🔴 与 E-17 对称：只返回**调用方自己**触发的清理记录（`actor === owner`）。
   *    E-17 限定了「只清自己名下」，若 E-18 把全量审计吐出来，就等于用审计侧
   *    泄漏了别人跑了多少次清理、清了多少条 —— 归属一致性要求读写两侧同一口径。
   */
  getRetentionAudit(userId?: string) {
    const owner = this.requireOwner(userId);
    const entries = this.store
      .read<RetentionAuditEntry[]>(RETENTION_AUDIT_FILE, [])
      .filter((e) => (e.actor ?? '').trim() === owner);
    return { entries };
  }

  /**
   * 🔴 内部 seam（**不是**契约 18 条之一）：管线回写 AI 草稿 → 状态推进到「待确认」。
   *
   * 真实架构里由 ASR/LLM 管线（D-01/T-013）在阶段完成时写 `draft_ai`。这两项依赖未就绪，
   * 若没有本 seam，「排队中」永远到不了「待确认」⇒ E-05/E-06/E-07/E-08 全成死码，
   * 归属层与合规层也就无法被端到端验证。故保留此显式 seam，由 dev harness / 未来管线调用；
   * 整个模块 dev-only 注册 ⇒ 生产不存在该路由。
   */
  ingestDraft(runId: string, draft: any, userId?: string) {
    const owner = this.requireOwner(userId);
    return this.updateRun(runId, owner, (run) => {
      if (run.frozen) throw this.badState('运行已定稿冻结，不可回写草稿');
      // 逐跳走状态机（排队中 → 处理中 → 待确认），不跳级，保证转移表是唯一真相
      if (run.status === '排队中') {
        if (!canTransition('排队中', '处理中')) throw this.badState('状态机异常：排队中 → 处理中 不可达');
        run.status = '处理中';
      }
      if (!canTransition(run.status, '待确认')) {
        throw this.badState(`运行处于「${run.status}」，不可回写草稿`);
      }
      const fields = Array.isArray(draft?.fields) ? draft.fields : [];
      run.draftAi = {
        fields,
        warnings: Array.isArray(draft?.warnings) ? draft.warnings : [],
        injectionEvents: Array.isArray(draft?.injectionEvents) ? draft.injectionEvents : [],
        truncatedRatio: Number(draft?.truncatedRatio) || 0,
      };
      if (Array.isArray(draft?.detectedLanguages)) run.detectedLanguages = draft.detectedLanguages;
      run.status = '待确认';
      this.appendAudit('run.ingest-draft', runId, owner, { fields: fields.length });
      return this.mergeDraft(run);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 投影 / 派生（纯函数，无副作用）
  // ────────────────────────────────────────────────────────────────────────────

  /** 同意门禁的**权威判定**（逐人取最新表态；任一 declined ⇒ 阻断；全部 accepted ⇒ 通过） */
  private evaluateConsent(run: MeetingRun): { status: string } {
    const latest = new Map<string, string>();
    for (const r of run.consent.records) {
      if (r.decision === 'declare' || r.decision === 'withdraw') continue;
      latest.set(r.participantId, r.decision);
    }
    if ([...latest.values()].some((v) => v === 'declined')) return { status: '已阻断' };
    if (run.participants.every((p) => latest.has(p))) return { status: '已通过' };
    return { status: '征集中' };
  }

  private consentView(run: MeetingRun) {
    const latest = new Map<string, string>();
    for (const r of run.consent.records) {
      if (r.decision === 'declare' || r.decision === 'withdraw') continue;
      latest.set(r.participantId, r.decision);
    }
    return {
      runId: run.runId,
      status: run.consent.status,
      canRecord: run.consent.status === '已通过',
      blocking: run.consent.status === '已阻断',
      blockers: run.participants.filter((p) => latest.get(p) === 'declined'),
      pending: run.participants.filter((p) => !latest.has(p)),
      disclosure: run.consent.disclosure,
      withdrawn: run.consent.status === '已撤回',
    };
  }

  /** draft_ai + field_overlay 合并（AI 原草稿不可变；人工层优先，缺失则回落原值） */
  private mergeDraft(run: MeetingRun) {
    const base = run.draftAi;
    const fields = (base?.fields ?? []).map((f: any) => {
      const ov = run.fieldOverlay?.[f.fieldId];
      if (!ov) return f;
      return {
        ...f,
        value: ov.value !== undefined ? ov.value : f.value,
        confirmState: ov.confirmState ?? f.confirmState,
        ...(ov.note !== undefined ? { note: ov.note } : {}),
        ...(ov.reason !== undefined ? { reason: ov.reason } : {}),
      };
    });
    return {
      runVersion: run.runId,
      template: run.template,
      detectedLanguages: run.detectedLanguages,
      outputLanguage: run.outputLanguage,
      warnings: base?.warnings ?? [],
      truncatedRatio: base?.truncatedRatio ?? 0,
      injectionEvents: base?.injectionEvents ?? [],
      fields,
      frozen: !!run.frozen,
      consentStatus: run.consent.status,
    };
  }

  private renderExport(snapshot: any, fmt: string): string {
    const fields: any[] = snapshot?.fields ?? [];
    if (fmt === 'csv') {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return ['fieldId,key,label,value,sourceState,confirmState']
        .concat(
          fields.map((f) =>
            [f.fieldId, f.key, f.label, f.value, f.sourceState, f.confirmState].map(esc).join(','),
          ),
        )
        .join('\n');
    }
    if (fmt === 'html') {
      const rows = fields
        .map((f) => `<tr><td>${escapeHtml(f.label ?? f.key)}</td><td>${escapeHtml(f.value)}</td></tr>`)
        .join('');
      return `<table><thead><tr><th>字段</th><th>值</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (fmt === 'markdown' || fmt === 'md') {
      return ['| 字段 | 值 |', '| --- | --- |']
        .concat(fields.map((f) => `| ${f.label ?? f.key} | ${String(f.value ?? '')} |`))
        .join('\n');
    }
    return JSON.stringify(snapshot, null, 2);
  }
}

/** 字段值按数据渲染时做 HTML 转义（契约 OUTPUT_TARGETS.dev.exportFile.hardConstraints） */
function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
