import { maskSecretFingerprint } from '../common/utils/secret-fingerprint';
export declare const REDACTED = "***REDACTED***";
export declare const DEFAULT_LOG_MAX_BYTES: number;
export declare const DEFAULT_LOG_TAIL_LINES = 120;
export declare const DESCRIPTION_MAX_CHARS = 2000;
export declare function redactTextSecrets(input?: string | null): string;
export interface TruncateLogResult {
    text: string;
    bytes: number;
    originalBytes: number;
    truncated: boolean;
    keptTailLines: number;
}
export declare function truncateLogText(input?: string | null, options?: {
    maxBytes?: number;
    tailLines?: number;
    headBytes?: number;
}): TruncateLogResult;
export declare function sanitizeDescription(input?: string | null): string;
export { maskSecretFingerprint };
