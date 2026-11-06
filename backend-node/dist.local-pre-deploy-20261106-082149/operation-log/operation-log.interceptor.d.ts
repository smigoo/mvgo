import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { OperationLogService } from './operation-log.service';
export declare class OperationLogInterceptor implements NestInterceptor {
    private readonly logService;
    private readonly logger;
    private readonly skipPaths;
    private readonly enabled;
    constructor(logService: OperationLogService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
