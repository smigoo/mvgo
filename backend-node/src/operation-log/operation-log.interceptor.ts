import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { OperationLogService } from './operation-log.service';

/** 敏感键（匹配即脱敏）：密码 / token / secret / 各类 api key / 授权头 / cookie / figma / apifox */
const SENSITIVE_KEY = /password|token|secret|api[_-]?key|authorization|cookie|figma|apifox/i;

/** 请求体超过该字符数则省略，避免大体积（如 base64 截图）撑爆日志 */
const BODY_LIMIT = 2000;

/** 递归脱敏：遇到敏感 key 的字符串值替换为中心掩码，其余递归 */
function maskSensitive(value: any): any {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k) && typeof v === 'string' && v) {
        out[k] = v.length <= 8 ? '****' : `${v.slice(0, 6)}****${v.slice(-4)}`;
      } else {
        out[k] = maskSensitive(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * 全局操作日志拦截器。
 * - 在每次 HTTP 请求完成后（成功或失败）写入一条 OperationLog；
 * - 操作人取自 request.session.userId（由 SessionGuard 写入；未登录则为 null）；
 * - 写入为 fire-and-forget（不 await 响应链路），失败仅告警；
 * - 由 OPERATION_LOG_ENABLED 开关控制，由 OPERATION_LOG_SKIP_PATHS 跳过高频/自读路径。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name);
  private readonly skipPaths: string[];
  private readonly enabled: boolean;

  constructor(private readonly logService: OperationLogService) {
    this.enabled = (process.env.OPERATION_LOG_ENABLED ?? 'true') !== 'false';
    this.skipPaths = (process.env.OPERATION_LOG_SKIP_PATHS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (this.enabled) {
      this.logger.log(
        `[OperationLogInterceptor] 已启用，跳过路径: ${this.skipPaths.join(', ') || '(无)'}`,
      );
    } else {
      this.logger.log('[OperationLogInterceptor] 已禁用（OPERATION_LOG_ENABLED=false）');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.enabled) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const path = (request.path || request.url?.split('?')[0] || '').split('?')[0];

    if (this.skipPaths.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const start = Date.now();
    const method = (request.method || '').toUpperCase();
    const ip =
      (request.headers['x-forwarded-for'] as string) || request.ip || '';
    const userAgent = (request.headers['user-agent'] as string) || '';

    let body: any = undefined;
    if (request.body && typeof request.body === 'object') {
      const raw = JSON.stringify(request.body);
      if (raw.length <= BODY_LIMIT) {
        body = maskSensitive(request.body);
      } else {
        body = { _omitted: `body too large (${raw.length} bytes)` };
      }
    }
    const query = maskSensitive(request.query || {});

    const finish = (err: any) => {
      const durationMs = Date.now() - start;
      const statusCode =
        (err && typeof err.getStatus === 'function' && err.getStatus()) ||
        response.statusCode ||
        500;
      const userId = (request.session as any)?.userId || null;
      this.logService
        .record({
          userId,
          method,
          path,
          query,
          body,
          statusCode,
          ip,
          durationMs,
          userAgent,
          errorMessage: err ? String(err.message || '').slice(0, 200) : undefined,
        })
        .catch(() => {});
    };

    return next.handle().pipe(
      tap(() => finish(null)),
      catchError((err) => {
        finish(err);
        throw err;
      }),
    );
  }
}
