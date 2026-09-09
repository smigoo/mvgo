import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GroupController } from './group.controller';
import { JoinRequestController } from './join-request.controller';
import { GroupService } from './group.service';
import { JoinRequestService } from './join-request.service';
import { Group, GroupSchema } from '../schemas/group.schema';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { JoinRequest, JoinRequestSchema } from '../schemas/join-request.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: GroupMember.name, schema: GroupMemberSchema },
      { name: JoinRequest.name, schema: JoinRequestSchema },
    ]),
    AuthModule,
  ],
  controllers: [/* GroupController/JoinRequestController -- 已迁 Java */],
  providers: [GroupService, JoinRequestService],
  exports: [GroupService, JoinRequestService],
})
export class GroupModule {}
