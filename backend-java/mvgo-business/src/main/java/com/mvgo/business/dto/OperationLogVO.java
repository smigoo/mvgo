package com.mvgo.business.dto;

import java.util.Date;

/**
 * 操作日志视图对象（含操作人富化）.
 *
 * <p>读接口返回给管理后台的展示结构：相比持久化实体额外带上 {@link OperationLogUser} 富化，
 * 避免前端再发起一次用户查询。匿名 / 未登录请求的 {@code user} 为 null。
 *
 * @since 1.0.0
 */
public class OperationLogVO {

    /** 日志主键（hex） */
    private String id;

    /** 操作人富化（匿名为 null） */
    private OperationLogUser user;

    /** HTTP 方法 */
    private String method;

    /** 请求路径（不含查询串） */
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

    /** 失败时的错误摘要 */
    private String errorMessage;

    /** 创建时间 */
    private Date createdAt;

    public static class OperationLogUser {

        /** 用户主键（hex） */
        private String id;

        /** 用户名 */
        private String username;

        /** 邮箱 */
        private String email;

        /** 门户 uid */
        private String uid;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getUid() {
            return uid;
        }

        public void setUid(String uid) {
            this.uid = uid;
        }
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public OperationLogUser getUser() {
        return user;
    }

    public void setUser(OperationLogUser user) {
        this.user = user;
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
