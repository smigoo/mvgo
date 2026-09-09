import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSession, AiSessionSchema } from '../schemas/ai-session.schema';
import { AiSessionsController } from './sessions.controller';
import { AiSessionsService } from './sessions.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiSession.name, schema: AiSessionSchema }]),
  ],
  controllers: [/* AiSessionsController -- 已迁 Java */],
  providers: [AiSessionsService],
  exports: [AiSessionsService],
})
export class AiSessionsModule {}
