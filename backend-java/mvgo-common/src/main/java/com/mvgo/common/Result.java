package com.mvgo.common;

import java.io.Serializable;

/**
 * 统一响应封装.
 *
 * <p>约定 code=0 表示成功, 非 0 表示业务异常.
 *
 * @param <T> 数据类型
 * @since 1.0.0
 */
public class Result<T> implements Serializable {

    /** 成功标记，对齐框架3.0 MicroviceoHttpRsp.success/fail */
    private boolean success;

    private int code;

    private String message;

    private T data;

    /** 来源标识：java / node，用于跨后端调试时区分响应归属 */
    private String source;

    /** 当前模块仅 Java 使用，来源固定为 java */
    private static final String SOURCE = "java";

    /** 框架3.0 成功响应码 */
    private static final int SUCCESS_CODE = 200;

    public Result() {
    }

    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>();
        r.success = true;
        r.code = SUCCESS_CODE;
        r.message = "ok";
        r.data = data;
        r.source = SOURCE;
        return r;
    }

    public static <T> Result<T> fail(int code, String message) {
        Result<T> r = new Result<>();
        r.success = false;
        r.code = code;
        r.message = message;
        r.source = SOURCE;
        return r;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public int getCode() {
        return code;
    }

    public void setCode(int code) {
        this.code = code;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }
}
