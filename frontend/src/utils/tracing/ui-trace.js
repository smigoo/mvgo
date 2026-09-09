import { startSpan } from './trace-utils';
import { TRACING_CONFIG } from './config';
import { trace } from '@opentelemetry/api';

// 单个UI操作埋点
function startUISpan(action, target, event) {
  const el = target;
  if (!el || !el.tagName) return;

  const span = startSpan(`ui.${action}`);
  try {
    // 操作属性
    span.setAttribute('ui.action', action);
    span.setAttribute('ui.tag', el.tagName.toLowerCase());
    span.setAttribute('ui.id', el.id || '');
    span.setAttribute('ui.class', el.className || '');
    span.setAttribute('ui.text', (el.innerText || '').trim().substring(0, 100));
    // 鼠标位置
    span.setAttribute('ui.clientX', event.clientX || 0);
    span.setAttribute('ui.clientY', event.clientY || 0);
    // 页面信息
    span.setAttribute('page.href', window.location.href);
    // 关联父链路
    const currentCtx = trace.getActiveContext();
    const activeSpan = trace.getSpan(currentCtx);
    if (activeSpan) {
      span.setAttribute('parent.traceId', activeSpan.spanContext().traceId);
    }
  } catch (e) {
    console.error('UI埋点异常：', e);
  }
  span.end();
}

// 注册点击埋点（白名单控制）
export function registerClickTrace() {
  document.addEventListener(
    'click',
    function (e) {
      const currentPath = window.location.pathname;
      // 判断是否在白名单
      const needTrace = TRACING_CONFIG.ALLOW_CLICK_TRACE_PAGES.some(page =>
        currentPath.includes(page) // 可切换为精确匹配：currentPath === page
      );
      if (!needTrace) return;

      startUISpan('click', e.target, e);
    },
    true
  );
  console.log('✅ 前端鼠标点击自动埋点已启动');
}