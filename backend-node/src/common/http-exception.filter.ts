import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from './api-response';

const SENSITIVE_DIAGNOSTIC_KEY = /stack|token|secret|password|authorization|cookie/i;

function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  }
  if (typeof value !== 'object' || !value) return undefined;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_DIAGNOSTIC_KEY.test(key))
      .map(([key, item]) => [key, sanitizeDiagnosticValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
}

function extractSafeDetails(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  if (typeof source.code === 'string') details.code = source.code;
  if (source.runtimeGate && typeof source.runtimeGate === 'object') {
    details.runtimeGate = sanitizeDiagnosticValue(source.runtimeGate);
  }
  if (source.lessCompileGate && typeof source.lessCompileGate === 'object') {
    details.lessCompileGate = sanitizeDiagnosticValue(source.lessCompileGate);
  }
  if (source.codeValidationResult && typeof source.codeValidationResult === 'object') {
    details.codeValidationResult = sanitizeDiagnosticValue(source.codeValidationResult);
  }
  if (Array.isArray(source.parameterIssues)) {
    details.parameterIssues = sanitizeDiagnosticValue(source.parameterIssues);
  }
  return details;
}

/**
 * 全局异常过滤器
 * 统一错误响应格式，并透传经过白名单过滤的业务诊断信息。
 * 避免未捕获异常直接返回 500 + 堆栈泄露。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let safeDetails: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      // NestJS 原生异常可能返回 string 或 object
      // 优先取具体业务 message，其次 error 类型标签，最后 exception.message
      if (typeof res === 'string') {
        message = res;
      } else {
        const resObj = res as any;
        message = resObj.message || resObj.error || exception.message;
      }
      safeDetails = extractSafeDetails(res);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json(
      ApiResponse.error(status, message, { path: request.url, ...safeDetails }),
    );
  }
}
