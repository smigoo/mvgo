import { CanActivate } from '@nestjs/common';
export declare function isLiteLabExposed(): boolean;
export declare class LiteLabDevOnlyGuard implements CanActivate {
    canActivate(): boolean;
}
