package com.mvgo.common;

/**
 * 业务异常.
 *
 * <p>由 GlobalExceptionHandler 统一捕获并转换为 {@link Result}.
 *
 * @since 1.0.0
 */
public class BizException extends RuntimeException {

    private final int code;

    public BizException(String message) {
        super(message);
        this.code = 400;
    }

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
