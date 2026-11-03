"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const dotenv = __importStar(require("dotenv"));
require("./common/schemas/soft-delete.plugin");
const backend_root_1 = require("./config/backend-root");
const envFile = path.resolve(backend_root_1.backendRoot, '.env');
dotenv.config({ path: envFile });
if (process.env.NODE_ENV) {
    const envSpecificFile = path.resolve(backend_root_1.backendRoot, `.env.${process.env.NODE_ENV}`);
    dotenv.config({ path: envSpecificFile, override: true });
}
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/http-exception.filter");
const response_envelope_interceptor_1 = require("./common/response-envelope.interceptor");
const express_session_1 = __importDefault(require("express-session"));
const connect_mongo_1 = __importDefault(require("connect-mongo"));
const express_1 = require("express");
const runtime_env_1 = require("./config/runtime-env");
process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    console.error(`🛡️ [unhandledRejection] 未捕获的 Promise 拒绝（进程保持存活，请据此定位修复）:\n${msg}`);
});
async function bootstrap() {
    (0, runtime_env_1.validateRuntimeEnv)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    if (process.env.NODE_ENV === 'production') {
        app.set?.('trust proxy', 1);
    }
    app.enableCors({
        origin: true,
        credentials: true,
    });
    const isProduction = process.env.NODE_ENV === 'production';
    const sessionSecret = process.env.SESSION_SECRET;
    if (isProduction && !sessionSecret) {
        throw new Error('[启动失败] 生产环境必须设置 SESSION_SECRET(随机串),禁止使用示例密钥。请在 .env.production 或部署环境中配置。');
    }
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/langgraph-server';
    app.use((0, express_session_1.default)({
        secret: sessionSecret || `dev-session-${crypto.randomBytes(8).toString('hex')}`,
        resave: false,
        saveUninitialized: false,
        store: connect_mongo_1.default.create({
            mongoUrl,
            collectionName: 'sessions',
            ttl: 24 * 60 * 60,
            autoRemove: 'native',
        }),
        cookie: {
            secure: isProduction,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/',
        },
    }));
    app.use((0, express_1.json)({ limit: '25mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '25mb' }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new response_envelope_interceptor_1.ResponseEnvelopeInterceptor());
    app.setGlobalPrefix('api');
    const port = process.env.PORT || 13030;
    await app.listen(port);
    console.log(`🚀 NestJS服务器启动成功: http://localhost:${port}`);
    console.log(`📝 API前缀: http://localhost:${port}/api`);
}
bootstrap();
//# sourceMappingURL=main.js.map