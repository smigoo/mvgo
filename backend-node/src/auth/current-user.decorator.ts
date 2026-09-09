import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    return userId;
  },
);
