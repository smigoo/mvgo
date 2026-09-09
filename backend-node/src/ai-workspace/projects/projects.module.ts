import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiProject, AiProjectSchema } from '../schemas/ai-project.schema';
import { AiProjectsController } from './projects.controller';
import { AiProjectsService } from './projects.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiProject.name, schema: AiProjectSchema }]),
    AuthModule,
  ],
  controllers: [/* AiProjectsController -- 已迁 Java */],
  providers: [AiProjectsService],
  exports: [AiProjectsService],
})
export class AiProjectsModule {}
