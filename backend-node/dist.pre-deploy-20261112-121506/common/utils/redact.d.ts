export declare const REDACTED_PLACEHOLDER = "***REDACTED***";
export declare function redactSecrets(value: any, replacement?: string): any;
export declare function stripRedactedPlaceholders(value: any, placeholder?: string): any;
export declare function safeJsonStringify(value: any, space?: string | number): string;
