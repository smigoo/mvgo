import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAdapter } from './permission-adapter.interface';
export declare class PermissionsGuard implements CanActivate {
    private reflector;
    private permissionAdapter;
    constructor(reflector: Reflector, permissionAdapter: PermissionAdapter);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
