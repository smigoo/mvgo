import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UserSchema } from '../schemas/user.schema';
import { Group, GroupSchema } from '../schemas/group.schema';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { SessionGuard } from './session.guard';
import { PermissionsGuard } from './permissions.guard';
import { PermissionAdapter } from './permission-adapter.interface';
import { NodePermissionAdapter } from './node-permission-adapter';
import { QSPermissionAdapter } from './qs-permission-adapter';

// 权限数据源切换：PERMISSION_SOURCE=qs 时读 QS 门户权限中心，否则用本地 GroupMember
const permissionAdapterProvider =
  process.env.PERMISSION_SOURCE === 'qs'
    ? { provide: PermissionAdapter, useClass: QSPermissionAdapter }
    : { provide: PermissionAdapter, useClass: NodePermissionAdapter };

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Group.name, schema: GroupSchema },
      { name: GroupMember.name, schema: GroupMemberSchema },
    ]),
  ],
  controllers: [/* AuthController -- 已迁 Java */],
  providers: [
    AuthService,
    SessionGuard,
    PermissionsGuard,
    // 权限适配器：按 PERMISSION_SOURCE 切换数据源（node=本地 / qs=门户权限中心）
    permissionAdapterProvider,
  ],
  exports: [
    AuthService,
    SessionGuard,
    PermissionsGuard,
    PermissionAdapter,
  ],
})
export class AuthModule {}
