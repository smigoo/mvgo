import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiDocument, AiDocumentSchema } from '../schemas/ai-document.schema';
import { AiDocumentsController } from './documents.controller';
import { AiDocumentsService } from './documents.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiDocument.name, schema: AiDocumentSchema }]),
  ],
  controllers: [AiDocumentsController],
  providers: [AiDocumentsService],
  exports: [AiDocumentsService],
})
export class AiDocumentsModule {}
