package com.mvgo.data.entity;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * 操作日志（每用户审计流水）.
 *
 * <p>与 Node 侧 operation_logs 集合共用同一 MongoDB 实例与库，字段对齐 Node schema；
 * 由 Java 端 OperationLogController 接收全局拦截器上报的写请求后持久化。
 *
 * @since 1.0.0
 */
@Document(collection = "operation_logs")
public class OperationLog {

    @Id
    private String id;

    /** 操作人（关联 User 的 ObjectId hex）；匿名 / 未登录请求为 null */
    @Indexed(sparse = true)
    private String userId;

    /** HTTP 方法 */
    @Indexed
    private String method;

    /** 请求路径（不含查询串） */
    @Indexed
    private String path;

    /** 查询参数（已脱敏） */
    private Object query;

    /** 请求体（已脱敏；超大时省略） */
    private Object body;

    /** 响应状态码 */
    @Indexed
    private int statusCode;

    /** 客户端 IP */
    @Indexed(sparse = true)
    private String ip;

    /** 耗时（毫秒） */
    private long durationMs;

    /** 请求来源 UA */
    private String userAgent;

    /** 失败时的错误摘要（已截断 / 脱敏） */
    private String errorMessage;

    /** 创建时间（写入时若为空则置为当前时间） */
    private Date createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

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

    public Date getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Date createdAt) {
        this.createdAt = createdAt;
    }
}
