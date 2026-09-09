import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 声明当前路由所需的权限码
 *
 * 用法：
 *   @Permissions('component:create')
 *   @Permissions('component:update', 'component:delete')  // 多个权限需全部满足
 *
 * 未声明此装饰器的路由仅需登录即可访问（由 SessionGuard 保证）。
 */
export const Permissions = (...permCodes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permCodes);
