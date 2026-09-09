import 'dotenv/config';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';
// 全局软删除插件: 让所有集合具备 deleted 逻辑删除标记(见 soft-delete.plugin.ts)
import './common/schemas/soft-delete.plugin';
import { backendRoot } from './config/backend-root';

// 在 import AppModule 之前先加载 .env，让 process.env.NODE_ENV 在模块解析时已就绪
// 这样 app.module.ts 里的 envFilePath: `.env.${process.env.NODE_ENV}` 才能正确展开
// 加载顺序：.env（基础） → .env.{NODE_ENV}（环境覆盖）
const envFile = path.resolve(backendRoot, '.env');
dotenv.config({ path: envFile });
if (process.env.NODE_ENV) {
  const envSpecificFile = path.resolve(backendRoot, `.env.${process.env.NODE_ENV}`);
  dotenv.config({ path: envSpecificFile, override: true });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { json, urlencoded } from 'express';
import { validateRuntimeEnv } from './config/runtime-env';

async function bootstrap() {
  // 启动期环境校验：生产缺失必填变量直接失败（fail-fast），开发打印配置来源。
  // 必须在创建 App 之前调用，确保「配置问题」在启动阶段就暴露，而非上线后静默失效。
  validateRuntimeEnv();

  const app = await NestFactory.create(AppModule);

  // 生产环境位于 Nginx 反向代理后，需要信任代理才能正确识别 HTTPS 连接，
  // 否则 secure cookie 无法写入。
  if (process.env.NODE_ENV === 'production') {
    (app as any).set?.('trust proxy', 1);
  }

  // CORS配置（允许携带cookie）
  app.enableCors({
    origin: true, // 允许所有来源（开发环境）
    credentials: true, // 允许携带cookie
  });

  // Session配置
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;

  // 安全约束:生产环境禁止使用示例/空密钥,否则攻击者可直接伪造签名 cookie 接管会话
  if (isProduction && !sessionSecret) {
    throw new Error(
      '[启动失败] 生产环境必须设置 SESSION_SECRET(随机串),禁止使用示例密钥。请在 .env.production 或部署环境中配置。',
    );
  }

  // 使用 MongoDB 持久化 session，避免重启丢失登录态
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/langgraph-server';

app.use(
    session({
      secret: sessionSecret || `dev-session-${crypto.randomBytes(8).toString('hex')}`,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, // 24 小时（秒）
        autoRemove: 'native',
      }),
      cookie: {
        secure: isProduction, // 生产环境 HTTPS 必须启用 secure
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24小时（实际有效期受 portal token 过期时间约束）
      },
    }),
  );

  // 🔧 调大请求体限制：Lite 截图以 base64 传入（10MB 图片 → ~13MB base64），
  // 默认 express.json 100kb 会导致 request entity too large（截图生成 500）
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动删除未定义的属性
      transform: true, // 自动转换类型
    }),
  );

  // 全局异常过滤器 — 统一错误响应格式、防止堆栈泄露
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局响应信封拦截器 — 统一成功响应为规范信封 {success,code,message,data,source}
  // （框架3.0 MicroviceoHttpRsp），并兼容既有前端平铺/嵌套两种读法
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  // API路由前缀
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 13030;
  await app.listen(port);
  console.log(`🚀 NestJS服务器启动成功: http://localhost:${port}`);
  console.log(`📝 API前缀: http://localhost:${port}/api`);
}
bootstrap();
