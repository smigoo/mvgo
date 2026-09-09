package com.mvgo.business.dto;

import java.util.List;

/**
 * 操作日志清理请求：支持「按 id 批量删除」或「按保留天数清理旧日志」二选一.
 *
 * <ul>
 *   <li>{@code ids} 非空 → 删除指定 id 的日志（前端手动勾选删除）；</li>
 *   <li>{@code beforeDays} 为正 → 删除该天数之前的旧日志（定时任务或手动清旧）；</li>
 *   <li>二者皆空 → 400。</li>
 * </ul>
 *
 * @since 1.0.0
 */
public class OperationLogCleanupReq {

    /** 待删除的日志 id 列表（手动选择删除） */
    private List<String> ids;

    /** 保留天数：删除该天数之前的旧日志 */
    private Integer beforeDays;

    public List<String> getIds() {
        return ids;
    }

    public void setIds(List<String> ids) {
        this.ids = ids;
    }

    public Integer getBeforeDays() {
        return beforeDays;
    }

    public void setBeforeDays(Integer beforeDays) {
        this.beforeDays = beforeDays;
    }
}
