// 服务配置
export const TRACING_CONFIG = {
  SERVICE_NAME: 'mc-component-warehouse', // 服务名
  COLLECTOR_URL: '/traces', // 后端 OTLP/HTTP 地址
  SA_RATIO: 1, // 采样率（1=全量）
  IDLE_TIME: 10 * 1000, // 链路切换空闲时间（10秒）
  ALLOW_CLICK_TRACE_PAGES: ["/container-page"], // 点击埋点白名单
  CORS_URLS: [/.+/], // 跨域携带trace头的域名
};

// 资源配置
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
export const createResource = () => {
  return new Resource({
    [SEMRESATTRS_SERVICE_NAME]: TRACING_CONFIG.SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: '1.0.0'
  });
};