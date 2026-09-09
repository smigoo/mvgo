package com.mvgo.business.dto;

import java.util.List;

/**
 * 操作日志查询条件.
 *
 * @since 1.0.0
 */
public class OperationLogQuery {

    /** HTTP 方法精确匹配（ALL / 空表示不限） */
    private String method;

    /** 路径模糊匹配 */
    private String path;

    /** 操作人用户名模糊匹配（解析为 userId 集合后过滤） */
    private String username;

    /** 操作人 userId 列表（in 过滤） */
    private List<String> userIds;

    /** 起始时间（epoch ms，createdAt >= startTime，可选） */
    private Long startTime;

    /** 结束时间（epoch ms，createdAt <= endTime，可选） */
    private Long endTime;

    /** 页码（从 1 开始） */
    private int page = 1;

    /** 每页大小 */
    private int pageSize = 20;

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

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public List<String> getUserIds() {
        return userIds;
    }

    public void setUserIds(List<String> userIds) {
        this.userIds = userIds;
    }

    public Long getStartTime() {
        return startTime;
    }

    public void setStartTime(Long startTime) {
        this.startTime = startTime;
    }

    public Long getEndTime() {
        return endTime;
    }

    public void setEndTime(Long endTime) {
        this.endTime = endTime;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getPageSize() {
        return pageSize;
    }

    public void setPageSize(int pageSize) {
        this.pageSize = pageSize;
    }
}
