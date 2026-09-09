import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { TRACING_CONFIG } from './config';

// 注册自动注入（Fetch/XHR监控）
export function registerInstrument() {
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        clearTimingResources: true,
        propagateTraceHeaderCorsUrls: TRACING_CONFIG.CORS_URLS,
        applyCustomAttributesOnSpan: (span, request, response) => {
          // 可自定义追加属性（按需开启）
          // span.setAttribute('http.request.method', request.method);
          // span.setAttribute('http.url', request.url);
          // if (response) {
          //   span.setAttribute('http.status_code', response.status);
          //   const duration = span.endTime[0] * 1e3 + span.endTime[1] * 1e-6 - (span.startTime[0] * 1e3 + span.startTime[1] * 1e-6);
          //   span.setAttribute('http.response_time', duration.toFixed(2));
          //   if (!response.ok) span.setAttribute('error', true);
          // }
        }
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: TRACING_CONFIG.CORS_URLS,
        applyCustomAttributesOnSpan: (span, request, response) => {
          // 可自定义追加属性（按需开启）
          // span.setAttribute('http.request.method', request.method);
          // span.setAttribute('http.url', request.url);
          // if (response) {
          //   span.setAttribute('http.status_code', response.status);
          //   if (response.status >= 400) span.setAttribute('error', true);
          // }
        }
      })
    ]
  });
}