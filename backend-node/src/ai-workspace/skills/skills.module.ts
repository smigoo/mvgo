import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSkill, AiSkillSchema } from '../schemas/ai-skill.schema';
import { AiSkillsController } from './skills.controller';
import { AiSkillsService } from './skills.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiSkill.name, schema: AiSkillSchema }]),
  ],
  controllers: [/* AiSkillsController -- 已迁 Java */],
  providers: [AiSkillsService],
  exports: [AiSkillsService],
})
export class AiSkillsModule {}
