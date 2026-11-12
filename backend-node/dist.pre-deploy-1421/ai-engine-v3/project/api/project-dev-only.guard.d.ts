import { CanActivate } from '@nestjs/common';
export declare function isV3ProjectExposed(): boolean;
export declare class ProjectDevOnlyGuard implements CanActivate {
    canActivate(): boolean;
}
