import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

/**
 * 会议纪要管线模块（契约 E-01~E-18）。
 *
 * 🔴 由 app.module.ts 以 `...(isMeetingExposed() ? [MeetingModule] : [])` **条件注册**：
 *    生产环境（NODE_ENV=production 且未声明 MEETING_ENABLED）整个模块不注册，路由不存在。
 *    控制器上的 `MeetingDevOnlyGuard` 调**同一个** isMeetingExposed()，是第二道保险。
 *
 * 不 import DatabaseModule：本模块走 data/meeting/ 下的 JSON 文件（见 meeting.store.ts 注释），
 * 生产关闭期间也不该为它多拉一条 Mongo 依赖链。
 */
@Module({
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
