import { Controller, Post, Get, Body, Session, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from './auth.service';
import { User, UserDocument } from '../schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionGuard } from './session.guard';
import { PermissionAdapter } from './permission-adapter.interface';
import { resolveAdminRole } from '../admin/admin-role.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionAdapter: PermissionAdapter,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.authService.register(registerDto);
    return {
      success: true,
      message: '注册成功',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Session() session: Record<string, any>) {
    const user = await this.authService.validateUser(loginDto);

    // 获取用户角色（存入 session，后续请求无需再查数据库）
    const { role } = await this.permissionAdapter.getUserPermissions(user._id.toString());

    // 设置session
    session.userId = user._id.toString();
    session.username = user.username;
    session.role = role;

    return new Promise((resolve, reject) => {
      session.save((err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            message: '登录成功',
            user: {
              id: user._id,
              username: user.username,
              email: user.email,
            },
          });
        }
      });
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Session() session: Record<string, any>) {
    return new Promise((resolve) => {
      session.destroy(() => {
        resolve({
          success: true,
          message: '登出成功',
        });
      });
    });
  }

  @Get('current')
  @UseGuards(SessionGuard)
  async getCurrentUser(@Session() session: Record<string, any>) {
    const user = await this.authService.findById(session.userId);
    if (!user) {
      return { success: false };
    }

    // 获取用户的群组信息
    const group = await this.authService.getUserGroup(session.userId);

    // 通过适配器获取权限信息（迁移到 QS 时此处自动切换数据源）
    const { role: permRole, permissions } = await this.permissionAdapter.getUserPermissions(
      session.userId,
    );

    // 统一的管理员判定：per-user 标志 > 环境变量白名单 > QS 权限码。
    // 与 admin.service.assertAdmin 共用 resolveAdminRole，保证前后端角色一致。
    const userUid = (user as any).uid || (user as any).portalInfo?.uid || '';
    const role = resolveAdminRole({
      isAdminFlag: !!(user as any).isAdmin,
      permissionRole: permRole,
      userUid,
      defaultAdminUids: (process.env.DEFAULT_ADMIN_UIDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      permissionSource: process.env.PERMISSION_SOURCE || 'node',
    });

    return {
      success: true,
      user: {
        id: user._id,
        uid: user.uid,
        username: user.username,
        email: user.email,
        isAdmin: !!(user as any).isAdmin,
      },
      group: group
        ? {
            id: (group as any)._id,
            name: group.name,
          }
        : null,
      role,
      permissions,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: { username: string; oldPassword: string; newPassword: string },
  ) {
    await this.authService.changePassword(
      body.username,
      body.oldPassword,
      body.newPassword,
    );
    return {
      success: true,
      message: '密码修改成功',
    };
  }
}
