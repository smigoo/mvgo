package com.mvgo.api.dto.req;

/**
 * 操作日志写入请求（Node 全局拦截器上报）.
 *
 * @since 1.0.0
 */
public class OperationLogReq {

    /** 操作人 userId（ObjectId hex），匿名为 null */
    private String userId;

    /** HTTP 方法 */
    private String method;

    /** 请求路径 */
    private String path;

    /** 查询参数（已脱敏） */
    private Object query;

    /** 请求体（已脱敏） */
    private Object body;

    /** 响应状态码 */
    private int statusCode;

    /** 客户端 IP */
    private String ip;

    /** 耗时（毫秒） */
    private long durationMs;

    /** 请求来源 UA */
    private String userAgent;

    /** 错误摘要 */
    private String errorMessage;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public Object getQuery() {
        return query;
    }

    public void setQuery(Object query) {
        this.query = query;
    }

    public Object getBody() {
        return body;
    }

    public void setBody(Object body) {
        this.body = body;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public void setStatusCode(int statusCode) {
        this.statusCode = statusCode;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }
}
