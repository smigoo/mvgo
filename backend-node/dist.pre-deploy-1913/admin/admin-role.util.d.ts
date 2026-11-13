import { ROLES } from '../common/constants';
export declare function resolveAdminRole(params: {
    isAdminFlag?: boolean;
    permissionRole?: string;
    userUid?: string;
    defaultAdminUids?: string[];
    permissionSource?: string;
}): typeof ROLES.ADMIN | typeof ROLES.MEMBER;
