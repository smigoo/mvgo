import { CanActivate } from '@nestjs/common';
export declare function isV2Exposed(): boolean;
export declare class DevOnlyGuard implements CanActivate {
    canActivate(): boolean;
}
