"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FeedbackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackService = exports.FEEDBACK_MAX_FILE_BYTES = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const tasks_service_1 = require("../tasks/tasks.service");
const user_ai_config_service_1 = require("../config/user-ai-config.service");
const backend_root_1 = require("../config/backend-root");
const feedback_schema_1 = require("./feedback.schema");
const feedback_redact_util_1 = require("./feedback-redact.util");
const figma_credential_1 = require("../config/figma-credential");
const DEDUP_WINDOW_MS = 10 * 60 * 1000;
const DAILY_LIMIT = 20;
exports.FEEDBACK_MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXT_BY_MIME = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
};
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_INCLUDES = ['logs', 'models', 'figmaUrl', 'token'];
let FeedbackService = FeedbackService_1 = class FeedbackService {
    feedbackModel;
    tasksService;
    userAiConfigService;
    logger = new common_1.Logger(FeedbackService_1.name);
    constructor(feedbackModel, tasksService, userAiConfigService) {
        this.feedbackModel = feedbackModel;
        this.tasksService = tasksService;
        this.userAiConfigService = userAiConfigService;
    }
    async create(params) {
        const { sessionId, userId } = params;
        if (!sessionId)
            throw new common_1.BadRequestException('缺少 sessionId');
        const status = this.tasksService.getTaskStatus(sessionId, userId);
        if (!status.success || !status.task) {
            const msg = status.error || '任务不存在';
            if (msg === '无权访问此任务')
                throw new common_1.ForbiddenException(msg);
            throw new common_1.NotFoundException(msg);
        }
        const task = status.task;
        const now = Date.now();
        const recent = await this.feedbackModel
            .findOne({ sessionId, userId, createdAt: { $gte: new Date(now - DEDUP_WINDOW_MS) } })
            .select('_id status createdAt')
            .lean();
        if (recent) {
            return {
                success: false,
                duplicate: true,
                message: '该任务 10 分钟内已提交过反馈，管理员处理中；如需补充请直接在处置备注中沟通',
                feedback: { id: String(recent._id), status: recent.status },
            };
        }
        const todayCount = await this.feedbackModel.countDocuments({
            userId,
            createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
        });
        if (todayCount >= DAILY_LIMIT) {
            return { success: false, message: `反馈提交过于频繁（24 小时内上限 ${DAILY_LIMIT} 条）` };
        }
        const includes = this.parseIncludes(params.includes);
        const snapshot = await this.buildSnapshot({ task, userId, includes, logsText: params.logsText, pageUrl: params.pageUrl });
        snapshot.taskImages = this.resolveTaskImages(task);
        const attachment = params.file ? this.saveAttachment(sessionId, params.file) : null;
        const description = (0, feedback_redact_util_1.sanitizeDescription)(params.description);
        if (!description)
            throw new common_1.BadRequestException('请填写反馈描述');
        const doc = await this.feedbackModel.create({
            sessionId,
            userId,
            username: params.username,
            category: this.normalizeCategory(params.category),
            description,
            status: 'pending',
            snapshot,
            attachment,
            source: 'task-detail',
            userAgent: params.userAgent?.slice(0, 300),
        });
        this.logger.log(`反馈已提交: id=${doc._id} sessionId=${sessionId} user=${userId} ` +
            `includes=[${includes.join(',')}] logBytes=${snapshot.logBytes ?? 0} attachment=${attachment ? 'yes' : 'no'}`);
        return {
            success: true,
            feedback: {
                id: String(doc._id),
                sessionId,
                status: 'pending',
                createdAt: doc.createdAt,
            },
        };
    }
    normalizeCategory(raw) {
        const allowed = ['bug', 'quality', 'suggestion', 'other'];
        return raw && allowed.includes(raw) ? raw : 'bug';
    }
    parseIncludes(raw) {
        let list = raw;
        if (typeof raw === 'string') {
            const t = raw.trim();
            if (!t)
                return [];
            try {
                list = JSON.parse(t);
            }
            catch {
                list = t.split(',').map((s) => s.trim());
            }
        }
        if (!Array.isArray(list))
            return [];
        const set = new Set();
        list.forEach((v) => {
            const key = String(v || '').trim();
            if (ALLOWED_INCLUDES.includes(key))
                set.add(key);
        });
        return ALLOWED_INCLUDES.filter((k) => set.has(k));
    }
    async buildSnapshot(args) {
        const { task, userId, includes, logsText, pageUrl } = args;
        const snapshot = {
            taskStatus: task.status,
            target: task.target,
            componentId: task.componentId,
            componentName: task.displayName || task.componentName,
            taskError: task.error ? (0, feedback_redact_util_1.redactTextSecrets)(String(task.error)).slice(0, 4000) : undefined,
            included: includes,
            pageUrl: pageUrl?.slice(0, 500),
        };
        if (includes.includes('models')) {
            snapshot.modelsUsed = this.resolveModelsUsed(task);
        }
        if (includes.includes('figmaUrl')) {
            snapshot.figmaUrl = this.buildFigmaUrl(task);
        }
        if (includes.includes('token')) {
            const credential = await this.resolveCredentialFingerprint(task, userId);
            snapshot.tokenFingerprint = credential.taskFingerprint;
            snapshot.tokenFingerprintSource = credential.source;
            snapshot.tokenFingerprintCurrent = credential.currentFingerprint;
            snapshot.tokenFingerprintChanged = credential.changed;
        }
        if (includes.includes('logs') && typeof logsText === 'string' && logsText.trim()) {
            const cleaned = (0, feedback_redact_util_1.redactTextSecrets)(logsText);
            const truncated = (0, feedback_redact_util_1.truncateLogText)(cleaned);
            snapshot.logExcerpt = truncated.text;
            snapshot.logBytes = truncated.bytes;
            snapshot.logOriginalBytes = truncated.originalBytes;
            snapshot.logTruncated = truncated.truncated;
        }
        return snapshot;
    }
    resolveModelsUsed(task) {
        const used = new Set();
        const cm = task?.completionModels;
        const split = (s) => String(s || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        if (cm) {
            split(cm.visionModel).forEach((m) => used.add(m));
            split(cm.textModel).forEach((m) => used.add(m));
            if (used.size > 0)
                return Array.from(used).slice(0, 10);
        }
        const s = task?.configSnapshot;
        if (!s)
            return [];
        if (s.unifiedModel && s.modelMode === 'unified') {
            used.add(s.unifiedModel);
        }
        else {
            if (s.visionModel)
                used.add(s.visionModel);
            if (s.textModel)
                used.add(s.textModel);
        }
        return Array.from(used).slice(0, 10);
    }
    buildFigmaUrl(task) {
        const fileKey = task?.fileKey;
        const nodeId = task?.nodeId;
        if (!fileKey || !nodeId)
            return undefined;
        const name = encodeURIComponent(task?.componentName || 'design');
        return `https://www.figma.com/design/${fileKey}/${name}?node-id=${String(nodeId).replace(/:/g, '-')}`;
    }
    resolveTaskImages(task) {
        const images = {};
        const baseDir = typeof task?.outputPath === 'string' && task.outputPath ? (0, node_path_1.resolve)(task.outputPath) : '';
        const existsRel = (rel) => {
            if (!baseDir)
                return false;
            try {
                return (0, node_fs_1.existsSync)((0, node_path_1.join)(baseDir, rel));
            }
            catch {
                return false;
            }
        };
        if (baseDir) {
            const input = 'resources/images/mc-preview.png';
            if (existsRel(input))
                images.input = input;
            if (task?.sessionId) {
                const output = `.mc-gen/screenshots/${String(task.sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')}-rendered.png`;
                if (existsRel(output))
                    images.output = output;
            }
        }
        return Object.keys(images).length ? images : undefined;
    }
    async resolveCredentialFingerprint(task, userId) {
        const pipelineFp = typeof task?.figmaCredentialFp === 'string' && task.figmaCredentialFp.trim()
            ? task.figmaCredentialFp.trim()
            : '';
        const createFp = typeof task?.configSnapshot?.[figma_credential_1.FIGMA_CREDENTIAL_FP_FIELD] === 'string'
            ? String(task.configSnapshot[figma_credential_1.FIGMA_CREDENTIAL_FP_FIELD]).trim()
            : '';
        const taskFingerprint = pipelineFp || createFp || undefined;
        const source = pipelineFp ? 'pipeline' : createFp ? 'create' : undefined;
        const currentFingerprint = await this.readCurrentFigmaFingerprint(userId);
        const changed = taskFingerprint && currentFingerprint ? taskFingerprint !== currentFingerprint : undefined;
        return { taskFingerprint, source, currentFingerprint, changed };
    }
    async readCurrentFigmaFingerprint(userId) {
        try {
            const cfg = await this.userAiConfigService.getUserConfig(userId);
            return (0, figma_credential_1.figmaCredentialFpFromConfig)(cfg) ?? undefined;
        }
        catch (error) {
            this.logger.warn(`读取用户 Figma 凭证指纹失败: user=${userId} ${error?.message}`);
            return undefined;
        }
    }
    saveAttachment(sessionId, file) {
        if (!file.buffer?.length)
            throw new common_1.BadRequestException('截图内容为空');
        if (file.buffer.length > exports.FEEDBACK_MAX_FILE_BYTES) {
            throw new common_1.BadRequestException(`截图超过 ${Math.round(exports.FEEDBACK_MAX_FILE_BYTES / 1024 / 1024)}MB`);
        }
        const mime = String(file.mimetype || '').toLowerCase();
        const byMime = IMAGE_EXT_BY_MIME[mime];
        const byName = (0, node_path_1.extname)(String(file.originalname || '')).toLowerCase();
        const ext = byMime || (ALLOWED_IMAGE_EXTS.has(byName) ? byName : '');
        if (!ext) {
            throw new common_1.BadRequestException('截图仅支持 PNG / JPG / WebP');
        }
        const safeSession = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
        const dir = (0, node_path_1.join)(backend_root_1.feedbackAttachmentsDir, safeSession);
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        const storedName = `${Date.now()}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}${ext}`;
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, storedName), file.buffer);
        return {
            filename: String(file.originalname || storedName).slice(0, 200),
            storedName,
            relativePath: (0, node_path_1.join)(safeSession, storedName),
            size: file.buffer.length,
            mimeType: mime || 'application/octet-stream',
        };
    }
    async list(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const filter = {};
        if (query.status && query.status !== 'all')
            filter.status = query.status;
        if (query.category && query.category !== 'all')
            filter.category = query.category;
        if (query.sessionId)
            filter.sessionId = String(query.sessionId).trim();
        if (query.keyword) {
            const kw = String(query.keyword).trim();
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { description: { $regex: escaped, $options: 'i' } },
                { sessionId: { $regex: escaped, $options: 'i' } },
                { username: { $regex: escaped, $options: 'i' } },
                { 'snapshot.componentName': { $regex: escaped, $options: 'i' } },
            ];
        }
        const [list, total, pending, processing, resolved, rejected] = await Promise.all([
            this.feedbackModel
                .find(filter)
                .select('-snapshot.logExcerpt')
                .sort({ createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            this.feedbackModel.countDocuments(filter),
            this.feedbackModel.countDocuments({ status: 'pending' }),
            this.feedbackModel.countDocuments({ status: 'processing' }),
            this.feedbackModel.countDocuments({ status: 'resolved' }),
            this.feedbackModel.countDocuments({ status: 'rejected' }),
        ]);
        return {
            list,
            total,
            counts: { pending, processing, resolved, rejected, all: pending + processing + resolved + rejected },
        };
    }
    async detail(id) {
        this.assertObjectId(id);
        const doc = await this.feedbackModel.findById(id).lean();
        if (!doc)
            throw new common_1.NotFoundException('反馈不存在');
        return doc;
    }
    async updateStatus(id, params) {
        this.assertObjectId(id);
        const { status, adminNote, adminId, adminName } = params;
        const allowed = ['pending', 'processing', 'resolved', 'rejected'];
        if (!allowed.includes(status))
            throw new common_1.BadRequestException(`非法状态: ${status}`);
        const patch = {
            status,
            handledBy: adminId,
            handledByName: adminName,
        };
        if (typeof adminNote === 'string')
            patch.adminNote = (0, feedback_redact_util_1.sanitizeDescription)(adminNote);
        if (status === 'pending') {
            patch.handledAt = null;
            patch.handledBy = null;
            patch.handledByName = null;
        }
        else {
            patch.handledAt = new Date();
        }
        const updated = await this.feedbackModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
        if (!updated)
            throw new common_1.NotFoundException('反馈不存在');
        this.logger.log(`反馈状态更新: id=${id} -> ${status} by=${adminId}`);
        return updated;
    }
    async remove(id) {
        this.assertObjectId(id);
        const doc = await this.feedbackModel.findByIdAndDelete(id).lean();
        if (!doc)
            throw new common_1.NotFoundException('反馈不存在');
        return { success: true };
    }
    async resolveAttachment(id) {
        this.assertObjectId(id);
        const doc = await this.feedbackModel.findById(id).select('attachment').lean();
        if (!doc)
            throw new common_1.NotFoundException('反馈不存在');
        const att = doc.attachment;
        if (!att?.relativePath)
            throw new common_1.NotFoundException('该反馈没有附件');
        const root = (0, node_path_1.resolve)(backend_root_1.feedbackAttachmentsDir);
        const absPath = (0, node_path_1.resolve)(root, att.relativePath);
        if (absPath !== root && !absPath.startsWith(root + node_path_1.sep)) {
            throw new common_1.ForbiddenException('附件路径非法');
        }
        if (!(0, node_fs_1.existsSync)(absPath))
            throw new common_1.NotFoundException('附件文件已丢失');
        return { absPath, filename: att.filename || att.storedName, mimeType: att.mimeType || 'application/octet-stream' };
    }
    assertObjectId(id) {
        if (!(0, mongoose_2.isValidObjectId)(id))
            throw new common_1.BadRequestException('反馈 ID 格式非法');
    }
};
exports.FeedbackService = FeedbackService;
exports.FeedbackService = FeedbackService = FeedbackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(feedback_schema_1.TaskFeedback.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        tasks_service_1.TasksService,
        user_ai_config_service_1.UserAiConfigService])
], FeedbackService);
//# sourceMappingURL=feedback.service.js.map