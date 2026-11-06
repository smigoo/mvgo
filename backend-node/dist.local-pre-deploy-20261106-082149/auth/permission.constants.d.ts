export declare const PERMISSIONS: {
    readonly COMPONENT_CREATE: "component:create";
    readonly COMPONENT_READ: "component:read";
    readonly COMPONENT_UPDATE: "component:update";
    readonly COMPONENT_DELETE: "component:delete";
    readonly PROJECT_CREATE: "project:create";
    readonly PROJECT_READ: "project:read";
    readonly PROJECT_UPDATE: "project:update";
    readonly PROJECT_DELETE: "project:delete";
    readonly GROUP_MANAGE: "group:manage";
    readonly GROUP_INVITE: "group:invite";
    readonly GROUP_MEMBER_REMOVE: "group:member.remove";
};
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export declare const ALL_PERMISSIONS: string[];
export declare const PERMISSION_GROUPS: {
    readonly component: readonly ["component:create", "component:read", "component:update", "component:delete"];
    readonly project: readonly ["project:create", "project:read", "project:update", "project:delete"];
    readonly group: readonly ["group:manage", "group:invite", "group:member.remove"];
};
