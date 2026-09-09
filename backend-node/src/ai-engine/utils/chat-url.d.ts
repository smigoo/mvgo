/**
 * chat-url.js 的 TypeScript 类型声明
 * 供 TS 侧（config-test.service.ts / doc-analyzer.service.ts 等）静态导入时获得类型。
 * 运行时由 build-backend.sh 将 chat-url.js 同步到 dist/ai-engine/utils/。
 */
export declare function buildChatUrl(baseURL: string): string;
declare const _default: { buildChatUrl: typeof buildChatUrl };
export default _default;
