// 2026-11-06 源文件丢失后由 dist 编译产物（dist/feedback/feedback.module.js）机械重建，
// 逻辑与 dist 产物逐行对应。
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiConfigModule } from '../config/config.module'
import { AdminModule } from '../admin/admin.module'
import { FeedbackController, FeedbackAdminController } from './feedback.controller'
import { FeedbackService } from './feedback.service'
import { TaskFeedback, TaskFeedbackSchema } from './feedback.schema'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TaskFeedback.name, schema: TaskFeedbackSchema }]),
    AiConfigModule,
    AdminModule,
  ],
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
