import { GroupService } from './group.service';
export declare class GroupController {
    private readonly groupService;
    constructor(groupService: GroupService);
    createGroup(body: {
        name: string;
        description?: string;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        group: import("../schemas/group.schema").Group;
    }>;
    getUserGroups(session: Record<string, any>): Promise<{
        success: boolean;
        groups: any[];
    }>;
    getGroupDetails(groupId: string, session: Record<string, any>): Promise<{
        success: boolean;
        group: any;
    }>;
    inviteUser(groupId: string, body: {
        userId: string;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
    removeMember(groupId: string, userId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
    updateGroup(groupId: string, body: {
        name: string;
        description?: string;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        group: import("../schemas/group.schema").Group;
    }>;
    deleteGroup(groupId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
    updateMemberPermissions(groupId: string, userId: string, body: {
        permissions: string[];
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    getMemberPermissions(groupId: string, userId: string): Promise<{
        success: boolean;
        permissions: string[];
    }>;
}
