import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { Group, GroupDocument } from '../schemas/group.schema';
import { GroupMember, GroupMemberDocument } from '../schemas/group-member.schema';
import { ALL_PERMISSIONS } from './permission.constants';
import { ROLES } from '../common/constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * 私人工作空间确保结果缓存（进程内）：userId -> { group, at }。
   * 2026-09-02 事故：每个无 session 请求都跑 ensureUserPrivateGroup（3 次串行 Mongo
   * 往返），Mongo 通道抖动时 /api/tasks 等高频轮询被拖到 7~22s。TTL 内直接返回缓存，
   * 跳过全部 Mongo 查询；ensureUserPrivateGroup 幂等 upsert，过期重跑安全。
   */
  private readonly privateGroupCache = new Map<
    string,
    { group: GroupDocument; at: number }
  >();
  private static readonly PRIVATE_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(GroupMember.name) private groupMemberModel: Model<GroupMemberDocument>,
  ) {}

  async register(registerDto: RegisterDto): Promise<User> {
    const { username, password } = registerDto;

    // 检查用户名是否已存在
    const existingUser = await this.userModel.findOne({ username });

    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    // 创建新用户（password会被pre-save hook自动hash）
    const user = new this.userModel({
      username,
      password,
    });

    await user.save();
    return user;
  }

  async validateUser(loginDto: LoginDto): Promise<User> {
    const { username, password } = loginDto;

    const user = await this.userModel.findOne({ username });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return user;
  }

  async findById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId);
  }

  // 获取用户的第一个群组（用于默认 groupId）
  async getUserGroup(userId: string): Promise<Group | null> {
    const membership = await this.groupMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!membership) return null;
    const group = await this.groupModel.findById(membership.groupId).lean().exec();
    return group as any;
  }

  /**
   * 为用户确保一个私人默认工作空间（组）。
   *
   * 背景：门户/开发用户首次登录时只建了 User，没有 GroupMember 记录，
   * 导致 NodePermissionAdapter.checkPermission 返回 false → PermissionsGuard
   * 把所有 @Permissions 路由（组件增删改等）全部 403 卡死，且前端
   * auth/current 的 group 为 null 无法拿到 groupId。
   *
   * 策略：用 name=`私人空间:${uid}` 定位私人组（幂等，已有则复用），
   * 并把该用户 upsert 为组的 admin（拥有 ALL_PERMISSIONS）。
   * 私人组天然实现"每人组件隔离"，后续可由 admin 邀请他人进组共享。
   *
   * 调用时机：findOrCreateByPortalToken / findOrCreateDevUser 返回前，
   * 无论用户是新建还是已存在都执行一次（upsert 幂等、开销极小）。
   */
  async ensureUserPrivateGroup(
    userId: Types.ObjectId | string,
    uid: string,
    displayName: string,
  ): Promise<GroupDocument> {
    // 缓存命中（TTL 内）直接返回，跳过 3 次串行 Mongo 往返
    const cacheKey = String(userId);
    const cached = this.privateGroupCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.at < AuthService.PRIVATE_GROUP_CACHE_TTL_MS
    ) {
      return cached.group;
    }

    const name = `私人空间:${uid}`;
    let group = await this.groupModel.findOne({ name }).exec();
    if (!group) {
      group = await this.groupModel.create({
        name,
        description: '系统自动创建的私人工作空间',
        adminId: new Types.ObjectId(userId),
      });
      this.logger.log(
        `✅ 已为用户 ${displayName} (uid=${uid}) 创建私人工作空间`,
      );
    }

    // 确保用户是该组 admin（拥有全部权限）。upsert 幂等，不覆盖既有调整。
    await this.groupMemberModel
      .findOneAndUpdate(
        { groupId: group._id, userId: new Types.ObjectId(userId) },
        {
          $setOnInsert: {
            role: ROLES.ADMIN,
            permissions: ALL_PERMISSIONS,
            joinedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();

    this.privateGroupCache.set(cacheKey, { group, at: Date.now() });
    return group;
  }

  // 修改密码（通过用户名 + 原密码验证，不依赖 session）
  async changePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findOne({ username });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const isOldValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldValid) {
      throw new UnauthorizedException('原密码不正确');
    }

    // pre-save hook 会自动 hash 新密码
    user.password = newPassword;
    await user.save();
  }

  /**
   * 门户 token 自动登录：校验门户 token → 查找/创建本地用户
   * 供 SessionGuard 在 session 无 userId 时，用 header 的 token 自动建立身份。
   *
   * QS 门户契约（截图确认）：
   *   GET {PORTAL_BASE_URL}/getTokenUser?token=xxx
   *   （PORTAL_BASE_URL 未配时降级读旧键 PORTAL_TOKEN_VERIFY_URL；两者皆空则 fail-closed）
   *   200 OK: { code: 200, message: "查询到用户信息成功", data: { uid, account, name, expirise, ... } }
   *
   * 设计：
   * - 未配置 PORTAL_BASE_URL（且未配置旧键 PORTAL_TOKEN_VERIFY_URL） → fail-closed 返回 null。
   * - 已配置 → 按 query token 调用，校验 code===200，解析 data.uid/data.account/data.name/data.expirise。
   * - 任何异常（网络/解析/缺字段）→ 返回 null，绝不接受伪造身份。
   */
  async findOrCreateByPortalToken(
    token: string,
  ): Promise<{ user: User; expiresInSeconds?: number } | null> {
    // 门户登录校验地址：优先 PORTAL_BASE_URL 拼 /getTokenUser，兼容旧键 PORTAL_TOKEN_VERIFY_URL
    const portalBaseUrl = process.env.PORTAL_BASE_URL;
    const verifyUrl =
      (portalBaseUrl ? `${portalBaseUrl.replace(/\/$/, '')}/getTokenUser` : null) ||
      process.env.PORTAL_TOKEN_VERIFY_URL ||
      null;
    if (!verifyUrl) {
      this.logger.warn(
        '⚠️ PORTAL_BASE_URL/PORTAL_TOKEN_VERIFY_URL 未配置，门户 token 自动登录不可用（fail-closed）',
      );
      return null;
    }
    try {
      const resp = await axios.get(verifyUrl, {
        params: { token },
        timeout: 5000,
        // ECS 上 Node 继承公司 HTTP_PROXY，axios 默认不认 no_proxy 会把门户校验请求塞进代理导致 5s 超时 401。
        // 门户校验本就不该走外网代理，显式禁用。
        proxy: false,
      });

      // QS 门户响应形态：{ code: 200, message, data }
      if (resp.data?.code !== 200 || !resp.data?.data) {
        this.logger.warn(
          `门户 token 校验失败: code=${resp.data?.code}, message=${resp.data?.message || '未知'}`,
        );
        return null;
      }

      const data = resp.data.data;
      const uid = data?.uid;
      const username = data?.account || data?.uid;
      const displayName = data?.name || username;
      const expiresInSeconds =
        typeof data?.expirise === 'number' ? data.expirise : undefined;

      if (!uid || !username) {
        this.logger.warn('门户 token 校验响应缺少 uid/account，拒绝建号', {
          sample: JSON.stringify(data).slice(0, 200),
        });
        return null;
      }

      // 查找顺序：先按 uid，再按 username（兼容软删除旧用户恢复）
      // 同时恢复被软删除的用户（deleted: true → false）
      let user = await this.userModel
        .findOneAndUpdate(
          { $or: [{ uid }, { username }] },
          {
            $set: { uid, portalInfo: data, deleted: false },
            $setOnInsert: {
              username,
              password: Math.random().toString(36).slice(2),
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
      if (!user) {
        this.logger.warn(`门户用户 upsert 失败: uid=${uid}, username=${username}`);
        return null;
      }

      // 确保门户用户拥有私人工作空间，避免首次登录无 GroupMember 导致 PermissionsGuard 全 403
      await this.ensureUserPrivateGroup(user._id, uid, displayName);

      return { user, expiresInSeconds };
    } catch (err) {
      this.logger.warn(`门户 token 校验失败（fail-closed）: ${err.message}`);
      return null;
    }
  }

  /**
   * 开发态自动登录兜底（仅非生产 + DEV_AUTO_LOGIN=true 生效）。
   *
   * 用途：本地开发时没有外层门户提供真实 token，前端 dev-config 发的假 token
   *   无法被 PORTAL_TOKEN_VERIFY_URL 校验通过，导致本地调试被 401 挡死。
   *   开启后，任意 token 都会被映射到一个固定的本地开发身份（uid=dev-local），
   *   让本地既能跑通鉴权链路，又便于在嵌真实门户 iframe 时回落到 dev-config。
   *
   * ⚠️ 安全红线（fail-closed）：
   *   - NODE_ENV === 'production' 时强制返回 null，绝不接受任何开发/伪造 token。
   *   - DEV_AUTO_LOGIN !== 'true' 时返回 null。
   *   - 生产构建无论如何都不应配置 DEV_AUTO_LOGIN=true。
   */
  async findOrCreateDevUser(
    token: string,
  ): Promise<{ user: User; expiresInSeconds?: number } | null> {
    if (process.env.NODE_ENV === 'production') return null;
    if (process.env.DEV_AUTO_LOGIN !== 'true') return null;
    if (!token) return null;

    const uid = 'dev-local';
    const username = 'dev-local';
    try {
      let user = await this.userModel.findOne({ uid }).exec();
      if (!user) {
        user = await this.userModel.create({
          username,
          password: Math.random().toString(36).slice(2), // 开发用户无本地密码
          uid,
          portalInfo: { dev: true, token },
        });
        this.logger.log(`✅ 开发态自动建号: 本地开发 (uid=${uid})`);
      }
      // 开发态给 8 小时有效期，避免调试过程中频繁过期重新登录
      // 确保开发用户拥有私人工作空间，避免 PermissionsGuard 全 403
      await this.ensureUserPrivateGroup(user._id, uid, username);

      return { user, expiresInSeconds: 28800 };
    } catch (err) {
      this.logger.warn(`开发态自动建号失败（fail-closed）: ${err.message}`);
      return null;
    }
  }
}
