import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenUsage,
  TokenUsageSchema,
} from '../schemas/token-usage.schema';
import { TokenUsageController } from './token-usage.controller';
import { TokenTrackerService } from './token-tracker.service';

@Global() // 全局模块，其他模块可直接注入 TokenTrackerService
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenUsage.name, schema: TokenUsageSchema },
    ]),
  ],
  controllers: [TokenUsageController],
  providers: [TokenTrackerService],
  exports: [TokenTrackerService],
})
export class TokenUsageModule {}
