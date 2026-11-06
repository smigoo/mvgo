import { Model } from 'mongoose';
import { UserDocument } from '../schemas/user.schema';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { PermissionAdapter } from './permission-adapter.interface';
export declare class QSPermissionAdapter extends PermissionAdapter {
    private userModel;
    private groupMemberModel;
    private cache;
    private readonly permissionUrl;
    private readonly uidParam;
    private readonly adminCodes;
    private readonly mapping;
    private readonly defaultPerms;
    private readonly ttl;
    constructor(userModel: Model<UserDocument>, groupMemberModel: Model<GroupMemberDocument>);
    checkPermission(userId: string, permCode: string): Promise<boolean>;
    getUserPermissions(userId: string): Promise<{
        role: string;
        permissions: string[];
    }>;
    private setCache;
    private localFallback;
    private extractPortalCodes;
    private mapToSystemPermissions;
    private parseMapping;
}
