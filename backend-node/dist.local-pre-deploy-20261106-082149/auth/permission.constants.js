"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_GROUPS = exports.ALL_PERMISSIONS = exports.PERMISSIONS = void 0;
exports.PERMISSIONS = {
    COMPONENT_CREATE: 'component:create',
    COMPONENT_READ: 'component:read',
    COMPONENT_UPDATE: 'component:update',
    COMPONENT_DELETE: 'component:delete',
    PROJECT_CREATE: 'project:create',
    PROJECT_READ: 'project:read',
    PROJECT_UPDATE: 'project:update',
    PROJECT_DELETE: 'project:delete',
    GROUP_MANAGE: 'group:manage',
    GROUP_INVITE: 'group:invite',
    GROUP_MEMBER_REMOVE: 'group:member.remove',
};
exports.ALL_PERMISSIONS = Object.values(exports.PERMISSIONS);
exports.PERMISSION_GROUPS = {
    component: [
        exports.PERMISSIONS.COMPONENT_CREATE,
        exports.PERMISSIONS.COMPONENT_READ,
        exports.PERMISSIONS.COMPONENT_UPDATE,
        exports.PERMISSIONS.COMPONENT_DELETE,
    ],
    project: [
        exports.PERMISSIONS.PROJECT_CREATE,
        exports.PERMISSIONS.PROJECT_READ,
        exports.PERMISSIONS.PROJECT_UPDATE,
        exports.PERMISSIONS.PROJECT_DELETE,
    ],
    group: [
        exports.PERMISSIONS.GROUP_MANAGE,
        exports.PERMISSIONS.GROUP_INVITE,
        exports.PERMISSIONS.GROUP_MEMBER_REMOVE,
    ],
};
//# sourceMappingURL=permission.constants.js.map