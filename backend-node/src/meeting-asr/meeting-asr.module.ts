// 2026-11-06 源文件丢失后由 dist 编译产物（dist/meeting-asr/meeting-asr.module.js）机械重建，
// 逻辑与 dist 产物逐行对应。
import { Module } from '@nestjs/common'
import { MeetingAsrController } from './meeting-asr.controller'
import { MeetingAsrService } from './meeting-asr.service'

@Module({
  controllers: [MeetingAsrController],
  providers: [MeetingAsrService],
  exports: [MeetingAsrService],
})
export class MeetingAsrModule {}
