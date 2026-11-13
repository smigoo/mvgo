"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MeetingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingService = exports.MEETING_BLOCKING_DEPS = exports.DEFAULT_RETENTION_DAYS = void 0;
const common_1 = require("@nestjs/common");
const meeting_store_1 = require("./meeting.store");
const meeting_state_1 = require("./meeting-state");
const RUNS_FILE = 'runs.json';
const POLICY_FILE = 'retention-policy.json';
const RETENTION_AUDIT_FILE = 'retention-audit.json';
const AUDIT_FILE = 'audit.json';
exports.DEFAULT_RETENTION_DAYS = 90;
exports.MEETING_BLOCKING_DEPS = Object.freeze([
    { id: 'D-01', name: '云 ASR / LLM 密钥' },
    { id: 'T-013', name: '后端音频上传接口' },
    { id: 'SEC-05', name: '云服务商委托处理协议（法务）' },
    { id: 'SEC-01', name: '告知文案法务审定' },
    { id: 'Q-04', name: '留存天数产品 / 法务确认' },
]);
function nowIso() {
    return new Date().toISOString();
}
function buildRunId() {
    return `mc-meeting-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
function dedupeParticipants(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const out = [];
    for (const v of value) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s || seen.has(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}
let MeetingService = MeetingService_1 = class MeetingService {
    logger = new common_1.Logger(MeetingService_1.name);
    store = new meeting_store_1.MeetingStore();
    requireOwner(userId) {
        const owner = (userId ?? '').trim();
        if (!owner) {
            throw new common_1.HttpException({ code: 'MEETING_NO_IDENTITY', message: '缺少调用方身份，无法确定会议归属' }, common_1.HttpStatus.UNAUTHORIZED);
        }
        return owner;
    }
    pickOwned(runs, runId, userId) {
        const run = runs.find((r) => r.runId === runId);
        if (!run)
            throw this.notFound(runId);
        const owner = (run.ownerId ?? '').trim();
        if (owner && owner !== (userId ?? '').trim()) {
            this.logger.warn(`[meeting][owner] 拒绝访问 runId=${runId}：归属不一致（caller=${userId ?? 'anonymous'}）`);
            throw this.notFound(runId);
        }
        return run;
    }
    assertRunAccess(runId, userId) {
        return this.pickOwned(this.loadRuns(), runId, userId);
    }
    updateRun(runId, userId, fn) {
        const runs = this.loadRuns();
        const run = this.pickOwned(runs, runId, userId);
        const out = fn(run);
        run.updatedAt = nowIso();
        this.saveRuns(runs);
        return out;
    }
    loadRuns() {
        return this.store.read(RUNS_FILE, []);
    }
    saveRuns(runs) {
        this.store.write(RUNS_FILE, runs);
    }
    appendAudit(action, runId, actor, detail) {
        const list = this.store.read(AUDIT_FILE, []);
        list.push({ at: nowIso(), action, runId, actor, detail: detail ?? null });
        this.store.write(AUDIT_FILE, list);
    }
    notFound(runId) {
        return new common_1.HttpException({ code: 'MEETING_RUN_NOT_FOUND', message: `会议运行 ${runId} 不存在` }, common_1.HttpStatus.NOT_FOUND);
    }
    badState(message) {
        return new common_1.HttpException({ code: 'MEETING_BAD_STATE', message }, common_1.HttpStatus.CONFLICT);
    }
    depNotReady(depIds, what) {
        const unmet = exports.MEETING_BLOCKING_DEPS.filter((d) => depIds.includes(d.id));
        return new common_1.HttpException({
            code: 'MEETING_DEP_NOT_READY',
            message: `${what}所需依赖未就绪：${unmet.map((d) => `${d.id} ${d.name}`).join('、')}`,
            unmet,
        }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
    }
    viewOf(run) {
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
    createRun(dto, userId) {
        const ownerId = this.requireOwner(userId);
        const tpl = (0, meeting_state_1.schemaOf)((dto.meetingType ?? 'other').trim());
        const now = nowIso();
        const run = {
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
    attachAudio(runId, _dto, userId) {
        this.assertRunAccess(runId, userId);
        throw this.depNotReady(['T-013', 'SEC-05'], '音频上传');
    }
    getRun(runId, userId) {
        return this.viewOf(this.assertRunAccess(runId, userId));
    }
    retryRun(runId, userId) {
        const run = this.assertRunAccess(runId, userId);
        if (!(0, meeting_state_1.canTransition)(run.status, '处理中')) {
            throw this.badState(`运行处于「${run.status}」，不可重跑（仅「失败」可重跑）`);
        }
        throw this.depNotReady(['D-01', 'T-013'], '断点续跑');
    }
    getDraft(runId, userId) {
        return this.mergeDraft(this.assertRunAccess(runId, userId));
    }
    patchField(runId, fieldId, dto, userId) {
        const owner = this.requireOwner(userId);
        const id = (fieldId ?? '').trim();
        if (!id) {
            throw new common_1.HttpException({ code: 'MEETING_BAD_FIELD', message: 'fieldId 不能为空' }, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.updateRun(runId, owner, (run) => {
            if (run.frozen)
                throw this.badState('运行已定稿冻结，不可再编辑字段（FR-12）');
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
    publishRun(runId, userId) {
        const owner = this.requireOwner(userId);
        return this.updateRun(runId, owner, (run) => {
            if (run.consent.status !== '已通过') {
                throw this.badState(`同意门禁未通过（当前「${run.consent.status}」），不得定稿`);
            }
            if (!(0, meeting_state_1.canTransition)(run.status, '已定稿')) {
                throw this.badState(`运行处于「${run.status}」，不可定稿（仅「待确认」可定稿）`);
            }
            const merged = this.mergeDraft(run);
            const confirmedKeys = new Set((merged.fields ?? [])
                .filter((f) => f.confirmState === '已确认')
                .map((f) => f.key));
            const unconfirmed = (0, meeting_state_1.requiredFieldsOf)(run.meetingType).filter((k) => !confirmedKeys.has(k));
            if (unconfirmed.length) {
                throw new common_1.HttpException({
                    code: 'MEETING_REQUIRED_FIELDS_UNCONFIRMED',
                    message: `模板「${run.meetingType}」尚有必填字段未确认，不得定稿`,
                    unconfirmed,
                }, common_1.HttpStatus.CONFLICT);
            }
            run.status = '已定稿';
            run.frozen = { publishedAt: nowIso(), snapshot: merged };
            this.appendAudit('run.publish', runId, owner, { fields: merged.fields?.length ?? 0 });
            return { ...this.viewOf(run), frozenFields: merged.fields?.length ?? 0 };
        });
    }
    exportRun(runId, format, userId) {
        const run = this.assertRunAccess(runId, userId);
        if (!run.frozen)
            throw this.badState('未定稿版本禁止导出（FR-11）');
        const fmt = (format || 'json').trim().toLowerCase();
        if (!['json', 'markdown', 'md', 'csv', 'html'].includes(fmt)) {
            throw this.depNotReady(['D-01'], `导出格式 ${fmt}`);
        }
        return {
            runId,
            format: fmt,
            publishedAt: run.frozen.publishedAt,
            content: this.renderExport(run.frozen.snapshot, fmt),
            notice: '导出物带内部草稿声明；未发布版本禁止对外分发（FR-11 / Q-13）',
        };
    }
    composeRun(runId, _dto, userId) {
        this.assertRunAccess(runId, userId);
        throw this.depNotReady(['D-01'], '整合稿件合成');
    }
    declareConsent(runId, dto, userId) {
        const owner = this.requireOwner(userId);
        return this.updateRun(runId, owner, (run) => {
            if (!(0, meeting_state_1.canConsentTransition)(run.consent.status, '征集中')) {
                throw this.badState(`同意状态「${run.consent.status}」不可发起告知`);
            }
            const requested = dedupeParticipants(dto.participants);
            const participants = requested.length ? requested : run.participants;
            if (!participants.length) {
                throw new common_1.HttpException({ code: 'MEETING_NO_PARTICIPANTS', message: '待表态参会人清单为空，无法发起告知' }, common_1.HttpStatus.BAD_REQUEST);
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
            run.consent.records.push(...participants.map((p) => ({
                participantId: p,
                decision: 'declare',
                disclosureVersion: version,
                at,
            })));
            run.consent.status = '征集中';
            this.appendAudit('consent.declare', runId, owner, { version, participants });
            return this.consentView(run);
        });
    }
    submitConsentDecisions(runId, dto, userId) {
        const owner = this.requireOwner(userId);
        return this.updateRun(runId, owner, (run) => {
            if (run.consent.status !== '征集中') {
                throw this.badState(`同意状态「${run.consent.status}」不可提交表态（仅「征集中」可提交）`);
            }
            const version = run.consent.disclosure?.version ?? null;
            for (const d of dto.decisions ?? []) {
                const pid = (d?.participantId ?? '').trim();
                if (!pid)
                    continue;
                if (!run.participants.includes(pid)) {
                    throw new common_1.HttpException({ code: 'MEETING_UNKNOWN_PARTICIPANT', message: `参会人 ${pid} 不在待表态清单中` }, common_1.HttpStatus.BAD_REQUEST);
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
    getConsent(runId, userId) {
        return this.consentView(this.assertRunAccess(runId, userId));
    }
    withdrawConsent(runId, dto, userId) {
        const owner = this.requireOwner(userId);
        return this.updateRun(runId, owner, (run) => {
            if (!(0, meeting_state_1.canConsentTransition)(run.consent.status, '已撤回')) {
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
    getConsentAudit(runId, userId) {
        const run = this.assertRunAccess(runId, userId);
        return { runId: run.runId, disclosure: run.consent.disclosure, records: run.consent.records };
    }
    getRetentionPolicy() {
        const raw = this.store.read(POLICY_FILE, null);
        const days = Number(raw?.days);
        if (!Number.isFinite(days) || days < 1 || days > 3650) {
            return { days: exports.DEFAULT_RETENTION_DAYS, source: 'default' };
        }
        return {
            days,
            source: raw?.source === 'admin' ? 'admin' : 'default',
            ...(raw?.updatedBy ? { updatedBy: raw.updatedBy } : {}),
            ...(raw?.updatedAt ? { updatedAt: raw.updatedAt } : {}),
        };
    }
    setRetentionPolicy(dto, userId) {
        const owner = this.requireOwner(userId);
        const policy = {
            days: dto.days,
            source: 'admin',
            updatedBy: owner,
            updatedAt: nowIso(),
        };
        this.store.write(POLICY_FILE, policy);
        this.appendAudit('retention.policy.set', null, owner, { days: dto.days });
        return policy;
    }
    purgeRetention(dto, userId) {
        const owner = this.requireOwner(userId);
        const policy = this.getRetentionPolicy();
        const cutoff = Date.now() - policy.days * 24 * 60 * 60 * 1000;
        const runs = this.loadRuns();
        const targeted = runs.filter((r) => {
            if ((r.ownerId ?? '').trim() !== owner)
                return false;
            if (dto.runIds?.length)
                return dto.runIds.includes(r.runId);
            return new Date(r.createdAt).getTime() < cutoff;
        });
        const counts = { audio: 0, utterances: 0, artifacts: 0, embeddings: 0 };
        const purged = [];
        for (const run of targeted) {
            if (run.audioRef)
                counts.audio += 1;
            counts.utterances += run.draftAi?.fields?.length ?? 0;
            if (run.draftAi)
                counts.artifacts += 1;
            if (!dto.dryRun) {
                run.audioRef = null;
                run.draftAi = null;
                run.updatedAt = nowIso();
            }
            purged.push(run.runId);
        }
        if (!dto.dryRun && targeted.length)
            this.saveRuns(runs);
        const entry = {
            id: `rt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            kind: dto.runIds?.length ? 'user_delete' : 'expire_purge',
            runId: dto.runIds?.length === 1 ? dto.runIds[0] : null,
            counts,
            at: nowIso(),
            actor: owner,
        };
        if (!dto.dryRun) {
            const list = this.store.read(RETENTION_AUDIT_FILE, []);
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
    getRetentionAudit(userId) {
        const owner = this.requireOwner(userId);
        const entries = this.store
            .read(RETENTION_AUDIT_FILE, [])
            .filter((e) => (e.actor ?? '').trim() === owner);
        return { entries };
    }
    ingestDraft(runId, draft, userId) {
        const owner = this.requireOwner(userId);
        return this.updateRun(runId, owner, (run) => {
            if (run.frozen)
                throw this.badState('运行已定稿冻结，不可回写草稿');
            if (run.status === '排队中') {
                if (!(0, meeting_state_1.canTransition)('排队中', '处理中'))
                    throw this.badState('状态机异常：排队中 → 处理中 不可达');
                run.status = '处理中';
            }
            if (!(0, meeting_state_1.canTransition)(run.status, '待确认')) {
                throw this.badState(`运行处于「${run.status}」，不可回写草稿`);
            }
            const fields = Array.isArray(draft?.fields) ? draft.fields : [];
            run.draftAi = {
                fields,
                warnings: Array.isArray(draft?.warnings) ? draft.warnings : [],
                injectionEvents: Array.isArray(draft?.injectionEvents) ? draft.injectionEvents : [],
                truncatedRatio: Number(draft?.truncatedRatio) || 0,
            };
            if (Array.isArray(draft?.detectedLanguages))
                run.detectedLanguages = draft.detectedLanguages;
            run.status = '待确认';
            this.appendAudit('run.ingest-draft', runId, owner, { fields: fields.length });
            return this.mergeDraft(run);
        });
    }
    evaluateConsent(run) {
        const latest = new Map();
        for (const r of run.consent.records) {
            if (r.decision === 'declare' || r.decision === 'withdraw')
                continue;
            latest.set(r.participantId, r.decision);
        }
        if ([...latest.values()].some((v) => v === 'declined'))
            return { status: '已阻断' };
        if (run.participants.every((p) => latest.has(p)))
            return { status: '已通过' };
        return { status: '征集中' };
    }
    consentView(run) {
        const latest = new Map();
        for (const r of run.consent.records) {
            if (r.decision === 'declare' || r.decision === 'withdraw')
                continue;
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
    mergeDraft(run) {
        const base = run.draftAi;
        const fields = (base?.fields ?? []).map((f) => {
            const ov = run.fieldOverlay?.[f.fieldId];
            if (!ov)
                return f;
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
    renderExport(snapshot, fmt) {
        const fields = snapshot?.fields ?? [];
        if (fmt === 'csv') {
            const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            return ['fieldId,key,label,value,sourceState,confirmState']
                .concat(fields.map((f) => [f.fieldId, f.key, f.label, f.value, f.sourceState, f.confirmState].map(esc).join(',')))
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
};
exports.MeetingService = MeetingService;
exports.MeetingService = MeetingService = MeetingService_1 = __decorate([
    (0, common_1.Injectable)()
], MeetingService);
function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
//# sourceMappingURL=meeting.service.js.map