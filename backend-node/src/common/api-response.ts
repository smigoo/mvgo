/**
 * 统一响应契约(对齐公司框架3.0规范)。
 *
 * 成功响应: { success: true, code: 200, message: '操作成功', data: <业务数据> }
 * 失败响应: { success: false, code: <HTTP/业务码>, message: <文案>, data: null, detail?: <诊断> }
 *
 * 与前端 frontend/src/core/request.js 的统一响应兼容层一一对应。
 * 配套 TransformInterceptor(见 transform.interceptor.ts)用于逐步统一包装。
 */
export enum MvCode {
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 406,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PAYLOAD_TOO_LARGE = 413,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_ERROR = 500,
  NOT_IMPLEMENTED = 501,
}

export const MV_CODE_MESSAGE: Record<number, string> = {
  [MvCode.SUCCESS]: '操作成功',
  [MvCode.BAD_REQUEST]: '请求参数错误',
  [MvCode.UNAUTHORIZED]: '授权未通过',
  [MvCode.FORBIDDEN]: '权限认证未通过',
  [MvCode.NOT_FOUND]: '资源不存在',
  [MvCode.CONFLICT]: '资源冲突',
  [MvCode.PAYLOAD_TOO_LARGE]: '请求体过大',
  [MvCode.TOO_MANY_REQUESTS]: '请求过于频繁',
  [MvCode.INTERNAL_ERROR]: '服务器内部错误',
  [MvCode.NOT_IMPLEMENTED]: '服务器不支持该请求功能',
};

export interface ApiResponse<T = any> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
  /** 来源标识：java / node，用于跨后端调试时区分响应归属 */
  source: string;
  detail?: Record<string, any>;
}

/** 当前模块仅 Node 使用，来源固定为 node */
const SOURCE = 'node';

export const ApiResponse = {
  success<T>(
    data: T,
    message: string = MV_CODE_MESSAGE[MvCode.SUCCESS],
    code: number = MvCode.SUCCESS,
  ): ApiResponse<T> {
    return { success: true, code, message, data, source: SOURCE };
  },
  error(
    code: number,
    message?: string,
    detail?: Record<string, any>,
  ): ApiResponse<null> {
    return {
      success: false,
      code,
      message: message ?? MV_CODE_MESSAGE[code] ?? '操作失败',
      data: null,
      source: SOURCE,
      ...(detail ? { detail } : {}),
    };
  },
};
