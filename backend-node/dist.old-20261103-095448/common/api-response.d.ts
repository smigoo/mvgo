export declare enum MvCode {
    SUCCESS = 200,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 406,
    NOT_FOUND = 404,
    CONFLICT = 409,
    PAYLOAD_TOO_LARGE = 413,
    TOO_MANY_REQUESTS = 429,
    INTERNAL_ERROR = 500,
    NOT_IMPLEMENTED = 501
}
export declare const MV_CODE_MESSAGE: Record<number, string>;
export interface ApiResponse<T = any> {
    success: boolean;
    code: number;
    message: string;
    data: T | null;
    source: string;
    detail?: Record<string, any>;
}
export declare const ApiResponse: {
    success<T>(data: T, message?: string, code?: number): ApiResponse<T>;
    error(code: number, message?: string, detail?: Record<string, any>): ApiResponse<null>;
};
