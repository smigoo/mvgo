import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
export declare class ResponseEnvelopeInterceptor implements NestInterceptor {
    private static readonly SOURCE;
    private static readonly OK_MESSAGE;
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private toEnvelope;
}
