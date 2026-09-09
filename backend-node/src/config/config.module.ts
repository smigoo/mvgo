import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiConfigController } from './config.controller';
import { AiConfigService } from './config.service';
import { ConfigTestService } from './config-test.service';
import { UserAiConfigService } from './user-ai-config.service';
import {
  UserAiConfig,
  UserAiConfigSchema,
} from '../schemas/user-ai-config.schema';
import { User, UserSchema } from '../schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserAiConfig.name, schema: UserAiConfigSchema },
      // 🆕 方案 B：全局模型模板管理（apply/create/update/delete）需校验 users.isAdmin
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AiConfigController],
  providers: [AiConfigService, ConfigTestService, UserAiConfigService],
  exports: [AiConfigService, ConfigTestService, UserAiConfigService],
})
export class AiConfigModule {}
