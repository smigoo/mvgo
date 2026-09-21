import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 检查 session 中是否有用户信息
    if (!request.session?.userId) {
      throw new ForbiddenException('未登录');
    }
    
    // 检查是否为管理员（简单实现：检查 username 或 role 字段）
    // 实际项目中应该从数据库查询用户角色
    const isAdmin = request.session.role === 'admin' || 
                    request.session.username === 'admin' ||
                    request.session.isAdmin === true;
    
    if (!isAdmin) {
      throw new ForbiddenException('需要管理员权限');
    }
    
    return true;
  }
}
