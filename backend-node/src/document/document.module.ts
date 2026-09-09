import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { Document, DocumentSchema } from './schemas/document.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
    ]),
  ],
  controllers: [/* DocumentController -- 已迁 Java */],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
