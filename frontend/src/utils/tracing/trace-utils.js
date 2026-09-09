import { trace } from '@opentelemetry/api';
import { TRACING_CONFIG } from './config';

// 全局链路ID
let CURRENT_TRACE_ID = generateTraceId();
let idleTimer = null;

// 生成标准traceId
export function generateTraceId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 重置空闲计时器（切换链路用）
export function resetTraceTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    CURRENT_TRACE_ID = generateTraceId();
    console.log('⏹ 10秒无操作，已自动切换新链路');
  }, TRACING_CONFIG.IDLE_TIME);
}

// 获取当前链路ID
export function getCurrentTraceId() {
  return CURRENT_TRACE_ID;
}

// 手动创建Span（核心埋点方法）
export function startSpan(name) {
  resetTraceTimer(); // 重置倒计时
  const span = trace.getTracer(TRACING_CONFIG.SERVICE_NAME).startSpan(name);
  // 强制绑定当前链路ID
  span.spanContext().traceId = CURRENT_TRACE_ID;
  return span;
}