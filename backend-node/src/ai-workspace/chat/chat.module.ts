import { Module } from '@nestjs/common';
import { AiChatController } from './chat.controller';
import { AiChatService } from './chat.service';
import { AiSessionsModule } from '../sessions/sessions.module';
import { AiDocumentsModule } from '../documents/documents.module';

@Module({
  imports: [AiSessionsModule, AiDocumentsModule],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}
