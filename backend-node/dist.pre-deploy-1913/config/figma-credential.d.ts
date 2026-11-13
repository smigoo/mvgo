export declare const FIGMA_CREDENTIAL_FP_FIELD = "figmaCredentialFp";
export type FigmaCredentialFpSource = 'pipeline' | 'create';
export declare function figmaCredentialFpFromValue(token?: string | null): string | null;
export declare function figmaCredentialFpFromConfig(config?: Record<string, any> | null): string | null;
