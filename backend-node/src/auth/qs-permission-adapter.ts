import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { User, UserDocument } from '../schemas/user.schema';
import { GroupMember, GroupMemberDocument } from '../schemas/group-member.schema';
import { PermissionAdapter } from './permission-adapter.interface';
import { ALL_PERMISSIONS } from './permission.constants';
import { ROLES } from '../common/constants';

/**
 * QSPermissionAdapter — 权限数据来源切换为 QS 门户权限中心
 *
 * 背景：迁移到 QS 门户后，权限真相源应在门户侧，本系统不应再维护第二套权限库
 * （避免与门户组织/角色双写漂移）。本适配器通过 HTTP 调门户"用户权限"接口拿到
 * 门户权限码，再按映射策略转成本系统的 resource:action 权限码（详见下方映射），
 * 并做内存缓存避免每次请求都打门户。
 *
 * 默认不启用：auth.module.ts 按 PERMISSION_SOURCE=node 注入 NodePermissionAdapter。
 * 仅当 PERMISSION_SOURCE=qs 且配置 PORTAL_BASE_URL（或旧键 PORTAL_PERMISSION_URL）后才真正读门户。
 *
 * 本地兜底（保证可用性与平滑切换）：以下情况回落到本地 GroupMember，
 * 行为与本系统原 NodePermissionAdapter 完全一致：
 *   1. 用户没有门户 uid（portalInfo.uid 为空，如本地注册账号、开发态用户）
 *   2. PORTAL_BASE_URL / PORTAL_PERMISSION_URL 均未配置
 *   3. 门户接口调用失败（网络/超时/解析错误）
 *
 * 映射策略（env 驱动，迁移时由你维护映射表，而非一套完整权限系统）：
 *   - QS_ADMIN_CODES：命中任一门户码即视为 admin，返回 ALL_PERMISSIONS。
 *   - QS_PERMISSION_MAPPING：JSON，门户码 -> 系统权限码（字符串或数组），
 *     '*' 作为通配键可批量授权。
 *   - QS_DEFAULT_PERMISSIONS：给所有已登录门户用户的默认权限（如只读）。
 */
@Injectable()
export class QSPermissionAdapter extends PermissionAdapter {
  private cache = new Map<
    string,
    { exp: number; data: { role: string; permissions: string[] } }
  >();

  // 门户权限中心地址：优先 PORTAL_BASE_URL 拼 /getUserAuths，兼容旧键 PORTAL_PERMISSION_URL
  private readonly permissionUrl = (() => {
    const base = process.env.PORTAL_BASE_URL;
    if (base) return `${base.replace(/\/$/, '')}/getUserAuths`;
    return process.env.PORTAL_PERMISSION_URL || null;
  })();
  private readonly uidParam = process.env.PORTAL_PERMISSION_UID_PARAM || 'uid';
  private readonly adminCodes = (process.env.QS_ADMIN_CODES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  private readonly mapping = this.parseMapping(process.env.QS_PERMISSION_MAPPING);
  private readonly defaultPerms = (process.env.QS_DEFAULT_PERMISSIONS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  private readonly ttl = (Number(process.env.QS_PERMISSION_CACHE_TTL) || 300) * 1000;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {
    super();
  }

  async checkPermission(userId: string, permCode: string): Promise<boolean> {
    const { role, permissions } = await this.getUserPermissions(userId);
    if (role === ROLES.ADMIN) return true;
    return permissions.includes(permCode);
  }

  async getUserPermissions(
    userId: string,
  ): Promise<{ role: string; permissions: string[] }> {
    // 1. 缓存命中直接返回
    const cached = this.cache.get(userId);
    if (cached && cached.exp > Date.now()) return cached.data;

    // 2. 取门户 uid（门户原始响应存于 portalInfo）
    const user = await this.userModel.findById(userId).lean().exec();
    const uid = (user as any)?.portalInfo?.uid;

    // 3. 无门户 uid 或未配置门户接口 → 本地兜底
    if (!uid || !this.permissionUrl) {
      const fb = await this.localFallback(userId);
      this.setCache(userId, fb);
      return fb;
    }

    // 4. 调门户权限中心
    try {
      const resp = await axios.get(this.permissionUrl, {
        params: { [this.uidParam]: uid },
        timeout: 5000,
      });
      const portalCodes = this.extractPortalCodes(resp.data);
      const { permissions, isAdmin } = this.mapToSystemPermissions(portalCodes);
      const data = { role: isAdmin ? ROLES.ADMIN : ROLES.MEMBER, permissions };
      this.setCache(userId, data);
      return data;
    } catch (err) {
      // 门户不可用 → 本地兜底，保证接口可用性（fail-safe 非 fail-closed）
      const fb = await this.localFallback(userId);
      return fb;
    }
  }

  // ---------- 私有工具 ----------

  private setCache(
    userId: string,
    data: { role: string; permissions: string[] },
  ): void {
    this.cache.set(userId, { exp: Date.now() + this.ttl, data });
  }

  private async localFallback(
    userId: string,
  ): Promise<{ role: string; permissions: string[] }> {
    const membership = await this.groupMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!membership) return { role: ROLES.MEMBER, permissions: [] };
    if (membership.role === ROLES.ADMIN) {
      return { role: ROLES.ADMIN, permissions: ALL_PERMISSIONS };
    }
    return {
      role: membership.role,
      permissions: membership.permissions || [],
    };
  }

  /**
   * 从门户响应中宽松提取权限码数组。
   * 兼容形态：
   *   - { code:200, data: [{ code:'x' }, ...] }
   *   - { code:200, data: { auths:[...] | list:[...] | permissions:[...] } }
   *   - 直接是数组 [{ code:'x' }]
   */
  private extractPortalCodes(data: any): string[] {
    let raw: any = data;
    if (data && typeof data === 'object') {
      raw =
        data.data?.auths ||
        data.data?.list ||
        data.data?.permissions ||
        data.data ||
        data.auths ||
        data.list ||
        data.permissions ||
        data;
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => (typeof item === 'string' ? item : item?.code))
      .filter(Boolean);
  }

  /**
   * 门户权限码 -> 本系统权限码映射。
   * 命中 admin 码返回全量并标记 isAdmin；否则收集映射 + 默认权限。
   */
  private mapToSystemPermissions(portalCodes: string[]): {
    permissions: string[];
    isAdmin: boolean;
  } {
    const set = new Set<string>();
    let isAdmin = false;

    for (const code of portalCodes) {
      if (this.adminCodes.includes(code)) {
        isAdmin = true;
        break;
      }
      const wildcard = this.mapping['*'];
      if (wildcard) wildcard.forEach((p) => set.add(p));
      const mapped = this.mapping[code];
      if (mapped) mapped.forEach((p) => set.add(p));
    }

    if (isAdmin) {
      return { permissions: ALL_PERMISSIONS, isAdmin: true };
    }
    this.defaultPerms.forEach((p) => set.add(p));
    return { permissions: Array.from(set), isAdmin: false };
  }

  private parseMapping(raw?: string): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    if (!raw) return map;
    try {
      const obj = JSON.parse(raw) as Record<string, string | string[]>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          map[k] = v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        } else if (Array.isArray(v)) {
          map[k] = v.map((s) => String(s).trim()).filter(Boolean);
        }
      }
    } catch {
      // 映射表解析失败：降级为空映射，门户码不会被认作任何系统权限
    }
    return map;
  }
}
