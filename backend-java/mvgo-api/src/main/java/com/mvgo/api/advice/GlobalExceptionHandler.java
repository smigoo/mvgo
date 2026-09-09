package com.mvgo.api.advice;

import com.mvgo.common.BizException;
import com.mvgo.common.Result;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理.
 *
 * <p>统一以非 2xx 状态码返回 {@code {code, message}}，
 * 前端 core/http.js 依据 HTTP 状态判定失败并读取 message 作为错误描述。
 *
 * @since 1.0.0
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 业务异常, HTTP 状态取自异常自带的 code.
     *
     * @param ex 业务异常
     * @return 失败响应
     */
    @ExceptionHandler(BizException.class)
    public ResponseEntity<Result<Void>> handleBiz(BizException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getCode());
        if (status == null || !status.isError()) {
            status = HttpStatus.BAD_REQUEST;
        }
        return ResponseEntity.status(status).body(Result.fail(ex.getCode(), ex.getMessage()));
    }

    /**
     * 参数校验异常.
     *
     * @param ex 校验异常
     * @return 失败响应
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Result<Void>> handleIllegal(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Result.fail(400, ex.getMessage()));
    }

    /**
     * 兜底异常.
     *
     * @param ex 未预期异常
     * @return 失败响应
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<Void>> handleOther(Exception ex) {
        String message = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Result.fail(500, message));
    }
}
