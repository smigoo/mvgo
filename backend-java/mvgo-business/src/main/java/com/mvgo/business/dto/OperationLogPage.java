package com.mvgo.business.dto;

import java.util.List;

import com.mvgo.business.dto.OperationLogVO;

/**
 * 操作日志分页结果.
 *
 * @since 1.0.0
 */
public class OperationLogPage {

    /** 当前页数据（已富化操作人） */
    private List<OperationLogVO> list;

    /** 总条数 */
    private long total;

    /** 页码 */
    private int page;

    /** 每页大小 */
    private int pageSize;

    public List<OperationLogVO> getList() {
        return list;
    }

    public void setList(List<OperationLogVO> list) {
        this.list = list;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
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
