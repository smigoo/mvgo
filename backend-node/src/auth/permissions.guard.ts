import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAdapter } from './permission-adapter.interface';

/**
 * PermissionsGuard — 权限校验守卫
 *
 * 与 SessionGuard 配合使用，放在 SessionGuard 之后。
 *
 * 工作流程：
 * 1. 通过 Reflector 读取 @Permissions() 装饰器声明的权限码
 * 2. 未声明 @Permissions 的路由直接放行（仅需登录）
 * 3. 声明了权限码的路由，调用 PermissionAdapter.checkPermission() 逐个校验
 * 4. 全部通过则放行，任一不通过则抛出 403
 *
 * 迁移说明：此 Guard 不依赖任何具体实现，通过 DI 注入 PermissionAdapter。
 * 切换到 QS 系统时，只需在 auth.module.ts 中替换 provider 的 useClass。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionAdapter: PermissionAdapter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('未登录或登录已过期');
    }

    for (const permCode of required) {
      const hasPermission = await this.permissionAdapter.checkPermission(
        userId,
        permCode,
      );
      if (!hasPermission) {
        throw new ForbiddenException(`权限不足，需要: ${permCode}`);
      }
    }

    return true;
  }
}
