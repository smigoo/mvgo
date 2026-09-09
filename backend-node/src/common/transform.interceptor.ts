import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from './api-response';

/**
 * 统一响应拦截器(基建,本轮未全局注册)。
 *
 * 将控制器返回值包装为 { success, code, message, data }。
 * 已为统一响应结构(含 success + code)的数据不二次包装,便于增量迁移。
 *
 * 启用方式(后续逐步迁移):
 *   - 单控制器: @UseInterceptors(TransformInterceptor)
 *   - 全局: app.module.ts providers 注入 { provide: APP_INTERCEPTOR, useClass: TransformInterceptor }
 * 注意:全局启用前需前端 request.js 兼容层已上线(已完成),且 SSE/下载等流式路由需加白名单。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'code' in data
        ) {
          return data as ApiResponse<T>;
        }
        return ApiResponse.success(data);
      }),
    );
  }
}
