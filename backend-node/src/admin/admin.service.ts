import { ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { User, UserDocument } from '../schemas/user.schema';
import { Component, ComponentDocument } from '../schemas/component.schema';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { ComponentService } from '../component/component.service';
import { PermissionAdapter } from '../auth/permission-adapter.interface';
import { resolveAdminRole } from './admin-role.util';
import { ROLES } from '../common/constants';
import { QuotaService } from '../quota/quota.service';
import { dataDir } from '../config/backend-root';
import {
  UsagePreset,
  normalizePreset,
  resolveWindows,
  aggregateUsage,
  buildUserIndex,
  buildReport,
  renderHtml,
  renderMarkdown,
  exportFilename,
  percentileMs,
} from './usage-export';
import { loadSlimComponentTasks, loadSlimApiTasks } from './usage-export-io';

/** 密钥类字段：admin 视图中脱敏展示，不暴露明文 */
const SECRET_FIELDS = [
  'textApiKey',
  'visionApiKey',
  'unifiedApiKey',
  'figmaToken',
  'apifoxToken',
];

/** 非密钥但有价值的配置项：明文展示 */
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

function maskSecret(value?: string): string | null {
  if (!value || typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (v.length <= 8) return '****';
  return `${v.slice(0, 6)}****${v.slice(-4)}`;
}

/** 用户生成统计（用户管理抽屉展示用），Java AdminUserVO 同构字段 */
export interface UserStat {
  /** 组件库中该用户创建的组件数 */
  componentCount: number;
  /** 组件生成任务数（taskType=component） */
  taskCount: number;
  /** Apifox 接口生成批数 */
  apiTaskCount: number;
  /** Apifox 接口生成接口总数 */
  apiCount: number;
  /**
   * 组件类型构成：`components.target` → 数量（`microcode` / `vue3` / `unlabeled`）。
   * 供用户管理抽屉「组件构成」下钻展示（这个人开发的各类型组件分别几个）。
   * 维度取 schema 的 `target`（注释即「组件目标类型」）——componentId 前缀**不可靠**
   * （实测 `c-env-monitor` 会被误切成 `c-env`），schema 亦无品类字段。
   */
  componentByType: Record<string, number>;
  /** 有墙钟耗时的组件任务数（≤ taskCount；进行中无 endTime 的不计入） */
  durationSampleCount: number;
  /** 组件任务墙钟 p50（含排队），毫秒 */
  durationP50Ms: number | null;
  /** 组件任务墙钟 p90（含排队），毫秒 */
  durationP90Ms: number | null;
  /** 原始样本，供 id/uid 两键合并后重算分位 */
  durationMs: number[];
  /** 用户实际使用的文本模型统计（模型名 → 使用次数） */
  usedTextModels: Record<string, number>;
  /** 用户实际使用的视觉模型统计（模型名 → 使用次数） */
  usedVisionModels: Record<string, number>;
}

const EMPTY_STATS: UserStat = {
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

/**
 * 构造一份**独立可变**的空统计。
 *
 * ⚠️ 不可直接用 `{ ...EMPTY_STATS }`：`componentByType` 是对象，浅拷贝会让所有
 * 用户共享同一个可变对象 → 统计互相串号。凡需要独立副本处一律走本函数。
 */
function emptyStats(): UserStat {
  return { ...EMPTY_STATS, componentByType: {}, durationMs: [], usedTextModels: {}, usedVisionModels: {} };
}

function freezeUserDuration(st: UserStat): UserStat {
  st.durationSampleCount = st.durationMs.length;
  st.durationP50Ms = percentileMs(st.durationMs, 50);
  st.durationP90Ms = percentileMs(st.durationMs, 90);
  return st;
}

/**
 * 管理后台只读服务。
 * - 鉴权：调用方必须是 admin 角色（由 PermissionAdapter 判定，兼容 QS 门户码 / 本地 GroupMember）。
 * - 数据：跨用户聚合「每用户 AI/API 配置」与「全量生成组件」，只读。
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly userAiConfigService: UserAiConfigService,
    private readonly componentService: ComponentService,
    private readonly permissionAdapter: PermissionAdapter,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly quotaService: QuotaService,
    @InjectModel('Group') private readonly groupModel: Model<any>,
    @InjectModel('GroupMember') private readonly groupMemberModel: Model<any>,
    @InjectModel('JoinRequest') private readonly joinRequestModel: Model<any>,
    @InjectModel('AiGitCredential') private readonly gitCredentialModel: Model<any>,
    @InjectModel('AiDocument') private readonly documentModel: Model<any>,
    @InjectModel('AiSession') private readonly sessionModel: Model<any>,
    @InjectModel('AiProject') private readonly projectModel: Model<any>,
    @InjectModel('AiSkill') private readonly skillModel: Model<any>,
    @InjectModel('Document') private readonly docModel: Model<any>,
    @InjectModel(Component.name) private readonly componentModel: Model<ComponentDocument>,
  ) {}

  /** 校验调用方为 admin，否则抛 403 */
  async assertAdmin(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) throw new ForbiddenException('仅管理员可访问管理后台');
    const uid = (user as any)?.uid || (user as any)?.portalInfo?.uid || '';
    const { role } = await this.permissionAdapter.getUserPermissions(userId);
    const resolved = resolveAdminRole({
      isAdminFlag: !!(user as any).isAdmin,
      permissionRole: role,
      userUid: uid,
      defaultAdminUids: (process.env.DEFAULT_ADMIN_UIDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      permissionSource: process.env.PERMISSION_SOURCE || 'node',
    });
    if (resolved !== ROLES.ADMIN) {
      throw new ForbiddenException('仅管理员可访问管理后台');
    }
  }

  /**
   * 动态设置某用户的管理员标志（仅现有管理员可调用，由 controller 的 assertAdmin 把关）。
   * @param id 用户 _id
   * @param isAdmin 是否设为管理员
   */
  async setUserAdmin(id: string, isAdmin: boolean): Promise<void> {
    const res = await this.userModel
      .updateOne({ _id: id }, { $set: { isAdmin: !!isAdmin } })
      .exec();
    if (res.matchedCount === 0) throw new NotFoundException('用户不存在');
  }

  /** 聚合所有用户的 AI/API 配置（密钥脱敏），按用户名排序 */
  async listUserConfigs(): Promise<any[]> {
    const docs = await this.userAiConfigService.findAll();
    const userIds = docs.map((d) => (d.userId as any).toString());
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .lean()
      .exec();
    const userMap = new Map<string, any>();
    users.forEach((u) =>
      userMap.set((u._id as any).toString(), {
        username: u.username,
        uid: (u as any).portalInfo?.uid || '',
        displayName: (u as any).portalInfo?.name || u.username,
      }),
    );

    return docs
      .map((d) => {
        const userId = (d.userId as any).toString();
        const u = userMap.get(userId) || { username: userId, uid: '', displayName: userId };
        const cfg = (d as any).config || {};
        const masked: Record<string, any> = { secrets: {}, plain: {} };
        SECRET_FIELDS.forEach((f) => {
          masked.secrets[f] = maskSecret(cfg[f]);
        });
        PLAIN_FIELDS.forEach((f) => {
          if (cfg[f] !== undefined && cfg[f] !== null && cfg[f] !== '')
            masked.plain[f] = cfg[f];
        });
        return {
          userId,
          username: u.username,
          displayName: u.displayName,
          uid: u.uid,
          updatedAt: (d as any).updatedAt,
          config: masked,
        };
      })
      .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }

  /** 所有用户（含配置信息，密钥脱敏）；isAdmin 标志可用于界面动态设置管理员 */
  async listUsers(): Promise<any[]> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).lean().exec();
    const configDocs = await this.userAiConfigService.findAll();
    const configMap = new Map<string, Record<string, any>>();
    configDocs.forEach((c) =>
      configMap.set((c.userId as any).toString(), (c as any).config || {}),
    );
    const statsMap = await this.listUserStats();

    return users
      .map((u: any) => {
        const id = u._id.toString();
        const portal = u.portalInfo || {};
        const cfg = configMap.get(id) || null;
        const secrets: Record<string, any> = {};
        const plain: Record<string, any> = {};
        if (cfg) {
          SECRET_FIELDS.forEach((f) => {
            secrets[f] = maskSecret(cfg[f]);
          });
          PLAIN_FIELDS.forEach((f) => {
            if (cfg[f] !== undefined && cfg[f] !== null && cfg[f] !== '') plain[f] = cfg[f];
          });
        }
        const uid = u.uid || portal.uid || '';
        // 🛡️ 2026-09-09 修复：生产实测发现 components.creatorId 同时存在 ObjectId 与字符串两种存储形态
        // （旧版 auth 流以 portal UID / username 写入，新版才落 Mongo _id.toString()），
        // listUserStats 聚合时按 String(_id) 归一化到 hex / 字符串两种键——若仅按 u._id.toString() 查，
        // 走老流程入库的整批组件会全部丢失，统计永远 0（如 zhjie 的场景）。
        // 修法：按 id + uid 两个候选键求和聚合 statsMap（同一用户的两路数据互不重叠，可加性合并）。
        const st: UserStat = (() => {
          const candidates = [id, uid].filter(Boolean);
          const merged: UserStat = emptyStats();
          for (const k of candidates) {
            const v = statsMap[k];
            if (v) {
              merged.componentCount += v.componentCount;
              merged.taskCount += v.taskCount;
              merged.apiTaskCount += v.apiTaskCount;
              merged.apiCount += v.apiCount;
              // 类型构成同样按候选键相加（两路数据互不重叠，可加性合并）
              for (const [t, n] of Object.entries(v.componentByType || {})) {
                merged.componentByType[t] = (merged.componentByType[t] || 0) + (n || 0);
              }
              if (v.durationMs?.length) merged.durationMs.push(...v.durationMs);
              // 合并实际使用模型统计
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
        // 提取 providers 池（脱敏）和 models 模型库
        const configProviders: any[] = [];
        const configModels: any[] = [];
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

  /**
   * 全量用户生成统计（供用户管理「配置详情」抽屉展示）。
   * 口径：
   * - componentCount：组件库中该用户创建的组件数（components.creatorId）；
   * - taskCount：生成任务数（data/tasks.json 中 taskType=component 且带 userId 的记录，
   *   不含 workflow/page）；
   * - apiTaskCount / apiCount：Apifox 接口生成批数 / 接口总数（data/apifox-tasks.json 按 ownerId，
   *   apiCount 为各批 totalApiCount 之和）。
   * - durationP50Ms / durationP90Ms：组件任务墙钟分位（stored duration 或 end-start；进行中无 end 不计）。
   * 数据源分别来自 Mongo components 与 Node data 目录两个磁盘台账（task/apifox 无 DB 副本）。
   */
  async listUserStats(): Promise<Record<string, UserStat>> {
    const stats: Record<string, UserStat> = {};
    const ensure = (key: string): UserStat => (stats[key] ||= emptyStats());

    // 1) 组件库记录数：components group by (creatorId, target)
    //    同一趟聚合同时产出「总数」与「类型构成」，避免二次全表扫描。
    try {
      const rows = await this.componentModel
        .aggregate<{ _id: { c: any; t?: string }; n: number }>([
          { $group: { _id: { c: '$creatorId', t: '$target' }, n: { $sum: 1 } } },
        ])
        .exec();
      for (const r of rows) {
        const owner = r?._id?.c;
        if (!owner) continue;
        const st = ensure(String(owner));
        const n = r.n || 0;
        st.componentCount += n;
        // target 缺失的存量记录归入 unlabeled，保证各类型之和 === componentCount
        const t = r?._id?.t || 'unlabeled';
        st.componentByType[t] = (st.componentByType[t] || 0) + n;
      }
    } catch (err: any) {
      this.logger.warn(`[listUserStats] components 聚合失败: ${err.message}`);
    }

    // 2) 组件生成任务数 + 墙钟耗时 + 实际使用模型：流式读 tasks.json（仅 component 类任务）
    try {
      const tasks = await loadSlimComponentTasks();
      for (const t of tasks) {
        if (!t?.userId) continue;
        if (t.taskType === 'component' || t.taskType === undefined || t.taskType === null) {
          const st = ensure(String(t.userId));
          st.taskCount += 1;
          const d = Number(t.duration);
          if (Number.isFinite(d) && d > 0) st.durationMs.push(d);
          // 统计实际使用的模型
          if (t.textModel) {
            st.usedTextModels[t.textModel] = (st.usedTextModels[t.textModel] || 0) + 1;
          }
          if (t.visionModel) {
            st.usedVisionModels[t.visionModel] = (st.usedVisionModels[t.visionModel] || 0) + 1;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`[listUserStats] tasks.json 读取失败: ${err.message}`);
    }

    // 3) Apifox 接口生成：data/apifox-tasks.json（full/single 各算一批，apiCount 累加）
    try {
      const aPath = join(dataDir, 'apifox-tasks.json');
      if (existsSync(aPath)) {
        const list = JSON.parse(readFileSync(aPath, 'utf-8'));
        if (Array.isArray(list)) {
          for (const t of list) {
            if (!t?.ownerId) continue;
            const st = ensure(String(t.ownerId));
            st.apiTaskCount += 1;
            const n = Number(t.apiCount);
            if (Number.isFinite(n) && n > 0) st.apiCount += n;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`[listUserStats] apifox-tasks.json 读取失败: ${err.message}`);
    }

    for (const st of Object.values(stats)) freezeUserDuration(st);
    return stats;
  }

  /**
   * 时间窗生成日志报告（用户管理导出）。
   * 组件次数来自 tasks.json 流式抽取；接口来自 apifox-tasks.json；部门来自 users.portalInfo。
   */
  async buildUsageExport(query: {
    preset?: string;
    from?: string;
    to?: string;
    dept?: string;
    format?: string;
  }): Promise<{ filename: string; contentType: string; body: string }> {
    let preset: UsagePreset;
    try {
      preset = normalizePreset(query.preset);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    let windows: ReturnType<typeof resolveWindows>;
    try {
      windows = resolveWindows({
        preset,
        from: query.from,
        to: query.to,
      });
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    const deptFilter = String(query.dept || '').trim() || null;
    const format = String(query.format || 'md').toLowerCase() === 'html' ? 'html' : 'md';

    const [users, componentTasks] = await Promise.all([
      this.userModel.find().select('_id uid username portalInfo').lean().exec(),
      loadSlimComponentTasks(),
    ]);
    const apiTasks = loadSlimApiTasks();
    const agg = aggregateUsage({
      componentTasks,
      apiTasks,
      userIndex: buildUserIndex(users),
      current: windows.current,
      previous: windows.previous,
      deptFilter,
    });
    const report = buildReport({
      preset,
      deptFilter,
      current: windows.current,
      previous: windows.previous,
      agg,
    });
    const body = format === 'html' ? renderHtml(report) : renderMarkdown(report);
    return {
      filename: exportFilename(report, format),
      contentType: format === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8',
      body,
    };
  }

  /** 全量组件列表（越过 groupId/creatorId 过滤），支持搜索/分页 */
  async listComponents(query: any) {
    // 传 undefined 作为 userId → ComponentService 不加 creatorId 过滤，返回全量
    return this.componentService.listComponents(query, undefined);
  }

  /**
   * 删除用户及其所有关联数据（级联清理）。
   * 范围：用户记录、AI配置、组件(含磁盘文件)、组/组成员、入组申请、Git凭证、文档/会话/项目/技能、配额内存
   */
  async deleteUser(operatorId: string, targetId: string): Promise<{ deletedComponents: number; cleanedCollections: string[] }> {
    // 自删保护
    if (operatorId === targetId) {
      throw new BadRequestException('不能删除自己的账号');
    }

    const target = await this.userModel.findById(targetId).lean().exec();
    if (!target) throw new NotFoundException('目标用户不存在');

    // 禁止删除最后一个管理员
    const adminCount = await this.userModel.countDocuments({ isAdmin: true }).exec();
    if (adminCount <= 1 && (target as any).isAdmin) {
      throw new BadRequestException('不能删除唯一的管理员账号');
    }

    const targetOid = new Types.ObjectId(targetId);
    const cleaned: string[] = [];
    let deletedComponents = 0;

    // 1. 删除该用户创建的所有组件（含磁盘文件）
    try {
      const components = await this.componentService['componentModel']
        .find({ creatorId: targetOid })
        .select('_id')
        .lean()
        .exec();
      for (const comp of components) {
        try {
          // 复用 componentService 的级联删除（任务+文件）
          await this.componentService.deleteComponent(comp._id.toString(), operatorId);
          deletedComponents++;
        } catch (e) {
          this.logger.warn(`[deleteUser] 组件 ${comp._id} 删除失败: ${e.message}`);
        }
      }
      if (deletedComponents > 0) cleaned.push(`components(${deletedComponents})`);
    } catch (e) {
      this.logger.warn(`[deleteUser] 清理组件失败: ${e.message}`);
    }

    // 2. AI 配置（逻辑删除）
    try {
      const r = await this.userAiConfigService['model'].updateOne({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('ai-config');
    } catch (e) { /* 静默 */ }

    // 3. 组成员关系（逻辑删除）
    try {
      const r = await this.groupMemberModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('group-members');
    } catch (e) { /* 静默 */ }

    // 4. 私人组（逻辑删除）
    try {
      const r = await this.groupModel.updateMany({ adminId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('groups');
    } catch (e) { /* 静默 */ }

    // 5. 入组申请（逻辑删除）
    try {
      const r = await this.joinRequestModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('join-requests');
    } catch (e) { /* 静默 */ }

    // 6. Git 凭证（逻辑删除）
    try {
      const r = await this.gitCredentialModel.updateOne({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('git-credential');
    } catch (e) { /* 静默 */ }

    // 7. AI 文档（含从共享列表中移除引用，逻辑删除）
    try {
      // 先把该用户从其他人的 sharedUsers 中 $pull
      await this.documentModel.updateMany(
        { 'sharedUsers.userId': targetOid },
        { $pull: { sharedUsers: { userId: targetOid } } },
      );
      const r = await this.documentModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('documents');
    } catch (e) { /* 静默 */ }

    // 8. AI 会话（逻辑删除）
    try {
      const r = await this.sessionModel.updateMany({ userId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push('sessions');
    } catch (e) { /* 静默 */ }

    // 9. AI 项目（从 adminUserIds 数组中移除，逻辑删除孤立项目）
    try {
      // 先从其他项目的管理员数组中移除
      await this.projectModel.updateMany(
        { adminUserIds: targetOid },
        { $pull: { adminUserIds: targetOid } },
      );
      // 逻辑删除该用户创建的且仅剩其一人管理的项目
      const orphanProjects = await this.projectModel.find({
        $or: [
          { adminUserIds: { $size: 0 } },
          { adminUserIds: { $exists: false } },
        ],
      }).select('_id').lean();
      if (orphanProjects.length > 0) {
        const ids = orphanProjects.map((p: any) => p._id);
        const r = await this.projectModel.updateMany({ _id: { $in: ids } }, { $set: { deleted: true } });
        cleaned.push(`projects(${r.modifiedCount})`);
      }
    } catch (e) { /* 静默 */ }

    // 10. AI 技能（逻辑删除）
    try {
      const r = await this.skillModel.updateMany({ ownerUserId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push(`skills(${r.modifiedCount})`);
      // 清理 reviewedBy 引用
      await this.skillModel.updateMany(
        { reviewedBy: targetOid },
        { $unset: { reviewedBy: 1 } },
      );
    } catch (e) { /* 静默 */ }

    // 11. Document（workspace 文档，逻辑删除）
    try {
      const r = await this.docModel.updateMany({ ownerId: targetOid }, { $set: { deleted: true } });
      if (r.modifiedCount > 0) cleaned.push(`workspace-docs(${r.modifiedCount})`);
    } catch (e) { /* 静默 */ }

    // 12. 清理内存配额
    try {
      (this.quotaService as any).userQuotas?.delete(targetId);
    } catch (e) { /* 静默 */ }

    // 13. 最后逻辑删除用户记录本身
    await this.userModel.findByIdAndUpdate(targetId, { $set: { deleted: true } });

    this.logger.log(
      `[deleteUser] 已删除用户 ${(target as any).username}(${targetId})，` +
      `级联清理: [${cleaned.join(', ')}], 组件: ${deletedComponents}`,
    );

    return { deletedComponents, cleanedCollections: cleaned };
  }
}
