import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 响应信封拦截器（全局注册）— 严格纯嵌套版.
 *
 * <p>将 Node 全部成功响应统一为框架 3.0 规范信封 {@code {success, code, message, data, source}}，
 * 业务字段一律收进 {@code data}，顶层不再平铺任何业务字段（严格纯嵌套）：
 * <ul>
 *   <li>已含 {@code data} 字段的嵌套响应（如 ApiResponse.success）：取 {@code data} 作为载荷，
 *       规范化元数据（success/code:200/message/source）；</li>
 *   <li>扁平对象（{@code {success, user, ...}}）：剥去信封元字段后整体作为 {@code data} 载荷；</li>
 *   <li>数组 / 原始值：整体作为 {@code data} 载荷；</li>
 * </ul>
 *
 * <p>前端必须统一通过 {@code res.data.xxx} 读取业务字段（见 core/http.js 与 api/* 层）。
 *
 * <p>跳过以下响应以免破坏流式 / 原始输出：
 * - undefined / null（SSE、@Res 直写控制器通常返回 void）
 * - string / Buffer / StreamableFile / 可读流（下载、SSE 流）
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  private static readonly SOURCE = 'node';
  private static readonly OK_MESSAGE = 'ok';

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.toEnvelope(data)));
  }

  private toEnvelope(data: unknown): unknown {
    if (data === undefined || data === null) return data;
    if (typeof data === 'string' || Buffer.isBuffer(data)) return data;
    if (data instanceof StreamableFile) return data;
    if (data && typeof (data as { pipe?: unknown }).pipe === 'function') return data;
    if (typeof data !== 'object') return data;

    // 数组：直接作为 data 载荷，不展开索引
    if (Array.isArray(data)) {
      return { success: true, code: 200, message: ResponseEnvelopeInterceptor.OK_MESSAGE, data, source: ResponseEnvelopeInterceptor.SOURCE };
    }

    const obj = data as Record<string, unknown>;

    // 已含 data 字段（嵌套 ApiResponse 形）：取其中 data 作为载荷，仅规范化元数据 + 注入 source
    if ('data' in obj) {
      return {
        success: typeof obj.success === 'boolean' ? obj.success : true,
        code: 200,
        message: typeof obj.message === 'string' ? obj.message : ResponseEnvelopeInterceptor.OK_MESSAGE,
        data: obj.data ?? null,
        source: ResponseEnvelopeInterceptor.SOURCE,
      };
    }

    // 扁平 / 纯对象响应：剥去信封元字段（success/code/message/source），剩余整体作为 data 载荷。
    // 严格纯嵌套：业务字段不再平铺到顶层。
    const { success, code, message, source, ...rest } = obj;
    return {
      success: typeof success === 'boolean' ? success : true,
      code: 200,
      message: typeof message === 'string' ? message : ResponseEnvelopeInterceptor.OK_MESSAGE,
      data: rest,
      source: ResponseEnvelopeInterceptor.SOURCE,
    };
  }
}
