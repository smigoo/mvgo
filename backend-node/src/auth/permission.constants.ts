export const PERMISSIONS = {
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
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);

export const PERMISSION_GROUPS = {
  component: [
    PERMISSIONS.COMPONENT_CREATE,
    PERMISSIONS.COMPONENT_READ,
    PERMISSIONS.COMPONENT_UPDATE,
    PERMISSIONS.COMPONENT_DELETE,
  ],
  project: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
  ],
  group: [
    PERMISSIONS.GROUP_MANAGE,
    PERMISSIONS.GROUP_INVITE,
    PERMISSIONS.GROUP_MEMBER_REMOVE,
  ],
} as const;
