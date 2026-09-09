// 核心依赖
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';

// 自定义模块
import { TRACING_CONFIG, createResource } from './config';
import { resetTraceTimer, startSpan } from './trace-utils';
import { registerGlobalErrorListener } from './error-report';
import { registerInstrument } from './instrumentation';
import { registerClickTrace } from './ui-trace';

// ========== 初始化链路追踪 ==========
// 1. 创建Provider
const provider = new WebTracerProvider({ resource: createResource() });
provider.register({
  contextManager: new ZoneContextManager(),
});
// 2. 添加Span处理器（批量上报）
provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: TRACING_CONFIG.COLLECTOR_URL })));

// 3. 初始化计时器
resetTraceTimer();

// 4. 注册自动注入（Fetch/XHR）
registerInstrument();

// 5. 注册全局错误监听
registerGlobalErrorListener();

// 6. 注册UI点击埋点
registerClickTrace();

// 对外暴露核心方法
export { startSpan };
export default provider;