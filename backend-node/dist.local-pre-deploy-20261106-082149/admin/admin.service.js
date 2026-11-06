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
var AdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const fs_1 = require("fs");
const path_1 = require("path");
const user_schema_1 = require("../schemas/user.schema");
const component_schema_1 = require("../schemas/component.schema");
const user_ai_config_service_1 = require("../config/user-ai-config.service");
const component_service_1 = require("../component/component.service");
const permission_adapter_interface_1 = require("../auth/permission-adapter.interface");
const admin_role_util_1 = require("./admin-role.util");
const constants_1 = require("../common/constants");
const quota_service_1 = require("../quota/quota.service");
const backend_root_1 = require("../config/backend-root");
const usage_export_1 = require("./usage-export");
const usage_export_io_1 = require("./usage-export-io");
const SECRET_FIELDS = [
    'textApiKey',
    'visionApiKey',
    'unifiedApiKey',
    'figmaToken',
    'apifoxToken',
];
const PLAIN_FIELDS = [
    'textBaseURL',
    'textModel',
    'textProviderType',
    'textTemperature',
    'visionBaseURL',
    'visionModel',
    'visionProviderType',
    'visionTemperature',
    'unifiedBaseURL',
    'unifiedModel',
    'unifiedProviderType',
    'unifiedTemperature',
    'modelMode',
    'requestConcurrency',
    'requestQueueTimeoutMs',
    'requestTimeoutMs',
    'requestMaxRetries',
];
function maskSecret(value) {
    if (!value || typeof value !== 'string' || !value.trim())
        return null;
    const v = value.trim();
    if (v.length <= 8)
        return '****';
    return `${v.slice(0, 6)}****${v.slice(-4)}`;
}
function collectMaskedSecrets(cfg) {
    const secrets = {};
    SECRET_FIELDS.forEach((f) => {
        secrets[f] = maskSecret(cfg[f]);
    });
    secrets.figmaTokens = Array.isArray(cfg.figmaTokens)
        ? cfg.figmaTokens.map((t) => ({
            id: t?.id,
            name: t?.name,
            token: maskSecret(t?.token),
            active: !!t?.id && t.id === cfg.activeFigmaTokenId,
        }))
        : [];
    return secrets;
}
const EMPTY_STATS = {
    componentCount: 0,
    taskCount: 0,
    apiTaskCount: 0,
    apiCount: 0,
    componentByType: {},
    durationSampleCount: 0,
    durationP50Ms: null,
    durationP90Ms: null,
    durationMs: [],
    usedTextModels: {},
    usedVisionModels: {},
};
function emptyStats() {
    return { ...EMPTY_STATS, componentByType: {}, durationMs: [], usedTextModels: {}, usedVisionModels: {} };
}
function freezeUserDuration(st) {
    st.durationSampleCount = st.durationMs.length;
    st.durationP50Ms = (0, usage_export_1.percentileMs)(st.durationMs, 50);
    st.durationP90Ms = (0, usage_export_1.percentileMs)(st.durationMs, 90);
    return st;
}
let AdminService = AdminService_1 = class AdminService {
    userAiConfigService;
    componentService;
    permissionAdapter;
    userModel;
    quotaService;
    groupModel;
    groupMemberModel;
    joinRequestModel;
    gitCredentialModel;
    documentModel;
    sessionModel;
    projectModel;
    skillModel;
    docModel;
    componentModel;
    logger = new common_1.Logger(AdminService_1.name);
    constructor(userAiConfigService, componentService, permissionAdapter, userModel, quotaService, groupModel, groupMemberModel, joinRequestModel, gitCredentialModel, documentModel, sessionModel, projectModel, skillModel, docModel, componentModel) {
        this.userAiConfigService = userAiConfigService;
        this.componentService = componentService;
        this.permissionAdapter = permissionAdapter;
        this.userModel = userModel;
        this.quotaService = quotaService;
        this.groupModel = groupModel;
        this.groupMemberModel = groupMemberModel;
        this.joinRequestModel = joinRequestModel;
        this.gitCredentialModel = gitCredentialModel;
        this.documentModel = documentModel;
        this.sessionModel = sessionModel;
        this.projectModel = projectModel;
        this.skillModel = skillModel;
        this.docModel = docModel;
        this.componentModel = componentModel;
    }
    async assertAdmin(userId) {
        const user = await this.userModel.findById(userId).lean().exec();
        if (!user)
            throw new common_1.ForbiddenException('仅管理员可访问管理后台');
        const uid = user?.uid || user?.portalInfo?.uid || '';
        const { role } = await this.permissionAdapter.getUserPermissions(userId);
        const resolved = (0, admin_role_util_1.resolveAdminRole)({
            isAdminFlag: !!user.isAdmin,
            permissionRole: role,
            userUid: uid,
            defaultAdminUids: (process.env.DEFAULT_ADMIN_UIDS || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            permissionSource: process.env.PERMISSION_SOURCE || 'node',
        });
        if (resolved !== constants_1.ROLES.ADMIN) {
            throw new common_1.ForbiddenException('仅管理员可访问管理后台');
        }
    }
    async setUserAdmin(id, isAdmin) {
        const res = await this.userModel
            .updateOne({ _id: id }, { $set: { isAdmin: !!isAdmin } })
            .exec();
        if (res.matchedCount === 0)
            throw new common_1.NotFoundException('用户不存在');
    }
    async listUserConfigs() {
        const docs = await this.userAiConfigService.findAll();
        const userIds = docs.map((d) => d.userId.toString());
        const users = await this.userModel
            .find({ _id: { $in: userIds } })
            .lean()
            .exec();
        const userMap = new Map();
        users.forEach((u) => userMap.set(u._id.toString(), {
            username: u.username,
            uid: u.portalInfo?.uid || '',
            displayName: u.portalInfo?.name || u.username,
        }));
        return docs
            .map((d) => {
            const userId = d.userId.toString();
            const u = userMap.get(userId) || { username: userId, uid: '', displayName: userId };
            const cfg = d.config || {};
            const masked = { secrets: collectMaskedSecrets(cfg), plain: {} };
            PLAIN_FIELDS.forEach((f) => {
                if (cfg[f] !== undefined && cfg[f] !== null && cfg[f] !== '')
                    masked.plain[f] = cfg[f];
            });
            return {
                userId,
                username: u.username,
                displayName: u.displayName,
                uid: u.uid,
                updatedAt: d.updatedAt,
                config: masked,
            };
        })
            .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    }
    async listUsers() {
        const users = await this.userModel.find().sort({ createdAt: -1 }).lean().exec();
        const configDocs = await this.userAiConfigService.findAll();
        const configMap = new Map();
        configDocs.forEach((c) => configMap.set(c.userId.toString(), c.config || {}));
        const statsMap = await this.listUserStats();
        return users
            .map((u) => {
            const id = u._id.toString();
            const portal = u.portalInfo || {};
            const cfg = configMap.get(id) || null;
            const secrets = {};
            const plain = {};
            if (cfg) {
                Object.assign(secrets, collectMaskedSecrets(cfg));
                PLAIN_FIELDS.forEach((f) => {
                    if (cfg[f] !== undefined && cfg[f] !== null && cfg[f] !== '')
                        plain[f] = cfg[f];
                });
            }
            const uid = u.uid || portal.uid || '';
            const st = (() => {
                const candidates = [id, uid].filter(Boolean);
                const merged = emptyStats();
                for (const k of candidates) {
                    const v = statsMap[k];
                    if (v) {
                        merged.componentCount += v.componentCount;
                        merged.taskCount += v.taskCount;
                        merged.apiTaskCount += v.apiTaskCount;
                        merged.apiCount += v.apiCount;
                        for (const [t, n] of Object.entries(v.componentByType || {})) {
                            merged.componentByType[t] = (merged.componentByType[t] || 0) + (n || 0);
                        }
                        if (v.durationMs?.length)
                            merged.durationMs.push(...v.durationMs);
                        for (const [m, c] of Object.entries(v.usedTextModels || {})) {
                            merged.usedTextModels[m] = (merged.usedTextModels[m] || 0) + (c || 0);
                        }
                        for (const [m, c] of Object.entries(v.usedVisionModels || {})) {
                            merged.usedVisionModels[m] = (merged.usedVisionModels[m] || 0) + (c || 0);
                        }
                    }
                }
                return freezeUserDuration(merged);
            })();
            const configProviders = [];
            const configModels = [];
            if (cfg) {
                const providers = Array.isArray(cfg.providers) ? cfg.providers : [];
                for (const p of providers) {
                    configProviders.push({
                        id: p.id,
                        name: p.name || p.id,
                        model: p.model || '',
                        baseURL: p.baseURL || '',
                        role: p.role || 'both',
                        providerType: p.providerType || 'auto',
                        apiKey: maskSecret(p.apiKey),
                    });
                }
                const models = Array.isArray(cfg.models) ? cfg.models : [];
                for (const m of models) {
                    configModels.push({
                        id: m.id,
                        name: m.name || m.id,
                        model: m.model || '',
                        baseURL: m.baseURL || '',
                        role: m.role || 'both',
                        providerType: m.providerType || 'auto',
                        apiKey: maskSecret(m.apiKey),
                    });
                }
            }
            return {
                id,
                uid,
                username: u.username,
                name: portal.name || portal.fullName || u.username,
                fullName: portal.fullName || '',
                deptName: portal.deptName || '',
                orgName: portal.orgName || '',
                source: portal.uid ? 'qs' : 'local',
                isAdmin: !!u.isAdmin,
                hasConfig: !!cfg,
                componentCount: st.componentCount,
                componentByType: st.componentByType,
                taskCount: st.taskCount,
                apiTaskCount: st.apiTaskCount,
                apiCount: st.apiCount,
                durationSampleCount: st.durationSampleCount,
                durationP50Ms: st.durationP50Ms,
                durationP90Ms: st.durationP90Ms,
                usedTextModels: st.usedTextModels,
                usedVisionModels: st.usedVisionModels,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
                config: cfg ? { secrets, plain } : null,
                configProviders,
                configModels,
            };
        })
            .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    }
    async listUserStats() {
        const stats = {};
        const ensure = (key) => (stats[key] ||= emptyStats());
        try {
            const rows = await this.componentModel
                .aggregate([
                { $group: { _id: { c: '$creatorId', t: '$target' }, n: { $sum: 1 } } },
            ])
                .exec();
            for (const r of rows) {
                const owner = r?._id?.c;
                if (!owner)
                    continue;
                const st = ensure(String(owner));
                const n = r.n || 0;
                st.componentCount += n;
                const t = r?._id?.t || 'unlabeled';
                st.componentByType[t] = (st.componentByType[t] || 0) + n;
            }
        }
        catch (err) {
            this.logger.warn(`[listUserStats] components 聚合失败: ${err.message}`);
        }
        try {
            const tasks = await (0, usage_export_io_1.loadSlimComponentTasks)();
            for (const t of tasks) {
                if (!t?.userId)
                    continue;
                if (t.taskType === 'component' || t.taskType === undefined || t.taskType === null) {
                    const st = ensure(String(t.userId));
                    st.taskCount += 1;
                    const d = Number(t.duration);
                    if (Number.isFinite(d) && d > 0)
                        st.durationMs.push(d);
                    if (t.textModel) {
                        st.usedTextModels[t.textModel] = (st.usedTextModels[t.textModel] || 0) + 1;
                    }
                    if (t.visionModel) {
                        st.usedVisionModels[t.visionModel] = (st.usedVisionModels[t.visionModel] || 0) + 1;
                    }
                }
            }
        }
        catch (err) {
            this.logger.warn(`[listUserStats] tasks.json 读取失败: ${err.message}`);
        }
        try {
            const aPath = (0, path_1.join)(backend_root_1.dataDir, 'apifox-tasks.json');
            if ((0, fs_1.existsSync)(aPath)) {
                const list = JSON.parse((0, fs_1.readFileSync)(aPath, 'utf-8'));
                if (Array.isArray(list)) {
                    for (const t of list) {
                        if (!t?.ownerId)
                            continue;
                        const st = ensure(String(t.ownerId));
                        st.apiTaskCount += 1;
                        const n = Number(t.apiCount);
                        if (Number.isFinite(n) && n > 0)
                            st.apiCount += n;
                    }
                }
            }
        }
        catch (err) {
            this.logger.warn(`[listUserStats] apifox-tasks.json 读取失败: ${err.message}`);
        }
        for (const st of Object.values(stats))
            freezeUserDuration(st);
        return stats;
    }
    async buildUsageExport(query) {
        let preset;
        try {
            preset = (0, usage_export_1.normalizePreset)(query.preset);
        }
        catch (e) {
            throw new common_1.BadRequestException(e.message);
        }
        let windows;
        try {
            windows = (0, usage_export_1.resolveWindows)({
                preset,
                from: query.from,
                to: query.to,
            });
        }
        catch (e) {
            throw new common_1.BadRequestException(e.message);
        }
        const deptFilter = String(query.dept || '').trim() || null;
        const format = String(query.format || 'md').toLowerCase() === 'html' ? 'html' : 'md';
        const [users, componentTasks] = await Promise.all([
            this.userModel.find().select('_id uid username portalInfo').lean().exec(),
            (0, usage_export_io_1.loadSlimComponentTasks)(),
        ]);
        const apiTasks = (0, usage_export_io_1.loadSlimApiTasks)();
        const agg = (0, usage_export_1.aggregateUsage)({
            componentTasks,
            apiTasks,
            userIndex: (0, usage_export_1.buildUserIndex)(users),
            current: windows.current,
            previous: windows.previous,
            deptFilter,
        });
        const report = (0, usage_export_1.buildReport)({
            preset,
            deptFilter,
            current: windows.current,
            previous: windows.previous,
            agg,
        });
        const body = format === 'html' ? (0, usage_export_1.renderHtml)(report) : (0, usage_export_1.renderMarkdown)(report);
        return {
            filename: (0, usage_export_1.exportFilename)(report, format),
            contentType: format === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8',
            body,
        };
    }
    async listComponents(query) {
        return this.componentService.listComponents(query, undefined);
    }
    async deleteUser(operatorId, targetId) {
        if (operatorId === targetId) {
            throw new common_1.BadRequestException('不能删除自己的账号');
        }
        const target = await this.userModel.findById(targetId).lean().exec();
        if (!target)
            throw new common_1.NotFoundException('目标用户不存在');
        const adminCount = await this.userModel.countDocuments({ isAdmin: true }).exec();
        if (adminCount <= 1 && target.isAdmin) {
            throw new common_1.BadRequestException('不能删除唯一的管理员账号');
        }
        const targetOid = new mongoose_2.Types.ObjectId(targetId);
        const cleaned = [];
        let deletedComponents = 0;
        try {
            const components = await this.componentService['componentModel']
                .find({ creatorId: targetOid })
                .select('_id')
                .lean()
                .exec();
            for (const comp of components) {
                try {
                    await this.componentService.deleteComponent(comp._id.toString(), operatorId);
                    deletedComponents++;
                }
                catch (e) {
                    this.logger.warn(`[deleteUser] 组件 ${comp._id} 删除失败: ${e.message}`);
                }
            }
            if (deletedComponents > 0)
                cleaned.push(`components(${deletedComponents})`);
        }
        catch (e) {
            this.logger.warn(`[deleteUser] 清理组件失败: ${e.message}`);
        }
        try {
            const r = await this.userAiConfigService['model'].updateOne({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('ai-config');
        }
        catch (e) { }
        try {
            const r = await this.groupMemberModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('group-members');
        }
        catch (e) { }
        try {
            const r = await this.groupModel.updateMany({ adminId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('groups');
        }
        catch (e) { }
        try {
            const r = await this.joinRequestModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('join-requests');
        }
        catch (e) { }
        try {
            const r = await this.gitCredentialModel.updateOne({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('git-credential');
        }
        catch (e) { }
        try {
            await this.documentModel.updateMany({ 'sharedUsers.userId': targetOid }, { $pull: { sharedUsers: { userId: targetOid } } });
            const r = await this.documentModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('documents');
        }
        catch (e) { }
        try {
            const r = await this.sessionModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push('sessions');
        }
        catch (e) { }
        try {
            await this.projectModel.updateMany({ adminUserIds: targetOid }, { $pull: { adminUserIds: targetOid } });
            const orphanProjects = await this.projectModel.find({
                $or: [
                    { adminUserIds: { $size: 0 } },
                    { adminUserIds: { $exists: false } },
                ],
            }).select('_id').lean();
            if (orphanProjects.length > 0) {
                const ids = orphanProjects.map((p) => p._id);
                const r = await this.projectModel.updateMany({ _id: { $in: ids } }, { $set: { deleted: true } });
                cleaned.push(`projects(${r.modifiedCount})`);
            }
        }
        catch (e) { }
        try {
            const r = await this.skillModel.updateMany({ ownerUserId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push(`skills(${r.modifiedCount})`);
            await this.skillModel.updateMany({ reviewedBy: targetOid }, { $unset: { reviewedBy: 1 } });
        }
        catch (e) { }
        try {
            const r = await this.docModel.updateMany({ ownerId: targetOid }, { $set: { deleted: true } });
            if (r.modifiedCount > 0)
                cleaned.push(`workspace-docs(${r.modifiedCount})`);
        }
        catch (e) { }
        try {
            this.quotaService.userQuotas?.delete(targetId);
        }
        catch (e) { }
        await this.userModel.findByIdAndUpdate(targetId, { $set: { deleted: true } });
        this.logger.log(`[deleteUser] 已删除用户 ${target.username}(${targetId})，` +
            `级联清理: [${cleaned.join(', ')}], 组件: ${deletedComponents}`);
        return { deletedComponents, cleanedCollections: cleaned };
    }
    async buildDeptReport() {
        const deptMap = {
            '高速调度组': '软件研发中心',
            '数智营运组': '软件研发中心',
            '公路云控组': '软件研发中心',
            '出行服务线': '软件研发中心',
            '高速安管组': '软件研发中心',
            '高速服务组': '软件研发中心',
            '数智业务线': '软件研发中心',
            '政务业务线': '软件研发中心',
            '高速业务线': '软件研发中心',
            '主动管控组': '软件研发中心',
            '项目二组': '软件研发中心',
            '交通重货组': '软件研发中心',
            '出行渠道组': '软件研发中心',
            '数智服务组': '软件研发中心',
            '执法交警组': '软件研发中心',
            '项目一组': '软件研发中心',
            '出行客服组': '软件研发中心',
            '数智运营部': '软件研发中心',
            '综管研发一组': '综管事业部',
            '综管研发二组': '综管事业部',
            '综管研发三组': '综管事业部',
            '综管研发四组': '综管事业部',
            '平台研发部(视频)': '视频事业部',
            '基础研发部(视频)': '视频事业部',
            '桥隧研发部': '桥隧事业部',
            '基础研发部': '基础研发部',
            '技术研发部': '基础研发部',
            '产品部': '基础研发部',
            'OA部': '基础研发部',
            '前端部': '基础研发部',
            '收费系统研发部': '收费事业部',
            '结算系统研发部': '收费事业部',
            '养护运维技术研发部': '养护运维事业部',
        };
        const excludeUids = ['luguanyua'];
        const now = new Date();
        const [users, components] = await Promise.all([
            this.userModel.find().select('uid username portalInfo').lean().exec(),
            this.componentModel.find().select('userId createdBy').lean().exec(),
        ]);
        const userComponentCount = {};
        components.forEach((c) => {
            const uid = c.userId || c.createdBy;
            if (uid) {
                userComponentCount[String(uid)] = (userComponentCount[String(uid)] || 0) + 1;
            }
        });
        const deptStats = {};
        let totalReg = 0, totalGen = 0, totalComp = 0;
        users.forEach((u) => {
            const uid = u.uid || u.username;
            if (excludeUids.includes(uid))
                return;
            const pi = u.portalInfo || {};
            const deptName = (pi.deptName || '').trim() || '(未分组)';
            const level1Dept = deptMap[deptName] || null;
            if (!level1Dept)
                return;
            if (!deptStats[level1Dept]) {
                deptStats[level1Dept] = { registered: 0, generated: 0, components: 0 };
            }
            deptStats[level1Dept].registered++;
            totalReg++;
            const compCount = userComponentCount[uid] || userComponentCount[String(u._id)] || 0;
            if (compCount > 0) {
                deptStats[level1Dept].generated++;
                totalGen++;
            }
            deptStats[level1Dept].components += compCount;
            totalComp += compCount;
        });
        const formatDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
        const dateRange = `9月7日~${formatDate(now)}`;
        const deptRows = Object.keys(deptStats)
            .sort()
            .map((dept) => {
            const s = deptStats[dept];
            return `    <tr>
      <td valign="middle" class="td4">
        <p class="p5"><span class="s10">${dept}</span></p>
      </td>
      <td valign="middle" class="td5">
        <p class="p6"><span class="s10">${s.registered}</span></p>
      </td>
      <td valign="middle" class="td5">
        <p class="p6"><span class="s10">${s.generated}</span></p>
      </td>
      <td valign="middle" class="td5">
        <p class="p6"><span class="s10">${s.components}</span></p>
      </td>
    </tr>`;
        })
            .join('\n');
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta http-equiv="Content-Style-Type" content="text/css">
  <title>感智晓界用户统计报表</title>
  <style type="text/css">
    :root {
        --bg-page: #F0F2F5;
        --bg-card: #FFFFFF;
        --bg-thead: #FAFAFA;
        --text-primary: #1A1A2E;
        --text-secondary: #8C8C8C;
        --text-table: #333333;
        --color-danger: #E74C3C;
        --border-row: #F0F0F0;
        --radius-card: 8px;
        --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    * { box-sizing: border-box; }

    body {
        background-color: var(--bg-page);
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
        padding: 32px 16px 48px;
        margin: 0 auto;
        max-width: 1200px;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
    }

    p.p3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 16px 0;
        padding-left: 14px;
        position: relative;
    }
    p.p3::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 18px;
        border-radius: 2px;
        background: var(--color-danger);
    }

    table.t1 {
        border-collapse: collapse;
        width: 100%;
        background: var(--bg-card);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-card);
        overflow: hidden;
        margin-bottom: 24px;
    }

    td.td1, td.td2, td.td3 {
        background-color: var(--bg-thead);
        color: var(--text-table);
        font-weight: 600;
        font-size: 14px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-row);
        text-align: left;
    }

    td.td4, td.td5, td.td6, td.td7 {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-row);
        font-size: 14px;
        color: var(--text-table);
        text-align: left;
        font-variant-numeric: tabular-nums;
    }

    td.td10, td.td11 {
      background-color: var(--bg-thead);
      font-weight: 700;
      padding: 12px 16px;
      font-size: 14px;
      color: var(--text-primary);
      text-align: left;
      font-variant-numeric: tabular-nums;
    }

    p.p1, p.p4, p.p5, p.p6 {
        margin: 0;
        font-size: 14px;
        font-weight: 400;
        color: var(--text-table);
    }
    p.p1 { font-weight: 700; color: var(--text-primary); }
    p.p4 { font-weight: 600; color: var(--text-table); }

    span.s9 { background: transparent; font-size: 16px; font-weight: 700; }
    span.s10, span.s11 { background: transparent; }

    table.t1 tbody tr:hover td {
        background-color: #F5F7FA;
    }
    table.t1 tbody tr:last-child:hover td.td10,
    table.t1 tbody tr:last-child:hover td.td11 {
        background-color: #ECEEF2;
    }

    @media (max-width: 720px) {
        body { padding: 16px 12px 32px; }
        table.t1 { font-size: 13px; }
        td.td1, td.td2, td.td3,
        td.td4, td.td5, td.td6, td.td7,
        td.td10, td.td11 {
            padding: 10px 12px;
        }
    }

    @media print {
        body { background: #fff; padding: 0; }
        table.t1 { box-shadow: none; border: 1px solid #e5e7eb; }
        table.t1 tbody tr:hover td { background: transparent; }
    }
  </style>
</head>
<body>
<p class="p3"><span class="s9"><b>感智｜晓界工坊 · 使用情况 ${dateRange}</b></span></p>
<table cellspacing="0" cellpadding="0" class="t1">
  <tbody>
    <tr>
      <td valign="middle" class="td1">
        <p class="p4"><span class="s10">一级部门</span></p>
      </td>
      <td valign="middle" class="td1">
        <p class="p4"><span class="s10">注册人数</span></p>
      </td>
      <td valign="middle" class="td2">
        <p class="p4"><span class="s10">使用人数</span></p>
      </td>
      <td valign="middle" class="td3">
        <p class="p4"><span class="s10">组件总数</span></p>
      </td>
    </tr>
${deptRows}
    <tr>
      <td valign="middle" class="td10">
        <p class="p1"><span class="s11"><b>合计</b></span></p>
      </td>
      <td valign="middle" class="td11">
        <p class="p6"><span class="s10"><b>${totalReg}</b></span></p>
      </td>
      <td valign="middle" class="td11">
        <p class="p6"><span class="s10"><b>${totalGen}</b></span></p>
      </td>
      <td valign="middle" class="td11">
        <p class="p6"><span class="s10"><b>${totalComp}</b></span></p>
      </td>
    </tr>
  </tbody>
</table>
<p style="text-align: center; font-size: 12px; color: #999; margin-top: 16px;">
  数据来源：生产 MongoDB 实时查询 | 生成时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
</p>
</body>
</html>`;
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        return {
            filename: `感智晓界用户统计报表-${dateStr}.html`,
            contentType: 'text/html; charset=utf-8',
            body: html,
        };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = AdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(5, (0, mongoose_1.InjectModel)('Group')),
    __param(6, (0, mongoose_1.InjectModel)('GroupMember')),
    __param(7, (0, mongoose_1.InjectModel)('JoinRequest')),
    __param(8, (0, mongoose_1.InjectModel)('AiGitCredential')),
    __param(9, (0, mongoose_1.InjectModel)('AiDocument')),
    __param(10, (0, mongoose_1.InjectModel)('AiSession')),
    __param(11, (0, mongoose_1.InjectModel)('AiProject')),
    __param(12, (0, mongoose_1.InjectModel)('AiSkill')),
    __param(13, (0, mongoose_1.InjectModel)('Document')),
    __param(14, (0, mongoose_1.InjectModel)(component_schema_1.Component.name)),
    __metadata("design:paramtypes", [user_ai_config_service_1.UserAiConfigService,
        component_service_1.ComponentService,
        permission_adapter_interface_1.PermissionAdapter,
        mongoose_2.Model,
        quota_service_1.QuotaService,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], AdminService);
//# sourceMappingURL=admin.service.js.map