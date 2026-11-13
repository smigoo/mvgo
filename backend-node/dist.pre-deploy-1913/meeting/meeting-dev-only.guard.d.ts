import { CanActivate } from '@nestjs/common';
export declare function isMeetingExposed(): boolean;
export declare class MeetingDevOnlyGuard implements CanActivate {
    canActivate(): boolean;
}
