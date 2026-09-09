import { trace } from '@opentelemetry/api';
import { startSpan } from './trace-utils';
import pinia, { useUserStore } from '@/store';

// 统一错误上报工具
export function reportGlobalError(errorType, error, source = '', lineno = 0, colno = 0) {
  const span = startSpan(`global.error.${errorType}`);
  const globalUser = useUserStore(pinia).userInfo;

  try {
    // 标记错误状态
    span.setStatus({ code: 2 });
    // 基础错误信息
    span.setAttribute('server', 'web');
    span.setAttribute('error', true);
    span.setAttribute('error.type', errorType);
    span.setAttribute('error.message', error?.message || String(error));
    span.setAttribute('error.stack', error?.stack || 'no stack');
    // 错误位置
    span.setAttribute('error.source', source);
    span.setAttribute('error.lineno', lineno);
    span.setAttribute('error.colno', colno);
    // 关联父链路
    const currentCtx = trace.getActiveContext();
    const activeSpan = trace.getSpan(currentCtx);
    if (activeSpan) {
      span.setAttribute('parent.traceId', activeSpan.spanContext().traceId);
      span.setAttribute('parent.spanId', activeSpan.spanContext().spanId);
    }
    // 用户信息
    span.setAttribute('user.id', globalUser?.mobile || '');
    span.setAttribute('user.name', globalUser?.name || '');
    // 页面信息
    span.setAttribute('page.href', window.location.href);
    span.setAttribute('page.userAgent', navigator.userAgent);
    // 记录完整异常
    span.recordException(error);
  } catch (err) {
    // 防止上报逻辑自身报错
    console.error('错误上报逻辑异常：', err);
  } finally {
    span.end();
  }
}

// 注册全局错误监听
export function registerGlobalErrorListener() {
  // 1. 捕获同步代码错误
  window.onerror = function (message, source, lineno, colno, error) {
    reportGlobalError('onerror', error || message, source, lineno, colno);
    return true;
  };

  // 2. 捕获Promise未捕获错误
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportGlobalError('unhandledrejection', reason);
    event.preventDefault();
  });
}